"""
Extractor especializado para GNP Seguros — Fase 1 de la nueva
arquitectura de extracción en 3 niveles.

Portado de poliza_gnp.py (parser legacy, eliminado del proyecto en el
refactor de arquitectura). Las funciones internas se conservan tal cual
del original; lo único nuevo es extraer(), el punto de entrada que usa
el pipeline (api/services/extractor.py) y que traduce las etiquetas en
español del parser legacy a los nombre_campo del esquema actual.

Campos del parser legacy SIN destino en el esquema actual (se omiten a
propósito, no se capturan por este nivel):
    - "Tipo de Póliza" (Amplia/Limitada/...)
    - "Uso" (Particular/Comercial/...)
    - "Dirección" (solo existen colonia/municipio/cp por separado)
    - "Nombre del Agente" (se usa la clave del agente en su lugar,
      ambos compiten por el mismo campo "agente")
"""
from __future__ import annotations
import re

import fitz  # PyMuPDF


def _leer_con_fitz(pdf_bytes: bytes) -> tuple[str, list[dict]]:
    """
    Igual que en qualitas.py: las funciones heredadas de poliza_gnp.py
    que usan offsets de línea fijos están calibradas contra el
    line-splitting de PyMuPDF, distinto al de pdfplumber (motor del
    pipeline principal). Se regenera el texto aquí con PyMuPDF para
    que esos offsets sigan siendo válidos.
    """
    texto = ""
    paginas_dict = []
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        for pagina in doc:
            texto += pagina.get_text()
            paginas_dict.append(pagina.get_text("dict"))
    return texto, paginas_dict


def es_poliza_auto_gnp(texto):
    palabras_clave = ["vehículo asegurado", "auto individual", "automóvil", "tipo de uso", "serie", "placas"]
    return any(p in texto.lower() for p in palabras_clave)


# ════════════════════════════════════════════════════════════════════════
# UTILIDADES DE POSICIONAMIENTO (BBOX)
# ════════════════════════════════════════════════════════════════════════

def _spans_pagina(pagina_dict):
    """Aplana un page.get_text('dict') a una lista de spans con texto y bbox.
    Ignora spans vacíos (espacios sueltos que PyMuPDF a veces genera)."""
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
    """Encuentra el primer span cuyo texto contiene (o es igual a) `etiqueta`,
    opcionalmente acotado a una franja vertical [desde_y, hasta_y) de la página
    (útil para no confundir, por ejemplo, el 'Nombre' del contratante con el
    de otra sección)."""
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
    """Dado el span de una etiqueta, busca su valor asociado usando geometría:
      - Prioriza un valor en la MISMA fila, a la derecha (mismo y, x mayor).
      - Si no hay, busca un valor en la COLUMNA debajo (mismo x aprox, y mayor).
    `etiquetas_excluir` evita devolver como "valor" el texto de otra etiqueta
    conocida de la misma tabla (ej. no confundir 'Placas' con valor de 'Modelo').
    """
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
    """Como _valor_por_posicion pero para campos que pueden ocupar varias
    líneas en la misma columna (ej. Dirección, Descripción del vehículo)."""
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


def _campo_por_etiqueta(paginas_dict, etiqueta, etiquetas_excluir=None, multilinea=False,
                         pagina_idx=None, **kwargs):
    """Recorre las páginas (o una específica) buscando `etiqueta` y devuelve
    su valor usando geometría. Punto de entrada principal de las funciones
    de extracción posicional."""
    indices = [pagina_idx] if pagina_idx is not None else range(len(paginas_dict))
    for idx in indices:
        if idx >= len(paginas_dict):
            continue
        spans = _spans_pagina(paginas_dict[idx])
        etiqueta_span = _encontrar_etiqueta(spans, etiqueta)
        if not etiqueta_span:
            continue
        if multilinea:
            valor = _valores_multilinea_por_posicion(spans, etiqueta_span, etiquetas_excluir, **kwargs)
        else:
            valor = _valor_por_posicion(spans, etiqueta_span, etiquetas_excluir, **kwargs)
        if valor:
            return valor
    return ""


# ════════════════════════════════════════════════════════════════════════
# UTILIDADES DE TEXTO PLANO (fallback / campos que ya eran confiables)
# ════════════════════════════════════════════════════════════════════════

def buscar_valor_monetario(paginas_dict, etiqueta):
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


