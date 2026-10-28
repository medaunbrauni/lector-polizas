"""Métricas de operación: gasto de IA y desempeño de reglas en producción."""
from __future__ import annotations
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.db_models import UsoIA, CampoExtraido, ReglaExtraccion, Subramo, Ramo, Compania

router = APIRouter(prefix="/metricas", tags=["Métricas"])


@router.get("/ia")
def uso_ia(dias: int = 30, db: Session = Depends(get_db)):
    """Llamadas y tokens a la API de Anthropic por origen y modelo en los últimos `dias`."""
    desde = datetime.utcnow() - timedelta(days=dias)
    filas = (
        db.query(UsoIA.origen, UsoIA.modelo, func.count(), func.sum(UsoIA.tokens_in), func.sum(UsoIA.tokens_out))
        .filter(UsoIA.created_at >= desde)
        .group_by(UsoIA.origen, UsoIA.modelo)
        .all()
    )
    return [
        {"origen": o, "modelo": m, "llamadas": n, "tokens_in": ti or 0, "tokens_out": to or 0}
        for o, m, n, ti, to in sorted(filas, key=lambda f: -(f[3] or 0))
    ]


def stats_reglas_produccion(db: Session, regla_ids: list[int] | None = None) -> dict[int, dict]:
    """Por regla: veces que se aplicó en extracciones reales y cuántas encontró el valor."""
    q = db.query(CampoExtraido.regla_id, CampoExtraido.metodo, func.count()).filter(CampoExtraido.regla_id.isnot(None))
    if regla_ids is not None:
        q = q.filter(CampoExtraido.regla_id.in_(regla_ids))
    out: dict[int, dict] = {}
    for rid, metodo, n in q.group_by(CampoExtraido.regla_id, CampoExtraido.metodo).all():
        s = out.setdefault(rid, {"intentos": 0, "aciertos": 0})
        s["intentos"] += n
        if metodo == "regla":
            s["aciertos"] += n
    return out


@router.get("/reglas")
def reglas_produccion(minimo: int = 5, db: Session = Depends(get_db)):
    """Reglas activas con su tasa de acierto real, de la peor a la mejor (mínimo `minimo` intentos)."""
    reglas = db.query(ReglaExtraccion).filter(
        ReglaExtraccion.activo == True, ReglaExtraccion.es_borrador == False,  # noqa: E712
    ).all()
    stats = stats_reglas_produccion(db, [r.id for r in reglas])
    nombres = {
        s.id: f"{c.nombre} / {s.nombre}"
        for s, c in db.query(Subramo, Compania).join(Ramo, Ramo.id == Subramo.ramo_id).join(Compania, Compania.id == Ramo.compania_id)
    }
    filas = []
    for r in reglas:
        s = stats.get(r.id)
        if not s or s["intentos"] < minimo:
            continue
        filas.append({
            "regla_id": r.id, "subramo": nombres.get(r.subramo_id), "campo": r.nombre_campo,
            "intentos": s["intentos"], "aciertos": s["aciertos"],
            "tasa": round(s["aciertos"] / s["intentos"], 3),
        })
    return sorted(filas, key=lambda f: f["tasa"])
