"""
Extractor especializado para Quálitas — Fase 1 de la nueva arquitectura
de extracción en 3 niveles.

Portado de poliza_qualitas.py (parser legacy, eliminado del proyecto en
el refactor de arquitectura). Las funciones internas se conservan tal
cual del original; lo único nuevo es extraer(), el punto de entrada que
usa el pipeline (api/services/extractor.py) y que traduce las etiquetas
en español del parser legacy a los nombre_campo del esquema actual.

Campos del parser legacy SIN destino en el esquema actual (se omiten a
propósito, no se capturan por este nivel):
    - "Tipo de Póliza" (Amplia/Limitada/...)
    - "Tasa de Financiamiento"
    - "Dirección" (solo existen colonia/municipio/cp por separado)
"""
from __future__ import annotations
import logging
import re
import unicodedata
from collections import Counter

import fitz  # PyMuPDF

from .figuras_juridicas import es_persona_moral_por_nombre, normalizar_siglas_razon_social


def _leer_con_fitz(pdf_bytes: bytes) -> tuple[str, list[dict]]:
    """
    Todas las funciones de este módulo (heredadas de poliza_qualitas.py)
    usan saltos de línea fijos (lineas[i+N]) calibrados contra el
    line-splitting específico de PyMuPDF. El texto que llega como
    parámetro a extraer() viene de pdfplumber (motor del pipeline
    principal), cuyo orden/agrupación de líneas es distinto y rompe
    esos offsets. Por eso se regenera aquí el texto con PyMuPDF — el
    mismo motor con el que se escribió y probó esta lógica — en vez de
    reutilizar el texto que ya trae el pipeline.
    """
    texto = ""
    paginas_dict = []
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        for pagina in doc:
            texto += pagina.get_text()
            paginas_dict.append(pagina.get_text("dict"))
    return texto, paginas_dict


def es_poliza_auto_qualitas(texto: str) -> bool:
    texto_upper = texto.upper()

    otras_aseguradoras = [
        "GNP", "AXA", "MAPFRE", "CHUBB", "ZURICH", "ANA SEGUROS", "HDI", "AFIRME", "BANORTE", "BBVA SEGUROS"
    ]

    palabras_clave_auto = ["VEHÍCULO", "COBERTURA", "AUTOMÓVIL", "USO PARTICULAR", "PLACAS"]

    if "QUALITAS" not in texto_upper:
        if any(aseg in texto_upper for aseg in otras_aseguradoras):
            return False
        return False

    if any(p in texto_upper for p in palabras_clave_auto):
        return True

    return False


def extraer_tipo_poliza(texto: str) -> str:
    texto_upper = texto.upper()
    tipos_validos = ["AMPLIA", "LIMITADA", "BÁSICA", "RESPONSABILIDAD CIVIL"]
    contador = Counter()

    for linea in texto_upper.splitlines():
        match = re.search(r'PLAN:\s*(AMPLIA|LIMITADA|BÁSICA|RESPONSABILIDAD CIVIL)', linea)
        if match:
            tipo = match.group(1)
            contador[tipo] += 1

    if contador:
        return contador.most_common(1)[0][0].title()

    for tipo in tipos_validos:
        contador[tipo] += texto_upper.count(tipo)

    if contador:
        return contador.most_common(1)[0][0].title()

    return ""


def extraer_numero_poliza_qualitas(texto):
    match = re.search(r'INCISO\s+(\d{7,15})', texto)
    if match:
        return match.group(1).strip()

    patrones = [
        r'P[oó]liza\s*(?:No\.|Núm\.?|Número)?\s*[:\-]?\s*([A-Z0-9\-]{6,20})',
        r'No\.?\s*de\s*P[oó]liza\s*[:\-]?\s*([A-Z0-9\-]{6,20})',
        r'N°\s*P[oó]liza\s*[:\-]?\s*([A-Z0-9\-]{6,20})'
    ]
    for patron in patrones:
        match = re.search(patron, texto, re.IGNORECASE)
        if match:
            return match.group(1).strip()

    return "No encontrado"


def extraer_rfc_mas_repetido(texto: str) -> str:
    texto_upper = texto.upper()

    # Algunos PDFs (visto en RFC de Persona Moral, ej. "SLE-120202-M92")
    # imprimen el RFC con guiones separando sus 3 partes (letras / fecha
    # AAMMDD / homoclave) en vez de como un solo token pegado. Los guiones
    # son opcionales en el regex para no romper el formato sin guiones que
    # ya funcionaba; se limpian del resultado antes de cualquier filtro por
    # longitud, para que "SLE-120202-M92" se compare como "SLE120202M92" (12).
    rfc_regex = r'\b[A-Z&Ñ]{3,4}[-\s]?\d{6}[-\s]?[A-Z0-9]{0,3}\b'
    rfcs_encontrados = [re.sub(r'[-\s]', '', m) for m in re.findall(rfc_regex, texto_upper)]

    exclusiones_motor = [
        r'\bV[68]\b', r'\bI4\b', r'\bH6\b', r'\b2ZRFE\b', r'\b1\.6L\b',
        r'\b2\.0L\b', r'\bTSI\b', r'\bTDI\b', r'\bDOHC\b', r'\bSOHC\b',
        r'\bTURBO\b', r'\bHYBRID\b', r'\bELECTRIC\b'
    ]
    rfcs_filtrados = []
    for rfc in rfcs_encontrados:
        if not any(re.fullmatch(pat, rfc) for pat in exclusiones_motor):
            rfcs_filtrados.append(rfc)

    if not rfcs_filtrados:
        return "No se encontraron RFCs válidos"

    rfcs_estandar = [rfc for rfc in rfcs_filtrados if len(rfc) in (12, 13)]
    rfcs_truncados = [rfc for rfc in rfcs_filtrados if len(rfc) == 10]

    conteo_estandar = Counter(rfcs_estandar)
    conteo_truncado = Counter(rfcs_truncados)

    bloques_asegurado = re.findall(r'INFORMACION DEL ASEGURADO.*?(?:\n\n|\Z)', texto_upper, re.DOTALL)

    for rfc, _ in conteo_estandar.most_common():
        if any(rfc in bloque for bloque in bloques_asegurado):
            return rfc

    if conteo_estandar:
        return conteo_estandar.most_common(1)[0][0]

    if conteo_truncado:
        return conteo_truncado.most_common(1)[0][0]

    return "No se encontraron RFCs válidos"


def extraer_prima_neta(texto: str) -> str:
    texto_upper = texto.upper()
    lineas = texto_upper.splitlines()

    monto_regex = r'\$?\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?'

    for i, linea in enumerate(lineas):
        if 'PRIMA NETA' in linea:
            idx_valor = i + 8
            if idx_valor < len(lineas):
                linea_valor = lineas[idx_valor]
                montos = re.findall(monto_regex, linea_valor)
                if montos:
                    return montos[0].replace(' ', '')

            idx_siguiente = i + 1
            if idx_siguiente < len(lineas):
                linea_siguiente = lineas[idx_siguiente]
                montos = re.findall(monto_regex, linea_siguiente)
                if montos:
                    return montos[0].replace(' ', '')

            break

    return "No se encontró PRIMA NETA"


