# Auditoría Técnica del Proyecto — Lector de Pólizas

**Fecha:** 2026-07-15
**Alcance:** `api/` (backend FastAPI), `web/` (frontend React/Vite), seeds, configuración.
**Método:** lectura completa de los 27 módulos Python del backend (~7,000 líneas), modelos ORM, routers, seeds y estructura del frontend. No se modificó ningún archivo.

> Nota: existe una auditoría previa (`AUDITORIA.md`, 2026-05-26). Los 3 bugs críticos que reportaba (triple conteo de `campos_no_encontrados`, duplicación `documento`/`numero_poliza`, N+1 en historial) **ya fueron corregidos** en el código actual — se verificó en `extractor.py`, `seed/data.py` y `routers/extraccion.py`. Esta auditoría parte de cero y cubre el estado presente del sistema.

---

## 1. Arquitectura

### 1.1 Visión general

Es un monolito FastAPI + SQLite + frontend React (Vite/TS), pensado para correr localmente (`iniciar.py`/`iniciar.bat`/`.exe` con PyInstaller) más que como servicio cloud multi-tenant. Tres capas:

```
web/  (React + Tailwind, SPA)
  │  fetch → api/lib/api.ts
  ▼
api/  (FastAPI)
  routers/      → HTTP, validación Pydantic, orquestación fina
  services/      → lógica de negocio (detección, extracción, entrenamiento, clasificación)
  models/        → ORM (db_models.py) + schemas Pydantic de respuesta (poliza.py, hoy sin uso real)
  seed/          → catálogo estático de 42 aseguradoras / ~292 subramos + campos globales
  parsers/       → CÓDIGO MUERTO (ver §3.1) — no se usa en el pipeline actual
  database.py    → engine SQLite + migraciones "a mano" (ALTER TABLE try/except) + índices
  config.py      → variables de entorno centralizadas (parcialmente respetadas, ver §3.4)
  main.py        → app, CORS, lifespan (seed + watchdog), routers
```

No hay capa de autenticación de usuarios (solo una contraseña compartida, ver §5.1), no hay migraciones tipo Alembic (se usa `ALTER TABLE` envuelto en `try/except` silencioso), y no hay tests automatizados en el repo.

### 1.2 Flujo: de "usuario sube un PDF" a "datos exportados"

Hay **dos flujos de entrada distintos y parcialmente redundantes** al sistema:

**A. Flujo manual — extracción directa (`/extraer`)**
1. Usuario sube PDF(s) desde el frontend (`LectorPolizas.tsx` probablemente) → `POST /extraer`.
2. `extraccion.py` valida cantidad/tamaño/extensión → llama a `extractor.procesar_pdf()`.
3. `extraer_texto_pdf()` (pdfplumber) obtiene texto plano de todas las páginas.
4. `detector.detectar_con_score()` puntúa Compañía → Ramo → Subramo con keywords (1 pt) y regex de `patrones_deteccion` (3 pts), calcula umbral de confianza (`alta ≥9`, `media ≥3`, `baja >0`).
5. Si el nivel detectado carece de `patrones_deteccion`, se llama a Claude (`MODEL_EXTRACTOR`) para generarlos y guardarlos en BD (auto-aprendizaje de detección).
6. `rule_engine.aplicar_reglas()` corre cada `ReglaExtraccion` activa (regex, opcionalmente acotado a una región del PDF vía `bbox` + pdfplumber `within_bbox`) contra el texto.
7. Campos sin regla quedan `no_encontrado`; campos globales con `valor_fijo` se rellenan sin regex.
8. Se deriva `entidad` (Persona Física/Moral) a partir del largo del RFC — **con lógica duplicada e inconsistente**, ver §3.2.
9. Se persiste `Extraccion` + `CampoExtraido[]` (trazabilidad de qué regla generó cada valor) y se retorna el JSON al frontend.
10. `/extraer/reaplicar` permite re-ejecutar el paso 6-9 sobre el `texto_pdf` ya almacenado, cambiando el subramo manualmente (para corregir mala clasificación sin re-subir el archivo).

