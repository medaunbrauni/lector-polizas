# Análisis del Modelo de Datos y Propuesta de Arquitectura V2

**Alcance:** `companias`, `ramos`, `subramos`, `campos_definidos`, `reglas_extraccion` (y las tablas con las que se acoplan: `campos_globales`, `campos_extraidos`).
**Método:** análisis exclusivo de esquema — no se leyó volumen de datos ni se ejecutó ninguna consulta.
**No se modificó ni se propone código.** Este documento es una justificación arquitectónica para decidir, no un plan de migración.

---

## 0. Veredicto general (antes del detalle tabla por tabla)

La duplicación observada en este modelo **no es un fenómeno único** — son dos fenómenos distintos que merecen dos veredictos distintos:

| Duplicación | Veredicto |
|---|---|
| `companias` / `ramos` / `subramos` repiten las mismas columnas (`keywords`, `patrones_deteccion`, `activo`, `nombre_exportacion`, `prioridad`) en 3 tablas paralelas | **Decisión correcta de diseño.** Son 3 entidades de dominio genuinamente distintas con una jerarquía estricta 3 niveles conocida de antemano (nunca habrá un 4º nivel ni un nivel opcional). Colapsarlas sería la optimización prematura equivocada — ver §6.1. |
| `campos_globales` vs. `campos_definidos` vs. `nombre_campo` (string libre) en `reglas_extraccion` | **Deuda técnica real.** El concepto "campo" tiene dos implementaciones desconectadas y el enlace campo↔regla se resuelve por coincidencia de texto, no por clave foránea fuerte. Esto sí genera riesgo de inconsistencia y sí puede simplificarse — ver §5 y §6.2. |
| `keywords` / `patrones_deteccion` como listas JSON en vez de tablas normalizadas (`palabra_clave`, `patron`) | **Ni deuda ni error — es el punto justo hoy.** Normalizarlo ahora sería anticipar una necesidad (analítica por patrón, versionado, pesos configurables) que el sistema no tiene todavía. Ver §6.3 para cuándo deja de ser cierto. |
| Ausencia de `UNIQUE` en BD para "una sola regla activa por campo" | **Deuda técnica de bajo costo, alto valor de arreglar.** La invariante existe solo en código de aplicación (`routers/reglas.py`), no en el esquema. |

En resumen: **el esqueleto jerárquico (compañía→ramo→subramo) está bien modelado; el enlace entre "campo" y "regla" está mal modelado.** La propuesta V2 (§7) toca solo lo segundo.

---

## 1. `companias`

**Columnas:** `id, nombre, nombre_exportacion, keywords(JSON), patrones_deteccion(JSON), activo, prioridad, porcentaje_docs, created_at`.

### Ventajas del diseño actual
- Tabla de nivel superior clara, sin ambigüedad: una fila = una aseguradora real.
- `prioridad` + `porcentaje_docs` permiten ordenar el catálogo por relevancia real de negocio (Quálitas primero porque es el 63% de los documentos) sin necesitar una tabla de estadísticas separada.
- `activo` como soft-delete evita perder historial de `Extraccion` cuando una aseguradora deja de usarse (las FKs de `Extraccion.compania_id` siguen siendo válidas).
- `nombre_exportacion` desacopla el nombre interno del nombre que espera el sistema externo (mesa de control Sicas) — decisión correcta, evita lógica de mapeo en el código de exportación.

### Desventajas
- `keywords` y `patrones_deteccion` en la misma tabla que los metadatos de negocio (`prioridad`, `porcentaje_docs`) mezclan dos responsabilidades: "qué es esta aseguradora" y "cómo se detecta". No es grave a este volumen, pero significa que cualquier consulta de solo-lectura del catálogo (para un dropdown en el frontend, por ejemplo) carga también los blobs JSON de detección aunque no los necesite.
- No hay constraint que impida `patrones_deteccion` con regex inválido a nivel de BD — la validación (`re.compile`) vive únicamente en el código Python que escribe esta columna (routers), por lo que un `UPDATE` directo a la BD (o un bug futuro que la escriba desde otro path) puede dejar un patrón roto sin que nada lo detecte hasta el próximo intento de uso (donde se descarta silenciosamente con `except re.error: pass` en `detector.py`).