def buscar_texto_despues(paginas_dict, etiqueta, opciones):
    for pagina in paginas_dict:
        for bloque in pagina.get("blocks", []):
            for linea in bloque.get("lines", []):
                for i, span in enumerate(linea.get("spans", [])):
                    if etiqueta.lower() in span["text"].lower():
                        for siguiente in linea["spans"][i+1:]:
                            texto = siguiente["text"].strip().capitalize()
                            if texto in opciones:
                                return texto
    return ""


def extraer_por_lineas_regex(texto, patrones):
    for patron in patrones:
        match = re.search(patron, texto, re.IGNORECASE)
        if match:
            return match.group(1).replace(",", "") if match.group(1) else ""
    return ""


# ════════════════════════════════════════════════════════════════════════
# CAMPOS DEL ENCABEZADO / TIPO DE PÓLIZA
# ════════════════════════════════════════════════════════════════════════

def extraer_numero_poliza(texto, paginas_dict):
    patrones = [
        r'No\.?\s*P[oó]liza\s*[:\-]?\s*([A-Z0-9\-]+)',
        r'P[oó]liza\s*(?:No\.|Núm\.?|Número)?\s*[:\-]?\s*([A-Z0-9\-]+)',
    ]
    valor = extraer_por_lineas_regex(texto, patrones)
    if valor:
        return valor
    # Fallback por posición: valor a la derecha de "No. Póliza"
    return _campo_por_etiqueta(paginas_dict, "No. Póliza", pagina_idx=0)


def extraer_renovacion(texto, paginas_dict):
    """'Versión' y 'Renovación' están en la misma fila de encabezado, y sus
    valores en la fila siguiente, cada uno alineado bajo su propia etiqueta."""
    valor = _campo_por_etiqueta(
        paginas_dict, "Renovación",
        etiquetas_excluir={"versión", "renovación"},
        pagina_idx=0, permitir_misma_fila=False,
    )
    if valor:
        return valor.strip()
    # Fallback: método original por offset de líneas
    lineas = texto.splitlines()
    for i, linea in enumerate(lineas):
        if "renovación" in linea.lower() and i + 2 < len(lineas):
            valor = lineas[i+2].strip()
            if valor:
                return valor
    return ""


# ════════════════════════════════════════════════════════════════════════
# CONTRATANTE
# ════════════════════════════════════════════════════════════════════════

def _spans_seccion_contratante(paginas_dict):
    """Acota la búsqueda a la franja vertical de la sección CONTRATANTE,
    para no confundir 'Nombre'/'Dirección' con los de otras secciones
    (ej. Conductor Habitual, Agente)."""
    if not paginas_dict:
        return [], None
    spans = _spans_pagina(paginas_dict[0])
    inicio = _encontrar_etiqueta(spans, "CONTRATANTE", coincidencia_exacta=True)
    fin = _encontrar_etiqueta(spans, "VEHÍCULO ASEGURADO") or _encontrar_etiqueta(spans, "VEHICULO ASEGURADO")
    if not inicio:
        return spans, None
    y0 = inicio["y0"]
    y1 = fin["y0"] if fin else y0 + 200
    seccion = [s for s in spans if y0 <= s["y0"] < y1]
    return seccion, inicio


def extraer_nombre_cliente(texto, paginas_dict):
    seccion, _ = _spans_seccion_contratante(paginas_dict)
    etiqueta = _encontrar_etiqueta(seccion, "Nombre", coincidencia_exacta=True)
    excluir = {"código de cliente", "r.f.c.", "dirección", "referencia"}
    valor = _valor_por_posicion(seccion, etiqueta, etiquetas_excluir=excluir,
                                 tolerancia_x=20, permitir_misma_fila=False, max_distancia_y=90)
    if valor and len(valor) > 4:
        return valor

    # Fallback: método original basado en offset de líneas
    lineas = texto.splitlines()
    for i, linea in enumerate(lineas):
        if "contratante" in linea.lower():
            limite = i + 8
            for j in range(i + 1, limite + 1):
                if j >= len(lineas):
                    break
                if "vehículo asegurado" in lineas[j].lower():
                    return "No encontrado"
            if limite < len(lineas):
                nombre = lineas[limite].strip()
                if nombre and len(nombre) > 4:
                    return nombre
    return "No encontrado"


