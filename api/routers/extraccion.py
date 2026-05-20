from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..services.extractor import procesar_pdf, extraer_texto_pdf
from ..services.detector import detectar_jerarquia
from ..models.db_models import Extraccion

router = APIRouter(prefix="/extraer", tags=["Extracción"])


@router.post("")
async def extraer_polizas(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(400, "Se requiere al menos un archivo PDF")

    resultados = []
    for archivo in files:
        if not archivo.filename or not archivo.filename.lower().endswith(".pdf"):
            resultados.append({
                "archivo": archivo.filename or "desconocido",
                "error": "Solo se aceptan archivos PDF",
            })
            continue
        contenido = await archivo.read()
        resultado = procesar_pdf(contenido, archivo.filename, db)
        resultados.append(resultado)

    return {"success": True, "data": resultados}


@router.post("/identificar-modulo")
async def identificar_modulo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Detecta compañía, ramo y subramo de un PDF sin guardar extracción."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Solo se aceptan archivos PDF")
    contenido = await file.read()
    try:
        texto = extraer_texto_pdf(contenido)
    except Exception as e:
        raise HTTPException(422, f"No se pudo leer el PDF: {e}")
    if not texto.strip():
        raise HTTPException(422, "PDF sin texto extraíble (posiblemente escaneado)")

    compania, ramo, subramo = detectar_jerarquia(texto, db)
    return {
        "compania_id": compania.id if compania else None,
        "compania_nombre": compania.nombre if compania else None,
        "ramo_id": ramo.id if ramo else None,
        "ramo_nombre": ramo.nombre if ramo else None,
        "subramo_id": subramo.id if subramo else None,
        "subramo_nombre": subramo.nombre if subramo else None,
        "texto_pdf": texto[:50_000],
    }


@router.get("/historial")
def historial(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    total = db.query(Extraccion).count()
    items = (
        db.query(Extraccion)
        .order_by(Extraccion.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {
        "total": total,
        "items": [_extraccion_schema(e, db=db) for e in items],
    }


@router.get("/historial/{extraccion_id}")
def detalle_extraccion(extraccion_id: int, db: Session = Depends(get_db)):
    e = db.query(Extraccion).filter(Extraccion.id == extraccion_id).first()
    if not e:
        raise HTTPException(404, "Extracción no encontrada")
    return _extraccion_schema(e, db=db, detalle=True)


def _extraccion_schema(e: Extraccion, db: Session | None = None, detalle: bool = False) -> dict:
    from ..models.db_models import Compania, Ramo, Subramo as SubramoModel

    def _export_name(id_val, model_cls, fallback: str | None) -> str | None:
        if db and id_val:
            obj = db.query(model_cls).filter(model_cls.id == id_val).first()
            if obj and obj.nombre_exportacion:
                return obj.nombre_exportacion
        return fallback

    base = {
        "id": e.id,
        "archivo": e.nombre_archivo,
        "compania": _export_name(e.compania_id, Compania, e.compania_detectada),
        "ramo": _export_name(e.ramo_id, Ramo, e.ramo_detectado),
        "subramo": _export_name(e.subramo_id, SubramoModel, e.subramo_detectado),
        "exitoso": e.exitoso,
        "campos_por_regla": e.campos_por_regla,
        "campos_por_ia": e.campos_por_ia,
        "campos_no_encontrados": e.campos_no_encontrados,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }
    if detalle:
        base["datos_completos"] = e.datos_completos
        base["campos_extraidos"] = [
            {
                "nombre": c.nombre_campo,
                "valor": c.valor,
                "metodo": c.metodo,
                "regla_id": c.regla_id,
            }
            for c in e.campos_extraidos
        ]
    return base
