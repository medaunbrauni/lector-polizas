# 📋 Auditoría Integral — Lector de Pólizas
**Fecha:** 2026-05-26 | **Revisado por:** 3 agentes especializados (UI/UX · Backend · Escalabilidad)

---

## 🔴 HALLAZGOS CRÍTICOS (Bugs activos)

### BUG-1 — Triple conteo de campos no encontrados
**Archivo:** `api/services/extractor.py` · líneas 182–194  
**Archivo:** `api/routers/extraccion.py` · líneas 46–53 (reaplicar)

El contador `campos_no_encontrados` se incrementa **tres veces** para el mismo conjunto de campos, generando estadísticas completamente falsas. Si hay 5 campos sin regla, el sistema reporta 15.

```python
# ACTUAL (INCORRECTO)
for nombre, info in datos_reglas.items():
    if info["metodo"] == "regla": por_regla += 1
    else: no_encontrados += 1          # ← 1ª vez

for campo in campos_faltantes:
    no_encontrados += 1                # ← 2ª vez (campos distintos, OK)

no_encontrados += sum(1 for v in datos_reglas.values() if v["metodo"] != "regla")
# ↑ 3ª vez: DUPLICA exactamente el primer bloque

# CORRECTO
por_regla      = sum(1 for v in datos_reglas.values() if v["metodo"] == "regla")
no_encontrados = sum(1 for v in datos_reglas.values() if v["metodo"] != "regla") + len(campos_faltantes)
```

**Impacto:** Los chips "Regla (X)" / "No enc. (Y)" del historial son incorrectos. Afecta decisiones de entrenamiento.

---

### BUG-2 — Duplicación de campos: `numero_poliza` vs `documento`
**Archivo:** `api/seed/data.py` (CAMPOS_VEHICULOS, CAMPOS_AYE, CAMPOS_VIDA, CAMPOS_DANOS)  
**Archivo:** `api/seed/campos_globales.py` (campo `documento`)

El campo global `documento` (orden 11, requerido, descripción: "Número de póliza") es **idéntico** a `numero_poliza` que se define por separado en cada conjunto específico. Resultado: el mismo dato tiene dos nombres distintos según el subramo, rompiendo la consistencia de extracción y exportación.

| Campo global | Campo específico | Significado |
|---|---|---|
| `documento` | `numero_poliza` | Número de póliza ← **duplicado** |
| `desde` | `inicio_vigencia` | Fecha inicio vigencia ← **duplicado** |
| `hasta` | `fin_vigencia` | Fecha fin vigencia ← **duplicado** |
| `descripcion_veh` | `descripcion_vehiculo` | Descripción del vehículo ← **duplicado** |
| `serie` (global veh.) | `serie` (CAMPOS_VEHICULOS) | Número de serie ← **duplicado** |

---

### BUG-3 — N+1 queries en historial
**Archivo:** `api/routers/extraccion.py` · función `_extraccion_schema` líneas 176–181

Por cada extracción del historial se ejecutan **3 queries adicionales** (una por Compañía, Ramo, Subramo). Con 50 registros = 153 queries donde deberían ser 1.

```python
# ACTUAL: 3 queries por fila
def _export_name(id_val, model_cls, fallback):
    obj = db.query(model_cls).filter(model_cls.id == id_val).first()  # ← N+1
```

---

## 🟠 INCONSISTENCIAS DE CAMPOS (Modelo de datos)

### Mapa completo de duplicados y conflictos

| Concepto | Campo global | Vehículos | AYE | Vida | Daños | Fianzas |
|---|---|---|---|---|---|---|
| N° documento | `documento` | `numero_poliza` | `numero_poliza` | `numero_poliza` | `numero_poliza` | `numero_fianza` |
| Nombre cliente | `nombre`+`razon_social` | `nombre_cliente` | `nombre_cliente` | `nombre_cliente` | `nombre_cliente` | `afianzado` |
| Inicio vigencia | `desde` | `inicio_vigencia` | `inicio_vigencia` | `inicio_vigencia` | `inicio_vigencia` | `inicio_vigencia` |
| Fin vigencia | `hasta` | `fin_vigencia` | `fin_vigencia` | `fin_vigencia` | `fin_vigencia` | `fin_vigencia` |
| Desc. vehículo | `descripcion_veh` | `descripcion_vehiculo` | — | — | — | — |
| N° serie | `serie` (global veh.) | `serie` | — | — | — | — |
| Derechos/gastos | `derechos` | `gastos_expedicion` | — | — | — | — |

