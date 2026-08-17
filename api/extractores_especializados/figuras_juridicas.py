"""
Catálogo de figuras jurídicas / razones sociales mexicanas, usado como
señal adicional (junto con la longitud del RFC) para detectar si el
asegurado es Persona Física o Persona Moral.

Compartido entre todos los extractores especializados (gnp.py,
qualitas.py, y cualquier otro que se agregue) a través del pipeline
principal (api/services/extractor.py), que es el único lugar donde se
determina el campo 'entidad' — ninguno de los extractores por compañía
calcula este campo directamente, así que el catálogo vive aquí en vez
de duplicarse en cada uno.
"""
from __future__ import annotations
import re
import unicodedata

# Cada patrón se busca como palabra completa (\b), sobre el nombre ya
# normalizado (mayúsculas, sin acentos, sin puntos). Escrito sin
# puntuación porque _normalizar() la elimina antes de comparar.
_FIGURAS_JURIDICAS_MORALES = [
    # ── Privadas con actividad empresarial / mercantil ──────────────────────
    r"SA(?:\s+DE\s+CV)?",                  # S.A. / SA / S.A. DE C.V. / SA DE CV
    r"S\s+DE\s+RL(?:\s+DE\s+CV)?",         # S. de R.L. / S DE RL / ... DE C.V.
    r"SAS",                                # S.A.S. / SAS
    r"S\s+EN\s+NC",                        # Sociedad en Nombre Colectivo
    r"S\s+EN\s+CS",                        # Sociedad en Comandita Simple
    r"S\s+EN\s+C\s+POR\s+A",               # Sociedad en Comandita por Acciones
    r"SOCIEDAD\s+COOPERATIVA",
    r"SC\s+DE\s+RL",                       # S.C. de R.L.
    # ── Privadas civiles / no mercantiles ────────────────────────────────────
    r"SC",                                 # Sociedad Civil
    r"AC",                                 # Asociación Civil
    r"IAP",                                # Institución de Asistencia Privada
    r"IBP",                                # Institución de Beneficencia Privada
    # ── Organizaciones sociales ──────────────────────────────────────────────
    r"SINDICATO(?:\s+DE)?",
    r"ASOCIACION\s+PROFESIONAL",
    r"COLEGIO\s+DE",
    r"ASOCIACION\s+RELIGIOSA",
    r"AR",
    r"PARTIDO\s+POLITICO",
    # ── Personas morales públicas ────────────────────────────────────────────
    r"GOBIERNO\s+FEDERAL",
    r"GOBIERNO\s+DEL\s+ESTADO",
    r"GOBIERNO\s+MUNICIPAL",
    r"H\s+AYUNTAMIENTO",
    r"AYUNTAMIENTO\s+DE",
    r"SECRETARIA\s+DE",
    r"MUNICIPIO\s+DE",
    r"ORGANISMO\s+PUBLICO\s+DESCENTRALIZADO",
    r"OPD",
    r"INSTITUTO",
    r"COMISION\s+NACIONAL",
    r"COMISION\s+ESTATAL",
]

_PATRON_MORAL = re.compile(
    r"\b(?:" + "|".join(_FIGURAS_JURIDICAS_MORALES) + r")\b"
)


def _normalizar(nombre: str) -> str:
    """Mayúsculas, sin acentos, sin puntos — para que 'S.A. de C.V.' y
    'SA DE CV' coincidan con el mismo patrón."""
    nombre = nombre.upper()
    nombre = unicodedata.normalize("NFKD", nombre)
    nombre = "".join(c for c in nombre if not unicodedata.combining(c))
    nombre = nombre.replace(".", "")
    return re.sub(r"\s+", " ", nombre).strip()


def es_persona_moral_por_nombre(nombre_o_razon_social: str) -> bool:
    """
    True si el nombre/razón social contiene alguna figura jurídica del
    catálogo (S.A., A.C., Sindicato, Gobierno Municipal, etc.).
    """
    if not nombre_o_razon_social:
        return False
    return bool(_PATRON_MORAL.search(_normalizar(nombre_o_razon_social)))


