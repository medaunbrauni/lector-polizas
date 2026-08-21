"""
Limpieza automática de PDFs físicos en storage/pdfs_entrenamiento/.

Reglas:
  a) Borra archivos con más de LIMPIEZA_PDF_DIAS días de antigüedad,
     según la fecha de SUBIDA (polizas_entrenamiento.created_at en la
     BD) — NO la fecha de modificación del archivo en disco.
  b) Si, después de (a), el total de archivos que quedan en disco sigue
     por encima de LIMPIEZA_PDF_TOPE, borra los más antiguos (por
     created_at) hasta bajar del tope — salvaguarda de emergencia por
     espacio, aunque no hayan llegado a los 7 días.

IMPORTANTE: esto solo borra el archivo físico en disco. NUNCA borra ni
modifica filas de la base de datos (polizas_entrenamiento, extracciones,
campos_extraidos, etc.) — el Historial y los datos extraídos se
conservan aunque el PDF ya no exista en disco. El resto del sistema ya
sabe manejar ese caso (routers/entrenamiento.py::servir_pdf devuelve un
404 explícito "Archivo no encontrado en disco" en vez de un error
genérico, y el frontend lo traduce a un aviso legible).

Este script NO se ejecuta como parte de ningún request de usuario — está
pensado para correr solo, de forma programada (cron / tarea de Plesk).

Uso manual:
    python limpiar_pdfs_entrenamiento.py

Tarea programada en Plesk (Programador de tareas → "Ejecutar un
comando"), una vez al día:
    /usr/bin/python3 /var/www/vhosts/<tu-dominio>/lector-polizas/limpiar_pdfs_entrenamiento.py
"""
import os
import sqlite3
from datetime import datetime, timedelta

DIAS_MAXIMOS  = int(os.getenv("LIMPIEZA_PDF_DIAS", "7"))
TOPE_ARCHIVOS = int(os.getenv("LIMPIEZA_PDF_TOPE", "500"))
DB_PATH       = os.getenv("LIMPIEZA_PDF_DB", "lector_polizas.db")
LOG_PATH      = os.getenv("LIMPIEZA_PDF_LOG", os.path.join("storage", "logs", "limpieza_pdfs.log"))


def _log(mensaje: str) -> None:
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    linea = f"[{datetime.now().isoformat(timespec='seconds')}] {mensaje}"
    print(linea)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(linea + "\n")


def _borrar_archivo(ruta: str, poliza_id: int, motivo: str) -> bool:
    try:
        if os.path.exists(ruta):
            os.remove(ruta)
        _log(f"BORRADO poliza_entrenamiento_id={poliza_id} motivo={motivo} ruta={ruta}")
        return True
    except Exception as e:
        _log(f"ERROR al borrar poliza_entrenamiento_id={poliza_id} ruta={ruta}: {e}")
        return False


def limpiar() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("""
        SELECT id, ruta_archivo, created_at
        FROM polizas_entrenamiento
        ORDER BY created_at ASC
    """)
    filas = cur.fetchall()
    conn.close()

    # Solo interesa lo que TODAVÍA existe en disco — hace la corrida
    # idempotente (los ya borrados en una corrida previa se ignoran).
    vivos = [f for f in filas if f["ruta_archivo"] and os.path.exists(f["ruta_archivo"])]

    limite_edad = datetime.now() - timedelta(days=DIAS_MAXIMOS)
    borrados = 0
    restantes = []

    # a) Regla principal: antigüedad por fecha de SUBIDA
    for fila in vivos:
        try:
            creado = datetime.fromisoformat(fila["created_at"])
        except (TypeError, ValueError):
            restantes.append(fila)  # fecha ilegible: no se toca, se prefiere conservar
            continue
        if creado < limite_edad:
            if _borrar_archivo(fila["ruta_archivo"], fila["id"], f"antiguedad>{DIAS_MAXIMOS}d"):
                borrados += 1
        else:
            restantes.append(fila)

    # b) Salvaguarda de emergencia: tope de archivos totales.
    # `restantes` conserva el orden created_at ASC del query original,
    # así que los primeros del exceso son justamente los más antiguos.
    if len(restantes) > TOPE_ARCHIVOS:
        exceso = len(restantes) - TOPE_ARCHIVOS
        for fila in restantes[:exceso]:
            if _borrar_archivo(fila["ruta_archivo"], fila["id"], f"tope>{TOPE_ARCHIVOS}archivos"):
                borrados += 1

    _log(f"Limpieza terminada: {borrados} archivo(s) borrado(s) de {len(vivos)} encontrados en disco.")


if __name__ == "__main__":
    limpiar()