### Costo de mantenimiento
Bajo. Es la tabla más simple de las 5 — un CRUD estándar (ver `routers/catalogos.py`).

### Impacto en rendimiento
Ninguno relevante al volumen actual (42 filas). El único costo real es que `detectar_con_score()` recorre **todas** las compañías activas en cada extracción, evaluando keywords+regex de cada una contra el texto completo del PDF — es O(n_companias × n_patrones) por documento. A 42 compañías es instantáneo; si el catálogo crece a cientos, este escaneo lineal sin índice (no puede haberlo, es matching de texto libre) empieza a dominar el tiempo de extracción.

### Facilidad para agregar nuevas aseguradoras
Alta desde la API (`POST /catalogos/companias`), pero **dual** con el mecanismo de seed estático (`_catalogo_generado_ref.py`) — ya señalado en la auditoría previa. El esquema en sí no es el obstáculo; el obstáculo es que hay dos caminos de alta sin que el diseño diga cuál es la fuente de verdad post-lanzamiento.

---

## 2. `ramos`

**Columnas:** `id, nombre, nombre_exportacion, compania_id(FK), keywords(JSON), patrones_deteccion(JSON), activo, created_at`.

### Ventajas
- FK obligatoria (`nullable=False`) a `Compania` — correcto, un ramo no existe sin aseguradora.
- Mismo patrón de detección (`keywords`+`patrones_deteccion`) que `companias`, lo que permite que `detector.py` trate los 3 niveles con la misma función `_score()` sin condicionales por nivel — **consistencia deliberada, no accidental**.
- `cascade="all, delete-orphan"` desde `Compania` — si se elimina una compañía (soft o hard), no quedan ramos huérfanos apuntando a nada.

### Desventajas
- No tiene `prioridad` ni `porcentaje_docs` (a diferencia de `Compania` y `Subramo`, que sí las tienen). Esta asimetría es extraña: si el sistema usa prioridad para desempatar en Compañía y en Subramo, ¿por qué no en Ramo? En la práctica, `detector.py` no ordena ramos por prioridad al calcular el score (línea 93-97 de `detector.py`: la query de ramos no tiene `order_by`), lo que significa que un empate de score entre dos ramos de la misma compañía se resuelve por el orden que devuelva SQLite (no determinístico de forma confiable) en vez de una regla de negocio explícita.
- `_es_vehiculo(nombre_ramo)` es una función que clasifica ramos por *substring del nombre* (`"vehículo" in nombre.lower()`) en vez de una columna explícita (`categoria` o `tipo`). Esto significa que "¿este ramo es de vehículos?" es una regla de negocio codificada en dos archivos distintos (`rule_engine.py` y `catalogos.py`, duplicada verbatim) en vez de un dato consultable en la tabla.

### Costo de mantenimiento
Bajo-medio. La asimetría de columnas con `Compania`/`Subramo` no rompe nada hoy, pero es el tipo de inconsistencia que confunde a quien edite el modelo más adelante ("¿por qué Ramo no tiene prioridad si los otros dos sí?").

### Impacto en rendimiento
Ninguno a este volumen (~90-120 ramos estimados si hay 42 compañías con ~2-3 ramos promedio). Mismo patrón de escaneo lineal que `Compania`, pero acotado por `compania_id` (ya filtrado antes de puntuar), así que el costo real es pequeño.

