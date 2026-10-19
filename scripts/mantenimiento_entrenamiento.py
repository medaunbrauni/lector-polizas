"""
Mantenimiento MANUAL del lote del Entrenador (nada se ejecuta solo).

  python scripts/mantenimiento_entrenamiento.py                    # solo reporta
  python scripts/mantenimiento_entrenamiento.py --aplicar          # además llena sha256 faltantes
  python scripts/mantenimiento_entrenamiento.py --rechazados 30 --aplicar   # borra rechazados con >30 días

1. Calcula el sha256 de las pólizas que no lo tienen (por su archivo en disco),
   para que los envíos automáticos puedan deduplicar contra ellas.
2. Reporta duplicados (mismo subramo + mismo contenido). NUNCA los borra: eso se
   decide en el Entrenador.
3. Con --rechazados N: lista (y con --aplicar borra) los PDFs de storage/rechazados
   con más de N días sin asignar a un subramo.
"""
import argparse
import hashlib
import os
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.config import RECHAZADOS_DIR  # noqa: E402
from api.database import SessionLocal  # noqa: E402
from api.models.db_models import PolizaEntrenamiento  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--aplicar", action="store_true", help="escribir cambios (por defecto solo reporta)")
ap.add_argument("--rechazados", type=int, metavar="DIAS", help="revisar PDFs rechazados con más de DIAS días")
args = ap.parse_args()

db = SessionLocal()
polizas = db.query(PolizaEntrenamiento).all()

sin_sha = [p for p in polizas if not p.sha256]
llenadas = sin_archivo = 0
for p in sin_sha:
    if not os.path.exists(p.ruta_archivo):
        sin_archivo += 1
        continue
    p.sha256 = hashlib.sha256(Path(p.ruta_archivo).read_bytes()).hexdigest()
    llenadas += 1
print(f"Pólizas: {len(polizas)} | sin sha256: {len(sin_sha)} | calculables: {llenadas} | sin archivo en disco: {sin_archivo}")

grupos = defaultdict(list)
for p in polizas:
    if p.sha256:
        grupos[(p.subramo_id, p.sha256)].append(p)
dups = {k: v for k, v in grupos.items() if len(v) > 1}
print(f"Grupos duplicados (mismo subramo y contenido): {len(dups)}")
for (subramo_id, _), v in sorted(dups.items()):
    print(f"  subramo {subramo_id}: {v[0].nombre_archivo!r} x{len(v)} -> ids {[p.id for p in v]}"
          f" (entrenadas: {[p.id for p in v if p.entrenado]})")

if args.aplicar:
    db.commit()
    print("sha256 guardados.")
else:
    db.rollback()
    print("(solo reporte: usa --aplicar para guardar los sha256)")

if args.rechazados is not None and os.path.isdir(RECHAZADOS_DIR):
    limite = time.time() - args.rechazados * 86400
    viejos = [f for f in Path(RECHAZADOS_DIR).glob("*.pdf") if f.stat().st_mtime < limite]
    print(f"Rechazados con más de {args.rechazados} días: {len(viejos)}")
    if args.aplicar:
        for f in viejos:
            f.unlink()
        print("borrados.")
db.close()
