"""
Campos globales estándar para exportación a mesa de control (Sicas).
Se insertan en todos los subramos como base común de extracción.
"""
from sqlalchemy.orm import Session
from ..models.db_models import CampoGlobal


CAMPOS = [
    # ── Asegurado ───────────────────────────────────────────────────────
    dict(nombre="entidad",           label="Entidad",              tipo="catalogo", orden=1,  requerido=True,
         descripcion="Auto-derivado del RFC: 13 chars → Persona Física · 12 chars → Persona Moral"),
    dict(nombre="apellido_paterno",  label="Apellido Paterno",     tipo="texto",    orden=2),
    dict(nombre="apellido_materno",  label="Apellido Materno",     tipo="texto",    orden=3),
    dict(nombre="nombre",            label="Nombre",               tipo="texto",    orden=4),
    dict(nombre="razon_social",      label="Razón Social",         tipo="texto",    orden=5,
         descripcion="Obligatorio para personas morales"),
    dict(nombre="rfc",               label="R.F.C.",               tipo="texto",    orden=6),
    # ── Agente / Despacho ───────────────────────────────────────────────
    dict(nombre="grupo",             label="Grupo",                tipo="texto",    orden=7,
         valor_fijo="General"),
    dict(nombre="ejecutivo_cuenta",  label="Ejecutivo de Cuenta",  tipo="texto",    orden=8,
         descripcion="Apellido Paterno, Materno, Nombre del agente"),
    dict(nombre="despacho",          label="Despacho",             tipo="texto",    orden=9),
    # ── Póliza ──────────────────────────────────────────────────────────
    dict(nombre="tipo_documento",    label="Tipo Documento",       tipo="catalogo", orden=10,
         valor_fijo="Poliza", descripcion="Poliza | Fianza"),
    dict(nombre="documento",         label="Documento",            tipo="texto",    orden=11, requerido=True,
         descripcion="Número de póliza"),
    dict(nombre="agente",            label="Agente",               tipo="texto",    orden=12,
         descripcion="Clave del agente con la compañía"),
    dict(nombre="forma_pago",        label="Forma Pago",           tipo="catalogo", orden=13,
         descripcion="Según catálogo Sicas"),
    dict(nombre="moneda",            label="Moneda",               tipo="catalogo", orden=14,
         descripcion="Según catálogo Sicas"),
    dict(nombre="sub_ramo_sicas",    label="Sub Ramo",             tipo="catalogo", orden=15,
         descripcion="Código de subramo según catálogo Sicas"),
    dict(nombre="vendedor",          label="Vendedor",             tipo="texto",    orden=16,
         descripcion="Apellido Paterno, Materno, Nombre del agente"),
    # ── Vigencia ────────────────────────────────────────────────────────
    dict(nombre="renovacion",        label="Renovación",           tipo="numero",   orden=17,
         valor_fijo="0", descripcion="Número de renovaciones; 0 para pólizas nuevas"),
    dict(nombre="fecha_antiguedad",  label="Fecha Antigüedad",     tipo="fecha",    orden=18,
         descripcion="Si no se conoce, usar la misma fecha de inicio de vigencia"),
    dict(nombre="desde",             label="Desde",                tipo="fecha",    orden=19, requerido=True,
         descripcion="Inicio de vigencia  dd/mm/aaaa"),
    dict(nombre="hasta",             label="Hasta",                tipo="fecha",    orden=20, requerido=True,
         descripcion="Fin de vigencia  dd/mm/aaaa"),
    dict(nombre="estatus",           label="Estatus",              tipo="numero",   orden=21,
         valor_fijo="0", descripcion="0 = Vigente"),
    # ── Primas ──────────────────────────────────────────────────────────
    dict(nombre="prima_neta",        label="Prima Neta",           tipo="moneda",   orden=22, requerido=True),
    dict(nombre="descuento",         label="Descuento",            tipo="moneda",   orden=23),
    dict(nombre="recargos",          label="Recargos",             tipo="moneda",   orden=24),
    dict(nombre="derechos",          label="Derechos",             tipo="moneda",   orden=25),
    dict(nombre="sub_total",         label="Sub Total",            tipo="moneda",   orden=26,
         descripcion="Prima Neta - Descuento + Recargos + Derechos"),
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
