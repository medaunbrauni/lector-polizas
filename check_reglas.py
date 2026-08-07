import sqlite3

conn = sqlite3.connect('lector_polizas.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print("=== SUBRAMOS ACTIVOS (QUALITAS / GNP) ===\n")
cur.execute("""
    SELECT s.id, c.nombre as compania, ra.nombre as ramo, s.nombre as subramo, s.activo
    FROM subramos s
    JOIN ramos ra ON s.ramo_id = ra.id
    JOIN companias c ON ra.compania_id = c.id
    WHERE c.nombre LIKE '%litas%' OR c.nombre LIKE 'GNP%'
    ORDER BY c.nombre, s.activo DESC, ra.nombre, s.nombre
""")
for row in cur.fetchall():
    estado = "ACTIVO  " if row["activo"] else "INACTIVO"
    print(f"  [{estado}] id={row['id']:3d}  {row['compania']} > {row['ramo']} > {row['subramo']}")

print("\n=== REGLAS y su SUBRAMO en BD ===\n")
cur.execute("""
    SELECT r.id, r.subramo_id, s.nombre as subramo, s.activo as sub_activo,
           ra.nombre as ramo, c.nombre as compania,
           r.nombre_campo, r.activo as regla_activa,
           COALESCE(r.es_borrador, 0) as es_borrador
    FROM reglas_extraccion r
    JOIN subramos s ON r.subramo_id = s.id
    JOIN ramos ra ON s.ramo_id = ra.id
    JOIN companias c ON ra.compania_id = c.id
    ORDER BY c.nombre, r.nombre_campo
""")
for row in cur.fetchall():
    sub_estado = "activo" if row["sub_activo"] else "INACTIVO"
    reg_estado = "activa" if row["regla_activa"] and not row["es_borrador"] else "INACTIVA"
    print(f"  regla_id={row['id']} campo={row['nombre_campo']}")
    print(f"    -> subramo_id={row['subramo_id']} ({sub_estado}): {row['compania']} > {row['ramo']} > {row['subramo']}")
    print(f"    -> regla: {reg_estado}")
    print()

print("=== EXTRACCIONES RECIENTES ===\n")
cur.execute("""
    SELECT e.id, e.nombre_archivo, e.compania_detectada, e.ramo_detectado,
           e.subramo_detectado, e.subramo_id, e.campos_por_regla, e.campos_por_ia,
           e.campos_no_encontrados, e.created_at
    FROM extracciones e
    ORDER BY e.created_at DESC
    LIMIT 5
""")
for row in cur.fetchall():
    print(f"  id={row['id']} archivo={row['nombre_archivo']}")
    print(f"    detectado: {row['compania_detectada']} > {row['ramo_detectado']} > {row['subramo_detectado']} (subramo_id={row['subramo_id']})")
    print(f"    campos: regla={row['campos_por_regla']}  ia={row['campos_por_ia']}  no_encontrado={row['campos_no_encontrados']}")
    print()

conn.close()
