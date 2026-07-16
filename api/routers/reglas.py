import os
import re
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..config import MODEL_PATTERN_GEN
from ..database import get_db
from ..models.db_models import ReglaExtraccion, Extraccion
from ..services.rule_engine import _aplicar_patron, cobertura_subramo

router = APIRouter(prefix="/reglas", tags=["Reglas de Extracción"])


class ReglaIn(BaseModel):
    subramo_id: int
    nombre_campo: str
    patron_regex: str
    contexto_antes: str | None = None
    contexto_despues: str | None = None
    ejemplos: list[str] = []
    confianza: float = 1.0
    creado_por: str = "manual"
    es_borrador: bool = False
    bbox: dict | None = None  # {page, x0, top, x1, bottom} normalizado 0-1


class ProbarReglaIn(BaseModel):
    patron_regex: str
    texto: str


class GenerarRegexIn(BaseModel):
    subramo_id: int
    nombre_campo: str
    campo_label: str
    texto_seleccionado: str
    contexto_texto: str
    texto_completo: str
    compania: str | None = None
    ramo: str | None = None
    subramo: str | None = None


class ReintentarRegexIn(BaseModel):
    subramo_id: int
    nombre_campo: str
    campo_label: str
    patron_fallido: str
    texto_seleccionado: str
    contexto_texto: str
    texto_completo: str
    compania: str | None = None
    ramo: str | None = None
    subramo: str | None = None


