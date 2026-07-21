# Auditoría de conocimiento — `poliza_gnp.py` y `app.py`

Continuación de [Auditoría Qualitas](01_AUDITORIA_QUALITAS.md). Mismo alcance: sin modificar código, sin SQL, sin diseño de tablas. `poliza_gnp.py` tiene 741 líneas / ~30 funciones. `app.py` es la capa de orquestación HTTP que consume ambos extractores.

---

## 0. `app.py` — qué aporta al inventario

No contiene conocimiento de negocio de pólizas; es la capa que **evidencia el problema de arquitectura** que motiva esta migración:

- Dos endpoints casi idénticos (`/extraer_poliza_qualitas`, `/extraer_poliza_gnp`) que solo cambian: qué módulo importan, qué función de clasificación llaman, y el diccionario fijo de "nombre visible → función extractora".
- El **orden y las claves del diccionario de salida están hardcodeadas por aseguradora** (`informacion = {...}`) — esto es en sí mismo conocimiento configurable: qué campos expone cada aseguradora y con qué etiqueta visible (ej. Qualitas expone `"I.V.A. 16%"`, GNP expone `"IVA"` con signo `$` concatenado a mano vía f-string).
- **GNP antepone `"$"` a mano en el JSON de salida** (`f"${gnp_prima_neta(...)}"`) para 6 campos monetarios; Qualitas no lo hace en ningún campo. Es una inconsistencia de presentación entre aseguradoras que debería resolverse en una capa de formato configurable por campo, no en el endpoint.
- Manejo de archivo temporal (`temp_qualitas.pdf` / `temp_gnp.pdf`) — nombre fijo por aseguradora; si dos requests concurrentes llegan a la misma aseguradora, hay una condición de carrera de sobrescritura de archivo (riesgo de bug, no conocimiento de negocio — se señala en §14C).
- No hay un endpoint agnóstico de aseguradora ("detectar cuál es y extraer") — el cliente de la API debe saber de antemano si es Qualitas o GNP y llamar al endpoint correcto. Esto es una limitación estructural que el motor configurable debería resolver (un único endpoint que detecte la aseguradora y aplique la configuración correspondiente).

---

## 1. Diferencia arquitectónica clave frente a Qualitas: GNP ya usa bbox real

A diferencia de `poliza_qualitas.py` (que solo usa offsets de línea de texto plano), **`poliza_gnp.py` implementa un motor genuino de búsqueda por coordenadas geométricas** (`x0,y0,x1,y1` de PyMuPDF). Esto es un salto de madurez notable dentro del mismo proyecto y debe tratarse como el **prototipo de referencia** del motor configurable que se busca construir:

- `_spans_pagina`: aplana `page.get_text("dict")` a una lista plana de spans con texto + bbox, descartando espacios vacíos.
- `_encontrar_etiqueta`: busca el primer span cuyo texto contiene (o es igual a) una etiqueta, opcionalmente acotado a una franja vertical `[desde_y, hasta_y)`.
- `_valor_por_posicion`: dado el span de una etiqueta, busca el valor asociado con dos estrategias geométricas explícitas y priorizadas:
  1. **Misma fila, a la derecha** (`abs(dy) <= tolerancia_fila` y `x0 > ex1 - 2`) — score `(0, distancia_x)`.
  2. **Misma columna, debajo** (`0 < dy <= max_distancia_y` y `abs(x0 - ex0) <= tolerancia_x`) — score `(1, dy)`.
  La fila siempre gana sobre la columna si ambas existen (tupla de score con prioridad 0 vs 1).
- `_valores_multilinea_por_posicion`: variante para campos que ocupan varias líneas en la misma columna (dirección, descripción), con corte automático si el salto vertical entre líneas consecutivas supera un umbral (evita "pegar" texto de un bloque no relacionado).
- `_campo_por_etiqueta`: punto de entrada que orquesta lo anterior por página.

Esto **confirma y corrige** una observación de la auditoría de Qualitas: no es que "el conocimiento de bbox no exista en el proyecto" — existe, pero solo se implementó para GNP. Qualitas se quedó en la generación anterior (offsets de línea de texto plano). Al diseñar el motor configurable, el modelo de datos debe soportar **ambas estrategias como variantes de "método de localización"**, porque hay evidencia real de que las dos coexisten en producción.

---

## 2. Campos detectados (GNP)

