# Lector de Pólizas

Extractor multi-compañía de datos de pólizas PDF para el mercado asegurador mexicano.

## Compañías soportadas

| Compañía | Parser específico | AI Fallback |
|---|:---:|:---:|
| Quálitas | ✓ | ✓ |
| GNP Seguros | ✓ | ✓ |
| ANA Seguros | — (próximo) | ✓ |
| HDI Seguros | — (próximo) | ✓ |
| Banorte Seguros | — (próximo) | ✓ |
| Seguros El Potosí | — (próximo) | ✓ |
| Cualquier otra | — | ✓ |

> El AI Fallback usa Claude (Anthropic) y funciona con cualquier compañía automáticamente.

---

## Inicio rápido

### Backend (API)

```bash
cd api

# Crear entorno virtual
python -m venv venv
venv\Scripts\activate       # Windows
source venv/bin/activate    # Mac/Linux

# Instalar dependencias
pip install -r ../requirements.txt

# Configurar API key de Anthropic (para el fallback IA)
copy ..\.env.example .env
# Editar .env y poner tu ANTHROPIC_API_KEY

# Iniciar servidor
uvicorn api.main:app --reload --port 8000
```

API disponible en: http://localhost:8000
Documentación: http://localhost:8000/docs

### Frontend (UI)

```bash
cd web
npm install
npm run dev
```

UI disponible en: http://localhost:5173

---

## Arquitectura

```
PDF → extraer texto (pdfplumber)
    → detectar compañía (keywords en texto)
    → parser específico (regex por compañía)  ← rápido, sin costo
    → si no se detecta: Claude AI fallback    ← funciona con cualquier PDF
    → JSON normalizado
    → UI: tabla + detalle + exportar Excel
```

### Agregar soporte para una nueva compañía

1. Crear `api/parsers/nueva_compania.py`:

```python
from .base import BaseParser
from ..models.poliza import PolizaExtraida

class NuevaCompaniaParser(BaseParser):
    KEYWORDS = ["nombre de la compañia", "variante 2"]

    def extraer(self, texto: str, nombre_archivo: str) -> PolizaExtraida:
        return PolizaExtraida(
            archivo=nombre_archivo,
            compania="Nueva Compañía",
            ramo="autos",
            # ... extraer campos con regex
        )
```

2. Registrar en `api/parsers/__init__.py`:

```python
from .nueva_compania import NuevaCompaniaParser

PARSERS = [
    QualitasParser(),
    GNPParser(),
    NuevaCompaniaParser(),  # ← agregar aquí
]
```

---

## Stack

| Capa | Tecnología |
|---|---|
| API | Python 3.12 + FastAPI |
| Parser PDF | pdfplumber |
| IA Fallback | Anthropic Claude Haiku |
| Frontend | React 18 + TypeScript + Vite |
| Estilos | Tailwind CSS |
| Export Excel | SheetJS (xlsx) |

---

## Variables de entorno

```env
ANTHROPIC_API_KEY=sk-ant-...   # Requerida solo para el AI fallback
```
