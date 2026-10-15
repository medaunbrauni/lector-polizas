"""
Registro de extractores especializados por compañía.

Mapea el nombre exacto de Compania.nombre (tal como está en la BD) a la
función extractora correspondiente. obtener_extractor() devuelve None
cuando no existe un extractor dedicado para esa compañía — señal para
que el pipeline salte directo al motor de reglas de BD (nivel 2).
"""
from __future__ import annotations
import unicodedata
from .base import ExtractorEspecializado
from . import qualitas, gnp, el_potosi

REGISTRY: dict[str, ExtractorEspecializado] = {
    "Quálitas":          qualitas.extraer,
    "GNP Seguros":       gnp.extraer,
    "Seguros El Potosí": el_potosi.extraer,
}


# Combinaciones compañía → ramo → subramos que cada extractor SÍ procesa, solo
# las que tienen extracciones reales verificadas (los extractores actuales son
# todos de autos). Todo lo demás se rechaza y se manda al Entrenador. Para
# habilitar otro subramo: agregarlo aquí cuando su extractor esté validado.
SOPORTE: dict[str, dict[str, set[str]]] = {
    "GNP Seguros": {"Vehículos": {"Automóviles", "Flotilla de Vehiculos", "Motocicletas", "Autobuses"}},
    "Quálitas": {"Vehículos": {"Automóviles", "Camiones", "Motocicletas"}},
    "Seguros El Potosí": {"Vehículos": {"Automóviles"}},
}


def _norm(s: str | None) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", (s or "").lower()) if unicodedata.category(c) != "Mn"
    ).strip()


def esta_soportado(compania: str | None, ramo: str | None, subramo: str | None) -> bool:
    """True si hay extractor para esa compañía, ramo y subramo (sin distinguir acentos/mayúsculas)."""
    for c, ramos in SOPORTE.items():
        if _norm(c) == _norm(compania):
            return any(
                _norm(r) == _norm(ramo) and _norm(subramo) in {_norm(s) for s in subs}
                for r, subs in ramos.items()
            )
    return False


def combinaciones_sin_catalogo(db) -> list[str]:
    """
    Entradas de SOPORTE que no existen en el catálogo de la BD (nombre distinto,
    ramo o subramo faltante). Si hay alguna, esa combinación se rechazaría
    aunque tenga extractor: se avisa en el log al arrancar.
    """
    from ..models.db_models import Compania, Ramo, Subramo  # evita import circular al cargar el paquete

    faltan: list[str] = []
    companias = {_norm(c.nombre): c for c in db.query(Compania).all()}
    for comp, ramos in SOPORTE.items():
        c = companias.get(_norm(comp))
        if not c:
            faltan.append(f"{comp}")
            continue
        ramos_bd = {_norm(r.nombre): r for r in db.query(Ramo).filter(Ramo.compania_id == c.id)}
        for ramo, subs in ramos.items():
            r = ramos_bd.get(_norm(ramo))
            if not r:
                faltan.append(f"{comp} › {ramo}")
                continue
            subs_bd = {_norm(s.nombre) for s in db.query(Subramo).filter(Subramo.ramo_id == r.id)}
            faltan += [f"{comp} › {ramo} › {s}" for s in subs if _norm(s) not in subs_bd]
    return faltan


def obtener_extractor(nombre_compania: str) -> ExtractorEspecializado | None:
    return REGISTRY.get(nombre_compania)
