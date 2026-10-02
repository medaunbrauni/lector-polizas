"""
Extractor especializado para Seguros El Potosí — Fase 1 de la
arquitectura de extracción en 3 niveles.

Estructura y convenciones portadas de gnp.py (misma interfaz `extraer()`,
mismo truco de re-leer el PDF con PyMuPDF vía _leer_con_fitz, mismos
helpers de posicionamiento por bbox, mismo manejo de Sub Total/RFC/figuras
jurídicas). A diferencia de GNP —que mezcla layouts de línea única y de
tabla, con varios fallbacks por campo—, el layout de El Potosí es un PDF
generado por reporteador (RDF/Crystal Reports, "carpoaui.rdf") con texto
absolutamente posicionado: casi todos los campos son pares etiqueta:valor
en la MISMA fila (tabla de 2 columnas), y el bloque de montos
("DETALLES DE MOVIMIENTO") y el de agente traen la etiqueta arriba y el
valor centrado debajo. Por eso este módulo agrega _valor_por_columna
(match por centro de X, no por x0 como en GNP) en vez de reusar
_valor_por_posicion para esos dos bloques.

Campos del esquema SIN extracción dedicada aquí (a propósito):
    - "renovacion": no existe un concepto de "Renovación" en el
      encabezado de este layout (a diferencia de GNP).

Colonia/Municipio/C.P. se validan contra el Catálogo Nacional de Códigos
Postales de Correos de México (ver catalogo_cp.py) en vez de confiar
solo en el parseo de texto libre de "Dirección"/"Domicilio de Riesgo".
"""
from __future__ import annotations
import logging
import re
import unicodedata

import fitz  # PyMuPDF

from .catalogo_cp import validar_direccion_cp
from .figuras_juridicas import es_persona_moral_por_nombre, normalizar_siglas_razon_social


def _leer_con_fitz(pdf_bytes: bytes) -> tuple[str, list[dict]]:
    """Igual que en gnp.py/qualitas.py: se regenera el texto con PyMuPDF
    (en vez de usar el de pdfplumber del pipeline principal) porque los
    helpers de bbox de este módulo están calibrados contra su
    page.get_text('dict')."""
    texto = ""
    paginas_dict = []
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        for pagina in doc:
            texto += pagina.get_text()
            paginas_dict.append(pagina.get_text("dict"))
    return texto, paginas_dict


def es_poliza_auto_el_potosi(texto: str) -> bool:
    t = texto.lower()
    palabras_clave = [
        "datos del riesgo asegurado", "no. de serie", "no. de motor",
        "tipo vehículo", "seguro de automóviles", "seguro de autos",
    ]
    return any(p in t for p in palabras_clave)


def _sin_acentos(valor: str) -> str:
    descompuesto = unicodedata.normalize("NFKD", valor)
    return "".join(c for c in descompuesto if not unicodedata.combining(c))


# El encabezado de la carátula imprime el nombre comercial del producto
# ("SEGURO DE AUTOMÓVILES RESIDENTES", "... FRONTERIZOS", "... FLOTILLA",
# etc.) — se usa como señal para corregir el Subramo cuando el puntaje
# genérico por keywords de la tabla `subramos` cae por defecto en
# "Automóviles" (mismo criterio que detectar_subramo_por_encabezado de
# GNP y mapear_tipo_a_subramo de Qualitas). Nombres de Subramo tal cual
# están sembrados en el catálogo (_catalogo_generado_ref.py).
_MAPEO_TITULO_SUBRAMO_EL_POTOSI: list[tuple[str, str]] = [
    ("AUTOBUS",              "Autobuses"),
    ("FLOTILLA DE CAMIONES", "Camiones Flotilla"),
    ("CAMIONES FLOTILLA",    "Camiones Flotilla"),
    ("FLOTILLA",             "Flotilla de Vehiculos"),
    ("CAMION",               "Camiones"),
    ("REMOLQUE",             "REMOLQUE"),
]


def detectar_subramo_por_titulo_el_potosi(texto: str) -> str | None:
    """None si el título corresponde a autos/pick ups individuales (el
    caso por defecto, "Automóviles", que el puntaje por keywords ya
    resuelve bien) o no se reconoce ninguna palabra clave."""
    encabezado = _sin_acentos(texto[:200]).upper()
    for palabra_clave, subramo in _MAPEO_TITULO_SUBRAMO_EL_POTOSI:
        if palabra_clave in encabezado:
            return subramo
    return None


# ════════════════════════════════════════════════════════════════════════
# UTILIDADES DE POSICIONAMIENTO (BBOX) — portadas de gnp.py
# ════════════════════════════════════════════════════════════════════════

