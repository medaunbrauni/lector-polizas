import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from .config import ALLOWED_ORIGINS, UPLOAD_FOLDER
from .database import init_db, SessionLocal
from .seed.data import sembrar
from .routers import auth, extraccion, catalogos, reglas, entrenamiento, clasificador
from .routers.auth import verificar_sesion
from .routers.integraciones import movi_beta
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
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
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

# ── Sin protección de sesión ──────────────────────────────────────────────
# auth: son los propios endpoints de login/verify/logout.
# movi_beta: se autentica con su propio X-API-Key (ver
#   routers/integraciones/base.py), no con la cookie de sesión de usuario —
#   es un CRM externo server-to-server, no un navegador con sesión.
api_router.include_router(auth.router)
api_router.include_router(movi_beta.router)

@api_router.get("/health")
def health():
    return {"status": "ok", "version": "2.1.0"}

# ── Con protección de sesión ──────────────────────────────────────────────
# Punto único de control: la dependencia se agrega aquí, no en cada router,
# para no tener que recordar replicarla si se agrega un router de negocio
# nuevo y para que quede visible de un vistazo cuál grupo es cuál.
api_router.include_router(extraccion.router, dependencies=[Depends(verificar_sesion)])
api_router.include_router(catalogos.router, dependencies=[Depends(verificar_sesion)])
api_router.include_router(reglas.router, dependencies=[Depends(verificar_sesion)])
api_router.include_router(entrenamiento.router, dependencies=[Depends(verificar_sesion)])
api_router.include_router(clasificador.router, dependencies=[Depends(verificar_sesion)])

app.include_router(api_router)

# Alias sin prefijo, solo para checks locales/monitoreo directo
# contra uvicorn en 127.0.0.1:8000 (systemd, healthchecks internos).
@app.get("/health")
def health_root():
    return {"status": "ok", "version": "2.1.0"}
