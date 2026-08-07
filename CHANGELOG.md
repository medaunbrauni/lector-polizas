# Changelog

## 2026-07-16 (2) — Restricción de unicidad para reglas activas (`PLAN_REFACTOR.md`, ítem 🟡-4)

Se implementó **únicamente** el ítem "agregar índice único parcial en `reglas_extraccion`" de `PLAN_REFACTOR.md`. Ninguna otra tabla ni lógica de negocio se modificó.

- **Problema:** la invariante "una sola regla activa (no borrador) por campo por subramo" solo existía en el código de dos endpoints (`routers/reglas.py::crear_regla`, `routers/entrenamiento.py::guardar_regla`), no en el esquema — cualquier otro camino de escritura podía violarla sin que nada lo impidiera.
- **`api/database.py`**: nueva función `_create_regla_activa_constraint()`, llamada desde `init_db()`, que crea `CREATE UNIQUE INDEX IF NOT EXISTS idx_regla_activa_unica ON reglas_extraccion(subramo_id, nombre_campo) WHERE activo = 1 AND es_borrador = 0`. A diferencia de `_create_indexes()`, esta función **no** silencia excepciones — si en el futuro ya existieran duplicados, el arranque fallará de forma visible en vez de ocultar el problema.
- **`migrate_regla_activa_unica.py`** (nuevo, raíz del repo, mismo estilo que `migrate_reglas.py` ya existente): script de migración manual con `sqlite3` puro.
  - `python migrate_regla_activa_unica.py` — audita duplicados existentes (aborta con detalle si encuentra alguno) y crea el índice.
  - `python migrate_regla_activa_unica.py --rollback` — elimina el índice (`DROP INDEX IF EXISTS`), revirtiendo por completo.
- **Clave elegida:** `(subramo_id, nombre_campo)`, no `(subramo_id, campo_id)` — es la combinación que el código de negocio ya usa hoy para desactivar la regla anterior; `campo_id` es nullable y no es el mecanismo real que usa la aplicación (ver `MODELO_DATOS_V2.md` §5). No se cambió esa lógica, solo se reforzó en el esquema.

**Pruebas ejecutadas** (contra una copia de `lector_polizas.db`, no contra el original, hasta confirmar que todo pasaba):
1. Auditoría de duplicados existentes en la BD real → 0 encontrados, sobre 53 reglas totales.
2. Aplicar el índice contra la copia → sin error.
3. Intentar insertar una regla activa duplicada → rechazada con `IntegrityError: UNIQUE constraint failed`.
4. Simular el flujo real de `crear_regla` (desactivar la anterior + insertar la nueva) contra una BD limpia con el índice ya aplicado → funciona sin fricción, la regla anterior queda `activo=False` antes de que la nueva se inserte.
5. Rollback (`DROP INDEX`) → el índice desaparece y el mismo INSERT duplicado que antes fallaba ahora se acepta, confirmando reversión limpia.
6. `init_db()` completo contra `lector_polizas.db` (ya con el índice aplicado) → arranca sin error, idempotente.

Tras validar los 6 puntos, se aplicó la migración a `lector_polizas.db` real.

---

## 2026-07-16 — Refactors 🟢 bajo riesgo / alto beneficio (`PLAN_REFACTOR.md`)

Implementados los 7 refactors clasificados como 🟢 en `PLAN_REFACTOR.md`. Ningún endpoint, modelo de datos ni comportamiento observable de la API cambió — se verificó cada uno con pruebas puntuales (detalladas abajo) antes de darlo por cerrado.

### Seguridad

- **`api/routers/auth.py`**: la contraseña de login dejó de estar hardcodeada en el código (`PASSWORD = "Marsella14"`) y ahora se lee de la variable de entorno `AUTH_PASSWORD`, con el mismo valor como *default* si la variable no está configurada — por lo que el comportamiento no cambia en ningún ambiente existente que aún no la haya definido explícitamente.
  - Se agregó `AUTH_PASSWORD=Marsella14` a `.env` (no versionado) y `AUTH_PASSWORD=changeme` como placeholder en `.env.example`.
  - **Verificado:** flujo completo `login` (correcto/incorrecto) → `verify` → `logout` → `verify` produce exactamente los mismos códigos de estado (200/401) que antes del cambio.
  - **Pendiente fuera de este alcance** (ya señalado como riesgo 🔴 en `PLAN_REFACTOR.md`): la contraseña anterior quedó expuesta en el historial de git y debería rotarse como acción operativa; el almacenamiento de sesión sigue en memoria de proceso (no apto para multi-worker).

### Operación / instalación

- **`requirements.txt`**: se agregaron `watchdog>=6.0.0` y `pypdfium2>=5.11.0`, usados por `services/folder_watcher.py` y `routers/entrenamiento.py` respectivamente pero ausentes del archivo. Un `pip install -r requirements.txt` en un entorno limpio ya no falla al arrancar.

### Código muerto eliminado

- **`api/parsers/`** (paquete completo: `base.py`, `gnp.py`, `qualitas.py`, `ai_fallback.py`, `__init__.py`) — parsers hardcodeados por compañía sin ninguna referencia en el sistema activo (confirmado por grep en todo el repo antes de borrar). El motor de extracción real es 100% dirigido por `ReglaExtraccion` en BD.
- **`api/seed/_catalogo_generado.py`** — copia huérfana y divergente (~1200 líneas) del catálogo de aseguradoras. Solo `api/_catalogo_generado_ref.py` (el otro archivo, no tocado) está importado por `seed/data.py`; el borrado no afecta el seed real.