def _spans_pagina(pagina_dict):
    spans = []
    for bloque in pagina_dict.get("blocks", []):
        for linea in bloque.get("lines", []):
            for span in linea.get("spans", []):
                texto = span.get("text", "")
                if not texto.strip():
                    continue
                x0, y0, x1, y1 = span["bbox"]
                spans.append({
                    "texto": texto.strip(),
                    "x0": x0, "y0": y0, "x1": x1, "y1": y1,
                })
    return spans


def _encontrar_etiqueta(spans, etiqueta, desde_y=None, hasta_y=None, coincidencia_exacta=False):
    etiqueta_low = etiqueta.lower()
    for s in spans:
        if desde_y is not None and s["y0"] < desde_y:
            continue
        if hasta_y is not None and s["y0"] >= hasta_y:
            continue
        texto_low = s["texto"].lower()
        if (coincidencia_exacta and texto_low == etiqueta_low) or \
           (not coincidencia_exacta and etiqueta_low in texto_low):
            return s
    return None


def _valor_por_posicion(spans, etiqueta_span, etiquetas_excluir=None,
                         tolerancia_x=14, tolerancia_fila=3, max_distancia_y=45,
                         permitir_misma_fila=True, permitir_columna_abajo=True):
    """Ver gnp.py para el detalle — igual, salvo que aquí casi siempre se
    llama con permitir_columna_abajo=False: el layout de El Potosí pone
    etiqueta y valor en la MISMA fila en casi todos los bloques de 2
    columnas (Contratante, Riesgo Asegurado, encabezado)."""
    if etiqueta_span is None:
        return ""
    etiquetas_excluir = set(e.lower() for e in (etiquetas_excluir or []))
    ex0, ey0, ex1 = etiqueta_span["x0"], etiqueta_span["y0"], etiqueta_span["x1"]

    mejor_valor, mejor_score = None, None
    for s in spans:
        if s is etiqueta_span:
            continue
        texto_low = s["texto"].lower()
        if texto_low in etiquetas_excluir:
            continue
        dy = s["y0"] - ey0

        if permitir_misma_fila and abs(dy) <= tolerancia_fila and s["x0"] > ex1 - 2:
            score = (0, s["x0"] - ex1)
            if mejor_score is None or score < mejor_score:
                mejor_score, mejor_valor = score, s["texto"]

        if permitir_columna_abajo and 0 < dy <= max_distancia_y and abs(s["x0"] - ex0) <= tolerancia_x:
            score = (1, dy)
            if mejor_score is None or score < mejor_score:
                mejor_score, mejor_valor = score, s["texto"]

    return (mejor_valor or "").strip()


def _valores_multilinea_por_posicion(spans, etiqueta_span, etiquetas_excluir=None,
                                      tolerancia_x=14, max_distancia_y=90, max_lineas=4,
                                      salto_maximo_entre_lineas=20):
    if etiqueta_span is None:
        return ""
    etiquetas_excluir = set(e.lower() for e in (etiquetas_excluir or []))
    ex0, ey0 = etiqueta_span["x0"], etiqueta_span["y0"]

    debajo = [
        s for s in spans
        if s is not etiqueta_span
        and 0 < (s["y0"] - ey0) <= max_distancia_y
        and abs(s["x0"] - ex0) <= tolerancia_x
        and s["texto"].lower() not in etiquetas_excluir
    ]
    debajo.sort(key=lambda s: s["y0"])

    lineas, y_anterior = [], None
    for s in debajo[:max_lineas]:
        if y_anterior is not None and (s["y0"] - y_anterior) > salto_maximo_entre_lineas:
            break
        lineas.append(s["texto"])
        y_anterior = s["y0"]
    return " ".join(t.strip() for t in lineas if t.strip())


def _valor_por_columna(spans, etiqueta_span, max_distancia_y=25, tolerancia_centro=40):
    """Como _valor_por_posicion pero para los bloques donde la etiqueta
    va ARRIBA y el valor centrado debajo, no alineado por x0 sino por el
    CENTRO de la celda (ej. tabla "DETALLES DE MOVIMIENTO": la etiqueta
    "Tasa de financiamiento / por pago fraccionado" empieza mucho más a
    la izquierda que su valor numérico, que viene centrado en la columna;
    lo mismo pasa en el bloque AGENTE con "Nombre"). Alinear por x0, como
    en GNP, no sirve aquí — se confirmó contra los PDF reales de El
    Potosí que el centro sí es estable entre etiqueta y valor."""
    if etiqueta_span is None:
        return ""
    ex_centro = (etiqueta_span["x0"] + etiqueta_span["x1"]) / 2
    ey0 = etiqueta_span["y0"]

    mejor_dy, mejor_valor = None, None
    for s in spans:
        if s is etiqueta_span:
            continue
        dy = s["y0"] - ey0
        if not (0 < dy <= max_distancia_y):
            continue
        s_centro = (s["x0"] + s["x1"]) / 2
        if abs(s_centro - ex_centro) > tolerancia_centro:
            continue
        if mejor_dy is None or dy < mejor_dy:
            mejor_dy, mejor_valor = dy, s["texto"]
    return (mejor_valor or "").strip()