# ── Normalización de siglas dentro de la razón social ───────────────────────
#
# Solo cubre las figuras que en el PDF aparecen como ABREVIATURA con puntos
# (S.A., S. de R.L., A.C., I.A.P., etc.) — las que ya vienen escritas con
# palabras completas (Sindicato, Gobierno Municipal, Sociedad Cooperativa...)
# no tienen nada que "despuntuar", así que no se tocan aquí.
#
# Cada alternativa del regex reconoce una figura con o sin puntos entre sus
# letras (ej. "S.A." o "SA"), y para las compuestas por varias siglas
# (ej. "S. de R.L. de C.V.") captura por separado la palabra conectora
# ("de"/"en"/"por") para poder devolverla EXACTAMENTE como apareció en el
# texto original — solo las siglas se fuerzan a mayúsculas sin puntos.
#
# El orden de las alternativas importa: las formas más largas/específicas
# (ej. "S.A.S.") deben ir antes que las más cortas que serían un prefijo
# válido de ellas (ej. "S.A."), porque re intenta las alternativas en orden
# y se queda con la primera que matchea en esa posición (no con la más larga).
_PATRON_SIGLAS = re.compile(
    r"\b(?:"
    r"(?P<sas>S\.?A\.?S\.?)"
    r"|(?P<sacv>S\.?A\.?)(?:\s+(?P<sacv_de>de)\s+C\.?V\.?)?"
    r"|(?P<srl>S\.?)\s+(?P<srl_de1>de)\s+R\.?L\.?(?:\s+(?P<srl_de2>de)\s+C\.?V\.?)?"
    r"|(?P<enc>S\.?)\s+(?P<enc_en>en)\s+N\.?C\.?"
    r"|(?P<ecs>S\.?)\s+(?P<ecs_en>en)\s+C\.?S\.?"
    r"|(?P<ecpa>S\.?)\s+(?P<ecpa_en>en)\s+C\.?\s+(?P<ecpa_por>por)\s+A\.?"
    r"|(?P<screl>S\.?C\.?)\s+(?P<screl_de>de)\s+R\.?L\.?"
    r"|(?P<sc>S\.?C\.?)"
    r"|(?P<ac>A\.?C\.?)"
    r"|(?P<iap>I\.?A\.?P\.?)"
    r"|(?P<ibp>I\.?B\.?P\.?)"
    r")(?![A-Za-z])",  # no seguido de otra letra (evita "Academia" -> "ACademia");
    re.IGNORECASE,      # a diferencia de \b, no falla al terminar justo en un punto final
)


def _reemplazo_sigla(m: "re.Match") -> str:
    """Dado un match de _PATRON_SIGLAS, arma el reemplazo: siglas fijas en
    mayúsculas sin puntos + conectores tal cual vinieron en el texto."""
    g = m.groupdict()
    if g["sas"] is not None:
        return "SAS"
    if g["sacv"] is not None:
        return f"SA {g['sacv_de']} CV" if g["sacv_de"] else "SA"
    if g["srl"] is not None:
        base = f"S {g['srl_de1']} RL"
        return f"{base} {g['srl_de2']} CV" if g["srl_de2"] else base
    if g["enc"] is not None:
        return f"S {g['enc_en']} NC"
    if g["ecs"] is not None:
        return f"S {g['ecs_en']} CS"
    if g["ecpa"] is not None:
        return f"S {g['ecpa_en']} C {g['ecpa_por']} A"
    if g["screl"] is not None:
        return f"SC {g['screl_de']} RL"
    if g["sc"] is not None:
        return "SC"
    if g["ac"] is not None:
        return "AC"
    if g["iap"] is not None:
        return "IAP"
    if g["ibp"] is not None:
        return "IBP"
    return m.group(0)  # no debería pasar


def normalizar_siglas_razon_social(texto: str) -> str:
    """
    Deja las siglas de figuras jurídicas en mayúsculas sin puntos
    (ej. "S.A. de C.V." -> "SA de CV"), sin tocar el resto del texto
    (nombre de la empresa, espacios, y el propio conector "de"/"en"/"por"
    mantiene su mayúscula/minúscula original). Si no encuentra ninguna
    figura del catálogo, regresa el texto sin cambios.
    """
    if not texto:
        return texto
    return _PATRON_SIGLAS.sub(_reemplazo_sigla, texto)