### Campos en Excel que NO se muestran en UI
La tabla del Extractor muestra **9 columnas**, el Excel exporta **26**. Campos invisibles en UI pero exportados:
`RFC`, `Forma Pago`, `Moneda`, `Serie`, `Motor`, `Descripción Vehículo`, `Prima Neta`, `Gastos Expedición`, `Subtotal`, `IVA`, `Colonia`, `Municipio`, `CP`, `Estado`

---

## 📐 PLAN DE IMPLEMENTACIÓN PRIORIZADO

---

### FASE 1 — Correcciones urgentes (1–2 días)
> Sin código nuevo, solo correcciones de bugs existentes

#### 1.1 Corregir contador de campos (BUG-1)
**Archivos:** `api/services/extractor.py`, `api/routers/extraccion.py`

```python
# Reemplazar el bloque de conteo en procesar_pdf() y reaplicar_con_subramo():
por_regla      = sum(1 for v in datos_reglas.values() if v["metodo"] == "regla")
no_encontrados = (
    sum(1 for v in datos_reglas.values() if v["metodo"] != "regla")
    + len(campos_faltantes)
)
# Luego construir datos_finales sin alterar los contadores
```

#### 1.2 Agregar índices a la BD (BUG-3 prevención)
**Archivo:** `api/database.py` — agregar a `_migrate_add_columns()` o como migración nueva:

```sql
CREATE INDEX IF NOT EXISTS idx_extraccion_subramo  ON extracciones(subramo_id);
CREATE INDEX IF NOT EXISTS idx_extraccion_created  ON extracciones(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_regla_subramo       ON reglas_extraccion(subramo_id, activo);
CREATE INDEX IF NOT EXISTS idx_campo_ext_extraccion ON campos_extraidos(extraccion_id);
CREATE INDEX IF NOT EXISTS idx_poliza_subramo      ON polizas_entrenamiento(subramo_id);
```

#### 1.3 Corregir N+1 en historial (BUG-3)
**Archivo:** `api/routers/extraccion.py`

```python
# En historial(), cargar nombres de una sola vez con join:
from sqlalchemy.orm import joinedload

items = (
    db.query(Extraccion)
    .options(
        joinedload(Extraccion.compania_rel),
        joinedload(Extraccion.ramo_rel),
        joinedload(Extraccion.subramo_rel),
    )
    .order_by(Extraccion.created_at.desc())
    .offset(skip).limit(limit)
    .all()
)
# Requiere agregar relationships en Extraccion model:
# compania_rel = relationship("Compania", foreign_keys=[compania_id])
```

#### 1.4 Limitar tamaño de uploads y cantidad de archivos
**Archivo:** `api/routers/extraccion.py`

```python
MAX_FILES   = 50
MAX_MB      = 10

@router.post("")
async def extraer_polizas(files: list[UploadFile] = File(...), ...):
    if len(files) > MAX_FILES:
        raise HTTPException(400, f"Máximo {MAX_FILES} archivos por solicitud")
    for archivo in files:
        if archivo.size and archivo.size > MAX_MB * 1024 * 1024:
            raise HTTPException(400, f"{archivo.filename}: excede {MAX_MB} MB")
```

---

### FASE 2 — Normalización de campos (2–3 días)
> El cambio más impactante para consistencia de datos

#### 2.1 Unificar nombres de campos — Decisión de nomenclatura

Adoptar los campos **globales** como fuente de verdad y eliminar duplicados en los conjuntos específicos:

| Eliminar de específicos | Reemplazar por global |
|---|---|
| `numero_poliza` | `documento` |
| `inicio_vigencia` | `desde` |
| `fin_vigencia` | `hasta` |
| `descripcion_vehiculo` | `descripcion_veh` |
| `nombre_cliente` | (mantener como alias para usuarios, mapear a `nombre`+`razon_social`) |
| `gastos_expedicion` | `derechos` |

> **Nota:** `nombre_cliente` es un caso especial. Los globales separan en `apellido_paterno`, `apellido_materno`, `nombre`, `razon_social`. La solución más práctica es mantener `nombre_cliente` como campo de captura libre (texto completo) y mapear manualmente si se necesita el desglose. **No eliminar**, solo documentar la relación.

**Archivos a modificar:**
- `api/seed/data.py` — reescribir `CAMPOS_VEHICULOS`, `CAMPOS_AYE`, `CAMPOS_VIDA`, `CAMPOS_DANOS`
- `api/seed/campos_globales.py` — sin cambios (es la fuente de verdad)