def buscar_valor_monetario(paginas_dict, etiqueta):
    """Fallback genérico (portado de gnp.py): etiqueta y valor en la
    misma línea de texto plano. Rara vez aplica en El Potosí (su tabla de
    montos es columna-abajo, no línea única), pero se conserva por si
    algún layout futuro sí lo imprime así."""
    for pagina in paginas_dict:
        for bloque in pagina.get("blocks", []):
            for linea in bloque.get("lines", []):
                for i, span in enumerate(linea.get("spans", [])):
                    if etiqueta.lower() in span["text"].lower():
                        for siguiente in linea["spans"][i+1:]:
                            match = re.search(r'\$?([0-9,]+\.\d{2})', siguiente["text"])
                            if match:
                                return match.group(1).replace(",", "")
    return ""


# ════════════════════════════════════════════════════════════════════════
# SECCIONES DE LA PÁGINA
# ════════════════════════════════════════════════════════════════════════

def _spans_seccion_movimiento(paginas_dict):
    """Página con la tabla "DETALLES DE MOVIMIENTO" (Prima, Gastos de
    expedición, Tasa de financiamiento por pago fraccionado, Subtotal,
    IVA, Total). Acotado desde ahí hacia abajo para no arrastrar nada del
    encabezado de esa misma página."""
    for pagina in paginas_dict:
        spans = _spans_pagina(pagina)
        inicio = _encontrar_etiqueta(spans, "DETALLES DE MOVIMIENTO")
        if inicio:
            return [s for s in spans if s["y0"] >= inicio["y0"]]
    return []


def _spans_seccion_agente(paginas_dict):
    for pagina in paginas_dict:
        spans = _spans_pagina(pagina)
        titulo = _encontrar_etiqueta(spans, "AGENTE", coincidencia_exacta=True)
        if titulo:
            y0 = titulo["y0"]
            return [s for s in spans if y0 < s["y0"] <= y0 + 60]
    return []


# ════════════════════════════════════════════════════════════════════════
# ENCABEZADO / NO. DE PÓLIZA / VIGENCIA / FORMA DE PAGO
# ════════════════════════════════════════════════════════════════════════

def extraer_numero_poliza(texto, paginas_dict):
    # "AUIN-020626-37", "AUIN-045550-86", etc. — letras, bloque numérico
    # (6 dígitos usualmente) y sufijo de 2-3 dígitos. Es el primer match
    # de esta forma en el documento (aparece en la esquina superior desde
    # la página 1), así que un simple primer-match sirve; el R.F.C. del
    # contratante tiene la misma forma general pero aparece después en el
    # texto, no antes.
    match = re.search(r'\b([A-Z]{3,6}-\d{4,7}-\d{2,3})\b', texto)
    if match:
        return match.group(1)
    if not paginas_dict:
        return ""
    spans = _spans_pagina(paginas_dict[0])
    etiqueta = _encontrar_etiqueta(spans, "Póliza", coincidencia_exacta=True)
    return _valor_por_columna(spans, etiqueta)


def extraer_vigencia(texto, paginas_dict):
    """El texto plano NO preserva el orden visual de este layout (columnas
    absolutamente posicionadas) — "Desde:"/"Hasta:" y sus fechas terminan
    lejos uno del otro en texto plano, aunque en el PDF están en la misma
    fila. Por eso se resuelve solo por bbox, sin fallback de regex sobre
    texto plano (a diferencia de GNP)."""
    if not paginas_dict:
        return {}
    spans = _spans_pagina(paginas_dict[0])
    excluir = {"hrs."}
    desde_etq = _encontrar_etiqueta(spans, "Desde:", coincidencia_exacta=True)
    hasta_etq = _encontrar_etiqueta(spans, "Hasta:", coincidencia_exacta=True)
    desde = _valor_por_posicion(spans, desde_etq, etiquetas_excluir=excluir, permitir_columna_abajo=False)
    hasta = _valor_por_posicion(spans, hasta_etq, etiquetas_excluir=excluir, permitir_columna_abajo=False)
    return {"Inicio Vigencia": desde, "Fin Vigencia": hasta}


_VALORES_FORMA_PAGO = r'(ANUAL|SEMESTRAL|TRIMESTRAL|MENSUAL|CONTADO)'
_VALORES_MONEDA = r'(Nacional|Extranjera|D[oó]lares|USD|MXN|Pesos)'


