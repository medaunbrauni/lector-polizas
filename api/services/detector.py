"""
Detección en cascada: Compañía → Ramo → Subramo.
Usa patrones_deteccion (regex, 3 pts) y keywords (1 pt) como fallback.
Expone scores para que la UI muestre confianza.
"""
from __future__ import annotations
import re
from sqlalchemy.orm import Session
from ..models.db_models import Compania, Ramo, Subramo

# ── Umbrales de confianza ─────────────────────────────────────────────────────
# "alta"  ≥ 9 pts totales Y subramo detectado
# "media" ≥ 3 pts compañía Y ramo detectado
# "baja"  > 0 pts compañía
# "sin_datos" — no hay patrones o texto sin coincidencias
UMBRAL_ALTA  = 9
UMBRAL_MEDIA = 3


def _score(texto: str, keywords: list, patrones: list) -> int:
    """Suma puntos: regex = 3 pts, keyword = 1 pt."""
    score = 0
    for kw in (keywords or []):
        if kw.lower() in texto:
            score += 1
    for patron in (patrones or []):
        try:
            if re.search(patron, texto, re.IGNORECASE | re.MULTILINE):
                score += 3
        except re.error:
            pass
    return score


# ── API pública ───────────────────────────────────────────────────────────────

def detectar_jerarquia(
    texto: str, db: Session
) -> tuple[Compania | None, Ramo | None, Subramo | None]:
    """Retorna la jerarquía detectada (sin scores). Compatibilidad hacia atrás."""
    resultado = detectar_con_score(texto, db)
    comp = db.query(Compania).filter(Compania.id == resultado["compania_id"]).first() if resultado["compania_id"] else None
    ramo = db.query(Ramo).filter(Ramo.id == resultado["ramo_id"]).first() if resultado["ramo_id"] else None
    sub  = db.query(Subramo).filter(Subramo.id == resultado["subramo_id"]).first() if resultado["subramo_id"] else None
    return comp, ramo, sub


def detectar_con_score(texto: str, db: Session) -> dict:
    """
    Detecta compañía → ramo → subramo y devuelve el resultado con scores de confianza.

    Retorna:
    {
      compania_id, compania_nombre,
      ramo_id, ramo_nombre,
      subramo_id, subramo_nombre,
      score_compania, score_ramo, score_subramo,
      confianza: "alta" | "media" | "baja" | "sin_datos",
      candidatos_compania: [{id, nombre, score}, ...]  # top-3
    }
    """
    texto_lower = texto.lower()

    # ── Compañía ──────────────────────────────────────────────────────────────
    companias = (
        db.query(Compania)
        .filter(Compania.activo == True)
        .order_by(Compania.prioridad.asc().nulls_last())
        .all()
    )
    comp_scores = sorted(
        [
            {
                "id": c.id,
                "nombre": c.nombre,
                "score": _score(texto_lower, c.keywords, c.patrones_deteccion),
                "n_patrones": len(c.patrones_deteccion or []),
                "n_keywords": len(c.keywords or []),
            }
            for c in companias
        ],
        key=lambda x: x["score"],
        reverse=True,
    )
    mejor_comp = comp_scores[0] if comp_scores and comp_scores[0]["score"] > 0 else None
    score_comp = mejor_comp["score"] if mejor_comp else 0

    compania_id = mejor_comp["id"] if mejor_comp else None
    compania_nombre = mejor_comp["nombre"] if mejor_comp else None

    # ── Ramo ──────────────────────────────────────────────────────────────────
    ramo_id, ramo_nombre, score_ramo = None, None, 0
    if compania_id:
        ramos = (
            db.query(Ramo)
            .filter(Ramo.compania_id == compania_id, Ramo.activo == True)
            .all()
        )
        ramo_scores = sorted(
            [
                {
                    "id": r.id,
                    "nombre": r.nombre,
                    "score": _score(texto_lower, r.keywords, r.patrones_deteccion),
                }
                for r in ramos
            ],
            key=lambda x: x["score"],
            reverse=True,
        )
        mejor_ramo = ramo_scores[0] if ramo_scores and ramo_scores[0]["score"] > 0 else None
        if mejor_ramo:
            ramo_id = mejor_ramo["id"]
            ramo_nombre = mejor_ramo["nombre"]
            score_ramo = mejor_ramo["score"]

    # ── Subramo ───────────────────────────────────────────────────────────────
    subramo_id, subramo_nombre, score_sub = None, None, 0
    if ramo_id:
        subramos = (
            db.query(Subramo)
            .filter(Subramo.ramo_id == ramo_id, Subramo.activo == True)
            .order_by(Subramo.prioridad.asc().nulls_last())
            .all()
        )
        sub_scores = sorted(
            [
                {
                    "id": s.id,
                    "nombre": s.nombre,
                    "score": _score(texto_lower, s.keywords, s.patrones_deteccion),
                }
                for s in subramos
            ],
            key=lambda x: x["score"],
            reverse=True,
        )
        mejor_sub = sub_scores[0] if sub_scores and sub_scores[0]["score"] > 0 else None
        if mejor_sub:
            subramo_id = mejor_sub["id"]
            subramo_nombre = mejor_sub["nombre"]
            score_sub = mejor_sub["score"]

    # ── Confianza ─────────────────────────────────────────────────────────────
    total = score_comp + score_ramo + score_sub
    if subramo_id and total >= UMBRAL_ALTA:
        confianza = "alta"
    elif ramo_id and total >= UMBRAL_MEDIA:
        confianza = "media"
    elif compania_id:
        confianza = "baja"
    else:
        confianza = "sin_datos"

    return {
        "compania_id":    compania_id,
        "compania_nombre": compania_nombre,
        "ramo_id":        ramo_id,
        "ramo_nombre":    ramo_nombre,
        "subramo_id":     subramo_id,
        "subramo_nombre": subramo_nombre,
        "score_compania": score_comp,
        "score_ramo":     score_ramo,
        "score_subramo":  score_sub,
        "confianza":      confianza,
        "candidatos_compania": comp_scores[:3],
    }


def probar_patrones_en_textos(
    patrones: list[str], textos: list[str]
) -> list[dict]:
    """
    Prueba una lista de patrones contra una lista de textos.
    Retorna por patrón: cuántos textos matchean.
    """
    resultados = []
    for patron in patrones:
        matches = 0
        try:
            rx = re.compile(patron, re.IGNORECASE | re.MULTILINE)
            matches = sum(1 for t in textos if rx.search(t))
        except re.error:
            pass
        resultados.append({
            "patron": patron,
            "matches": matches,
            "total": len(textos),
            "valido": True,
        })
    return resultados