### Instrumentación de debug retirada del pipeline de producción

- **`api/services/extractor.py`**: se quitaron los `print()` de diagnóstico y la escritura de `debug_texto_poliza.txt` en cada extracción (se confirmó por grep que ningún otro módulo lee ese archivo). El valor de retorno de `procesar_pdf()` no cambió.
  - Nota: la instrumentación de debug en este archivo era una modificación local sin commitear (ya presente al iniciar esta sesión, según `git status` inicial); al retirarla, el archivo quedó **idéntico al último commit (`HEAD`)** — no introduce ningún cambio neto respecto a lo ya versionado.
- **`api/services/rule_engine.py`**: se quitaron los `print()` de diagnóstico de `aplicar_reglas()`, incluyendo una query adicional (`reglas_debug`) que solo se ejecutaba para imprimir y no aportaba al resultado — se eliminó también esa consulta redundante a la base de datos.
  - **Verificado:** `aplicar_reglas()` contra un escenario sintético (compañía/ramo/subramo en memoria, una regla de regex, un campo global con `valor_fijo`, un RFC de 13 caracteres) produce exactamente los mismos valores, métodos y `regla_id` que antes de la limpieza — incluida la derivación de `entidad`.
- **Fuera de alcance, sin tocar:** los `print()` de `api/routers/extraccion.py` no estaban incluidos en el ítem aprobado (`PLAN_REFACTOR.md` solo listaba `extractor.py` y `rule_engine.py` para este refactor) — se dejaron intactos para no exceder el alcance autorizado.

### Configuración de modelos de IA conectada

- **`api/services/batch_trainer.py`**: el modelo hardcodeado `"claude-opus-4-7"` ahora se lee de `config.MODEL_BATCH_TRAINER` (mismo valor por defecto — cambio sin efecto salvo que se configure la variable de entorno).
- **`api/routers/reglas.py`** (solo el endpoint `generar_patrones_deteccion`) y **`api/routers/catalogos.py`** (endpoint `generar_y_guardar_patrones`): el modelo hardcodeado `"claude-haiku-4-5-20251001"` ahora se lee de `config.MODEL_PATTERN_GEN` (mismo valor por defecto).
  - **Verificado:** se comparó cada valor por defecto en `config.py` contra el string hardcodeado exacto que reemplaza, confirmando igualdad antes de aplicar el cambio.
- **Deliberadamente sin tocar:** `reglas.py::generar_regex_con_ia` y `reglas.py::reintentar_regex` siguen hardcodeados a `"claude-haiku-4-5-20251001"`. La variable que semánticamente les correspondería (`MODEL_REGEX_IA`) tiene como *default* `"claude-opus-4-7"` — un valor **distinto** al hardcodeado actual. Conectarla habría cambiado el modelo real usado (haiku → opus), violando el requisito de "no cambiar comportamiento". Queda como el ítem 🟡 ya identificado en `PLAN_REFACTOR.md` (requiere decidir cuál modelo es el correcto para esos dos endpoints antes de tocar código).

### Duplicación de código eliminada

- **`api/routers/catalogos.py`**: se eliminaron las copias verbatim de `_es_vehiculo()` y `_ramo_de_subramo()` (idénticas a las de `rule_engine.py`); ahora se importan desde `api.services.rule_engine`.
  - **Verificado:** `catalogos._es_vehiculo` (ahora una re-exportación del original) produce los mismos resultados (`True` para "Vehículos", `False` para "Vida") que la copia eliminada.

---

### Resumen de pruebas ejecutadas antes de cerrar

1. Compilación (`py_compile`) de todos los módulos de `api/` — sin errores de sintaxis.
2. Import completo de `api.main` y de los 6 routers + 3 servicios tocados — sin `ImportError`.
3. `TestClient` contra la app completa: `POST /auth/login` (correcto e incorrecto), `GET /auth/verify`, `POST /auth/logout`, `GET /health` — mismos códigos de estado y payloads que el comportamiento documentado en la auditoría previa.
4. `aplicar_reglas()` contra una BD SQLite en memoria con datos sintéticos — mismos valores/métodos de salida para regla por regex, campo con `valor_fijo` y campo `derivado` (entidad ← RFC).
5. `cobertura_subramo()` — mismo cálculo de cobertura tras la limpieza de `rule_engine.py`.
6. Verificación por `inspect.getsource()` de que los 3 sitios conectados a `config.py` usan la variable esperada, y de que los 2 sitios deliberadamente no tocados conservan su string hardcodeado original.

### No incluido en este cambio (ver `PLAN_REFACTOR.md`)

Todo lo clasificado 🟡 (centralizar parseo de JSON de Claude, consolidar prompts de generación de patrones/regex, índice único en `reglas_extraccion`, resolver inconsistencia de `entidad`, endurecer manejo de tokens) y 🔴 (unificar catálogo de campos, sesión persistente multi-worker, fuente única del catálogo de aseguradoras) permanece sin implementar, tal como se pidió.