def extraer_forma_pago(texto, paginas_dict):
    # "Plan de pago" imprime "(000250) ANUAL" — se extrae solo la palabra.
    if not paginas_dict:
        return ""
    spans = _spans_pagina(paginas_dict[0])
    etiqueta = _encontrar_etiqueta(spans, "Plan de pago", coincidencia_exacta=True)
    valor = _valor_por_posicion(spans, etiqueta, permitir_columna_abajo=False)
    match = re.search(_VALORES_FORMA_PAGO, valor, re.IGNORECASE)
    return match.group(1) if match else valor


def extraer_moneda(texto, paginas_dict):
    if not paginas_dict:
        return ""
    spans = _spans_pagina(paginas_dict[0])
    etiqueta = _encontrar_etiqueta(spans, "Moneda", coincidencia_exacta=True)
    valor = _valor_por_posicion(spans, etiqueta, permitir_columna_abajo=False)
    match = re.search(_VALORES_MONEDA, valor, re.IGNORECASE)
    return match.group(1) if match else valor


# ════════════════════════════════════════════════════════════════════════
# CONTRATANTE
# ════════════════════════════════════════════════════════════════════════

_ETIQUETAS_CONTRATANTE = {
    "nombre o razón social:", "dirección:", "r.f.c.:",
    "correo electrónico:", "teléfono:",
}


def extraer_nombre_cliente(texto, paginas_dict):
    """El valor va DEBAJO de la etiqueta (columna, no misma fila) — se
    confirmó contra PDFs reales que "Nombre o razón social:" y el nombre
    quedan en renglones distintos (~13pt de diferencia en Y), a diferencia
    de "R.F.C.:" que sí comparte fila con su valor. Con
    permitir_columna_abajo=False (como se tenía antes) nunca se
    encontraba nada; se necesita también excluir las etiquetas vecinas
    (sobre todo "Dirección:") para no devolver la etiqueta de abajo como
    si fuera el nombre cuando el campo viene vacío."""
    if not paginas_dict:
        return ""
    spans = _spans_pagina(paginas_dict[0])
    etiqueta = _encontrar_etiqueta(spans, "Nombre o razón social:", coincidencia_exacta=True)
    valor = _valor_por_posicion(spans, etiqueta, etiquetas_excluir=_ETIQUETAS_CONTRATANTE)
    return valor


def extraer_direccion(texto, paginas_dict):
    if not paginas_dict:
        return ""
    spans = _spans_pagina(paginas_dict[0])
    etiqueta = _encontrar_etiqueta(spans, "Dirección:", coincidencia_exacta=True)
    valor = _valores_multilinea_por_posicion(spans, etiqueta, etiquetas_excluir=_ETIQUETAS_CONTRATANTE,
                                              tolerancia_x=20, max_distancia_y=40, max_lineas=2)
    return valor


def extraer_domicilio_riesgo(paginas_dict):
    """"Domicilio de Riesgo:" — campo PIVOTE, no se agrega al esquema por
    separado. Cuando "Dirección:" viene incompleta (se confirmó contra
    PDFs reales que a veces solo trae calle+colonia, sin C.P./Municipio),
    este campo trae justo lo que falta ("C.P., Colonia, Municipio" o
    "C.P., Municipio, Estado"), así que se usa solo para rellenar
    colonia/municipio/cp cuando extraer_colonia_municipio_cp() no logró
    sacarlos de "Dirección:"."""
    if not paginas_dict:
        return ""
    spans = _spans_pagina(paginas_dict[0])
    etiqueta = _encontrar_etiqueta(spans, "Domicilio de Riesgo:", coincidencia_exacta=True)
    return _valores_multilinea_por_posicion(spans, etiqueta, tolerancia_x=20,
                                             max_distancia_y=40, max_lineas=2)


_CP_RE = re.compile(r'C\.?\s*P\.?\s*(\d{4,5})', re.IGNORECASE)
_PARECE_CALLE = re.compile(r'\bNo\.|#|\d')


