from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .models.poliza import ExtractionResponse
from .services.extractor import procesar_pdf

app = FastAPI(
    title="Lector de Pólizas API",
    description="Extracción multi-compañía de datos de pólizas PDF (GNP, Quálitas, ANA, HDI, Banorte…)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


@app.post("/extraer", response_model=ExtractionResponse)
async def extraer_polizas(files: list[UploadFile] = File(...)):
    """
    Recibe uno o varios archivos PDF de pólizas y extrae sus datos.
    Detecta automáticamente la compañía aseguradora.
    """
    if not files:
        raise HTTPException(status_code=400, detail="Se requiere al menos un archivo PDF")

    resultados = []
    for archivo in files:
        if not archivo.filename or not archivo.filename.lower().endswith(".pdf"):
            resultados.append(
                {"archivo": archivo.filename or "desconocido", "error": "Solo se aceptan archivos PDF"}
            )
            continue

        contenido = await archivo.read()
        resultado = procesar_pdf(contenido, archivo.filename)
        resultados.append(resultado)

    return ExtractionResponse(success=True, data=resultados)
