"""
Integración con MOVI (CRM BETA). Ver base.py para la lógica compartida.

Agregar otra integración (ej. la versión oficial de MOVI, u otro CRM) es
un archivo así de corto: elegir un `origen` único y su propia env var de
API key, y montar el router en main.py.
"""
# Obligatorio en Python 3.9 (server de producción): sin esto, "str | None"
# en la firma de extraer_sincrono() se evalúa al definir la función y
# truena -- esa sintaxis de unión es de 3.10+. Ver INCIDENTE_2026-07-27.md.
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler

from fastapi import Depends, File, Header, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ...config import MAX_FILE_MB, MOVI_BETA_API_KEY, STORAGE_PATH
from ...database import get_db
from ...extractores_especializados.gnp import es_poliza_auto_gnp, titulo_no_soportado_gnp
from ...extractores_especializados.registry import obtener_extractor
from ...models.db_models import Extraccion, ReglaExtraccion
from ...services.extractor import procesar_pdf
from ...services.rate_limiter import get_bucket
from .base import crear_router_integracion, verificar_api_key

router = crear_router_integracion(origen="movi_beta", api_key_esperada=MOVI_BETA_API_KEY)

MAX_SIZE = MAX_FILE_MB * 1024 * 1024

# ponytail: MODO SOMBRA del fix de validación de /extraer (activado 2026-10-02).
# Solo observa: evalúa el criterio de rechazo y lo escribe en
# storage/logs/sombra_extraer.log; NO cambia `estado` ni corta el pipeline.
# Graduar a rechazo real (o borrar este bloque) tras revisar el log.
_sombra = logging.getLogger("sombra_extraer")
_sombra.setLevel(logging.INFO)
_sombra.propagate = False
if not _sombra.handlers:
    _logs_dir = os.path.join(STORAGE_PATH, "logs")
    os.makedirs(_logs_dir, exist_ok=True)
    _h = RotatingFileHandler(
        os.path.join(_logs_dir, "sombra_extraer.log"), maxBytes=5_000_000, backupCount=3, encoding="utf-8",
    )
    _h.setFormatter(logging.Formatter("%(message)s"))
    _sombra.addHandler(_h)


def _veredicto_sombra(resultado: dict, db: Session) -> str:
    """aceptaria | error_pipeline | producto_no_soportado | sin_subramo | confianza_baja
    | sin_soporte | filtro_extractor_rechazo | sin_campos_reales."""
    if resultado["error"]:
        return "error_pipeline"
    ext = db.get(Extraccion, resultado["id"])
    texto = (ext.texto_pdf or "") if ext else ""
    # M2 primero: título conocido como no soportado, sin importar lo demás.
    # ponytail: M1+M2 validados solo para GNP; Quálitas (es_poliza_auto_qualitas)
    # y El Potosí (es_poliza_auto_el_potosi) tienen filtros con el mismo patrón
    # SIN revisar -- pendiente antes de activar el rechazo real.
    if resultado["compania"] == "GNP Seguros" and titulo_no_soportado_gnp(texto):
        return "producto_no_soportado"
    if not resultado["subramo"]:
        return "sin_subramo"
    if resultado["deteccion"]["confianza"] not in ("alta", "media"):
        return "confianza_baja"
    subramo_id = ext.subramo_id if ext else None
    con_reglas = subramo_id is not None and db.query(ReglaExtraccion.id).filter(
        ReglaExtraccion.subramo_id == subramo_id,
        ReglaExtraccion.activo == True,  # noqa: E712
        ReglaExtraccion.es_borrador == False,  # noqa: E712
    ).first() is not None
    if not (obtener_extractor(resultado["compania"]) or con_reglas):
        return "sin_soporte"
    # El filtro del extractor rechazó antes de extraer: motivo propio para
    # diagnosticar si el filtro es demasiado estricto con algo válido.
    if resultado["compania"] == "GNP Seguros" and not es_poliza_auto_gnp(texto):
        return "filtro_extractor_rechazo"
    # No usar stats.por_regla: incluye valor_fijo/derivado (siempre >= 1).
    reales = sum(
        1 for i in resultado["campos"].values()
        if i.get("metodo") in ("regla", "extractor_dedicado") and i.get("valor") not in (None, "")
    )
    return "aceptaria" if reales > 0 else "sin_campos_reales"


def _log_sombra(archivo: str, resultado: dict, estado: str, db: Session) -> None:
    try:
        det = resultado.get("deteccion") or {}
        _sombra.info(json.dumps({
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "archivo": archivo,
            "extraccion_id": resultado.get("id"),
            "compania": resultado.get("compania"),
            "ramo": resultado.get("ramo"),
            "subramo": resultado.get("subramo"),
            "confianza": det.get("confianza"),
            "scores": [det.get("score_compania"), det.get("score_ramo"), det.get("score_subramo")],
            "estado_real": estado,
            "veredicto_sombra": _veredicto_sombra(resultado, db),
        }, ensure_ascii=False))
    except Exception:  # observacional: jamás debe afectar la respuesta
        pass


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

    _log_sombra(file.filename, resultado, estado, db)

    return {
        "aseguradora": resultado["compania"],
        "ramo": resultado["ramo"],
        "sub_ramo": resultado["subramo"],
        "estado": estado,
        "campos": {nombre: info.get("valor") for nombre, info in resultado["campos"].items()},
        "error": resultado["error"],
    }
