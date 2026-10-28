"""
Servicio de entrenamiento por lotes:
- Genera regex usando ejemplos de múltiples PDFs
- Prueba el regex contra todos los PDFs del lote
"""
from __future__ import annotations
import os
import re
import json
import anthropic
from sqlalchemy.orm import Session

from ..config import MODEL_BATCH_TRAINER
from ..models.db_models import PolizaEntrenamiento, ReglaExtraccion, Subramo, Ramo, Compania
from .rule_engine import _aplicar_patron
from .ai_utils import ClienteMedido


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
    esperados: dict[int, str] | None = None,   # {poliza_id: valor confirmado por el usuario}
) -> list[dict]:
    """
    Prueba un regex contra todos los textos del lote. Si hay valor esperado (seleccionado a mano
    o confirmado) en una póliza, "coincide" dice si el regex extrae ESO, no solo si encuentra algo.
    """
    esperados = esperados or {}
    resultados = []
    for p in polizas:
        esperado = esperados.get(p.id)
        valor = _aplicar_patron(patron, p.texto_pdf) if p.texto_pdf else None
        resultados.append({
            "poliza_id": p.id,
            "nombre_archivo": p.nombre_archivo,
            "encontrado": valor is not None,
            "valor_extraido": valor,
            "valor_esperado": esperado,
            "coincide": None if esperado is None else (valor is not None and _norm(valor) == _norm(esperado)),
            "error": None if p.texto_pdf else "Sin texto extraído",
        })
    return resultados


def cobertura_lote(matches: list[dict]) -> int:
    """Pólizas donde el regex sirve: encuentra el valor y, si hay uno esperado, es el mismo."""
    return sum(1 for m in matches if m["encontrado"] and m["coincide"] is not False)


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


MAX_EJEMPLOS_IA = 6   # ejemplos que se mandan a la IA; el regex se prueba SIEMPRE contra todo el lote


def _norm(s: str | None) -> str:
    return re.sub(r"\s+", " ", s or "").strip().lower()


def _coincide_todos(patron: str, polizas: list[PolizaEntrenamiento], ejemplos: list[dict]) -> bool:
    """El regex extrae, en cada póliza con ejemplo, exactamente el valor que se seleccionó."""
    por_id = {p.id: p for p in polizas}
    for e in ejemplos:
        p = por_id.get(e["poliza_id"])
        if not p or not p.texto_pdf:
            return False
        v = _aplicar_patron(patron, p.texto_pdf)
        if v is None or _norm(v) != _norm(e["texto_seleccionado"]):
            return False
    return True


def _reglas_existentes(subramo_id: int, nombre_campo: str, db: Session) -> list[str]:
    """Regex ya guardados para este campo en la misma compañía (primero los del mismo subramo)."""
    sub = db.get(Subramo, subramo_id)
    ramo = db.get(Ramo, sub.ramo_id) if sub else None
    if not ramo:
        return []
    filas = (
        db.query(ReglaExtraccion.patron_regex, ReglaExtraccion.subramo_id)
        .join(Subramo, Subramo.id == ReglaExtraccion.subramo_id)
        .join(Ramo, Ramo.id == Subramo.ramo_id)
        .filter(
            ReglaExtraccion.nombre_campo == nombre_campo,
            ReglaExtraccion.activo == True,  # noqa: E712
            ReglaExtraccion.es_borrador == False,  # noqa: E712
            Ramo.compania_id == ramo.compania_id,
        )
        .all()
    )
    filas.sort(key=lambda f: f[1] != subramo_id)
    return list(dict.fromkeys(f[0] for f in filas))


def _regex_heuristico(ejemplos: list[dict], polizas: list[PolizaEntrenamiento]) -> str | None:
    """
    Regex sin IA para valores con etiqueta delante en la misma línea ("No. de Póliza:005673294"):
    ancla = el sufijo de texto común antes del valor en todos los ejemplos; clase del valor =
    dígitos / mayúsculas+dígitos / token sin espacios. Texto libre o sin ancla común -> None
    (lo resuelve la IA).
    """
    por_id = {p.id: p for p in polizas}
    antes, valores = [], []
    for e in ejemplos:
        p = por_id.get(e["poliza_id"])
        v = (e["texto_seleccionado"] or "").strip()
        i = (p.texto_pdf or "").lower().find(v.lower()) if p and v else -1
        if i < 0:
            return None
        t = p.texto_pdf
        antes.append(t[t.rfind("\n", 0, i) + 1: i][-40:])
        valores.append(v)

    suf = antes[0]
    for a in antes[1:]:
        k = 0
        while k < min(len(suf), len(a)) and suf[-1 - k].lower() == a[-1 - k].lower():
            k += 1
        suf = suf[len(suf) - k:]
    años = list(re.finditer(r"(?:19|20)\d{2}", suf))
    if años:   # un año en el ancla es resto del valor anterior (cambia cada póliza): se corta ahí
        suf = suf[años[-1].end():].lstrip(" /-")
    suf = suf.strip()
    if len(re.sub(r"[^A-Za-zÁÉÍÓÚÑáéíóúñ]", "", suf)) < 3:
        return None
    ancla = re.escape(suf).replace(r"\ ", r"\s*")

    if all(re.fullmatch(r"\d+", v) for v in valores):
        largos = {len(v) for v in valores}
        clase = rf"(\d{{{largos.pop()}}})" if len(largos) == 1 else r"(\d+)"
    elif all(re.fullmatch(r"[A-Z0-9&Ñ]+", v) for v in valores):
        clase = r"([A-Z0-9&Ñ]+)"
    elif all(re.fullmatch(r"[\w\-/\.]+", v) for v in valores):
        clase = r"([\w\-/\.]+)"
    else:
        return None
    return rf"{ancla}\s*{clase}"


