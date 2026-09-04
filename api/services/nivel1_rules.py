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


def _es_llamada_re_modulo(f: ast.expr) -> bool:
    """`re.search(...)`, `re.compile(...)`, etc. — llamada colgada del
    módulo `re` importado, no de un objeto Pattern ya compilado."""
    return isinstance(f, ast.Attribute) and f.attr in _RE_FUNCS and isinstance(f.value, ast.Name) and f.value.id == "re"


def _es_llamada_re(nodo: ast.Call) -> bool:
    return _es_llamada_re_modulo(nodo.func)


def _resolver_valor_estatico(nodo: ast.expr, constantes: dict[str, str]) -> str | None:
    """Resuelve el valor de un string armado en tiempo de análisis: literal
    suelto, concatenación ('...' + VAR + '...') o referencia a una variable
    ya resuelta en `constantes` (regex nombrado, o cualquier constante de
    módulo). Sin esto, un regex armado por concatenación (común para
    reusar una lista cerrada de valores en varios lados, ej.
    `'Forma de Pago...' + _VALORES_FORMA_PAGO + '...'`) se perdía por
    completo: el argumento no era ni un Constant ni un Name plano."""
    if isinstance(nodo, ast.Constant) and isinstance(nodo.value, str):
        return nodo.value
    if isinstance(nodo, ast.Name):
        return constantes.get(nodo.id)
    if isinstance(nodo, ast.BinOp) and isinstance(nodo.op, ast.Add):
        izq = _resolver_valor_estatico(nodo.left, constantes)
        der = _resolver_valor_estatico(nodo.right, constantes)
        if izq is not None and der is not None:
            return izq + der
    return None


def _patron_de_llamada(nodo: ast.Call, constantes: dict[str, str]) -> str | None:
    f = nodo.func
    if not isinstance(f, ast.Attribute) or f.attr not in _RE_FUNCS:
        return None
    if not isinstance(f.value, ast.Name):
        return None
    if f.value.id == "re":
        # re.search(patron, texto, ...) -- el patrón es el primer argumento.
        if not nodo.args:
            return None
        return _resolver_valor_estatico(nodo.args[0], constantes)
    # X.search(...) / X.fullmatch(...) sobre un Pattern ya compilado
    # (ej. `_VIN_TOKEN.finditer(texto_ventana)`) -- el patrón no viaja en
    # los argumentos de ESTA llamada, es el que se le dio a X = re.compile(...)
    # en su momento, ya resuelto en `constantes`.
    return constantes.get(f.value.id)


def _nombre_es_constante(nombre: str) -> bool:
    """Convención de este código para un regex compartido pensado como
    valor autocontenible (`_VALORES_FORMA_PAGO`, `_VIN_TOKEN`,
    `_ANCLA_DOMICILIO_ASEGURADO`, `_DESCUENTOS_DETALLADOS_GNP`): todo
    MAYÚSCULAS. Un nombre en minúsculas (`monto_regex`, `regex_serie`,
    `patron`) suele ser una variable de trabajo de un bucle de escaneo por
    offset -- válida solo dentro de ESE bucle, nunca un extractor de valor
    de por sí. Sin este filtro, resolver esos nombres locales por
    Name-lookup expone regex genéricos (ej. "cualquier monto") como si
    fueran el patrón real de un campo financiero, dando falsos positivos
    al probarlos sueltos contra todo el texto."""
    letras = [c for c in nombre if c.isalpha()]
    return bool(letras) and all(c.isupper() for c in letras)


def _constantes_en_asignaciones(nodos_assign) -> dict[str, str]:
    """Resuelve, en orden, cada `Name = <valor>` de una secuencia de nodos
    Assign a su string estático (ver _resolver_valor_estatico), permitiendo
    que una asignación posterior reutilice una anterior YA resuelta en la
    misma pasada — para este último caso se guarda el PATRÓN interno de un
    `re.compile(...)`, no el objeto Pattern, así una llamada posterior a un
    método sobre esa variable (`_VIN_TOKEN.finditer(...)`) se resuelve
    igual que `re.func(...)`. Solo nombres tipo constante (ver
    _nombre_es_constante) — el resto se ignora a propósito."""
    out: dict[str, str] = {}
    for nodo in nodos_assign:
        nombre = nodo.targets[0].id
        if not _nombre_es_constante(nombre):
            continue
        valor = nodo.value
        if isinstance(valor, ast.Call) and _es_llamada_re_modulo(valor.func) and valor.args:
            resuelto = _resolver_valor_estatico(valor.args[0], out)
        else:
            resuelto = _resolver_valor_estatico(valor, out)
        if resuelto:
            out[nombre] = resuelto
    return out


def _asignaciones_simples(nodo) -> list[ast.Assign]:
    return [
        n for n in ast.walk(nodo)
        if isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Name)
    ]


def _constantes_globales(arbol: ast.Module) -> dict[str, str]:
    """Constantes de MÓDULO únicamente (asignaciones directas del cuerpo
    del archivo, no dentro de ninguna función) — genuinamente compartidas
    y seguras de resolver desde cualquier función."""
    return _constantes_en_asignaciones(n for n in arbol.body if isinstance(n, ast.Assign))


