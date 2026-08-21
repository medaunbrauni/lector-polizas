"""
Limpieza diaria del Lote de Pólizas del Entrenador.

Vacía (borra fila + archivo físico) las pólizas de
polizas_entrenamiento que YA NO están en uso, es decir que ningún
registro de extracciones.poliza_entrenamiento_id las referencia. Las
que sí están en uso se conservan intactas: el Historial de
Extracciones reutiliza la misma tabla y debe seguir mostrando sus
datos aunque el archivo se borre después por la limpieza de
LIMPIEZA_PDF_DIAS de limpiar_pdfs_entrenamiento.py.

Este script NO se ejecuta como parte de ningún request de usuario —
está pensado para correr solo, de forma programada (cron / tarea de
Plesk), igual que limpiar_pdfs_entrenamiento.py.

Uso manual:
    python limpiar_lote_entrenamiento.py

Tarea programada en Plesk (Programador de tareas → "Ejecutar un
comando"), una vez al día:
    /usr/bin/python3 /var/www/vhosts/<tu-dominio>/lector-polizas/limpiar_lote_entrenamiento.py
"""
import os
import sqlite3
from datetime import datetime

DB_PATH  = os.getenv("LIMPIEZA_LOTE_DB", "lector_polizas.db")
LOG_PATH = os.getenv("LIMPIEZA_LOTE_LOG", os.path.join("storage", "logs", "limpieza_lote.log"))


def _log(mensaje: str) -> None:
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    linea = f"[{datetime.now().isoformat(timespec='seconds')}] {mensaje}"
    print(linea)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(linea + "\n")


def vaciar_lote() -> None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute(
        "SELECT DISTINCT poliza_entrenamiento_id FROM extracciones "
        "WHERE poliza_entrenamiento_id IS NOT NULL"
    )
    en_uso = {row[0] for row in cur.fetchall()}

    cur.execute("SELECT id, ruta_archivo FROM polizas_entrenamiento")
    filas = cur.fetchall()

    borradas = 0
    for poliza_id, ruta in filas:
        if poliza_id in en_uso:
            continue
        try:
            if ruta and os.path.exists(ruta):
                os.remove(ruta)
        except Exception as e:
            _log(f"ERROR al borrar archivo poliza_entrenamiento_id={poliza_id} ruta={ruta}: {e}")
        cur.execute("DELETE FROM selecciones_campo WHERE poliza_id = ?", (poliza_id,))
        cur.execute("DELETE FROM polizas_entrenamiento WHERE id = ?", (poliza_id,))
        borradas += 1

    conn.commit()
    conn.close()
    _log(f"Lote vaciado: {borradas} póliza(s) de entrenamiento borrada(s) de {len(filas)} encontradas.")


if __name__ == "__main__":
    vaciar_lote()
