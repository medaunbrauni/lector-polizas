"""
Servicio de clasificación automática de PDFs.
Pipeline por archivo:
  1. SHA-256 para dedup
  2. Extraer texto (pdfplumber)
  3. Detector de jerarquía con score
  4. Si confianza < alta → Claude clasifica
  5. Generar patrones regex de detección con Claude
"""
import hashlib
import json
import re
import shutil
import uuid
from pathlib import Path
from sqlalchemy.orm import Session

from ..config import MODEL_CLASIFICADOR, PDF_ENTRENAMIENTO_DIR
from ..models.db_models import (
    ClasificacionCola, Compania, Ramo, Subramo, PolizaEntrenamiento,
)
from ..services.detector import detectar_con_score
from ..services.ai_utils import make_anthropic_client, parse_claude_json


# ── Utilidades de archivo ─────────────────────────────────────────────────────

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(ruta: str) -> str:
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def extraer_texto_pdf(ruta: str) -> tuple[str, int]:
    """Retorna (texto, n_paginas). Lanza excepción si falla."""
    import pdfplumber
    partes: list[str] = []
    with pdfplumber.open(ruta) as pdf:
        paginas = len(pdf.pages)
        for page in pdf.pages:
            t = page.extract_text() or ""
            partes.append(t)
    return "\n".join(partes).strip(), paginas


# ── Clasificación con IA ──────────────────────────────────────────────────────

def _confianza_float_a_nivel(valor: float) -> str:
    if valor >= 0.85:
        return "alta"
    if valor >= 0.60:
        return "media"
    if valor > 0:
        return "baja"
    return "sin_datos"


def clasificar_con_ia(texto: str, db: Session) -> dict:
    """
    Llama a Claude para identificar Compañía→Ramo→Subramo.
    Retorna dict con claves:
      compania_id, ramo_id, subramo_id,
      confianza (str), razon, es_nueva,
      compania_nombre_ia, ramo_nombre_ia, subramo_nombre_ia
    """
    # Construir catálogo completo para el prompt
    companias = db.query(Compania).filter(Compania.activo == True).all()
    catalogo: list[dict] = []
    for c in companias:
        ramos = db.query(Ramo).filter(Ramo.compania_id == c.id, Ramo.activo == True).all()
        for r in ramos:
            subramos = db.query(Subramo).filter(Subramo.ramo_id == r.id, Subramo.activo == True).all()
            for s in subramos:
                catalogo.append({
                    "compania_id": c.id, "compania": c.nombre,
                    "ramo_id": r.id,    "ramo":     r.nombre,
                    "subramo_id": s.id, "subramo":  s.nombre,
                })

    client = make_anthropic_client()
    prompt = f"""Eres un experto en seguros mexicanos. Clasifica este documento PDF.

Catálogo disponible en el sistema:
{json.dumps(catalogo, ensure_ascii=False, indent=2)}

Texto del PDF (primeras 2500 caracteres):
---
{texto[:2500]}
---

Reglas:
- Si identificas la compañía en el catálogo, usa sus IDs exactos.
- Si la compañía NO está en el catálogo, pon compania_id:null y es_nueva:true.
- Responde SOLO con JSON válido, sin markdown:

{{
  "compania_id": <número o null>,
  "ramo_id": <número o null>,
  "subramo_id": <número o null>,
  "confianza": <0.0-1.0>,
  "razon": "<breve explicación>",
  "es_nueva": <true/false>,
  "compania_nombre_ia": "<nombre detectado, vacío si no es nueva>",
  "ramo_nombre_ia": "<ramo si no está en catálogo>",
  "subramo_nombre_ia": "<subramo si no está en catálogo>"
}}"""

    msg = client.messages.create(
        model=MODEL_CLASIFICADOR,
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )
    result = parse_claude_json(msg.content[0].text)

    return {
        "compania_id":      result.get("compania_id"),
        "ramo_id":          result.get("ramo_id"),
        "subramo_id":       result.get("subramo_id"),
        "confianza":        _confianza_float_a_nivel(float(result.get("confianza", 0))),
        "razon":            result.get("razon", ""),
        "es_nueva":         bool(result.get("es_nueva", False)),
        "compania_nombre_ia": result.get("compania_nombre_ia", ""),
        "ramo_nombre_ia":   result.get("ramo_nombre_ia", ""),
        "subramo_nombre_ia": result.get("subramo_nombre_ia", ""),
    }


# ── Generación de patrones de detección ──────────────────────────────────────

