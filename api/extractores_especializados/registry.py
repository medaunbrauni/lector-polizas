"""
Registro de extractores especializados por compañía.

Mapea el nombre exacto de Compania.nombre (tal como está en la BD) a la
función extractora correspondiente. obtener_extractor() devuelve None
cuando no existe un extractor dedicado para esa compañía — señal para
que el pipeline salte directo al motor de reglas de BD (nivel 2).
"""
from __future__ import annotations
from .base import ExtractorEspecializado
from . import qualitas, gnp

REGISTRY: dict[str, ExtractorEspecializado] = {
    "Quálitas":    qualitas.extraer,
    "GNP Seguros": gnp.extraer,
}


def obtener_extractor(nombre_compania: str) -> ExtractorEspecializado | None:
    return REGISTRY.get(nombre_compania)