def extraer_colonia_municipio_cp(direccion_completa):
    """Descompone "direccion_completa" en Colonia/Municipio/C.P., sin
    volver a leer el PDF (igual que en GNP). A diferencia de GNP, El
    Potosí NO tiene un formato único de dirección: se confirmó contra 13
    PDF reales que el C.P. es el único ancla siempre presente y confiable
    — Colonia/Municipio dependen de que el PDF haya separado esa parte
    con comas, cosa que no siempre pasa (algunas direcciones traen
    Municipio+Estado pegados sin comas, ej. "CP 38300, CORTAZAR CENTRO
    CORTAZAR CORTAZAR GUANAJUATO MEXICO"). ponytail: en ese caso se deja
    Colonia/Municipio en blanco en vez de adivinar mal — ceiling
    conocido, ~2 de 10 direcciones de muestra caen así; revisar si se
    repite mucho en producción."""
    if not direccion_completa:
        return {}
    m = _CP_RE.search(direccion_completa)
    if not m:
        return {}
    cp = m.group(1)
    antes = direccion_completa[:m.start()]
    despues = direccion_completa[m.end():]

    partes_antes = [p.strip() for p in antes.split(",") if p.strip()]
    colonia = partes_antes[-1] if partes_antes else ""
    if _PARECE_CALLE.search(colonia):
        # Es un residuo de la calle (trae "No. 120", "#107", etc.), no una
        # colonia real — el PDF no puso coma entre calle y "CP" en este caso.
        colonia = ""

    partes_despues = [p.strip() for p in despues.split(",")]
    partes_despues = [p for p in partes_despues if p and p.upper() != "MEXICO"]
    municipio = ""
    if len(partes_despues) >= 3:
        # "CP <cp>, <colonia>, <municipio>, <estado>, MEXICO" — visto en el
        # campo pivote "Domicilio de Riesgo:" cuando sí trae Colonia.
        if not colonia:
            colonia = partes_despues[0]
        municipio = partes_despues[1]
    elif len(partes_despues) == 2:
        municipio = partes_despues[0]

    resultado = {"cp": cp}
    if colonia:
        resultado["colonia"] = colonia
    if municipio:
        resultado["municipio"] = municipio
    return resultado


_RFC_GENERICO_NACIONAL = "XAXX010101000"
_RFC_VALIDO_RE = re.compile(r'[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{0,3}')


def extraer_rfc(texto, paginas_dict):
    """Variantes reales confirmadas en PDFs de El Potosí, todas con
    guiones separando letras/fecha/homoclave (ej. "RAMJ-870617-XXX",
    homoclave faltante; "XAXX-010101-000", RFC genérico de quien no
    factura) — ambas son RFC válidos y deben normalizarse SIN guiones
    para que clasificar_persona_por_rfc (figuras_juridicas.py, que exige
    letras+dígitos consecutivos) las reconozca igual que un RFC de GNP o
    Qualitas.

    Cuando no se logra un RFC con forma válida — vacío, "--", o
    cualquier patrón que no sea letras+fecha+homoclave — no se deja en
    blanco: se usa el RFC genérico nacional (XAXX010101000), el mismo
    que el propio PDF ya imprime cuando el asegurado no tiene RFC dado de
    alta o no lo tiene a la mano al momento de emitir la póliza. Mismo
    criterio de clasificación (Persona Física) para ambos casos."""
    spans = _spans_pagina(paginas_dict[0]) if paginas_dict else []
    etiqueta = _encontrar_etiqueta(spans, "R.F.C.:", coincidencia_exacta=True)
    valor = _valor_por_posicion(spans, etiqueta, etiquetas_excluir=_ETIQUETAS_CONTRATANTE,
                                 permitir_columna_abajo=False).upper()
    if valor:
        sin_guiones = valor.replace("-", "")
        if _RFC_VALIDO_RE.fullmatch(sin_guiones):
            return sin_guiones
    else:
        # Fallback por regex sobre el texto completo
        match = re.search(r'R\.?F\.?C\.?\s*[:\-]?\s*([A-ZÑ&]{3,4})-?(\d{6})-?([A-Z0-9]{0,3})', texto, re.IGNORECASE)
        if match:
            return f"{match.group(1)}{match.group(2)}{match.group(3)}".upper()

    return _RFC_GENERICO_NACIONAL


# ════════════════════════════════════════════════════════════════════════
# VEHÍCULO ASEGURADO
# ════════════════════════════════════════════════════════════════════════

_ETIQUETAS_RIESGO = {
    "vehículo:", "no. de serie:", "transmisión:", "uso:", "carga:",
    "no. de motor:", "ocupantes:", "tipo vehículo:",
}

# Mismo catálogo de "procedencia del vehículo" que usa GNP (8 categorías
# oficiales) — El Potosí no lo imprime como etiqueta propia, se deriva del
# título de la carátula (ver _tipo_vehiculo_desde_titulo) solo cuando el
# campo "Tipo Vehículo" viene vacío o con un guion "-" (visto en varios
# PDF reales).
_CATALOGO_TIPO_VEHICULO_EL_POTOSI: list[tuple[str, str]] = [
    ("ESTANCIA",   "EXTRANJEROS CON ESTANCIA EN MÉXICO"),
    ("ANTIGU",     "VEHÍCULOS ANTIGUOS"),
    ("BLINDAD",    "VEHÍCULOS BLINDADOS"),
    ("CLASIC",     "VEHÍCULOS CLÁSICOS"),
    ("FRONTERIZ",  "VEHÍCULOS FRONTERIZOS"),
    ("IMPORTAD",   "VEHÍCULOS IMPORTADOS"),
    ("LEGALIZAD",  "VEHÍCULOS LEGALIZADOS"),
    ("RESIDENTE",  "VEHÍCULOS RESIDENTES"),
]


