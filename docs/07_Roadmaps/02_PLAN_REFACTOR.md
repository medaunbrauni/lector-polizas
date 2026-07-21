# Plan de Refactors — Priorizado por Relación Beneficio/Riesgo

**Base:** `docs/06_Auditorias/03_AUDITORIA_TECNICA_CODIGO.md` (código) y `docs/08_Proyecto_Actual/01_MODELO_DATOS_V2.md` (esquema).
**Alcance de este documento:** priorización y análisis de riesgo. **Ningún refactor fue implementado.**

Criterio de clasificación: riesgo = probabilidad de romper comportamiento existente × dificultad de detectar la rotura (no hay suite de tests automatizada en el repo, así que todo riesgo aquí es más alto de lo que sería en un proyecto con cobertura de tests — se pondera con eso en mente).

---

## 🟢 Bajo riesgo — Alto impacto

Cambios mecánicos, sin ambigüedad de negocio, con efecto inmediato y fácil de verificar manualmente (probar 1-2 requests basta para confirmar que no rompió nada).

### 1. Sacar la contraseña hardcodeada a variable de entorno
- **Archivos afectados:** `api/routers/auth.py` (línea 8), `.env`, `.env.example`.
- **Complejidad:** Trivial — reemplazar el literal `PASSWORD = "Marsella14"` por `os.getenv("AUTH_PASSWORD")`.
- **Tiempo estimado:** 10-15 minutos.
- **Beneficios:** Elimina el hallazgo de seguridad más severo de la auditoría sin tocar el mecanismo de sesión. La contraseña deja de estar en el historial de git hacia adelante (el valor ya expuesto en commits pasados sigue comprometido y debería rotarse, pero eso es una acción operativa, no de código).
- **Efectos secundarios posibles:** Ninguno funcional. Requiere coordinar que la variable exista en el entorno de producción antes del deploy (si no, el login queda inutilizable) — es el único riesgo real, puramente operativo, no de código.

### 2. Completar `requirements.txt` (`watchdog`, `pypdfium2`)
- **Archivos afectados:** `requirements.txt`.
- **Complejidad:** Trivial — agregar dos líneas con las versiones ya instaladas en `venv/`.
- **Tiempo estimado:** 10 minutos (incluye verificar versión exacta instalada).
- **Beneficios:** Un `pip install -r requirements.txt` en un entorno limpio deja de fallar al arrancar (`folder_watcher.py` y `entrenamiento.py` importan estos paquetes directamente). Elimina un bloqueador silencioso para cualquier deploy nuevo o onboarding de otro desarrollador.
- **Efectos secundarios posibles:** Ninguno.

### 3. Eliminar el paquete `api/parsers/` (código muerto)
- **Archivos afectados:** `api/parsers/base.py`, `gnp.py`, `qualitas.py`, `ai_fallback.py`, `__init__.py` (eliminar los 5).
- **Complejidad:** Trivial — se confirmó por grep en toda la auditoría que ningún `router`/`service` activo los importa.
- **Tiempo estimado:** 15 minutos (borrar + confirmar que el arranque de la app y los imports de `main.py` no se ven afectados).
- **Beneficios:** Reduce superficie de código a mantener/leer; elimina la confusión de que exista un mecanismo de "parsers por compañía hardcodeados" que sugiere (incorrectamente) ser una alternativa viva al motor de reglas dinámico.
- **Efectos secundarios posibles:** Ninguno esperado. Único riesgo: que algún script suelto de la raíz (`check_reglas.py`, `migrate_reglas.py`) los importe fuera del paquete `api/` — verificar con un grep de todo el repo (no solo `api/`) antes de borrar, no solo dentro de `api/`.

### 4. Eliminar el archivo de catálogo huérfano
- **Archivos afectados:** `api/seed/_catalogo_generado.py` (el no usado — confirmado que nada lo importa; `seed/data.py` usa `api/_catalogo_generado_ref.py`).
- **Complejidad:** Trivial.
- **Tiempo estimado:** 10 minutos (borrar + grep de confirmación).
- **Beneficios:** Elimina ~1,200 líneas de datos duplicados y divergentes que hoy son una trampa para cualquiera que edite el archivo equivocado esperando que tenga efecto real.
- **Efectos secundarios posibles:** Ninguno funcional. Antes de borrar, vale la pena revisar si la diferencia real entre ambos archivos (el ramo "Producción Asociada" que solo existe en la copia huérfana) representa datos que en realidad **sí deberían** estar en el archivo activo — si es así, esto deja de ser un simple borrado y pasa a ser "fusionar el dato faltante y luego borrar el duplicado" (sigue siendo bajo riesgo, solo un poco más de tiempo).

