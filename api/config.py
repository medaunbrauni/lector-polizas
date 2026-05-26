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

# ── CORS ─────────────────────────────────────────────────────────────────────
# En producción: ALLOWED_ORIGINS=https://tudominio.com,https://app.tudominio.com
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174")
ALLOWED_ORIGINS: list[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]