def _tipo_vehiculo_desde_titulo(texto: str) -> str:
    encabezado = _sin_acentos(texto[:200]).upper()
    for palabra_clave, valor_final in _CATALOGO_TIPO_VEHICULO_EL_POTOSI:
        if palabra_clave in encabezado:
            return valor_final
    return ""


def extraer_descripcion(texto, paginas_dict):
    if not paginas_dict:
        return ""
    spans = _spans_pagina(paginas_dict[0])
    etiqueta = _encontrar_etiqueta(spans, "Vehículo:", coincidencia_exacta=True)
    valor = _valor_por_posicion(spans, etiqueta, etiquetas_excluir=_ETIQUETAS_RIESGO,
                                 permitir_columna_abajo=False)
    return valor


def extraer_serie(texto, paginas_dict):
    match = re.search(r'\b([A-HJ-NPR-Z0-9]{17})\b', texto)
    if match:
        return match.group(1)
    if not paginas_dict:
        return ""
    spans = _spans_pagina(paginas_dict[0])
    etiqueta = _encontrar_etiqueta(spans, "No. de serie:", coincidencia_exacta=True)
    return _valor_por_posicion(spans, etiqueta, etiquetas_excluir=_ETIQUETAS_RIESGO,
                                permitir_columna_abajo=False)


def extraer_motor(texto, paginas_dict):
    """Sin patrón fijo (se han visto "SN", "S/N", "HECHO EN MEXICO",
    "HECHO EN USA/BRASIL", o un código alfanumérico igual al de la
    placa/serie) y el texto plano de este layout no preserva el orden
    visual (columnas posicionadas de forma absoluta), así que a
    diferencia de GNP no hay regex de texto plano razonable — se resuelve
    solo por bbox, confirmado estable en los 13 PDF de muestra."""
    if not paginas_dict:
        return ""
    spans = _spans_pagina(paginas_dict[0])
    etiqueta = _encontrar_etiqueta(spans, "No. de motor:", coincidencia_exacta=True)
    return _valor_por_posicion(spans, etiqueta, etiquetas_excluir=_ETIQUETAS_RIESGO,
                                permitir_columna_abajo=False)


def extraer_modelo(descripcion_veh: str) -> str:
    """El año-modelo no tiene etiqueta propia — viene embebido en la
    descripción del vehículo (ej. "007-191-02 Mod.2014/VOLKSWAGEN
    VENTO..."), se parsea de ahí en vez de releer el PDF."""
    match = re.search(r'Mod\.\s*((?:19|20)\d{2})', descripcion_veh or "", re.IGNORECASE)
    return match.group(1) if match else ""


def extraer_tipo_vehiculo(texto, paginas_dict):
    if not paginas_dict:
        return _tipo_vehiculo_desde_titulo(texto)
    spans = _spans_pagina(paginas_dict[0])
    etiqueta = _encontrar_etiqueta(spans, "Tipo Vehículo:", coincidencia_exacta=True)
    valor = _valor_por_posicion(spans, etiqueta, etiquetas_excluir=_ETIQUETAS_RIESGO,
                                 permitir_columna_abajo=False)
    if not valor or valor in {"-", "--"}:
        return _tipo_vehiculo_desde_titulo(texto)
    return valor


def extraer_placas(texto: str) -> str:
    """No está en un campo bbox separable: "No. PLACA:" y la placa vienen
    en un solo span de texto (ej. "No. PLACA:   GVC677C"), así que se
    resuelve por regex sobre el texto plano. La mayoría de pólizas de
    auto nuevo de El Potosí simplemente no traen este campo (sin "No.
    PLACA" en el texto → ""). Cuando sí viene pero con un valor
    placeholder ("XXXXX") se devuelve tal cual, sin intentar validarlo —
    equivale a que el dato aún no esté disponible, no es responsabilidad
    de este extractor decidir eso. Se normaliza a mayúsculas porque se ha
    visto tanto en minúsculas como en mayúsculas."""
    match = re.search(r'No\.?\s*PLACA\s*:\s*([A-Za-z0-9]+)', texto)
    return match.group(1).upper() if match else ""


