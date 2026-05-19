"""
Datos semilla: compañías, ramos, subramos y campos definidos.
Se ejecuta una sola vez al iniciar si la BD está vacía.
"""
from sqlalchemy.orm import Session
from ..models.db_models import Compania, Ramo, Subramo, CampoDefinido

# ── Catálogo de compañías ────────────────────────────────────────────────────
COMPANIAS = [
    {"nombre": "Quálitas",          "keywords": ["qualitas", "quálitas", "q seguros", "cualitas"]},
    {"nombre": "GNP Seguros",       "keywords": ["gnp seguros", "grupo nacional provincial", "g.n.p.", "gnp"]},
    {"nombre": "ANA Seguros",       "keywords": ["ana seguros", "agente nacional de seguros", "ana"]},
    {"nombre": "HDI Seguros",       "keywords": ["hdi seguros", "hdi", "hannover"]},
    {"nombre": "Banorte Seguros",   "keywords": ["banorte seguros", "seguros banorte", "banorte"]},
    {"nombre": "Seguros El Potosí", "keywords": ["el potosí", "el potosi", "seguros potosí", "potosi"]},
    {"nombre": "Mapfre",            "keywords": ["mapfre"]},
    {"nombre": "AXA Seguros",       "keywords": ["axa seguros", "axa"]},
    {"nombre": "Zurich",            "keywords": ["zurich", "zürich", "zurich seguros"]},
    {"nombre": "BBVA Seguros",      "keywords": ["bbva seguros", "bbva"]},
]

# ── Ramos por compañía (aplica a todas) ──────────────────────────────────────
RAMOS_GLOBALES = [
    {"nombre": "Autos",   "keywords": ["automóvil", "vehículo", "vehiculo", "auto", "flotilla", "placas"]},
    {"nombre": "GMM",     "keywords": ["gastos médicos", "gastos medicos", "gmm", "médico mayor", "hospitalización"]},
    {"nombre": "Vida",    "keywords": ["seguro de vida", "vida", "fallecimiento", "beneficiario", "suma asegurada de vida"]},
    {"nombre": "Daños",   "keywords": ["responsabilidad civil", "r.c.", "daños", "hogar", "empresarial", "incendio"]},
]

# ── Subramos por nombre de ramo ───────────────────────────────────────────────
SUBRAMOS_POR_RAMO = {
    "Autos": [
        {"nombre": "Particular",   "keywords": ["particular", "uso particular", "automóvil particular"]},
        {"nombre": "Flotilla",     "keywords": ["flotilla", "flota vehicular", "múltiples unidades"]},
        {"nombre": "Motocicleta",  "keywords": ["motocicleta", "moto", "ciclomotor"]},
        {"nombre": "Pesado",       "keywords": ["camión", "pesado", "carga", "tractocamión", "trailer"]},
    ],
    "GMM": [
        {"nombre": "Individual",   "keywords": ["individual", "personal", "titular"]},
        {"nombre": "Colectivo",    "keywords": ["colectivo", "grupal", "empresa", "contratante colectivo"]},
    ],
    "Vida": [
        {"nombre": "Individual",   "keywords": ["individual", "personal"]},
        {"nombre": "Grupo",        "keywords": ["grupo", "grupal", "colectivo de vida"]},
        {"nombre": "Temporal",     "keywords": ["temporal", "término fijo"]},
    ],
    "Daños": [
        {"nombre": "Hogar",        "keywords": ["hogar", "casa habitación", "casa habitacion", "residencia"]},
        {"nombre": "RC General",   "keywords": ["responsabilidad civil", "r.c. general", "rc general"]},
        {"nombre": "Empresarial",  "keywords": ["empresarial", "negocio", "comercial", "pymes"]},
    ],
}