def extraer_rfc(texto, paginas_dict):
    """El R.F.C. del contratante puede confundirse con el R.F.C. de GNP
    (que aparece impreso en el membrete, ej. 'GNP9211244P0'). Se busca
    primero acotado a la sección CONTRATANTE por posición, y si se usa el
    fallback de regex sobre todo el texto, se excluye explícitamente el
    RFC corporativo de GNP."""
    RFC_GNP = "GNP9211244P0"

    seccion, _ = _spans_seccion_contratante(paginas_dict)
    etiqueta = _encontrar_etiqueta(seccion, "R.F.C.") or _encontrar_etiqueta(seccion, "RFC")
    excluir = {"código de cliente", "nombre", "dirección", "referencia"}
    valor = _valor_por_posicion(seccion, etiqueta, etiquetas_excluir=excluir, permitir_misma_fila=False)
    if valor and valor.upper() != RFC_GNP and re.fullmatch(r'[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{0,3}', valor.upper()):
        return valor.upper()

    # Fallback por regex sobre el texto completo
    patrones = [
        r'R\.?F\.?C\.?\s*[:\-]?\s*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{0,3})',
        r'\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{0,3})\b'
    ]
    for patron in patrones:
        for rfc in re.findall(patron, texto, re.IGNORECASE):
            rfc = rfc.upper()
            if rfc == RFC_GNP:
                continue
            if 10 <= len(rfc) <= 13:
                return rfc
    return ""


# ════════════════════════════════════════════════════════════════════════
# DETALLE DE PRIMA (montos)
# ════════════════════════════════════════════════════════════════════════

def extraer_prima_neta(texto, paginas_dict):
    valor = extraer_por_lineas_regex(texto, [r'Prima\s+Neta\s*[:\-]?\s*\$?\s*([0-9,]+\.\d{2})'])
    return valor or buscar_valor_monetario(paginas_dict, "prima neta") or \
        _campo_por_etiqueta(paginas_dict, "Prima Neta", etiquetas_excluir={"prima neta con descuento"})


def extraer_derecho_poliza(texto, paginas_dict):
    valor = extraer_por_lineas_regex(texto, [r'Derecho\s+(?:de\s+)?P[oó]liza\s*[:\-]?\s*\$?\s*([0-9,]+\.\d{2})'])
    return valor or buscar_valor_monetario(paginas_dict, "derecho")


def extraer_iva(texto, paginas_dict):
    valor = extraer_por_lineas_regex(texto, [r'I\.?V\.?A\.?\s*[:\-]?\s*\$?([0-9,]+\.\d{2})'])
    return valor or buscar_valor_monetario(paginas_dict, "iva")


def extraer_importe_pagar(texto, paginas_dict):
    valor = extraer_por_lineas_regex(texto, [r'Importe\s+por\s+pagar\s*[:\-]?\s*\$?([0-9,]+\.\d{2})'])
    return valor or buscar_valor_monetario(paginas_dict, "importe por pagar")


def extraer_recargo_fraccionado(texto, paginas_dict):
    valor = extraer_por_lineas_regex(texto, [r'Recargo\s+por\s+pago\s+fraccionado\s*[:\-]?\s*\$?([0-9,]+\.\d{2})'])
    return valor or buscar_valor_monetario(paginas_dict, "recargo")


def extraer_vigencia(texto, paginas_dict):
    match = re.search(
        r'Desde\s+las\s+\d{1,2}\s+hrs\s+del\s+(\d{1,2}/\w{3}/\d{4})\s+Hasta\s+las\s+\d{1,2}\s+hrs\s+del\s+(\d{1,2}/\w{3}/\d{4})',
        texto
    )
    if match:
        return {"Inicio Vigencia": match.group(1), "Fin Vigencia": match.group(2)}
    return {"Inicio Vigencia": "No encontrada", "Fin Vigencia": "No encontrada"}


# ════════════════════════════════════════════════════════════════════════
# VEHÍCULO ASEGURADO
# ════════════════════════════════════════════════════════════════════════

def _spans_seccion_vehiculo(paginas_dict):
    if not paginas_dict:
        return []
    spans = _spans_pagina(paginas_dict[0])
    inicio = _encontrar_etiqueta(spans, "VEHÍCULO ASEGURADO") or _encontrar_etiqueta(spans, "VEHICULO ASEGURADO")
    fin = _encontrar_etiqueta(spans, "CONSIDERACIONES IMPORTANTES") or \
        _encontrar_etiqueta(spans, "DESGLOSE DE COBERTURAS")
    if not inicio:
        return spans
    y0 = inicio["y0"]
    y1 = fin["y0"] if fin else y0 + 200
    return [s for s in spans if y0 <= s["y0"] < y1]