# ════════════════════════════════════════════════════════════════════════
# DETALLE DE MOVIMIENTO (montos) — Prima, Gastos de expedición (=
# derechos), Tasa de financiamiento por pago fraccionado (= recargos,
# mismo concepto que "Recargo por Pago Fraccionado" en GNP), Subtotal,
# IVA, Total (= prima_total)
# ════════════════════════════════════════════════════════════════════════

def _extraer_monto_movimiento(paginas_dict, etiqueta, coincidencia_exacta=True):
    seccion = _spans_seccion_movimiento(paginas_dict)
    etiqueta_span = _encontrar_etiqueta(seccion, etiqueta, coincidencia_exacta=coincidencia_exacta)
    valor = _valor_por_columna(seccion, etiqueta_span)
    return re.sub(r'[^0-9.]', '', valor) if valor else ""


def extraer_prima_neta(texto, paginas_dict):
    valor = _extraer_monto_movimiento(paginas_dict, "Prima")
    return valor or buscar_valor_monetario(paginas_dict, "prima")


def extraer_derecho_poliza(texto, paginas_dict):
    # "Gastos de expedición" == "Derecho de Póliza" del esquema.
    valor = _extraer_monto_movimiento(paginas_dict, "expedición", coincidencia_exacta=False)
    return valor or buscar_valor_monetario(paginas_dict, "expedición")


def extraer_recargo_fraccionado(texto, paginas_dict):
    # "Tasa de financiamiento por pago fraccionado" == "Recargo por Pago
    # Fraccionado" del esquema (mismo campo "recargos" que en GNP).
    valor = _extraer_monto_movimiento(paginas_dict, "por pago fraccionado", coincidencia_exacta=False)
    return valor or buscar_valor_monetario(paginas_dict, "fraccionado")


def extraer_iva(texto, paginas_dict):
    valor = _extraer_monto_movimiento(paginas_dict, "IVA")
    return valor or buscar_valor_monetario(paginas_dict, "iva")


def extraer_importe_pagar(texto, paginas_dict):
    # "Total" == "Importe por Pagar" del esquema (campo "prima_total").
    valor = _extraer_monto_movimiento(paginas_dict, "Total")
    return valor or buscar_valor_monetario(paginas_dict, "total")


def extraer_subtotal_pdf(paginas_dict) -> str | None:
    """A diferencia de GNP (que casi nunca imprime "Subtotal" y depende
    del cálculo), El Potosí SÍ lo imprime siempre — se usa como
    referencia para validar_subtotal, misma lógica que en GNP/Qualitas."""
    valor = _extraer_monto_movimiento(paginas_dict, "Subtotal")
    return valor or None


def _a_float(valor) -> float:
    if not valor:
        return 0.0
    try:
        return float(str(valor).replace(",", ""))
    except ValueError:
        return 0.0


def calcular_subtotal(prima_neta, descuento, recargos, derechos):
    """Sub Total = Prima Neta - Descuento + Recargos + Derechos (mismo
    catálogo Sicas que en GNP/Qualitas). El Potosí no desglosa
    "Descuento" como campo propio, queda en 0 en la fórmula."""
    if not prima_neta:
        return None
    total = _a_float(prima_neta) - _a_float(descuento) + _a_float(recargos) + _a_float(derechos)
    return f"{total:,.2f}"


def validar_subtotal(subtotal_calculado, subtotal_pdf, prima_total, iva):
    """Cruza el cálculo constructivo contra Prima Total - IVA; si no
    coincide, se usa el valor impreso (subtotal_pdf), que en El Potosí
    casi siempre está disponible. Misma lógica que GNP/Qualitas."""
    referencia = None
    if prima_total and iva:
        referencia = _a_float(prima_total) - _a_float(iva)

    if subtotal_calculado and referencia is not None and round(abs(_a_float(subtotal_calculado) - referencia), 2) <= 0.01:
        return subtotal_calculado

    if subtotal_pdf:
        return subtotal_pdf

    if subtotal_calculado:
        logging.getLogger(__name__).warning(
            "El Potosí: Sub Total calculado (%s) no coincide con la referencia "
            "Prima Total - IVA, y no se encontró el valor impreso en el PDF; "
            "se usa el calculado sin poder validarlo.",
            subtotal_calculado,
        )
    return subtotal_calculado


# ════════════════════════════════════════════════════════════════════════
# AGENTE
# ════════════════════════════════════════════════════════════════════════

def extraer_clave_agente(texto, paginas_dict):
    spans = _spans_seccion_agente(paginas_dict)
    etiqueta = _encontrar_etiqueta(spans, "Clave", coincidencia_exacta=True)
    return _valor_por_columna(spans, etiqueta)