#### 2.2 Migración de datos existentes

Dado que ya hay reglas entrenadas con los nombres viejos (`numero_poliza`, `inicio_vigencia`, etc.) necesitas una migración:

```sql
-- Actualizar reglas existentes
UPDATE reglas_extraccion SET nombre_campo = 'documento'    WHERE nombre_campo = 'numero_poliza';
UPDATE reglas_extraccion SET nombre_campo = 'desde'        WHERE nombre_campo = 'inicio_vigencia';
UPDATE reglas_extraccion SET nombre_campo = 'hasta'        WHERE nombre_campo = 'fin_vigencia';
UPDATE reglas_extraccion SET nombre_campo = 'descripcion_veh' WHERE nombre_campo = 'descripcion_vehiculo';
UPDATE reglas_extraccion SET nombre_campo = 'derechos'     WHERE nombre_campo = 'gastos_expedicion';

-- Actualizar selecciones de entrenamiento
UPDATE selecciones_campo SET nombre_campo = 'documento'    WHERE nombre_campo = 'numero_poliza';
-- (mismo patrón para el resto)

-- Actualizar campos extraídos en historial
UPDATE campos_extraidos SET nombre_campo = 'documento'    WHERE nombre_campo = 'numero_poliza';
-- (mismo patrón)
```

#### 2.3 Crear tabla central de labels en frontend
**Archivo nuevo:** `web/src/lib/fieldConfig.ts`

```typescript
export const FIELD_LABELS: Record<string, string> = {
  // Identificación
  documento:        'N. Póliza',
  agente:           'Agente',
  rfc:              'R.F.C.',
  grupo:            'Grupo',

  // Cliente
  nombre:           'Nombre',
  apellido_paterno: 'Apellido Paterno',
  apellido_materno: 'Apellido Materno',
  razon_social:     'Razón Social',
  nombre_cliente:   'Cliente',    // campo legacy, mantener

  // Vigencia
  desde:            'Inicio Vigencia',
  hasta:            'Fin Vigencia',

  // Financiero
  prima_neta:       'Prima Neta',
  descuento:        'Descuento',
  recargos:         'Recargos',
  derechos:         'Gastos Expedición',
  sub_total:        'Subtotal',
  iva:              'IVA',
  prima_total:      'Prima Total',

  // Vehículo
  placas:           'Placas',
  serie:            'N. Serie',
  motor:            'N. Motor',
  modelo:           'Modelo (año)',
  descripcion_veh:  'Descripción Vehículo',
  tipo_vehiculo:    'Tipo Vehículo',

  // Dirección
  colonia:          'Colonia',
  municipio:        'Municipio',
  cp:               'C.P.',
  estado:           'Estado',

  // GMM / AYE
  nombre_asegurado: 'Asegurado',
  suma_asegurada:   'Suma Asegurada',
  deducible:        'Deducible',
  coaseguro:        'Coaseguro',
  fecha_nacimiento: 'Fecha Nacimiento',

  // Vida
  beneficiarios:    'Beneficiarios',

  // Daños
  objeto_asegurado: 'Objeto Asegurado',

  // Fianzas
  numero_fianza:    'N. Fianza',
  afianzado:        'Afianzado',
  beneficiario:     'Beneficiario',
  monto_afianzado:  'Monto Afianzado',
};

/** Columnas de la tabla resumen en Extractor (en orden) */
export const TABLA_RESUMEN_COLS: Array<keyof typeof FIELD_LABELS> = [
  'documento', 'nombre_cliente', 'desde', 'hasta', 'placas', 'prima_total',
];

/** Columnas del Excel de exportación (en orden) */
export const EXCEL_COLS: Array<keyof typeof FIELD_LABELS> = [
  'documento', 'nombre_cliente', 'rfc', 'forma_pago', 'moneda',
  'desde', 'hasta',
  'placas', 'serie', 'motor', 'descripcion_veh', 'tipo_vehiculo',
  'prima_neta', 'derechos', 'sub_total', 'iva', 'prima_total',
  'colonia', 'municipio', 'cp', 'estado',
];
```

#### 2.4 Unificar acceso en LectorPolizas + PolizaDetalle
Reemplazar strings hardcodeados (`r.campos?.numero_poliza?.valor`) por:
```typescript
import { FIELD_LABELS } from '../lib/fieldConfig';
// Acceso uniforme: r.campos?.[campo]?.valor
```