| # | Campo | Función | Cómo lo obtiene | Complejidad |
|---|---|---|---|---|
| 1 | Es póliza auto GNP (clasificador) | `es_poliza_auto_gnp` | Coincidencia de cualquiera de 6 palabras clave en minúsculas | Baja |
| 2 | Tipo de póliza | `extraer_tipo_poliza` | Ancla "No. Póliza" por posición → toma líneas pegadas verticalmente arriba en la misma columna x; fallback por offset de líneas tras marcador de página "1/3" | Alta |
| 3 | Número de póliza | `extraer_numero_poliza` | 2 regex sobre texto plano; fallback por posición (`_campo_por_etiqueta`) | Media |
| 4 | Renovación | `extraer_renovacion` | Por posición, excluyendo "versión"/"renovación" como valores, sin permitir misma fila; fallback offset +2 líneas | Media |
| 5 | Versión (campo nuevo) | `extraer_version` | Solo por posición, análogo a Renovación, sin fallback de texto | Media |
| 6 | Código de cliente (campo nuevo) | `extraer_codigo_cliente` | Por posición dentro de sección Contratante | Media |
| 7 | Nombre/razón social del contratante | `extraer_nombre_cliente` | Por posición dentro de sección Contratante (excluye etiquetas vecinas); fallback offset +8 líneas validando que no se cruce con "vehículo asegurado" antes | Alta |
| 8 | RFC del contratante | `extraer_rfc` | Por posición dentro de sección Contratante, excluyendo explícitamente el RFC corporativo de GNP; fallback por 2 regex sobre texto completo con la misma exclusión | Alta |
| 9 | Dirección del contratante | `extraer_direccion` | Multilínea por posición dentro de sección Contratante; fallback offset +4 líneas con corte al detectar patrón de C.P. | Alta |
| 10 | Prima neta | `extraer_prima_neta` | Regex sobre texto → `buscar_valor_monetario` (bbox por span siguiente en la misma línea) → `_campo_por_etiqueta` (bbox geométrico) | Media |
| 11 | Prima neta con descuento (campo nuevo) | `extraer_prima_neta_con_descuento` | Regex tolerante a salto de línea en la etiqueta → `buscar_valor_monetario` | Media |
| 12 | Derecho de póliza | `extraer_derecho_poliza` | Regex → `buscar_valor_monetario` | Media |
| 13 | IVA | `extraer_iva` | Regex → `buscar_valor_monetario` | Baja |
| 14 | Importe por pagar | `extraer_importe_pagar` | Regex → `buscar_valor_monetario` | Baja |
| 15 | Recargo por pago fraccionado | `extraer_recargo_fraccionado` | Regex → `buscar_valor_monetario` | Baja |
| 16 | Vigencia (inicio/fin) | `extraer_vigencia` | Un único regex con ambas fechas capturadas en el mismo match ("Desde las... Hasta las...") | Media |
| 17 | Descripción del vehículo | `extraer_descripcion` | Multilínea por posición en sección Vehículo, recorta si arrastra la palabra "Serie"; fallback offset +2..+4 líneas validando que no sea un VIN completo ni contenga palabras de otros campos | Alta |
| 18 | Categoría del vehículo (campo nuevo) | `extraer_categoria` | Multilínea por posición | Media |
| 19 | Serie (VIN) | `extraer_serie` | Regex VIN estricto de 17 caracteres (excluye I,O,Q por norma ISO) sobre texto completo; fallback por posición | Media |
| 20 | Modelo (año) | `extraer_modelo` | Por posición con `max_distancia_y=18` (ventana muy estrecha, deliberada — ver comentario en código) validado contra regex de año 19xx/20xx; fallback offset +1..+4 líneas | Media |
| 21 | Motor (campo nuevo) | `extraer_motor` | Solo por posición, ventana estrecha `max_distancia_y=18` | Media |
| 22 | Placas | `extraer_placas` | Por posición primero (conserva valor crudo aunque no valide como placa estándar); fallback a `_extraer_placas_legacy` (3 sub-estrategias por texto/tabla/regex, heredadas literalmente de Qualitas); normaliza contra lista de "valores especiales" (PERMISO, S/N, EN TRÁMITE, etc.) antes de validar formato | Muy alta |
| 23 | Uso del vehículo | `extraer_uso` | Por posición (sin permitir columna abajo, solo misma fila); fallback regex con lista blanca; fallback `buscar_texto_despues` (bbox, siguiente span con texto en lista blanca) | Media |
| 24 | Procedencia (campo nuevo) | `extraer_procedencia` | Solo por posición, misma fila | Baja |
| 25 | Circula en / entidad (campo nuevo) | `extraer_circula_en` | Solo por posición, misma fila | Baja |
| 26 | Clave del agente | `extraer_clave_agente` | Por posición en sección Agente (última página con título "AGENTE"); fallback offset +4 líneas validando que sea numérico | Media |
| 27 | Nombre del agente | `extraer_nombre_agente` | Por posición en sección Agente; fallback offset +5 líneas validando longitud > 5 | Media |
| 28 | Fecha de expedición (campo nuevo) | `extraer_fecha_expedicion` | Por posición en sección Agente; fallback regex con salto de línea tolerado | Media |

---

## 3. Alias encontrados (GNP)