### 5. Quitar instrumentación de debug del pipeline de producción
- **Archivos afectados:** `api/services/extractor.py` (prints + escritura de `debug_texto_poliza.txt` en cada request, línea ~179-199), `api/services/rule_engine.py` (prints extensos en `aplicar_reglas`, línea ~50-153).
- **Complejidad:** Baja — quitar los `print()` sueltos, o (mejor, sin perder observabilidad) convertirlos a `logging.debug(...)` estándar, que no cuesta nada si el nivel de log no está en DEBUG.
- **Tiempo estimado:** 30-45 minutos.
- **Beneficios:** Elimina I/O de disco innecesario por cada extracción (la escritura de `debug_texto_poliza.txt` sobrescribe el mismo archivo en cada request, sin ningún consumidor identificado de ese archivo en el resto del sistema), y limpia la salida de logs de la aplicación.
- **Efectos secundarios posibles:** Si alguien **sí** depende de `debug_texto_poliza.txt` para depuración manual activa hoy, perderá ese hábito — mitigable fácilmente ofreciendo el mismo contenido vía `logging.debug` o dejándolo condicionado a una variable de entorno (`DEBUG=1`).

### 6. Conectar `MODEL_BATCH_TRAINER` / `MODEL_PATTERN_GEN` / `MODEL_REGEX_IA` en sus llamadas reales
- **Archivos afectados:** `api/services/batch_trainer.py` (usa `"claude-opus-4-7"` hardcodeado), `api/routers/reglas.py` (3 endpoints con `"claude-haiku-4-5-20251001"` hardcodeado), `api/routers/catalogos.py` (1 endpoint igual).
- **Complejidad:** Baja — reemplazar el string literal por el import desde `api/config.py`. Los valores por defecto en `config.py` ya coinciden con los strings hardcodeados hoy, por lo que **el comportamiento no cambia** a menos que alguien configure la variable de entorno — es un cambio seguro por construcción.
- **Tiempo estimado:** 30 minutos (4 archivos, cambio de una línea cada uno + import).
- **Beneficios:** Las variables de entorno documentadas en `config.py` (con un comentario explícito de que existen para esto) empiezan a tener efecto real. Permite cambiar de modelo de IA para estos 3 flujos sin tocar código, como fue la intención original del diseño.
- **Efectos secundarios posibles:** Ninguno si no se toca el `.env` durante el cambio (el valor por defecto es idéntico al hardcodeado). El único riesgo es si en producción ya existe una variable de entorno con ese nombre puesta a un valor distinto por error/prueba pasada — vale la pena revisar el `.env` de producción antes de desplegar este cambio.

### 7. Extraer `_es_vehiculo()` / `_ramo_de_subramo()` duplicados a un solo lugar
- **Archivos afectados:** `api/services/rule_engine.py` (líneas 15-27, definición original) y `api/routers/catalogos.py` (líneas 282-293, copia verbatim) — consolidar en `rule_engine.py` y que `catalogos.py` importe de ahí.
- **Complejidad:** Baja — es una extracción mecánica de una función ya idéntica en ambos lugares, no hay lógica que reconciliar (no hay divergencia de comportamiento entre las dos copias).
- **Tiempo estimado:** 20 minutos.
- **Beneficios:** Un solo lugar para actualizar la lista `_VEHICULO_KW` si se agrega una palabra clave nueva (hoy hay que recordar tocar dos archivos).
- **Efectos secundarios posibles:** Ninguno — las dos copias son idénticas hoy, así que unificarlas no cambia ningún resultado.

---

## 🟡 Riesgo medio

Cambios que tocan lógica usada en producción (llamadas a IA, integridad de datos), donde un error de implementación es plausible y no siempre obvio a simple vista, pero el radio de impacto es acotado y reversible.