### Facilidad para agregar nuevos ramos
Alta vía `POST /catalogos/ramos`. El esquema no lo dificulta. La dificultad real está en la clasificación por substring (`_es_vehiculo`): agregar un ramo nuevo cuyo nombre no contenga ninguna de las palabras de `_VEHICULO_KW` pero que conceptualmente sí sea "de vehículo" (p. ej. un ramo llamado "Transporte de Personal") requiere que alguien recuerde tocar esa lista hardcodeada en dos archivos — el esquema no fuerza ni facilita esta decisión, la deja completamente fuera de la BD.

---

## 3. `subramos`

**Columnas:** `id, nombre, nombre_exportacion, ramo_id(FK), keywords(JSON), patrones_deteccion(JSON), activo, prioridad, porcentaje_docs, created_at`.

### Ventajas
- Es el nivel correcto para colgar `campos_definidos` y `reglas_extraccion` — el subramo es, en la práctica, la unidad real de "tipo de póliza" sobre la que se construyen reglas de extracción específicas. El modelo identifica bien cuál es la unidad atómica del negocio.
- Recupera `prioridad`/`porcentaje_docs` (a diferencia de `Ramo`) — consistente con su rol de nivel más específico, donde el desempate por relevancia importa más (hay muchos más subramos que ramos, más probabilidad de scores cercanos).
- `cascade="all, delete-orphan"` hacia `CampoDefinido` y `ReglaExtraccion` — correcto, elimina en cascada la configuración de extracción si se elimina el subramo.

### Desventajas
- Es el nivel con más responsabilidades implícitas: determina qué `CampoGlobal` aplican (vía el ramo padre + substring `_es_vehiculo`), qué `CampoDefinido` existen, y qué `ReglaExtraccion` corren. Ninguna de estas relaciones está mal modelada individualmente, pero `Subramo` es el punto donde confluye toda la complejidad de negocio del sistema — cualquier cambio al modelo de "qué campos aplican a qué subramo" (§5) impacta directamente esta tabla.
- Igual que en `Ramo`/`Compania`: no hay constraint de BD que garantice que `patrones_deteccion` contiene regex válidos.

### Costo de mantenimiento
Medio — no por la tabla en sí (es simple), sino porque es el punto de integración de las otras 4 tablas del alcance. Cambios ahí exigen validar el efecto en `campos_definidos`, `reglas_extraccion` y la lógica de `_globales_para_subramo()`.

### Impacto en rendimiento
Ninguno relevante hoy (~292 filas, según el catálogo semilla). El índice `idx_regla_sub` (`reglas_extraccion(subramo_id, activo)`) y `idx_campo_def_sub` (`campos_definidos(subramo_id)`) ya cubren las consultas más frecuentes — correcto.

### Facilidad para agregar nuevos ramos/subramos
Agregar un subramo nuevo a un ramo existente es trivial (`POST /catalogos/subramos`). El costo real no es el INSERT sino el trabajo posterior obligatorio para que sea útil: sin `patrones_deteccion` propios, el subramo nuevo nunca se detectará automáticamente con confianza `alta` (necesita `≥9` puntos y el subramo contribuye hasta 3 con un solo regex) — debe pasar por el ciclo completo de clasificación con IA → entrenamiento por lote antes de "graduarse" a detección gratuita. Esto no es un defecto del esquema, es una consecuencia correcta y esperada del diseño de detección en cascada.

---

## 4. `campos_definidos`

**Columnas:** `id, subramo_id(FK), nombre, label, tipo, requerido, orden`.

### Ventajas
- Modelo simple y correcto para su propósito declarado: "campos específicos de un subramo que complementan los globales" (docstring de la clase, textual).
- FK obligatoria a `Subramo` con cascada — un campo definido no puede existir sin su subramo, y se limpia automáticamente si el subramo se elimina.
- `relationship` bidireccional hacia `ReglaExtraccion` (`campo.reglas`) — permite navegar de campo a sus reglas sin query manual.