**B. Flujo automático — carpeta vigilada + cola de clasificación (`/clasificador`)**
1. `folder_watcher.py` (watchdog) vigila una carpeta de escritorio (`UPLOAD_FOLDER`) o el usuario sube por `POST /clasificador/upload`.
2. Se hace dedup por SHA-256 (archivo y carpeta).
3. `clasificador_service.procesar_pdf()`: detector con score → si confianza `alta` usa el detector; si no, llama a Claude (`MODEL_CLASIFICADOR`) para clasificar contra el catálogo completo.
4. Si hay clasificación completa, genera patrones de detección con IA (de nuevo, prompt casi idéntico al del flujo A).
5. Usuario revisa la cola (`ClasificacionCola`), confirma/corrige compañía-ramo-subramo.
6. Al confirmar, el PDF se copia a `storage/pdfs_entrenamiento/{subramo_id}/` y se crea un `PolizaEntrenamiento` — **este es el punto de entrada al módulo de entrenamiento (`/entrenamiento`)**, no al de extracción. Es decir, este flujo no produce una `Extraccion` con campos; produce material de entrenamiento para construir reglas nuevas.

**C. Construcción de reglas (`/entrenamiento`)**
1. Usuario selecciona manualmente (o vía "auto-detectar en lote") el valor de un campo en varias pólizas del mismo subramo.
2. `batch_trainer.generar_regex_lote()` llama a Claude con todos los ejemplos, pide un regex, y lo prueba contra **todo** el lote (`probar_regex_en_lote`).
3. Si cubre el lote (`pasa_lote`), se guarda como `ReglaExtraccion` (`creado_por="lote"`), quedando disponible para el flujo A en producción.

Los tres flujos convergen en la misma tabla `ReglaExtraccion` y el mismo `rule_engine.aplicar_reglas()`, lo cual es razonable — pero el árbol de entrada (extracción directa vs. clasificador vs. entrenamiento) tiene bastante lógica de detección y generación de patrones **duplicada de forma independiente en cada rama** (ver §3.2/§3.3), en vez de compartir un único punto de generación.

### 1.3 Mapa de dependencias entre módulos

```
main.py
 ├─ database.py (Base, engine, get_db)
 ├─ seed/data.py ──────────────► models/db_models.py, _catalogo_generado_ref.py
 ├─ seed/campos_globales.py ───► models/db_models.py
 ├─ services/folder_watcher.py ► services/clasificador_service.py, database.py, models/db_models.py
 └─ routers/*
     ├─ auth.py               (independiente, sin BD)
     ├─ extraccion.py  ───────► services/extractor.py, services/detector.py, services/rule_engine.py
     ├─ catalogos.py   ───────► services/rule_engine.py (cobertura_subramo, y duplica _es_vehiculo/_ramo_de_subramo)
     ├─ reglas.py      ───────► services/rule_engine.py (_aplicar_patron, cobertura_subramo)
     ├─ entrenamiento.py ─────► services/batch_trainer.py, services/rule_engine.py (_aplicar_patron)
     └─ clasificador.py ──────► services/clasificador_service.py, services/folder_watcher.py

services/extractor.py    ──► services/detector.py, services/rule_engine.py, services/ai_utils.py
services/clasificador_service.py ──► services/detector.py, services/ai_utils.py
services/batch_trainer.py ──► services/rule_engine.py (_aplicar_patron) — NO usa ai_utils (ver §3.3)
services/rule_engine.py   ──► models/db_models.py (sin dependencias de otros services)
services/detector.py      ──► models/db_models.py (sin dependencias de otros services)

parsers/*  ──► models/poliza.py   (AISLADO — nada en services/routers lo importa)
```

Puntos notables:
- `services/detector.py` y `services/rule_engine.py` son los módulos más "puros" (sin llamadas a IA, sin acoplarse a routers). Buen núcleo.
- `services/ai_utils.py` fue creado explícitamente para centralizar el parseo de JSON de Claude ("evita duplicación en 5+ archivos", dice su docstring) pero **solo lo usan 2 de los ~7 sitios que llaman a Claude** (ver §3.3).
- Los routers (`reglas.py`, `catalogos.py`) contienen lógica de negocio no trivial (prompts completos a Claude, validación de regex) que debería vivir en `services/`, no en la capa HTTP.

### 1.4 Piezas principales del sistema

| Pieza | Rol |
|---|---|
| `services/detector.py` | Motor de clasificación jerárquica por reglas (keywords+regex con score) |
| `services/rule_engine.py` | Motor de extracción de campos por regex (con soporte de bbox/zona de PDF) |
| `services/extractor.py` | Orquestador del flujo de extracción directa; también genera patrones con IA |
| `services/clasificador_service.py` | Orquestador del flujo de cola/carpeta vigilada; clasificación con IA |
| `services/batch_trainer.py` | Generación de regex a partir de selecciones manuales en lote |
| `models/db_models.py` | 11 tablas SQLAlchemy — el corazón del dominio |
| `seed/_catalogo_generado_ref.py` | Catálogo estático de 42 aseguradoras/292 subramos (datos, no lógica) |
| `web/` | SPA con 6 páginas: Lector, Historial, Catálogos, Reglas, Reglas-Código, Clasificador |