| Concepto | Alias detectados |
|---|---|
| Número de póliza | `No. Póliza`, `No. Poliza` (sin acento), `Póliza No.`/`Núm.`/`Número` |
| Vehículo asegurado (sección) | `VEHÍCULO ASEGURADO`, `VEHICULO ASEGURADO` (sin acento) |
| RFC | `R.F.C.`, `RFC` |
| C.P. (dentro de dirección) | patrón flexible `c\s*\.?\s*p\s*\.?[:\s]*\d{4,5}` — tolera "C.P.", "C P", "CP" con o sin puntos/espacios |
| Placas "no aplica" | `permiso`, `s/n`, `sn`, `sin placas`, `pendiente`, `en trámite`, `en tramite`, `n/a` — **catálogo explícito de valores especiales de placa**, ausente en Qualitas |
| Sección Contratante (cierre) | `VEHÍCULO ASEGURADO` / `VEHICULO ASEGURADO` como marcador de fin |
| Sección Vehículo (cierre) | `CONSIDERACIONES IMPORTANTES`, `DESGLOSE DE COBERTURAS` |
| Derecho de póliza | `Derecho de Póliza`, `Derecho Póliza` (con/sin "de") |

No hay solapamiento textual de alias entre Qualitas y GNP salvo el concepto de RFC y el formato de placas — cada aseguradora usa su propia terminología para las mismas ideas de negocio (confirma que el diseño de datos debe indexar alias **por aseguradora**, no de forma global).

---

## 4. Catálogo de regex (GNP) — solo lo que difiere de Qualitas o es nuevo

| Regex | Detecta | Reutilizable | Específico GNP | Compartible |
|---|---|---|---|---|
| `[A-HJ-NPR-Z0-9]{17}` | VIN de 17 caracteres, **excluyendo I, O, Q** (norma ISO 3779 real) | Sí | No | Sí — de hecho es **superior** al regex de serie de Qualitas (`[A-Z0-9]{12,17}`, sin excluir I/O/Q); candidato a estandarizar como validador VIN único para ambas aseguradoras |
| `Desde\s+las\s+\d{1,2}\s+hrs\s+del\s+(\d{1,2}/\w{3}/\d{4})\s+Hasta\s+las\s+\d{1,2}\s+hrs\s+del\s+(\d{1,2}/\w{3}/\d{4})` | Vigencia completa en un solo match (2 grupos) | Parcialmente — la estructura de frase es de GNP | Sí | No literal, pero el patrón "una sola oración con ambas fechas" es una estrategia reutilizable si otra aseguradora tiene una frase similar |
| `\$?([0-9,]+\.\d{2})` (dentro de `buscar_valor_monetario`) | Monto tras etiqueta, span siguiente en la misma línea física del PDF | Sí | No | Sí — equivalente conceptual al regex de monto de Qualitas, pero aplicado sobre spans en vez de líneas de texto |
| `c\s*\.?\s*p\s*\.?[:\s]*\d{4,5}` | Detecta si una línea de dirección contiene el C.P. (para saber dónde cortar la dirección multilínea) | Sí | No | Sí |
| `^(19\|20)\d{2}$` | Año de modelo válido (1900-2099) | Sí | No | Sí — idéntico en espíritu a la validación de motor/serie de Qualitas, pero aquí sí hay validación real de rango, no solo longitud |
| `R\.?F\.?C\.?\s*[:\-]?\s*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{0,3})` y `\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{0,3})\b` | RFC | Sí | No | Sí — mismo patrón base que Qualitas, con la exclusión de motor sustituida por exclusión del RFC corporativo de GNP (ver §10) |
| Formatos de placa (`^[A-Z]{2,3}\d{3,4}$`, etc., 5 patrones) | Formato de placas mexicanas | Sí | No | Sí — **código duplicado literal** de `poliza_qualitas.py` (`validar_placa`/`formatear_placa` vs `_validar_placa`/`_formatear_placa`), carácter por carácter idéntico |

---

## 5. Métodos de extracción (clasificación, incorporando GNP)

Todo lo ya listado en la auditoría de Qualitas aplica igual. GNP añade formalmente los métodos que en Qualitas solo existían de forma incipiente:

| Método | Nuevo en GNP | Descripción |
|---|---|---|
| **Búsqueda por bbox / coordenadas reales** | Sí | `_valor_por_posicion` usa `x0,y0,x1,y1` reales de PyMuPDF, no offsets de línea |
| **Búsqueda en misma fila** | Sí (formal) | Definida explícitamente como estrategia 1 con tolerancia de fila y umbral de distancia x |
| **Búsqueda en misma columna (debajo)** | Sí (formal) | Definida explícitamente como estrategia 2 con tolerancia de x y distancia y máxima |
| **Búsqueda multilínea por columna** | Sí | `_valores_multilinea_por_posicion`, con corte por salto vertical excesivo |
| **Búsqueda acotada por sección vertical (y0/y1)** | Sí | `_spans_seccion_contratante`, `_spans_seccion_vehiculo`, `_spans_seccion_agente` — delimitan explícitamente una franja `[y0, y1)` de la página en vez de un rango de líneas de texto |
| **Búsqueda con exclusión de etiquetas vecinas como valor** | Sí (formal) | `etiquetas_excluir` es un parámetro de primera clase en casi todas las llamadas — evita que "Modelo" devuelva el texto "Placas" si la celda vecina está vacía |
| **Búsqueda en la última página que contiene un título** (orden inverso) | Sí | `_spans_seccion_agente` itera `reversed(paginas_dict)` — conocimiento de que la sección Agente está al final del documento, potencialmente repetida en varias páginas, y se prefiere la última ocurrencia |
| **Búsqueda por distancia con scoring y prioridad** | Sí | El score `(0, dx)` vs `(1, dy)` es un mecanismo real de "elegir el candidato más cercano", no solo "el primero que aparece" |

