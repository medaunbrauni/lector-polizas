import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from .config import ALLOWED_ORIGINS, UPLOAD_FOLDER
from .database import init_db, SessionLocal
from .seed.data import sembrar
from .routers import auth, extraccion, catalogos, reglas, entrenamiento, clasificador
from .seed.campos_globales import sembrar_campos_globales
from .services.folder_watcher import iniciar_watcher, detener_watcher


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Inicializar BD y datos semilla ─────────────────────────────────────
    init_db()
    db = SessionLocal()
    try:
        sembrar(db)
        sembrar_campos_globales(db)
    finally:
        db.close()

    # ── Iniciar watchdog sobre la carpeta de entrada ───────────────────────
    iniciar_watcher(UPLOAD_FOLDER)

    yield

    # ── Limpieza al apagar ─────────────────────────────────────────────────
    detener_watcher()


app = FastAPI(
    title="Lector de Pólizas API",
    description="Extracción multi-compañía de pólizas PDF — GNP, Quálitas, ANA, HDI, Banorte…",
    version="2.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "Authorization"],
)

# ── Todas las rutas de negocio se agrupan bajo /api ──────────────
# El reverse proxy en producción (Plesk) reenvía el path completo
# tal cual (https://lector.movi.digital/api/x -> 127.0.0.1:8000/api/x),
# por lo que FastAPI debe exponer sus rutas bajo ese mismo prefijo.
api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(extraccion.router)
api_router.include_router(catalogos.router)
api_router.include_router(reglas.router)
api_router.include_router(entrenamiento.router)
api_router.include_router(clasificador.router)

@api_router.get("/health")
def health():
    return {"status": "ok", "version": "2.1.0"}

app.include_router(api_router)

# Alias sin prefijo, solo para checks locales/monitoreo directo
# contra uvicorn en 127.0.0.1:8000 (systemd, healthchecks internos).
@app.get("/health")
def health_root():
    return {"status": "ok", "version": "2.1.0"}