# ── Campos definidos por ramo ─────────────────────────────────────────────────
CAMPOS_POR_RAMO = {
    "Autos": [
        {"nombre": "numero_poliza",      "label": "Número de Póliza",    "tipo": "texto",   "requerido": True,  "orden": 1},
        {"nombre": "nombre_cliente",     "label": "Nombre / Razón Social","tipo": "texto",   "requerido": True,  "orden": 2},
        {"nombre": "rfc",                "label": "RFC",                  "tipo": "texto",   "requerido": False, "orden": 3},
        {"nombre": "descripcion_vehiculo","label": "Descripción Vehículo", "tipo": "texto",  "requerido": True,  "orden": 4},
        {"nombre": "placas",             "label": "Placas",               "tipo": "texto",   "requerido": False, "orden": 5},
        {"nombre": "serie",              "label": "Número de Serie",       "tipo": "texto",  "requerido": False, "orden": 6},
        {"nombre": "motor",              "label": "Número de Motor",       "tipo": "texto",  "requerido": False, "orden": 7},
        {"nombre": "tipo_vehiculo",      "label": "Tipo de Vehículo",      "tipo": "texto",  "requerido": False, "orden": 8},
        {"nombre": "nacional_importado", "label": "Nacional / Importado",  "tipo": "texto",  "requerido": False, "orden": 9},
        {"nombre": "forma_pago",         "label": "Forma de Pago",         "tipo": "texto",  "requerido": False, "orden": 10},
        {"nombre": "moneda",             "label": "Moneda",                "tipo": "texto",  "requerido": False, "orden": 11},
        {"nombre": "prima_neta",         "label": "Prima Neta",            "tipo": "moneda", "requerido": True,  "orden": 12},
        {"nombre": "gastos_expedicion",  "label": "Gastos de Expedición",  "tipo": "moneda", "requerido": False, "orden": 13},
        {"nombre": "subtotal",           "label": "Subtotal",              "tipo": "moneda", "requerido": False, "orden": 14},
        {"nombre": "iva",                "label": "IVA",                   "tipo": "moneda", "requerido": False, "orden": 15},
        {"nombre": "prima_total",        "label": "Prima Total",           "tipo": "moneda", "requerido": True,  "orden": 16},
        {"nombre": "inicio_vigencia",    "label": "Inicio de Vigencia",    "tipo": "fecha",  "requerido": True,  "orden": 17},
        {"nombre": "fin_vigencia",       "label": "Fin de Vigencia",       "tipo": "fecha",  "requerido": True,  "orden": 18},
        {"nombre": "colonia",            "label": "Colonia",               "tipo": "texto",  "requerido": False, "orden": 19},
        {"nombre": "municipio",          "label": "Municipio / Alcaldía",  "tipo": "texto",  "requerido": False, "orden": 20},
        {"nombre": "cp",                 "label": "C.P.",                  "tipo": "texto",  "requerido": False, "orden": 21},
        {"nombre": "estado",             "label": "Estado",                "tipo": "texto",  "requerido": False, "orden": 22},
    ],
    "GMM": [
        {"nombre": "numero_poliza",      "label": "Número de Póliza",    "tipo": "texto",   "requerido": True,  "orden": 1},
        {"nombre": "nombre_cliente",     "label": "Contratante",         "tipo": "texto",   "requerido": True,  "orden": 2},
        {"nombre": "nombre_asegurado",   "label": "Titular / Asegurado", "tipo": "texto",   "requerido": False, "orden": 3},
        {"nombre": "rfc",                "label": "RFC",                  "tipo": "texto",  "requerido": False, "orden": 4},
        {"nombre": "fecha_nacimiento",   "label": "Fecha de Nacimiento",  "tipo": "fecha",  "requerido": False, "orden": 5},
        {"nombre": "suma_asegurada",     "label": "Suma Asegurada",       "tipo": "moneda", "requerido": True,  "orden": 6},
        {"nombre": "deducible",          "label": "Deducible",            "tipo": "moneda", "requerido": False, "orden": 7},
        {"nombre": "coaseguro",          "label": "Coaseguro %",          "tipo": "numero", "requerido": False, "orden": 8},
        {"nombre": "tope_coaseguro",     "label": "Tope de Coaseguro",    "tipo": "moneda", "requerido": False, "orden": 9},
        {"nombre": "prima_neta",         "label": "Prima Neta",           "tipo": "moneda", "requerido": True,  "orden": 10},
        {"nombre": "iva",                "label": "IVA",                  "tipo": "moneda", "requerido": False, "orden": 11},
        {"nombre": "prima_total",        "label": "Prima Total",          "tipo": "moneda", "requerido": True,  "orden": 12},
        {"nombre": "inicio_vigencia",    "label": "Inicio de Vigencia",   "tipo": "fecha",  "requerido": True,  "orden": 13},
        {"nombre": "fin_vigencia",       "label": "Fin de Vigencia",      "tipo": "fecha",  "requerido": True,  "orden": 14},
        {"nombre": "forma_pago",         "label": "Forma de Pago",        "tipo": "texto",  "requerido": False, "orden": 15},
        {"nombre": "moneda",             "label": "Moneda",               "tipo": "texto",  "requerido": False, "orden": 16},
    ],
    "Vida": [
        {"nombre": "numero_poliza",      "label": "Número de Póliza",    "tipo": "texto",   "requerido": True,  "orden": 1},
        {"nombre": "nombre_cliente",     "label": "Contratante",         "tipo": "texto",   "requerido": True,  "orden": 2},
        {"nombre": "nombre_asegurado",   "label": "Asegurado",           "tipo": "texto",   "requerido": False, "orden": 3},
        {"nombre": "beneficiarios",      "label": "Beneficiarios",       "tipo": "texto",   "requerido": False, "orden": 4},
        {"nombre": "rfc",                "label": "RFC",                  "tipo": "texto",  "requerido": False, "orden": 5},
        {"nombre": "suma_asegurada",     "label": "Suma Asegurada",       "tipo": "moneda", "requerido": True,  "orden": 6},
        {"nombre": "prima_neta",         "label": "Prima Neta",           "tipo": "moneda", "requerido": True,  "orden": 7},
        {"nombre": "prima_total",        "label": "Prima Total",          "tipo": "moneda", "requerido": True,  "orden": 8},
        {"nombre": "inicio_vigencia",    "label": "Inicio de Vigencia",   "tipo": "fecha",  "requerido": True,  "orden": 9},
        {"nombre": "fin_vigencia",       "label": "Fin de Vigencia",      "tipo": "fecha",  "requerido": True,  "orden": 10},
        {"nombre": "forma_pago",         "label": "Forma de Pago",        "tipo": "texto",  "requerido": False, "orden": 11},
    ],
    "Daños": [
        {"nombre": "numero_poliza",      "label": "Número de Póliza",    "tipo": "texto",   "requerido": True,  "orden": 1},
        {"nombre": "nombre_cliente",     "label": "Contratante / Asegurado","tipo": "texto","requerido": True,  "orden": 2},
        {"nombre": "rfc",                "label": "RFC",                  "tipo": "texto",  "requerido": False, "orden": 3},
        {"nombre": "objeto_asegurado",   "label": "Objeto Asegurado",     "tipo": "texto",  "requerido": False, "orden": 4},
        {"nombre": "suma_asegurada",     "label": "Suma Asegurada",       "tipo": "moneda", "requerido": True,  "orden": 5},
        {"nombre": "prima_neta",         "label": "Prima Neta",           "tipo": "moneda", "requerido": True,  "orden": 6},
        {"nombre": "prima_total",        "label": "Prima Total",          "tipo": "moneda", "requerido": True,  "orden": 7},
        {"nombre": "inicio_vigencia",    "label": "Inicio de Vigencia",   "tipo": "fecha",  "requerido": True,  "orden": 8},
        {"nombre": "fin_vigencia",       "label": "Fin de Vigencia",      "tipo": "fecha",  "requerido": True,  "orden": 9},
        {"nombre": "forma_pago",         "label": "Forma de Pago",        "tipo": "texto",  "requerido": False, "orden": 10},
    ],
}


def sembrar(db: Session) -> None:
    """Inserta datos semilla si la BD está vacía."""
    if db.query(Compania).count() > 0:
        return  # Ya sembrado

    for comp_data in COMPANIAS:
        compania = Compania(**comp_data)
        db.add(compania)
        db.flush()

        for ramo_data in RAMOS_GLOBALES:
            ramo = Ramo(
                nombre=ramo_data["nombre"],
                keywords=ramo_data["keywords"],
                compania_id=compania.id,
            )
            db.add(ramo)
            db.flush()

            subramos_def = SUBRAMOS_POR_RAMO.get(ramo_data["nombre"], [])
            for sub_data in subramos_def:
                subramo = Subramo(
                    nombre=sub_data["nombre"],
                    keywords=sub_data["keywords"],
                    ramo_id=ramo.id,
                )
                db.add(subramo)
                db.flush()

                campos_def = CAMPOS_POR_RAMO.get(ramo_data["nombre"], [])
                for campo_data in campos_def:
                    db.add(CampoDefinido(subramo_id=subramo.id, **campo_data))

    db.commit()