### 1. Centralizar las llamadas a Claude en `ai_utils.py` (parseo de JSON + creación de cliente)
- **Archivos afectados:** `api/routers/reglas.py` (3 endpoints: `generar-con-ia`, `generar-patrones-deteccion`, `reintentar-regex`), `api/routers/catalogos.py` (`generar-y-guardar-patrones`), `api/services/batch_trainer.py` (`generar_regex_lote`) — todos migrando a `ai_utils.parse_claude_json()` y `ai_utils.make_anthropic_client()`.
- **Complejidad:** Media. Mecánicamente es reemplazar el strip-manual-de-fences + `json.loads`/`json.JSONDecodeError` por la función centralizada, pero `batch_trainer.py` tiene una variante propia con un fallback adicional (`re.search(r'\{.*\}', ...)` cuando el primer `json.loads` falla) que `parse_claude_json` **no tiene** — hay que decidir si ese fallback se agrega a la función centralizada (beneficia a todos los call sites) o si se pierde (regresión silenciosa para ese caso límite específico).
- **Tiempo estimado:** 2-3 horas (incluye revisar los mensajes de error HTTP que cada endpoint devuelve hoy, para no cambiar el contrato de la API con el frontend).
- **Beneficios:** Un solo lugar para mejorar el manejo de respuestas mal formadas de Claude; elimina 4 copias de la misma lógica de 6-8 líneas.
- **Efectos secundarios posibles:** Los mensajes de error HTTP podrían cambiar de texto (cada endpoint hoy redacta su propio mensaje de excepción) — si el frontend hace algo con el texto del error más allá de mostrarlo, revisar `web/src/lib/api.ts` antes de tocar esto. Riesgo de perder el fallback de `batch_trainer.py` si no se migra con cuidado (ver arriba).

### 2. Consolidar los 4 prompts de "generar patrones de detección" en una sola función de servicio
- **Archivos afectados:** `api/services/extractor.py` (`_generar_y_guardar_patrones`), `api/services/clasificador_service.py` (`generar_patrones_ia`), `api/routers/catalogos.py` (`generar_y_guardar_patrones`), `api/routers/reglas.py` (`generar_patrones_deteccion`).
- **Complejidad:** Media-alta. No es solo mover código — hay que decidir **cuál de los 4 prompts (con redacciones ligeramente distintas) se queda como el canónico**, y validar que el cambio no degrade la calidad de los patrones que genera Claude para ninguno de los 4 flujos (extracción automática, clasificación automática, UI manual de catálogos, UI manual de reglas). Un prompt "consolidado" que funcione peor en alguno de los 4 contextos es un riesgo real, no solo teórico, porque el resultado (calidad de los regex generados) no es determinístico y es difícil de testear sin un corpus de PDFs de prueba.
- **Tiempo estimado:** 1-2 días (incluye probar contra una muestra representativa de PDFs de `storage/pdfs_entrenamiento/` para confirmar que la cobertura de patrones generados no empeora).
- **Beneficios:** Una sola redacción de prompt que mantener y mejorar; elimina el riesgo de que los 4 flujos diverjan más con el tiempo (ya divergieron una vez, ver el catálogo duplicado).
- **Efectos secundarios posibles:** Cambio de calidad/comportamiento de la generación de patrones en alguno de los 4 flujos si el prompt consolidado no es un superconjunto fiel de los 4 originales. Recomendado hacerlo con feature flag o A/B manual antes de retirar los prompts viejos.

### 3. Consolidar los 3 sitios de "generar regex de campo con IA"
- **Archivos afectados:** `api/routers/reglas.py` (`generar-con-ia`, `reintentar-regex`), `api/services/batch_trainer.py` (`generar_regex_lote`).
- **Complejidad:** Media — mismo tipo de riesgo que el punto anterior (prompts con propósito parecido pero no idéntico: uno genera desde una sola muestra, el otro desde N muestras del lote, el tercero es un "reintento más laxo" con instrucciones explícitas de flexibilizar). No son 3 copias idénticas como en el caso de `_es_vehiculo` — tienen diferencias de intención reales que hay que preservar en la función consolidada (posiblemente vía parámetros, no colapsando a un solo prompt fijo).
- **Tiempo estimado:** 1 día.
- **Beneficios:** Reduce a un solo lugar la lógica de "pedir regex a Claude + validar + probar contra texto", que hoy se repite con variaciones menores.
- **Efectos secundarios posibles:** Si se abstrae mal la diferencia entre "una muestra" vs. "N muestras del lote" vs. "reintento laxo", se puede terminar con una función con demasiados parámetros condicionales (el tipo de complejidad accidental que este mismo refactor buscaba evitar) — vigilar que la consolidación no se convierta en una abstracción prematura de un caso con 3 variantes reales.