---

## 2. Base de datos

### 2.1 Modelo entidad-relación (11 tablas, todas en `db_models.py`)

```
Compania 1─* Ramo 1─* Subramo 1─* CampoDefinido
                              └─* ReglaExtraccion ─* CampoExtraido (vía Extraccion)
                              └─* PolizaEntrenamiento 1─* SeleccionCampo

CampoGlobal              (standalone — no FK, aplica a todos los subramos por convención)
ClasificacionCola        (FK opcionales a Compania/Ramo/Subramo, prop y final)
CarpetaVigilada          (standalone, config del watcher)
Extraccion 1─* CampoExtraido
```

- **Compania → Ramo → Subramo**: jerarquía correcta, 1:N con `cascade="all, delete-orphan"` en ambos niveles. FKs bien definidas y `foreign_keys=ON` vía PRAGMA.
- **CampoGlobal vs CampoDefinido**: dos tablas para "qué campos existen", diferenciadas solo por si aplican a *todos* los subramos (`CampoGlobal`, sin FK, filtrado en Python por `grupo != "vehiculos"`) o a *uno* (`CampoDefinido`, con FK a `Subramo`). Es un diseño consciente (documentado en el docstring de la clase) pero implica que **la lógica de "qué campos aplican a este subramo" vive repartida entre BD (FK) y código Python (filtro de grupo)** — no es un problema de normalización per se, pero sí una superficie de reglas de negocio ocultas fuera del esquema.
- **ReglaExtraccion**: núcleo del sistema. Une `subramo_id` + `nombre_campo` + `patron_regex`, con `campo_id` opcional (FK a `CampoDefinido`, `nullable=True`) — es decir, **una regla puede existir sin campo formalmente definido** si `nombre_campo` coincide con un `CampoGlobal` (que no tiene FK hacia reglas). La relación campo↔regla se resuelve en dos rutas distintas según si el campo es global o específico, lo cual es una asimetría del modelo (no rompe nada porque `nombre_campo` es el verdadero acoplamiento lógico, pero `campo_id` es parcialmente decorativo).
- **Extraccion.datos_completos (JSON)** vs **CampoExtraido (fila por campo)**: **duplicación deliberada de datos** — `datos_completos` es un snapshot desnormalizado `{nombre: valor}` para exportación rápida, mientras `CampoExtraido` guarda lo mismo pero con metadata (`metodo`, `regla_id`, `confianza`) para trazabilidad. Funciona, pero cualquier consulta que solo necesite valores puede evitar el join a `CampoExtraido`; sin embargo, si alguna vez diverge la escritura de ambos (hoy se escriben juntos, en el mismo `procesar_pdf()`), quedarán inconsistentes sin que nada lo detecte.
- **ClasificacionCola**: tiene `compania_id_prop/ramo_id_prop/subramo_id_prop` y `..._final` — 6 columnas para lo que conceptualmente son "propuesta" y "confirmación" de una misma jerarquía de 3 niveles. Correcto para el caso de uso (permitir override), pero es la tabla con más columnas nullable/opcionales del esquema (20 columnas, la mayoría nullable) — indicio de que podría dividirse en "cola" + "resultado de clasificación" si crece más.
- **Índices** (`_create_indexes()` en `database.py`): cubren las consultas más frecuentes (extracciones por subramo/fecha/compañía, reglas por subramo, campos extraídos por extracción). Razonables para el volumen actual.

### 2.2 Migraciones "a mano"

`database.py::_migrate_add_columns()` es una lista de `ALTER TABLE ... ADD COLUMN` envueltos en `try/except: pass`. Funciona para SQLite y para *agregar* columnas, pero:
- No hay forma de *quitar* o *renombrar* una columna sin migración manual fuera de este mecanismo.
- El `except Exception: pass` silencia también errores reales (typo en el nombre de tabla, tipo de dato inválido), no solo el caso esperado de "columna ya existe" — un typo pasaría desapercibido indefinidamente.
- No hay versión de esquema ni historial — para saber qué migraciones ya corrieron hay que leer el código, no la BD.

### 2.3 ¿Duplicación de conceptos / catálogos repetidos?

Sí, uno claro (no es de BD sino de los datos que la alimentan, ver §3.1): **dos copias casi idénticas del catálogo de 292 subramos** (`api/_catalogo_generado_ref.py` y `api/seed/_catalogo_generado.py`), con una diferencia real de contenido entre ellas (un ramo "Producción Asociada" que solo existe en una copia). Solo una se usa (`_catalogo_generado_ref.py`, importada por `seed/data.py`); la otra es un artefacto huérfano que además **no coincide** con la que sí se usa, lo que es una fuente de confusión si alguien edita la copia equivocada esperando que tenga efecto.

