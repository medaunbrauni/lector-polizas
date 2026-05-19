import io
import pdfplumber
from ..parsers import PARSERS
from ..parsers.ai_fallback import extraer_con_ia
from ..models.poliza import PolizaExtraida


def extraer_texto_pdf(contenido: bytes) -> str:
    """Extrae todo el texto de un PDF usando pdfplumber."""
    texto_paginas = []
    with pdfplumber.open(io.BytesIO(contenido)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                texto_paginas.append(t)
    return "\n".join(texto_paginas)


def procesar_pdf(contenido: bytes, nombre_archivo: str) -> PolizaExtraida:
    """
    Pipeline de extracción:
    1. Extraer texto del PDF
    2. Detectar compañía y usar parser específico
    3. Si ningún parser detecta la compañía → Claude AI fallback
    """
    try:
        texto = extraer_texto_pdf(contenido)
    except Exception as e:
        return PolizaExtraida(
            archivo=nombre_archivo,
            error=f"No se pudo leer el PDF: {e}",
        )

    if not texto.strip():
        # PDF escaneado (imagen) — pasar directo a IA con advertencia
        return PolizaExtraida(
            archivo=nombre_archivo,
            error="PDF sin texto extraíble (posiblemente escaneado). Se requiere OCR.",
        )

    # Intentar parser específico de compañía
    for parser in PARSERS:
        if parser.detectar(texto):
            resultado = parser.extraer(texto, nombre_archivo)
            return resultado

    # Fallback a Claude AI para cualquier compañía no reconocida
    return extraer_con_ia(texto, nombre_archivo)
