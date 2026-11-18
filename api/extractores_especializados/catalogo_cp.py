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
import re
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


def colonia_al_final(cp: str, texto: str) -> str | None:
    """
    Colonia del catálogo para ese C.P. con la que TERMINA `texto` (calle +
    colonia sin separador, como la imprime ANA), o None. Sirve para que el
    extractor identifique la colonia en una dirección sin comas: se prueba el
    nombre completo del catálogo ("Centro (Área 6)") y luego sin el paréntesis;
    gana el más largo para no confundir "Centro" con "Colonia Centro".
    """
    entrada = _catalogo().get(cp)
    if not entrada:
        return None
    t = _normalizar(texto)
    mejor = None
    for col in entrada["colonias"]:
        for nombre in (col, re.sub(r"\s*\(.*?\)\s*", " ", col)):
            n = _normalizar(nombre)
            if n and t.endswith(n) and (mejor is None or len(n) > len(_normalizar(mejor))):
                mejor = col
    return mejor


def validar_direccion_cp(cp: str | None, colonia: str | None, municipio: str | None) -> dict:
    """
    Si el C.P. existe en el catálogo, el Municipio se homologa con el del
    catálogo (más confiable que un parseo de texto libre). La Colonia
    extraída del PDF SIEMPRE se conserva, coincida o no con el catálogo: hay
    direcciones sin colonia o con una que el catálogo no lista, y reemplazarla
    por "la primera del C.P." metía colonias que no decía el PDF. Si no se
    extrajo Colonia, queda vacía.
    Si el C.P. no existe en el catálogo (o no se extrajo), se devuelven los
    valores ya extraídos tal cual: no hay con qué validar.
    """
    resultado = {}
    if cp:
        resultado["cp"] = cp
    if colonia:
        resultado["colonia"] = colonia
    if municipio:
        resultado["municipio"] = municipio

    entrada = _catalogo().get(cp) if cp else None
    if entrada:
        resultado["municipio"] = entrada["municipio"]
    return resultado