No se observan tablas que dupliquen el mismo concepto de negocio dentro del esquema activo — el diseño de 11 tablas es razonable para el dominio.

---

## 3. Código

### 3.1 Código muerto

- **`api/parsers/` completo** (`base.py`, `gnp.py`, `qualitas.py`, `ai_fallback.py`, `__init__.py` — ~175 líneas): define una interfaz `BaseParser` + parsers hardcodeados por regex para GNP y Quálitas, con un registro `PARSERS`. **Nada en `services/` o `routers/` lo importa** (confirmado por grep en todo `api/`). El sistema real de extracción es 100% dirigido por BD (`ReglaExtraccion`), no por parsers hardcodeados en Python. Este módulo parece un prototipo temprano que quedó abandonado tras pivotear al motor de reglas dinámico.
- **`api/_catalogo_generado_ref.py`** — usado — vs **`api/seed/_catalogo_generado.py`** — *no* usado (nada lo importa) y además desactualizado respecto al que sí se usa. ~1,200 líneas de datos huérfanos.
- **`check_reglas.py`, `migrate_reglas.py`** en la raíz del repo — scripts sueltos de una sola vez, no forman parte de la app (no los importa `main.py`), probablemente usados ad-hoc durante desarrollo. No son código "muerto" en sentido estricto (pueden ser útiles como scripts de mantenimiento) pero no están documentados ni versionados como tal.
- **`debug_texto_poliza.txt`** se sobrescribe en cada request de extracción (`extractor.py` línea 197) — es un artefacto de debugging dejado corriendo en el pipeline de producción, no código muerto pero sí instrumentación que no debería ejecutarse en cada llamada real.
- Impresiones `print(...)` de debug extensas en `extractor.py` y `rule_engine.py` (decenas de líneas por request) — no es "código muerto" pero es ruido de logging no estructurado que probablemente se dejó de una sesión de depuración.

### 3.2 Lógica duplicada con inconsistencia real (no solo estilo)

**Derivación de `entidad` a partir del RFC — implementada dos veces con salidas distintas:**
- `services/rule_engine.py` (líneas 134-147, dentro de `aplicar_reglas`): si `len(rfc) == 13` → `"0"`, si `12` → `"1"`.
- `services/extractor.py` (función `_derivar_campos`, líneas 135-173): si `len(rfc) == 13` → `"Persona Física"`, si `12` → `"Persona Moral"`.

Ambas funciones corren **en el mismo pipeline** (`rule_engine.aplicar_reglas()` se llama dentro de `extractor.procesar_pdf()`, y luego `_derivar_campos()` se llama sobre el resultado). La condición de `extractor.py` (`if rfc_val and "entidad" not in datos or (...)`) hace que, si `rule_engine` ya escribió `entidad` con valor `"0"`/`"1"`, el chequeo `datos.get("entidad", {}).get("valor") is None` sea `False` — por lo que en la práctica **gana el valor `"0"`/`"1"` de `rule_engine`**, y el código de `extractor.py` que produce `"Persona Física"/"Persona Moral"` queda efectivamente muerto en el flujo normal, aunque sigue existiendo y ejecutándose. Esto es exactamente el tipo de "dos fuentes de verdad para el mismo dato" que genera bugs difíciles de rastrear si alguna vez cambia el orden de llamadas o se usa `_derivar_campos` en otro contexto (p. ej. si se llama sin pasar por `rule_engine` primero, el resultado sería el opuesto formato).

**Detección de "es ramo de vehículo" (`_es_vehiculo`) y "ramo de un subramo" (`_ramo_de_subramo`)** — duplicadas byte-por-byte en `services/rule_engine.py` (líneas 15-27) y `routers/catalogos.py` (líneas 282-293). Mismo nombre de función, misma tupla `_VEHICULO_KW`, mismo cuerpo.

**Generación de patrones de detección con IA (compañía/ramo/subramo) — prompt casi idéntico repetido en 4 lugares independientes:**
1. `services/extractor.py::_generar_y_guardar_patrones` (auto, durante extracción)
2. `services/clasificador_service.py::generar_patrones_ia` (auto, durante clasificación)
3. `routers/catalogos.py::generar_y_guardar_patrones` (manual, desde UI de catálogos)
4. `routers/reglas.py::generar_patrones_deteccion` (manual, desde UI de reglas)

