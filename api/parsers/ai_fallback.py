"""
Extracción con Claude Haiku para campos sin regla definida.
"""
from __future__ import annotations
import os
import json
import anthropic

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic | None:
    global _client
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    if _client is None:
        _client = anthropic.Anthropic(api_key=api_key)
    return _client


def extraer_campos_con_ia(
    texto: str,
    campos: list[str],
    contexto: dict,
) -> dict[str, str | None]:
    """
    Extrae solo los campos indicados del texto de la póliza.
    Retorna {nombre_campo: valor_o_None}.
    """
    client = _get_client()
    if not client:
        return {campo: None for campo in campos}

    compania = contexto.get("compania") or "desconocida"
    ramo = contexto.get("ramo") or "desconocido"
    subramo = contexto.get("subramo") or "desconocido"

    campos_str = "\n".join(f'  "{c}": null' for c in campos)

    prompt = f"""Eres un experto en pólizas de seguros mexicanas.
Compañía detectada: {compania} | Ramo: {ramo} | Subramo: {subramo}

Extrae ÚNICAMENTE los siguientes campos del texto de la póliza.
Si un campo no está presente, usa null. No inventes datos.
Responde SOLO con JSON válido, sin texto adicional.

Campos a extraer:
{{{campos_str}}}

Texto de la póliza:
{texto[:5000]}"""

    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:])
            if raw.endswith("```"):
                raw = raw[:-3].strip()
        return json.loads(raw)
    except Exception:
        return {campo: None for campo in campos}
