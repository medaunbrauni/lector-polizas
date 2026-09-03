"""
Introspección de las reglas "nivel 1" (regex hardcodeados en los
extractores especializados por aseguradora, api/extractores_especializados/
gnp.py y qualitas.py).

No modifica ni importa el comportamiento de extracción real: solo lee el
código fuente con `ast` para reconstruir, por campo, qué función lo genera
y qué patrones regex usa esa función. Es de solo lectura / solo para
exponer en el panel "Código Reglas" — si esto se desincroniza del código
real, en el peor caso el panel queda desactualizado, nunca la extracción.
"""
from __future__ import annotations
import ast
import inspect
from pathlib import Path

_DIR = Path(__file__).resolve().parent.parent / "extractores_especializados"


def _construir_archivos_nivel1() -> dict[str, str]:
    """Nombre visible en el panel -> archivo fuente del extractor, derivado
    de api/extractores_especializados/registry.py. Así cualquier aseguradora
    que se registre ahí a futuro aparece aquí solo, sin tocar este módulo."""
    from ..extractores_especializados import registry  # import perezoso, registry no depende de este módulo
    out: dict[str, str] = {}
    for compania, func in registry.REGISTRY.items():
        modulo = inspect.getmodule(func)
        if modulo and getattr(modulo, "__file__", None):
            out[compania] = Path(modulo.__file__).name
    return out


ARCHIVOS_NIVEL1 = _construir_archivos_nivel1()

_RE_FUNCS = {"search", "match", "fullmatch", "findall", "finditer", "sub", "compile"}

# Metacaracteres/tokens que delatan que un string es un regex (y no, por
# ejemplo, un formato de fecha tipo "%Y-%m-%d" o un texto plano) — filtro
# usado solo para variables detectadas por NOMBRE (ver _patrones_por_nombre).
_META_REGEX = set(r'\()[]{}^$+*?|')

# Nombre de variable que delata que contiene regex: "patron"/"patrones" (con
# o sin acento, mayúsculas/minúsculas) en cualquier parte del nombre —
# cubre PATRON, PATRONES, patron_serie, patrones_fecha, lista_patrones, etc.
def _nombre_sugiere_patron(nombre: str) -> bool:
    return "patron" in nombre.lower().replace("ó", "o")


def _parece_regex(s: str) -> bool:
    return any(c in _META_REGEX for c in s)


def _es_llamada_re(nodo: ast.Call) -> bool:
    f = nodo.func
    return (
        isinstance(f, ast.Attribute)
        and f.attr in _RE_FUNCS
        and isinstance(f.value, ast.Name)
        and f.value.id == "re"
    )


def _patron_de_llamada(nodo: ast.Call, patrones_modulo: dict[str, str]) -> str | None:
    if not nodo.args:
        return None
    arg = nodo.args[0]
    if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
        return arg.value
    if isinstance(arg, ast.Name) and arg.id in patrones_modulo:
        return patrones_modulo[arg.id]
    return None


def _patrones_modulo(arbol: ast.Module) -> dict[str, str]:
    """Mapea variables de módulo tipo `_X = re.compile(r"...")` a su patrón."""
    out = {}
    for nodo in ast.walk(arbol):
        if (
            isinstance(nodo, ast.Assign)
            and len(nodo.targets) == 1
            and isinstance(nodo.targets[0], ast.Name)
            and isinstance(nodo.value, ast.Call)
            and _es_llamada_re(nodo.value)
        ):
            patron = _patron_de_llamada(nodo.value, {})
            if patron:
                out[nodo.targets[0].id] = patron
    return out


def _strings_de_valor(nodo: ast.expr) -> list[str]:
    """Extrae el/los regex de un valor asignado a una variable "patron*":
    string suelto, re.compile(string), o lista/tupla de strings."""
    if isinstance(nodo, ast.Constant) and isinstance(nodo.value, str):
        return [nodo.value]
    if isinstance(nodo, (ast.List, ast.Tuple)):
        return [
            e.value for e in nodo.elts
            if isinstance(e, ast.Constant) and isinstance(e.value, str)
        ]
    if isinstance(nodo, ast.Call) and _es_llamada_re(nodo) and nodo.args:
        return _strings_de_valor(nodo.args[0])
    return []


def _patrones_por_nombre(func: ast.FunctionDef) -> list[str]:
    """Variables (locales o en funciones anidadas, ej. los `def buscar_*`
    dentro de `_extraer_placas_legacy`) cuyo nombre indica que contienen
    regex — "patron"/"patrones" en cualquier variante — sin importar cómo
    se consuman después (re.search(patron, ...), patron.fullmatch(...),
    `for p in patrones: re.search(p, ...)`, etc.): capturar por nombre es
    más robusto ante esos estilos distintos que rastrear cada forma de uso.
    Filtra por metacaracteres para no colar strings que no son regex."""
    patrones = []
    for nodo in ast.walk(func):
        if not (
            isinstance(nodo, ast.Assign)
            and len(nodo.targets) == 1
            and isinstance(nodo.targets[0], ast.Name)
            and _nombre_sugiere_patron(nodo.targets[0].id)
        ):
            continue
        for s in _strings_de_valor(nodo.value):
            if _parece_regex(s):
                patrones.append(s)
    return patrones


