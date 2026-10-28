"""
Extractor especializado para ANA Seguros (autos) — FASE 1 de 3.

Campos de esta fase: documento, rfc, nombre_cliente, direccion_completa,
cp / colonia / municipio (validados contra el catálogo de Correos de México,
ver catalogo_cp.py) y tipo_vehiculo, este último solo porque de él sale el
subramo (ver detectar_subramo_por_tipo_ana). El resto de los campos
(vigencia, primas, vehículo, forma de pago...) llega en las fases 2 y 3.

El texto de pdfplumber que recibe el pipeline trae el layout "etiqueta:valor"
en una misma línea, así que no hace falta re-leer el PDF con PyMuPDF (cuyo
orden de texto separa las etiquetas de sus valores). Particularidades:
  - La dirección ocupa 1-2 líneas y la primera trae pegado el rótulo
    "Fecha de Expedición Desde Hasta" (a veces partiendo una palabra:
    "SANTAFecha...").
  - La dirección no separa calle y colonia: la colonia es el tramo final
    antes de "C.P." y se identifica con el catálogo de códigos postales.
"""
from __future__ import annotations
import re

from .catalogo_cp import colonia_al_final, validar_direccion_cp
from .figuras_juridicas import es_persona_moral_por_nombre, normalizar_siglas_razon_social

# Valores del campo "Tipo:" de la carátula → subramo del catálogo. Se compara
# por prefijo ("CAM HASTA 1", "CAM MAS DE 14 T"... son camiones). Cualquier
# otro tipo se rechaza (subramo None) hasta que haya PDFs que lo respalden.
_TIPO_A_SUBRAMO = [
    ("AUTOBUS", "Autobuses"),
    ("CAM", "Camiones"),
    ("MOTO", "Motocicletas"),
    ("AUTOS", "Automóviles"),
]

_RE_FECHA_EXPEDICION = re.compile(r"\s*Fecha\s+de\s+Expedici[oó]n\s+Desde\s+Hasta", re.IGNORECASE)
_RE_FILA_FECHAS = re.compile(r"^D\s*\d+\s+M\s*\d+\s+A\s*\d{4}")
_RE_FECHA = re.compile(r"D\s*(\d{1,2})\s+M\s*(\d{1,2})\s+A\s*(\d{4})")
_MESES = ("ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC")


def es_poliza_auto_ana(texto: str) -> bool:
    t = texto.upper()
    return "PÓLIZA DE SEGURO AUTOMÓVILES" in t and ("A.N.A." in t or "ANASEGUROS" in t)


def _lineas(texto: str) -> list[str]:
    return [l.strip() for l in texto.split("\n")]


def extraer_numero_poliza(texto: str) -> str | None:
    m = re.search(r"No\.\s*de\s*P[oó]liza:\s*([0-9A-Z]+)", texto)
    return m.group(1) if m else None


def extraer_rfc(texto: str) -> str | None:
    m = re.search(r"R\.F\.C\.:\s*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b", texto)
    return m.group(1) if m else None


def _bloque_cliente(lineas: list[str]) -> tuple[list[str], list[str]]:
    """(líneas del nombre, líneas de la dirección) del bloque 'Nombre y Dirección
    del Contratante...': nombre hasta 'Edad:'/'Duración:', dirección hasta la fila de fechas."""
    inicio = next((i for i, l in enumerate(lineas) if re.match(r"Nombre\s+y\s+Direcci[oó]n", l, re.IGNORECASE)), None)
    if inicio is None:
        return [], []
    nombre: list[str] = []
    i = inicio + 1
    while i < len(lineas) and not re.match(r"(Edad:|Duraci[oó]n:)", lineas[i]):
        nombre.append(lineas[i])
        i += 1
    direccion: list[str] = []
    i += 1
    while i < len(lineas) and not _RE_FILA_FECHAS.match(lineas[i]):
        direccion.append(lineas[i])
        i += 1
    return nombre, direccion


def extraer_nombre_cliente(nombre_lineas: list[str]) -> str | None:
    nombre = " ".join(nombre_lineas)
    nombre = re.sub(r"\s*BEN\.?\s*PREF\..*$", "", nombre, flags=re.IGNORECASE)  # beneficiario preferente
    nombre = re.sub(r"\s+", " ", nombre).strip()
    if nombre and es_persona_moral_por_nombre(nombre):
        nombre = normalizar_siglas_razon_social(nombre)
    return nombre or None


