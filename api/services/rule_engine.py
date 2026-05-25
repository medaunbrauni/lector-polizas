"""
Motor de reglas: aplica los patrones regex guardados en BD
para extraer campos de una póliza.
"""
import io
import re
import pdfplumber
from sqlalchemy.orm import Session
from ..models.db_models import ReglaExtraccion, CampoDefinido, CampoGlobal, Subramo, Ramo


# ── Helpers ────────────────────────────────────────────────────────────────────

_VEHICULO_KW = ("vehículo", "vehiculo", "auto", "moto", "camión", "camion", "transporte", "carga")


def _es_vehiculo(nombre_ramo: str) -> bool:
    n = nombre_ramo.lower()
    return any(kw in n for kw in _VEHICULO_KW)


def _ramo_de_subramo(subramo_id: int, db: Session) -> Ramo | None:
    s = db.query(Subramo).filter(Subramo.id == subramo_id).first()
    if not s:
        return None
    return db.query(Ramo).filter(Ramo.id == s.ramo_id).first()


def _globales_para_subramo(subramo_id: int, db: Session) -> list[CampoGlobal]:
    """Retorna los campos globales aplicables al subramo (filtra vehiculos si no aplica)."""
    ramo = _ramo_de_subramo(subramo_id, db)
    es_veh = _es_vehiculo(ramo.nombre if ramo else "")
    q = db.query(CampoGlobal)
    if not es_veh:
        q = q.filter(
            (CampoGlobal.grupo == None) | (CampoGlobal.grupo != "vehiculos")
        )
    return q.order_by(CampoGlobal.orden).all()


# ── Motor principal ────────────────────────────────────────────────────────────

def aplicar_reglas(
    texto: str,
    subramo_id: int,
    db: Session,
    pdf_bytes: bytes | None = None,
) -> dict[str, dict]:
    """
    Retorna dict: {nombre_campo: {"valor": ..., "metodo": ..., "regla_id": ...}}
    Cubre:
      - Reglas regex activas del subramo (con soporte bbox opcional)
      - Campos globales con valor_fijo (retornados directamente sin regex)
    """
    # 1. Aplicar reglas regex
    reglas = (
        db.query(ReglaExtraccion)
        .filter(
            ReglaExtraccion.subramo_id == subramo_id,
            ReglaExtraccion.activo == True,
            ReglaExtraccion.es_borrador == False,
        )
        .all()
    )

    resultados: dict[str, dict] = {}
    for regla in reglas:
        valor = None
        if regla.bbox and pdf_bytes:
            texto_zona = _extraer_texto_bbox(pdf_bytes, regla.bbox)
            if texto_zona:
                valor = _aplicar_patron(regla.patron_regex, texto_zona)
            if valor is None:
                valor = _aplicar_patron(regla.patron_regex, texto)
        else:
            valor = _aplicar_patron(regla.patron_regex, texto)

        resultados[regla.nombre_campo] = {
            "valor": valor,
            "metodo": "regla" if valor else "no_encontrado",
            "regla_id": regla.id,
        }

    # 2. Campos globales con valor_fijo → siempre presentes sin regex
    for campo in _globales_para_subramo(subramo_id, db):
        if campo.valor_fijo is not None and campo.nombre not in resultados:
            resultados[campo.nombre] = {
                "valor": campo.valor_fijo,
                "metodo": "valor_fijo",
                "regla_id": None,
            }

    return resultados


def _extraer_texto_bbox(pdf_bytes: bytes, bbox: dict) -> str:
    """Extrae texto de una región específica de página usando pdfplumber."""
    page_num = int(bbox.get("page", 1)) - 1
    pad_pts = 5
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            if page_num >= len(pdf.pages):
                return ""
            page = pdf.pages[page_num]
            w, h = float(page.width), float(page.height)
            crop = page.within_bbox((
                0,
                max(0.0, bbox["top"] * h - pad_pts),
                w,
                min(h, bbox["bottom"] * h + pad_pts),
            ))
            return crop.extract_text() or ""
    except Exception:
        return ""


def _aplicar_patron(patron: str, texto: str) -> str | None:
    try:
        m = re.search(patron, texto, re.IGNORECASE | re.MULTILINE)
        if m:
            return m.group(1).strip() if m.lastindex and m.lastindex >= 1 else m.group(0).strip()
    except re.error:
        pass
    return None


# ── Campos sin regla ───────────────────────────────────────────────────────────

def campos_sin_regla(subramo_id: int, campos_cubiertos: set[str], db: Session) -> list:
    """
    Retorna campos (globales + específicos) sin regla activa ni valor_fijo
    — quedarán como no_encontrado en la extracción.
    """
    faltantes: list = []

    for c in _globales_para_subramo(subramo_id, db):
        if c.nombre not in campos_cubiertos and c.valor_fijo is None:
            faltantes.append(c)

    especificos = (
        db.query(CampoDefinido)
        .filter(
            CampoDefinido.subramo_id == subramo_id,
            CampoDefinido.nombre.notin_(campos_cubiertos),
        )
        .order_by(CampoDefinido.orden)
        .all()
    )
    faltantes.extend(especificos)
    return faltantes


# ── Cobertura ──────────────────────────────────────────────────────────────────

def cobertura_subramo(subramo_id: int, db: Session) -> dict:
    """Calcula cobertura total: (globales + específicos) vs (reglas + valor_fijo)."""
    globales = _globales_para_subramo(subramo_id, db)
    especificos = db.query(CampoDefinido).filter(CampoDefinido.subramo_id == subramo_id).all()
    total = len(globales) + len(especificos)

    nombres_con_regla: set[str] = {
        r.nombre_campo
        for r in db.query(ReglaExtraccion)
        .filter(
            ReglaExtraccion.subramo_id == subramo_id,
            ReglaExtraccion.activo == True,
            ReglaExtraccion.es_borrador == False,
        )
        .all()
    }

    cubiertos = 0
    for c in globales:
        if c.valor_fijo is not None or c.nombre in nombres_con_regla:
            cubiertos += 1
    for c in especificos:
        if c.nombre in nombres_con_regla:
            cubiertos += 1

    return {
        "total_campos": total,
        "campos_con_regla": cubiertos,
        "campos_sin_regla": max(0, total - cubiertos),
        "porcentaje": round((cubiertos / total * 100) if total else 0, 1),
    }
