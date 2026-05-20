"""
Siembra el catálogo completo (42 compañías, 292 subramos) con prioridades reales.
Actualiza compañías y subramos existentes; agrega los que no existan.
"""
from sqlalchemy.orm import Session
from ..models.db_models import Compania, Ramo, Subramo, CampoDefinido
from .._catalogo_generado_ref import COMPANIAS_CON_PRIORIDAD

# ── Campos por ramo (genéricos, aplican a todos los subramos del ramo) ─────────

CAMPOS_VEHICULOS = [
    {"nombre": "numero_poliza",       "label": "Número de Póliza",      "tipo": "texto",   "requerido": True,  "orden": 1},
    {"nombre": "nombre_cliente",      "label": "Nombre / Razón Social",  "tipo": "texto",   "requerido": True,  "orden": 2},
    {"nombre": "rfc",                 "label": "RFC",                    "tipo": "texto",   "requerido": False, "orden": 3},
    {"nombre": "descripcion_vehiculo","label": "Descripción Vehículo",   "tipo": "texto",   "requerido": True,  "orden": 4},
    {"nombre": "placas",              "label": "Placas",                 "tipo": "texto",   "requerido": False, "orden": 5},
    {"nombre": "serie",               "label": "Número de Serie",        "tipo": "texto",   "requerido": False, "orden": 6},
    {"nombre": "motor",               "label": "Número de Motor",        "tipo": "texto",   "requerido": False, "orden": 7},
    {"nombre": "tipo_vehiculo",       "label": "Tipo de Vehículo",       "tipo": "texto",   "requerido": False, "orden": 8},
    {"nombre": "nacional_importado",  "label": "Nacional / Importado",   "tipo": "texto",   "requerido": False, "orden": 9},
    {"nombre": "forma_pago",          "label": "Forma de Pago",          "tipo": "texto",   "requerido": False, "orden": 10},
    {"nombre": "moneda",              "label": "Moneda",                 "tipo": "texto",   "requerido": False, "orden": 11},
    {"nombre": "prima_neta",          "label": "Prima Neta",             "tipo": "moneda",  "requerido": True,  "orden": 12},
    {"nombre": "gastos_expedicion",   "label": "Gastos de Expedición",   "tipo": "moneda",  "requerido": False, "orden": 13},
    {"nombre": "subtotal",            "label": "Subtotal",               "tipo": "moneda",  "requerido": False, "orden": 14},
    {"nombre": "iva",                 "label": "IVA",                    "tipo": "moneda",  "requerido": False, "orden": 15},
    {"nombre": "prima_total",         "label": "Prima Total",            "tipo": "moneda",  "requerido": True,  "orden": 16},
    {"nombre": "inicio_vigencia",     "label": "Inicio de Vigencia",     "tipo": "fecha",   "requerido": True,  "orden": 17},
    {"nombre": "fin_vigencia",        "label": "Fin de Vigencia",        "tipo": "fecha",   "requerido": True,  "orden": 18},
    {"nombre": "colonia",             "label": "Colonia",                "tipo": "texto",   "requerido": False, "orden": 19},
    {"nombre": "municipio",           "label": "Municipio / Alcaldía",   "tipo": "texto",   "requerido": False, "orden": 20},
    {"nombre": "cp",                  "label": "C.P.",                   "tipo": "texto",   "requerido": False, "orden": 21},
    {"nombre": "estado",              "label": "Estado",                 "tipo": "texto",   "requerido": False, "orden": 22},
]