def _subconjunto(ejemplos: list[dict], maximo: int) -> list[dict]:
    """Hasta `maximo` ejemplos variados: uno por cada forma distinta de la línea previa al valor."""
    vistos, elegidos, resto = set(), [], []
    for e in ejemplos:
        ctx, v = e.get("contexto") or "", (e["texto_seleccionado"] or "").lower()
        i = ctx.lower().find(v)
        forma = _norm(ctx[max(0, i - 20): i]) if i >= 0 else ""
        if forma in vistos or len(elegidos) >= maximo:
            resto.append(e)
        else:
            vistos.add(forma)
            elegidos.append(e)
    return elegidos + resto[: max(0, maximo - len(elegidos))]


def _pedir_regex_ia(compania, ramo, subramo, nombre_campo, campo_label, ejemplos: list[dict], api_key: str) -> dict:
    ejemplos_str = ""
    for i, sel in enumerate(ejemplos, 1):
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

El usuario seleccionó el valor de este campo en {len(ejemplos)} pólizas diferentes del mismo subramo:
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

    client = ClienteMedido(anthropic.Anthropic(api_key=api_key), "regex_lote")
    message = client.messages.create(
        model=MODEL_BATCH_TRAINER,
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = message.content[0].text.strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        if not m:
            raise ValueError(f"Claude no devolvió JSON válido: {raw[:200]}")
        data = json.loads(m.group(0))
    if not data.get("patron_regex"):
        raise ValueError("Claude no devolvió patron_regex")
    return data


def generar_regex_lote(
    subramo_id: int,
    nombre_campo: str,
    campo_label: str,
    selecciones: list[dict],   # [{poliza_id, nombre_archivo, texto_seleccionado, contexto}]
    polizas: list[PolizaEntrenamiento],
    db: Session,
    poliza_ids: list[int] | None = None,   # ejemplos a usar (None = todos los del campo)
) -> dict:
    """
    Regex para el campo, probado SIEMPRE contra todo el lote. Orden de menor a mayor costo:
    1) una regla ya guardada que funcione, 2) heurística local, 3) IA con hasta
    MAX_EJEMPLOS_IA ejemplos variados y, si el regex falla en ejemplos no mandados,
    un único reintento que los agrega. `origen` indica cuál se usó.
    """
    ejemplos = [s for s in selecciones if not poliza_ids or s["poliza_id"] in poliza_ids]
    if not ejemplos:
        raise ValueError("No hay ejemplos seleccionados para generar el regex")

    def armar(patron: str, explicacion: str, confianza: float, origen: str, usados: int, llamadas: int) -> dict:
        esperados = {e["poliza_id"]: e["texto_seleccionado"] for e in ejemplos if not e.get("es_auto")}
        matches = probar_regex_en_lote(patron, polizas, esperados)
        encontrados = cobertura_lote(matches)
        return {
            "patron_regex": patron,
            "explicacion": explicacion,
            "confianza": confianza,
            "matches": matches,
            "cobertura": encontrados,
            "total": len(polizas),
            "pasa_lote": encontrados == len(polizas),
            "origen": origen,
            "ejemplos_usados": usados,
            "ejemplos_total": len(ejemplos),
            "llamadas_ia": llamadas,
        }

    for patron in _reglas_existentes(subramo_id, nombre_campo, db):
        if _coincide_todos(patron, polizas, ejemplos):
            return armar(patron, "Regla ya guardada para este campo que funciona en todos los ejemplos.", 1.0, "regla_existente", 0, 0)

    heuristico = _regex_heuristico(ejemplos, polizas)
    if heuristico and _coincide_todos(heuristico, polizas, ejemplos):
        return armar(heuristico, "Ancla de texto común + formato del valor, calculados sin IA.", 0.85, "heuristica", 0, 0)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY no configurada")
    compania, ramo, subramo = _jerarquia(subramo_id, db)

    usados = _subconjunto(ejemplos, MAX_EJEMPLOS_IA)
    llamadas = 0
    for _ in range(2):
        data = _pedir_regex_ia(compania, ramo, subramo, nombre_campo, campo_label, usados, api_key)
        llamadas += 1
        patron = data["patron_regex"]
        if _coincide_todos(patron, polizas, ejemplos):
            break
        no_enviados = [e for e in ejemplos if e not in usados and not _coincide_todos(patron, polizas, [e])]
        if not no_enviados:
            break   # falló en sus propios ejemplos: otro intento igual no ayuda
        usados = usados + no_enviados[:MAX_EJEMPLOS_IA]
    return armar(patron, data.get("explicacion", ""), float(data.get("confianza", 0.9)), "ia", len(usados), llamadas)
