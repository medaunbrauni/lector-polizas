"""
Motor de reglas: aplica los patrones regex guardados en BD
para extraer campos de una póliza.
"""
import re
from sqlalchemy.orm import Session
from ..models.db_models import ReglaExtraccion, CampoDefinido, Subramo


def aplicar_reglas(texto: str, subramo_id: int, db: Session) -> dict[str, dict]:
    """
    Retorna dict: {nombre_campo: {"valor": ..., "metodo": "regla", "regla_id": ...}}
    Solo incluye los campos para los que existe una regla activa.
    """
    reglas = (
        db.query(ReglaExtraccion)
        .filter(
            ReglaExtraccion.subramo_id == subramo_id,
            ReglaExtraccion.activo == True,
        )
        .all()
    )

    resultados = {}
    for regla in reglas:
        valor = _aplicar_patron(regla.patron_regex, texto)
        resultados[regla.nombre_campo] = {
            "valor": valor,
            "metodo": "regla" if valor else "no_encontrado",
            "regla_id": regla.id,
        }
    return resultados


def _aplicar_patron(patron: str, texto: str) -> str | None:
    try:
        m = re.search(patron, texto, re.IGNORECASE | re.MULTILINE)
        if m:
            # Usa grupo 1 si existe, si no el match completo
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
        .filter(ReglaExtraccion.subramo_id == subramo_id, ReglaExtraccion.activo == True)
        .distinct()
        .count()
    )
    return {
        "total_campos": total,
        "campos_con_regla": con_regla,
        "campos_sin_regla": max(0, total - con_regla),
        "porcentaje": round((con_regla / total * 100) if total else 0, 1),
    }