### Desventajas (la más importante de las 5 tablas)
- **No hay ninguna restricción de unicidad sobre `(subramo_id, nombre)`.** Nada en el esquema impide crear dos `CampoDefinido` con el mismo `nombre` en el mismo subramo — sería un duplicado silencioso, indistinguible en las consultas por nombre (`rule_engine.campos_sin_regla`, que filtra por `CampoDefinido.nombre.notin_(...)`), y ambigüedad en cuál de los dos se le asocia una regla nueva.
- **El mismo concepto de campo se redeclara en cada subramo que lo usa.** Si "suma_asegurada" es un campo relevante en 40 subramos distintos de Daños/Vida/AyE (como efectivamente lo es, según `seed/campos_globales.py`/`seed/data.py`), existen hasta 40 filas `CampoDefinido` independientes con el mismo `nombre="suma_asegurada"`, cada una con su propio `label`/`tipo`/`requerido` que *deberían* ser idénticos pero **no hay nada que lo garantice** — si alguien corrige el `label` de "Suma Asegurada" a "Suma Asegurada (MXN)" para un subramo, las otras 39 filas no se actualizan y el catálogo queda inconsistente entre subramos sin que el sistema lo note.
- No tiene `activo` (a diferencia de `Compania`/`Ramo`/`Subramo`) — eliminar un campo definido es un hard-delete, sin posibilidad de desactivar temporalmente ni de preservar historial si `CampoExtraido` referencia ese nombre de campo en extracciones pasadas (la relación con `CampoExtraido` es por `nombre_campo` string, no por `campo_id`, así que en la práctica el historial sobrevive de todas formas — pero por accidente del diseño, no por decisión).

### Costo de mantenimiento
**Alto, y crece con cada subramo nuevo.** Cada vez que se agrega un subramo del mismo tipo de ramo (p. ej. un subramo nuevo de "Daños"), hay que re-declarar el mismo set de ~10 campos ya usado en los otros subramos de Daños — de hecho `seed/data.py` ya hace exactamente esto con listas hardcodeadas por ramo (`CAMPOS_DANOS`, `CAMPOS_VIDA`, etc.) precisamente porque el modelo no tiene un catálogo reusable de definiciones de campo independiente del subramo.

### Impacto en rendimiento
Bajo — son consultas indexadas (`idx_campo_def_sub`) sobre una tabla que crecerá linealmente con subramos × campos-por-subramo (probablemente unos pocos miles de filas en el peor caso), sin problema de escala real.

### Facilidad para agregar nuevos campos
**Es la operación más costosa del sistema hoy**, no por el esquema en sí sino por la ausencia de un catálogo canónico: agregar un campo nuevo que aplica a varios subramos de un mismo ramo obliga a insertarlo en cada subramo por separado (o a tocar las listas hardcodeadas en `seed/data.py` y re-correr el seed), en vez de definirlo una vez y asociarlo a los subramos que correspondan.

---

## 5. `reglas_extraccion`

**Columnas:** `id, subramo_id(FK), campo_id(FK nullable), nombre_campo, patron_regex, contexto_antes, contexto_despues, ejemplos(JSON), confianza, activo, es_borrador, bbox(JSON), ocr_bbox(JSON), cobertura_lote, total_lote, creado_por, created_at, updated_at`.

### Ventajas
- Es la tabla mejor diseñada para su función operacional inmediata: guarda todo lo necesario para reproducir una extracción (`patron_regex`, `bbox` para acotar zona, `contexto_antes/despues` y `ejemplos` para trazabilidad de por qué se generó así, `cobertura_lote/total_lote` para saber qué tan bien probó en su lote de entrenamiento).
- `es_borrador` + `activo` como dos flags independientes modela correctamente 3 estados reales (borrador / activa / desactivada) sin necesitar una columna `estado` de texto libre.
- `creado_por` (`manual|ia|lote`) da trazabilidad de origen sin tabla adicional — proporcional al problema.

