"""
Utilidades compartidas para integración con Claude API.
Centraliza el parsing de JSON y evita duplicación en 5+ archivos.
"""
import re
import json


def parse_claude_json(raw: str) -> dict:
    """
    Extrae y parsea JSON de la respuesta de Claude.
    Maneja correctamente respuestas con o sin fences de markdown (```json ... ```).

    Lanza json.JSONDecodeError si el contenido no es JSON válido.
    """
    raw = raw.strip()
    # Remover fence de apertura: ```json o ```
    raw = re.sub(r'^```(?:json)?\s*\n?', '', raw, flags=re.IGNORECASE)
    # Remover fence de cierre: ```
    raw = re.sub(r'\n?```\s*$', '', raw)
    return json.loads(raw.strip())


def make_anthropic_client():
    """Crea y retorna un cliente Anthropic usando la API key del entorno."""
    import os
    import anthropic
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY no configurada en el entorno")
    return anthropic.Anthropic(api_key=api_key)
