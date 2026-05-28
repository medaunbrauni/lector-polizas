import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
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

from .routers import auth
app.include_router(auth.router)
app.include_router(extraccion.router)
app.include_router(catalogos.router)
app.include_router(reglas.router)
app.include_router(entrenamiento.router)
app.include_router(clasificador.router)


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.1.0"}
