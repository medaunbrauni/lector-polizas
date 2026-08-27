"""
Fuerza AUTOINCREMENT real en polizas_entrenamiento.id.

Por qué: la tabla se creó sin la palabra clave AUTOINCREMENT (el default
de SQLAlchemy `Integer, primary_key=True`), así que SQLite reutiliza el id
más alto libre después de un DELETE (regla estándar: próximo id = MAX(id
existente) + 1, recalculado cada vez). Esto puede hacer que una póliza
nueva reciba el MISMO id que una ya borrada — y como el caché de PDFs del
frontend (web/src/lib/pdfCache.ts) vive por pestaña indexado por ese id,
podía servir los bytes del PDF viejo para la póliza nueva. Con
AUTOINCREMENT real, SQLite nunca reutiliza un id ya usado (lleva la marca
en sqlite_sequence), cerrando la causa de raíz (el fix del lado del
frontend — invalidar la entrada de caché al borrar — ya se aplicó aparte).

SQLite no permite agregar AUTOINCREMENT a una columna existente con un
ALTER TABLE directo — hay que recrear la tabla. Procedimiento (el
recomendado por la propia documentación de SQLite para cambios de
esquema que ALTER TABLE no cubre):
  1. Respaldo del .db completo (sqlite3 .backup, vía la API de Python).
  2. PRAGMA foreign_keys=OFF + transacción.
  3. CREATE TABLE polizas_entrenamiento_new con AUTOINCREMENT.
  4. Copiar todas las filas preservando su id tal cual (no renumera nada).
  5. DROP de la tabla vieja, rename de la nueva.
  6. Recrear el índice que tenía (idx_poliza_sub).
  7. Verificar/asegurar sqlite_sequence para esta tabla.
  8. PRAGMA foreign_key_check — confirma que ninguna FK quedó rota.
  9. COMMIT + PRAGMA foreign_keys=ON.

Las demás tablas (extracciones.poliza_entrenamiento_id,
clasificacion_cola.poliza_entrenamiento_id, selecciones_campo.poliza_id)
NO se tocan — como los ids no cambian, sus referencias siguen apuntando
a las mismas filas sin necesidad de ningún UPDATE.

Uso:
    python3 migrate_autoincrement_polizas_entrenamiento.py --dry-run
    python3 migrate_autoincrement_polizas_entrenamiento.py
"""
import os
import shutil
import sqlite3
import sys
from datetime import datetime

DRY_RUN = "--dry-run" in sys.argv
DB_PATH = os.getenv("MIGRATE_DB", "lector_polizas.db")

DDL_NUEVA = """
CREATE TABLE polizas_entrenamiento_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subramo_id INTEGER NOT NULL,
    nombre_archivo VARCHAR(255) NOT NULL,
    ruta_archivo VARCHAR(512) NOT NULL,
    texto_pdf TEXT,
    paginas INTEGER,
    created_at DATETIME,
    FOREIGN KEY(subramo_id) REFERENCES subramos (id)
)
"""


def _log(mensaje: str) -> None:
    print(f"[{datetime.now().isoformat(timespec='seconds')}] {mensaje}")


