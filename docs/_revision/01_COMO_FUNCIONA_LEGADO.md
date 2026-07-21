# 📋 Extractor de Pólizas Qualitas - Guía Completa

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                         │
│                   localhost:5173                            │
│  - Interfaz de usuario                                      │
│  - Drag & Drop de archivos PDF                             │
│  - Muestra datos extraídos                                  │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ POST /api/extraer_poliza_qualitas
                   │ (FormData con el PDF)
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│             PROXY VITE (vite.config.ts)                     │
│  Redirige /api/* → http://localhost:8000                    │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│               BACKEND (Python FastAPI)                      │
│                 localhost:8000                              │
│                                                             │
│  1. Recibe el PDF                                           │
│  2. Guarda como temp.pdf                                    │
│  3. Lee con PyMuPDF (fitz)                                  │
│  4. Extrae datos con regex                                  │
│  5. Devuelve JSON                                           │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Estructura del Proyecto

```
project/
├── api-python/                  # Backend Python
│   ├── app.py                   # API FastAPI (endpoints)
│   ├── poliza_qualitas.py       # Lógica de extracción
│   ├── main.py                  # Inicia el servidor
│   └── requirements.txt         # Dependencias Python
│
├── src/                         # Frontend React
│   ├── App.tsx                  # Componente principal
│   ├── main.tsx                 # Punto de entrada
│   └── index.css                # Estilos
│
├── vite.config.ts               # Config del proxy
├── package.json                 # Dependencias Node
└── tailwind.config.js           # Config de Tailwind
```

## 🔄 Flujo de Datos Detallado

### 1. Usuario sube PDF
```typescript
// src/App.tsx línea 40-50
const handleFileUpload = async (event) => {
  const file = event.target.files?.[0]
  const formData = new FormData()
  formData.append('file', file)

  // Envía al backend
  const response = await fetch('/api/extraer_poliza_qualitas', {
    method: 'POST',
    body: formData,
  })
}
```

### 2. Proxy redirige la petición
```typescript
// vite.config.ts línea 7-12
proxy: {
  '/api': {
    target: 'http://localhost:8000',  // Redirige aquí
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, '')
  }
}
```

### 3. Backend procesa el PDF
```python
# api-python/app.py línea 43-88
@app.post("/extraer_poliza_qualitas")
async def extraer_poliza_qualitas(file: UploadFile):
    # 1. Lee el contenido del archivo
    contenido = await file.read()

    # 2. Guarda temporalmente
    with open("temp.pdf", "wb") as f:
        f.write(contenido)

    # 3. Extrae el texto con PyMuPDF
    texto, paginas_dict = leer_pdf_completo("temp.pdf")

    # 4. Valida que sea una póliza Qualitas
    if not es_poliza_auto_qualitas(texto):
        return {"error": "No es una póliza Qualitas"}

    # 5. Extrae todos los datos
    informacion = {
        "Número de Póliza": extraer_numero_poliza_qualitas(texto),
        "RFC del Asegurado": extraer_rfc_mas_repetido(texto),
        # ... más campos
    }

    return informacion
```

### 4. Funciones de extracción
```python
# api-python/poliza_qualitas.py
def extraer_numero_poliza_qualitas(texto):
    # Busca el número de póliza con regex
    match = re.search(r'INCISO\s+(\d{7,15})', texto)
    if match:
        return match.group(1).strip()
    return "No encontrado"
```

## 🚀 Cómo Iniciar la Aplicación

### Opción 1: Inicio Manual

**Terminal 1 - Backend:**
```bash
cd api-python
export PATH="$HOME/.local/bin:$PATH"
python3 -m uvicorn app:app --host 0.0.0.0 --port 8000
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

### Opción 2: Modo Producción
```bash
npm run build
npm run preview
```

## 🔍 Debugging

### Ver logs de la API:
```bash
tail -f api-python/api.log
```

### Probar la API directamente:
```bash
curl http://localhost:8000/health
# Debe responder: {"status":"healthy"}
```

### Probar con un PDF:
```bash
curl -X POST http://localhost:8000/extraer_poliza_qualitas \
  -F 'file=@tu_poliza.pdf' \
  -H 'Content-Type: multipart/form-data'
```

## ⚙️ Configuración Importante

### CORS (api-python/app.py)
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # Permite todas las origins
    allow_credentials=True,
    allow_methods=["*"],      # Permite todos los métodos
    allow_headers=["*"],      # Permite todos los headers
)
```

### Proxy (vite.config.ts)
```typescript
server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, '')
    }
  }
}
```

## 📊 Datos que Extrae

La aplicación extrae 23 campos diferentes:
- Tipo de Póliza
- Número de Póliza
- RFC del Asegurado
- Fechas de Vigencia (inicio y fin)
- Montos (Prima Neta, IVA, Total, etc.)
- Datos del vehículo (Motor, Serie, Placas, etc.)
- Datos del cliente (Nombre, Dirección, CP, etc.)

## 🐛 Errores Comunes

1. **"Error al procesar el archivo"**
   - Verifica que la API esté corriendo: `curl http://localhost:8000/health`
   - Revisa los logs: `cat api-python/api.log`

2. **"El archivo no corresponde a una póliza Qualitas"**
   - El PDF no contiene la palabra "QUALITAS"
   - O no tiene las palabras clave de póliza de auto

3. **Proxy no funciona**
   - Verifica que el backend esté en puerto 8000
   - Reinicia el servidor de desarrollo: `npm run dev`
