"""Configuración global de la API (rutas, variables de entorno)."""
import os

# Directorio base para almacenamiento de archivos
STORAGE_PATH = os.getenv("STORAGE_PATH", "./storage")
PDF_ENTRENAMIENTO_DIR = os.path.join(STORAGE_PATH, "pdfs_entrenamiento")

os.makedirs(PDF_ENTRENAMIENTO_DIR, exist_ok=True)