def _patrones_en_funcion(func: ast.FunctionDef, patrones_modulo: dict[str, str]) -> list[str]:
    vistos, patrones = set(), []

    def agregar(patron: str | None):
        if patron and patron not in vistos:
            vistos.add(patron)
            patrones.append(patron)

    for nodo in ast.walk(func):
        if isinstance(nodo, ast.Call) and _es_llamada_re(nodo):
            agregar(_patron_de_llamada(nodo, patrones_modulo))
    for patron in _patrones_por_nombre(func):
        agregar(patron)

    return patrones


def _resolver_nombre_funcion(valor: ast.expr, asignaciones: dict[str, str]) -> str | None:
    """Dado el valor asignado a una clave de `candidatos`, intenta resolver
    el nombre de la función `extraer_*` que originó ese valor."""
    if isinstance(valor, ast.Call) and isinstance(valor.func, ast.Name):
        return valor.func.id
    if isinstance(valor, ast.Name):
        return asignaciones.get(valor.id)
    if isinstance(valor, ast.Attribute) and isinstance(valor.value, ast.Name):
        # ej. vigencia.get("Inicio Vigencia") -> valor.value es "vigencia"
        return asignaciones.get(valor.value.id)
    if isinstance(valor, ast.Call) and isinstance(valor.func, ast.Attribute):
        base = valor.func.value
        if isinstance(base, ast.Name):
            return asignaciones.get(base.id)
    return None


def _asignaciones_en_extraer(func_extraer: ast.FunctionDef) -> dict[str, str]:
    """Rastrea, dentro del cuerpo de extraer(), qué nombre de variable viene
    de qué función `extraer_*` (incluye reasignaciones condicionales y
    unpacking de tuplas, ej. `a, b = extraer_agente(...)`)."""
    asignaciones: dict[str, str] = {}
    for nodo in ast.walk(func_extraer):
        if not isinstance(nodo, ast.Assign):
            continue
        if not (isinstance(nodo.value, ast.Call) and isinstance(nodo.value.func, ast.Name)):
            continue
        nombre_func = nodo.value.func.id
        if not nombre_func.startswith("extraer_"):
            continue
        target = nodo.targets[0]
        if isinstance(target, ast.Name):
            asignaciones[target.id] = nombre_func
        elif isinstance(target, ast.Tuple):
            for elt in target.elts:
                if isinstance(elt, ast.Name):
                    asignaciones[elt.id] = nombre_func
    return asignaciones


def _dict_candidatos(func_extraer: ast.FunctionDef) -> ast.Dict | None:
    for nodo in ast.walk(func_extraer):
        if (
            isinstance(nodo, ast.Assign)
            and len(nodo.targets) == 1
            and isinstance(nodo.targets[0], ast.Name)
            and nodo.targets[0].id == "candidatos"
            and isinstance(nodo.value, ast.Dict)
        ):
            return nodo.value
    return None


def _extraer_reglas(archivo: Path) -> list[dict]:
    codigo = archivo.read_text(encoding="utf-8")
    arbol = ast.parse(codigo, filename=str(archivo))
    lineas = codigo.splitlines()

    funciones = {n.name: n for n in ast.walk(arbol) if isinstance(n, ast.FunctionDef)}
    func_extraer = funciones.get("extraer")
    if func_extraer is None:
        return []

    patrones_modulo = _patrones_modulo(arbol)
    asignaciones = _asignaciones_en_extraer(func_extraer)
    candidatos = _dict_candidatos(func_extraer)
    if candidatos is None:
        return []

    reglas = []
    for clave_nodo, valor_nodo in zip(candidatos.keys, candidatos.values):
        if not (isinstance(clave_nodo, ast.Constant) and isinstance(clave_nodo.value, str)):
            continue
        campo = clave_nodo.value
        nombre_func = _resolver_nombre_funcion(valor_nodo, asignaciones)
        func_def = funciones.get(nombre_func) if nombre_func else None
        if func_def is None:
            reglas.append({
                "campo": campo,
                "funcion": nombre_func,
                "patrones": [],
                "linea": valor_nodo.lineno,
            })
            continue
        reglas.append({
            "campo": campo,
            "funcion": func_def.name,
            "patrones": _patrones_en_funcion(func_def, patrones_modulo),
            "linea": func_def.lineno,
            "fuente": (lineas[func_def.lineno - 1].strip() if func_def.lineno <= len(lineas) else None),
        })
    return reglas


def obtener_reglas_nivel1(aseguradora: str) -> list[dict]:
    archivo_nombre = ARCHIVOS_NIVEL1.get(aseguradora)
    if not archivo_nombre:
        return []
    archivo = _DIR / archivo_nombre
    if not archivo.exists():
        return []
    reglas = _extraer_reglas(archivo)
    for regla in reglas:
        regla["archivo"] = f"api/extractores_especializados/{archivo_nombre}"
    return reglas