---

## 6. BBox — inventario detallado (GNP)

| Parámetro | Para qué sirve | Campo(s) que lo usa(n) | Parametrizable |
|---|---|---|---|
| `tolerancia_x` (default 14, o 10/15/20 según campo) | Cuánta desviación horizontal se tolera para considerar que dos spans están en la "misma columna" | Casi todos los campos por posición; varía: Descripción/Motor usan 10, Nombre/Dirección usan 20 | Sí — directamente, por campo |
| `tolerancia_fila` (default 3) | Cuánta desviación vertical se tolera para considerar "misma fila" | Todos los campos con `permitir_misma_fila=True` | Sí |
| `max_distancia_y` (default 45; 18 en Modelo/Motor/Placas; 90 en Nombre/Dirección/Descripción) | Distancia vertical máxima para buscar el valor "debajo" de la etiqueta | Cada campo tiene su propio valor, ajustado empíricamente (ver comentario explícito en `extraer_modelo`: 18pt evita "saltar" a la fila de abajo cuando la celda vecina viene vacía) | Sí — es de los parámetros más sensibles y más "tuneado a mano" del archivo |
| `max_lineas` (2-4 según campo) | Cuántas líneas máximo se concatenan en campos multilínea | Descripción (3), Categoría (2), Dirección (3) | Sí |
| `salto_maximo_entre_lineas` (default 20) | Corta la concatenación multilínea si el salto vertical entre una línea y la siguiente es mayor a este umbral (evita pegar texto de otro bloque) | Todos los campos multilínea | Sí |
| `permitir_misma_fila` / `permitir_columna_abajo` (booleanos) | Activan/desactivan cada una de las 2 estrategias geométricas | Configurado por campo: ej. Uso/Procedencia/Circula en usan solo fila; Renovación/Nombre/RFC/Dirección/Agente usan solo columna | Sí — es booleano puro, trivial de parametrizar |
| `coincidencia_exacta` (booleano en `_encontrar_etiqueta`) | Si la etiqueta debe ser el texto exacto del span o basta que lo contenga | Casi todos los campos "nuevos" usan `True` (evita, ej., que "Nombre" matchee dentro de "Nombre del Agente") | Sí |
| Franjas de sección `[y0, y1)` | Acotar toda la búsqueda de un grupo de campos a la porción vertical de la página que corresponde a una sección | Contratante, Vehículo Asegurado, Agente | Sí — el par de anclas (inicio/fin) que delimitan cada franja es exactamente el mismo tipo de dato que las "secciones" de Qualitas, solo que aquí se resuelve con `y0` real en vez de índice de línea |
| Score de prioridad `(0, dx)` vs `(1, dy)` | Decide cuál de las dos estrategias (fila vs columna) gana si ambas producen candidato | Todos los campos que permiten ambas | Es lógica de desempate — podría quedar como parte del motor de código, no como dato, salvo que se quiera invertir la prioridad por campo |

**Diferencia clave con Qualitas**: aquí los offsets **sí son verdaderas distancias en puntos de página** (unidad de PyMuPDF, 1/72 de pulgada), no "número de líneas de texto". Esto los hace más robustos ante pequeños cambios de layout, pero igual de específicos de la plantilla visual de GNP — siguen siendo conocimiento de negocio/plantilla, no código genérico.

---

## 7. Secciones del documento (GNP)

| Sección | Ancla de inicio | Ancla de fin | Función delimitadora |
|---|---|---|---|
| Contratante | `"CONTRATANTE"` (coincidencia exacta) | `"VEHÍCULO ASEGURADO"` / `"VEHICULO ASEGURADO"` (o +200pt si no se halla fin) | `_spans_seccion_contratante` |
| Vehículo Asegurado | `"VEHÍCULO ASEGURADO"` / `"VEHICULO ASEGURADO"` | `"CONSIDERACIONES IMPORTANTES"` / `"DESGLOSE DE COBERTURAS"` (o +200pt) | `_spans_seccion_vehiculo` |
| Agente | título exacto `"AGENTE"`, buscado en **la última página que lo contenga** | ventana fija de +40pt desde el título (no hay ancla de cierre) | `_spans_seccion_agente` |