def extraer_tasa_financiamiento(texto: str) -> str:
    texto_upper = texto.upper()
    lineas = texto_upper.splitlines()
    monto_regex = r'-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?'

    for i, linea in enumerate(lineas):
        if "TASA FINANCIAMIENTO" in linea:
            idx_primario = i + 8
            if idx_primario < len(lineas):
                linea_primaria = lineas[idx_primario]
                montos = re.findall(monto_regex, linea_primaria)
                if montos:
                    return montos[0]
            idx_fallback = i + 1
            if idx_fallback < len(lineas):
                linea_fallback = lineas[idx_fallback]
                montos = re.findall(monto_regex, linea_fallback)
                if montos:
                    return montos[0]
    return "No se encontró tasa de financiamiento"


def extraer_gastos_expedicion(texto: str) -> str:
    texto_upper = texto.upper()
    lineas = texto_upper.splitlines()
    monto_regex = r'-?\d{1,3}(?:,\d{3})*\.\d{2}'

    claves_busqueda = ["GASTOS POR EXPEDICIÓN", "GASTOS DE EXPEDICIÓN"]

    def es_monto_valido(valor: str) -> bool:
        return re.match(monto_regex, valor) is not None

    for i, linea in enumerate(lineas):
        if any(clave in linea for clave in claves_busqueda):
            idx_primario = i + 8
            if idx_primario < len(lineas):
                linea_primaria = lineas[idx_primario]
                montos = re.findall(monto_regex, linea_primaria)
                if montos and es_monto_valido(montos[0]):
                    return montos[0]

            idx_fallback = i + 1
            if idx_fallback < len(lineas):
                linea_fallback = lineas[idx_fallback]
                montos = re.findall(monto_regex, linea_fallback)
                if montos and es_monto_valido(montos[0]):
                    return montos[0]

    return "No se encontró gastos de expedición"


# Nota: Sub Total ya NO se extrae del texto del PDF — es un campo
# CALCULADO (ver calcular_subtotal más abajo), según el catálogo Sicas.


def extraer_prima_total(texto: str) -> str:
    texto_upper = texto.upper()
    lineas = texto_upper.splitlines()
    monto_regex = r'-?\d{1,3}(?:,\d{3})*\.\d{2}'

    def es_monto_valido(valor: str) -> bool:
        return re.match(monto_regex, valor) is not None

    for i, linea in enumerate(lineas):
        if "IMPORTE TOTAL" in linea or "PRIMA TOTAL" in linea:
            idx_primario = i + 7
            if idx_primario < len(lineas):
                montos = re.findall(monto_regex, lineas[idx_primario])
                if montos and es_monto_valido(montos[0]):
                    return montos[0]

            montos_encontrados = []
            for j in range(i + 1, min(i + 36, len(lineas))):
                montos = re.findall(monto_regex, lineas[j])
                montos_encontrados.extend([m for m in montos if es_monto_valido(m)])

            if montos_encontrados:
                return montos_encontrados[-1]

            montos_encontrados = []
            for j in range(i + 1, min(i + 30, len(lineas))):
                montos = re.findall(monto_regex, lineas[j])
                montos_encontrados.extend([m for m in montos if es_monto_valido(m)])

            if montos_encontrados:
                return montos_encontrados[-1]

    return "No se encontró prima total"


def extraer_vigencia_por_frecuencia(texto: str) -> dict:
    texto_normalizado = normalizar_texto(texto)

    patrones_fecha = [
        r'\d{2}/\d{2}/\d{4}',
        r'\d{2}-\d{2}-\d{4}',
        r'\d{4}-\d{2}-\d{2}',
        r'\d{2} de [A-ZÁÉÍÓÚÑ]+ de \d{4}',
        r'(\d{2}/(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)/\d{2,4})'
    ]

    fechas_encontradas = []
    for patron in patrones_fecha:
        coincidencias = re.findall(patron, texto_normalizado, flags=re.IGNORECASE)
        if coincidencias and isinstance(coincidencias[0], tuple):
            fechas_encontradas.extend([c[0] for c in coincidencias])
        else:
            fechas_encontradas.extend(coincidencias)

    if not fechas_encontradas:
        return {
            "Inicio Vigencia": "No encontrada",
            "Fin Vigencia": "No encontrada"
        }

    contador = Counter(fechas_encontradas)
    fechas_ordenadas = [fecha for fecha, _ in contador.most_common()]

    return {
        "Inicio Vigencia": fechas_ordenadas[0] if len(fechas_ordenadas) > 0 else "No encontrada",
        "Fin Vigencia": fechas_ordenadas[1] if len(fechas_ordenadas) > 1 else "No encontrada"
    }


def extraer_nombre_cliente(texto: str) -> str:
    texto_upper = texto.upper()
    lineas = texto_upper.splitlines()

    patrones_legales = [
        r'S\.?A\.?\s+DE\s+C\.?V\.?',
        r'S\.?\s+DE\s+R\.?L\.?',
        r'SOCIEDAD\s+ANONIMA',
        r'SOCIEDAD\s+DE\s+RESPONSABILIDAD\s+LIMITADA'
    ]

    palabras_excluidas = [
        "DOMICILIO", "RFC", "C.P", "MUNICIPIO", "ESTADO", "VIGENCIA",
        "TELEFONO", "DESDE LAS", "INFORMACIÓN IMPORTANTE", "OFICINA", "ATENCIÓN", "CANAL"
    ]

    for i, linea in enumerate(lineas):
        if "INFORMACION DEL ASEGURADO" in linea or "INFORMACIÓN DEL ASEGURADO" in linea:
            partes = re.split(r"INFORMACION DEL ASEGURADO|INFORMACIÓN DEL ASEGURADO", linea)
            if len(partes) > 1 and partes[1].strip():
                posible_nombre = partes[1].strip()
                if not any(p in posible_nombre for p in palabras_excluidas):
                    return posible_nombre.title()

            for j in range(i + 1, min(i + 6, len(lineas))):
                posible_nombre = lineas[j].strip()
                if not posible_nombre or any(p in posible_nombre for p in palabras_excluidas):
                    continue
                if any(re.search(pat, posible_nombre) for pat in patrones_legales):
                    return posible_nombre.title()
                if re.fullmatch(r"[A-ZÑÁÉÍÓÚ ,\.&]{5,}", posible_nombre) and len(posible_nombre.split()) >= 2:
                    return posible_nombre.title()
            break

    fechas = extraer_vigencia_por_frecuencia(texto)
    if isinstance(fechas, dict):
        ultima_fecha = fechas.get("Fin Vigencia", "")
        if ultima_fecha and ultima_fecha != "No encontrada":
            for i, linea in enumerate(lineas):
                if ultima_fecha in linea:
                    for j in range(i + 1, min(i + 3, len(lineas))):
                        posible_nombre = lineas[j].strip()
                        if not posible_nombre or any(p in posible_nombre for p in palabras_excluidas):
                            continue
                        if any(re.search(pat, posible_nombre) for pat in patrones_legales):
                            return posible_nombre.title()
                        if re.fullmatch(r"[A-ZÑÁÉÍÓÚ ,\.&0-9\-]{5,}", posible_nombre) and len(posible_nombre.split()) >= 2:
                            return posible_nombre.title()
                    break

    for i, linea in enumerate(lineas):
        if "FAX" in linea:
            idx_nombre = i + 7
            if idx_nombre < len(lineas):
                posible_nombre = lineas[idx_nombre].strip()
                if posible_nombre and not any(p in posible_nombre for p in palabras_excluidas):
                    return posible_nombre.title()

    return "No se encontró nombre o razón social"