def extraer_nombre_agente(texto, paginas_dict):
    spans = _spans_seccion_agente(paginas_dict)
    etiqueta = _encontrar_etiqueta(spans, "Nombre", coincidencia_exacta=True)
    return _valor_por_columna(spans, etiqueta)


# ────────────────────────────────────────────────────────────────────────────
# Punto de entrada usado por el pipeline (nivel 1)
# ────────────────────────────────────────────────────────────────────────────

_SENTINELS_NO_ENCONTRADO = {"", "no encontrado", "no encontrada"}


def _valido(valor) -> bool:
    return bool(valor) and str(valor).strip().lower() not in _SENTINELS_NO_ENCONTRADO


def extraer(texto: str, pdf_bytes: bytes | None = None) -> dict[str, str]:
    """Punto de entrada del extractor especializado (nivel 1). Devuelve
    solo los campos que logró encontrar con certeza; el resto queda a
    cargo del motor de reglas de BD (nivel 2)."""
    if not pdf_bytes or not es_poliza_auto_el_potosi(texto):
        return {}

    texto, paginas_dict = _leer_con_fitz(pdf_bytes)

    vigencia = extraer_vigencia(texto, paginas_dict)

    nombre_cliente = extraer_nombre_cliente(texto, paginas_dict)
    if nombre_cliente and es_persona_moral_por_nombre(nombre_cliente):
        nombre_cliente = normalizar_siglas_razon_social(nombre_cliente)

    prima_neta = extraer_prima_neta(texto, paginas_dict)
    derechos = extraer_derecho_poliza(texto, paginas_dict)
    recargos = extraer_recargo_fraccionado(texto, paginas_dict)
    iva = extraer_iva(texto, paginas_dict)
    prima_total = extraer_importe_pagar(texto, paginas_dict)

    subtotal_calculado = calcular_subtotal(prima_neta, None, recargos, derechos)
    subtotal_pdf = extraer_subtotal_pdf(paginas_dict)
    subtotal = validar_subtotal(subtotal_calculado, subtotal_pdf, prima_total, iva)

    descripcion_veh = extraer_descripcion(texto, paginas_dict)

    candidatos = {
        "documento":       extraer_numero_poliza(texto, paginas_dict),
        "nombre_cliente":  nombre_cliente,
        "rfc":             extraer_rfc(texto, paginas_dict),
        "desde":           vigencia.get("Inicio Vigencia"),
        "hasta":           vigencia.get("Fin Vigencia"),
        "prima_neta":      prima_neta,
        "derechos":        derechos,
        "iva":             iva,
        "prima_total":     prima_total,
        "recargos":        recargos,
        "sub_total":       subtotal,
        "descripcion_veh": descripcion_veh,
        "serie":           extraer_serie(texto, paginas_dict),
        "modelo":          extraer_modelo(descripcion_veh),
        "motor":           extraer_motor(texto, paginas_dict),
        "agente_clave":    extraer_clave_agente(texto, paginas_dict),
        "agente_nombre":   extraer_nombre_agente(texto, paginas_dict),
        "direccion_completa": extraer_direccion(texto, paginas_dict),
        "forma_pago":      extraer_forma_pago(texto, paginas_dict),
        "moneda":          extraer_moneda(texto, paginas_dict),
        "tipo_vehiculo":   extraer_tipo_vehiculo(texto, paginas_dict),
        "placas":          extraer_placas(texto),
    }

    # Colonia/Municipio/C.P.: se parsean de "direccion_completa"; si esa
    # dirección viene incompleta (falta alguno de los 3), "Domicilio de
    # Riesgo:" es un campo pivote que suele traer justo lo que falta — se
    # usa SOLO para rellenar huecos, nunca se agrega como campo propio.
    partes_direccion = extraer_colonia_municipio_cp(candidatos["direccion_completa"])
    faltantes = {"cp", "colonia", "municipio"} - partes_direccion.keys()
    if faltantes:
        partes_pivote = extraer_colonia_municipio_cp(extraer_domicilio_riesgo(paginas_dict))
        for campo in faltantes:
            if campo in partes_pivote:
                partes_direccion[campo] = partes_pivote[campo]

    # Validación final contra el Catálogo Nacional de Códigos Postales
    # (Correos de México): pareja o no la Colonia extraída con lo que
    # dice el catálogo para ese C.P., se aplica siempre — tanto si la
    # dirección venía completa del PDF como si se rellenó con el pivote
    # de arriba (ver catalogo_cp.py para el criterio exacto).
    partes_direccion = validar_direccion_cp(
        partes_direccion.get("cp"), partes_direccion.get("colonia"), partes_direccion.get("municipio"),
    )
    candidatos.update(partes_direccion)

    return {campo: valor for campo, valor in candidatos.items() if _valido(valor)}