Patrón de negocio explícito: **si no se encuentra la ancla de cierre, se usa un margen de seguridad fijo (+200pt / +40pt)** en vez de fallar — es una regla de tolerancia a variaciones de layout, parametrizable.

---

## 8. Patrones repetitivos (incorporando GNP)

Los 8 patrones ya descritos para Qualitas se repiten. GNP añade:

9. **Doble estrategia por campo: primero geometría (bbox), si no hay resultado, fallback a texto plano/regex "método original".**
   Presente en casi todas las funciones de GNP (`extraer_numero_poliza`, `extraer_renovacion`, `extraer_nombre_cliente`, `extraer_rfc`, `extraer_direccion`, `extraer_descripcion`, `extraer_modelo`, `extraer_clave_agente`, `extraer_nombre_agente`, `extraer_fecha_expedicion`). Es el mismo patrón de fallback en cascada de Qualitas, pero con solo 2 niveles y consistentemente en el mismo orden (bbox primero, texto después) — más disciplinado que la cascada ad-hoc de Qualitas.
10. **Delimitar sección por franja vertical, luego aplicar búsqueda de etiqueta+valor solo dentro de esa franja.**
    Reemplaza, con más rigor, al patrón de Qualitas de "recortar bloque de texto entre dos anclas".
11. **Documentación inline del "por qué" en comentarios/docstrings.**
    A diferencia de Qualitas (sin comentarios de negocio), GNP documenta explícitamente decisiones de negocio dentro del código (ej. `extraer_modelo`, `extraer_rfc`, `extraer_placas`) — **esto es oro puro para la migración**: son literalmente las reglas de negocio ya redactadas en prosa, listas para convertirse en el campo "descripción/motivo" de cada regla en la base de datos.

---

## 9. Normalizaciones (GNP)

| Normalización | Dónde |
|---|---|
| `.strip()` universal sobre texto de spans y valores | Prácticamente toda función |
| `.lower()` para comparar etiquetas (case-insensitive) | `_encontrar_etiqueta`, clasificador `es_poliza_auto_gnp` |
| `.upper()` sobre RFC y placas antes de validar | `extraer_rfc`, `extraer_placas` |
| `.capitalize()` sobre el valor de "Uso" y en `buscar_texto_despues` | `extraer_uso`, `buscar_texto_despues` |
| Reemplazo de comas en montos (`.replace(",", "")`) | `extraer_por_lineas_regex`, `buscar_valor_monetario` |
| Descarte de spans vacíos (solo espacios) | `_spans_pagina` |
| Limpieza de placa a alfanumérico puro (`re.sub(r'[^A-Z0-9]', '', ...)`) | `extraer_placas` / `_formatear_placa` |

No usa normalización unicode/NFKD (Qualitas sí, para tolerar acentos en meses de fecha) — GNP no tiene ese caso de uso porque su regex de vigencia usa `\w{3}` genérico para el mes abreviado.

---

## 10. Validaciones (GNP)

| Validación | Función | Regla |
|---|---|---|
| RFC | `extraer_rfc` | Formato estándar + **exclusión explícita de un RFC conocido y fijo** (`GNP9211244P0`, el RFC corporativo de la propia aseguradora, que aparece impreso en el membrete y puede confundirse con el del contratante) |
| VIN / Serie | `extraer_serie` | Regex ISO 3779 real (17 caracteres, excluye I/O/Q) — validación superior a la de Qualitas |
| Placa | `_validar_placa` | Idéntica a Qualitas (5 formatos, longitud 6-7) |
| Año de modelo | `extraer_modelo` | Regex de rango 1900-2099 |
| Clave de agente | `extraer_clave_agente` (fallback) | Debe ser numérico tras quitar espacios |
| Longitud mínima como proxy de validez | `extraer_nombre_cliente` (>4), `extraer_nombre_agente` (>5) | Heurística de "un nombre real no es demasiado corto" |
| C.P. dentro de dirección | `extraer_direccion` (fallback) | Detecta corte de dirección multilínea al encontrar patrón de C.P., no valida el CP en sí |

---

## 11. Exclusiones (GNP)

| Regla de exclusión | Función | Motivo de negocio |
|---|---|---|
| `RFC_GNP = "GNP9211244P0"` | `extraer_rfc` | El RFC de la propia aseguradora aparece en el documento y no debe confundirse con el del contratante — **constante de negocio explícita y documentada en el propio código** |
| `etiquetas_excluir` (distinto por campo: `{"nombre"}`, `{"código de cliente","r.f.c.","dirección","referencia"}`, `{"modelo","placas","motor"}`, etc.) | Prácticamente toda función basada en posición | Evita que el algoritmo geométrico devuelva como "valor" el texto de una etiqueta vecina cuando la celda esperada está vacía en el PDF |
| `_VALORES_PLACA_ESPECIALES` (`permiso`, `s/n`, `sn`, `sin placas`, `pendiente`, `en trámite`, `en tramite`, `n/a`) | `extraer_placas` | **Catálogo de negocio explícito**: hay vehículos sin placas asignadas (recién comprados, en trámite, con permiso), y GNP los marca con alguno de estos textos en vez de un número de placa real — el sistema debe aceptarlos como respuesta válida, no como "no encontrado" |
| Corte de descripción si arrastra "Serie" | `extraer_descripcion` | La columna de descripción del vehículo, cuando se lee por posición, a veces arrastra el inicio del siguiente campo (Serie) porque están visualmente cerca — se corta el texto ahí |

