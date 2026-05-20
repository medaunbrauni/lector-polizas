"""
Detección en cascada: Compañía → Ramo → Subramo.
Usa patrones_deteccion (regex) con mayor peso y keywords como fallback.
"""
import re
from sqlalchemy.orm import Session
from ..models.db_models import Compania, Ramo, Subramo


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


def detectar_jerarquia(texto: str, db: Session) -> tuple[Compania | None, Ramo | None, Subramo | None]:
    texto_lower = texto.lower()

    compania = _detectar_compania(texto_lower, texto, db)
    if not compania:
        return None, None, None

    ramo = _detectar_ramo(texto_lower, texto, compania, db)
    if not ramo:
        return compania, None, None

    subramo = _detectar_subramo(texto_lower, texto, ramo, db)
    return compania, ramo, subramo


def _detectar_compania(texto_l: str, texto: str, db: Session) -> Compania | None:
    companias = db.query(Compania).filter(Compania.activo == True).all()
    mejor, mejor_score = None, 0
    for c in companias:
        s = _score(texto_l, c.keywords, c.patrones_deteccion)
        if s > mejor_score:
            mejor_score = s
            mejor = c
    return mejor


def _detectar_ramo(texto_l: str, texto: str, compania: Compania, db: Session) -> Ramo | None:
    ramos = db.query(Ramo).filter(Ramo.compania_id == compania.id, Ramo.activo == True).all()
    mejor, mejor_score = None, 0
    for r in ramos:
        s = _score(texto_l, r.keywords, r.patrones_deteccion)
        if s > mejor_score:
            mejor_score = s
            mejor = r
    return mejor


def _detectar_subramo(texto_l: str, texto: str, ramo: Ramo, db: Session) -> Subramo | None:
    subramos = db.query(Subramo).filter(Subramo.ramo_id == ramo.id, Subramo.activo == True).all()
    mejor, mejor_score = None, 0
    for s in subramos:
        sc = _score(texto_l, s.keywords, s.patrones_deteccion)
        if sc > mejor_score:
            mejor_score = sc
            mejor = s
    return mejor