def _constantes_locales(func: ast.FunctionDef) -> dict[str, str]:
    """Como _constantes_globales pero acotado al cuerpo de UNA función
    (incluye funciones anidadas dentro de ella). Nombres genéricos como
    "patron" se repiten sin relación entre sí en funciones distintas del
    mismo archivo (ej. un parámetro/variable de bucle en un helper
    genérico, y una variable local no relacionada en otra función) —
    resolverlos con un diccionario compartido de TODO el archivo mezclaría
    el de una función con el de otra. Por eso esto se recalcula por
    función en vez de usar un único diccionario global de asignaciones."""
    return _constantes_en_asignaciones(_asignaciones_simples(func))


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


def _llamadas_ancla_de_posicion(func: ast.FunctionDef) -> set[int]:
    """`id()` de los nodos Call que son un `X = re.search(...)`/`match`/
    `fullmatch` cuyo resultado `X` se usa SOLO para su posición
    (`.end()`/`.start()`/`.span()`, ej. para recortar una ventana de texto
    después) y nunca para extraer un valor (`.group(...)`) -- es un ancla
    para ubicar una sección, no un regex de valor, y mostrarlo junto a los
    patrones reales del campo es engañoso (ej. "serie" en Quálitas: el
    ancla `SERIE:?\\s*\\n` no tiene grupo de captura y su "coincidencia" es
    literalmente la etiqueta, no un VIN)."""
    candidatos: dict[str, ast.Call] = {}
    for nodo in ast.walk(func):
        if (
            isinstance(nodo, ast.Assign)
            and len(nodo.targets) == 1
            and isinstance(nodo.targets[0], ast.Name)
            and isinstance(nodo.value, ast.Call)
            and _es_llamada_re_modulo(nodo.value.func)
            and getattr(nodo.value.func, "attr", None) in ("search", "match", "fullmatch")
        ):
            candidatos[nodo.targets[0].id] = nodo.value
    if not candidatos:
        return set()

    usa_group, usa_posicion = set(), set()
    for nodo in ast.walk(func):
        if isinstance(nodo, ast.Attribute) and isinstance(nodo.value, ast.Name) and nodo.value.id in candidatos:
            if nodo.attr == "group":
                usa_group.add(nodo.value.id)
            elif nodo.attr in ("end", "start", "span"):
                usa_posicion.add(nodo.value.id)

    return {
        id(llamada) for nombre, llamada in candidatos.items()
        if nombre in usa_posicion and nombre not in usa_group
    }


def _funciones_llamadas(func: ast.FunctionDef) -> set[str]:
    """Nombres de función invocados como `nombre(...)` dentro de `func` —
    para seguir el regex hasta una función auxiliar (ej. `extraer_serie`
    llama a `_primer_vin_valido`, que es donde vive el regex real)."""
    return {
        nodo.func.id
        for nodo in ast.walk(func)
        if isinstance(nodo, ast.Call) and isinstance(nodo.func, ast.Name)
    }


def _patrones_en_funcion(
    func: ast.FunctionDef,
    constantes_globales: dict[str, str],
    funciones: dict[str, ast.FunctionDef],
    visitadas: set[str] | None = None,
) -> list[str]:
    """Regex que usa `func` para resolver su campo — incluye los que vienen
    de funciones auxiliares que `func` llama (no solo los que están escritos
    literalmente en su propio cuerpo), porque varios campos delegan el
    regex real a un helper compartido (`_bloque_agente_por_regex`,
    `_primer_vin_valido`, etc.). `visitadas` evita ciclos y no repetir
    trabajo si dos campos comparten la misma cadena de helpers."""
    if visitadas is None:
        visitadas = set()
    if func.name in visitadas:
        return []
    visitadas.add(func.name)

    # Constantes de módulo + las propias de ESTA función únicamente — ver
    # _constantes_locales sobre por qué no se usa un diccionario compartido
    # de todo el archivo (un "patron" local de una función no debe resolver
    # el "patron" -sin relación- de otra).
    constantes = {**constantes_globales, **_constantes_locales(func)}

    vistos, patrones = set(), []
    anclas = _llamadas_ancla_de_posicion(func)

    def agregar(patron: str | None):
        if patron and patron not in vistos:
            vistos.add(patron)
            patrones.append(patron)

    for nodo in ast.walk(func):
        if isinstance(nodo, ast.Call) and id(nodo) not in anclas:
            agregar(_patron_de_llamada(nodo, constantes))
    for patron in _patrones_por_nombre(func):
        agregar(patron)

    for nombre_llamada in _funciones_llamadas(func):
        aux = funciones.get(nombre_llamada)
        if aux is not None and nombre_llamada not in visitadas:
            for patron in _patrones_en_funcion(aux, constantes_globales, funciones, visitadas):
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


_NOTA_SIN_REGEX = (
    "Extracción 100% posicional (bbox) — no usa ningún regex, ni siquiera como respaldo. "
    "No se puede probar con un regex suelto."
)