def extraer_descripcion(texto, paginas_dict):
    seccion = _spans_seccion_vehiculo(paginas_dict)
    etiqueta = _encontrar_etiqueta(seccion, "Descripción", coincidencia_exacta=True)
    excluir = {"categoría"}
    valor = _valores_multilinea_por_posicion(seccion, etiqueta, etiquetas_excluir=excluir,
                                              tolerancia_x=10, max_distancia_y=40, max_lineas=3)
    if valor:
        # corta si por error arrastró el inicio de "Serie..."
        valor = re.split(r'\bSerie\b', valor, flags=re.IGNORECASE)[0].strip()
        if valor:
            return valor

    # Fallback: método original
    lineas = texto.splitlines()
    descripcion, encontrado = [], False
    patron_serie = re.compile(r"\b[A-HJ-NPR-Z0-9]{17}\b")
    for i, linea in enumerate(lineas):
        if not encontrado and "vehículo asegurado" in linea.lower():
            encontrado = True
            continue
        if encontrado and "descripción" in linea.lower():
            for j in range(i+2, i+4):
                if j < len(lineas):
                    contenido = lineas[j].strip()
                    if patron_serie.fullmatch(contenido):
                        break
                    if contenido and not re.search(r"serie|modelo|placa|versión", contenido.lower()):
                        descripcion.append(contenido)
                    else:
                        break
            return " ".join(descripcion).strip()
    return ""


def extraer_serie(texto, paginas_dict):
    match = re.search(r'\b([A-HJ-NPR-Z0-9]{17})\b', texto)
    if match:
        return match.group(1)
    # Fallback por posición, por si el VIN no cumple el patrón estricto
    seccion = _spans_seccion_vehiculo(paginas_dict)
    etiqueta = _encontrar_etiqueta(seccion, "Serie", coincidencia_exacta=True)
    valor = _valor_por_posicion(seccion, etiqueta, etiquetas_excluir={"modelo", "placas", "motor"})
    return valor.strip()


def extraer_modelo(texto, paginas_dict):
    seccion = _spans_seccion_vehiculo(paginas_dict)
    etiqueta = _encontrar_etiqueta(seccion, "Modelo", coincidencia_exacta=True)
    # max_distancia_y acotado a ~18pt: el valor SIEMPRE está en la fila
    # inmediata siguiente. Si se deja un margen amplio (como en otros
    # campos) y la celda vecina (Placas) viene vacía en el PDF, el
    # algoritmo "salta" y termina agarrando el valor de la fila de abajo
    # (Uso), que no tiene nada que ver.
    valor = _valor_por_posicion(seccion, etiqueta, etiquetas_excluir={"placas", "motor"},
                                 permitir_misma_fila=False, max_distancia_y=18)
    if re.match(r'^(19|20)\d{2}$', valor.strip()):
        return valor.strip()

    # Fallback: método original
    lineas = texto.splitlines()
    buscando_modelo = False
    for i, linea in enumerate(lineas):
        if "vehículo asegurado" in linea.lower():
            buscando_modelo = True
            continue
        if buscando_modelo and "modelo" in linea.lower():
            for offset in range(1, 5):
                idx = i + offset
                if idx < len(lineas):
                    contenido = lineas[idx].strip()
                    if re.match(r"^(19|20)\d{2}$", contenido):
                        return contenido
            break
    return "No encontrado"


_VALORES_PLACA_ESPECIALES = {"permiso", "s/n", "sn", "sin placas", "pendiente", "en trámite", "en tramite", "n/a"}


def _validar_placa(placa):
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


def _formatear_placa(placa):
    if len(placa) not in [6, 7]:
        return placa
    placa = re.sub(r'[^A-Z0-9]', '', placa.upper())
    if len(placa) == 6:
        return f"{placa[:3]}-{placa[3:]}"
    elif len(placa) == 7:
        return f"{placa[:3]}-{placa[3:]}" if placa[3].isdigit() else f"{placa[:4]}-{placa[4:]}"
    return placa