Cada uno redacta su propio prompt en español (con variaciones menores de redacción), llama a Claude con modelo hardcodeado o vía config de forma inconsistente, parsea el JSON con su propia lógica de strip de fences de markdown, y valida los regex con su propio bucle `try: re.compile(p) except re.error`. Es la misma operación de negocio ("generar y validar patrones de detección para 3 niveles") implementada 4 veces con 4 prompts ligeramente distintos — si se decide mejorar el prompt, hay que recordar tocar los 4 sitios (y es fácil que se actualicen 2 de 4 y queden divergentes, como ya pasó con el catálogo duplicado).

**Generación de regex de extracción de campo con IA — repetida 3 veces con la misma estructura** (`routers/reglas.py::generar_regex_con_ia`, `routers/reglas.py::reintentar_regex`, `services/batch_trainer.py::generar_regex_lote`): mismo patrón de prompt + `client.messages.create` + parseo manual de fences + `json.loads`.

### 3.3 `ai_utils.py` — la abstracción correcta, subutilizada

`services/ai_utils.py::parse_claude_json()` fue escrita explícitamente para resolver el problema de §3.2 ("Centraliza el parsing de JSON y evita duplicación en 5+ archivos", dice su propio docstring), y `make_anthropic_client()` para centralizar la creación del cliente. En la práctica:
- La usan: `extractor.py`, `clasificador_service.py`.
- **No la usan** (reimplementan el strip de fences + `json.loads`/`json.JSONDecodeError` a mano): `routers/reglas.py` (3 endpoints), `routers/catalogos.py` (1 endpoint), `services/batch_trainer.py` (con una variante propia que además intenta un `re.search(r'\{.*\}', ...)` como fallback que `parse_claude_json` no tiene).

Además, `routers/reglas.py` y `routers/catalogos.py` instancian `anthropic.Anthropic(api_key=...)` directamente en vez de usar `make_anthropic_client()`, duplicando el chequeo de `ANTHROPIC_API_KEY` presente/ausente con su propio mensaje de error HTTP.

### 3.4 Configuración declarada pero no respetada

`config.py` define 4 variables de modelo pensadas exactamente para el problema de §3.2/3.3 (poder cambiar de modelo sin tocar código): `MODEL_EXTRACTOR`, `MODEL_BATCH_TRAINER`, `MODEL_PATTERN_GEN`, `MODEL_REGEX_IA`, más `MODEL_CLASIFICADOR`. Uso real (verificado por grep):
- `MODEL_EXTRACTOR` → usado 1 vez (`extractor.py`).
- `MODEL_CLASIFICADOR` → usado 2 veces (`clasificador_service.py`).
- `MODEL_BATCH_TRAINER` → **nunca usado**; `batch_trainer.py` hardcodea el string literal `"claude-opus-4-7"`.
- `MODEL_PATTERN_GEN` → **nunca usado**; los 4 sitios de generación de patrones (§3.2) hardcodean `"claude-haiku-4-5-20251001"` o `"claude-opus-4-7"` según el archivo.
- `MODEL_REGEX_IA` → **nunca usado**; `routers/reglas.py` hardcodea `"claude-haiku-4-5-20251001"` en sus 3 endpoints.

Es decir, 3 de las 5 variables de configuración de modelo existen únicamente en `config.py` sin ningún efecto — cambiar el modelo vía `.env` para esos flujos no tiene ningún impacto pese a que el mecanismo (`os.getenv(...)`) está listo y documentado con un comentario explícito ("Cambiar en .env para usar modelos distintos sin tocar código").

### 3.5 Archivos grandes / responsabilidades mezcladas

| Archivo | Líneas | Observación |
|---|---|---|
| `seed/_catalogo_generado.py` | 1206 | Dato puro, huérfano (§3.1) — tamaño no es problema real, es basura |
| `_catalogo_generado_ref.py` | 1199 | Dato puro, en uso — razonable que sea grande (son datos, no lógica) |
| `routers/catalogos.py` | 486 | Mezcla CRUD de catálogo + lógica de dominio (`_es_vehiculo`) + un endpoint completo de generación de patrones con IA (prompt de 40 líneas) que debería estar en un `service` |
| `routers/entrenamiento.py` | 517 | CRUD + renderizado de PDF a imagen (pypdfium2) + orquestación de IA — bastantes responsabilidades pero cada endpoint es cohesivo en sí mismo |
| `routers/reglas.py` | 430 | 3 endpoints que son, en esencia, la misma llamada a Claude con prompt ligeramente distinto (§3.2) — el archivo no es "grande por lógica compleja" sino "grande por duplicación" |