---

### FASE 3 — Mejoras de UI (2–3 días)

#### 3.1 Sincronizar tabla UI con Excel exportado
**Archivo:** `web/src/pages/LectorPolizas.tsx`

Agregar columnas faltantes a la tabla con scroll horizontal. Propuesta de columnas visibles por defecto:

| Columna | Campo | Tipo |
|---|---|---|
| Archivo | — | texto |
| Compañía / Detección | — | badge |
| N. Póliza | `documento` | mono |
| Cliente | `nombre_cliente` | texto |
| Placas | `placas` | mono |
| Vigencia | `desde` – `hasta` | texto |
| Prima Total | `prima_total` | moneda |
| Est. | `estado` | badge |
| — | — | acciones |

Añadir botón **"+ columnas"** para revelar: RFC, Forma Pago, Dirección, desglose de primas.

#### 3.2 Corregir texto del panel de corrección
**Archivo:** `web/src/pages/LectorPolizas.tsx` · línea ≈ 527

```tsx
// Antes:
"Selecciona el módulo correcto para..."
// Después:
"Esta póliza no se clasificó correctamente. Selecciona la compañía, ramo y subramo para re-extraer los campos."
```

#### 3.3 Mostrar alias de exportación en tabla
**Archivo:** `web/src/pages/LectorPolizas.tsx`

El campo `nombre_exportacion` (configurado en Catálogos) debe mostrarse en la columna Compañía de la tabla:
```tsx
// El backend ya lo resuelve en _extraccion_schema con _export_name()
// Solo hace falta pasar el alias al resultado y mostrarlo
```

#### 3.4 Tooltips para confianza y scores
Agregar atributo `title` o componente Tooltip en el badge de confianza:
```tsx
<span title="Confianza = suma de patrones regex que coincidieron. Alta: ≥9 pts. Media: ≥3 pts. Baja: <3 pts.">
  {confCfg.icon} {confCfg.label} · {det.score_compania}+{det.score_ramo}+{det.score_subramo} pts
</span>
```

#### 3.5 Jerarquizar alertas
Mostrar máximo 1 alerta del nivel más crítico primero, con contador de los demás:
```tsx
// Prioridad: error > sin compañía > sin subramo > confianza baja > patrones generados
```

#### 3.6 Endpoint de cobertura de campos por subramo
**Archivo:** `api/routers/catalogos.py`
Agregar `GET /catalogos/subramos/{id}/cobertura-campos` que devuelva:
```json
{
  "total_campos": 18,
  "con_regla_activa": 11,
  "sin_regla": 7,
  "campos_sin_regla": ["placas", "serie", "motor", "..."]
}
```
Esto permite mostrar en la corrección manual qué subramos tienen cobertura alta/baja.

---

### FASE 4 — Robustez backend (1–2 días)

#### 4.1 Extraer parser JSON de Claude a función compartida
**Archivo nuevo:** `api/services/ai_utils.py`

```python
import json, re

def parse_claude_json(raw: str) -> dict:
    """Extrae JSON de respuesta de Claude (con o sin fences markdown)."""
    raw = raw.strip()
    # Remover ```json ... ``` o ``` ... ```
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    return json.loads(raw)
```

Reemplazar las 5 implementaciones duplicadas en: `extractor.py`, `catalogos.py`, `reglas.py` (x2), `batch_trainer.py`.

#### 4.2 Centralizar extracción de texto PDF
**Archivo:** `api/services/extractor.py`

La función `extraer_texto_pdf()` ya existe y es correcta. Las otras 2 implementaciones en `entrenamiento.py` y `batch_trainer.py` deben importarla de aquí.

#### 4.3 Sacar modelos de IA a variables de entorno
**Archivo:** `.env` + `api/config.py`

```python
# config.py
MODEL_EXTRACTOR     = os.getenv("MODEL_EXTRACTOR",    "claude-haiku-4-5-20251001")
MODEL_BATCH_TRAINER = os.getenv("MODEL_BATCH_TRAINER", "claude-opus-4-7")
MODEL_PATTERN_GEN   = os.getenv("MODEL_PATTERN_GEN",  "claude-haiku-4-5-20251001")
```

#### 4.4 Rate limiting básico en endpoints de IA
**Archivo:** `api/routers/extraccion.py`, `api/routers/reglas.py`

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/generar-con-ia")
@limiter.limit("10/minute")   # Máximo 10 generaciones/min por IP
async def generar_regex_ia(...):
    ...