### 4. Agregar índice único parcial en `reglas_extraccion` para "una sola regla activa por campo"
- **Archivos afectados:** `api/database.py` (`_create_indexes()`, agregar `CREATE UNIQUE INDEX ... WHERE activo=1 AND es_borrador=0`).
- **Complejidad:** Media — el cambio de esquema en sí es una línea (SQLite soporta índices únicos parciales), pero **antes de crearlo hay que auditar los datos existentes** en `lector_polizas.db`: si ya existe alguna violación (dos reglas activas para el mismo `subramo_id`+`nombre_campo` o `campo_id`, posible si algún `INSERT` no pasó por las rutas que hoy desactivan la regla anterior), la creación del índice fallará hasta limpiar esos datos.
- **Tiempo estimado:** 1-2 horas (incluye la consulta de auditoría previa de duplicados en la BD real).
- **Beneficios:** Cierra en el esquema una invariante que hoy solo vive en dos rutas de código (`routers/reglas.py::crear_regla`, `routers/entrenamiento.py::guardar_regla`) — cualquier futuro path de escritura queda protegido automáticamente sin tener que recordar replicar la lógica de desactivación.
- **Efectos secundarios posibles:** Si se encuentran violaciones existentes al auditar, hay que decidir manualmente cuál de las reglas duplicadas es la "correcta" antes de poder aplicar el índice — no es un riesgo de romper código, es trabajo de limpieza de datos previo obligatorio.

### 5. Resolver la duplicación/inconsistencia de derivación de `entidad` (RFC → Persona Física/Moral)
- **Archivos afectados:** `api/services/rule_engine.py` (líneas 134-147, produce `"0"`/`"1"`), `api/services/extractor.py` (`_derivar_campos`, líneas 135-173, produce `"Persona Física"`/`"Persona Moral"`), y potencialmente `api/seed/campos_globales.py` (la descripción del campo `entidad`, línea 11-12, documenta el formato de texto, no el numérico que realmente se está escribiendo hoy).
- **Complejidad:** Media, pero **no es solo técnica — requiere una decisión de negocio primero**: ¿el sistema de mesa de control (Sicas) que consume la exportación espera `"0"/"1"` (código numérico, como hoy efectivamente produce `rule_engine.py`, que es el que gana en la práctica) o `"Persona Física"/"Persona Moral"` (texto, como documenta el `CampoGlobal` y como produce el código de `extractor.py` que hoy queda muerto)? Sin confirmar esto contra el consumidor real de la exportación, cualquier "arreglo" puede estar corrigiendo el valor equivocado.
- **Tiempo estimado:** 30 minutos de código una vez resuelta la pregunta de negocio (probablemente 1-2 días de calendario esperando confirmación de qué espera Sicas, no de trabajo técnico).
- **Beneficios:** Elimina una duplicación donde hoy literalmente una de las dos implementaciones nunca se ejecuta con efecto (código muerto funcional, no solo redundante) — y cierra el riesgo de que un cambio futuro en el orden de llamadas invierta cuál de los dos formatos gana, silenciosamente.
- **Efectos secundarios posibles:** Si históricamente se exportaron pólizas con el formato "equivocado" (o si Sicas en realidad acepta ambos hoy por alguna tolerancia en su lado), fijar un único formato canónico podría requerir tocar también extracciones históricas o coordinarse con el equipo que opera Sicas — este es el ítem de este grupo con más dependencia externa al código.

