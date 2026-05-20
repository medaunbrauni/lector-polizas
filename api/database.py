from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = "sqlite:///./lector_polizas.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


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
    ]
    with engine.connect() as conn:
        for table, col, col_type in migrations:
            try:
                conn.execute(__import__("sqlalchemy").text(
                    f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"
                ))
                conn.commit()
            except Exception:
                pass  # columna ya existe
