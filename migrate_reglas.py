"""
Migra las reglas_extraccion de subramos obsoletos (ramo "Autos") al
subramo equivalente en el catálogo nuevo (ramo "Vehículos").

Mapeo de nombres:
  Particular   -> Automóviles
  Flotilla     -> Flotilla de Vehiculos
  Motocicleta  -> Motocicletas
  Pesado       -> Camiones
"""
import sqlite3

conn = sqlite3.connect('lector_polizas.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()

NOMBRE_MAP = {
    "Particular":  "Automóviles",
    "Flotilla":    "Flotilla de Vehiculos",
    "Motocicleta": "Motocicletas",
    "Pesado":      "Camiones",
}

# Encontrar reglas en subramos bajo ramos "Autos" o "Pesado" (antiguos)
cur.execute("""
    SELECT r.id as regla_id, r.subramo_id, r.nombre_campo,
           s.nombre as sub_nombre, ra.nombre as ramo_nombre,
           c.id as compania_id, c.nombre as compania_nombre
    FROM reglas_extraccion r
    JOIN subramos s ON r.subramo_id = s.id
    JOIN ramos ra ON s.ramo_id = ra.id
    JOIN companias c ON ra.compania_id = c.id
    WHERE ra.nombre NOT IN ('Vehículos', 'Vehiculos')
      AND ra.nombre IN ('Autos', 'Pesado', 'Camiones', 'Flotilla')
""")
reglas_obsoletas = cur.fetchall()

if not reglas_obsoletas:
    print("No se encontraron reglas en subramos obsoletos.")
else:
    print(f"Reglas a migrar: {len(reglas_obsoletas)}\n")
    for reg in reglas_obsoletas:
        sub_viejo = reg["sub_nombre"]
        sub_nuevo_nombre = NOMBRE_MAP.get(sub_viejo)
        if not sub_nuevo_nombre:
            print(f"  SKIP regla_id={reg['regla_id']}: sin mapeo para '{sub_viejo}'")
            continue

        # Buscar el subramo nuevo en la misma compañía bajo ramo "Vehículos"
        cur.execute("""
            SELECT s.id
            FROM subramos s
            JOIN ramos ra ON s.ramo_id = ra.id
            WHERE ra.compania_id = ?
              AND ra.nombre = 'Vehículos'
              AND s.nombre = ?
              AND s.activo = 1
        """, (reg["compania_id"], sub_nuevo_nombre))
        nuevo = cur.fetchone()

        if not nuevo:
            print(f"  SKIP regla_id={reg['regla_id']}: no se encontró subramo nuevo '{sub_nuevo_nombre}' en {reg['compania_nombre']}")
            continue

        nuevo_id = nuevo["id"]
        print(f"  OK regla_id={reg['regla_id']} campo={reg['nombre_campo']}")
        print(f"     {reg['compania_nombre']} > {reg['ramo_nombre']} > {sub_viejo}  (id={reg['subramo_id']})")
        print(f"     -> Vehículos > {sub_nuevo_nombre}  (id={nuevo_id})")
        cur.execute("UPDATE reglas_extraccion SET subramo_id = ? WHERE id = ?",
                    (nuevo_id, reg["regla_id"]))

    conn.commit()
    print("\nMigración completada.")

# ── Resumen post-migración ───────────────────────────────────────────────────
print("\n=== ESTADO FINAL DE REGLAS ===\n")
cur.execute("""
    SELECT r.id, c.nombre as compania, ra.nombre as ramo, s.nombre as subramo,
           r.nombre_campo, r.patron_regex,
           r.activo, COALESCE(r.es_borrador, 0) as es_borrador
    FROM reglas_extraccion r
    JOIN subramos s ON r.subramo_id = s.id
    JOIN ramos ra ON s.ramo_id = ra.id
    JOIN companias c ON ra.compania_id = c.id
    ORDER BY c.nombre, ra.nombre, s.nombre, r.nombre_campo
""")
for row in cur.fetchall():
    estado = "ACTIVA  " if row["activo"] and not row["es_borrador"] else "INACTIVA"
    print(f"  [{estado}] id={row['id']} | {row['compania']} > {row['ramo']} > {row['subramo']}")
    print(f"            campo={row['nombre_campo']}  patron={row['patron_regex'][:70]}")

conn.close()