def normalizar_texto(texto):
    texto = texto.upper()
    texto = unicodedata.normalize('NFKD', texto)
    texto = ''.join(c for c in texto if not unicodedata.combining(c))
    return texto


def extraer_iva(texto: str) -> str:
    texto_upper = texto.upper()
    lineas = texto_upper.splitlines()
    monto_regex = r'-?\d{1,3}(?:,\d{3})*\.\d{2}'
    porcentaje_regex = r'16\s*%'

    def es_monto_valido(valor: str) -> bool:
        return re.match(monto_regex, valor) is not None

    for i, linea in enumerate(lineas):
        if "I.V.A." in linea or "IVA" in linea:
            idx_primario = i + 7
            if idx_primario < len(lineas):
                linea_iva = lineas[idx_primario]
                montos = re.findall(monto_regex, linea_iva)
                if montos and es_monto_valido(montos[0]):
                    return montos[0]

    for i, linea in enumerate(lineas):
        if re.search(porcentaje_regex, linea):
            idx_fallback = i + 1
            if idx_fallback < len(lineas):
                linea_siguiente = lineas[idx_fallback]
                montos = re.findall(monto_regex, linea_siguiente)
                if montos and es_monto_valido(montos[0]):
                    return montos[0]

    return "No se encontró I.V.A."


def extraer_forma_pago(texto: str) -> str:
    texto_upper = texto.upper()
    lineas = texto_upper.splitlines()
    formas_validas = ["CONTADO", "SEMESTRAL", "TRIMESTRAL", "MENSUAL", "ANUAL"]

    for i, linea in enumerate(lineas):
        if "FORMA DE PAGO" in linea:
            idx_siguiente = i + 1
            if idx_siguiente < len(lineas):
                posible_forma = lineas[idx_siguiente].strip()
                if posible_forma in formas_validas:
                    return posible_forma.title()

            idx_fallback = i + 45
            if idx_fallback < len(lineas):
                posible_forma = lineas[idx_fallback].strip()
                if posible_forma in formas_validas:
                    return posible_forma.title()

    contador = Counter()
    for forma in formas_validas:
        contador[forma] += texto_upper.count(forma)

    if contador:
        forma_mas_comun = contador.most_common(1)[0][0]
        return forma_mas_comun.title()

    return "Forma de pago no encontrada"


def extraer_moneda(texto: str) -> str:
    texto_upper = texto.upper()
    lineas = texto_upper.splitlines()
    monedas_validas = ["PESOS", "DÓLARES", "USD", "MXN", "EUROS", "EUR"]

    for i, linea in enumerate(lineas):
        if "MONEDA" in linea:
            idx_siguiente = i + 1
            if idx_siguiente < len(lineas):
                posible_moneda = lineas[idx_siguiente].strip()
                if posible_moneda in monedas_validas:
                    return posible_moneda.title()

    contador = Counter()
    for moneda in monedas_validas:
        contador[moneda] += texto_upper.count(moneda)

    if contador:
        moneda_mas_comun = contador.most_common(1)[0][0]
        return moneda_mas_comun.title()

    return "Moneda no encontrada"


def extraer_motor(texto: str) -> str:
    """
    Motor tiene (al menos) dos layouts reales en Quálitas:

    1. Línea única "Serie:... Motor:<valor> Color:<valor?> Placas:...", ej.
       "Motor:11294130144935 Color: Placas:NXG2146" — el valor de Motor no
       tiene longitud ni tipo de carácter fijo (visto: "20607541" 8 dígitos,
       "11294130144935" 14 dígitos, "KA24016688M" alfanumérico), así que se
       delimita con un lookahead hacia la siguiente etiqueta conocida en vez
       de un rango de longitud. "Color:" puede venir vacío (seguido
       inmediatamente de "Placas:"), por eso la alternancia no asume que
       Color siempre tiene valor.

    2. Bloques separados: etiquetas (Tipo/Modelo/Serie/Motor/Placas/Color)
       todas juntas, valores en otro bloque más abajo — verificado con 16
       pólizas reales que el valor de Motor SIEMPRE es la línea inmediata
       después del valor de Serie (el VIN de 17 caracteres), sin importar
       cuántas otras etiquetas ("Ocupantes:", etc.) se intercalen antes.
       Antes se buscaba la etiqueta "Motor" por substring y se contaba un
       offset fijo de líneas desde ahí — eso fallaba cuando "MOTOR" aparecía
       como substring de otra palabra antes de la etiqueta real (ej.
       "GMOTORS" en la descripción del vehículo), y el offset fijo tampoco
       acertaba siempre. Anclarse al VIN de Serie (ya extraído de forma
       confiable) es más robusto que buscar la etiqueta de Motor misma.
    """
    match = re.search(
        r'Motor\s*:\s*([A-Za-z0-9]+?)\s*(?=Color\s*:|Placas\s*:|\n|$)',
        texto, re.IGNORECASE,
    )
    if match:
        return match.group(1).upper()

    vin_match = re.search(r'\b([A-HJ-NPR-Z0-9]{17})\b', texto)
    if vin_match:
        lineas = texto.splitlines()
        for i, linea in enumerate(lineas):
            if vin_match.group(1) in linea:
                if i + 1 < len(lineas):
                    valor = lineas[i + 1].strip()
                    if valor.lower().startswith(("hecho en", "fabricado en", "ensamblado en")):
                        return valor.title()
                    if valor:
                        return valor
                break

    # Último fallback: offset fijo de líneas desde la etiqueta "Motor"
    # (impreciso, conservado solo por si ninguno de los layouts anteriores aplica).
    texto_upper = texto.upper()
    lineas = texto_upper.splitlines()

    regex_motor = r'\b[A-Z0-9]{9,13}\b'
    frases_validas = ["HECHO EN", "FABRICADO EN", "ENSAMBLADO EN"]

    for i, linea in enumerate(lineas):
        if "MOTOR" in linea:
            for desplazamiento in [9, 10, 11]:
                idx = i + desplazamiento
                if idx < len(lineas):
                    valor = lineas[idx].strip()

                    if re.search(regex_motor, valor):
                        return valor

                    if any(frase in valor for frase in frases_validas):
                        return valor.title()

            break

    return "S/N"