# Campos donde SÍ existe un regex en el código, pero solo cumple el papel
# de validador dentro de una ventana de líneas ya acotada por fuera del
# regex (en Python, no en el patrón) — probarlo suelto contra un texto
# completo no repite esa ventana y puede "matchear" con algo del PDF sin
# ninguna relación real con el campo (ej. el regex de "clave de agente" de
# Quálitas es solo `\d{4,6}` — sin la ventana, encuentra el primer número
# de 4-6 dígitos de todo el documento, que puede ser el C.P. corporativo
# del membrete). Se tratan como "sin regex probable" igual que un campo
# 100% bbox, con una nota que explica por qué en vez de mostrar ese regex
# suelto como si fuera un extractor de valor confiable.
_CAMPOS_VALIDADOR_SIN_CONTEXTO: dict[tuple[str, str], str] = {
    ("qualitas.py", "tipo_vehiculo"): (
        "Extracción por lista cerrada de valores (categorías de vehículo) dentro de una "
        "ventana de líneas acotada a partir de la etiqueta \"Descripción del Vehículo "
        "Asegurado\", no por un regex directo de valor. Probar una de las categorías suelta "
        "contra todo el texto no repite ese acotamiento."
    ),
    ("qualitas.py", "agente_clave"): (
        "Extracción por escaneo de líneas dentro de una ventana acotada tras la etiqueta "
        "\"Agente:\" — el único regex interno (`\\d{4,6}`) es un validador de formato "
        "(¿esta línea es puramente numérica?), no un extractor de valor: probarlo suelto "
        "puede matchear con cualquier número de 4-6 dígitos del documento, sin relación con "
        "el agente real."
    ),
    ("qualitas.py", "agente_nombre"): (
        "Extracción por escaneo de líneas dentro de una ventana acotada tras la etiqueta "
        "\"Agente:\" — el único regex interno (`\\d{4,6}`) valida la línea de la clave, no "
        "extrae el nombre (que es la línea anterior); probarlo suelto no reproduce esa lógica."
    ),
    ("qualitas.py", "direccion_completa"): (
        "El regex ancla ubica el bloque de domicilio del asegurado, pero no extrae la "
        "dirección en sí (que es la línea anterior a un código postal suelto dentro de esa "
        "ventana) — no es un regex de valor autocontenible."
    ),
    ("qualitas.py", "nombre_cliente"): (
        "Extracción por varias estrategias de escaneo de líneas dentro de ventanas acotadas "
        "(tras \"Información del Asegurado\", tras la fecha de fin de vigencia, o tras "
        "\"FAX\"), validadas por forma (mayúsculas + 2+ palabras) o por coincidir con una "
        "figura jurídica (S.A. de C.V., etc.) — ninguno de los regex internos extrae el "
        "nombre por sí solo fuera de esas ventanas."
    ),
    ("qualitas.py", "serie"): (
        "El regex real (`\\b[A-Z0-9]{12,17}\\b`) solo se aplica dentro de una ventana de "
        "~400 caracteres después de la etiqueta \"Serie:\" — verificado contra el corpus: "
        "probado suelto contra el texto completo puede matchear con cualquier otra palabra "
        "en mayúsculas de 12-17 caracteres que aparezca antes en el documento (ej. "
        "\"RESTRICCIONES\"), sin relación con el VIN real."
    ),
    ("gnp.py", "agente_nombre"): (
        "Comparte el mismo regex de bloque que \"agente_clave\" (ver ese campo), pero el "
        "nombre es su 2do grupo de captura (`clave` es el 1ro) — el probador de un solo "
        "patrón siempre toma el grupo 1, así que probarlo aquí devolvería la clave del "
        "agente, no su nombre. Usa \"agente_clave\" para ver y probar este mismo regex."
    ),
}


def _extraer_reglas(archivo: Path) -> list[dict]:
    codigo = archivo.read_text(encoding="utf-8")
    arbol = ast.parse(codigo, filename=str(archivo))
    lineas = codigo.splitlines()

    funciones = {n.name: n for n in ast.walk(arbol) if isinstance(n, ast.FunctionDef)}
    func_extraer = funciones.get("extraer")
    if func_extraer is None:
        return []

    constantes_globales = _constantes_globales(arbol)
    asignaciones = _asignaciones_en_extraer(func_extraer)
    candidatos = _dict_candidatos(func_extraer)
    if candidatos is None:
        return []

    archivo_nombre = archivo.name
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
                "nota": _NOTA_SIN_REGEX,
            })
            continue

        nota_forzada = _CAMPOS_VALIDADOR_SIN_CONTEXTO.get((archivo_nombre, campo))
        patrones = [] if nota_forzada else _patrones_en_funcion(func_def, constantes_globales, funciones)
        reglas.append({
            "campo": campo,
            "funcion": func_def.name,
            "patrones": patrones,
            "linea": func_def.lineno,
            "fuente": (lineas[func_def.lineno - 1].strip() if func_def.lineno <= len(lineas) else None),
            "nota": nota_forzada or (_NOTA_SIN_REGEX if not patrones else None),
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
