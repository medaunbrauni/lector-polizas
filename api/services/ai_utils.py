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


class _Mensajes:
    def __init__(self, mensajes, origen):
        self._m, self._origen = mensajes, origen

    def create(self, **kw):
        msg = self._m.create(**kw)
        try:
            from ..database import SessionLocal
            from ..models.db_models import UsoIA
            uso = getattr(msg, "usage", None)
            with SessionLocal() as db:
                db.add(UsoIA(
                    origen=self._origen, modelo=kw.get("model"),
                    tokens_in=getattr(uso, "input_tokens", 0) or 0,
                    tokens_out=getattr(uso, "output_tokens", 0) or 0,
                ))
                db.commit()
        except Exception:
            pass  # el registro de uso nunca debe romper una extracción
        return msg


class ClienteMedido:
    """Cliente Anthropic que registra los tokens de cada messages.create en uso_ia."""
    def __init__(self, cliente, origen):
        self._c = cliente
        self.messages = _Mensajes(cliente.messages, origen)

    def __getattr__(self, nombre):
        return getattr(self._c, nombre)


def make_anthropic_client(origen: str = "otro"):
    """Crea y retorna un cliente Anthropic (medido) usando la API key del entorno."""
    import os
    import anthropic
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY no configurada en el entorno")
    return ClienteMedido(anthropic.Anthropic(api_key=api_key), origen)