Ninguno es excesivamente grande para FastAPI, pero **`catalogos.py` y `reglas.py` violan separación de capas**: contienen prompts completos, llamadas directas al SDK de Anthropic, y validación de regex — eso es lógica de dominio/infraestructura viviendo en el router, no HTTP glue.

### 3.6 Regex repetidas

- `_VEHICULO_KW` + `_es_vehiculo()` + `_ramo_de_subramo()`: duplicados verbatim en `rule_engine.py` y `catalogos.py` (§3.2).
- El patrón de "strip markdown fences antes de `json.loads`" (`if raw.startswith("```"): ...`) aparece manualmente en `routers/reglas.py` (×3) y `routers/catalogos.py` (×1), reimplementando lo que `ai_utils.parse_claude_json` ya hace con una sola regex.

### 3.7 SOLID / acoplamiento / cohesión

- **SRP**: los routers `catalogos.py` y `reglas.py` mezclan responsabilidad HTTP con lógica de prompt-engineering e integración con Anthropic — deberían delegar a un `service` (como sí hace `extraccion.py`, que delega correctamente a `extractor.py`/`detector.py`).
- **DRY** (no es un principio SOLID pero es el hallazgo dominante de esta auditoría): la violación más consistente en todo el código es "misma operación de negocio, reimplementada in situ en cada punto de entrada", visible en la generación de patrones (§3.2, 4 copias) y en el parseo JSON de Claude (§3.3).
- **Acoplamiento**: bajo entre `detector.py`/`rule_engine.py` (núcleo puro, sin llamadas a IA) y el resto — es el punto más sano del sistema. Alto entre routers y el SDK de `anthropic` directamente, lo cual acopla la capa HTTP a un proveedor de IA específico sin indirección.
- **Cohesión**: alta en los módulos de servicio "core" (`detector.py`, `rule_engine.py`); baja en `routers/catalogos.py`, que mezcla CRUD de 3 entidades distintas (Compañía/Ramo/Subramo) más generación de patrones con IA más helpers de dominio duplicados.

---

## 4. Extracción — flujo detallado

### 4.1 Detección de compañía / ramo / subramo (`services/detector.py`)

Cascada estricta: primero Compañía, luego Ramo **solo entre los hijos de la compañía ganadora**, luego Subramo **solo entre los hijos del ramo ganador**. No hay backtracking: si la compañía detectada es incorrecta, ramo y subramo ni siquiera se evalúan sobre las demás compañías.

Puntuación por nivel (`_score`):
- Cada `keyword` (string) presente en el texto (lowercase, substring) → **+1 punto**.
- Cada patrón en `patrones_deteccion` (regex) que haga match (`re.search`, `IGNORECASE|MULTILINE`) → **+3 puntos**.
- Se ordena por score descendente; gana el de mayor score (empate no se resuelve explícitamente — Python `sorted` es estable, así que gana el primero según el orden de la query, que es `prioridad ASC NULLS LAST` para Compañía y Subramo, sin orden explícito para Ramo).

Umbral de confianza global: `alta` si `subramo_id` fue detectado y la suma de scores (compañía+ramo+subramo) ≥ 9; `media` si hay `ramo_id` y suma ≥ 3; `baja` si solo hay `compania_id`; si no, `sin_datos`.

### 4.2 Decisión de qué reglas usar

Una vez hay `subramo_id`, `rule_engine.aplicar_reglas()` obtiene **todas** las `ReglaExtraccion` con `subramo_id` igual, `activo=True` y `es_borrador=False` (sin filtrar por compañía/ramo explícitamente — la relación subramo→ramo→compañía ya es 1:1 ascendente, así que no hace falta). No hay priorización entre reglas del mismo campo: por diseño solo puede haber una regla `activo=True` no-borrador por `(subramo_id, nombre_campo)` — se hace cumplir en el router (`routers/reglas.py::crear_regla` desactiva la anterior al crear una nueva), no con una constraint de BD (`UNIQUE`), por lo que es una invariante de aplicación, no de esquema — vulnerable a violarse si algún día se inserta directamente en BD o desde otro código.

### 4.3 Obtención de campos (regla por campo)

Para cada regla:
1. Si tiene `bbox` (región normalizada 0-1 de una página) y se pasó el PDF crudo, recorta esa zona con `pdfplumber.within_bbox` y aplica el regex solo ahí.
2. Si no hay match en el bbox, hace **fallback al texto completo** con el mismo regex.
3. Si no hay `bbox`, aplica directo sobre el texto completo.

`_aplicar_patron`: usa `re.search` con `IGNORECASE|MULTILINE`; si el regex tiene grupo de captura, retorna `group(1)`, si no, `group(0)` completo — ambos `.strip()`.

Después de las reglas: se agregan campos globales con `valor_fijo` (constantes de negocio, ej. `estatus="0"`, `renovacion="0"`) que no requieren ni regla ni texto. Luego se deriva `entidad` desde el RFC (ver duplicación en §3.2).

### 4.4 Diagrama del flujo de extracción

```
PDF (bytes)
   │
   ▼
extraer_texto_pdf()  ── pdfplumber.extract_text() por página
   │
   ▼
detectar_con_score()  ── keywords(+1) / regex(+3) en cascada Compañía→Ramo→Subramo
   │                     └─ candidatos_compania (top-3), score por nivel
   ▼
¿algún nivel detectado sin patrones_deteccion?
   │ sí                              │ no
   ▼                                 │
Claude genera regex nuevos           │
(merge en BD, no duplica)            │
   │                                 │
   └─────────────┬───────────────────┘
                 ▼
   aplicar_reglas(texto, subramo_id)
      for regla in ReglaExtraccion activas:
        bbox? → recorte de zona (pdfplumber) → regex
                 │ sin match → fallback texto completo
        sin bbox → regex sobre texto completo
      + campos globales con valor_fijo
      + entidad ← len(RFC) [duplicado, ver §3.2]
                 ▼
   campos sin regla → "no_encontrado"
                 ▼
   Extraccion + CampoExtraido[] (BD)
                 ▼
   JSON de respuesta al frontend
```

---

## 5. Riesgos

### 5.1 Seguridad (el hallazgo de mayor severidad de esta auditoría)

- **Contraseña en texto plano hardcodeada en el código fuente**: `routers/auth.py` línea 8, `PASSWORD = "Marsella14"`. No viene de variable de entorno, no está hasheada, y queda expuesta a cualquiera con acceso al repositorio (incluyendo el propio historial de git). Cualquiera que lea el código conoce la contraseña de producción.
- **Sesión en memoria de proceso**: `valid_tokens: set = set()` en `auth.py` vive en RAM del proceso Python. Se pierde en cada reinicio/deploy (todos los usuarios logueados quedan deslogueados sin aviso) y **no es compatible con más de un worker** (si se corre con `--workers N > 1` o múltiples réplicas, un token generado por el worker A no existe en el worker B → fallos de sesión intermitentes). No hay expiración activa de tokens (el `set` crece indefinidamente hasta el próximo reinicio; el único límite es la cookie `max_age` del lado del cliente).
- `secure=True` en la cookie de sesión (`auth.py` línea 26) exige HTTPS — coherente si se sirve tras un proxy TLS, pero rompe silenciosamente en un `http://localhost` de desarrollo sin que el código lo señale.

### 5.2 Deuda técnica

- Duplicación de lógica de generación de patrones/regex con IA en 4-7 sitios (§3.2/3.3) — el costo compuesto es que cualquier mejora al prompt, cualquier corrección de un caso límite del parseo de JSON de Claude, o cualquier cambio de modelo, requiere tocar múltiples archivos y es fácil dejar alguno desactualizado (ya ocurrió con las dos copias del catálogo).
- Configuración de modelos (`MODEL_BATCH_TRAINER`, `MODEL_PATTERN_GEN`, `MODEL_REGEX_IA`) declarada y documentada pero sin efecto real — riesgo operativo si alguien intenta cambiar de modelo vía `.env` en producción y asume que funciona porque la variable existe.
- Migraciones "a mano" con `except Exception: pass` silencioso (§2.2) — sin registro de qué corrió, sin forma de detectar un fallo real oculto detrás del `pass`.
- `requirements.txt` incompleto: usa `watchdog` (`folder_watcher.py`) y `pypdfium2` (`entrenamiento.py`) en producción pero ninguno está listado — un `pip install -r requirements.txt` en un entorno limpio fallaría al arrancar.
- Instrumentación de debug (prints extensos, escritura de `debug_texto_poliza.txt` en cada extracción) dejada activa en el pipeline de producción — no es solo ruido de logs, es I/O de disco innecesaria por request.
- Binarios pesados sueltos en la raíz del repositorio (`lector-polizas.rar` ~46 MB, `web.zip` ~58 MB, `IniciarLectorPolizas.exe` ~7.7 MB) — no rastreados aún por git pero presentes en el árbol de trabajo; riesgo de que alguien los agregue por accidente (`git add .`) e infle el repositorio permanentemente.

### 5.3 Cuellos de botella

- **SQLite con un solo archivo, `check_same_thread=False`**: adecuado para uso local/single-tenant como está planteado hoy (WAL activado, pragmas razonables), pero es un techo duro para escalar a múltiples procesos/instancias concurrentes — no soporta escrituras concurrentes reales de múltiples workers de la forma en que lo haría Postgres.
- **Detección por regex en cascada sin backtracking** (§4.1): si la compañía top-1 por score resulta ser un falso positivo, el sistema nunca prueba ramo/subramo de la 2ª o 3ª compañía candidata (aunque sí las expone en `candidatos_compania` para la UI) — la corrección solo puede venir del usuario vía `/extraer/reaplicar`, no es automática.
- **`aplicar_reglas` con fallback a texto completo por cada regla con bbox sin match** (§4.3): si muchas reglas tienen bbox y el bbox falla sistemáticamente (ej. el PDF cambió de layout), cada extracción paga el costo de intentar el regex dos veces (zona + texto completo) para cada campo — no es un problema de performance grave al volumen actual, pero escala linealmente con el número de campos por subramo.

### 5.4 Módulos difíciles de mantener

- `routers/reglas.py` y `routers/catalogos.py`: cualquier cambio al "contrato" de cómo se le pide a Claude que genere patrones/regex requiere editar múltiples prompts casi-duplicados dentro de estos archivos, con alto riesgo de que se actualicen de forma inconsistente (exactamente el patrón que ya produjo la divergencia del catálogo duplicado, §2.3).
- La pareja `_catalogo_generado_ref.py` / `seed/_catalogo_generado.py`: mientras ambos archivos coexistan sin que quede claro cuál es la fuente de verdad (uno lo dice en un comentario, "DO NOT EDIT MANUALLY", pero ambos lo dicen), cualquier persona nueva en el proyecto puede editar la copia equivocada.

### 5.5 Qué impedirá escalar a más aseguradoras

- El catálogo (`_catalogo_generado_ref.py`) es un archivo Python estático de 1,199 líneas generado externamente ("generado desde datos reales", según su docstring) — agregar una aseguradora nueva hoy implica regenerar y reemplazar este archivo completo (o editarlo a mano, con el riesgo de que diverja de nuevo de su copia huérfana). No hay un flujo de "agregar aseguradora" vía UI que persista directamente sin pasar por este archivo generado — sí existe (`POST /catalogos/companias`), pero conviven dos mecanismos de alta (seed estático vs. API en caliente) sin que el diseño documente cuál debe usarse en qué momento del ciclo de vida del producto.
- La detección en cascada estricta (Compañía → Ramo → Subramo, §4.1/§5.3) significa que agregar una aseguradora con keywords/patrones que se solapen con una existente (ej. dos compañías que mencionen "seguros" y "vehículo" de forma similar) requerirá afinar manualmente los patrones de *ambas* para evitar falsos positivos cruzados — no hay ningún mecanismo de desambiguación automática entre compañías con score empatado o cercano más allá de "gana la de mayor score, y en empate gana la de mayor prioridad configurada".
- Cada aseguradora nueva implica, en la práctica, repetir el ciclo completo de "clasificador detecta con IA (cara, latencia de red) → usuario confirma → entrenamiento por lote (más llamadas a IA) → reglas guardadas" antes de que la detección/extracción se vuelva gratuita (basada en regex). Este ciclo no está cuantificado (no hay métricas de cuántas llamadas a IA cuesta onboardear una aseguradora nueva en promedio), lo que dificulta presupuestar el costo de escalar el catálogo.

---

## 6. Resumen ejecutivo

| Categoría | Severidad | Hallazgo |
|---|---|---|
| Seguridad | 🔴 Alta | Contraseña hardcodeada en texto plano (`auth.py`); sesiones en memoria de proceso, no compatibles con multi-worker |
| Deuda técnica | 🟠 Media-Alta | Generación de patrones/regex con IA duplicada en 4-7 lugares con prompts divergentes |
| Deuda técnica | 🟠 Media | 3 de 5 variables de configuración de modelo IA (`config.py`) no tienen ningún efecto real |
| Código muerto | 🟡 Media | Paquete `api/parsers/` completo (5 archivos) sin ninguna referencia en el sistema activo |
| Datos | 🟡 Media | Catálogo de aseguradoras duplicado en 2 archivos, con contenido divergente entre ambos |
| Operación | 🟡 Media | `requirements.txt` no incluye `watchdog` ni `pypdfium2`, ambos usados en producción |
| Higiene | 🟢 Baja | Debug prints extensos y escritura de archivo de debug en cada request de extracción |

No se propuso ninguna solución ni se modificó código, conforme a lo solicitado. Este documento describe el estado actual para servir de base a una discusión de priorización.