### Desventajas (la raíz de la deuda técnica de este modelo)
- **`campo_id` es `nullable=True` y, en la práctica, casi decorativo.** El verdadero acoplamiento entre una regla y "qué campo llena" es `nombre_campo` (string), porque muchas reglas apuntan a campos de `CampoGlobal` (que no tiene FK, no puede tenerlo con el diseño actual). Es decir: **el sistema tiene dos formas distintas de decir "esta regla es del campo X"**: una fuerte (`campo_id` → `CampoDefinido`, solo para campos específicos) y una débil (`nombre_campo` string, la única que funciona también para campos globales). Todo el código de negocio (`rule_engine.aplicar_reglas`, `campos_sin_regla`, `cobertura_subramo`) razona sobre `nombre_campo`, no sobre `campo_id` — confirmando que la FK "correcta" es la que el sistema en realidad no usa para su lógica central.
- **No hay `UNIQUE` de BD sobre `(subramo_id, nombre_campo)` filtrado por `activo=1 AND es_borrador=0`.** La invariante "solo una regla activa no-borrador por campo por subramo" existe únicamente como un `UPDATE ... SET activo=False` ejecutado manualmente antes del `INSERT` en `routers/reglas.py::crear_regla` y `routers/entrenamiento.py::guardar_regla`. Cualquier inserción que no pase por esas dos rutas exactas (un script de mantenimiento, una migración de datos, un futuro endpoint) puede dejar dos reglas activas simultáneas para el mismo campo sin que la BD lo impida ni lo señale — y `aplicar_reglas()` simplemente iteraría ambas y la última en escribir `resultados[nombre_campo]` "gana" silenciosamente.
- `contexto_antes`/`contexto_despues` están declarados en el modelo pero (según el flujo revisado en la auditoría previa) no se ven poblados por el pipeline actual de generación de regex — son campos del esquema en desuso o subutilizados, no confirmables sin instrumentación adicional, pero es una señal de posible sobre-modelado puntual dentro de una tabla por otro lado bien pensada.

### Costo de mantenimiento
Medio. La tabla en sí no es difícil de mantener; el costo real está en razonar sobre el enlace `nombre_campo` vs `campo_id` cada vez que se toca código que cruza reglas con campos — hay que recordar cuál de los dos usar y por qué, y esa ambigüedad ya se filtró como duplicación de lógica en 3+ archivos (documentado en la auditoría de código, §3.2-3.3 de `AUDITORIA_PROYECTO.md`).

### Impacto en rendimiento
Bajo. Los índices existentes (`idx_regla_sub`) cubren el patrón de acceso dominante (reglas activas por subramo). El campo_id nullable no impone ningún costo de performance — el costo es de integridad, no de velocidad.

### Facilidad para agregar nuevos campos
Depende enteramente de si el campo es global o específico:
- Si es un `CampoGlobal` nuevo: una fila en una tabla, aplica a todos los subramos automáticamente (o a los de un `grupo`) — muy fácil, este es el camino que el modelo sí resuelve bien.
- Si es específico de un subramo (o de varios pero no todos): hay que crear un `CampoDefinido` por cada subramo relevante (ver desventaja de §4) y luego una `ReglaExtraccion` por cada uno también — el trabajo se multiplica por el número de subramos donde aplica, sin ningún mecanismo de "definir una vez, activar en N subramos".

---

## 6. Diagnóstico consolidado: ¿qué tipo de duplicación es cuál?

