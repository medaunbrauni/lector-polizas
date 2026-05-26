import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from .database import init_db, SessionLocal
from .seed.data import sembrar
from .routers import extraccion, catalogos, reglas, entrenamiento
from .seed.campos_globales import sembrar_campos_globales


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        sembrar(db)
        sembrar_campos_globales(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="Lector de Pólizas API",
    description="Extracción multi-compañía de pólizas PDF — GNP, Quálitas, ANA, HDI, Banorte…",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(extraccion.router)
app.include_router(catalogos.router)
app.include_router(reglas.router)
app.include_router(entrenamiento.router)


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}
