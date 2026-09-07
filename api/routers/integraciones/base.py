"""
Lógica compartida para recibir tickets de CRMs externos (MOVI y, a futuro,
otros). Cada integración concreta (ver movi_beta.py) es un router delgado
que solo aporta su `origen` y su API key — el pipeline de clasificación
(extraer_texto_pdf / procesar_pdf) es el mismo que usa /clasificador/upload,
sin duplicarlo.
"""
from __future__ import annotations
import secrets
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Header, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ...config import INTEGRACIONES_DIR, MAX_FILE_MB, MAX_PDFS_POR_TICKET
from ...database import SessionLocal, get_db
from ...models.db_models import ClasificacionCola, TicketExterno
from ...services.clasificador_service import extraer_texto_pdf, procesar_pdf, sha256_bytes
from ...services.rate_limiter import get_bucket

MAX_SIZE = MAX_FILE_MB * 1024 * 1024


def crear_router_integracion(origen: str, api_key_esperada: str | None) -> APIRouter:
    """Arma el router de un CRM externo. `origen` debe ser único (ej. 'movi_beta')."""
    router = APIRouter(prefix=f"/integraciones/{origen}", tags=[f"Integración {origen}"])

    @router.post("/cola", status_code=202)
    async def recibir_ticket(
        background_tasks: BackgroundTasks,
        ticket_id: str = Form(...),
        archivos: list[UploadFile] = File(...),
        x_api_key: str | None = Header(None, alias="X-API-Key"),
        db: Session = Depends(get_db),
    ):
        if not api_key_esperada:
            raise HTTPException(500, f"{origen}: API key no configurada en el servidor")
        if not x_api_key or not secrets.compare_digest(x_api_key, api_key_esperada):
            raise HTTPException(401, "API key inválida")

        ticket_id = ticket_id.strip()
        if not ticket_id:
            raise HTTPException(400, "ticket_id requerido")

        if not (1 <= len(archivos) <= MAX_PDFS_POR_TICKET):
            raise HTTPException(400, f"Se esperan entre 1 y {MAX_PDFS_POR_TICKET} PDFs por ticket")

        if not get_bucket(origen).allow():
            raise HTTPException(429, "Límite de solicitudes excedido, reintenta en unos segundos")

        if db.query(TicketExterno).filter_by(origen=origen, folio=ticket_id).first():
            raise HTTPException(409, f"El ticket '{ticket_id}' ya fue recibido")

        # Validar todo antes de escribir nada a disco/BD.
        contenidos: list[tuple[str, bytes]] = []
        for archivo in archivos:
            nombre = archivo.filename or "sin_nombre.pdf"
            if not nombre.lower().endswith(".pdf"):
                raise HTTPException(400, f"'{nombre}' no es un PDF")
            data = await archivo.read()
            if len(data) > MAX_SIZE:
                raise HTTPException(400, f"'{nombre}' supera el límite de {MAX_FILE_MB} MB")
            contenidos.append((nombre, data))

        ticket = TicketExterno(origen=origen, folio=ticket_id, total_pdfs=len(contenidos))
        db.add(ticket)
        db.flush()

        dest_dir = Path(INTEGRACIONES_DIR) / origen / ticket_id
        dest_dir.mkdir(parents=True, exist_ok=True)

        cola_ids: list[int] = []
        duplicados: list[str] = []
        for nombre, data in contenidos:
            sha = sha256_bytes(data)
            if db.query(ClasificacionCola).filter_by(sha256=sha).first():
                duplicados.append(nombre)
                continue

            dest = dest_dir / nombre
            if dest.exists():
                dest = dest_dir / f"{Path(nombre).stem}_{uuid.uuid4().hex[:6]}{Path(nombre).suffix}"
            dest.write_bytes(data)

            item = ClasificacionCola(
                nombre_archivo=dest.name,
                ruta_archivo=str(dest),
                sha256=sha,
                estado="pendiente",
                origen=origen,
                ticket_externo_id=ticket.id,
            )
            db.add(item)
            db.flush()
            cola_ids.append(item.id)

        db.commit()

        # ponytail: un solo background task que procesa los PDFs del ticket
        # EN SERIE (no un task por PDF). Con SQLite, N sesiones separadas
        # haciendo commit casi al mismo tiempo pueden chocar con
        # "database is locked" pese al WAL; para este volumen (<=30,
        # esporádico) procesar uno tras otro cuesta lo mismo en la práctica
        # y elimina el problema de raíz en vez de solo mitigarlo con
        # busy_timeout. Subir a procesamiento paralelo real (con locking
        # explícito o Postgres) solo si el volumen lo exige.
        if cola_ids:
            background_tasks.add_task(_procesar_ticket_en_serie, cola_ids)

        return {
            "ticket_id": ticket_id,
            "recibidos": len(cola_ids),
            "duplicados": duplicados,
            "cola_ids": cola_ids,
        }

    return router


def _procesar_ticket_en_serie(cola_ids: list[int]) -> None:
    """
    Corre en background tras responder el 202. Sesión propia (la del
    request ya se cerró). Un PDF que falla no detiene a los demás.

    ponytail: sin retry ni persistencia de este task — si el proceso
    muere a medio camino, los ClasificacionCola restantes de este ticket
    quedan en "pendiente" sin aviso. Deuda conocida, documentada también
    en docs/07_Roadmaps/01_PLAN_ACCION.md: hace falta a futuro un chequeo
    (manual o programado) de items "pendiente" con más de ~1h de
    antigüedad para poder reintentarlos.
    """
    db = SessionLocal()
    try:
        for cola_id in cola_ids:
            item = db.get(ClasificacionCola, cola_id)
            if not item:
                continue
            try:
                texto, paginas = extraer_texto_pdf(item.ruta_archivo)
                item.texto_pdf, item.paginas = texto, paginas
                procesar_pdf(item, db)
            except Exception as e:
                item.estado, item.error_msg = "error", str(e)
            db.commit()
    finally:
        db.close()
