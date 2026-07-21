# Plan de Acción — Lector de Pólizas

**Última actualización:** 2026-05-20
**Equipo:** Project Manager + Programador (con Claude Code)

---

## Contexto del proyecto

Plataforma multi-compañía para extracción inteligente de datos de pólizas PDF.
Detecta automáticamente la compañía, ramo y subramo, aplica reglas regex guardadas
y usa Claude AI como fallback para campos sin regla definida.

### Integración con MOVI

Este módulo se integra a **MOVI** (plataforma de gestión empresarial) como un microservicio externo.
El canal ya existe y funciona: MOVI llama al lector via una Edge Function de Supabase cada vez
que un usuario sube una póliza. El trabajo es robustecer el lector para soportar todas las compañías
y ramos, no solo Quálitas Autos.

```
Usuario sube PDF en MOVI (EntregaPolizas)
    │
    ▼
Edge Function: lector-qualitas-proxy (→ lector-polizas-proxy en v2)
    │
    ▼
API externa: lector-polizas en Render
    │  auto-detecta compañía/ramo
    │  aplica reglas regex guardadas
    │  usa Claude AI para campos sin regla
    ▼
Datos extraídos → guardados en Supabase (MOVI)
    │
    ▼
Fin del día: Excel automático → correo a mesa de control
```

### Estrategia de versiones

```
Render (servidor externo)
├── lector-polizas-qua.onrender.com  ← v1 activa (Quálitas Autos)
└── lector-polizas.onrender.com      ← v2 en desarrollo (multi-compañía)

Actualizar: deploya nueva versión → actualiza URL en Edge Function de MOVI → listo.
Todo el desarrollo ocurre en este repo, fuera del codebase de MOVI.
```

---

## Roles

| Rol | Responsabilidades |
|---|---|
| **Project Manager (PM)** | Define requisitos, provee PDFs de prueba, valida resultados, coordina con mesa de control, puede hacer cambios de contenido/configuración con Claude Code |
| **Programador (DEV)** | Desarrolla código nuevo, pruebas, bugs, parsers, endpoints, despliegue — con Claude Code |

---

## Fase 0 — Setup y diagnóstico
**Semana 1**

| Tarea | Quién | Estado |
|---|---|---|
| Levantar el nuevo lector localmente | DEV | ⬜ Pendiente |
| Mapear diferencias de formato entre v1 y v2 | DEV | ⬜ Pendiente |
| Conseguir 2 PDFs por compañía y ramo para pruebas | PM | ⬜ Pendiente |
| Definir campos exactos que necesita mesa de control para el reporte | PM | ⬜ Pendiente |

---

## Fase 1 — Robustecer el lector
**Semanas 2–4**

*El lector debe ser confiable antes de reemplazar v1 en MOVI.*

### DEV

| Tarea | Estado |
|---|---|
| Completar parsers: ANA, HDI, Banorte, El Potosí | ⬜ Pendiente |
| Crear endpoint general `/extraer_poliza` (auto-detecta compañía) | ⬜ Pendiente |
| Alinear formato de respuesta con `ExtractedPolizaData` de MOVI + agregar `compania`, `ramo`, `subramo` | ⬜ Pendiente |
| Agregar soporte de campos para GMM y Vida (distintos a Autos) | ⬜ Pendiente |
| Manejo de errores: PDFs escaneados, ilegibles, compañía no reconocida | ⬜ Pendiente |
| Suite de pruebas automáticas con PDFs reales | ⬜ Pendiente |

### PM

| Tarea | Estado |
|---|---|
| Documentar campos críticos por ramo (¿qué necesita mesa de control de un GMM vs un Auto?) | ⬜ Pendiente |
| Validar resultados del lector con PDFs reales — reportar errores al DEV | ⬜ Pendiente |
| Priorizar las 4 compañías más usadas por los vendedores | ⬜ Pendiente |

---

## Fase 2 — Interfaz de entrenamiento (Constructor visual)
**Semanas 4–6**

*Herramienta interna para que PM y DEV puedan "entrenar" el lector sin escribir código:
suben un PDF, seleccionan texto con el mouse, lo asignan a un campo, Claude sugiere el
patrón regex, se guarda la regla. Con más reglas = menos dependencia de IA = más rápido y barato.*

```
┌─────────────────────────────────────────────────────┐
│  ENTRENAMIENTO DE REGLAS                             │
│                                                      │
│  Compañía: [HDI ▼]  Ramo: [Autos ▼]                 │
│                                                      │
│  ┌──── PDF renderizado ──────┐  ┌── Campos ───────┐  │
│  │                           │  │ Nº Póliza   ✓  │  │
│  │  ...texto del PDF...      │  │ RFC         ✓  │  │
│  │  [texto seleccionado]     │  │ Dirección   ✗  │  │
│  │  ...                      │  │ Prima Total ✗  │  │
│  │                           │  │                │  │
│  └───────────────────────────┘  │ [Asignar a ▼] │  │
│                                  └────────────────┘  │
│  1. Selecciona texto en el PDF                       │
│  2. Elige el campo del menú                          │
│  3. Claude sugiere el patrón regex                   │
│  4. Prueba contra más PDFs                           │
│  5. Guarda → aplica a todos los PDFs futuros         │
└─────────────────────────────────────────────────────┘
```

