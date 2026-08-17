"""
Campos globales estándar para exportación a mesa de control (Sicas).
Se insertan en todos los subramos como base común de extracción.
"""
from sqlalchemy.orm import Session
from ..models.db_models import CampoGlobal


CAMPOS = [
    # ── Asegurado ───────────────────────────────────────────────────────
    # "Cliente" (nombre_cliente, por subramo) ya cubre nombre completo o
    # razón social para ambos tipos de persona — no se agregan
    # apellido_paterno/apellido_materno/nombre/razon_social por separado.
    dict(nombre="rfc",               label="R.F.C.",               tipo="texto",    orden=6),
    # ── Póliza ──────────────────────────────────────────────────────────
    dict(nombre="documento",         label="Documento",            tipo="texto",    orden=11, requerido=True,
         descripcion="Número de póliza"),
    # "agente" (clave+nombre combinados) fue reemplazado por los campos
    # agente_clave/agente_nombre por subramo — ver CampoDefinido de GNP/Qualitas.
    dict(nombre="forma_pago",        label="Forma Pago",           tipo="catalogo", orden=13,
         descripcion="Según catálogo Sicas"),
    dict(nombre="moneda",            label="Moneda",               tipo="catalogo", orden=14,
         descripcion="Según catálogo Sicas"),
    dict(nombre="sub_ramo_sicas",    label="Sub Ramo",             tipo="catalogo", orden=15,
         descripcion="Según catálogo Sicas"),
    # ── Vigencia ────────────────────────────────────────────────────────
    dict(nombre="desde",             label="Desde",                tipo="fecha",    orden=19, requerido=True,
         descripcion="Inicio de vigencia  dd/mm/aaaa"),
    dict(nombre="hasta",             label="Hasta",                tipo="fecha",    orden=20, requerido=True,
         descripcion="Fin de vigencia  dd/mm/aaaa"),
    # ── Primas ──────────────────────────────────────────────────────────
    dict(nombre="prima_neta",        label="Prima Neta",           tipo="moneda",   orden=22, requerido=True),
    dict(nombre="descuento",         label="Descuento",            tipo="moneda",   orden=23),
    dict(nombre="recargos",          label="Recargos",             tipo="moneda",   orden=24),
    dict(nombre="derechos",          label="Derechos",             tipo="moneda",   orden=25),
    dict(nombre="sub_total",         label="Sub Total",            tipo="moneda",   orden=26,
         descripcion="Campo calculado: Prima Neta - Descuento + Recargos + Derechos (no se extrae del PDF)"),
    dict(nombre="iva",               label="IVA",                  tipo="moneda",   orden=27),
    dict(nombre="prima_total",       label="Prima Total",          tipo="moneda",   orden=28, requerido=True),
    dict(nombre="concepto",          label="Concepto",             tipo="texto",    orden=29,
         descripcion="Descripción breve de lo asegurado"),
    # ── Vehículos (solo ramos de tipo vehicular) ─────────────────────────
    dict(nombre="serie",             label="Serie",                tipo="texto",    orden=30, grupo="vehiculos"),
    dict(nombre="descripcion_veh",   label="Descripción",          tipo="texto",    orden=31, grupo="vehiculos"),
    dict(nombre="modelo",            label="Modelo",               tipo="numero",   orden=32, grupo="vehiculos",
         descripcion="Año del vehículo"),
    dict(nombre="motor",             label="Motor",                tipo="texto",    orden=33, grupo="vehiculos"),
    dict(nombre="placas",            label="Placas",               tipo="texto",    orden=34, grupo="vehiculos"),
]


def sembrar_campos_globales(db: Session) -> None:
    """Inserta o actualiza los campos globales estándar. Idempotente."""
    for datos in CAMPOS:
        existente = db.query(CampoGlobal).filter(CampoGlobal.nombre == datos["nombre"]).first()
        if existente:
            for k, v in datos.items():
                setattr(existente, k, v)
        else:
            db.add(CampoGlobal(**datos))
    db.commit()
