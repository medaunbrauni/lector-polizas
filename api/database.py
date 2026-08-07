import os
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./lector_polizas.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ── SQLite performance pragmas ────────────────────────────────────────────────
@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, connection_record):
    """Habilita WAL y mejora el rendimiento de SQLite."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")       # escrituras concurrentes
    cursor.execute("PRAGMA synchronous=NORMAL")     # balance velocidad/seguridad
    cursor.execute("PRAGMA cache_size=10000")       # ~10 MB de caché
    cursor.execute("PRAGMA foreign_keys=ON")        # integridad referencial
    cursor.close()


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from .models import db_models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _migrate_add_columns()
    _create_indexes()
    _create_regla_activa_constraint()


def _migrate_add_columns():
    """Agrega columnas nuevas a tablas existentes (SQLite no las crea con create_all)."""
    migrations = [
        ("companias",        "prioridad",           "INTEGER"),
        ("companias",        "porcentaje_docs",      "REAL"),
        ("companias",        "nombre_exportacion",   "VARCHAR(120)"),
        ("companias",        "patrones_deteccion",   "JSON"),
        ("ramos",            "nombre_exportacion",   "VARCHAR(120)"),
        ("ramos",            "patrones_deteccion",   "JSON"),
        ("subramos",         "prioridad",            "INTEGER"),
        ("subramos",         "porcentaje_docs",      "REAL"),
        ("subramos",         "nombre_exportacion",   "VARCHAR(120)"),
        ("subramos",         "patrones_deteccion",   "JSON"),
        ("reglas_extraccion","es_borrador",          "BOOLEAN DEFAULT 0"),
        ("reglas_extraccion","bbox",                 "JSON"),
        ("reglas_extraccion","ocr_bbox",             "JSON"),
        ("reglas_extraccion","cobertura_lote",       "INTEGER"),
        ("reglas_extraccion","total_lote",           "INTEGER"),
    ]
    with engine.connect() as conn:
        for table, col, col_type in migrations:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
                conn.commit()
            except Exception:
                pass  # columna ya existe


def _create_indexes():
    """Crea índices en columnas de consulta frecuente. Idempotente (IF NOT EXISTS)."""
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_ext_subramo   ON extracciones(subramo_id)",
        "CREATE INDEX IF NOT EXISTS idx_ext_created   ON extracciones(created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_ext_compania  ON extracciones(compania_id)",
        "CREATE INDEX IF NOT EXISTS idx_ext_ramo      ON extracciones(ramo_id)",
        "CREATE INDEX IF NOT EXISTS idx_regla_sub     ON reglas_extraccion(subramo_id, activo)",
        "CREATE INDEX IF NOT EXISTS idx_campo_ext_id  ON campos_extraidos(extraccion_id)",
        "CREATE INDEX IF NOT EXISTS idx_poliza_sub    ON polizas_entrenamiento(subramo_id)",
        "CREATE INDEX IF NOT EXISTS idx_seleccion_pol ON selecciones_campo(poliza_id)",
        "CREATE INDEX IF NOT EXISTS idx_campo_def_sub ON campos_definidos(subramo_id)",
    ]
    with engine.connect() as conn:
        for ddl in indexes:
            try:
                conn.execute(text(ddl))
                conn.commit()
            except Exception:
                pass


def _create_regla_activa_constraint():
    """
    Garantiza en el esquema la invariante que ya aplica el código de negocio
    (routers/reglas.py::crear_regla, routers/entrenamiento.py::guardar_regla):
    solo puede haber una regla activa (no borrador) por campo por subramo.

    A diferencia de _create_indexes(), no se silencia la excepción: si falla
    aquí es porque ya existen reglas activas duplicadas en la BD, y eso debe
    corregirse manualmente antes de que la restricción pueda aplicarse
    (no se resuelve solo, ya que no es una decisión de código sino de datos).
    """
    with engine.connect() as conn:
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_regla_activa_unica "
            "ON reglas_extraccion(subramo_id, nombre_campo) "
            "WHERE activo = 1 AND es_borrador = 0"
        ))
        conn.commit()
