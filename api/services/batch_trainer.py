"""
Servicio de entrenamiento por lotes:
- Genera regex usando ejemplos de múltiples PDFs
- Prueba el regex contra todos los PDFs del lote
"""
import os
import re
import json
import anthropic
from sqlalchemy.orm import Session

from ..models.db_models import PolizaEntrenamiento, ReglaExtraccion, Subramo, Ramo, Compania
from .rule_engine import _aplicar_patron


# ── Helpers ──────────────────────────────────────────────────────────────────

def _jerarquia(subramo_id: int, db: Session) -> tuple[str, str, str]:
    row = (
        db.query(Subramo, Ramo, Compania)
        .join(Ramo, Subramo.ramo_id == Ramo.id)
        .join(Compania, Ramo.compania_id == Compania.id)
        .filter(Subramo.id == subramo_id)
        .first()
    )
    if not row:
        return "?", "?", "?"
    return row.Compania.nombre, row.Ramo.nombre, row.Subramo.nombre


def probar_regex_en_lote(
    patron: str,
    polizas: list[PolizaEntrenamiento],
) -> list[dict]:
    """Prueba un regex contra todos los textos del lote. Retorna lista de resultados."""
    resultados = []
    for p in polizas:
        if not p.texto_pdf:
            resultados.append({
                "poliza_id": p.id,
                "nombre_archivo": p.nombre_archivo,
                "encontrado": False,
                "valor_extraido": None,
                "error": "Sin texto extraído",
            })
            continue
        valor = _aplicar_patron(patron, p.texto_pdf)
        resultados.append({
            "poliza_id": p.id,
            "nombre_archivo": p.nombre_archivo,
            "encontrado": valor is not None,
            "valor_extraido": valor,
            "error": None,
        })
    return resultados


def auto_detectar_en_lote(
    texto_seleccionado: str,
    polizas: list[PolizaEntrenamiento],
    poliza_origen_id: int,
) -> list[dict]:
    """
    Búsqueda rápida del mismo texto (literal) en las demás pólizas.
    Retorna lista de {poliza_id, texto_encontrado, contexto, encontrado}.
    """
    resultados = []
    texto_lower = texto_seleccionado.lower()
    CTX = 300

    for p in polizas:
        if p.id == poliza_origen_id or not p.texto_pdf:
            continue
        idx = p.texto_pdf.lower().find(texto_lower)
        if idx != -1:
            valor = p.texto_pdf[idx: idx + len(texto_seleccionado)]
            start = max(0, idx - CTX)
            end = min(len(p.texto_pdf), idx + len(texto_seleccionado) + CTX)
            resultados.append({
                "poliza_id": p.id,
                "nombre_archivo": p.nombre_archivo,
                "encontrado": True,
                "texto_encontrado": valor,
                "contexto": p.texto_pdf[start:end],
            })
        else:
            resultados.append({
                "poliza_id": p.id,
                "nombre_archivo": p.nombre_archivo,
                "encontrado": False,
                "texto_encontrado": None,
                "contexto": None,
            })
    return resultados


# ── Generación de regex por lote ─────────────────────────────────────────────

def generar_regex_lote(
    subramo_id: int,
    nombre_campo: str,
    campo_label: str,
    selecciones: list[dict],   # [{poliza_id, nombre_archivo, texto_seleccionado, contexto}]
    polizas: list[PolizaEntrenamiento],
    db: Session,
) -> dict:
    """
    Genera un regex usando Claude con todos los ejemplos del lote y
    lo prueba contra todos los PDFs. Retorna resultado completo.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY no configurada")

    compania, ramo, subramo = _jerarquia(subramo_id, db)

    # Construir prompt con todos los ejemplos
    ejemplos_str = ""
    for i, sel in enumerate(selecciones, 1):
        ejemplos_str += f"""
[Póliza {i} — {sel['nombre_archivo']}]
Valor exacto: "{sel['texto_seleccionado']}"
Contexto:
{sel.get('contexto', '')[:600]}
"""

    prompt = f"""Eres un experto en pólizas de seguros mexicanas y expresiones regulares Python (módulo `re`).

Contexto del módulo:
- Compañía: {compania}  |  Ramo: {ramo}  |  Subramo: {subramo}
- Campo a extraer: "{nombre_campo}"  (etiqueta: "{campo_label}")

El usuario seleccionó el valor de este campo en {len(selecciones)} pólizas diferentes del mismo subramo:
{ejemplos_str}

Genera un patrón regex Python (re.search con re.IGNORECASE | re.MULTILINE) que:
1. Capture el valor en el GRUPO 1 — ese es el dato que se extrae.
2. Use texto ANTES del valor como ancla (label o separador), ej: r"N[uú]mero de P[oó]liza[:\\s:]+([A-Z0-9\\-]+)".
3. Sea robusto a variaciones de espaciado, puntuación y mayúsculas.
4. Funcione en TODAS las pólizas mostradas.
5. Sea específico para no confundirse con otros campos del PDF.
6. Maneja variaciones de acentos/tildes con clases de caracteres cuando aplique.

Responde SOLO con JSON válido, sin markdown:
{{
  "patron_regex": "...",
  "explicacion": "...",
  "confianza": 0.0
}}"""

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = message.content[0].text.strip()

    # Parse JSON
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        import re as re_mod
        m = re_mod.search(r'\{.*\}', raw, re_mod.DOTALL)
        if not m:
            raise ValueError(f"Claude no devolvió JSON válido: {raw[:200]}")
        data = json.loads(m.group(0))

    patron = data.get("patron_regex", "")
    if not patron:
        raise ValueError("Claude no devolvió patron_regex")

    # Probar contra todo el lote
    matches = probar_regex_en_lote(patron, polizas)
    encontrados = sum(1 for m in matches if m["encontrado"])

    return {
        "patron_regex": patron,
        "explicacion": data.get("explicacion", ""),
        "confianza": float(data.get("confianza", 0.9)),
        "matches": matches,
        "cobertura": encontrados,
        "total": len(polizas),
        "pasa_lote": encontrados == len(polizas),
    }