@router.get("")
def listar_reglas(subramo_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(ReglaExtraccion).filter(
        ReglaExtraccion.activo == True,
        ReglaExtraccion.es_borrador == False,
    )
    if subramo_id:
        q = q.filter(ReglaExtraccion.subramo_id == subramo_id)
    return q.order_by(ReglaExtraccion.nombre_campo).all()


@router.get("/con-jerarquia")
def reglas_con_jerarquia(db: Session = Depends(get_db)):
    """Retorna todas las reglas activas con nombre de compañía, ramo y subramo para la vista de código."""
    from ..models.db_models import Subramo, Ramo, Compania
    rows = (
        db.query(
            ReglaExtraccion,
            Subramo.nombre.label("subramo_nombre"),
            Ramo.nombre.label("ramo_nombre"),
            Compania.nombre.label("compania_nombre"),
        )
        .join(Subramo, ReglaExtraccion.subramo_id == Subramo.id)
        .join(Ramo, Subramo.ramo_id == Ramo.id)
        .join(Compania, Ramo.compania_id == Compania.id)
        .filter(ReglaExtraccion.activo == True, ReglaExtraccion.es_borrador == False)
        .order_by(Compania.prioridad, Ramo.nombre, Subramo.nombre, ReglaExtraccion.nombre_campo)
        .all()
    )
    return [
        {
            "id": r.ReglaExtraccion.id,
            "compania": r.compania_nombre,
            "ramo": r.ramo_nombre,
            "subramo": r.subramo_nombre,
            "nombre_campo": r.ReglaExtraccion.nombre_campo,
            "patron_regex": r.ReglaExtraccion.patron_regex,
            "confianza": r.ReglaExtraccion.confianza,
            "creado_por": r.ReglaExtraccion.creado_por,
            "updated_at": r.ReglaExtraccion.updated_at.isoformat() if r.ReglaExtraccion.updated_at else None,
        }
        for r in rows
    ]


@router.get("/borradores")
def listar_borradores(subramo_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(ReglaExtraccion).filter(
        ReglaExtraccion.activo == True,
        ReglaExtraccion.es_borrador == True,
    )
    if subramo_id:
        q = q.filter(ReglaExtraccion.subramo_id == subramo_id)
    return q.order_by(ReglaExtraccion.nombre_campo).all()


@router.post("")
def crear_regla(data: ReglaIn, db: Session = Depends(get_db)):
    if not data.es_borrador:
        # Solo desactivar la regla activa anterior si estamos guardando una regla real
        db.query(ReglaExtraccion).filter(
            ReglaExtraccion.subramo_id == data.subramo_id,
            ReglaExtraccion.nombre_campo == data.nombre_campo,
            ReglaExtraccion.activo == True,
            ReglaExtraccion.es_borrador == False,
        ).update({"activo": False})

    regla = ReglaExtraccion(**data.model_dump())
    db.add(regla)
    db.commit()
    db.refresh(regla)
    return regla


@router.post("/probar")
def probar_regla(data: ProbarReglaIn):
    valor = _aplicar_patron(data.patron_regex, data.texto)
    return {"coincidencia": valor, "encontrado": valor is not None}


@router.get("/cobertura/{subramo_id}")
def cobertura(subramo_id: int, db: Session = Depends(get_db)):
    return cobertura_subramo(subramo_id, db)


@router.get("/textos-disponibles")
def textos_disponibles(subramo_id: int, db: Session = Depends(get_db)):
    """Retorna extracciones recientes del subramo con su texto_pdf para el constructor visual."""
    items = (
        db.query(Extraccion)
        .filter(
            Extraccion.subramo_id == subramo_id,
            Extraccion.exitoso == True,
            Extraccion.texto_pdf.isnot(None),
        )
        .order_by(Extraccion.created_at.desc())
        .limit(10)
        .all()
    )
    return [
        {
            "id": e.id,
            "nombre_archivo": e.nombre_archivo,
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "texto_pdf": e.texto_pdf,
        }
        for e in items
    ]


@router.post("/generar-con-ia")
def generar_regex_con_ia(data: GenerarRegexIn):
    """
    Recibe el valor seleccionado por el usuario y su contexto,
    llama a Claude para generar un regex robusto y lo prueba contra el texto completo.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(400, "ANTHROPIC_API_KEY no configurada")

    import anthropic
    client = anthropic.Anthropic(api_key=api_key)

    prompt = f"""Eres un experto en pólizas de seguros mexicanas y expresiones regulares Python (módulo `re`).

Contexto:
- Compañía: {data.compania or '?'}  |  Ramo: {data.ramo or '?'}  |  Subramo: {data.subramo or '?'}
- Campo a extraer: "{data.nombre_campo}"  (etiqueta en UI: "{data.campo_label}")

El usuario identificó visualmente este valor en el PDF:
  VALOR SELECCIONADO: "{data.texto_seleccionado}"

Texto del PDF alrededor del valor (±300 caracteres de contexto):
---
{data.contexto_texto}
---

Genera un patrón regex Python (usado con re.search + re.IGNORECASE | re.MULTILINE) que:
1. Capture el valor en el GRUPO 1 — eso es lo que se extrae.
2. Use el texto que aparece ANTES del valor como ancla (label o separador), ej: r"Placas[:\\s:]+([A-Z0-9\\-]+)".
3. Sea robusto a variaciones de espaciado, puntuación y mayúsculas/minúsculas.
4. Sea específico para no confundirse con otros campos del PDF.
5. NO uses lookahead/lookbehind complejos a menos que sea estrictamente necesario.

Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin bloques markdown:
{{
  "patron_regex": "...",
  "explicacion": "...",
  "confianza": 0.0
}}"""

    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:])
            if raw.endswith("```"):
                raw = raw[:-3].strip()
        resultado = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(500, f"La IA devolvió una respuesta inválida: {e}")
    except Exception as e:
        raise HTTPException(500, f"Error al llamar a Claude: {e}")

    patron = resultado.get("patron_regex", "")

    try:
        re.compile(patron)
    except re.error as e:
        raise HTTPException(422, f"El regex generado no es válido: {e}")

    valor_encontrado = _aplicar_patron(patron, data.texto_completo)
    resultado["match_test"] = valor_encontrado
    resultado["match_ok"] = valor_encontrado is not None

    return resultado


class PatronesDeteccionIn(BaseModel):
    subramo_id: int
    texto_pdf: str


@router.post("/generar-patrones-deteccion")
def generar_patrones_deteccion(
    data: PatronesDeteccionIn,
    db: Session = Depends(get_db),
):
    """
    Analiza el texto de un PDF y genera regex para detectar automáticamente
    la compañía, ramo y subramo sin usar IA en el futuro.
    """
    from ..models.db_models import Subramo, Ramo, Compania
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(400, "ANTHROPIC_API_KEY no configurada")

    subramo = db.query(Subramo).filter(Subramo.id == data.subramo_id).first()
    if not subramo:
        raise HTTPException(404, "Subramo no encontrado")
    ramo = db.query(Ramo).filter(Ramo.id == subramo.ramo_id).first()
    compania = db.query(Compania).filter(Compania.id == ramo.compania_id).first()

    import anthropic
    client = anthropic.Anthropic(api_key=api_key)

    prompt = f"""Eres un experto en pólizas de seguros mexicanas.

Se sabe que este PDF pertenece a:
  Compañía: {compania.nombre}
  Ramo: {ramo.nombre}
  Subramo: {subramo.nombre}

Texto del PDF (primeros 3000 caracteres):
---
{data.texto_pdf[:3000]}
---

Genera patrones regex Python (re.search, IGNORECASE|MULTILINE) que permitan identificar AUTOMÁTICAMENTE este tipo de póliza en el futuro. Deben ser:
1. **Patrones de compañía** (2-3): frases o logos únicos de {compania.nombre} que no aparecerían en pólizas de otras compañías.
2. **Patrones de ramo** (2-3): términos que indican que es un seguro de {ramo.nombre}.
3. **Patrones de subramo** (2-3): frases que identifican específicamente el subramo "{subramo.nombre}".

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{{
  "compania": ["patron1", "patron2"],
  "ramo": ["patron1", "patron2"],
  "subramo": ["patron1", "patron2"],
  "explicacion": "breve descripción de los patrones generados"
}}"""

    try:
        msg = client.messages.create(
            model=MODEL_PATTERN_GEN,
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:])
            if raw.endswith("```"):
                raw = raw[:-3].strip()
        resultado = json.loads(raw)
    except Exception as e:
        raise HTTPException(500, f"Error al llamar a Claude: {e}")

    # Validar que los patrones sean regex válidos
    for nivel in ("compania", "ramo", "subramo"):
        validos = []
        for p in resultado.get(nivel, []):
            try:
                re.compile(p)
                validos.append(p)
            except re.error:
                pass
        resultado[nivel] = validos

    resultado["compania_id"] = compania.id
    resultado["ramo_id"] = ramo.id
    resultado["subramo_id"] = subramo.id
    return resultado


@router.post("/reintentar-regex")
def reintentar_regex(data: ReintentarRegexIn):
    """Pide a Claude una variante más laxa del patrón que falló."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(400, "ANTHROPIC_API_KEY no configurada")

    import anthropic
    client = anthropic.Anthropic(api_key=api_key)

    prompt = f"""Eres un experto en pólizas de seguros mexicanas y regex Python.

El patrón anterior NO encontró coincidencia en el PDF:
  PATRÓN FALLIDO: {data.patron_fallido}

Contexto:
- Campo: "{data.nombre_campo}" ({data.campo_label})
- Compañía: {data.compania or '?'} | Ramo: {data.ramo or '?'} | Subramo: {data.subramo or '?'}
- Valor buscado: "{data.texto_seleccionado}"

Texto del PDF alrededor del valor (±300 chars):
---
{data.contexto_texto}
---

Genera un patrón ALTERNATIVO MÁS FLEXIBLE que:
1. Capture el valor en el GRUPO 1.
2. Use una ancla de contexto diferente o más laxa que el patrón fallido.
3. Tolere más variaciones de espaciado, caracteres especiales y saltos de línea.
4. Permita sinónimos o patrones parciales de la etiqueta anterior.
5. Usa .*? cuando sea necesario para ser menos estricto.

Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin bloques markdown:
{{
  "patron_regex": "...",
  "explicacion": "...",
  "confianza": 0.0
}}"""

    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:])
            if raw.endswith("```"):
                raw = raw[:-3].strip()
        resultado = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(500, f"La IA devolvió una respuesta inválida: {e}")
    except Exception as e:
        raise HTTPException(500, f"Error al llamar a Claude: {e}")

    patron = resultado.get("patron_regex", "")
    try:
        re.compile(patron)
    except re.error as e:
        raise HTTPException(422, f"El regex generado no es válido: {e}")

    valor_encontrado = _aplicar_patron(patron, data.texto_completo)
    resultado["match_test"] = valor_encontrado
    resultado["match_ok"] = valor_encontrado is not None

    return resultado


