"""
Catálogo Nacional de Códigos Postales (Correos de México / SEPOMEX) —
usado para validar/corregir Colonia y Municipio a partir del C.P. ya
extraído del PDF, en vez de confiar solo en el parseo de texto libre de
"Dirección"/"Domicilio de Riesgo" (que varía mucho de layout a layout y
a veces viene incompleto o con Municipio/Colonia pegados sin comas).

api/data/catalogo_cp.json se genera una sola vez con
scripts/build_catalogo_cp.py a partir del TXT que reparte Correos de
México (no se descarga ni se reparsea en runtime) — este módulo solo lo
carga (una vez, cacheado) y resuelve el lookup por C.P.
"""
from __future__ import annotations
import json
import unicodedata
from functools import lru_cache
from pathlib import Path

_RUTA_CATALOGO = Path(__file__).resolve().parent.parent / "data" / "catalogo_cp.json"


@lru_cache(maxsize=1)
def _catalogo() -> dict:
    if not _RUTA_CATALOGO.exists():
        return {}
    return json.loads(_RUTA_CATALOGO.read_text(encoding="utf-8"))


def _normalizar(valor: str) -> str:
    valor = unicodedata.normalize("NFKD", valor.upper())
    return "".join(c for c in valor if not unicodedata.combining(c)).strip()


def validar_direccion_cp(cp: str | None, colonia: str | None, municipio: str | None) -> dict:
    """
    Si el C.P. existe en el catálogo:
      - Si la Colonia ya extraída coincide (sin acentos/mayúsculas) con
        alguna Colonia real de ese C.P., se deja tal cual — ya viene
        validada del PDF, solo se homologa el Municipio con el del
        catálogo (más confiable que un parseo de texto libre).
      - Si no coincide, o no se extrajo Colonia, se reemplazan Colonia y
        Municipio por los del catálogo. Un mismo C.P. puede tener varias
        Colonias reales; sin más señal que el propio C.P. no hay forma
        de saber cuál es la correcta, así que se toma la primera de la
        lista — ceiling conocido, documentado a propósito.
    Si el C.P. no existe en el catálogo (o no se extrajo C.P.), se
    devuelven los valores ya extraídos tal cual: no hay con qué validar.
    """
    resultado = {}
    if cp:
        resultado["cp"] = cp
    if colonia:
        resultado["colonia"] = colonia
    if municipio:
        resultado["municipio"] = municipio

    if not cp:
        return resultado
    entrada = _catalogo().get(cp)
    if not entrada:
        return resultado

    if colonia:
        colonia_norm = _normalizar(colonia)
        if any(_normalizar(c) == colonia_norm for c in entrada["colonias"]):
            resultado["municipio"] = entrada["municipio"]
            return resultado

    resultado["colonia"] = entrada["colonias"][0]
    resultado["municipio"] = entrada["municipio"]
    return resultado