### 6. Endurecer el manejo de tokens de sesión (expiración activa, limpieza) sin cambiar de mecanismo
- **Archivos afectados:** `api/routers/auth.py`.
- **Complejidad:** Media — agregar timestamp de expiración al token y limpiar el `set()` periódicamente (o al menos en cada `login`/`verify`) para que no crezca indefinidamente durante la vida del proceso.
- **Tiempo estimado:** 2-3 horas.
- **Beneficios:** Reduce (no elimina) el riesgo de que el `set()` en memoria crezca sin límite, y hace que la expiración de sesión sea real en el servidor (hoy solo la cookie del cliente expira; el servidor acepta el token indefinidamente hasta el próximo reinicio de proceso).
- **Efectos secundarios posibles:** Ninguno grave — es aditivo. **No resuelve** el problema de fondo de que el mecanismo no funciona con múltiples workers/réplicas (eso requiere el cambio de 🔴 más abajo); este ítem solo mejora el mecanismo actual dentro de sus límites de diseño de un solo proceso.

---

## 🔴 Riesgo alto

Cambios que implican migración real de datos, tocan múltiples capas del sistema simultáneamente, o dependen de decisiones de producto/infraestructura fuera del control exclusivo del código. Requieren plan de rollback explícito antes de intentarse.

### 1. Unificar `campos_globales` + `campos_definidos` en un catálogo único (`campo` + `subramo_campo`), propuesta de `docs/08_Proyecto_Actual/01_MODELO_DATOS_V2.md`
- **Archivos afectados:** `api/models/db_models.py` (nuevo modelo de tablas), `api/services/rule_engine.py` (`_globales_para_subramo`, `campos_sin_regla`, `cobertura_subramo` — todos razonan hoy sobre 2 tablas distintas), `api/routers/catalogos.py` (CRUD de campos), `api/routers/reglas.py` y `api/routers/entrenamiento.py` (todo lo que resuelve `nombre_campo` → campo), `api/seed/campos_globales.py` y `api/seed/data.py` (rehacer el seed contra el esquema nuevo), y cualquier vista del frontend que liste campos (`web/src/pages/Catalogos.tsx`, `web/src/pages/Reglas.tsx` probablemente).
- **Complejidad:** Alta. Requiere: (1) migración de datos con deduplicación real (los `CampoDefinido` con el mismo `nombre` en distintos subramos deben colapsar a una fila de catálogo), (2) resolver `campo_id` para las `ReglaExtraccion` existentes que hoy solo tienen `nombre_campo` poblado (las que apuntan a un campo global, que hoy no tiene FK), (3) reescribir toda la lógica de `rule_engine.py` que hoy distingue "global" vs. "definido" con dos queries distintas.
- **Tiempo estimado:** 3-5 días de desarrollo + al menos 1 día de validación exhaustiva contra una copia de la BD de producción antes de aplicar en real.
- **Beneficios:** Elimina la deuda técnica más profunda identificada en el análisis del modelo de datos — un solo lugar para definir y editar un campo, sin re-declaración por subramo, sin el riesgo de inconsistencia de labels/tipos entre subramos que hoy comparten el mismo campo conceptual.
- **Efectos secundarios posibles:** Es el refactor con mayor probabilidad de romper algo silenciosamente sin que se note de inmediato — si la migración de datos deja algún `CampoExtraido`/`ReglaExtraccion` histórico sin resolver correctamente a `campo_id`, esa regla simplemente dejaría de aplicarse en la próxima extracción sin ningún error visible (no hay tests que lo detecten). Requiere, como mínimo, correr el pipeline de extracción completo contra el corpus de `storage/pdfs_entrenamiento/` antes y después de la migración, comparando resultados campo por campo.

