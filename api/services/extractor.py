"""
Pipeline principal de extracción.
Orquesta: texto PDF → detección (con score) → reglas → guardar historial.
Si la detección carece de patrones regex, los genera automáticamente con IA.
"""
from __future__ import annotations
import os
import hashlib
import io
import re
import os
import uuid
from pathlib import Path

import pdfplumber
from sqlalchemy.orm import Session

from .detector import detectar_con_score
from .rule_engine import aplicar_reglas, campos_sin_regla
from .ai_utils import parse_claude_json, make_anthropic_client
from ..extractores_especializados.registry import esta_soportado, obtener_extractor
from ..extractores_especializados.qualitas import mapear_tipo_a_subramo
from ..extractores_especializados.gnp import detectar_subramo_por_encabezado, titulo_no_soportado_gnp
from ..extractores_especializados.el_potosi import detectar_subramo_por_titulo_el_potosi
from ..extractores_especializados.figuras_juridicas import es_persona_moral_por_nombre, clasificar_persona_por_rfc
from ..config import MODEL_EXTRACTOR, PDF_ENTRENAMIENTO_DIR, RECHAZADOS_DIR
from ..models.db_models import (
    Extraccion, CampoExtraido, CampoDefinido,
    Compania, Ramo, Subramo, PolizaEntrenamiento, SeleccionCampo,
)


# ── Clasificación REGLA/IA/NO ENC. por campo ─────────────────────────────────
# Única fuente de verdad para las 3 columnas/indicadores que se muestran en
# el Extractor (stats), el Historial (columnas REGLA/IA/NO ENC.) y el
# Entrenador (pestaña Campos) — evita que cada lugar recalcule (y
# potencialmente desincronice) su propio conteo.
#
# Bug que corrige: el conteo anterior solo reconocía el método literal
# "regla" (motor de reglas de BD) como "encontrado", y todo lo demás —
# INCLUYENDO "extractor_dedicado" (el método real que usan los extractores
# especializados de GNP, Qualitas y cualquier otra compañía) — caía en
# "no encontrado" por descarte, aunque el campo sí tuviera su valor y su
# método individual correctamente guardados en datos_finales/CampoExtraido.
# Por eso casi todo salía "NO ENC." pese a que la mayoría de los campos sí
# se habían extraído bien.
def clasificar_metodo_campo(metodo: str | None) -> str:
    """Bucket de 3 (regla / ia / no_encontrado) para UN campo, a partir de
    su `metodo` individual (ya calculado correctamente por campo en
    datos_finales — eso nunca fue el bug). "regla" agrupa cualquier
    extracción determinística y confiable: motor de reglas de BD,
    extractor especializado por compañía, valor fijo de catálogo, o
    campo derivado de otro. "ia" queda reservado para cuando exista un
    fallback de IA por campo individual (hoy ningún método lo produce
    todavía, así que ese bucket sale en 0 honestamente, no por descarte)."""
    if metodo in ("regla", "extractor_dedicado", "valor_fijo", "derivado"):
        return "regla"
    if metodo == "ia":
        return "ia"
    return "no_encontrado"


def contar_metodos_campos(datos_finales: dict) -> dict[str, int]:
    """Cuenta cuántos campos de una extracción caen en cada bucket
    (regla/ia/no_encontrado) — lo que alimenta campos_por_regla/
    campos_por_ia/campos_no_encontrados en Extraccion."""
    conteo = {"regla": 0, "ia": 0, "no_encontrado": 0}
    for v in datos_finales.values():
        conteo[clasificar_metodo_campo(v.get("metodo"))] += 1
    return conteo