def extraer_direccion(direccion_lineas: list[str]) -> str | None:
    if not direccion_lineas:
        return None
    # El rótulo va pegado al final de la 1ª línea; al unir con espacio, una
    # palabra partida entre líneas ("SANTA" + "FE") queda bien escrita.
    limpias = [_RE_FECHA_EXPEDICION.sub("", l).strip() for l in direccion_lineas]
    return re.sub(r"\s+", " ", " ".join(l for l in limpias if l)).strip() or None


def _colonia_tras_numero(antes: str) -> str | None:
    """Sin coincidencia en el catálogo: la colonia es lo que sigue al último
    número de la dirección ("MORELIA NUM 10 CHAUTONGO" -> "CHAUTONGO"). Sin
    número o sin texto después, la dirección no trae colonia."""
    tokens = antes.split()
    ultimo = max((i for i, t in enumerate(tokens) if any(c.isdigit() for c in t)), default=-1)
    return " ".join(tokens[ultimo + 1:]) or None if ultimo >= 0 else None


def extraer_colonia_municipio_cp(direccion: str | None) -> dict[str, str]:
    """cp, colonia y municipio de la dirección ya unida, validados con el catálogo."""
    if not direccion:
        return {}
    m = re.search(r"C\.P\.\s*(\d{5})", direccion)
    if not m:
        return {}
    cp = m.group(1)
    antes, despues = direccion[: m.start()], direccion[m.end():]
    municipio = despues.split(",")[0].strip() or None
    colonia = colonia_al_final(cp, antes) or _colonia_tras_numero(antes)
    return validar_direccion_cp(cp, colonia, municipio)


def extraer_vigencia(texto: str) -> dict[str, str]:
    """desde/hasta en el formato DD/MMM/AAAA de las otras aseguradoras. ANA imprime
    una fila 'D10 M03 A2026' (día, mes, año) con tres fechas: expedición, desde, hasta."""
    fila = next((l for l in _lineas(texto) if _RE_FILA_FECHAS.match(l)), "")
    fechas = _RE_FECHA.findall(fila)
    if len(fechas) < 3 or not all(1 <= int(m) <= 12 and 1 <= int(d) <= 31 for d, m, _ in fechas[1:3]):
        return {}
    (d1, m1, a1), (d2, m2, a2) = fechas[1], fechas[2]
    return {
        "desde": f"{int(d1):02d}/{_MESES[int(m1) - 1]}/{a1}",
        "hasta": f"{int(d2):02d}/{_MESES[int(m2) - 1]}/{a2}",
    }


def extraer_tipo_vehiculo(texto: str) -> str | None:
    m = re.search(r"Tipo:\s*(.+?)\s*(?:Descripci[oó]n:|Bonificaci[oó]n|$)", texto, re.MULTILINE)
    return m.group(1).strip() if m and m.group(1).strip() else None


def detectar_subramo_por_tipo_ana(tipo: str | None) -> str | None:
    """Subramo del catálogo según el 'Tipo:' de la carátula, o None si no se reconoce."""
    t = (tipo or "").upper().strip()
    return next((sub for prefijo, sub in _TIPO_A_SUBRAMO if t.startswith(prefijo)), None)


def extraer(texto: str, pdf_bytes: bytes | None = None) -> dict[str, str]:
    """Punto de entrada del extractor especializado (nivel 1): solo los
    campos que logró encontrar; el resto queda para el motor de reglas."""
    if not es_poliza_auto_ana(texto):
        return {}
    nombre_lineas, direccion_lineas = _bloque_cliente(_lineas(texto))
    direccion = extraer_direccion(direccion_lineas)
    candidatos = {
        "documento": extraer_numero_poliza(texto),
        "rfc": extraer_rfc(texto),
        "nombre_cliente": extraer_nombre_cliente(nombre_lineas),
        "direccion_completa": direccion,
        "tipo_vehiculo": extraer_tipo_vehiculo(texto),
        **extraer_vigencia(texto),
        **extraer_colonia_municipio_cp(direccion),
    }
    return {k: v for k, v in candidatos.items() if v}
