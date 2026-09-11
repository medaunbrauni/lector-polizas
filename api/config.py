"""Configuración global de la API (rutas, variables de entorno, modelos IA)."""
import os

# ── Almacenamiento ───────────────────────────────────────────────────────────
STORAGE_PATH          = os.getenv("STORAGE_PATH", "./storage")
PDF_ENTRENAMIENTO_DIR = os.path.join(STORAGE_PATH, "pdfs_entrenamiento")

os.makedirs(PDF_ENTRENAMIENTO_DIR, exist_ok=True)

# ── Base de datos ────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./lector_polizas.db")

# ── Modelos de IA (Anthropic) ────────────────────────────────────────────────
# Cambiar en .env para usar modelos distintos sin tocar código
MODEL_EXTRACTOR      = os.getenv("MODEL_EXTRACTOR",     "claude-haiku-4-5-20251001")
MODEL_BATCH_TRAINER  = os.getenv("MODEL_BATCH_TRAINER",  "claude-opus-4-7")
MODEL_PATTERN_GEN    = os.getenv("MODEL_PATTERN_GEN",    "claude-haiku-4-5-20251001")
MODEL_REGEX_IA       = os.getenv("MODEL_REGEX_IA",       "claude-opus-4-7")

# ── Límites de subida ────────────────────────────────────────────────────────
MAX_FILES_PER_REQUEST = int(os.getenv("MAX_FILES_PER_REQUEST", "50"))
MAX_FILE_MB           = int(os.getenv("MAX_FILE_MB",           "15"))

# ── Clasificador / Carpeta de entrada ────────────────────────────────────────
MODEL_CLASIFICADOR = os.getenv("MODEL_CLASIFICADOR", "claude-haiku-4-5-20251001")
_desktop = os.path.join(os.path.expanduser("~"), "Desktop", "polizas_clasificador")
UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", _desktop)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ── Integraciones externas (CRMs que envían tickets con PDFs vía API) ───────
# Carpeta separada de UPLOAD_FOLDER a propósito: UPLOAD_FOLDER es vigilada
# por el watchdog (folder_watcher.py) y un archivo dejado ahí se procesaría
# dos veces (una por el watcher, otra por el propio endpoint).
INTEGRACIONES_DIR = os.path.join(STORAGE_PATH, "integraciones")
os.makedirs(INTEGRACIONES_DIR, exist_ok=True)
MAX_PDFS_POR_TICKET = int(os.getenv("MAX_PDFS_POR_TICKET", "30"))
MOVI_BETA_API_KEY = os.getenv("MOVI_BETA_API_KEY")

# ── CORS ─────────────────────────────────────────────────────────────────────
# En producción: ALLOWED_ORIGINS=https://tudominio.com,https://app.tudominio.com
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174")
ALLOWED_ORIGINS: list[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]