### 6.1 Jerarquía Compañía→Ramo→Subramo con columnas repetidas — decisión correcta
Colapsar las 3 tablas en una sola tabla genérica tipo `nodo_jerarquico(id, parent_id, nivel, nombre, keywords, patrones_deteccion, ...)` **suena** a menos duplicación, pero es la trampa clásica de la normalización prematura: se perdería la capacidad de la BD de forzar por FK que "un Ramo pertenece a una Compañía y un Subramo a un Ramo" (con una tabla genérica, esa regla pasa a ser responsabilidad exclusiva del código de aplicación, exactamente el mismo problema ya diagnosticado como debilidad en `reglas_extraccion`). Las 3 entidades son conceptualmente distintas, la jerarquía es fija y conocida (nunca 2 ni 4 niveles), y cada nivel ya tiene columnas que no comparte limpiamente con los otros (`Ramo` no tiene `prioridad`, por ejemplo). **Mantener 3 tablas separadas es correcto.**

### 6.2 Campo global / campo definido / nombre_campo en reglas — deuda técnica real
A diferencia del punto anterior, aquí **no** hay 3 conceptos de negocio distintos — hay **un solo concepto** ("un campo extraíble de una póliza") modelado de 3 formas incompatibles entre sí (tabla sin FK, tabla con FK, string libre). Esto no es una decisión de diseño defendible por las características del dominio; es el resultado de haber resuelto el mismo problema en momentos distintos del desarrollo sin unificar retroactivamente. **Esto sí es deuda técnica y sí conviene simplificarlo** — ver propuesta en §7.

### 6.3 JSON para keywords/patrones — ni deuda ni prematuro, es el punto justo *hoy*
Normalizar `keywords`/`patrones_deteccion` en tablas propias (`palabra_clave(entidad_tipo, entidad_id, texto)`, `patron_deteccion(entidad_tipo, entidad_id, regex, peso)`) sería la respuesta correcta **si** el sistema necesitara: (a) analítica de qué patrón individual está aportando a cada match, (b) pesos configurables por patrón en vez del `1pt`/`3pt` fijo hoy hardcodeado en `detector.py`, o (c) versionado/auditoría de cambios a un patrón específico. Ninguna de las tres necesidades existe hoy en el sistema. Construirlo ahora sería exactamente la optimización prematura que el resto de la auditoría advierte evitar. **Es correcto dejarlo como JSON mientras el score sea binario "aporta o no aporta" y no se necesite diagnóstico por patrón individual.** Si en el futuro se requiere afinar por qué una compañía nueva compite mal en el score (necesidad ya anticipada en la auditoría de código, §5.5), ese es el momento de normalizar — no antes.

---

## 7. Arquitectura V2 propuesta (descripción, sin código)

La propuesta toca **únicamente** el subsistema de campos y reglas (§6.2); no toca `companias`/`ramos`/`subramos`, que ya están bien modeladas.

### 7.1 Unificar el concepto de "campo" en un catálogo único

En vez de `campos_globales` (sin FK, aplica-a-todos-por-convención) y `campos_definidos` (con FK, aplica-a-uno), tener **una sola tabla catálogo de definiciones de campo** (`campo` — nombre, label, tipo, descripción, activo), y una **tabla de asociación** entre ese catálogo y los subramos (`subramo_campo` — subramo_id, campo_id, requerido, orden, valor_fijo, filtro_grupo opcional).

Justificación:
- Renombrar la etiqueta de un campo ("Suma Asegurada" → "Suma Asegurada (MXN)") se hace en **una fila**, y se refleja automáticamente en todos los subramos que lo usan — elimina la inconsistencia descrita en §4.
- "¿Este campo aplica a este subramo?" pasa de ser una decisión tomada al momento de insertar N filas duplicadas (una por subramo) a ser una fila en una tabla de asociación — agregar un campo nuevo a 40 subramos existentes es una operación de "vincular", no de "redeclarar 40 veces".
- La distinción actual entre "global" y "específico" se preserva de forma más flexible: un campo del catálogo puede estar vinculado a 1, a varios, o a los 292 subramos — sin necesitar dos tablas con forma distinta para expresar lo mismo.
- El filtro actual por `grupo == "vehiculos"` (string mágico) puede seguir existiendo igual dentro de esta tabla de asociación sin cambios conceptuales — esta propuesta no busca resolver §2 (`_es_vehiculo` por substring en el nombre del ramo); si se quiere resolver también eso, requeriría una columna `categoria` explícita en `ramos`, tratable como una mejora independiente y de menor prioridad.