def extraer_placas(texto, paginas_dict):
    """Antes: si la placa no calzaba con el patrón típico (ej. 'PERMISO',
    'S/N', placas con formatos nuevos), la función devolvía '' y se perdía
    el dato. Ahora: se busca primero por posición (columna 'Placas' en la
    fila Modelo/Placas/Motor), y se conserva el valor crudo si no logra
    validarse como placa estándar, en vez de descartarlo."""
    seccion = _spans_seccion_vehiculo(paginas_dict)
    etiqueta = _encontrar_etiqueta(seccion, "Placas", coincidencia_exacta=True)
    valor = _valor_por_posicion(seccion, etiqueta, etiquetas_excluir={"modelo", "motor"},
                                 permitir_misma_fila=False, max_distancia_y=18)

    if not valor:
        valor = _extraer_placas_legacy(texto, paginas_dict)

    valor = valor.strip()
    if not valor:
        return ""
    if valor.lower() in _VALORES_PLACA_ESPECIALES:
        return valor.upper()

    placa_limpia = re.sub(r'[^A-Z0-9]', '', valor.upper())
    if _validar_placa(placa_limpia):
        return _formatear_placa(placa_limpia)
    return valor


def _extraer_placas_legacy(texto, paginas_dict):
    """Método anterior basado en regex/texto plano, conservado como
    fallback para PDFs con estructura distinta a la tabla estándar."""

    def extraer_seccion_vehiculo():
        patron = r'VEH[ÍI]CULO ASEGURADO(.*?)(?:\n{2,}|DESGLOSE|CONSIDERACIONES|IMPORTE|OBSERVACIONES)'
        match = re.search(patron, texto, re.DOTALL | re.IGNORECASE)
        return match.group(1).strip() if match else None

    def buscar_en_tabla():
        for pagina in paginas_dict:
            for bloque in pagina.get("blocks", []):
                for linea in bloque.get("lines", []):
                    texto_linea = ' '.join(span["text"] for span in linea.get("spans", []))
                    if "modelo" in texto_linea.lower() and "placas" in texto_linea.lower():
                        match = re.search(r'(?:Placas|Placa)\s*[:\-]?\s*([A-Z0-9]{6,7})\b', texto_linea, re.IGNORECASE)
                        if match:
                            return match.group(1)
                        idx = bloque["lines"].index(linea)
                        if idx + 1 < len(bloque["lines"]):
                            siguiente_linea = bloque["lines"][idx + 1]
                            texto_siguiente = ' '.join(span["text"] for span in siguiente_linea.get("spans", [])).strip()
                            return texto_siguiente
        return None

    def buscar_en_seccion(seccion):
        match = re.search(r'(?:Placas|Placa)\s*[:\-]?\s*([A-Z0-9]{6,7})(?=\s|$|Motor|Serie|Modelo)', seccion, re.IGNORECASE)
        return match.group(1).strip() if match else None

    def buscar_con_regex():
        patrones = [
            r'(?:Placas|Placa)\s+([A-Z0-9]{6,7})\b',
            r'\b(?:Placas|Placa)[\s:]+([A-Z0-9]{6,7})\b',
        ]
        for patron in patrones:
            match = re.search(patron, texto, re.IGNORECASE)
            if match:
                return match.group(1)
        return None

    placa = buscar_en_tabla()
    if placa:
        return placa
    seccion = extraer_seccion_vehiculo()
    if seccion:
        placa = buscar_en_seccion(seccion)
        if placa:
            return placa
    return buscar_con_regex() or ""


# ════════════════════════════════════════════════════════════════════════
# AGENTE
# ════════════════════════════════════════════════════════════════════════

def _spans_seccion_agente(paginas_dict):

    for pagina in reversed(paginas_dict):
        spans = _spans_pagina(pagina)
        titulo = next((s for s in spans if s["texto"] == "AGENTE"), None)
        if titulo:
            y0 = titulo["y0"]
            return [s for s in spans if y0 < s["y0"] <= y0 + 40]
    return []


def extraer_clave_agente(texto, paginas_dict):
    spans = _spans_seccion_agente(paginas_dict)
    etiqueta = _encontrar_etiqueta(spans, "Clave", coincidencia_exacta=True)
    valor = _valor_por_posicion(spans, etiqueta, etiquetas_excluir={"agente", "fecha de expedición"},
                                 permitir_misma_fila=False)
    if valor:
        return valor.strip()

    # Fallback: método original
    lineas = texto.splitlines()
    for i, linea in enumerate(lineas):
        if "agente" in linea.lower():
            idx_clave = i + 4
            if idx_clave < len(lineas):
                posible_clave = lineas[idx_clave].strip()
                if posible_clave and posible_clave.replace(" ", "").isdigit():
                    return posible_clave
            break
    return "No encontrado"


