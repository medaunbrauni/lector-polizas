import os
import json
import anthropic
from ..models.poliza import PolizaExtraida, VehiculoData, DireccionData, PrimasData, VigenciaData

PROMPT_SISTEMA = """Eres un extractor de datos de pólizas de seguros mexicanas.
Recibirás el texto de una póliza PDF y debes extraer los datos en formato JSON estrictamente.
Si un campo no está presente, usa null. No inventes datos.

Responde ÚNICAMENTE con JSON válido, sin texto adicional, con esta estructura:
{
  "compania": "nombre de la aseguradora",
  "ramo": "autos | gmm | vida | danos",
  "numero_poliza": "...",
  "nombre_cliente": "...",
  "rfc": "...",
  "forma_pago": "...",
  "moneda": "...",
  "vehiculo": {
    "descripcion": "...",
    "placas": "...",
    "serie": "...",
    "motor": "...",
    "tipo": "...",
    "nacional_importado": "..."
  },
  "direccion": {
    "calle": "...",
    "colonia": "...",
    "municipio": "...",
    "cp": "...",
    "estado": "..."
  },
  "primas": {
    "prima_neta": "...",
    "tasa_financiamiento": "...",
    "gastos_expedicion": "...",
    "subtotal": "...",
    "iva": "...",
    "prima_total": "..."
  },
  "vigencia": {
    "inicio": "...",
    "fin": "..."
  }
}"""


def extraer_con_ia(texto: str, nombre_archivo: str) -> PolizaExtraida:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return PolizaExtraida(
            archivo=nombre_archivo,
            error="ANTHROPIC_API_KEY no configurada",
            metodo_extraccion="ai_fallback",
        )

    client = anthropic.Anthropic(api_key=api_key)

    # Limitar texto para no exceder tokens (primeras 6000 chars suelen contener todo)
    texto_recortado = texto[:6000]

    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=PROMPT_SISTEMA,
            messages=[
                {"role": "user", "content": f"Extrae los datos de esta póliza:\n\n{texto_recortado}"}
            ],
        )

        raw = message.content[0].text.strip()
        # Limpiar posibles bloques markdown
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        datos = json.loads(raw)

        vehiculo = datos.get("vehiculo") or {}
        direccion = datos.get("direccion") or {}
        primas = datos.get("primas") or {}
        vigencia = datos.get("vigencia") or {}

        return PolizaExtraida(
            archivo=nombre_archivo,
            compania=datos.get("compania"),
            ramo=datos.get("ramo"),
            numero_poliza=datos.get("numero_poliza"),
            nombre_cliente=datos.get("nombre_cliente"),
            rfc=datos.get("rfc"),
            forma_pago=datos.get("forma_pago"),
            moneda=datos.get("moneda"),
            vehiculo=VehiculoData(**vehiculo) if vehiculo else None,
            direccion=DireccionData(**direccion) if direccion else None,
            primas=PrimasData(**primas) if primas else None,
            vigencia=VigenciaData(**vigencia) if vigencia else None,
            metodo_extraccion="ai_claude",
        )

    except json.JSONDecodeError as e:
        return PolizaExtraida(
            archivo=nombre_archivo,
            error=f"Error al parsear respuesta de IA: {e}",
            metodo_extraccion="ai_claude",
        )
    except Exception as e:
        return PolizaExtraida(
            archivo=nombre_archivo,
            error=f"Error en extracción IA: {e}",
            metodo_extraccion="ai_claude",
        )