---

## 12. Fallbacks (GNP, en orden)

Patrón dominante uniforme: **bbox/posición primero → texto plano/regex después**, en solo 2-3 niveles (mucho más disciplinado que Qualitas):

- `extraer_tipo_poliza`: posición (líneas pegadas arriba de "No. Póliza") → offset tras marcador "1/3"
- `extraer_numero_poliza`: regex → posición
- `extraer_renovacion` / `extraer_nombre_cliente` / `extraer_rfc` / `extraer_direccion` / `extraer_descripcion` / `extraer_modelo` / `extraer_clave_agente` / `extraer_nombre_agente`: posición → offset de líneas
- `extraer_prima_neta` y análogos monetarios: regex texto → `buscar_valor_monetario` (spans) → (solo prima neta) `_campo_por_etiqueta` (posición geométrica) — 3 niveles
- `extraer_serie`: regex VIN estricto → posición
- `extraer_placas`: posición → `_extraer_placas_legacy` (que a su vez tiene 3 sub-niveles: tabla → sección → regex genérico) — el más profundo de GNP, herencia directa de la cascada de Qualitas
- `extraer_uso`: posición → regex con lista blanca → `buscar_texto_despues` (spans con lista blanca)
- `extraer_fecha_expedicion`: posición → regex con salto de línea tolerado

---

## 13. Mapa de dependencias (GNP)

```
leer_pdf_completo(ruta_pdf)                     [I/O — idéntica a la de Qualitas, código duplicado]
   └── produce: texto, paginas_dict

es_poliza_auto_gnp(texto)                       [clasificador, independiente]

_spans_pagina(pagina_dict)                      [utilidad base]
   └── consumida por: _encontrar_etiqueta, _campo_por_etiqueta, _spans_seccion_* (indirectamente)

_encontrar_etiqueta(spans, etiqueta, ...)
   └── consumida por: _campo_por_etiqueta y casi toda función de extracción

_valor_por_posicion / _valores_multilinea_por_posicion
   └── consumidas por: _campo_por_etiqueta y directamente por casi toda función de extracción

_campo_por_etiqueta(paginas_dict, etiqueta, ...)   [orquestador genérico de extracción posicional]
   └── usa: _spans_pagina, _encontrar_etiqueta, _valor_por_posicion/_valores_multilinea_por_posicion
   └── consumida por: extraer_numero_poliza, extraer_renovacion, extraer_version,
                       extraer_prima_neta, extraer_fecha_expedicion (parcial)

buscar_valor_monetario / buscar_texto_despues / extraer_por_lineas_regex   [utilidades de texto/spans]
   └── consumidas por: todos los campos monetarios y extraer_uso

_spans_seccion_contratante(paginas_dict)
   └── usa: _spans_pagina, _encontrar_etiqueta
   └── consumida por: extraer_codigo_cliente, extraer_nombre_cliente, extraer_rfc, extraer_direccion

_spans_seccion_vehiculo(paginas_dict)
   └── usa: _spans_pagina, _encontrar_etiqueta
   └── consumida por: extraer_descripcion, extraer_categoria, extraer_serie (fallback),
                       extraer_modelo, extraer_motor, extraer_placas, extraer_uso,
                       extraer_procedencia, extraer_circula_en

_spans_seccion_agente(paginas_dict)
   └── usa: _spans_pagina
   └── consumida por: extraer_clave_agente, extraer_nombre_agente, extraer_fecha_expedicion

extraer_placas(texto, paginas_dict)
   └── usa: _spans_seccion_vehiculo, _encontrar_etiqueta, _valor_por_posicion,
             _extraer_placas_legacy (fallback), _validar_placa, _formatear_placa

extraer_vigencia(texto, paginas_dict)           [independiente — único regex, no usa el motor de posición]
```

**Observación de arquitectura**: a diferencia de Qualitas (funciones aisladas sin motor común), GNP **sí construye un motor de extracción genérico real** (`_spans_pagina` → `_encontrar_etiqueta` → `_valor_por_posicion`/`_valores_multilinea_por_posicion` → `_campo_por_etiqueta`), y cada campo es, en esencia, una llamada a ese motor con parámetros propios (etiqueta, exclusiones, tolerancias). Esto es exactamente la forma que debería tener el motor configurable final — GNP ya resolvió en código gran parte de lo que se busca resolver con datos; falta "externalizar" los parámetros de cada llamada (etiqueta, tolerancias, exclusiones, sección) a la base de datos.

