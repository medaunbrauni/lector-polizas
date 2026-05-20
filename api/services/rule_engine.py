"""
Motor de reglas: aplica los patrones regex guardados en BD
para extraer campos de una póliza.
"""
import io
import re
import pdfplumber
from sqlalchemy.orm import Session
from ..models.db_models import ReglaExtraccion, CampoDefinido, Subramo


def aplicar_reglas(
    texto: str,
    subramo_id: int,
    db: Session,
    pdf_bytes: bytes | None = None,
) -> dict[str, dict]:
    """
    Retorna dict: {nombre_campo: {"valor": ..., "metodo": "regla", "regla_id": ...}}
    Solo incluye los campos para los que existe una regla activa.
    Si la regla tiene bbox y se proporcionan pdf_bytes, extrae texto de esa zona primero.
    """
    reglas = (
        db.query(ReglaExtraccion)
        .filter(
            ReglaExtraccion.subramo_id == subramo_id,
            ReglaExtraccion.activo == True,
            ReglaExtraccion.es_borrador == False,
        )
        .all()
    )

    resultados = {}
    for regla in reglas:
        valor = None
        if regla.bbox and pdf_bytes:
            texto_zona = _extraer_texto_bbox(pdf_bytes, regla.bbox)
            if texto_zona:
                valor = _aplicar_patron(regla.patron_regex, texto_zona)
            # Fall back to full text if bbox extraction gave nothing
            if valor is None:
                valor = _aplicar_patron(regla.patron_regex, texto)
        else:
            valor = _aplicar_patron(regla.patron_regex, texto)

        resultados[regla.nombre_campo] = {
            "valor": valor,
            "metodo": "regla" if valor else "no_encontrado",
            "regla_id": regla.id,
        }
    return resultados


def _extraer_texto_bbox(pdf_bytes: bytes, bbox: dict) -> str:
    """
    Extrae texto de una región específica del PDF usando pdfplumber.
    bbox: {page, x0, top, x1, bottom} — todos normalizados 0-1 (fracción del tamaño de página).
    Usa el ancho completo de la fila para capturar etiqueta + valor.
    """
    page_num = int(bbox.get("page", 1)) - 1
    pad_pts = 5  # padding vertical en puntos PDF

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            if page_num >= len(pdf.pages):
                return ""
            page = pdf.pages[page_num]
            w = float(page.width)
            h = float(page.height)
            # Usamos ancho completo para capturar la etiqueta del campo
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


def campos_sin_regla(subramo_id: int, campos_con_regla: set[str], db: Session) -> list[CampoDefinido]:
    """Retorna los campos definidos para el subramo que aún no tienen regla."""
    return (
        db.query(CampoDefinido)
        .filter(
            CampoDefinido.subramo_id == subramo_id,
            CampoDefinido.nombre.notin_(campos_con_regla),
        )
        .order_by(CampoDefinido.orden)
        .all()
    )


def cobertura_subramo(subramo_id: int, db: Session) -> dict:
    """Calcula qué % de campos del subramo tienen regla activa."""
    total = db.query(CampoDefinido).filter(CampoDefinido.subramo_id == subramo_id).count()
    con_regla = (
        db.query(ReglaExtraccion.nombre_campo)
        .filter(
            ReglaExtraccion.subramo_id == subramo_id,
            ReglaExtraccion.activo == True,
            ReglaExtraccion.es_borrador == False,
        )
        .distinct()
        .count()
    )
    return {
        "total_campos": total,
        "campos_con_regla": con_regla,
        "campos_sin_regla": max(0, total - con_regla),
        "porcentaje": round((con_regla / total * 100) if total else 0, 1),
    }