```

#### 4.5 Restringir CORS
**Archivo:** `api/main.py`

```python
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,   # No más "*"
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)
```

---

### FASE 5 — Escalabilidad (3–5 días, cuando se requiera multi-usuario)

#### 5.1 Habilitar WAL en SQLite (mejora inmediata, sin migrar)
**Archivo:** `api/database.py`

```python
from sqlalchemy import event

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA cache_size=10000")
    cursor.close()
```

#### 5.2 Reemplazar migraciones manuales con Alembic
```bash
pip install alembic
alembic init alembic
# Convertir _migrate_add_columns() a versiones de Alembic
```

#### 5.3 Migrar a PostgreSQL (cuando BD supere 100 MB o haya concurrencia)
- Instalar PostgreSQL
- Cambiar `DATABASE_URL` en `.env`
- Habilitar `asyncpg` para queries async
- SQLAlchemy soporta el cambio sin modificar modelos

#### 5.4 Cola de procesamiento asíncrono (cuando haya > 20 PDFs/día)
- Celery + Redis para procesar PDFs en background
- `/extraer` devuelve `{ job_id }` inmediatamente
- Frontend polls `/extraer/status/{job_id}` o usa WebSocket

#### 5.5 Logging centralizado
```python
# api/main.py
import logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s %(message)s',
)
# Opcional: Sentry para alertas en producción
```

---

## 📊 RESUMEN EJECUTIVO

### Impacto por área

| Área | Problemas críticos | Problemas medios | Mejoras |
|---|---|---|---|
| **Datos** | 2 (duplicados, bug conteo) | 4 (nomenclatura) | 1 (tabla labels) |
| **Backend** | 1 (N+1 queries) | 3 (duplicación código, CORS, rate limit) | 2 |
| **UI/UX** | 0 | 3 (Excel vs tabla, corrección, tooltips) | 5 |
| **Escalabilidad** | 0 (actual) | 3 (sin WAL, sin límites upload, sin índices) | 4 |

### Orden recomendado de implementación

```
Semana 1:  FASE 1 (bugs) + FASE 4.3 (modelos env) + FASE 4.5 (CORS)
Semana 2:  FASE 2 (normalización campos) — la más impactante
Semana 3:  FASE 3 (UI) + FASE 4.1–4.2 (deduplicar código)
Semana 4:  FASE 4.4 (rate limit) + FASE 5.1–5.2 (WAL + Alembic)
Mes 2+:    FASE 5.3–5.5 (PostgreSQL, cola, logging)
```

### Effort total estimado

| Fase | Días | Responsable | Prioridad |
|---|---|---|---|
| 1 — Bugs críticos | 1–2 | Backend | 🔴 Urgente |
| 2 — Normalización campos | 2–3 | Full-stack | 🔴 Alta |
| 3 — UI/UX | 2–3 | Frontend | 🟠 Alta |
| 4 — Robustez backend | 1–2 | Backend | 🟡 Media |
| 5 — Escalabilidad | 3–5 | Backend/DevOps | 🟢 Planificar |
| **Total** | **9–15 días** | | |

---

## 🗂️ ARCHIVOS A MODIFICAR

| Archivo | Cambios | Fase |
|---|---|---|
| `api/services/extractor.py` | Corregir triple conteo, importar extraer_texto_pdf centralizado | 1, 4 |
| `api/routers/extraccion.py` | Corregir triple conteo en reaplicar, límites upload, joinedload | 1, 3, 4 |
| `api/database.py` | Índices, WAL pragma | 1, 5 |
| `api/models/db_models.py` | Relationships para joinedload | 1 |
| `api/seed/data.py` | Eliminar campos duplicados de específicos | 2 |
| `api/seed/campos_globales.py` | Mantener como fuente de verdad | 2 |
| `api/main.py` | CORS restrictivo, logging | 4, 5 |
| `api/config.py` | Variables modelos IA | 4 |
| `api/services/ai_utils.py` | **NUEVO** — parse_claude_json compartido | 4 |
| `api/routers/catalogos.py` | Endpoint cobertura campos | 3 |
| `web/src/lib/fieldConfig.ts` | **NUEVO** — tabla central de labels | 2 |
| `web/src/pages/LectorPolizas.tsx` | Texto corrección, columnas tabla, tooltips | 3 |
| `web/src/pages/PolizaDetalle.tsx` (o similar) | Usar fieldConfig | 2 |
| Migración SQL | Renombrar campos en reglas/historial existentes | 2 |