def extraer_serie(texto: str) -> str:
    texto_upper = texto.upper()
    lineas = texto_upper.splitlines()

    regex_serie = r'\b[A-Z0-9]{12,17}\b'

    for i, linea in enumerate(lineas):
        if "SERIE" in linea:
            posibles_inline = re.findall(regex_serie, linea)
            if posibles_inline:
                return posibles_inline[0]

            for desplazamiento in [9, 10, 11, 12]:
                idx = i + desplazamiento
                if idx < len(lineas):
                    valor = lineas[idx].strip()
                    posibles = re.findall(regex_serie, valor)
                    if posibles:
                        return posibles[0]

            break

    return "S/N"


def extraer_modelo(texto: str) -> str | None:
    """
    Qualitas tiene (al menos) dos layouts de texto distintos para este
    campo, según el tipo de póliza/vehículo:

    1. Línea única, etiquetas y valores concatenados en el mismo renglón
       (ej. "Tipo:Camiones Particulares Modelo:2000 Ocupantes: 05") — se
       intenta primero, es el caso simple.
    2. Bloques separados: las etiquetas (Tipo/Modelo/Serie/Motor/Placas/
       Color) vienen todas juntas, y los valores en un bloque aparte más
       abajo. Verificado con 16 pólizas reales: el año SIEMPRE está 3
       líneas después de la línea exacta "Color:" (descripción del
       vehículo, luego el valor de Tipo, luego el año). Antes se anclaba
       al VALOR de Tipo con una lista de categorías conocidas
       ("Automoviles Nacionales/Importados", "Camiones-Panel", ...), pero
       esa lista estaba incompleta — fallaba con categorías reales no
       contempladas como "Automoviles Especiales" o "Camiones
       Particulares". Anclarse a la etiqueta "Color:" evita depender de
       conocer de antemano todas las categorías de vehículo posibles.
    """
    match = re.search(r'Modelo\s*:\s*((?:19|20)\d{2})\b', texto, re.IGNORECASE)
    if match:
        return match.group(1)

    lineas = texto.splitlines()
    for i, linea in enumerate(lineas):
        if linea.strip() == "Color:":
            if i + 3 < len(lineas):
                posible = lineas[i + 3].strip()
                if re.fullmatch(r'(19|20)\d{2}', posible):
                    return posible
            break

    return None


def extraer_placas(texto, paginas_dict):

    if re.search(r'tr[áa]mite', texto, re.IGNORECASE):
        return "TRÁMITE"

    def buscar_desde_patrones(texto):
        patrones = [
            r'INFORMACI[ÓO]N DEL ASEGURADO',
            r'DESCRIPCI[ÓO]N DEL VEH[ÍI]CULO ASEGURADO'
        ]
        lineas = texto.splitlines()
        for i, linea in enumerate(lineas):
            for patron in patrones:
                if re.search(patron, linea, re.IGNORECASE):
                    for j in range(0, 11):
                        if i + j < len(lineas):
                            posible = lineas[i + j].strip()
                            if validar_placa(posible):
                                return formatear_placa(posible)
        return None

    def buscar_en_rango_lineas(texto):
        lineas = texto.splitlines()
        for i, linea in enumerate(lineas):
            if 'placas:' in linea.lower() or 'placa:' in linea.lower():
                for j in range(0, 11):
                    if i + j < len(lineas):
                        posible = lineas[i + j].strip()
                        if validar_placa(posible):
                            return formatear_placa(posible)
        return None

    def extraer_seccion_vehiculo():
        patron = (
            r'VEH[ÍI]CULO ASEGURADO'
            r'(.*?)'
            r'(?:\n{2,}|DESGLOSE|CONSIDERACIONES|IMPORTE|OBSERVACIONES)'
        )
        match = re.search(patron, texto, re.DOTALL | re.IGNORECASE)
        return match.group(1).strip() if match else None

    def buscar_en_tabla():
        for pagina in paginas_dict:
            for bloque in pagina.get("blocks", []):
                for linea in bloque.get("lines", []):
                    texto_linea = ' '.join(span["text"] for span in linea.get("spans", []))
                    if "modelo" in texto_linea.lower() and "placas" in texto_linea.lower():
                        match = re.search(r'(?:Placas|Placa)\s*[:\-]?\s*([A-Z0-9]{5,8})\b', texto_linea, re.IGNORECASE)
                        if match and validar_placa(match.group(1)):
                            return formatear_placa(match.group(1))
                        idx = bloque["lines"].index(linea)
                        if idx + 1 < len(bloque["lines"]):
                            siguiente_linea = bloque["lines"][idx + 1]
                            texto_siguiente = ' '.join(span["text"] for span in siguiente_linea.get("spans", []))
                            texto_siguiente = texto_siguiente.strip()
                            if texto_siguiente == "":
                                return ""
                            if validar_placa(texto_siguiente):
                                return formatear_placa(texto_siguiente)
        return None

    def buscar_en_seccion(seccion):
        match = re.search(r'(?:Placas|Placa)\s*[:\-]?\s*([A-Z0-9]{5,8})(?=\s|$|Motor|Serie|Modelo)', seccion, re.IGNORECASE)
        if match:
            valor = match.group(1).strip()
            if valor == "":
                return ""
            if validar_placa(valor):
                return valor

    def buscar_con_regex():
        patrones = [
            r'(?:Placas|Placa)\s+([A-Z0-9]{5,8})\b',
            r'\b(?:Placas|Placa)[\s:]+([A-Z0-9]{5,8})\b',
            r'\b([A-Z]{2,4}\d{2,5})\b',
            r'\b(\d{2,5}[A-Z]{2,4})\b',
            r'\b([A-Z0-9]{5,8})\b'
        ]
        for patron in patrones:
            match = re.search(patron, texto, re.IGNORECASE)
            if match and validar_placa(match.group(1)):
                return match.group(1)
        return None

    def validar_placa(placa):
        if not placa or len(placa) not in [6, 7]:
            return False
        placa = placa.upper()
        return any([
            re.fullmatch(r'^[A-Z]{2,3}\d{3,4}$', placa),
            re.fullmatch(r'^[A-Z]{4}\d{2,3}$', placa),
            re.fullmatch(r'^\d{2,3}[A-Z]{3,4}$', placa),
            re.fullmatch(r'^[A-Z]\d{2}[A-Z]{3}$', placa),
            re.fullmatch(r'^[A-Z]{2}\d{2}[A-Z]{2}$', placa)
        ])

    def formatear_placa(placa):
        if placa == "No encontrado":
            return placa
        placa = re.sub(r'[^A-Z0-9]', '', placa.upper())
        if len(placa) == 6:
            return f"{placa[:3]}-{placa[3:]}"
        elif len(placa) == 7:
            return f"{placa[:3]}-{placa[3:]}" if placa[3].isdigit() else f"{placa[:4]}-{placa[4:]}"
        return placa

    placa = buscar_desde_patrones(texto)
    if placa:
        return placa

    placa = buscar_en_rango_lineas(texto)
    if placa:
        return placa

    placa = buscar_en_tabla()
    if placa:
        return placa

    seccion = extraer_seccion_vehiculo()
    if seccion:
        placa = buscar_en_seccion(seccion)
        if placa:
            return formatear_placa(placa)

    placa = buscar_con_regex()
    if placa == "":
        return ""
    if placa:
        return formatear_placa(placa)

    lineas = texto.splitlines()
    for i, linea in enumerate(lineas):
        if 'placas:' in linea.lower() or 'placa:' in linea.lower():
            if i + 7 < len(lineas):
                posible = lineas[i + 7].strip()
                if 5 <= len(posible) <= 10:
                    return posible
                else:
                    return ""
            break

    descripcion_patron = r'DESCRIPCI[ÓO]N DEL VEH[ÍI]CULO ASEGURADO(.*?)(?:\n{2,}|DATOS|OBSERVACIONES|COBERTURAS|RESPONSABLE)'
    match = re.search(descripcion_patron, texto, re.DOTALL | re.IGNORECASE)
    if match:
        seccion = match.group(1)
        lineas = seccion.splitlines()
        for linea in lineas:
            if 'placas:' in linea.lower() or 'placa:' in linea.lower():
                partes = linea.split(':', 1)
                if len(partes) > 1:
                    posible = partes[1].strip()
                    posible = re.sub(r'[^A-Z0-9]', '', posible.upper())
                    if len(posible) == 5:
                        return posible

    for linea in texto.splitlines():
        if 'placas:' in linea.lower() or 'placa:' in linea.lower():
            partes = linea.split(':', 1)
            if len(partes) > 1:
                posible = partes[1].strip()
                if posible.lower() == "none" or posible == "":
                    return ""
                return posible
            break

    return "No encontrado"