### 2. Migrar autenticación a almacenamiento de sesión persistente/compartido
- **Archivos afectados:** `api/routers/auth.py`, `api/main.py` (posible nueva dependencia de infraestructura: Redis, o una tabla nueva en la misma BD SQLite), `api/config.py`.
- **Complejidad:** Alta relativa al tamaño del sistema — no es complejo en abstracto (guardar tokens en una tabla en vez de un `set()` en memoria es sencillo), pero es alto riesgo porque **cambia el modelo de despliegue implícito** del sistema: hoy asume un solo proceso Python; introducir sesión compartida es la señal de que el sistema se está preparando para correr con más de un worker/réplica, lo cual tiene implicaciones más allá de `auth.py` (SQLite con `check_same_thread=False` y un solo archivo también es un techo para multi-proceso, ver `docs/08_Proyecto_Actual/01_MODELO_DATOS_V2.md` §5.3 de la auditoría de código).
- **Tiempo estimado:** 1-2 días de código; indeterminado el tiempo de decisión previa (depende de si ya hay un plan de escalar a múltiples workers/instancias o no).
- **Beneficios:** Solo tiene sentido si efectivamente se planea correr más de un worker o réplica — en ese escenario, es indispensable (hoy las sesiones simplemente no funcionarían de forma confiable en multi-worker).
- **Efectos secundarios posibles:** Es el ítem de este documento con mayor riesgo de ser una **optimización prematura** si el sistema seguirá corriendo como proceso único (como parece ser el caso hoy, dado el uso de PyInstaller/`.exe` para distribución local) — implementarlo sin necesidad real añade una dependencia de infraestructura (Redis) o una tabla más para resolver un problema que no existe todavía. Recomendado: no iniciar este refactor sin primero confirmar el plan de despliegue a futuro.

### 3. Consolidar el catálogo de aseguradoras en una única fuente de verdad (eliminar la dualidad seed-estático vs. API-en-caliente)
- **Archivos afectados:** `api/seed/data.py`, `api/_catalogo_generado_ref.py`, `api/routers/catalogos.py` (endpoints de alta de `Compania`/`Ramo`/`Subramo`), y el proceso externo (no versionado en el repo) que genera `_catalogo_generado_ref.py` a partir de "datos reales" (mencionado en su docstring, pero el proceso en sí no está en el código).
- **Complejidad:** Alta, pero de una naturaleza distinta a los dos anteriores: la complejidad técnica es baja (es decidir un solo camino de alta y dejar de correr el otro), pero **depende de una decisión de producto/proceso** que no se puede resolver solo leyendo el código — hay que saber si el archivo generado se sigue regenerando externamente de forma periódica (en cuyo caso el seed debe seguir siendo la fuente de verdad y la API debe dejar de permitir altas que ese proceso luego sobrescriba) o si ya se agotó su propósito inicial y de aquí en adelante el catálogo se gestiona 100% vía API/BD (en cuyo caso el seed debería correr una sola vez y luego eliminarse del arranque de la aplicación).
- **Tiempo estimado:** El código en sí, medio día. La decisión previa, indeterminada — depende de gente fuera del código (quién genera `_catalogo_generado_ref.py` y con qué frecuencia).
- **Beneficios:** Elimina la ambigüedad de "¿dónde se agrega una aseguradora nueva?" que hoy tiene dos respuestas válidas simultáneamente, y que es exactamente el tipo de duplicación de fuente de verdad que ya produjo el catálogo huérfano divergente (ítem 🟢-4).
- **Efectos secundarios posibles:** Si se elimina el seed automático del arranque sin confirmar que ya no se necesita, se pierde la capacidad de "resetear" el catálogo a un estado conocido en un ambiente nuevo (útil hoy para desarrollo/testing local) — y si se mantiene el seed pero se bloquea la API, se pierde la conveniencia actual de administrar el catálogo sin re-desplegar código.

---

## Resumen de orden de ejecución sugerido (solo por relación beneficio/riesgo, no implica compromiso de fechas)

1. Todo el bloque 🟢 puede hacerse en una sola sesión de trabajo (menos de un día en total) sin necesitar aprobación de negocio — son correcciones mecánicas y de higiene.
2. Dentro de 🟡, los ítems 1, 4 y 6 no requieren decisión de negocio previa y pueden planearse de inmediato; los ítems 2, 3 y 5 sí necesitan una validación previa (calidad de prompts probada contra corpus real, o confirmación del formato que espera Sicas) antes de tocar código.
3. Ningún ítem de 🔴 debería iniciarse sin, como mínimo: (a) un respaldo completo de `lector_polizas.db`, y (b) para el ítem 2 específicamente, confirmación de que existe (o no) un plan real de despliegue multi-worker — si no existe, ese ítem debería retirarse del roadmap en vez de implementarse "por si acaso".