def main() -> None:
    if not os.path.exists(DB_PATH):
        _log(f"ERROR: no existe {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # ── Estado ANTES (para el resumen y para verificar después) ────────────
    total_antes = cur.execute("SELECT COUNT(*) FROM polizas_entrenamiento").fetchone()[0]
    max_id_antes = cur.execute("SELECT MAX(id) FROM polizas_entrenamiento").fetchone()[0]
    filas_antes = cur.execute("SELECT * FROM polizas_entrenamiento ORDER BY id").fetchall()
    ext_referencian_antes = cur.execute(
        "SELECT id, poliza_entrenamiento_id FROM extracciones WHERE poliza_entrenamiento_id IS NOT NULL"
    ).fetchall()
    ddl_actual = cur.execute(
        "SELECT sql FROM sqlite_master WHERE name='polizas_entrenamiento'"
    ).fetchone()[0]

    _log(f"Filas actuales: {total_antes}, MAX(id)={max_id_antes}")
    _log(f"Extracciones que referencian una póliza: {len(ext_referencian_antes)}")
    _log("DDL actual:")
    print(ddl_actual)

    if "AUTOINCREMENT" in ddl_actual:
        _log("La tabla YA tiene AUTOINCREMENT — nada que migrar.")
        conn.close()
        return

    if DRY_RUN:
        _log("[DRY-RUN] Se haría, en orden:")
        _log(f"  1. Respaldo de {DB_PATH} -> {DB_PATH}.bak-pre-autoincrement-polizas")
        _log("  2. PRAGMA foreign_keys=OFF")
        _log("  3. CREATE TABLE polizas_entrenamiento_new (... AUTOINCREMENT ...)")
        _log(f"  4. Copiar {total_antes} fila(s), ids preservados tal cual (MIN={filas_antes[0]['id'] if filas_antes else '—'}, MAX={max_id_antes})")
        _log("  5. DROP TABLE polizas_entrenamiento; ALTER TABLE ... RENAME TO polizas_entrenamiento")
        _log("  6. CREATE INDEX idx_poliza_sub ON polizas_entrenamiento(subramo_id)")
        _log(f"  7. Asegurar sqlite_sequence('polizas_entrenamiento') = {max_id_antes}")
        _log("  8. PRAGMA foreign_key_check")
        _log("  9. COMMIT; PRAGMA foreign_keys=ON")
        _log("Nada se modificó (dry-run).")
        conn.close()
        return

    # ── Respaldo real del archivo completo ──────────────────────────────────
    backup_path = f"{DB_PATH}.bak-pre-autoincrement-polizas"
    conn.close()  # cerrar antes de copiar el archivo, para no copiar un WAL a medias
    shutil.copy2(DB_PATH, backup_path)
    _log(f"Respaldo creado: {backup_path}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("PRAGMA foreign_keys=OFF")
    cur.execute("BEGIN")
    try:
        cur.execute(DDL_NUEVA)
        cur.execute("""
            INSERT INTO polizas_entrenamiento_new
                (id, subramo_id, nombre_archivo, ruta_archivo, texto_pdf, paginas, created_at)
            SELECT id, subramo_id, nombre_archivo, ruta_archivo, texto_pdf, paginas, created_at
            FROM polizas_entrenamiento
        """)
        cur.execute("DROP TABLE polizas_entrenamiento")
        cur.execute("ALTER TABLE polizas_entrenamiento_new RENAME TO polizas_entrenamiento")
        cur.execute("CREATE INDEX idx_poliza_sub ON polizas_entrenamiento(subramo_id)")

        # Red de seguridad explícita sobre sqlite_sequence (ya debería quedar
        # correcto solo con los INSERT de ids explícitos de arriba — verificado
        # aparte con una prueba aislada — pero se fuerza aquí para no depender
        # de ese comportamiento). sqlite_sequence no tiene UNIQUE declarado
        # sobre `name`, así que no admite ON CONFLICT — se resuelve a mano.
        if max_id_antes is not None:
            actualizado = cur.execute(
                "UPDATE sqlite_sequence SET seq = ? "
                "WHERE name = 'polizas_entrenamiento' AND seq < ?",
                (max_id_antes, max_id_antes),
            ).rowcount
            if actualizado == 0:
                existe = cur.execute(
                    "SELECT 1 FROM sqlite_sequence WHERE name = 'polizas_entrenamiento'"
                ).fetchone()
                if not existe:
                    cur.execute(
                        "INSERT INTO sqlite_sequence (name, seq) VALUES ('polizas_entrenamiento', ?)",
                        (max_id_antes,),
                    )

        # PRAGMA foreign_key_check sin filtro revisa TODA la BD, no solo lo
        # que esta migración toca — en este proyecto ya hay deuda previa sin
        # relación (campos_extraidos.regla_id huérfano de reglas ya
        # borradas), que haría abortar por algo que no tiene nada que ver.
        # Se filtra al único table name relevante aquí: quien referencia a
        # polizas_entrenamiento.
        rotas = [
            r for r in cur.execute("PRAGMA foreign_key_check").fetchall()
            if r[2] == "polizas_entrenamiento"
        ]
        if rotas:
            raise RuntimeError(f"foreign_key_check encontró {len(rotas)} referencia(s) rota(s) hacia polizas_entrenamiento: {rotas}")

        conn.commit()
    except Exception:
        conn.rollback()
        cur.execute("PRAGMA foreign_keys=ON")
        conn.close()
        _log("ERROR — se hizo ROLLBACK, la BD quedó sin tocar. Respaldo disponible en " + backup_path)
        raise
    cur.execute("PRAGMA foreign_keys=ON")

    # ── Verificación DESPUÉS ────────────────────────────────────────────────
    total_despues = cur.execute("SELECT COUNT(*) FROM polizas_entrenamiento").fetchone()[0]
    filas_despues = cur.execute("SELECT * FROM polizas_entrenamiento ORDER BY id").fetchall()
    ddl_nuevo = cur.execute(
        "SELECT sql FROM sqlite_master WHERE name='polizas_entrenamiento'"
    ).fetchone()[0]
    seq = cur.execute(
        "SELECT seq FROM sqlite_sequence WHERE name='polizas_entrenamiento'"
    ).fetchone()

    idénticas = [tuple(a) for a in filas_antes] == [tuple(b) for b in filas_despues]

    # Las extracciones que referenciaban una póliza deben seguir resolviendo
    # exactamente a la misma fila (mismo id) — los ids no se tocaron.
    ext_referencian_despues = cur.execute(
        "SELECT id, poliza_entrenamiento_id FROM extracciones WHERE poliza_entrenamiento_id IS NOT NULL"
    ).fetchall()
    extracciones_ok = [tuple(a) for a in ext_referencian_antes] == [tuple(b) for b in ext_referencian_despues]
    ids_validos_antes = {f["id"] for f in filas_antes}
    ids_validos_despues = {f["id"] for f in filas_despues}
    huerfanas_antes = [e for e in ext_referencian_antes if e["poliza_entrenamiento_id"] not in ids_validos_antes]
    huerfanas_despues = [e for e in ext_referencian_despues if e["poliza_entrenamiento_id"] not in ids_validos_despues]
    # No exige "todas resuelven" — puede haber huérfanas preexistentes de
    # eliminar_poliza (borrado individual, que a diferencia de vaciar_lote
    # nunca puso a NULL las Extraccion que la referenciaban). Lo que
    # realmente importa para esta migración es que el CONJUNTO de huérfanas
    # sea EXACTAMENTE el mismo antes y después — si creciera, sí sería un
    # bug de la migración.
    huerfanas_sin_cambio = (
        {(e["id"], e["poliza_entrenamiento_id"]) for e in huerfanas_antes}
        == {(e["id"], e["poliza_entrenamiento_id"]) for e in huerfanas_despues}
    )

    _log(f"Filas después: {total_despues} (antes: {total_antes})")
    _log(f"Datos idénticos fila por fila: {idénticas}")
    _log(f"Extracciones->poliza sin cambios: {extracciones_ok} ({len(ext_referencian_despues)} referencias)")
    if huerfanas_antes:
        _log(f"AVISO (preexistente, no causado por esta migración): {len(huerfanas_antes)} extracción(es) "
             f"ya referenciaban un poliza_entrenamiento_id inexistente antes de migrar — deuda de "
             f"eliminar_poliza (borrado individual), que no anula esa referencia como sí hace vaciar_lote: "
             f"{[(e['id'], e['poliza_entrenamiento_id']) for e in huerfanas_antes]}")
    _log(f"El conjunto de referencias huérfanas no creció con la migración: {huerfanas_sin_cambio}")
    _log(f"sqlite_sequence.seq = {seq[0] if seq else None} (esperado: {max_id_antes})")
    _log("DDL nuevo:")
    print(ddl_nuevo)
    assert "AUTOINCREMENT" in ddl_nuevo, "AUTOINCREMENT no quedó en el DDL — algo falló"
    assert total_despues == total_antes, "El conteo de filas cambió — algo falló"
    assert idénticas, "Los datos no son idénticos a los de antes — algo falló"
    assert extracciones_ok, "Las referencias de extracciones a pólizas cambiaron — algo falló"
    assert huerfanas_sin_cambio, "Aparecieron referencias huérfanas NUEVAS que no existían antes — algo falló"

    conn.close()
    _log("Migración completa y verificada.")


if __name__ == "__main__":
    main()