@router.put("/{id}")
def editar_regla(id: int, data: ReglaIn, db: Session = Depends(get_db)):
    r = db.query(ReglaExtraccion).filter(ReglaExtraccion.id == id).first()
    if not r:
        raise HTTPException(404)
    for k, v in data.model_dump().items():
        setattr(r, k, v)
    db.commit()
    return r


@router.delete("/{id}")
def desactivar_regla(id: int, db: Session = Depends(get_db)):
    r = db.query(ReglaExtraccion).filter(ReglaExtraccion.id == id).first()
    if not r:
        raise HTTPException(404)
    r.activo = False
    db.commit()
    return {"ok": True}


@router.post("/{id}/activar")
def activar_borrador(id: int, db: Session = Depends(get_db)):
    """Promueve un borrador a regla activa, desactivando cualquier regla activa previa del mismo campo."""
    r = db.query(ReglaExtraccion).filter(ReglaExtraccion.id == id).first()
    if not r:
        raise HTTPException(404)
    db.query(ReglaExtraccion).filter(
        ReglaExtraccion.subramo_id == r.subramo_id,
        ReglaExtraccion.nombre_campo == r.nombre_campo,
        ReglaExtraccion.activo == True,
        ReglaExtraccion.es_borrador == False,
        ReglaExtraccion.id != id,
    ).update({"activo": False})
    r.es_borrador = False
    db.commit()
    db.refresh(r)
    return r