def extraer_cp(texto):
    conteo_cp = {}
    lineas = texto.splitlines()

    for i, linea in enumerate(lineas):
        if re.search(r'\bINCISO\b', linea, re.IGNORECASE):
            for j in range(7, 10):
                if i + j < len(lineas):
                    posible = lineas[i + j].strip()
                    if re.fullmatch(r'\d{4,5}', posible):
                        cp = posible
                        conteo_cp[cp] = conteo_cp.get(cp, 0) + 1

    bloques = re.split(r'INFORMACI[ÓO]N DEL ASEGURADO', texto, flags=re.IGNORECASE)
    for bloque in bloques[1:]:
        lineas_bloque = bloque.splitlines()
        for i, linea in enumerate(lineas_bloque):
            if re.search(r'\bC\.P\.:', linea, re.IGNORECASE):
                for j in range(7, 10):
                    if i + j < len(lineas_bloque):
                        posible = lineas_bloque[i + j].strip()
                        if re.fullmatch(r'\d{4,5}', posible):
                            cp = posible
                            conteo_cp[cp] = conteo_cp.get(cp, 0) + 1
                            break

    for i, linea in enumerate(lineas):
        if re.search(r'\bENDOSO\b', linea, re.IGNORECASE):
            if i + 10 < len(lineas):
                posible = lineas[i + 10].strip()
                match = re.search(r'\b\d{5}\b', posible)
                if match:
                    cp = match.group(0)
                    conteo_cp[cp] = conteo_cp.get(cp, 0) + 1

    if conteo_cp:
        cp = max(conteo_cp, key=conteo_cp.get)
        return cp.zfill(5)  # CP mexicano siempre 5 dígitos; PDF a veces omite el 0 inicial
    return ""


ESTADOS_MX = {
    "AGUASCALIENTES", "BAJA CALIFORNIA", "BAJA CALIFORNIA SUR", "CAMPECHE", "CHIAPAS", "CHIHUAHUA",
    "CIUDAD DE MEXICO", "COAHUILA", "COLIMA", "DURANGO", "GUANAJUATO", "GUERRERO", "HIDALGO",
    "JALISCO", "MEXICO", "ESTADO DE MEXICO", "MICHOACAN", "MORELOS", "NAYARIT", "NUEVO LEON", "OAXACA", "PUEBLA",
    "QUERETARO", "QUINTANA ROO", "SAN LUIS POTOSI", "SINALOA", "SONORA", "TABASCO", "TAMAULIPAS",
    "TLAXCALA", "VERACRUZ", "YUCATAN", "ZACATECAS"
}


def extraer_municipio(texto):
    lineas = texto.splitlines()

    for i, linea in enumerate(lineas):
        if re.search(r'\bMunicipio\b', linea, re.IGNORECASE):
            match = re.search(r'Municipio\s*:\s*(.*?)\s*Estado\s*:', linea, re.IGNORECASE)
            if match:
                municipio = match.group(1).strip()
                if municipio and municipio.upper() not in ESTADOS_MX and not re.fullmatch(r'\d{4,5}', municipio):
                    return municipio

            match_simple = re.search(r'Municipio\s*:\s*(.+)', linea, re.IGNORECASE)
            if match_simple:
                posible = match_simple.group(1).strip()
                if posible and posible.upper() not in ESTADOS_MX and not re.fullmatch(r'\d{4,5}', posible):
                    return posible

            segmento = lineas[i:i+15]
            cp_idx = estado_idx = None

            for j, l in enumerate(segmento):
                if re.fullmatch(r'\d{4,5}', l.strip()):
                    cp_idx = j
                elif l.strip().upper() in ESTADOS_MX:
                    estado_idx = j
                    break

            if cp_idx is not None and estado_idx is not None and estado_idx > cp_idx + 1:
                municipio = segmento[cp_idx + 1:estado_idx]
                municipio = [l.strip() for l in municipio if l.strip()]
                if municipio:
                    return ' '.join(municipio)

    return ""


def extraer_tipo_vehiculo(texto):
    lineas = texto.splitlines()

    patrones = [
        r'^Autom[oó]viles\s+Nacionales',
        r'^Autom[oó]viles\s+Especiales',
        r'^Autom[oó]viles\s+Importados',
        r'^Camiones-Panel',
        r'^Camiones[-\s]+Particulares',  # el PDF real trae "Camiones Particulares" con espacio, no guion — se acepta cualquiera de los dos
        r'^Motocicletas',
        r'^Tractocami[oó]n'
    ]

    for i, linea in enumerate(lineas):
        if re.search(r'DESCRIPCIÓN DEL VEHÍCULO ASEGURADO', linea, re.IGNORECASE):
            for j in range(0, 11):
                if i + j < len(lineas):
                    posible = lineas[i + j].strip()
                    for patron in patrones:
                        if re.match(patron, posible, re.IGNORECASE):
                            return posible
                    match = re.search(r'Tipo\s*:\s*(.+)', lineas[i + j], re.IGNORECASE)
                    if match:
                        posible = match.group(1).strip()
                        for patron in patrones:
                            if re.match(patron, posible, re.IGNORECASE):
                                return posible
            break

    encontrados = []
    for i, linea in enumerate(lineas):
        if re.search(r'DESCRIPCIÓN DEL VEHÍCULO ASEGURADO', linea, re.IGNORECASE):
            for j in range(0, 11):
                if i + j < len(lineas):
                    posible = lineas[i + j].strip()
                    for patron in patrones:
                        if re.match(patron, posible, re.IGNORECASE):
                            encontrados.append(posible)
                    match = re.search(r'Tipo\s*:\s*(.+)', lineas[i + j], re.IGNORECASE)
                    if match:
                        posible = match.group(1).strip()
                        for patron in patrones:
                            if re.match(patron, posible, re.IGNORECASE):
                                encontrados.append(posible)

    if encontrados:
        contador = Counter(encontrados)
        return contador.most_common(1)[0][0]

    # Fallback: layout alterno donde "Tipo: <valor>" viene inline en una
    # sola línea, pero MUY lejos de "DESCRIPCIÓN DEL VEHÍCULO ASEGURADO"
    # (visto en PDFs reales donde el encabezado queda a más de 100 líneas
    # de distancia, fuera de la ventana de las dos búsquedas de arriba).
    # Se busca "Tipo:" en todo el documento sin acotar por cercanía al
    # encabezado, ya que "Tipo: <categoría>" es una etiqueta suficientemente
    # específica para no dar falsos positivos en otra sección del PDF.
    for linea in lineas:
        match = re.search(r'Tipo\s*:\s*(.+)', linea, re.IGNORECASE)
        if match:
            posible = match.group(1).strip()
            for patron in patrones:
                if re.match(patron, posible, re.IGNORECASE):
                    return posible

    return ""


