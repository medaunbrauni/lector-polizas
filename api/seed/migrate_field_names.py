"""
Migración única: normaliza nombres de campos en la BD existente.

Renombra en campos_definidos, reglas_extraccion, selecciones_campo
y campos_extraidos para usar los nombres canónicos (iguales a los globales):

  numero_poliza      → documento
  inicio_vigencia    → desde
  fin_vigencia       → hasta
  descripcion_vehiculo → descripcion_veh
  gastos_expedicion  → derechos

Ejecutar UNA SOLA VEZ:
  cd lector-polizas
  python -m api.seed.migrate_field_names

Idempotente: no hace nada si los nombres ya fueron renombrados.
"""
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from sqlalchemy import text

# Cargar engine directamente (sin depender del app lifecycle)
from api.database import engine

RENOMBRES = [
    ("numero_poliza",       "documento"),
    ("inicio_vigencia",     "desde"),
    ("fin_vigencia",        "hasta"),
    ("descripcion_vehiculo","descripcion_veh"),
    ("gastos_expedicion",   "derechos"),
]

TABLAS_CON_NOMBRE_CAMPO = [
    "campos_definidos",      # columna: nombre
    "reglas_extraccion",     # columna: nombre_campo
    "selecciones_campo",     # columna: nombre_campo
    "campos_extraidos",      # columna: nombre_campo
]

# Mapeo tabla → columna exacta
COLUMNA = {
    "campos_definidos":  "nombre",
    "reglas_extraccion": "nombre_campo",
    "selecciones_campo": "nombre_campo",
    "campos_extraidos":  "nombre_campo",
}


def run_migration():
    print("=" * 60)
    print("MIGRACION: Normalizacion de nombres de campos")
    print("=" * 60)

    with engine.connect() as conn:
        total_updates = 0

        for viejo, nuevo in RENOMBRES:
            print(f"\n  {viejo!r} → {nuevo!r}")
            for tabla in TABLAS_CON_NOMBRE_CAMPO:
                col = COLUMNA[tabla]
                # Contar registros a renombrar
                count_q = text(f"SELECT COUNT(*) FROM {tabla} WHERE {col} = :viejo")
                count = conn.execute(count_q, {"viejo": viejo}).scalar() or 0

                if count > 0:
                    upd_q = text(f"UPDATE {tabla} SET {col} = :nuevo WHERE {col} = :viejo")
                    conn.execute(upd_q, {"nuevo": nuevo, "viejo": viejo})
                    conn.commit()
                    print(f"    OK {tabla}.{col}: {count} registros actualizados")
                    total_updates += count
                else:
                    print(f"    · {tabla}.{col}: sin cambios")

        # También actualizar datos_completos en extracciones (JSON column)
        print("\n  Actualizando clave en extracciones.datos_completos (JSON)…")
        for viejo, nuevo in RENOMBRES:
            # SQLite: json_each + replace en texto (compatible sin extensiones)
            upd_json = text("""
                UPDATE extracciones
                SET datos_completos = REPLACE(
                    datos_completos,
                    :patron_viejo,
                    :patron_nuevo
                )
                WHERE datos_completos LIKE :like_pattern
            """)
            conn.execute(upd_json, {
                "patron_viejo": f'"{viejo}":',
                "patron_nuevo":  f'"{nuevo}":',
                "like_pattern":  f'%"{viejo}":%',
            })
            conn.commit()

    print(f"\n{'=' * 60}")
    print(f"[OK] Migracion completada. Total de filas actualizadas: {total_updates}")
    print("=" * 60)


if __name__ == "__main__":
    run_migration()
