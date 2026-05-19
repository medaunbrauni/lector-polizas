from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..services.extractor import procesar_pdf
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
        "items": [_extraccion_schema(e) for e in items],
    }


@router.get("/historial/{extraccion_id}")
def detalle_extraccion(extraccion_id: int, db: Session = Depends(get_db)):
    e = db.query(Extraccion).filter(Extraccion.id == extraccion_id).first()
    if not e:
        raise HTTPException(404, "Extracción no encontrada")
    return _extraccion_schema(e, detalle=True)


def _extraccion_schema(e: Extraccion, detalle: bool = False) -> dict:
    base = {
        "id": e.id,
        "archivo": e.nombre_archivo,
        "compania": e.compania_detectada,
        "ramo": e.ramo_detectado,
        "subramo": e.subramo_detectado,
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