def extraer_texto_pdf(contenido: bytes) -> str:
    texto_paginas = []
    with pdfplumber.open(io.BytesIO(contenido)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                texto_paginas.append(t)
    return "\n".join(texto_paginas)


def sembrar_selecciones_auto(poliza_id: int, datos_finales: dict[str, dict] | None, db: Session) -> None:
    """
    Siembra SeleccionCampo(es_auto=True) a partir de un dict
    {nombre_campo: {"valor":..., "metodo":..., ...}} — sin esto, el panel
    "Campos" del Entrenador se ve vacío para una póliza que ya tiene
    valores resueltos (por el pipeline completo o por aplicar_reglas al
    subir al lote), aunque esos valores sí existan en otro lado.
    Sin bbox/contexto (no se conoce la posición exacta en el PDF); alcanza
    para que el valor se vea y el usuario pueda corregirlo si hace falta.
    Reutilizado por _guardar_pdf_como_entrenamiento (extracción completa,
    nivel 1+2) y por entrenamiento.py::subir_polizas (solo nivel 2 —
    aplicar_reglas — al subir un PDF directo al lote).
    """
    for nombre_campo, info in (datos_finales or {}).items():
        valor = info.get("valor")
        if not valor:
            continue
        db.add(SeleccionCampo(
            poliza_id=poliza_id,
            nombre_campo=nombre_campo,
            texto_seleccionado=str(valor)[:1000],
            es_auto=True,
            metodo=info.get("metodo"),
        ))
    db.flush()


def _guardar_pdf_como_entrenamiento(
    subramo_id: int, nombre_archivo: str, contenido: bytes, texto: str, db: Session,
    datos_finales: dict[str, dict] | None = None,
    sha256: str | None = None,
) -> PolizaEntrenamiento | None:
    """
    Persiste el PDF de una extracción normal en el mismo almacenamiento que
    usa el Entrenador (storage/pdfs_entrenamiento/<subramo_id>/), creando un
    PolizaEntrenamiento — para que "Ver/Reentrenar" desde Historial pueda
    abrir ese PDF ahí sin duplicar el visor. Mismo patrón que
    routers/entrenamiento.py::subir_polizas. Si falla, no debe tumbar la
    extracción (el historial y los datos extraídos importan más que la
    copia del PDF), por eso captura cualquier excepción y devuelve None.

    También siembra SeleccionCampo (es_auto=True) con los valores que YA
    se extrajeron para esta póliza — sin esto, el panel "Campos" del
    Entrenador se ve vacío para una póliza que llegó aquí desde Historial,
    aunque sus valores extraídos sí existan (en Extraccion/CampoExtraido).
    Sin bbox/contexto (no se conoce la posición exacta en el PDF); alcanza
    para que el valor se vea y el usuario pueda corregirlo si hace falta.
    """
    try:
        dest_dir = Path(PDF_ENTRENAMIENTO_DIR) / str(subramo_id)
        dest_dir.mkdir(parents=True, exist_ok=True)
        ext = Path(nombre_archivo or "poliza.pdf").suffix or ".pdf"
        ruta = dest_dir / f"{uuid.uuid4().hex}{ext}"
        ruta.write_bytes(contenido)

        with pdfplumber.open(io.BytesIO(contenido)) as pdf:
            paginas = len(pdf.pages)

        poliza = PolizaEntrenamiento(
            subramo_id=subramo_id,
            nombre_archivo=nombre_archivo,
            ruta_archivo=str(ruta),
            texto_pdf=texto[:80_000],
            paginas=paginas,
            sha256=sha256,
        )
        db.add(poliza)
        db.flush()

        sembrar_selecciones_auto(poliza.id, datos_finales, db)

        return poliza
    except Exception:
        return None


# ── Generación automática de patrones de detección ───────────────────────────

def _necesita_patrones(compania: Compania | None, ramo: Ramo | None, subramo: Subramo | None) -> bool:
    """True si algún nivel detectado no tiene patrones regex (sólo keywords o nada)."""
    if compania and not (compania.patrones_deteccion or []):
        return True
    if ramo and not (ramo.patrones_deteccion or []):
        return True
    if subramo and not (subramo.patrones_deteccion or []):
        return True
    return False


def _generar_y_guardar_patrones(
    compania: Compania, ramo: Ramo, subramo: Subramo | None,
    texto: str, db: Session,
) -> dict:
    """
    Llama a Claude para generar patrones de detección y los guarda en BD (merge).
    Retorna dict con los patrones generados o {} si falla.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return {}

    try:
        client    = make_anthropic_client()
        sub_nombre = subramo.nombre if subramo else "No identificado"
        prompt = f"""Eres un experto en pólizas de seguros mexicanas.

Se sabe que este PDF pertenece a:
  Compañía: {compania.nombre}
  Ramo: {ramo.nombre}
  Subramo: {sub_nombre}

Texto del PDF (primeros 2500 caracteres):
---
{texto[:2500]}
---

Genera patrones regex Python (re.search, IGNORECASE|MULTILINE) para identificar AUTOMÁTICAMENTE este tipo de póliza sin IA en el futuro.

1. **Compañía** (2-3 patrones): frases únicas de {compania.nombre} que no aparecen en otras compañías.
2. **Ramo** (1-2 patrones): texto que indica el tipo de seguro "{ramo.nombre}".
3. **Subramo** (1-2 patrones): frase que distingue "{sub_nombre}" de otros planes. Omite si subramo es desconocido.

Preferir frases literales cortas sobre patrones complejos. Sin delimitadores ni flags en el string.

Responde ÚNICAMENTE JSON válido:
{{
  "compania": ["patron1", "patron2"],
  "ramo": ["patron1"],
  "subramo": ["patron1"],
  "explicacion": "resumen breve"
}}"""

        msg = client.messages.create(
            model=MODEL_EXTRACTOR,
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        resultado = parse_claude_json(msg.content[0].text)
    except Exception:
        return {}

    def _validos(patrones):
        out = []
        for p in (patrones or []):
            try:
                re.compile(p)
                out.append(p)
            except re.error:
                pass
        return out

    nuevos_comp = _validos(resultado.get("compania", []))
    nuevos_ramo = _validos(resultado.get("ramo", []))
    nuevos_sub  = _validos(resultado.get("subramo", []))

    def _merge(existentes, nuevos):
        return list(set(existentes or []) | set(nuevos))

    if nuevos_comp:
        compania.patrones_deteccion = _merge(compania.patrones_deteccion, nuevos_comp)
    if nuevos_ramo:
        ramo.patrones_deteccion = _merge(ramo.patrones_deteccion, nuevos_ramo)
    if nuevos_sub and subramo:
        subramo.patrones_deteccion = _merge(subramo.patrones_deteccion, nuevos_sub)

    db.commit()

    return {
        "compania": nuevos_comp,
        "ramo":     nuevos_ramo,
        "subramo":  nuevos_sub,
        "explicacion": resultado.get("explicacion", ""),
    }


# ── Derivación de campos ──────────────────────────────────────────────────────

def _derivar_campos(datos: dict) -> dict:
    """
    Calcula campos cuyo valor se infiere de otros campos ya extraídos.
    Modifica `datos` en-lugar y retorna el mismo dict.

    Reglas actuales
    ───────────────
    entidad  ← rfc, nombre_cliente
        4 letras iniciales del RFC → "Persona Física" (con o sin homoclave —
            hay personas físicas sin actividad económica ante el SAT cuyo
            RFC real queda en 10 caracteres, sin los 3 de homoclave; ver
            clasificar_persona_por_rfc en figuras_juridicas.py)
        3 letras iniciales del RFC → "Persona Moral"

        Señal adicional: catálogo de figuras jurídicas/razones sociales
        mexicanas (S.A., A.C., Sindicato, Gobierno Municipal, etc.) buscado
        en nombre_cliente — ver extractores_especializados/figuras_juridicas.py.
        El RFC tiene prioridad cuando ambas señales están disponibles y se
        contradicen: es un identificador oficial con una regla estructural
        fija, mientras que la coincidencia por nombre es heurística
        (substring) y puede dar falsos positivos/negativos por OCR,
        truncamiento o coincidencias de texto. La señal por nombre solo
        decide cuando el RFC no permite derivar nada (longitud inesperada
        o ausente).

    Reglas futuras (pendientes de implementación):
    ───────────────────────────────────────────────
    ejecutivo_cuenta  ← vendedor  (referencia a tabla de catálogo)
    despacho          ← vendedor  (referencia a tabla de catálogo)
    """
    # ── entidad ───────────────────────────────────────────────────────────────
    rfc_info = datos.get("rfc")
    rfc_val  = (rfc_info.get("valor") or "").strip() if rfc_info else ""

    nombre_info = datos.get("nombre_cliente")
    nombre_val  = (nombre_info.get("valor") or "").strip() if nombre_info else ""

    if rfc_val and "entidad" not in datos or (datos.get("entidad", {}).get("valor") is None):
        entidad_val = clasificar_persona_por_rfc(rfc_val)

        # El RFC manda cuando decide algo. Solo si no pudo derivar nada
        # (RFC ausente o patrón irreconocible) se usa el nombre/razón
        # social como respaldo — ver docstring arriba.
        if entidad_val is None and es_persona_moral_por_nombre(nombre_val):
            entidad_val = "Persona Moral"

        if entidad_val is not None:
            datos["entidad"] = {
                "valor":    entidad_val,
                "metodo":   "derivado",
                "regla_id": None,
            }

    return datos


# ── Pipeline principal ────────────────────────────────────────────────────────

# Campos mínimos para dar una extracción por buena. Medido contra las 926
# extracciones históricas: los pasa ~96% (GNP 334/351, Quálitas 501/519,
# El Potosí 54/54); los que no, son pólizas que sí necesitan entrenamiento.
CAMPOS_BASICOS = ("documento", "desde", "hasta", "prima_total")

MSG_SIN_EXTRACTOR = "No se extrajeron datos aún: no existe extractor para esta coincidencia todavía."
MSG_NO_RECONOCIDA = "No se extrajeron datos: no se reconoció la aseguradora del documento."
MSG_INCOMPLETA = "No se pudieron extraer todos los campos básicos (faltan: {faltantes})."


def _rechazar(
    motivo: str, mensaje: str, det: dict, compania, ramo, subramo,
    contenido: bytes, nombre_archivo: str, texto: str, datos_finales: dict | None, db: Session,
    faltantes: list[str] | None = None,
) -> dict:
    """
    Resultado de un PDF que no se procesa. Si se pudo ubicar el subramo, el PDF
    se manda a su lote del Entrenador (una sola vez por archivo: se deduplica
    por hash, así los reintentos automáticos de MOVI no lo repiten). No guarda
    Extraccion ni genera patrones.
    """
    poliza_id = None
    sha = hashlib.sha256(contenido).hexdigest()
    # Envío automático solo si el subramo es confiable: la clasificación de un
    # producto sin extractor (ej. Daños) se equivoca con facilidad y llenaría el
    # lote equivocado. Si no, el PDF espera en RECHAZADOS_DIR y el usuario elige.
    automatico = subramo is not None and (
        motivo == "incompleta" or (det["confianza"] == "alta" and det["score_subramo"] >= 3)
    )
    if not automatico:
        ruta = os.path.join(RECHAZADOS_DIR, f"{sha}.pdf")
        if not os.path.exists(ruta):
            with open(ruta, "wb") as f:
                f.write(contenido)
    if automatico:
        existente = db.query(PolizaEntrenamiento).filter(
            PolizaEntrenamiento.subramo_id == subramo.id, PolizaEntrenamiento.sha256 == sha,
        ).first()
        if existente:
            poliza_id = existente.id
        else:
            nueva = _guardar_pdf_como_entrenamiento(
                subramo.id, nombre_archivo, contenido, texto, db, datos_finales, sha256=sha,
            )
            poliza_id = nueva.id if nueva else None
            db.commit()
    return {
        "id": None,
        "archivo": nombre_archivo,
        "compania": compania.nombre if compania else None,
        "ramo": ramo.nombre if ramo else None,
        # Un subramo poco confiable no se informa: se elige a mano.
        "subramo": subramo.nombre if automatico else None,
        "campos": {},
        "stats": {"por_regla": 0, "por_ia": 0, "no_encontrados": 0},
        "deteccion": {
            "confianza": det["confianza"],
            "score_compania": det["score_compania"],
            "score_ramo": det["score_ramo"],
            "score_subramo": det["score_subramo"],
            "patrones_generados": False, "patrones_nuevos": {},
        },
        "error": None,
        "rechazo": {
            "motivo": motivo,
            "mensaje": mensaje,
            "faltantes": faltantes or [],
            "ref": sha,
            "compania_id": compania.id if compania else None,
            "ramo_id": ramo.id if ramo else None,
            "subramo_id": subramo.id if automatico else None,
            "poliza_entrenamiento_id": poliza_id,
        },
    }


def procesar_pdf(contenido: bytes, nombre_archivo: str, db: Session) -> dict:
    """
    Pipeline completo. Retorna dict con todos los datos, metadata y detección.
    Si la detección no tiene patrones regex, los genera automáticamente.
    """
    try:
        texto = extraer_texto_pdf(contenido)
    except Exception as e:
        return _resultado_error(nombre_archivo, str(e))

    if not texto.strip():
        return _resultado_error(nombre_archivo, "PDF sin texto extraíble (posiblemente escaneado). Se requiere OCR.")

    det = detectar_con_score(texto, db)

    compania = db.query(Compania).filter(Compania.id == det["compania_id"]).first() if det["compania_id"] else None
    ramo     = db.query(Ramo).filter(Ramo.id == det["ramo_id"]).first()             if det["ramo_id"]     else None
    subramo  = db.query(Subramo).filter(Subramo.id == det["subramo_id"]).first()    if det["subramo_id"]  else None

    # 4. Nivel 1 — extractor especializado por compañía (si existe)
    datos_reglas: dict[str, dict] = {}
    campos_faltantes: list[CampoDefinido] = []
    campos_extractor_dedicado: set[str] = set()

    extractor_dedicado = obtener_extractor(compania.nombre) if compania else None
    campos_extraidos: dict = {}
    if extractor_dedicado:
        try:
            campos_extraidos = extractor_dedicado(texto, contenido) or {}
        except Exception:
            campos_extraidos = {}
        for nombre, valor in campos_extraidos.items():
            if not valor:
                continue
            datos_reglas[nombre] = {
                "valor": valor,
                "metodo": "extractor_dedicado",
                "regla_id": None,
            }
            campos_extractor_dedicado.add(nombre)

    # 4b. Quálitas: "Tipo:" del PDF corrige el Subramo detectado por
    # keywords cuando corresponde a una categoría real distinta de
    # "Automóviles" (el sistema de puntaje archiva casi todo como
    # "Automóviles" por defecto, aunque el vehículo sea un camión, etc.)
    if compania and compania.nombre == "Quálitas" and ramo:
        subramo_mapeado = mapear_tipo_a_subramo(campos_extraidos.get("tipo_vehiculo"))
        if subramo_mapeado:
            subramo_correcto = (
                db.query(Subramo)
                .filter(Subramo.ramo_id == ramo.id, Subramo.nombre == subramo_mapeado, Subramo.activo == True)
                .first()
            )
            if subramo_correcto and subramo_correcto.id != det.get("subramo_id"):
                subramo = subramo_correcto
                det["subramo_id"] = subramo_correcto.id
                det["subramo_nombre"] = subramo_correcto.nombre

    # 4c. GNP: el encabezado de la carátula ("FLOTILLAS AMPLIA" en vez de
    # "Fuerza Productora Regular Autos Amplia") corrige el Subramo a
    # "Flotilla de Vehiculos" cuando el puntaje por keywords lo clasificó
    # como "Automóviles" por defecto.
    if compania and compania.nombre == "GNP Seguros" and ramo:
        subramo_mapeado = detectar_subramo_por_encabezado(texto)
        if subramo_mapeado:
            subramo_correcto = (
                db.query(Subramo)
                .filter(Subramo.ramo_id == ramo.id, Subramo.nombre == subramo_mapeado, Subramo.activo == True)
                .first()
            )
            if subramo_correcto and subramo_correcto.id != det.get("subramo_id"):
                subramo = subramo_correcto
                det["subramo_id"] = subramo_correcto.id
                det["subramo_nombre"] = subramo_correcto.nombre

    # 4d. Seguros El Potosí: el título de la carátula ("SEGURO DE
    # AUTOBUSES...", "... FLOTILLA...", etc.) corrige el Subramo cuando el
    # puntaje por keywords lo clasificó como "Automóviles" por defecto —
    # mismo criterio que 4b/4c.
    if compania and compania.nombre == "Seguros El Potosí" and ramo:
        subramo_mapeado = detectar_subramo_por_titulo_el_potosi(texto)
        if subramo_mapeado:
            subramo_correcto = (
                db.query(Subramo)
                .filter(Subramo.ramo_id == ramo.id, Subramo.nombre == subramo_mapeado, Subramo.activo == True)
                .first()
            )
            if subramo_correcto and subramo_correcto.id != det.get("subramo_id"):
                subramo = subramo_correcto
                det["subramo_id"] = subramo_correcto.id
                det["subramo_nombre"] = subramo_correcto.nombre

    # 4e. Validación de soporte: solo se procesan las combinaciones compañía/
    # ramo/subramo con extractor (registry.SOPORTE). Se decide ANTES de generar
    # patrones con IA o guardar nada, para que un PDF ajeno no contamine los
    # patrones de detección ni el historial.
    # Un título de producto ajeno (ej. GNP "Daños Negocio Protegido") se rechaza
    # aunque el detector lo haya clasificado como autos; como ese subramo no es
    # confiable, el PDF no se manda a ningún lote del Entrenador.
    producto_ajeno = bool(compania and compania.nombre == "GNP Seguros" and titulo_no_soportado_gnp(texto))
    if producto_ajeno or not esta_soportado(
        compania.nombre if compania else None,
        ramo.nombre if ramo else None,
        subramo.nombre if subramo else None,
    ):
        if not compania:
            return _rechazar("no_reconocida", MSG_NO_RECONOCIDA, det, None, None, None,
                             contenido, nombre_archivo, texto, None, db)
        return _rechazar("sin_extractor", MSG_SIN_EXTRACTOR, det, compania, ramo,
                         None if producto_ajeno else subramo,
                         contenido, nombre_archivo, texto, None, db)

    # 3. Auto-generar patrones si algún nivel detectado no los tiene
    patrones_generados: dict = {}
    if compania and ramo and _necesita_patrones(compania, ramo, subramo):
        patrones_generados = _generar_y_guardar_patrones(compania, ramo, subramo, texto, db)
        if patrones_generados:
            det = detectar_con_score(texto, db)

    # 5. Nivel 2 — motor de reglas de BD, solo para lo que el nivel 1 no resolvió
    if subramo:
        datos_reglas.update(
            aplicar_reglas(
                texto, subramo.id, db, pdf_bytes=contenido,
                campos_excluir=campos_extractor_dedicado or None,
            )
        )
        campos_cubiertos = {
            k for k, v in datos_reglas.items()
            if v["metodo"] in ("regla", "extractor_dedicado")
        }
        campos_faltantes = campos_sin_regla(subramo.id, campos_cubiertos, db)

    datos_finales: dict = {**datos_reglas}
    for campo in campos_faltantes:
        datos_finales[campo.nombre] = {"valor": None, "metodo": "no_encontrado", "regla_id": None}

    # sub_ramo_sicas siempre refleja el Subramo resuelto por el pipeline
    # (incluye los overrides de 4b/4c) — se fuerza aquí, después de
    # aplicar_reglas() y de rellenar campos_faltantes, para que nunca lo
    # gane un valor capturado manualmente por una regla entrenada o un
    # extractor dedicado.
    if subramo:
        datos_finales["sub_ramo_sicas"] = {
            "valor": subramo.nombre, "metodo": "derivado", "regla_id": None,
        }

    # 6b. Derivar campos calculables (entidad ← rfc, etc.)
    _derivar_campos(datos_finales)

    # Contadores correctos (una sola pasada, sin doble cómputo) — ver
    # contar_metodos_campos arriba para el porqué de este cálculo.
    conteo_metodos = contar_metodos_campos(datos_finales)
    por_regla      = conteo_metodos["regla"]
    por_ia         = conteo_metodos["ia"]
    no_encontrados = conteo_metodos["no_encontrado"]

    # 6b2. Completitud: si no salieron los campos básicos, no es una extracción
    # confiable → se rechaza y se manda al Entrenador (con lo poco que sí salió
    # sembrado como selecciones) en vez de devolver datos a medias.
    faltantes = [c for c in CAMPOS_BASICOS if not (datos_finales.get(c) or {}).get("valor")]
    if faltantes:
        return _rechazar(
            "incompleta", MSG_INCOMPLETA.format(faltantes=", ".join(faltantes)), det,
            compania, ramo, subramo, contenido, nombre_archivo, texto, datos_finales, db,
            faltantes=faltantes,
        )

    # 6c. Guardar el PDF físico (para poder verlo/reentrenarlo después desde
    # Historial) — solo si hay subramo resuelto, igual que el Entrenador.
    poliza_guardada = (
        _guardar_pdf_como_entrenamiento(subramo.id, nombre_archivo, contenido, texto, db, datos_finales)
        if subramo else None
    )

    metodo_det = "patrones" if (det["score_compania"] >= 3) else "keywords"
    extraccion = Extraccion(
        nombre_archivo=nombre_archivo,
        compania_id=compania.id if compania else None,
        ramo_id=ramo.id if ramo else None,
        subramo_id=subramo.id if subramo else None,
        compania_detectada=compania.nombre if compania else None,
        ramo_detectado=ramo.nombre if ramo else None,
        subramo_detectado=subramo.nombre if subramo else None,
        metodo_deteccion=metodo_det,
        datos_completos={k: v.get("valor") for k, v in datos_finales.items()},
        texto_pdf=texto[:50_000],
        exitoso=True,
        campos_por_regla=por_regla,
        campos_por_ia=por_ia,
        campos_no_encontrados=no_encontrados,
        poliza_entrenamiento_id=poliza_guardada.id if poliza_guardada else None,
    )
    db.add(extraccion)
    db.flush()

    for nombre, info in datos_finales.items():
        db.add(CampoExtraido(
            extraccion_id=extraccion.id,
            nombre_campo=nombre,
            valor=info.get("valor"),
            metodo=info.get("metodo", "no_encontrado"),
            regla_id=info.get("regla_id"),
        ))

    db.commit()

    return {
        "id":       extraccion.id,
        "archivo":  nombre_archivo,
        "compania": compania.nombre if compania else None,
        "ramo":     ramo.nombre if ramo else None,
        "subramo":  subramo.nombre if subramo else None,
        "campos":   datos_finales,
        "stats": {
            "por_regla":      por_regla,
            "por_ia":         por_ia,
            "no_encontrados": no_encontrados,
        },
        # ── Metadata de detección ──
        "deteccion": {
            "confianza":          det["confianza"],
            "score_compania":     det["score_compania"],
            "score_ramo":         det["score_ramo"],
            "score_subramo":      det["score_subramo"],
            "patrones_generados": bool(patrones_generados),
            "patrones_nuevos":    patrones_generados,
        },
        "error": None,
        "rechazo": None,
    }


def _resultado_error(nombre_archivo: str, mensaje: str) -> dict:
    return {
        "id":      None,
        "archivo": nombre_archivo,
        "compania": None,
        "ramo":     None,
        "subramo":  None,
        "campos":   {},
        "stats":    {"por_regla": 0, "por_ia": 0, "no_encontrados": 0},
        "deteccion": {
            "confianza": "sin_datos",
            "score_compania": 0, "score_ramo": 0, "score_subramo": 0,
            "patrones_generados": False, "patrones_nuevos": {},
        },
        "error": mensaje,
        "rechazo": None,
    }
