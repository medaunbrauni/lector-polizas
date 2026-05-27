"""
Vigilancia de carpeta en tiempo real con watchdog.
Cuando aparece un PDF nuevo en la carpeta vigilada, lo agrega
automáticamente a la cola de clasificación y ejecuta el pipeline.
"""
import logging
import threading
import time
from pathlib import Path

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

logger = logging.getLogger(__name__)

_observer: Observer | None = None
_lock = threading.Lock()


class _PDFHandler(FileSystemEventHandler):
    def __init__(self) -> None:
        self._en_proceso: set[str] = set()

    def on_created(self, event) -> None:
        if event.is_directory:
            return
        ruta = event.src_path
        if not ruta.lower().endswith(".pdf"):
            return
        if ruta in self._en_proceso:
            return
        self._en_proceso.add(ruta)
        t = threading.Thread(
            target=self._clasificar,
            args=(ruta,),
            daemon=True,
            name=f"watcher-{Path(ruta).stem}",
        )
        t.start()

    def _clasificar(self, ruta: str) -> None:
        try:
            # Esperar a que el archivo termine de escribirse
            time.sleep(1.5)

            from ..database import SessionLocal
            from ..models.db_models import ClasificacionCola
            from ..services.clasificador_service import (
                sha256_file, extraer_texto_pdf, procesar_pdf,
            )

            sha = sha256_file(ruta)
            db = SessionLocal()
            try:
                if db.query(ClasificacionCola).filter(ClasificacionCola.sha256 == sha).first():
                    logger.info("[watcher] Duplicado ignorado: %s", ruta)
                    return

                nombre = Path(ruta).name
                texto, paginas = extraer_texto_pdf(ruta)

                item = ClasificacionCola(
                    nombre_archivo=nombre,
                    ruta_archivo=ruta,
                    sha256=sha,
                    texto_pdf=texto,
                    paginas=paginas,
                    estado="pendiente",
                )
                db.add(item)
                db.flush()

                procesar_pdf(item, db)
                db.commit()
                logger.info("[watcher] %s → estado=%s confianza=%s", nombre, item.estado, item.confianza)
            finally:
                db.close()
        except Exception as exc:
            logger.error("[watcher] Error con %s: %s", ruta, exc)
        finally:
            self._en_proceso.discard(ruta)


# ── API pública ───────────────────────────────────────────────────────────────

def iniciar_watcher(carpeta: str) -> None:
    """Inicia el Observer en la carpeta indicada (idempotente)."""
    global _observer
    with _lock:
        if _observer and _observer.is_alive():
            return
        Path(carpeta).mkdir(parents=True, exist_ok=True)
        handler = _PDFHandler()
        _observer = Observer()
        _observer.schedule(handler, carpeta, recursive=False)
        _observer.start()
        logger.info("[watcher] Vigilando: %s", carpeta)


def detener_watcher() -> None:
    """Detiene el Observer limpiamente."""
    global _observer
    with _lock:
        if _observer:
            _observer.stop()
            _observer.join(timeout=5)
            _observer = None
            logger.info("[watcher] Detenido.")


def estado_watcher() -> dict:
    return {
        "activo": _observer is not None and _observer.is_alive(),
    }