# ── Mapeo "Tipo:" (texto crudo del PDF) → Subramo del catálogo ──────────────
# Confirmado contra PDFs reales de Quálitas (ver conversación de soporte):
# variantes "Camiones-Panel" y "Camiones Particulares"/"Camiones-Particulares"
# se archivan bajo el Subramo genérico "Camiones" del catálogo (no existe una
# opción "Panel" ni "Particulares" propia entre los 11 Subramos oficiales).
# "Motocicletas" mapea directo, es una de las 11 opciones del catálogo.
# "Tractocamión"/"Tractocamion" (regex ya existente r'^Tractocami[oó]n')
# también se archiva bajo "Camiones" — confirmado, mismo criterio que
# Camiones-Panel/Camiones Particulares.
MAPEO_TIPO_A_SUBRAMO_QUALITAS: dict[str, str] = {
    "camiones-panel":         "Camiones",
    "camiones particulares":  "Camiones",
    "camiones-particulares":  "Camiones",
    "tractocamion":           "Camiones",
    "motocicletas":           "Motocicletas",
}


def _normalizar_tipo_vehiculo(valor: str) -> str:
    """minúsculas, sin acentos, espacios colapsados — para comparar contra
    las claves de MAPEO_TIPO_A_SUBRAMO_QUALITAS sin depender de mayúsculas
    ni de acentos como los trae el PDF ("Automoviles" sin acento, etc.)."""
    sin_acentos = unicodedata.normalize("NFKD", valor).encode("ascii", "ignore").decode("ascii")
    return re.sub(r'\s+', ' ', sin_acentos).strip().lower()


def mapear_tipo_a_subramo(tipo_vehiculo_detectado: str | None) -> str | None:
    """Traduce el valor crudo de extraer_tipo_vehiculo al Subramo oficial
    del catálogo, SOLO cuando corresponde a una categoría distinta de
    "Automóviles" genérico. Devuelve None si no aplica ningún override
    (el Subramo debe quedarse como lo determinó el sistema de puntaje por
    keywords): esto incluye tanto las variantes de "Automóviles ..." como
    cualquier valor no reconocido en el mapeo confirmado."""
    if not tipo_vehiculo_detectado:
        return None
    normalizado = _normalizar_tipo_vehiculo(tipo_vehiculo_detectado)
    if normalizado.startswith("automoviles"):
        return None
    return MAPEO_TIPO_A_SUBRAMO_QUALITAS.get(normalizado)


DESCARTAR_PATTERNS = [
    "ESTA POLIZA AMPARA",
    "ESTIMADO ASEGURADO QUÁLITAS COMPAÑÍA DE SEGUROS",
    "ARTÍCULO 25 DE LA LEY SOBRE EL CONTRATO DE SEGURO",
    "NUESTRA UNIDAD ESPECIALIZADA DE ATENCIÓN A USUARIOS",
    "COMISIÓN NACIONAL PARA LA PROTECCIÓN Y DEFENSA",
    "AVISO DE PRIVACIDAD INTEGRAL",
    "GENERALES Y ESPECIALES DE ESTA PÓLIZA, EL VEHÍCULO CONTRA PÉRDIDAS O DAÑOS CAUSADOS POR CUALQUIERA DE LOS RIESGOS QUE SE"
]


def extraer_descripcion_vehiculo(texto):
    lineas = texto.splitlines()
    descripciones = []

    for i, linea in enumerate(lineas):
        if re.search(r'English', linea, re.IGNORECASE):
            for j in range(12, 15):
                if i + j < len(lineas):
                    posible = lineas[i + j].strip()
                    if re.fullmatch(r'\d{2,5}', posible):
                        descripciones.append(posible)
                        if i + j + 1 < len(lineas):
                            descripciones.append(lineas[i + j + 1].strip())
                        break
            break

    inicio_idx = None
    fin_idx = None
    for i, linea in enumerate(lineas):
        if re.search(r'INFORMACIÓN DEL ASEGURADO', linea, re.IGNORECASE):
            inicio_idx = i
        if re.search(r'INFORMACIÓN IMPORTANTE', linea, re.IGNORECASE):
            fin_idx = i
            break

    if inicio_idx is not None and fin_idx is not None:
        bloque = "\n".join(lineas[inicio_idx:fin_idx])
        vigencias = extraer_vigencia_por_frecuencia(bloque)
        primera_fecha = vigencias.get("Inicio Vigencia")
        if primera_fecha and primera_fecha != "No encontrada":
            for i in range(inicio_idx, fin_idx):
                if primera_fecha in lineas[i]:
                    if i - 1 > inicio_idx:
                        descripciones.append(lineas[i - 1].strip())
                    break

    inicio_fallback = None
    fin_fallback = None
    for i, linea in enumerate(lineas):
        if re.search(r'PÓLIZA DE SEGURO DE AUTOMÓVILES', linea, re.IGNORECASE):
            inicio_fallback = i
        if re.search(r'INFORMACIÓN DEL ASEGURADO', linea, re.IGNORECASE):
            fin_fallback = i
            break

    if inicio_fallback is not None and fin_fallback is not None:
        bloque_fallback = lineas[inicio_fallback:fin_fallback]
        vigencias_fb = extraer_vigencia_por_frecuencia("\n".join(bloque_fallback))
        fecha_fb = vigencias_fb.get("Inicio Vigencia")

        if fecha_fb and fecha_fb != "No encontrada":
            target_idx = fin_fallback - 7
            if target_idx > inicio_fallback and target_idx >= 0:
                posible_valor = lineas[target_idx].strip()

                for pat in DESCARTAR_PATTERNS:
                    if pat in posible_valor.upper():
                        return ""

                descripciones.append(posible_valor)

    if descripciones:
        contador = Counter(descripciones)
        return contador.most_common(1)[0][0]

    return ""