def extraer_nombre_agente(texto, paginas_dict):
    spans = _spans_seccion_agente(paginas_dict)
    etiqueta = _encontrar_etiqueta(spans, "Agente", coincidencia_exacta=True)
    valor = _valor_por_posicion(spans, etiqueta, etiquetas_excluir={"clave", "fecha de expedición"},
                                 permitir_misma_fila=False)
    if valor and len(valor) > 5:
        return valor.strip()

    # Fallback: método original
    lineas = texto.splitlines()
    for i, linea in enumerate(lineas):
        if "agente" in linea.lower():
            idx_nombre = i + 5
            if idx_nombre < len(lineas):
                nombre = lineas[idx_nombre].strip()
                if nombre and len(nombre) > 5:
                    return nombre
            break
    return "No encontrado"


def extraer_direccion(texto, paginas_dict):
    seccion, _ = _spans_seccion_contratante(paginas_dict)
    etiqueta = _encontrar_etiqueta(seccion, "Dirección", coincidencia_exacta=True)
    excluir = {"código de cliente", "nombre", "r.f.c.", "referencia"}
    valor = _valores_multilinea_por_posicion(seccion, etiqueta, etiquetas_excluir=excluir,
                                              tolerancia_x=20, max_distancia_y=90, max_lineas=3)
    if valor:
        return valor.strip()

    # Fallback: método original
    lineas = texto.splitlines()
    direccion = []
    for i, linea in enumerate(lineas):
        if "dirección" in linea.lower():
            inicio = i + 4
            for offset in range(0, 3):
                idx = inicio + offset
                if idx >= len(lineas):
                    break
                contenido = lineas[idx].strip()
                if contenido:
                    direccion.append(contenido)
                    if re.search(r"c\s*\.?\s*p\s*\.?[:\s]*\d{4,5}", contenido.lower()):
                        break
            return " ".join(direccion).strip() if direccion else "No encontrado"
    return "No encontrado"


# ────────────────────────────────────────────────────────────────────────────
# Punto de entrada usado por el pipeline (nivel 1)
# ────────────────────────────────────────────────────────────────────────────

_SENTINELS_NO_ENCONTRADO = {"", "no encontrado", "no encontrada"}


def _valido(valor) -> bool:
    return bool(valor) and str(valor).strip().lower() not in _SENTINELS_NO_ENCONTRADO


def extraer(texto: str, pdf_bytes: bytes | None = None) -> dict[str, str]:
    """
    Punto de entrada del extractor especializado (nivel 1). Devuelve solo
    los campos que logró encontrar con certeza; el resto queda a cargo
    del motor de reglas de BD (nivel 2).
    """
    if not pdf_bytes or not es_poliza_auto_gnp(texto):
        return {}

    texto, paginas_dict = _leer_con_fitz(pdf_bytes)

    vigencia = extraer_vigencia(texto, paginas_dict)

    candidatos = {
        "renovacion":      extraer_renovacion(texto, paginas_dict),
        "documento":       extraer_numero_poliza(texto, paginas_dict),
        "nombre_cliente":  extraer_nombre_cliente(texto, paginas_dict),
        "rfc":             extraer_rfc(texto, paginas_dict),
        "desde":           vigencia.get("Inicio Vigencia"),
        "hasta":           vigencia.get("Fin Vigencia"),
        "prima_neta":      extraer_prima_neta(texto, paginas_dict),
        "derechos":        extraer_derecho_poliza(texto, paginas_dict),
        "iva":             extraer_iva(texto, paginas_dict),
        "prima_total":     extraer_importe_pagar(texto, paginas_dict),
        "recargos":        extraer_recargo_fraccionado(texto, paginas_dict),
        "descripcion_veh": extraer_descripcion(texto, paginas_dict),
        "serie":           extraer_serie(texto, paginas_dict),
        "modelo":          extraer_modelo(texto, paginas_dict),
        "placas":          extraer_placas(texto, paginas_dict),
        "agente_clave":    extraer_clave_agente(texto, paginas_dict),
        "agente_nombre":   extraer_nombre_agente(texto, paginas_dict),
        "direccion_completa": extraer_direccion(texto, paginas_dict),
    }

    resultado = {campo: valor for campo, valor in candidatos.items() if _valido(valor)}

    # fecha_antiguedad: no existe como tal en pólizas de auto nuevas;
    # se usa el inicio de vigencia como antigüedad por defecto.
    if 'desde' in resultado and 'fecha_antiguedad' not in resultado:
        resultado['fecha_antiguedad'] = resultado['desde']

    return resultado
