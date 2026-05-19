"""
Detección en cascada: Compañía → Ramo → Subramo.
Busca las keywords de cada nivel en el texto del PDF.
"""
from sqlalchemy.orm import Session
from ..models.db_models import Compania, Ramo, Subramo


def detectar_jerarquia(texto: str, db: Session) -> tuple[Compania | None, Ramo | None, Subramo | None]:
    texto_lower = texto.lower()

    compania = _detectar_compania(texto_lower, db)
    if not compania:
        return None, None, None

    ramo = _detectar_ramo(texto_lower, compania, db)
    if not ramo:
        return compania, None, None

    subramo = _detectar_subramo(texto_lower, ramo, db)
    return compania, ramo, subramo


def _detectar_compania(texto: str, db: Session) -> Compania | None:
    companias = db.query(Compania).filter(Compania.activo == True).all()
    mejor = None
    mejor_score = 0
    for c in companias:
        score = sum(1 for kw in (c.keywords or []) if kw.lower() in texto)
        if score > mejor_score:
            mejor_score = score
            mejor = c
    return mejor


def _detectar_ramo(texto: str, compania: Compania, db: Session) -> Ramo | None:
    ramos = db.query(Ramo).filter(
        Ramo.compania_id == compania.id,
        Ramo.activo == True
    ).all()
    mejor = None
    mejor_score = 0
    for r in ramos:
        score = sum(1 for kw in (r.keywords or []) if kw.lower() in texto)
        if score > mejor_score:
            mejor_score = score
            mejor = r
    return mejor


def _detectar_subramo(texto: str, ramo: Ramo, db: Session) -> Subramo | None:
    subramos = db.query(Subramo).filter(
        Subramo.ramo_id == ramo.id,
        Subramo.activo == True
    ).all()
    mejor = None
    mejor_score = 0
    for s in subramos:
        score = sum(1 for kw in (s.keywords or []) if kw.lower() in texto)
        if score > mejor_score:
            mejor_score = score
            mejor = s
    return mejor