def extraer_colonia(texto: str) -> str:
    texto_upper = texto.upper()
    lineas = texto_upper.splitlines()

    inicio_idx, fin_idx = None, None
    for i, linea in enumerate(lineas):
        if "INFORMACION DEL ASEGURADO" in linea or "INFORMACIÓN DEL ASEGURADO" in linea:
            inicio_idx = i
        if "DESCRIPCION DEL VEHICULO ASEGURADO" in linea or "DESCRIPCIÓN DEL VEHÍCULO ASEGURADO" in linea:
            fin_idx = i
            break

    if inicio_idx is None or fin_idx is None:
        return "No se encontró bloque de asegurado"

    bloque = lineas[inicio_idx:fin_idx]

    for i, linea in enumerate(bloque):
        if re.search(r'\bCOLONIA:', linea, re.IGNORECASE):
            for desplazamiento in range(6, 10):
                idx_colonia = i + desplazamiento
                if idx_colonia < len(bloque):
                    posible_colonia = bloque[idx_colonia].strip()
                    for k in range(1, 6):
                        if idx_colonia - k >= 0:
                            linea_estado = bloque[idx_colonia - k].strip()
                            if linea_estado in ESTADOS_MX:
                                return posible_colonia.title()

    if fin_idx - inicio_idx >= 2:
        idx_colonia = len(bloque) - 2
        posible_colonia = bloque[idx_colonia].strip()
        for k in range(1, 6):
            if idx_colonia - k >= 0:
                linea_estado = bloque[idx_colonia - k].strip()
                if linea_estado in ESTADOS_MX:
                    return posible_colonia.title()

    municipio = extraer_municipio(texto)
    if municipio:
        for i, linea in enumerate(lineas):
            if municipio.upper() in linea.upper():
                if i + 1 < len(lineas):
                    siguiente = lineas[i + 1].strip()
                    if re.search(r'\bCOLONIA:', siguiente, re.IGNORECASE):
                        partes = siguiente.split(":", 1)
                        if len(partes) > 1:
                            return partes[1].strip().title()

    return "No se encontró colonia"


def extraer_direccion(texto):
    lineas = texto.splitlines()

    inicio_idx = None
    fin_idx = None

    for i, linea in enumerate(lineas):
        if re.search(r'INFORMACIÓN DEL ASEGURADO', linea, re.IGNORECASE):
            inicio_idx = i
        if re.search(r'DESCRIPCIÓN DEL VEHÍCULO ASEGURADO', linea, re.IGNORECASE):
            fin_idx = i
            break

    if inicio_idx is not None and fin_idx is not None:
        bloque = "\n".join(lineas[inicio_idx:fin_idx])
        cp = extraer_cp(bloque)
        if cp:
            lineas_bloque = bloque.splitlines()
            for i, linea in enumerate(lineas_bloque):
                if cp in linea:
                    if i - 1 >= 0:
                        return lineas_bloque[i - 1].strip()

    vigencias = extraer_vigencia_por_frecuencia(texto)
    primera_fecha = vigencias.get("Inicio Vigencia")
    if primera_fecha and primera_fecha != "No encontrada":
        fecha_idx = None
        fin_idx = None

        for i, linea in enumerate(lineas):
            if primera_fecha in linea:
                fecha_idx = i
                break

        for i, linea in enumerate(lineas):
            if re.search(r'INFORMACIÓN DEL ASEGURADO', linea, re.IGNORECASE):
                fin_idx = i
                break

        if fecha_idx is not None and fin_idx is not None and fecha_idx < fin_idx:
            for desplazamiento in range(2, 6):
                target_idx = fecha_idx + desplazamiento
                if target_idx < fin_idx and target_idx < len(lineas):
                    posible = lineas[target_idx].strip()
                    if re.search(r'\b(MZA|MZ|MANZANA|LTE|LOTE|CALLE|AV\.?|AVENIDA|NO\.?\s*EXT|NO\.?\s*INT|COLONIA)\b', posible, re.IGNORECASE):
                        return posible

            cp = extraer_cp(texto)
            if cp:
                for i, linea in enumerate(lineas):
                    if cp in linea:
                        if i - 1 >= 0:
                            return lineas[i - 1].strip()

    return ""


def extraer_agente(texto: str) -> tuple[str | None, str | None]:
    """
    En Quálitas, dentro de la sección "OFICINA DE ATENCIÓN DE SERVICIO",
    el nombre del agente y su clave aparecen en líneas consecutivas
    (no en la misma línea como en un principio se asumió):

        Agente:
        CIUDAD DE MEXICO          <- ciudad de la oficina, se ignora
        JIRO Y ASOCIADOS,AGENTE DE SEGUROS Y FIANZAS,S.A. DE C.V.
        57335                     <- clave (4-6 dígitos)
        5-46-14-58                <- teléfono, no nos interesa

    Se busca la primera línea que sea íntegramente una clave numérica
    dentro de las líneas siguientes a "Agente:"; el nombre es la línea
    inmediatamente anterior a esa clave.
    """
    idx = texto.find("Agente:")
    if idx == -1:
        return None, None

    fragmento = texto[idx:idx + 400]
    lineas = [l.strip() for l in fragmento.splitlines() if l.strip()]

    for i in range(1, len(lineas)):
        if re.fullmatch(r"\d{4,6}", lineas[i]):
            clave = lineas[i]
            nombre = lineas[i - 1] if i - 1 >= 1 else None
            return clave, nombre

    return None, None


def _a_float(valor) -> float:
    """Convierte un monto extraído ("6,490.48", None, "") a float; 0.0 si falta o no es numérico."""
    if not valor:
        return 0.0
    try:
        return float(str(valor).replace(",", ""))
    except ValueError:
        return 0.0


def calcular_subtotal(prima_neta, descuento, recargos, derechos):
    """
    Sub Total es un campo CALCULADO según el catálogo Sicas, no se extrae
    de ninguna etiqueta del PDF: Sub Total = Prima Neta - Descuento +
    Recargos + Derechos. Quálitas no extrae "Recargos" (no existe ese
    concepto en su desglose), así que se trata como 0 cuando falta.
    Verificado contra un PDF real: 6490.48 - 129.81 + 0 + 870.00 =
    7230.67, exactamente el Subtotal real impreso en esa póliza.
    """
    if not prima_neta:
        return None
    total = _a_float(prima_neta) - _a_float(descuento) + _a_float(recargos) + _a_float(derechos)
    return f"{total:,.2f}"