---

## 14. Conocimiento de negocio (GNP) — lo que no es programación

1. **GNP identifica una póliza de auto por la presencia de cualquiera de**: "vehículo asegurado", "auto individual", "automóvil", "tipo de uso", "serie", "placas" — **no exige la palabra "GNP"** en el texto (a diferencia de Qualitas, que exige "QUALITAS"). Esto es una asimetría de negocio real entre ambos clasificadores: el de GNP es más laxo y podría producir falsos positivos con otras aseguradoras que compartan vocabulario de auto.
2. **El tipo de póliza está impreso justo arriba de la etiqueta "No. Póliza", en la misma columna del encabezado** (extremo derecho de la primera página) — a diferencia de Qualitas, donde el tipo se busca por la palabra "PLAN:" repetida en el cuerpo del documento. Son estrategias de layout completamente distintas para el mismo concepto de negocio.
3. **"Versión" y "Renovación" son dos etiquetas contiguas en la misma fila del encabezado**, y sus valores están en la fila inmediatamente siguiente, cada uno alineado verticalmente bajo su propia etiqueta — deben leerse por columna, nunca por fila, porque en la misma fila de la etiqueta solo hay más etiquetas.
4. **La sección "CONTRATANTE" contiene: Código de Cliente, Nombre, R.F.C., Dirección y Referencia**, delimitada verticalmente entre el título "CONTRATANTE" y el inicio de "VEHÍCULO ASEGURADO".
5. **El documento de GNP incluye el propio RFC corporativo de GNP impreso en el membrete** (`GNP9211244P0`), y debe excluirse explícitamente al buscar el RFC del contratante — de otro modo el extractor podría devolver el RFC de la aseguradora en vez del cliente.
6. **La sección "VEHÍCULO ASEGURADO" contiene una tabla con las columnas: Descripción, Categoría, Serie, Modelo, Motor, Placas, Uso, Procedencia, Circula en** — el layout es tabular real (fila de etiquetas, fila de valores debajo), a diferencia de Qualitas donde el layout es más de "etiqueta seguida de valor a N líneas".
7. **Cuando el valor de "Placas" no está disponible, GNP imprime literales de negocio en vez de un número de placa**: "Permiso", "S/N", "Sin Placas", "Pendiente", "En Trámite", "N/A" — situaciones reales del ciclo de vida de un vehículo (recién adquirido, en proceso de emplacado, importado sin trámite concluido).
8. **La vigencia se expresa en GNP como una sola oración**: "Desde las HH hrs del DD/MES/AAAA Hasta las HH hrs del DD/MES/AAAA" — a diferencia de Qualitas, donde las fechas de vigencia aparecen sueltas y repetidas por el documento y se identifican por frecuencia.
9. **La sección "AGENTE" aparece en la última página del documento** (potencialmente repetida en páginas intermedias, por lo que se busca desde el final hacia atrás) y contiene: Clave, Nombre del Agente, Fecha de Expedición.
10. **El modelo (año) del vehículo está en la fila inmediatamente siguiente a la etiqueta "Modelo", sin margen de tolerancia** — si la celda vecina ("Placas") viene vacía en el PDF, una búsqueda con margen amplio "salta" incorrectamente a la fila de Uso; esta es una lección de negocio ya aprendida y documentada en el propio código fuente de GNP (comentario en `extraer_modelo`), y debe preservarse literalmente como parámetro (ventana de 18pt), no como intuición.
11. **La descripción del vehículo puede arrastrar el inicio del campo "Serie" si se lee por posición**, porque ambos están visualmente próximos en la tabla — se debe cortar el texto en la palabra "Serie" si aparece.
12. **Las placas, la serie y las direcciones de GNP comparten formato y reglas de validación con Qualitas** (mismos 5 patrones de placa mexicana, mismo formato general de RFC) — confirma que estas reglas son conocimiento **nacional/regulatorio**, no de ninguna aseguradora en particular, y deben modelarse como catálogo compartido entre todas las aseguradoras, no duplicado por aseguradora.

---

## 15. Clasificación final (GNP + app.py)

### A) Debe permanecer como código
- `leer_pdf_completo` (duplicada literal entre ambos archivos — candidata a unificarse en un solo módulo de I/O compartido).
- El **motor de posición completo de GNP** (`_spans_pagina`, `_encontrar_etiqueta`, `_valor_por_posicion`, `_valores_multilinea_por_posicion`, `_campo_por_etiqueta`) — es exactamente el tipo de intérprete genérico que el motor configurable final necesita; debe generalizarse (hoy tiene detalles específicos de GNP como el score de prioridad fila-vs-columna) pero la lógica en sí es reutilizable para cualquier aseguradora que tenga PDFs con estructura tabular real.
- El armazón de `app.py`: manejo de `UploadFile`, validación de extensión `.pdf`, logging, manejo de archivo temporal, manejo de excepciones HTTP — es infraestructura pura.
- Validadores universales: formato VIN (ISO 3779), formato de placa mexicana, formato de RFC, rango de año de modelo.