def generar_patrones_ia(
    texto: str,
    compania: Compania,
    ramo: Ramo,
    subramo: Subramo,
) -> dict:
    """
    Genera patrones regex para detectar el tipo de póliza en el futuro.
    Retorna {compania:[...], ramo:[...], subramo:[...], explicacion:...}
    """
    client = make_anthropic_client()
    prompt = f"""Eres un experto en pólizas de seguros mexicanas y expresiones regulares Python.

Este PDF pertenece a:
  Compañía : {compania.nombre}
  Ramo     : {ramo.nombre}
  Subramo  : {subramo.nombre}

Texto del PDF (primeras 3000 caracteres):
---
{texto[:3000]}
---

Genera patrones regex Python (re.search, IGNORECASE|MULTILINE) que permitan identificar AUTOMÁTICAMENTE
este tipo de póliza en el futuro. Cada patrón debe:
• Capturar texto único de este tipo de documento (no del genérico de cualquier póliza).
• Ser válido para re.compile().

Responde SOLO con JSON válido:
{{
  "compania": ["patron1", "patron2"],
  "ramo":     ["patron1", "patron2"],
  "subramo":  ["patron1", "patron2"],
  "explicacion": "breve descripción de cada grupo"
}}"""

    msg = client.messages.create(
        model=MODEL_CLASIFICADOR,
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    result = parse_claude_json(msg.content[0].text)

    # Validar que los patrones compileen
    for nivel in ("compania", "ramo", "subramo"):
        validos = []
        for p in result.get(nivel, []):
            try:
                re.compile(p)
                validos.append(p)
            except re.error:
                pass
        result[nivel] = validos

    return result


# ── Pipeline principal ────────────────────────────────────────────────────────

def procesar_pdf(item: ClasificacionCola, db: Session) -> None:
    """
    Ejecuta el pipeline completo de clasificación sobre un item de la cola.
    Modifica item en-lugar; el caller debe hacer db.commit().
    """
    try:
        texto = item.texto_pdf or ""

        # ─ 1. Detector con score ─────────────────────────────────────────────
        det = detectar_con_score(texto, db)

        if det["confianza"] == "alta" and det["subramo_id"]:
            item.compania_id_prop = det["compania_id"]
            item.ramo_id_prop = det["ramo_id"]
            item.subramo_id_prop = det["subramo_id"]
            item.confianza = "alta"
            item.metodo = "detector"
            item.estado = "clasificado"
        else:
            # ─ 2. Claude ─────────────────────────────────────────────────────
            res = clasificar_con_ia(texto, db)
            item.compania_id_prop = res["compania_id"]
            item.ramo_id_prop = res["ramo_id"]
            item.subramo_id_prop = res["subramo_id"]
            item.confianza = res["confianza"]
            item.metodo = "ia"
            item.razon_ia = res["razon"]
            item.es_compania_nueva = res["es_nueva"]
            item.compania_nombre_ia = res["compania_nombre_ia"]
            item.ramo_nombre_ia = res["ramo_nombre_ia"]
            item.subramo_nombre_ia = res["subramo_nombre_ia"]
            item.estado = "requiere_manual" if res["es_nueva"] else "clasificado"

        # ─ 3. Generar patrones si tenemos clasificación completa ─────────────
        if item.compania_id_prop and item.ramo_id_prop and item.subramo_id_prop:
            compania = db.get(Compania, item.compania_id_prop)
            ramo = db.get(Ramo, item.ramo_id_prop)
            subramo = db.get(Subramo, item.subramo_id_prop)
            if compania and ramo and subramo:
                try:
                    item.patrones_generados = generar_patrones_ia(texto, compania, ramo, subramo)
                except Exception:
                    pass  # No bloquear si falla la generación de patrones

    except Exception as e:
        item.estado = "error"
        item.error_msg = str(e)


# ── Enviar a entrenamiento ────────────────────────────────────────────────────

def enviar_a_entrenamiento(item: ClasificacionCola, db: Session) -> PolizaEntrenamiento:
    """
    Copia el PDF a la carpeta de entrenamiento del subramo y crea el registro.
    Retorna el PolizaEntrenamiento creado (sin commit; el caller hace commit).
    """
    subramo_id = item.subramo_id_final or item.subramo_id_prop
    if not subramo_id:
        raise ValueError("Sin subramo definido — confirma primero la clasificación")

    dest_dir = Path(PDF_ENTRENAMIENTO_DIR) / str(subramo_id)
    dest_dir.mkdir(parents=True, exist_ok=True)

    dest = dest_dir / item.nombre_archivo
    if dest.exists():
        stem = Path(item.nombre_archivo).stem
        ext = Path(item.nombre_archivo).suffix
        dest = dest_dir / f"{stem}_{uuid.uuid4().hex[:6]}{ext}"

    shutil.copy2(item.ruta_archivo, dest)

    pol = PolizaEntrenamiento(
        subramo_id=subramo_id,
        nombre_archivo=dest.name,
        ruta_archivo=str(dest),
        texto_pdf=item.texto_pdf,
        paginas=item.paginas,
    )
    db.add(pol)
    db.flush()
    return pol


# ── Guardar patrones aprobados ────────────────────────────────────────────────

def guardar_patrones_aprobados(
    item: ClasificacionCola,
    aprobados: dict,          # {compania:[...], ramo:[...], subramo:[...]}
    db: Session,
) -> None:
    """
    Añade los patrones aprobados a patrones_deteccion de Compania/Ramo/Subramo
    (sin duplicar) y marca item.patrones_guardados = True.
    """
    compania_id = item.compania_id_final or item.compania_id_prop
    ramo_id     = item.ramo_id_final     or item.ramo_id_prop
    subramo_id  = item.subramo_id_final  or item.subramo_id_prop

    def _merge(obj, nuevos: list[str]) -> None:
        existentes = set(obj.patrones_deteccion or [])
        obj.patrones_deteccion = list(existentes) + [p for p in nuevos if p not in existentes]

    if compania_id and aprobados.get("compania"):
        c = db.get(Compania, compania_id)
        if c:
            _merge(c, aprobados["compania"])

    if ramo_id and aprobados.get("ramo"):
        r = db.get(Ramo, ramo_id)
        if r:
            _merge(r, aprobados["ramo"])

    if subramo_id and aprobados.get("subramo"):
        s = db.get(Subramo, subramo_id)
        if s:
            _merge(s, aprobados["subramo"])

    item.patrones_guardados = True