def extraer_subtotal_pdf(texto: str) -> str | None:
    """
    Valor de "Subtotal" tal como aparece impreso literalmente en el PDF
    (a diferencia de calcular_subtotal, que lo reconstruye a partir de
    otros campos). Se usa como referencia cruzada — ver validar_subtotal.

    Dos layouts posibles:
    1. Línea única, con la etiqueta y el valor mezclados con otro texto
       en la misma línea — el regex está acotado a UNA sola línea (no
       cruza "\\n") para no confundirse con el layout de bloques de abajo.
    2. Bloques separados (mismo patrón que Motor/Modelo): la etiqueta
       "Subtotal" vive sola en un bloque de etiquetas, y su valor
       numérico está 8 líneas más abajo, en el bloque de valores
       correspondiente. Verificado contra un PDF real donde el bloque de
       etiquetas es "Prima Neta / Tasa Financiamiento / Gastos por
       Expedición / Subtotal / 16% / I.V.A. / IMPORTE TOTAL / Tarifa
       Aplicada" — "Subtotal" cae en la posición 3, y +8 aterriza exacto
       en su valor real (6,022.40).
    """
    match = re.search(r'Subtotal[^\n]*?(-?[\d,]+\.\d{2})', texto, re.IGNORECASE)
    if match:
        return match.group(1)

    lineas = texto.splitlines()
    for i, linea in enumerate(lineas):
        if linea.strip().lower() == "subtotal":
            idx = i + 8
            if idx < len(lineas):
                posible = lineas[idx].strip()
                if re.fullmatch(r'-?[\d,]+\.\d{2}', posible):
                    return posible
            break

    return None


def validar_subtotal(subtotal_calculado, subtotal_pdf, prima_total, iva):
    """
    Cruza el cálculo constructivo de Sub Total (Prima Neta - Descuento +
    Recargos + Derechos) contra una referencia independiente (Prima Total
    - IVA), porque el cálculo puede contaminarse si algún campo que lo
    compone se extrajo mal o con el signo equivocado (ej. "Tasa de
    Financiamiento" positiva vs negativa según el PDF).

    - Si subtotal_calculado coincide con la referencia (tolerancia 0.01):
      se usa subtotal_calculado.
    - Si NO coincide: se prefiere subtotal_pdf (el valor impreso
      literalmente, más confiable en ese caso).
    - Si subtotal_pdf tampoco se pudo extraer: se usa subtotal_calculado
      de todos modos como último recurso, pero se registra un warning
      indicando que la validación falló sin alternativa.
    """
    referencia = None
    if prima_total and iva:
        referencia = _a_float(prima_total) - _a_float(iva)

    if subtotal_calculado and referencia is not None and round(abs(_a_float(subtotal_calculado) - referencia), 2) <= 0.01:
        return subtotal_calculado

    if subtotal_pdf:
        return subtotal_pdf

    if subtotal_calculado:
        logging.getLogger(__name__).warning(
            "Qualitas: Sub Total calculado (%s) no coincide con la referencia "
            "Prima Total - IVA, y no se encontró el valor impreso en el PDF; "
            "se usa el calculado sin poder validarlo.",
            subtotal_calculado,
        )
    return subtotal_calculado


# ────────────────────────────────────────────────────────────────────────────
# Punto de entrada usado por el pipeline (nivel 1)
# ────────────────────────────────────────────────────────────────────────────

_SENTINELS_NO_ENCONTRADO = {
    "", "no encontrado", "s/n",
    "no se encontraron rfcs válidos",
    "no se encontró prima neta",
    "no se encontró tasa de financiamiento",
    "no se encontró gastos de expedición",
    "no se encontró subtotal",
    "no se encontró prima total",
    "no se encontró nombre o razón social",
    "no se encontró i.v.a.",
    "forma de pago no encontrada",
    "moneda no encontrada",
    "no se encontró bloque de asegurado",
    "no se encontró colonia",
    "no encontrada",
}


def _valido(valor) -> bool:
    return bool(valor) and valor.strip().lower() not in _SENTINELS_NO_ENCONTRADO


def extraer(texto: str, pdf_bytes: bytes | None = None) -> dict[str, str]:
    """
    Punto de entrada del extractor especializado (nivel 1). Devuelve solo
    los campos que logró encontrar con certeza; el resto queda a cargo
    del motor de reglas de BD (nivel 2).
    """
    if not pdf_bytes or not es_poliza_auto_qualitas(texto):
        return {}

    texto, paginas_dict = _leer_con_fitz(pdf_bytes)

    vigencia = extraer_vigencia_por_frecuencia(texto)
    clave_agente, nombre_agente = extraer_agente(texto)

    # Si la razón social contiene una figura jurídica (S.A., A.C., etc.),
    # el asegurado es Persona Moral: normalizamos las siglas a mayúsculas
    # sin puntos (ej. "S.A. de C.V." -> "SA de CV"), dejando el resto del
    # nombre y los conectores ("de"/"en"/"por") exactamente igual.
    nombre_cliente = extraer_nombre_cliente(texto)
    if nombre_cliente and es_persona_moral_por_nombre(nombre_cliente):
        nombre_cliente = normalizar_siglas_razon_social(nombre_cliente)

    # Descuento: en el PDF la tasa de financiamiento viene negativa
    # (resta a la prima neta); SICAS espera 'descuento' como magnitud.
    tasa_financiamiento = extraer_tasa_financiamiento(texto)
    descuento = tasa_financiamiento.lstrip('-') if _valido(tasa_financiamiento) else None

    prima_neta = extraer_prima_neta(texto)
    derechos = extraer_gastos_expedicion(texto)
    iva = extraer_iva(texto)
    prima_total = extraer_prima_total(texto)
    # Quálitas no tiene concepto de "Recargos" en su desglose (queda en 0
    # dentro de la fórmula) — ver calcular_subtotal.
    subtotal_calculado = calcular_subtotal(prima_neta, descuento, None, derechos)
    subtotal_pdf = extraer_subtotal_pdf(texto)
    subtotal = validar_subtotal(subtotal_calculado, subtotal_pdf, prima_total, iva)

    candidatos = {
        "documento":       extraer_numero_poliza_qualitas(texto),
        "rfc":             extraer_rfc_mas_repetido(texto),
        "nombre_cliente":  nombre_cliente,
        "desde":           vigencia.get("Inicio Vigencia"),
        "hasta":           vigencia.get("Fin Vigencia"),
        "prima_neta":      prima_neta,
        "derechos":        derechos,
        "sub_total":       subtotal,
        "iva":             iva,
        "prima_total":     prima_total,
        "forma_pago":      extraer_forma_pago(texto),
        "moneda":          extraer_moneda(texto),
        "motor":           extraer_motor(texto),
        "serie":           extraer_serie(texto),
        "placas":          extraer_placas(texto, paginas_dict),
        "cp":              extraer_cp(texto),
        "tipo_vehiculo":   extraer_tipo_vehiculo(texto),
        "descripcion_veh": extraer_descripcion_vehiculo(texto),
        "colonia":         extraer_colonia(texto),
        "municipio":       extraer_municipio(texto),
        "direccion_completa": extraer_direccion(texto),
        "agente_clave":    clave_agente,
        "agente_nombre":   nombre_agente,
        "modelo":          extraer_modelo(texto),
        "descuento":       descuento,
    }

    return {campo: valor for campo, valor in candidatos.items() if _valido(valor)}