CAMPOS_AYE = [
    {"nombre": "numero_poliza",     "label": "Número de Póliza",     "tipo": "texto",   "requerido": True,  "orden": 1},
    {"nombre": "nombre_cliente",    "label": "Contratante",          "tipo": "texto",   "requerido": True,  "orden": 2},
    {"nombre": "nombre_asegurado",  "label": "Titular / Asegurado",  "tipo": "texto",   "requerido": False, "orden": 3},
    {"nombre": "rfc",               "label": "RFC",                  "tipo": "texto",   "requerido": False, "orden": 4},
    {"nombre": "fecha_nacimiento",  "label": "Fecha de Nacimiento",  "tipo": "fecha",   "requerido": False, "orden": 5},
    {"nombre": "suma_asegurada",    "label": "Suma Asegurada",       "tipo": "moneda",  "requerido": True,  "orden": 6},
    {"nombre": "deducible",         "label": "Deducible",            "tipo": "moneda",  "requerido": False, "orden": 7},
    {"nombre": "coaseguro",         "label": "Coaseguro %",          "tipo": "numero",  "requerido": False, "orden": 8},
    {"nombre": "prima_neta",        "label": "Prima Neta",           "tipo": "moneda",  "requerido": True,  "orden": 9},
    {"nombre": "iva",               "label": "IVA",                  "tipo": "moneda",  "requerido": False, "orden": 10},
    {"nombre": "prima_total",       "label": "Prima Total",          "tipo": "moneda",  "requerido": True,  "orden": 11},
    {"nombre": "inicio_vigencia",   "label": "Inicio de Vigencia",   "tipo": "fecha",   "requerido": True,  "orden": 12},
    {"nombre": "fin_vigencia",      "label": "Fin de Vigencia",      "tipo": "fecha",   "requerido": True,  "orden": 13},
    {"nombre": "forma_pago",        "label": "Forma de Pago",        "tipo": "texto",   "requerido": False, "orden": 14},
    {"nombre": "moneda",            "label": "Moneda",               "tipo": "texto",   "requerido": False, "orden": 15},
]

CAMPOS_VIDA = [
    {"nombre": "numero_poliza",     "label": "Número de Póliza",     "tipo": "texto",   "requerido": True,  "orden": 1},
    {"nombre": "nombre_cliente",    "label": "Contratante",          "tipo": "texto",   "requerido": True,  "orden": 2},
    {"nombre": "nombre_asegurado",  "label": "Asegurado",            "tipo": "texto",   "requerido": False, "orden": 3},
    {"nombre": "beneficiarios",     "label": "Beneficiarios",        "tipo": "texto",   "requerido": False, "orden": 4},
    {"nombre": "rfc",               "label": "RFC",                  "tipo": "texto",   "requerido": False, "orden": 5},
    {"nombre": "suma_asegurada",    "label": "Suma Asegurada",       "tipo": "moneda",  "requerido": True,  "orden": 6},
    {"nombre": "prima_neta",        "label": "Prima Neta",           "tipo": "moneda",  "requerido": True,  "orden": 7},
    {"nombre": "prima_total",       "label": "Prima Total",          "tipo": "moneda",  "requerido": True,  "orden": 8},
    {"nombre": "inicio_vigencia",   "label": "Inicio de Vigencia",   "tipo": "fecha",   "requerido": True,  "orden": 9},
    {"nombre": "fin_vigencia",      "label": "Fin de Vigencia",      "tipo": "fecha",   "requerido": True,  "orden": 10},
    {"nombre": "forma_pago",        "label": "Forma de Pago",        "tipo": "texto",   "requerido": False, "orden": 11},
]

CAMPOS_DANOS = [
    {"nombre": "numero_poliza",     "label": "Número de Póliza",          "tipo": "texto",   "requerido": True,  "orden": 1},
    {"nombre": "nombre_cliente",    "label": "Contratante / Asegurado",   "tipo": "texto",   "requerido": True,  "orden": 2},
    {"nombre": "rfc",               "label": "RFC",                       "tipo": "texto",   "requerido": False, "orden": 3},
    {"nombre": "objeto_asegurado",  "label": "Objeto Asegurado",          "tipo": "texto",   "requerido": False, "orden": 4},
    {"nombre": "suma_asegurada",    "label": "Suma Asegurada",            "tipo": "moneda",  "requerido": True,  "orden": 5},
    {"nombre": "prima_neta",        "label": "Prima Neta",                "tipo": "moneda",  "requerido": True,  "orden": 6},
    {"nombre": "prima_total",       "label": "Prima Total",               "tipo": "moneda",  "requerido": True,  "orden": 7},
    {"nombre": "inicio_vigencia",   "label": "Inicio de Vigencia",        "tipo": "fecha",   "requerido": True,  "orden": 8},
    {"nombre": "fin_vigencia",      "label": "Fin de Vigencia",           "tipo": "fecha",   "requerido": True,  "orden": 9},
    {"nombre": "forma_pago",        "label": "Forma de Pago",             "tipo": "texto",   "requerido": False, "orden": 10},
]

