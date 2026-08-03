"""
Interfaz común para extractores especializados por compañía.

Cada extractor recibe el texto ya extraído del PDF (y opcionalmente los
bytes originales, por si necesita reprocesar con otra herramienta) y
retorna únicamente los campos que logró encontrar con certeza — nunca
incluye claves para campos no encontrados, así el pipeline sabe cuáles
delegar al motor de reglas de BD (nivel 2).
"""
from __future__ import annotations
from typing import Protocol


class ExtractorEspecializado(Protocol):
    def __call__(self, texto: str, pdf_bytes: bytes | None = None) -> dict[str, str]:
        ...
