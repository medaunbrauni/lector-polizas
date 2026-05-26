"""
Router de entrenamiento por lotes.
Gestiona: PDFs de entrenamiento, selecciones de campo, generación y prueba de regex.
"""
import io
import os
import uuid
from pathlib import Path

import base64
import pdfplumber
import pypdfium2
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..config import PDF_ENTRENAMIENTO_DIR
from ..models.db_models import (
    PolizaEntrenamiento, SeleccionCampo, ReglaExtraccion,
    Subramo, CampoDefinido, CampoGlobal,
)
from ..services.batch_trainer import (
    generar_regex_lote, probar_regex_en_lote, auto_detectar_en_lote,
)
from ..services.rule_engine import _aplicar_patron

router = APIRouter(prefix="/entrenamiento", tags=["Entrenamiento por lotes"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class SeleccionIn(BaseModel):
    poliza_id: int
    nombre_campo: str
    texto_seleccionado: str
    contexto: str | None = None
    bbox: dict | None = None
    es_auto: bool = False


class GenerarRegexIn(BaseModel):
    nombre_campo: str
    campo_label: str


class ProbarRegexIn(BaseModel):
    nombre_campo: str
    patron_regex: str


class GuardarReglaIn(BaseModel):
    nombre_campo: str
    patron_regex: str
    cobertura_lote: int
    total_lote: int
    bbox: dict | None = None
    ocr_bbox: dict | None = None
    confianza: float = 0.9


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extraer_texto_pdf(contenido: bytes) -> tuple[str, int]:
    """Retorna (texto, num_paginas)."""
    paginas = []
    with pdfplumber.open(io.BytesIO(contenido)) as pdf:
        n = len(pdf.pages)
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                paginas.append(t)
    return "\n".join(paginas), n


def _poliza_dict(p: PolizaEntrenamiento, db: Session) -> dict:
    num_sel = db.query(SeleccionCampo).filter(SeleccionCampo.poliza_id == p.id).count()
    return {
        "id": p.id,
        "subramo_id": p.subramo_id,
        "nombre_archivo": p.nombre_archivo,
        "paginas": p.paginas,
        "num_selecciones": num_sel,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _sel_dict(s: SeleccionCampo) -> dict:
    return {
        "id": s.id,
        "poliza_id": s.poliza_id,
        "nombre_campo": s.nombre_campo,
        "texto_seleccionado": s.texto_seleccionado,
        "contexto": s.contexto,
        "bbox": s.bbox,
        "es_auto": s.es_auto,
    }


# ── PDFs del lote ─────────────────────────────────────────────────────────────

@router.post("/subramos/{subramo_id}/polizas")
async def subir_polizas(
    subramo_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    """Sube uno o más PDFs al lote de entrenamiento de un subramo."""
    subramo = db.query(Subramo).filter(Subramo.id == subramo_id).first()
    if not subramo:
        raise HTTPException(404, "Subramo no encontrado")

    # Directorio destino por subramo
    dest_dir = Path(PDF_ENTRENAMIENTO_DIR) / str(subramo_id)
    dest_dir.mkdir(parents=True, exist_ok=True)

    creados = []
    for upload in files:
        contenido = await upload.read()
        if not contenido:
            continue

        # Nombre único en disco
        ext = Path(upload.filename or "poliza.pdf").suffix or ".pdf"
        nombre_disco = f"{uuid.uuid4().hex}{ext}"
        ruta = dest_dir / nombre_disco
        ruta.write_bytes(contenido)

        # Extraer texto
        try:
            texto, paginas = _extraer_texto_pdf(contenido)
        except Exception:
            texto, paginas = "", 0

        poliza = PolizaEntrenamiento(
            subramo_id=subramo_id,
            nombre_archivo=upload.filename or nombre_disco,
            ruta_archivo=str(ruta),
            texto_pdf=texto[:80_000],
            paginas=paginas,
        )
        db.add(poliza)
        db.flush()
        creados.append(_poliza_dict(poliza, db))

    db.commit()
    return creados


@router.get("/subramos/{subramo_id}/polizas")
def listar_polizas(subramo_id: int, db: Session = Depends(get_db)):
    polizas = (
        db.query(PolizaEntrenamiento)
        .filter(PolizaEntrenamiento.subramo_id == subramo_id)
        .order_by(PolizaEntrenamiento.created_at)
        .all()
    )
    return [_poliza_dict(p, db) for p in polizas]


@router.get("/polizas/{poliza_id}/pdf")
def servir_pdf(poliza_id: int, db: Session = Depends(get_db)):
    """Sirve el PDF como archivo para renderizarlo en el frontend."""
    p = db.query(PolizaEntrenamiento).filter(PolizaEntrenamiento.id == poliza_id).first()
    if not p:
        raise HTTPException(404)
    if not os.path.exists(p.ruta_archivo):
        raise HTTPException(404, "Archivo no encontrado en disco")
    return FileResponse(
        p.ruta_archivo,
        media_type="application/pdf",
        filename=p.nombre_archivo,
    )


@router.delete("/polizas/{poliza_id}")
def eliminar_poliza(poliza_id: int, db: Session = Depends(get_db)):
    p = db.query(PolizaEntrenamiento).filter(PolizaEntrenamiento.id == poliza_id).first()
    if not p:
        raise HTTPException(404)
    # Borrar archivo del disco
    try:
        if os.path.exists(p.ruta_archivo):
            os.remove(p.ruta_archivo)
    except Exception:
        pass
    db.delete(p)
    db.commit()
    return {"ok": True}


# ── Selecciones de campo ──────────────────────────────────────────────────────

@router.post("/selecciones")
def guardar_seleccion(data: SeleccionIn, db: Session = Depends(get_db)):
    """
    Guarda (o actualiza) la selección de un campo en un PDF.
    Si ya existe selección para ese campo+poliza, la reemplaza.
    Tras guardar, auto-detecta el mismo texto en las demás pólizas del lote.
    """
    p = db.query(PolizaEntrenamiento).filter(PolizaEntrenamiento.id == data.poliza_id).first()
    if not p:
        raise HTTPException(404, "Póliza no encontrada")

    # Auto-calcular contexto desde el texto extraído del PDF
    contexto = data.contexto
    if p.texto_pdf and data.texto_seleccionado:
        CTX = 350
        texto = p.texto_pdf
        idx = texto.lower().find(data.texto_seleccionado.lower())
        if idx != -1:
            start = max(0, idx - CTX)
            end = min(len(texto), idx + len(data.texto_seleccionado) + CTX)
            contexto = texto[start:end]
        else:
            # No se encontró literal: dar el texto seleccionado como mínimo contexto
            contexto = data.texto_seleccionado

    # Upsert
    existente = (
        db.query(SeleccionCampo)
        .filter(
            SeleccionCampo.poliza_id == data.poliza_id,
            SeleccionCampo.nombre_campo == data.nombre_campo,
        )
        .first()
    )
    if existente:
        existente.texto_seleccionado = data.texto_seleccionado
        existente.contexto = contexto
        existente.bbox = data.bbox
        existente.es_auto = data.es_auto
        sel = existente
    else:
        sel = SeleccionCampo(
            poliza_id=data.poliza_id,
            nombre_campo=data.nombre_campo,
            texto_seleccionado=data.texto_seleccionado,
            contexto=contexto,
            bbox=data.bbox,
            es_auto=data.es_auto,
        )
        db.add(sel)

    db.commit()
    db.refresh(sel)

    # Auto-detectar en las otras pólizas del mismo lote
    otras_polizas = (
        db.query(PolizaEntrenamiento)
        .filter(
            PolizaEntrenamiento.subramo_id == p.subramo_id,
            PolizaEntrenamiento.id != p.id,
        )
        .all()
    )
    auto_resultados = auto_detectar_en_lote(
        data.texto_seleccionado, otras_polizas, p.id
    )

    return {
        "seleccion": _sel_dict(sel),
        "auto_deteccion": auto_resultados,
    }


@router.get("/subramos/{subramo_id}/selecciones")
def listar_selecciones(subramo_id: int, db: Session = Depends(get_db)):
    """Retorna todas las selecciones del lote, indexadas por nombre_campo."""
    polizas = (
        db.query(PolizaEntrenamiento)
        .filter(PolizaEntrenamiento.subramo_id == subramo_id)
        .all()
    )
    poliza_ids = [p.id for p in polizas]

    selecciones = (
        db.query(SeleccionCampo)
        .filter(SeleccionCampo.poliza_id.in_(poliza_ids))
        .all()
    )

    # Indexar: {nombre_campo: {poliza_id: seleccion}}
    por_campo: dict[str, dict] = {}
    for s in selecciones:
        por_campo.setdefault(s.nombre_campo, {})[s.poliza_id] = _sel_dict(s)

    return por_campo


@router.delete("/selecciones/{sel_id}")
def eliminar_seleccion(sel_id: int, db: Session = Depends(get_db)):
    s = db.query(SeleccionCampo).filter(SeleccionCampo.id == sel_id).first()
    if not s:
        raise HTTPException(404)
    db.delete(s)
    db.commit()
    return {"ok": True}


# ── Generación y prueba de regex ──────────────────────────────────────────────

@router.post("/subramos/{subramo_id}/generar-regex")
def generar_regex(subramo_id: int, data: GenerarRegexIn, db: Session = Depends(get_db)):
    """
    Genera un regex para el campo indicado usando todos los ejemplos del lote
    y lo prueba contra todas las pólizas.
    """
    polizas = (
        db.query(PolizaEntrenamiento)
        .filter(PolizaEntrenamiento.subramo_id == subramo_id)
        .order_by(PolizaEntrenamiento.created_at)
        .all()
    )
    if not polizas:
        raise HTTPException(400, "No hay pólizas en el lote")

    poliza_ids = [p.id for p in polizas]
    selecciones_db = (
        db.query(SeleccionCampo)
        .filter(
            SeleccionCampo.poliza_id.in_(poliza_ids),
            SeleccionCampo.nombre_campo == data.nombre_campo,
            SeleccionCampo.texto_seleccionado.isnot(None),
        )
        .all()
    )
    if not selecciones_db:
        raise HTTPException(400, f"No hay selecciones para el campo '{data.nombre_campo}'")

    # Construir la lista de ejemplos para Claude
    poliza_map = {p.id: p for p in polizas}
    selecciones = [
        {
            "poliza_id": s.poliza_id,
            "nombre_archivo": poliza_map[s.poliza_id].nombre_archivo,
            "texto_seleccionado": s.texto_seleccionado,
            "contexto": s.contexto or "",
        }
        for s in selecciones_db
        if s.poliza_id in poliza_map
    ]

    resultado = generar_regex_lote(
        subramo_id=subramo_id,
        nombre_campo=data.nombre_campo,
        campo_label=data.campo_label,
        selecciones=selecciones,
        polizas=polizas,
        db=db,
    )
    return resultado


@router.post("/subramos/{subramo_id}/probar-regex")
def probar_regex(subramo_id: int, data: ProbarRegexIn, db: Session = Depends(get_db)):
    """Prueba un regex existente (editado manualmente) contra todas las pólizas del lote."""
    polizas = (
        db.query(PolizaEntrenamiento)
        .filter(PolizaEntrenamiento.subramo_id == subramo_id)
        .order_by(PolizaEntrenamiento.created_at)
        .all()
    )
    if not polizas:
        raise HTTPException(400, "No hay pólizas en el lote")

    matches = probar_regex_en_lote(data.patron_regex, polizas)
    encontrados = sum(1 for m in matches if m["encontrado"])
    return {
        "matches": matches,
        "cobertura": encontrados,
        "total": len(polizas),
        "pasa_lote": encontrados == len(polizas),
    }


# ── Guardar regla desde lote ──────────────────────────────────────────────────

@router.post("/subramos/{subramo_id}/guardar-regla")
def guardar_regla(subramo_id: int, data: GuardarReglaIn, db: Session = Depends(get_db)):
    """
    Guarda (o reemplaza) la regla activa para el campo.
    Registra cobertura del lote en la regla.
    """
    # Desactivar regla activa anterior
    db.query(ReglaExtraccion).filter(
        ReglaExtraccion.subramo_id == subramo_id,
        ReglaExtraccion.nombre_campo == data.nombre_campo,
        ReglaExtraccion.activo == True,
        ReglaExtraccion.es_borrador == False,
    ).update({"activo": False})

    regla = ReglaExtraccion(
        subramo_id=subramo_id,
        nombre_campo=data.nombre_campo,
        patron_regex=data.patron_regex,
        confianza=data.confianza,
        creado_por="lote",
        es_borrador=False,
        activo=True,
        bbox=data.bbox,
        ocr_bbox=data.ocr_bbox,
        cobertura_lote=data.cobertura_lote,
        total_lote=data.total_lote,
    )
    db.add(regla)
    db.commit()
    db.refresh(regla)
    return {"ok": True, "regla_id": regla.id}


# ── Texto extraído de una póliza ─────────────────────────────────────────────

@router.get("/polizas/{poliza_id}/texto")
def texto_poliza(poliza_id: int, db: Session = Depends(get_db)):
    """Retorna el texto extraído de una póliza de entrenamiento."""
    p = db.query(PolizaEntrenamiento).filter(PolizaEntrenamiento.id == poliza_id).first()
    if not p:
        raise HTTPException(404)
    return {"texto": p.texto_pdf or "", "paginas": p.paginas}


# ── Renderizado de página como imagen ─────────────────────────────────────────

@router.get("/polizas/{poliza_id}/pagina/{page_num}/imagen")
def imagen_pagina(poliza_id: int, page_num: int, escala: float = 2.0, db: Session = Depends(get_db)):
    """
    Renderiza una página del PDF como imagen PNG usando pypdfium2.
    page_num es 1-based. escala controla la resolución (2.0 = ~150 DPI).
    """
    p = db.query(PolizaEntrenamiento).filter(PolizaEntrenamiento.id == poliza_id).first()
    if not p:
        raise HTTPException(404)
    if not os.path.exists(p.ruta_archivo):
        raise HTTPException(404, "Archivo no encontrado en disco")

    try:
        doc = pypdfium2.PdfDocument(p.ruta_archivo)
        if page_num < 1 or page_num > len(doc):
            raise HTTPException(400, f"Página {page_num} fuera de rango (total: {len(doc)})")

        page = doc[page_num - 1]
        bitmap = page.render(scale=escala)
        pil_image = bitmap.to_pil()

        buf = io.BytesIO()
        pil_image.save(buf, format="PNG", optimize=True)
        buf.seek(0)

        return Response(
            content=buf.getvalue(),
            media_type="image/png",
            headers={
                "X-Page-Width": str(int(page.get_width() * escala)),
                "X-Page-Height": str(int(page.get_height() * escala)),
                "X-Total-Pages": str(len(doc)),
                "Access-Control-Expose-Headers": "X-Page-Width, X-Page-Height, X-Total-Pages",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error al renderizar: {e}")


# ── Estado completo del lote ──────────────────────────────────────────────────

@router.get("/subramos/{subramo_id}/estado")
def estado_lote(subramo_id: int, db: Session = Depends(get_db)):
    """
    Retorna estado completo: pólizas, selecciones y reglas activas.
    Usado para inicializar la UI de entrenamiento.
    """
    polizas = (
        db.query(PolizaEntrenamiento)
        .filter(PolizaEntrenamiento.subramo_id == subramo_id)
        .order_by(PolizaEntrenamiento.created_at)
        .all()
    )
    poliza_ids = [p.id for p in polizas]

    selecciones = {}
    if poliza_ids:
        sels = (
            db.query(SeleccionCampo)
            .filter(SeleccionCampo.poliza_id.in_(poliza_ids))
            .all()
        )
        for s in sels:
            selecciones.setdefault(s.nombre_campo, {})[s.poliza_id] = _sel_dict(s)

    reglas = (
        db.query(ReglaExtraccion)
        .filter(
            ReglaExtraccion.subramo_id == subramo_id,
            ReglaExtraccion.activo == True,
            ReglaExtraccion.es_borrador == False,
        )
        .all()
    )
    reglas_dict = {
        r.nombre_campo: {
            "id": r.id,
            "patron_regex": r.patron_regex,
            "cobertura_lote": r.cobertura_lote,
            "total_lote": r.total_lote,
            "creado_por": r.creado_por,
        }
        for r in reglas
    }

    return {
        "polizas": [_poliza_dict(p, db) for p in polizas],
        "selecciones": selecciones,
        "reglas": reglas_dict,
    }