CAMPOS_FIANZAS = [
    {"nombre": "numero_fianza",     "label": "Número de Fianza",          "tipo": "texto",   "requerido": True,  "orden": 1},
    {"nombre": "afianzado",         "label": "Afianzado",                 "tipo": "texto",   "requerido": True,  "orden": 2},
    {"nombre": "beneficiario",      "label": "Beneficiario / Acreedor",   "tipo": "texto",   "requerido": True,  "orden": 3},
    {"nombre": "monto_afianzado",   "label": "Monto Afianzado",           "tipo": "moneda",  "requerido": True,  "orden": 4},
    {"nombre": "prima_total",       "label": "Prima Total",               "tipo": "moneda",  "requerido": True,  "orden": 5},
    {"nombre": "inicio_vigencia",   "label": "Inicio de Vigencia",        "tipo": "fecha",   "requerido": True,  "orden": 6},
    {"nombre": "fin_vigencia",      "label": "Fin de Vigencia",           "tipo": "fecha",   "requerido": True,  "orden": 7},
]

CAMPOS_POR_RAMO = {
    "Vehículos":                  CAMPOS_VEHICULOS,
    "Accidentes y Enfermedades":  CAMPOS_AYE,
    "Vida":                       CAMPOS_VIDA,
    "Daños":                      CAMPOS_DANOS,
    "Fianzas":                    CAMPOS_FIANZAS,
}


def sembrar(db: Session) -> None:
    """Crea o actualiza el catálogo completo con prioridades.
    Desactiva ramos y subramos que ya no existan en el catálogo oficial."""
    for comp_data in COMPANIAS_CON_PRIORIDAD:
        compania = db.query(Compania).filter(Compania.nombre == comp_data["nombre"]).first()
        if not compania:
            compania = Compania(
                nombre=comp_data["nombre"],
                keywords=comp_data["keywords"],
                prioridad=comp_data["prioridad"],
                porcentaje_docs=comp_data["porcentaje_docs"],
            )
            db.add(compania)
            db.flush()
        else:
            compania.keywords = comp_data["keywords"]
            compania.prioridad = comp_data["prioridad"]
            compania.porcentaje_docs = comp_data["porcentaje_docs"]
            db.flush()

        nombres_ramos_validos = {r["nombre"] for r in comp_data["ramos"]}

        for ramo_data in comp_data["ramos"]:
            ramo = db.query(Ramo).filter(
                Ramo.compania_id == compania.id,
                Ramo.nombre == ramo_data["nombre"],
            ).first()
            if not ramo:
                ramo = Ramo(
                    nombre=ramo_data["nombre"],
                    keywords=ramo_data["keywords"],
                    compania_id=compania.id,
                )
                db.add(ramo)
                db.flush()
            else:
                ramo.keywords = ramo_data["keywords"]
                ramo.activo = True
                db.flush()

            campos_def = CAMPOS_POR_RAMO.get(ramo_data["nombre"], [])
            nombres_subs_validos = {s["nombre"] for s in ramo_data["subramos"]}

            for sub_data in ramo_data["subramos"]:
                subramo = db.query(Subramo).filter(
                    Subramo.ramo_id == ramo.id,
                    Subramo.nombre == sub_data["nombre"],
                ).first()
                if not subramo:
                    subramo = Subramo(
                        nombre=sub_data["nombre"],
                        keywords=sub_data["keywords"],
                        ramo_id=ramo.id,
                        prioridad=sub_data["prioridad"],
                        porcentaje_docs=sub_data["porcentaje_docs"],
                    )
                    db.add(subramo)
                    db.flush()
                    for campo_data in campos_def:
                        db.add(CampoDefinido(subramo_id=subramo.id, **campo_data))
                else:
                    subramo.keywords = sub_data["keywords"]
                    subramo.prioridad = sub_data["prioridad"]
                    subramo.porcentaje_docs = sub_data["porcentaje_docs"]
                    subramo.activo = True
                    db.flush()

            # Desactivar subramos que ya no están en el catálogo para este ramo
            db.query(Subramo).filter(
                Subramo.ramo_id == ramo.id,
                Subramo.nombre.notin_(nombres_subs_validos),
            ).update({"activo": False}, synchronize_session=False)
            db.flush()

        # Desactivar ramos que ya no están en el catálogo para esta compañía
        db.query(Ramo).filter(
            Ramo.compania_id == compania.id,
            Ramo.nombre.notin_(nombres_ramos_validos),
        ).update({"activo": False}, synchronize_session=False)
        db.flush()

    db.commit()
