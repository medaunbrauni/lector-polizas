"""
Pipeline principal de extracción.
Orquesta: texto PDF → detección → reglas → IA fallback → guardar historial.
"""
import io
import pdfplumber
from sqlalchemy.orm import Session

from .detector import detectar_jerarquia
from .rule_engine import aplicar_reglas, campos_sin_regla
from ..parsers.ai_fallback import extraer_campos_con_ia
from ..models.db_models import Extraccion, CampoExtraido, CampoDefinido


def extraer_texto_pdf(contenido: bytes) -> str:
    texto_paginas = []
    with pdfplumber.open(io.BytesIO(contenido)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                texto_paginas.append(t)
    return "\n".join(texto_paginas)


def procesar_pdf(contenido: bytes, nombre_archivo: str, db: Session) -> dict:
    """
    Pipeline completo. Retorna dict con todos los datos y metadata.
    """
    # 1. Extraer texto
    try:
        texto = extraer_texto_pdf(contenido)
    except Exception as e:
        return _resultado_error(nombre_archivo, str(e))

    if not texto.strip():
        return _resultado_error(nombre_archivo, "PDF sin texto extraíble (posiblemente escaneado). Se requiere OCR.")

    # 2. Detectar jerarquía
    compania, ramo, subramo = detectar_jerarquia(texto, db)

    # 3. Aplicar reglas guardadas
    datos_reglas: dict[str, dict] = {}
    campos_faltantes: list[CampoDefinido] = []

    if subramo:
        datos_reglas = aplicar_reglas(texto, subramo.id, db)
        campos_cubiertos = {k for k, v in datos_reglas.items() if v["metodo"] == "regla"}
        campos_faltantes = campos_sin_regla(subramo.id, campos_cubiertos, db)

    # 4. IA para campos sin regla
    datos_ia: dict[str, str] = {}
    if campos_faltantes:
        nombres_faltantes = [c.nombre for c in campos_faltantes]
        contexto = {
            "compania": compania.nombre if compania else None,
            "ramo": ramo.nombre if ramo else None,
            "subramo": subramo.nombre if subramo else None,
        }
        datos_ia = extraer_campos_con_ia(texto, nombres_faltantes, contexto)

    # 5. Combinar resultados
    datos_finales = {}
    por_regla = 0
    por_ia = 0
    no_encontrados = 0

    for nombre, info in datos_reglas.items():
        datos_finales[nombre] = info
        if info["metodo"] == "regla":
            por_regla += 1
        else:
            no_encontrados += 1

    for nombre, valor in datos_ia.items():
        if nombre not in datos_finales:
            metodo = "ia" if valor else "no_encontrado"
            datos_finales[nombre] = {"valor": valor, "metodo": metodo, "regla_id": None}
            if valor:
                por_ia += 1
            else:
                no_encontrados += 1

    # 6. Guardar en historial
    extraccion = Extraccion(
        nombre_archivo=nombre_archivo,
        compania_id=compania.id if compania else None,
        ramo_id=ramo.id if ramo else None,
        subramo_id=subramo.id if subramo else None,
        compania_detectada=compania.nombre if compania else None,
        ramo_detectado=ramo.nombre if ramo else None,
        subramo_detectado=subramo.nombre if subramo else None,
        metodo_deteccion="keywords",
        datos_completos={k: v.get("valor") for k, v in datos_finales.items()},
        texto_pdf=texto[:50_000],  # guardar hasta 50k chars para el rule builder
        exitoso=True,
        campos_por_regla=por_regla,
        campos_por_ia=por_ia,
        campos_no_encontrados=no_encontrados,
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
        "id": extraccion.id,
        "archivo": nombre_archivo,
        "compania": compania.nombre if compania else None,
        "ramo": ramo.nombre if ramo else None,
        "subramo": subramo.nombre if subramo else None,
        "campos": datos_finales,
        "stats": {
            "por_regla": por_regla,
            "por_ia": por_ia,
            "no_encontrados": no_encontrados,
        },
        "error": None,
    }


def _resultado_error(nombre_archivo: str, mensaje: str) -> dict:
    return {
        "id": None,
        "archivo": nombre_archivo,
        "compania": None,
        "ramo": None,
        "subramo": None,
        "campos": {},
        "stats": {"por_regla": 0, "por_ia": 0, "no_encontrados": 0},
        "error": mensaje,
    }