### B) Debe migrarse a SQLite
- **Todas las etiquetas/anclas por campo y por aseguradora** (§3): "No. Póliza", "CONTRATANTE", "VEHÍCULO ASEGURADO", "AGENTE", etc.
- **Todos los parámetros geométricos por campo** (§6): `tolerancia_x`, `tolerancia_fila`, `max_distancia_y`, `max_lineas`, `salto_maximo_entre_lineas`, `permitir_misma_fila`, `permitir_columna_abajo`, `coincidencia_exacta` — son exactamente el "dato de plantilla" que hace posible convertir este motor en configurable sin tocar código.
- **Las franjas de sección** (§7) — pares de anclas inicio/fin (o márgenes de seguridad fijos como +200pt/+40pt) por sección y por aseguradora.
- **`etiquetas_excluir` por campo** (§11) — lista de negocio, cambia si el layout de GNP cambia.
- **`_VALORES_PLACA_ESPECIALES`** — catálogo de negocio, potencialmente compartible entre aseguradoras (es una realidad del trámite vehicular mexicano, no solo de GNP).
- **`RFC_GNP` y cualquier RFC corporativo de otras aseguradoras** — constante de exclusión específica por aseguradora.
- **El orden y definición de cada fallback por campo** (§12) — igual que en Qualitas.
- **El diccionario de salida de `app.py`** (nombre visible del campo, orden de presentación, si lleva prefijo `$`) — hoy vive hardcodeado en el endpoint; es configuración de presentación por aseguradora y debería ser dato, no código.
- **La lista de palabras clave del clasificador** (`es_poliza_auto_gnp`, `es_poliza_auto_qualitas`) y la lista de aseguradoras competidoras — catálogo de clasificación por aseguradora.

### C) Debe eliminarse / corregir (código muerto, duplicado, riesgo)
- `leer_pdf_completo` está **copiada letra por letra** en `poliza_qualitas.py` y `poliza_gnp.py` — un solo módulo compartido de lectura de PDF basta.
- `validar_placa`/`formatear_placa` (Qualitas) y `_validar_placa`/`_formatear_placa` (GNP) son **código idéntico duplicado** — un solo validador de placas mexicanas compartido.
- El patrón de RFC y sus validaciones de longitud (10/12/13) están reimplementados con variaciones menores en ambos archivos — unificar en un solo validador de RFC.
- En `app.py`, el nombre de archivo temporal fijo (`temp_qualitas.pdf`, `temp_gnp.pdf`) es una **condición de carrera real** entre requests concurrentes de la misma aseguradora (dos usuarios subiendo un PDF al mismo tiempo pueden pisarse el archivo); no es conocimiento de negocio, es un bug de la capa de infraestructura que conviene resolver junto con la migración (nombre único por request, ej. UUID).
- El `except: pass` silencioso al borrar el archivo temporal (en ambos endpoints) oculta cualquier error de limpieza — no es negocio, es deuda técnica menor.
- `_extraer_placas_legacy` dentro de GNP es, letra por letra, una versión recortada de la cascada de placas de Qualitas — mantenerla como "fallback histórico" es razonable a corto plazo, pero una vez que el motor configurable esté validado con datos reales, debería poder describirse con los mismos parámetros que el resto de fallbacks en vez de código Python dedicado.

---

## Resumen ejecutivo comparativo (Qualitas vs. GNP)

| Aspecto | Qualitas | GNP |
|---|---|---|
| Estrategia de localización dominante | Offset de línea de texto plano | Coordenadas geométricas reales (bbox) |
| Motor genérico reutilizable | No — 20 funciones aisladas | Sí — `_campo_por_etiqueta` y familia |
| Manejo de secciones | Substring/regex sobre texto, límites por índice de línea | Franja vertical `[y0,y1)` sobre spans |
| Disciplina de fallback | Cascadas largas y ad-hoc (hasta 9-10 niveles en placas) | Consistentemente 2-3 niveles, siempre bbox→texto |
| Documentación de conocimiento de negocio en el propio código | Ninguna (hay que inferirla) | Presente en varios docstrings/comentarios — ya redactada, lista para migrar |
| Validación VIN | Débil (solo longitud) | Fuerte (excluye I/O/Q por norma) |
| Manejo de "placa no disponible" | No contemplado explícitamente | Catálogo explícito de valores especiales |

**Implicación de diseño más importante**: el motor configurable debe soportar **dos familias de "método de localización" por campo** —`offset_lineas` (con ventana/rango) y `posicion_geometrica` (con tolerancias x/y, fila/columna, multilínea)— porque ambas existen hoy en producción y migrar cualquiera de las dos aseguradoras a la otra estrategia sin datos reales sería arriesgado. El modelo de datos de la fase de diseño (aún no iniciada) debe reservar espacio para ambas desde el principio.