### 7.2 `reglas_extraccion` referencia al campo del catálogo, no a un string

`campo_id` deja de ser `nullable` y deja de ser la FK secundaria/decorativa — se convierte en la única forma de decir "esta regla llena este campo", apuntando siempre al catálogo unificado de §7.1 (ya no hace falta distinguir global/específico para decidir si se puede usar FK, porque ambos casos viven en la misma tabla). `nombre_campo` como columna de texto puede conservarse *desnormalizada* únicamente como comodidad de lectura (evitar un join en los `print`/logs y en las respuestas JSON rápidas), pero deja de ser la fuente de verdad — la fuente de verdad es `campo_id`.

Justificación: esto colapsa a una sola forma la lógica hoy repartida en `rule_engine.py`, `catalogos.py` y `routers/reglas.py` para razonar "¿a qué campo pertenece esta regla?" — deja de haber dos caminos (por FK, por string) que hoy coexisten sin que el código sea consistente sobre cuál usar primero.

### 7.3 Restricción de unicidad a nivel de esquema para "regla activa única"

Agregar un índice único parcial equivalente a `UNIQUE(subramo_id, campo_id) WHERE activo = 1 AND es_borrador = 0` (SQLite soporta índices parciales). Esto mueve la invariante de "solo puede haber una regla activa no-borrador por campo por subramo" de ser una convención que dos rutas de código respetan por disciplina, a ser una garantía que la base de datos hace cumplir sin importar por dónde se inserte.

Justificación: es el cambio de menor costo de implementación y mayor reducción de riesgo de todo el documento — no reestructura nada, solo cierra una puerta que hoy está abierta por descuido, no por diseño.

### 7.4 Qué NO cambia en V2 (y por qué)

- `companias`, `ramos`, `subramos`: sin cambios (§6.1).
- `keywords`/`patrones_deteccion` como JSON: sin cambios (§6.3) — no normalizar sin una necesidad de analítica/peso/versionado que hoy no existe.
- El mecanismo de detección en cascada por score (`detector.py`): sin cambios — es un problema de algoritmo, no de esquema, y no fue parte del alcance pedido.
- `campos_extraidos`/`extraccion.datos_completos`: sin cambios — la duplicación deliberada ahí (snapshot desnormalizado + fila por campo con trazabilidad) sirve un propósito de lectura rápida distinto al de auditoría, y no comparte la causa raíz de §6.2 (no hay ambigüedad de "a qué campo se refiere" en esas tablas, solo redundancia de valor, que es un trade-off de lectura válido).

### 7.5 Costo de la migración (cualitativo, sin estimar tiempos)

- Requiere una migración de datos real (no solo `ALTER TABLE ADD COLUMN`): mover cada fila de `campos_globales` y cada fila de `campos_definidos` al nuevo catálogo unificado, deduplicando por `nombre` (los `campos_definidos` con el mismo `nombre` en distintos subramos deben colapsar a una sola fila de catálogo + N filas de asociación).
- Requiere re-apuntar cada `ReglaExtraccion.campo_id` existente al catálogo unificado, resolviendo primero cuáles reglas hoy solo tienen `nombre_campo` (las que apuntan a un campo global) y no tienen `campo_id` — para esas, hay que crear la asociación en el catálogo antes de poder llenar el FK.
- Es una migración de una sola vez, acotada (~292 subramos, un número finito y ya conocido de campos), no un cambio de arquitectura en caliente sobre un sistema con escritura concurrente pesada — el riesgo operativo de ejecutarla es bajo, pero sí exige validar exhaustivamente que ninguna regla quede sin `campo_id` resuelto antes de hacer el FK `NOT NULL`.
