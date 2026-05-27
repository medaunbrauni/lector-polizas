"""
Router del Clasificador de PDFs.
Gestiona: upload a carpeta local, cola de revisión, confirmación,
aprobación de patrones y envío a entrenamiento.
"""
import hashlib
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import MAX_FILE_MB, UPLOAD_FOLDER
from ..database import get_db
from ..models.db_models import ClasificacionCola, Compania, Ramo, Subramo
from ..services.clasificador_service import (
    dedup_carpeta,
    enviar_a_entrenamiento,
    extraer_texto_pdf,
    guardar_patrones_aprobados,
    procesar_pdf,
    sha256_bytes,
)
from ..services.folder_watcher import estado_watcher

router = APIRouter(prefix="/clasificador", tags=["Clasificador"])

MAX_SIZE = MAX_FILE_MB * 1024 * 1024


# ── Schema helper ─────────────────────────────────────────────────────────────

def _item_schema(item: ClasificacionCola, db: Session) -> dict:
    def _nombre(modelo, id_val):
        if not id_val:
            return None
        obj = db.get(modelo, id_val)
        return obj.nombre if obj else None

    return {
        "id":               item.id,
        "nombre_archivo":   item.nombre_archivo,
        "paginas":          item.paginas,
        "estado":           item.estado,
        "error_msg":        item.error_msg,
        "confianza":        item.confianza,
        "metodo":           item.metodo,
        "razon_ia":         item.razon_ia,
        "es_compania_nueva": item.es_compania_nueva,
        "compania_nombre_ia": item.compania_nombre_ia,
        "ramo_nombre_ia":   item.ramo_nombre_ia,
        "subramo_nombre_ia": item.subramo_nombre_ia,
        # Propuesta
        "compania_id_prop":  item.compania_id_prop,
        "compania_prop":     _nombre(Compania, item.compania_id_prop),
        "ramo_id_prop":      item.ramo_id_prop,
        "ramo_prop":         _nombre(Ramo, item.ramo_id_prop),
        "subramo_id_prop":   item.subramo_id_prop,
        "subramo_prop":      _nombre(Subramo, item.subramo_id_prop),
        # Final
        "compania_id_final": item.compania_id_final,
        "compania_final":    _nombre(Compania, item.compania_id_final),
        "ramo_id_final":     item.ramo_id_final,
        "ramo_final":        _nombre(Ramo, item.ramo_id_final),
        "subramo_id_final":  item.subramo_id_final,
        "subramo_final":     _nombre(Subramo, item.subramo_id_final),
        # Patrones
        "patrones_generados": item.patrones_generados,
        "patrones_guardados": item.patrones_guardados,
        "poliza_entrenamiento_id": item.poliza_entrenamiento_id,
        "created_at":        item.created_at.isoformat() if item.created_at else None,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_pdfs(
    archivos: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    """
    Recibe uno o más PDFs, los guarda en UPLOAD_FOLDER y ejecuta
    el pipeline de clasificación (detector + IA si es necesario).
    """
    resultados = []
    for archivo in archivos:
        nombre_original = archivo.filename or "sin_nombre.pdf"

        if not nombre_original.lower().endswith(".pdf"):
            resultados.append({"archivo": nombre_original, "error": "No es un PDF"})
            continue

        contenido = await archivo.read()
        if len(contenido) > MAX_SIZE:
            resultados.append({
                "archivo": nombre_original,
                "error": f"Supera el límite de {MAX_FILE_MB} MB",
            })
            continue

        # ── Dedup temprana por SHA-256 ────────────────────────────────────────
        sha = sha256_bytes(contenido)
        existente = db.query(ClasificacionCola).filter(ClasificacionCola.sha256 == sha).first()
        if existente:
            resultados.append({
                "archivo": nombre_original,
                "advertencia": "Ya existe en la cola",
                "item": _item_schema(existente, db),
            })
            continue

        # ── Guardar en carpeta de entrada ────────────────────────────────────
        dest = Path(UPLOAD_FOLDER) / nombre_original
        if dest.exists():
            stem = Path(nombre_original).stem
            ext  = Path(nombre_original).suffix
            dest = Path(UPLOAD_FOLDER) / f"{stem}_{uuid.uuid4().hex[:6]}{ext}"

        dest.write_bytes(contenido)

        # ── Dedup carpeta: eliminar si ya existe un archivo con mismo contenido ──
        eliminados = dedup_carpeta(UPLOAD_FOLDER)
        if dest.name in eliminados:
            # El archivo que acabamos de escribir fue eliminado porque ya existía
            # uno anterior idéntico. Buscamos ese original en la cola.
            existente = db.query(ClasificacionCola).filter(ClasificacionCola.sha256 == sha).first()
            resultados.append({
                "archivo": nombre_original,
                "advertencia": "Duplicado eliminado — ya existía en la carpeta",
                "item": _item_schema(existente, db) if existente else None,
            })
            continue

        # ── Extraer texto ────────────────────────────────────────────────────
        try:
            texto, paginas = extraer_texto_pdf(str(dest))
        except Exception as exc:
            dest.unlink(missing_ok=True)
            resultados.append({"archivo": nombre_original, "error": f"No se pudo leer el PDF: {exc}"})
            continue

        # ── Crear item en cola ───────────────────────────────────────────────
        item = ClasificacionCola(
            nombre_archivo=dest.name,
            ruta_archivo=str(dest),
            sha256=sha,
            texto_pdf=texto,
            paginas=paginas,
            estado="pendiente",
        )
        db.add(item)
        db.flush()

        # ── Clasificar ───────────────────────────────────────────────────────
        procesar_pdf(item, db)
        db.commit()
        db.refresh(item)

        resultados.append({"archivo": nombre_original, "item": _item_schema(item, db)})

    return resultados


@router.get("/cola")
def get_cola(
    estado: str | None = None,
    db: Session = Depends(get_db),
):
    """Lista todos los items de la cola, opcionalmente filtrados por estado."""
    q = db.query(ClasificacionCola).order_by(ClasificacionCola.created_at.desc())
    if estado:
        q = q.filter(ClasificacionCola.estado == estado)
    items = q.limit(300).all()
    return [_item_schema(i, db) for i in items]


@router.get("/cola/{id}")
def get_item(id: int, db: Session = Depends(get_db)):
    item = db.get(ClasificacionCola, id)
    if not item:
        raise HTTPException(404, "No encontrado")
    return _item_schema(item, db)


@router.get("/info")
def get_info():
    """Información del clasificador: carpeta y estado del watcher."""
    return {
        "carpeta": UPLOAD_FOLDER,
        "watcher": estado_watcher(),
    }


@router.post("/dedup")
def dedup_manual():
    """
    Escanea la carpeta de entrada y elimina PDFs duplicados (mismo contenido).
    Conserva el archivo más antiguo de cada grupo.
    """
    eliminados = dedup_carpeta(UPLOAD_FOLDER)
    return {"eliminados": eliminados, "total": len(eliminados)}


# ── Confirmar ─────────────────────────────────────────────────────────────────

class ConfirmarIn(BaseModel):
    compania_id: int | None = None
    ramo_id:     int | None = None
    subramo_id:  int | None = None
    enviar_entrenamiento: bool = True


@router.post("/cola/{id}/confirmar")
def confirmar_item(id: int, data: ConfirmarIn, db: Session = Depends(get_db)):
    """
    Confirma (con override opcional) la clasificación de un item y,
    si enviar_entrenamiento=True, lo mueve a polizas_entrenamiento.
    """
    item = db.get(ClasificacionCola, id)
    if not item:
        raise HTTPException(404, "No encontrado")
    if item.estado in ("enviado",):
        raise HTTPException(400, "El item ya fue enviado a entrenamiento")

    # Aplicar override o conservar propuesta
    item.compania_id_final = data.compania_id or item.compania_id_prop
    item.ramo_id_final     = data.ramo_id     or item.ramo_id_prop
    item.subramo_id_final  = data.subramo_id  or item.subramo_id_prop

    if not item.subramo_id_final:
        raise HTTPException(400, "Se requiere subramo para confirmar")

    item.estado = "confirmado"

    if data.enviar_entrenamiento:
        try:
            pol = enviar_a_entrenamiento(item, db)
            item.poliza_entrenamiento_id = pol.id
            item.estado = "enviado"
        except Exception as exc:
            raise HTTPException(500, f"Error al enviar a entrenamiento: {exc}")

    db.commit()
    db.refresh(item)
    return _item_schema(item, db)


# ── Patrones ──────────────────────────────────────────────────────────────────

class PatronesAprobarIn(BaseModel):
    compania: list[str] = []
    ramo:     list[str] = []
    subramo:  list[str] = []


@router.post("/cola/{id}/patrones/aprobar")
def aprobar_patrones(id: int, data: PatronesAprobarIn, db: Session = Depends(get_db)):
    """Guarda los patrones seleccionados en Compania/Ramo/Subramo.patrones_deteccion."""
    item = db.get(ClasificacionCola, id)
    if not item:
        raise HTTPException(404, "No encontrado")
    guardar_patrones_aprobados(item, data.model_dump(), db)
    db.commit()
    return {"ok": True, "guardados": data.model_dump()}


# ── Lote ──────────────────────────────────────────────────────────────────────

@router.post("/cola/confirmar-lote")
def confirmar_lote(db: Session = Depends(get_db)):
    """Confirma y envía a entrenamiento todos los items 'clasificado' con confianza 'alta'."""
    items = (
        db.query(ClasificacionCola)
        .filter(
            ClasificacionCola.estado == "clasificado",
            ClasificacionCola.confianza == "alta",
            ClasificacionCola.subramo_id_prop.isnot(None),
        )
        .all()
    )
    confirmados, errores = 0, []
    for item in items:
        try:
            item.compania_id_final = item.compania_id_prop
            item.ramo_id_final     = item.ramo_id_prop
            item.subramo_id_final  = item.subramo_id_prop
            pol = enviar_a_entrenamiento(item, db)
            item.poliza_entrenamiento_id = pol.id
            item.estado = "enviado"
            confirmados += 1
        except Exception as exc:
            errores.append({"id": item.id, "error": str(exc)})
    db.commit()
    return {"confirmados": confirmados, "errores": errores}


# ── Descartar ─────────────────────────────────────────────────────────────────

@router.delete("/cola/{id}")
def descartar_item(id: int, db: Session = Depends(get_db)):
    item = db.get(ClasificacionCola, id)
    if not item:
        raise HTTPException(404, "No encontrado")
    db.delete(item)
    db.commit()
    return {"ok": True}
