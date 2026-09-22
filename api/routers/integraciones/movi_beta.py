"""
Integración con MOVI (CRM BETA). Ver base.py para la lógica compartida.

Agregar otra integración (ej. la versión oficial de MOVI, u otro CRM) es
un archivo así de corto: elegir un `origen` único y su propia env var de
API key, y montar el router en main.py.
"""
from fastapi import Depends, File, Header, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ...config import MAX_FILE_MB, MOVI_BETA_API_KEY
from ...database import get_db
from ...services.extractor import procesar_pdf
from ...services.rate_limiter import get_bucket
from .base import crear_router_integracion, verificar_api_key

router = crear_router_integracion(origen="movi_beta", api_key_esperada=MOVI_BETA_API_KEY)

MAX_SIZE = MAX_FILE_MB * 1024 * 1024


@router.post("/extraer")
async def extraer_sincrono(
    file: UploadFile = File(...),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    db: Session = Depends(get_db),
):
    """
    Extracción síncrona de UN PDF, para llamadas que necesitan el resultado
    al momento (a diferencia de /cola: encola para catalogación en background
    y nunca regresa datos extraídos).

    Corre el mismo pipeline completo que la UI autenticada
    (services/extractor.procesar_pdf) -- no el pipeline ligero de
    solo-clasificación que usa /cola -- y traduce su resultado al formato
    que espera process-poliza-pdf del lado de MOVI.
    """
    verificar_api_key(x_api_key, MOVI_BETA_API_KEY, "movi_beta")

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Solo se aceptan archivos PDF")

    contenido = await file.read()
    if len(contenido) > MAX_SIZE:
        raise HTTPException(400, f"El archivo excede el límite de {MAX_FILE_MB} MB")

    if not get_bucket("movi_beta_extraer").allow():
        raise HTTPException(429, "Límite de solicitudes excedido, reintenta en unos segundos")

    resultado = procesar_pdf(contenido, file.filename, db)

    if resultado["error"]:
        estado = "error"
    elif not resultado["compania"]:
        estado = "no_reconocida"
    else:
        estado = "ok"

    return {
        "aseguradora": resultado["compania"],
        "ramo": resultado["ramo"],
        "sub_ramo": resultado["subramo"],
        "estado": estado,
        "campos": {nombre: info.get("valor") for nombre, info in resultado["campos"].items()},
        "error": resultado["error"],
    }
