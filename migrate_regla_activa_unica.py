"""
Migración: restricción de unicidad para reglas de extracción activas.

Crea un índice único parcial sobre reglas_extraccion(subramo_id, nombre_campo)
que solo aplica a filas con activo=1 AND es_borrador=0 — es decir, garantiza
en el esquema la invariante "una sola regla activa por campo por subramo" que
routers/reglas.py::crear_regla y routers/entrenamiento.py::guardar_regla ya
hacen cumplir hoy manualmente (desactivando la regla anterior antes de
insertar la nueva). No cambia esa lógica de negocio; solo la refuerza en BD.

Uso:
    python migrate_regla_activa_unica.py            # aplica el índice
    python migrate_regla_activa_unica.py --rollback  # elimina el índice
"""
import sqlite3
import sys

DB_PATH = "lector_polizas.db"
INDEX_NAME = "idx_regla_activa_unica"


def _duplicados(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("""
        SELECT subramo_id, nombre_campo, COUNT(*) AS total
        FROM reglas_extraccion
        WHERE activo = 1 AND es_borrador = 0
        GROUP BY subramo_id, nombre_campo
        HAVING total > 1
    """)
    return cur.fetchall()


def aplicar(conn: sqlite3.Connection) -> None:
    dups = _duplicados(conn)
    if dups:
        print("ABORTADO — existen reglas activas duplicadas, resuélvelas antes de migrar:")
        for d in dups:
            print(f"  subramo_id={d['subramo_id']} nombre_campo={d['nombre_campo']} "
                  f"({d['total']} reglas activas)")
        sys.exit(1)

    conn.execute(f"""
        CREATE UNIQUE INDEX IF NOT EXISTS {INDEX_NAME}
        ON reglas_extraccion(subramo_id, nombre_campo)
        WHERE activo = 1 AND es_borrador = 0
    """)
    conn.commit()
    print(f"OK — índice único '{INDEX_NAME}' creado (o ya existía).")


def rollback(conn: sqlite3.Connection) -> None:
    conn.execute(f"DROP INDEX IF EXISTS {INDEX_NAME}")
    conn.commit()
    print(f"OK — índice único '{INDEX_NAME}' eliminado (o no existía).")


if __name__ == "__main__":
    conn = sqlite3.connect(DB_PATH)
    try:
        if "--rollback" in sys.argv:
            rollback(conn)
        else:
            aplicar(conn)
    finally:
        conn.close()