### DEV

| Tarea | Estado |
|---|---|
| Endpoint `POST /api/pdf/preview` — devuelve texto extraído con posiciones | ⬜ Pendiente |
| Renderizar PDF en browser (PDF.js) | ⬜ Pendiente |
| Componente de selección de texto sobre el PDF renderizado | ⬜ Pendiente |
| Auto-suggest de regex con Claude al seleccionar texto + campo | ⬜ Pendiente |
| Prueba de regla en tiempo real contra múltiples PDFs | ⬜ Pendiente |
| Indicador de cobertura por campo (con regla ✓ / sin regla / dependiente de IA) | ⬜ Pendiente |

### PM

| Tarea | Estado |
|---|---|
| Definir UX del flujo de entrenamiento con DEV | ⬜ Pendiente |
| Criterios de aceptación: ¿qué debe hacer la interfaz para considerarse lista? | ⬜ Pendiente |

---

## Fase 3 — Integración con MOVI (actualizar v1 → v2)
**Semanas 7–8**

### DEV

| Tarea | Estado |
|---|---|
| Desplegar nueva versión del lector en Render como `v2` | ⬜ Pendiente |
| Crear Edge Function `lector-polizas-proxy` en MOVI (reemplaza `lector-qualitas-proxy`) | ⬜ Pendiente |
| Actualizar `ExtractedPolizaData` en MOVI para soportar múltiples ramos | ⬜ Pendiente |
| Actualizar `EntregaPolizas.tsx` para usar nuevo proxy y mostrar compañía/ramo | ⬜ Pendiente |
| Prueba paralela: correr v1 y v2 con los mismos PDFs, comparar resultados | ⬜ Pendiente |

### PM

| Tarea | Estado |
|---|---|
| Coordinar prueba piloto con 2-3 vendedores reales | ⬜ Pendiente |
| Validar con mesa de control que los datos que llegan son suficientes | ⬜ Pendiente |

---

## Fase 4 — Reporte de fin de día
**Semana 9**

### DEV

| Tarea | Estado |
|---|---|
| Crear tabla en Supabase: `polizas_entregadas_extraccion` (datos extraídos + vendedor + fecha) | ⬜ Pendiente |
| Guardar cada extracción exitosa en esa tabla desde `EntregaPolizas.tsx` | ⬜ Pendiente |
| Edge Function programada: genera Excel del día y lo envía por correo (Resend) | ⬜ Pendiente |
| Endpoint de descarga del reporte en MOVI | ⬜ Pendiente |

### PM

| Tarea | Estado |
|---|---|
| Confirmar hora del envío automático y correos destinatarios (mesa de control) | ⬜ Pendiente |
| Aprobar formato y columnas del Excel con mesa de control | ⬜ Pendiente |

---

## Fase 5 — Mejoras continuas (post-lanzamiento)

| Tarea | Quién | Estado |
|---|---|---|
| Dashboard de cobertura por compañía/ramo | DEV | ⬜ Pendiente |
| Procesamiento en lote (ZIP con múltiples PDFs) | DEV | ⬜ Pendiente |
| Exportación personalizable con plantillas | PM + DEV | ⬜ Pendiente |
| Soporte para nuevas compañías | PM define → DEV implementa | ⬜ Pendiente |

---

## Criterios de lanzamiento a producción

- [ ] Las 4 compañías prioritarias extraen correctamente los campos críticos (definidos por PM)
- [ ] El proceso completo (PDF → datos en DB) tarda menos de 15 segundos
- [ ] El reporte de fin de día llega automáticamente al correo de mesa de control
- [ ] Si el lector falla, el PDF sigue llegando al destinatario — el lector nunca bloquea el flujo de MOVI
- [ ] El DEV puede actualizar el lector sin tocar el código de MOVI
- [ ] Suite de pruebas automáticas cubre los servicios críticos

---

## Cadencia de trabajo sugerida

```
Lunes     PM abre issues en GitHub con las tareas de la semana
Miércoles DEV reporta avance, PM revisa resultados con PDFs reales
Viernes   Demo de lo completado + ajustes para la semana siguiente
```

---

## Compañías pre-cargadas

Quálitas · GNP Seguros · ANA Seguros · HDI Seguros ·
Banorte Seguros · Seguros El Potosí · Mapfre · AXA Seguros · Zurich · BBVA Seguros

Ramos: **Autos** · GMM · Vida · Daños

---

## Referencias

- **Repositorio MOVI:** https://github.com/crickmx/jiromovi
- **Edge Function actual (v1):** `supabase/functions/lector-qualitas-proxy/index.ts`
- **Página de entrega en MOVI:** `src/pages/EntregaPolizas.tsx`
- **Tipos de datos MOVI:** `src/lib/lectorQualitasTypes.ts`
- **API v1 desplegada:** `https://lector-polizas-qua.onrender.com`
