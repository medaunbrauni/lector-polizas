# Lector de Pólizas

Plataforma multi-compañía para extracción inteligente de datos de pólizas PDF.
Detecta automáticamente la compañía, ramo y subramo, aplica reglas regex guardadas
y usa Claude AI como fallback para campos sin regla definida.

---

## Inicio rápido

### Opción A — Doble clic (recomendado)

Ejecuta **`iniciar.bat`** en la raíz del proyecto.  
Abre dos ventanas de consola (API y Web) y lanza Chrome automáticamente cuando ambos servidores están listos.

Para compilar el launcher como EXE independiente:
```bat
venv\Scripts\pip install pyinstaller
venv\Scripts\pyinstaller --onefile --name IniciarLectorPolizas iniciar.py
```

---

### Opción B — Manual

#### 1. Backend (API Python)

```bash
cd lector-polizas

# Crear entorno virtual
python -m venv venv

# Activar (Windows)
venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt

# Configurar Claude API (para extracción IA)
copy .env.example .env
# Editar .env y agregar tu ANTHROPIC_API_KEY

# Iniciar servidor (crea la BD y siembra catálogos automáticamente)
uvicorn api.main:app --reload --port 8000
```

- API: http://localhost:8000
- Documentación interactiva: http://localhost:8000/docs

### 2. Frontend (React)

```bash
cd web
npm install
npm run dev
```

- UI: http://localhost:5173

---

## Flujo de trabajo con PDFs nuevos

### Primer día (sin reglas):
1. Subir PDFs → el sistema detecta compañía/ramo/subramo por keywords
2. Claude AI extrae todos los campos automáticamente
3. Ver resultados en la tabla, revisar el detalle de cada póliza

### Día siguiente (construir reglas):
1. Ir a **Reglas** → seleccionar Compañía → Ramo → Subramo
2. Ver qué campos aún dependen de IA (sin regla)
3. Escribir el patrón regex, pegarlo texto del PDF real para probar
4. Guardar la regla → aplica automáticamente a todos los PDFs siguientes
5. Con el tiempo: 100% cobertura = sin dependencia de IA

---

## Arquitectura

```
PDF
 └─ extraer texto (pdfplumber)
     └─ detectar jerarquía (keywords en texto)
         Compañía → Ramo → Subramo
     └─ motor de reglas (regex de BD por campo)
         ├─ campos con regla → extracción directa ✓
         └─ campos sin regla → Claude Haiku (IA)
     └─ guardar historial con trazabilidad por campo
     └─ JSON normalizado → UI → Excel
```

---

## Módulos de la UI

| Pantalla | Descripción |
|---|---|
| **Extractor** | Sube PDFs, ve resultados con detalle por campo |
| **Historial** | Todos los PDFs procesados, stats por extracción |
| **Catálogos** | Árbol Compañía → Ramo → Subramo con % de cobertura |
| **Reglas** | Crear/probar/gestionar patrones regex por módulo |

---

## Compañías pre-cargadas

Quálitas · GNP Seguros · ANA Seguros · HDI Seguros ·
Banorte Seguros · Seguros El Potosí · Mapfre · AXA Seguros · Zurich · BBVA Seguros

Ramos: **Autos** · GMM · Vida · Daños

---

## Agregar nueva compañía / ramo / subramo

**Opción A — Desde la UI** (próximamente en Fase 2)

**Opción B — Editar el seed** (`api/seed/data.py`):
```python
# Agregar a COMPANIAS:
{"nombre": "Chubb", "keywords": ["chubb", "ace seguros"]}
```
Borrar `lector_polizas.db` y reiniciar el servidor para re-sembrar.

---

## Variables de entorno

```env
ANTHROPIC_API_KEY=sk-ant-...   # Requerida para campos sin regla definida
```

---

## Stack

| | Tecnología |
|---|---|
| API | Python 3.12+ · FastAPI · SQLAlchemy · SQLite |
| PDF | pdfplumber |
| IA | Anthropic Claude Haiku |
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS |
| Navegación | React Router v6 |
| Export | SheetJS (xlsx) |

---

## Roadmap

- [x] **Fase 1** — Infraestructura base: detección, motor de reglas, AI fallback, UI
- [ ] **Fase 2** — Constructor visual: seleccionar texto en PDF → generar regex automáticamente
- [ ] **Fase 3** — Dashboard de cobertura y pruebas en lote
- [ ] **Fase 4** — Exportación personalizable con plantillas
