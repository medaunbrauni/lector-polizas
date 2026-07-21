# Auditoría de conocimiento — `poliza_qualitas.py`

Análisis completo del archivo (957 líneas, 25 funciones). No se modificó código. Objetivo: inventariar todo el conocimiento (reglas, patrones, alias, umbrales) para diseñar después un motor configurable por datos.

---

## 1. Campos detectados

| # | Campo | Función | Cómo lo obtiene | Complejidad |
|---|-------|---------|------------------|--------------|
| 1 | Es póliza Qualitas de auto (clasificador, no campo de negocio) | `es_poliza_auto_qualitas` | Presencia de "QUALITAS" + palabras clave de auto | Baja |
| 2 | Tipo de póliza (Amplia/Limitada/Básica/RC) | `extraer_tipo_poliza` | Regex `PLAN:\s*(...)` por línea + fallback conteo de ocurrencias globales | Media |
| 3 | Número de póliza | `extraer_numero_poliza_qualitas` | Regex `INCISO\s+(\d{7,15})` primero (¡ojo, esto es conceptualmente confuso, ver §13), luego 3 regex alternativos | Media |
| 4 | RFC del asegurado | `extraer_rfc_mas_repetido` | Regex genérico de RFC + lista de exclusión de códigos de motor + frecuencia + preferencia por bloque "INFORMACION DEL ASEGURADO" | Alta |
| 5 | Prima neta | `extraer_prima_neta` | Etiqueta "PRIMA NETA" en línea, valor a **+8 líneas** (fallback +1) | Media |
| 6 | Tasa de financiamiento | `extraer_tasa_financiamiento` | Etiqueta "TASA FINANCIAMIENTO", valor a +8 líneas (fallback +1) | Media |
| 7 | Gastos de expedición | `extraer_gastos_expedicion` | Etiquetas "GASTOS POR EXPEDICIÓN" / "GASTOS DE EXPEDICIÓN", valor a +8 líneas (fallback +1), valida formato monto | Media |
| 8 | Subtotal | `extraer_subtotal` | Etiqueta "SUBTOTAL", valor a +8 líneas (fallback +1) | Media |
| 9 | Prima total | `extraer_prima_total` | Etiquetas "IMPORTE TOTAL" / "PRIMA TOTAL", valor a +7 líneas, si no barrido de 36 líneas tomando el **último** monto, luego barrido de 30 líneas | Alta |
| 10 | Nombre del asegurado / razón social | `extraer_nombre_cliente` | Búsqueda tras "INFORMACION DEL ASEGURADO", patrones de razón social, exclusión de palabras, fallback por fecha de vigencia, fallback por "FAX" +7 | Alta |
| 11 | Vigencia (inicio/fin) | `extraer_vigencia_por_frecuencia` | 5 regex de formatos de fecha + normalización unicode + toma las 2 fechas más frecuentes del documento | Alta |
| 12 | IVA | `extraer_iva` | Etiqueta "I.V.A."/"IVA" valor a +7 líneas; fallback por patrón "16%" +1 línea | Media |
| 13 | Forma de pago | `extraer_forma_pago` | Etiqueta "FORMA DE PAGO" +1 línea (fallback +45), o conteo global de palabras válidas | Media |
| 14 | Moneda | `extraer_moneda` | Etiqueta "MONEDA" +1 línea, o conteo global de palabras válidas | Baja |
| 15 | Motor | `extraer_motor` | Etiqueta "MOTOR", valor en desplazamientos [9,10,11], regex alfanumérico 9-13, o frases "HECHO EN/FABRICADO EN/ENSAMBLADO EN" | Media |
| 16 | Serie (VIN) | `extraer_serie` | Etiqueta "SERIE" inline o en desplazamientos [9,10,11,12], regex alfanumérico 12-17 | Media |
| 17 | Placas | `extraer_placas` | **6 estrategias en cascada** (ver §11) sobre texto y sobre `paginas_dict` (estructura por bloques/líneas/spans) | Muy alta |
| 18 | Código Postal (CP) | `extraer_cp` | 3 estrategias con conteo de frecuencia: tras "INCISO" +7..9, tras "C.P.:" dentro de bloques "INFORMACION DEL ASEGURADO", tras "ENDOSO" +10 | Alta |
| 19 | Municipio | `extraer_municipio` | Regex `Municipio\s*:\s*(.*?)\s*Estado\s*:`, fallback simple, fallback geométrico entre índice de CP y de Estado usando lista fija `ESTADOS_MX` | Alta |
| 20 | Tipo de vehículo | `extraer_tipo_vehiculo` | Tras "DESCRIPCIÓN DEL VEHÍCULO ASEGURADO", 5 patrones de tipo + frecuencia si hay múltiples matches | Media |
| 21 | Dirección | `extraer_direccion` | Bloque asegurado→vehículo, usa CP (vía `extraer_cp`) para ubicar línea anterior; fallback por fecha de inicio de vigencia + palabras clave de dirección (MZA, CALLE, AV, etc.) | Alta |
| 22 | Descripción del vehículo | `extraer_descripcion_vehiculo` | 3 estrategias: tras "English" +12..15, tras fecha de vigencia dentro de bloque asegurado, fallback -7 líneas antes de "INFORMACIÓN DEL ASEGURADO" con lista de exclusión `DESCARTAR_PATTERNS` | Muy alta |
| 23 | Colonia | `extraer_colonia` | Tras "COLONIA:" +6..9 validando que unas líneas antes haya un estado válido; fallback geométrico (penúltima línea del bloque); fallback vía municipio | Alta |

---

## 2. Alias encontrados (variantes de una misma etiqueta)

| Concepto | Alias detectados en el código |
|---|---|
| Número de póliza | `Póliza`, `Poliza` (sin acento vía `re.IGNORECASE`), `No. de Póliza`, `Núm. de Póliza`, `Número de Póliza`, `N° Póliza`, e implícitamente `INCISO` (usado como ancla, ver §13) |
| Prima total | `IMPORTE TOTAL`, `PRIMA TOTAL` |
| Gastos de expedición | `GASTOS POR EXPEDICIÓN`, `GASTOS DE EXPEDICIÓN` |
| IVA | `I.V.A.`, `IVA` |
| Placas | `Placas:`, `Placa:`, `placas:`, `placa:` (variantes de mayúsc/minúsc y singular/plural) |
| C.P. | `C.P.:`, más contexto vía `INCISO` y `ENDOSO` |
| Información del asegurado (sección) | `INFORMACION DEL ASEGURADO` (sin acento), `INFORMACIÓN DEL ASEGURADO` (con acento) — tratados como alias explícitos en casi cada función |
| Descripción del vehículo asegurado (sección) | `DESCRIPCIÓN DEL VEHÍCULO ASEGURADO`, `DESCRIPCI[ÓO]N DEL VEH[ÍI]CULO ASEGURADO` (variantes por clase de carácter regex) |
| Vehículo asegurado (sección corta) | `VEH[ÍI]CULO ASEGURADO` |
| Moneda | `PESOS`, `DÓLARES`, `USD`, `MXN`, `EUROS`, `EUR` |
| Forma de pago | `CONTADO`, `SEMESTRAL`, `TRIMESTRAL`, `MENSUAL`, `ANUAL` |
| Tipo de póliza | `AMPLIA`, `LIMITADA`, `BÁSICA`, `RESPONSABILIDAD CIVIL` |
| Fabricación (vehículo) | `HECHO EN`, `FABRICADO EN`, `ENSAMBLADO EN` |

No hay un diccionario central de alias: cada función redefine sus propias variantes localmente (duplicación — ver §14C).

---

## 3. Catálogo de regex

| Regex | Detecta | Función | Reutilizable | Específico Qualitas | Compartible entre aseguradoras |
|---|---|---|---|---|---|
| `PLAN:\s*(AMPLIA\|LIMITADA\|BÁSICA\|RESPONSABILIDAD CIVIL)` | Tipo de plan | `extraer_tipo_poliza` | Sí (motor de etiqueta+lista de valores) | La etiqueta "PLAN:" sí; los valores son genéricos de auto-seguros MX | Sí, con lista de valores configurable |
| `INCISO\s+(\d{7,15})` | Número de póliza (ancla incorrecta, ver §13) | `extraer_numero_poliza_qualitas` | No tal cual | Sí | No — es un acoplamiento accidental |
| `P[oó]liza\s*(?:No\.\|Núm\.?\|Número)?\s*[:\-]?\s*([A-Z0-9\-]{6,20})` | Número de póliza | idem | Sí | No, formato genérico | Sí |
| `No\.?\s*de\s*P[oó]liza...` | idem | idem | Sí | No | Sí |
| `N°\s*P[oó]liza...` | idem | idem | Sí | No | Sí |
| `\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{0,3}\b` | RFC (formato estándar mexicano) | `extraer_rfc_mas_repetido` | Sí | No — es regla SAT | Sí (compartible entre todas) |
| `\bV[68]\b`, `\bI4\b`, `\bH6\b`, `\b2ZRFE\b`, `\b1\.6L\b`, `\b2\.0L\b`, `\bTSI\b`, `\bTDI\b`, `\bDOHC\b`, `\bSOHC\b`, `\bTURBO\b`, `\bHYBRID\b`, `\bELECTRIC\b` | Exclusión de falsos positivos de RFC (códigos de motor que matchean el patrón) | idem | Sí como lista de exclusión configurable | Parcialmente — estos códigos de motor son genéricos de la industria automotriz, no de Qualitas | Sí |
| `INFORMACION DEL ASEGURADO.*?(?:\n\n\|\Z)` | Bloque de texto del asegurado | idem | Sí (patrón "desde sección hasta sección/fin") | La etiqueta sí; el patrón de bloque es genérico | Sí |
| `\$?\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?` | Monto con signo $ opcional | `extraer_prima_neta` | Sí — es un patrón universal de moneda MXN | No | Sí |
| `-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?` | Monto con signo negativo opcional | `extraer_tasa_financiamiento` | Sí | No | Sí |
| `-?\d{1,3}(?:,\d{3})*\.\d{2}` | Monto con decimales obligatorios | `extraer_gastos_expedicion`, `extraer_subtotal`, `extraer_prima_total`, `extraer_iva` | Sí — patrón de moneda "estricto" reutilizado 4 veces sin abstracción | No | Sí |
| `16\s*%` | Porcentaje de IVA (16%) | `extraer_iva` | Sí, con el valor "16" configurable | Parcialmente — 16% es la tasa vigente en México, no de Qualitas | Sí para México, no universal (otros países varían) |
| `S\.?A\.?\s+DE\s+C\.?V\.?`, `S\.?\s+DE\s+R\.?L\.?`, `SOCIEDAD\s+ANONIMA`, `SOCIEDAD\s+DE\s+RESPONSABILIDAD\s+LIMITADA` | Terminaciones de razón social mexicana | `extraer_nombre_cliente` | Sí | No — es nomenclatura legal mexicana | Sí |
| `[A-ZÑÁÉÍÓÚ ,\.&]{5,}` / `[A-ZÑÁÉÍÓÚ ,\.&0-9\-]{5,}` | Heurística de "parece un nombre/razón social" (mayúsculas, ≥2 palabras) | idem | Sí como heurística genérica | No | Sí |
| `\d{2}/\d{2}/\d{4}`, `\d{2}-\d{2}-\d{4}`, `\d{4}-\d{2}-\d{2}`, `\d{2} de [A-ZÁÉÍÓÚÑ]+ de \d{4}`, `(\d{2}/(ENE\|FEB\|...)/\d{2,4})` | Formatos de fecha | `extraer_vigencia_por_frecuencia` | Sí — catálogo de formatos de fecha reutilizable en cualquier documento | No | Sí (catálogo universal) |
| `I\.V\.A\.` / `IVA` (búsqueda `in`, no regex) | Ancla textual de IVA | `extraer_iva` | Sí | No | Sí |
| `\b[A-Z0-9]{9,13}\b` | Candidato a número de motor | `extraer_motor` | Sí como heurística de longitud, pero muy ambigua (falsos positivos altos) | No | Cuestionable — mejor con validación de checksum si existe |
| `\b[A-Z0-9]{12,17}\b` | Candidato a número de serie (VIN) | `extraer_serie` | Sí, aunque no valida checksum VIN real (17 caracteres, sin I/O/Q) | No | Sí, mejorable con validador VIN estándar |
| `tr[áa]mite` | Detecta placa "en trámite" | `extraer_placas` | Sí | No | Sí |
| `INFORMACI[ÓO]N DEL ASEGURADO`, `DESCRIPCI[ÓO]N DEL VEH[ÍI]CULO ASEGURADO` | Anclas de sección (variantes de acento) | idem | Sí | La etiqueta es de Qualitas; el patrón de variante de acento es genérico | Sí |
| `VEH[ÍI]CULO ASEGURADO(.*?)(?:\n{2,}\|DESGLOSE\|CONSIDERACIONES\|IMPORTE\|OBSERVACIONES)` | Extracción de bloque completo de sección vehículo | idem | Sí (patrón "sección hasta marcador de cierre") | Las etiquetas de cierre son específicas de Qualitas | El patrón sí, los marcadores no |
| `(?:Placas\|Placa)\s*[:\-]?\s*([A-Z0-9]{5,8})\b` (y variantes) | Valor de placa inline o en tabla | idem | Sí | No | Sí |
| `^[A-Z]{2,3}\d{3,4}$`, `^[A-Z]{4}\d{2,3}$`, `^\d{2,3}[A-Z]{3,4}$`, `^[A-Z]\d{2}[A-Z]{3}$`, `^[A-Z]{2}\d{2}[A-Z]{2}$` | Validación de formato de placas vehiculares mexicanas | `validar_placa` (función interna) | Sí — **catálogo de formatos de placas por estado/época**, universal en México | No — es regulación de tránsito nacional, no de la aseguradora | Sí, 100% compartible |
| `[^A-Z0-9]` (sub) | Limpieza de placa (quita guiones/espacios) | `formatear_placa` | Sí | No | Sí |
| `\bINCISO\b`, `\bC\.P\.:`, `\bENDOSO\b` | Anclas para ubicar CP | `extraer_cp` | Sí | Etiquetas de Qualitas | Estructura sí, etiquetas no |
| `\d{4,5}` | Formato de código postal | idem | Sí | No — CP mexicano es universal | Sí |
| `Municipio\s*:\s*(.*?)\s*Estado\s*:`, `Municipio\s*:\s*(.+)` | Valor de municipio | `extraer_municipio` | Sí | Etiqueta de Qualitas | Estructura sí |
| `^Autom[oó]viles\s+Nacionales`, `^Autom[oó]viles\s+Importados`, `^Camiones-Panel`, `^Motocicletas`, `^Tractocami[oó]n` | Catálogo de tipos de vehículo de Qualitas | `extraer_tipo_vehiculo` | Como lista configurable sí | Sí — nomenclatura propia de Qualitas | No literal — cada aseguradora usa su propia taxonomía |
| `Tipo\s*:\s*(.+)` | Ancla genérica "Tipo:" | idem | Sí | No | Sí |
| `INFORMACIÓN DEL ASEGURADO`, `INFORMACIÓN IMPORTANTE`, `PÓLIZA DE SEGURO DE AUTOMÓVILES`, `English` | Anclas de sección para descripción del vehículo | `extraer_descripcion_vehiculo` | Sí | Mixto — "PÓLIZA DE SEGURO DE AUTOMÓVILES" y "English" son giros de Qualitas | Parcial |
| `\bCOLONIA:` | Ancla de colonia | `extraer_colonia` | Sí | Etiqueta de Qualitas | Estructura sí |

---

## 4. Métodos de extracción (clasificación)

| Método | Dónde aparece | Descripción |
|---|---|---|
| Búsqueda por regex directa sobre texto completo | `extraer_numero_poliza_qualitas`, `extraer_rfc_mas_repetido`, `extraer_placas` (última estrategia) | `re.search`/`re.findall` sobre el string completo |
| Búsqueda por línea + desplazamiento fijo ("N líneas debajo") | Casi todas: `extraer_prima_neta` (+8/+1), `extraer_tasa_financiamiento` (+8/+1), `extraer_gastos_expedicion` (+8/+1), `extraer_subtotal` (+8/+1), `extraer_prima_total` (+7), `extraer_iva` (+7), `extraer_forma_pago` (+1/+45), `extraer_moneda` (+1), `extraer_motor` (+9,10,11), `extraer_serie` (+9,10,11,12), `extraer_cp` (+7..9, +10), `extraer_colonia` (+6..9) | **Es el patrón dominante del archivo.** Ancla textual → offset numérico de líneas → valor |
| Búsqueda por rango/barrido de líneas (ventana) | `extraer_prima_total` (ventanas de 36 y 30 líneas), `extraer_placas` (`range(0,11)`), `extraer_tipo_vehiculo` (`range(0,11)`), `extraer_direccion` (`range(2,6)`) | Explora un rango en vez de un offset fijo, tomando el primer o último match válido |
| Búsqueda por frecuencia/conteo (voto de mayoría) | `extraer_tipo_poliza`, `extraer_rfc_mas_repetido`, `extraer_forma_pago`, `extraer_moneda`, `extraer_vigencia_por_frecuencia`, `extraer_tipo_vehiculo`, `extraer_descripcion_vehiculo`, `extraer_cp` | Cuenta ocurrencias de candidatos con `Counter` y toma el más común. Usado como mecanismo anti-ruido cuando hay múltiples matches en el documento |
| Búsqueda por sección delimitada (desde marcador hasta marcador) | `extraer_placas` (`extraer_seccion_vehiculo`), `extraer_direccion`, `extraer_descripcion_vehiculo`, `extraer_colonia`, `extraer_cp` (bloques por "INFORMACION DEL ASEGURADO") | Recorta un bloque de texto entre dos anclas y limita la búsqueda a ese bloque |
| Búsqueda estructural por tabla (bloques/líneas/spans de PyMuPDF) | `extraer_placas` (`buscar_en_tabla`) | Único caso que usa `paginas_dict` (salida de `get_text("dict")`) en vez de texto plano; navega `blocks → lines → spans`, concatena texto de spans, e inspecciona la línea siguiente dentro del mismo bloque |
| Búsqueda relativa a otro campo ya extraído (encadenada) | `extraer_nombre_cliente` (usa resultado de `extraer_vigencia_por_frecuencia`), `extraer_direccion` (usa `extraer_cp`, usa `extraer_vigencia_por_frecuencia`), `extraer_colonia` (usa `extraer_municipio`), `extraer_descripcion_vehiculo` (usa `extraer_vigencia_por_frecuencia` dos veces) | El valor de un campo se usa como ancla de búsqueda para otro campo |
| Búsqueda geométrica por posición relativa entre dos anclas (sin coordenadas reales, solo índice de línea) | `extraer_municipio` (posición entre índice de CP e índice de Estado), `extraer_colonia` (validación de "unas líneas antes hay un Estado válido"), `extraer_direccion` (línea inmediatamente antes del CP) | No hay bbox real; es un pseudo-bbox basado en número de línea, tratado como si fuera una coordenada vertical |
| Validación posterior a extracción (filtro, no búsqueda) | `validar_placa`, exclusión de motor en RFC, `es_monto_valido` | No busca el valor, decide si el candidato encontrado es válido |
| Fallback en cascada multinivel | `extraer_placas` (6 niveles), `extraer_prima_total` (3 niveles), `extraer_nombre_cliente` (3 niveles), `extraer_descripcion_vehiculo` (3 niveles), `extraer_cp` (3 niveles) | Ver §11 |

**No existe** en este archivo: búsqueda por bbox/coordenadas reales (x0,y0,x1,y1), búsqueda por "misma columna", ni por distancia euclidiana. El único acceso a estructura del PDF más allá de texto plano es `buscar_en_tabla` dentro de `extraer_placas`, y usa adyacencia de líneas dentro de bloques, no coordenadas.

---

## 5. BBox y coordenadas

**Hallazgo clave: este archivo NO usa bounding boxes reales.**

- `leer_pdf_completo` obtiene `pagina.get_text("dict")`, que sí contiene `bbox` por span/línea/bloque (estructura estándar de PyMuPDF: `x0,y0,x1,y1`), pero **ninguna función del archivo lee esos valores de bbox**.
- La única función que usa `paginas_dict` es `buscar_en_tabla` (dentro de `extraer_placas`), y solo navega la jerarquía `blocks → lines → spans` para reconstruir texto y mirar "la línea siguiente en el mismo bloque" — es decir, usa la estructura como una lista ordenada, no como coordenadas.
- Todo lo que en el negocio se describe como "está justo debajo" o "está a la derecha" se implementa como **offset de número de línea de texto plano** (`lineas[i+8]`, `lineas[i+45]`, etc.), no como distancia geométrica en puntos/píxeles.

Implicación para el rediseño: si se migra a un motor configurable, **hoy no hay señal geométrica que preservar** desde este archivo — el "conocimiento de bbox" en realidad es "conocimiento de desplazamiento de línea de texto", que es mucho más frágil (depende del layout exacto de cada plantilla de Qualitas) y es justamente el candidato más fuerte para convertirse en dato parametrizable (offset configurable por campo).

---

## 6. Secciones del documento (detectadas)

| Sección | Cómo se detecta | Usada por |
|---|---|---|
| `INFORMACION DEL ASEGURADO` / `INFORMACIÓN DEL ASEGURADO` | Búsqueda de substring (con y sin acento) | `extraer_rfc_mas_repetido`, `extraer_nombre_cliente`, `extraer_cp`, `extraer_direccion`, `extraer_descripcion_vehiculo`, `extraer_colonia` |
| `DESCRIPCIÓN DEL VEHÍCULO ASEGURADO` / `DESCRIPCI[ÓO]N DEL VEH[ÍI]CULO ASEGURADO` | Substring / regex con clases de acento | `extraer_placas`, `extraer_tipo_vehiculo`, `extraer_direccion`, `extraer_colonia` |
| `VEHÍCULO ASEGURADO` (forma corta) | Regex | `extraer_placas` (`extraer_seccion_vehiculo`) |
| `INFORMACIÓN IMPORTANTE` | Substring | `extraer_descripcion_vehiculo` (marca de cierre de bloque) |
| `PÓLIZA DE SEGURO DE AUTOMÓVILES` | Substring | `extraer_descripcion_vehiculo` (marca de inicio, fallback) |
| Marcadores de cierre de sección vehículo: `DESGLOSE`, `CONSIDERACIONES`, `IMPORTE`, `OBSERVACIONES` | Alternancia dentro de un regex | `extraer_seccion_vehiculo` |
| Bloque implícito "asegurado" delimitado por `ENDOSO`/`INCISO` | Ancla de línea única (no delimita rango, solo punto de referencia) | `extraer_numero_poliza_qualitas`, `extraer_cp` |

No hay una tabla/mapa central de secciones: cada función vuelve a buscar sus propias anclas de inicio/fin, con variantes de acentuación repetidas función por función (duplicación notable).

---

## 7. Patrones repetitivos detectados

1. **Etiqueta → offset fijo → regex de monto → primer/último match válido.**
   Se repite casi idéntico en `extraer_prima_neta`, `extraer_tasa_financiamiento`, `extraer_gastos_expedicion`, `extraer_subtotal`, `extraer_prima_total`, `extraer_iva`. Solo cambian: la(s) etiqueta(s) de búsqueda, el offset numérico, y el regex exacto de monto (con o sin signo, con o sin decimales obligatorios).
2. **Etiqueta → offset → valor debe estar en lista blanca (whitelist) → si no, fallback a conteo global.**
   Se repite en `extraer_forma_pago`, `extraer_moneda`, y parcialmente `extraer_tipo_poliza`.
3. **Ancla de sección (con variante acentuada) → delimitar bloque → buscar patrón dentro del bloque.**
   Se repite en `extraer_direccion`, `extraer_descripcion_vehiculo`, `extraer_colonia`, `extraer_cp`.
4. **Cascada de N estrategias independientes probadas en orden hasta que una devuelve un valor no vacío.**
   `extraer_placas` (6 estrategias), `extraer_prima_total` (3), `extraer_nombre_cliente` (3), `extraer_descripcion_vehiculo` (3), `extraer_cp` (3 con voto de frecuencia en vez de orden estricto).
5. **Encontrar candidato con regex de formato → filtrar contra lista de exclusión conocida → aceptar.**
   `extraer_rfc_mas_repetido` (excluye códigos de motor), `extraer_municipio`/`extraer_colonia` (excluyen nombres de estado vía `ESTADOS_MX`).
6. **Función `validar_X` + función `formatear_X` separadas de la función de búsqueda.**
   Solo aplicado consistentemente en placas (`validar_placa`, `formatear_placa`); el resto de campos no separa validación/formato de forma reutilizable.
7. **Normalizar a mayúsculas antes de cualquier comparación de texto.**
   Presente en casi todas las funciones (`texto.upper()` al inicio), excepto en las que preservan el texto original para no romper mayúsc/minúsc de nombres propios (`extraer_placas`, `extraer_tipo_vehiculo`, `extraer_direccion`, `extraer_descripcion_vehiculo`).
8. **Resultado con mensaje de error como string en vez de `None`/excepción.**
   `"No encontrado"`, `"S/N"`, `"No se encontró X"`, `""` — inconsistente entre funciones (a veces string vacío, a veces mensaje descriptivo, a veces "S/N").

---

## 8. Normalizaciones

| Normalización | Dónde | Detalle |
|---|---|---|
| Uppercase completo | Mayoría de funciones | `texto.upper()` |
| Descomposición unicode (NFKD) + eliminación de diacríticos | `normalizar_texto` | Usado solo dentro de `extraer_vigencia_por_frecuencia` para tolerar acentos en meses (ENE/FEB/...) |
| `.strip()` de líneas y valores | Prácticamente universal | Limpieza de espacios al inicio/fin |
| `.title()` sobre el resultado final | `extraer_tipo_poliza`, `extraer_nombre_cliente`, `extraer_forma_pago`, `extraer_moneda`, `extraer_colonia`, parcialmente `extraer_motor` | Convierte el valor crudo (mayúsculas) a formato "Legible" antes de devolverlo — **es transformación de presentación, no de negocio** |
| Eliminación de caracteres no alfanuméricos (`re.sub(r'[^A-Z0-9]', '', ...)`) | `formatear_placa`, un caso en `extraer_direccion`/CP | Limpieza de placas y de CP embebido en texto con separadores |
| Reemplazo de espacios en montos (`.replace(' ', '')`) | `extraer_prima_neta` | Limpieza de montos con espacio accidental por OCR/extracción de texto |
| Split de texto por marcador (`:`) para aislar valor de etiqueta | `extraer_nombre_cliente`, `extraer_placas`, `extraer_colonia` | Patrón "ETIQUETA: valor" en la misma línea |

No hay normalización de tabs (`\t`) ni de espacios dobles/múltiples explícita en ningún punto — posible gap si el PDF los produce.

---

## 9. Validaciones

| Validación | Función | Regla |
|---|---|---|
| RFC | `extraer_rfc_mas_repetido` (implícita, no hay función separada) | Formato `[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{0,3}`, longitud 12-13 preferida sobre 10 (persona moral/física vs. truncado), exclusión de patrones de motor |
| Placa | `validar_placa` | Longitud exacta 6 o 7; debe cumplir uno de 5 formatos regulares mexicanos (letras/números en distintas combinaciones) |
| Monto | `es_monto_valido` (redefinida idéntica en 4 funciones: `extraer_gastos_expedicion`, `extraer_subtotal`, `extraer_prima_total`, `extraer_iva`) | Debe matchear desde el inicio del string (`re.match`) el patrón de monto con decimales obligatorios |
| Código postal | Implícita en `extraer_cp`, `extraer_municipio` | `\d{4,5}` (acepta 4 o 5 dígitos, aunque CP mexicano estándar es 5) |
| Fecha | Ninguna validación de fecha real (no valida día≤31, mes≤12, ni que fin > inicio); solo formato sintáctico vía regex |
| Motor / Serie | Sin validación real; solo heurística de longitud alfanumérica (9-13 para motor, 12-17 para serie) — **no valida checksum VIN** |
| Nombre/razón social | Heurística: mayúsculas, ≥2 palabras, longitud ≥5, no debe contener palabras de la lista de exclusión (`palabras_excluidas`) |

---

## 10. Exclusiones (reglas "no considerar / ignorar / excluir")

| Regla de exclusión | Función | Motivo de negocio |
|---|---|---|
| `otras_aseguradoras` (GNP, AXA, MAPFRE, CHUBB, ZURICH, ANA SEGUROS, HDI, AFIRME, BANORTE, BBVA SEGUROS) | `es_poliza_auto_qualitas` | Si aparece otra aseguradora y no aparece "QUALITAS", se descarta como no-Qualitas |
| `exclusiones_motor` (V6, V8, I4, H6, 2ZRFE, 1.6L, 2.0L, TSI, TDI, DOHC, SOHC, TURBO, HYBRID, ELECTRIC) | `extraer_rfc_mas_repetido` | Estos códigos de motor matchean por casualidad el patrón regex de RFC; deben excluirse para no confundir motor con RFC |
| `palabras_excluidas` (DOMICILIO, RFC, C.P, MUNICIPIO, ESTADO, VIGENCIA, TELEFONO, DESDE LAS, INFORMACIÓN IMPORTANTE, OFICINA, ATENCIÓN, CANAL) | `extraer_nombre_cliente` | Si la línea candidata a "nombre" contiene alguna de estas palabras, no es un nombre real, es texto de otra sección |
| `ESTADOS_MX` (lista de 32 estados) | `extraer_municipio`, `extraer_colonia` | Si el candidato a municipio/colonia coincide con un nombre de estado, se descarta (no puede ser municipio si es un estado) |
| `DESCARTAR_PATTERNS` (textos legales/avisos de privacidad de Qualitas) | `extraer_descripcion_vehiculo` | Si el candidato a descripción de vehículo cae dentro de párrafos legales conocidos, se descarta y devuelve vacío |

---

## 11. Fallbacks (mecanismos de respaldo, en orden)

**`extraer_numero_poliza_qualitas`**: INCISO(regex) → póliza-No/Núm/Número → No. de Póliza → N° Póliza → `"No encontrado"`

**`extraer_prima_neta` / `extraer_tasa_financiamiento` / `extraer_gastos_expedicion` / `extraer_subtotal`**: offset +8 → offset +1 → mensaje de "no encontrado"

**`extraer_prima_total`**: offset +7 → barrido de 36 líneas tomando el último monto → barrido de 30 líneas tomando el último monto → mensaje de "no encontrado"

**`extraer_nombre_cliente`**: bloque tras "INFORMACION DEL ASEGURADO" (inline o próximas 6 líneas con patrón legal o heurística de mayúsculas) → bloque cerca de la fecha de fin de vigencia → línea +7 tras "FAX" → mensaje de "no encontrado"

**`extraer_iva`**: offset +7 tras "IVA" → offset +1 tras patrón "16%" → mensaje de "no encontrado"

**`extraer_forma_pago`**: offset +1 tras etiqueta → offset +45 tras etiqueta → conteo global de ocurrencias de valores válidos → mensaje de "no encontrada"

**`extraer_moneda`**: offset +1 tras etiqueta → conteo global → mensaje de "no encontrada"

**`extraer_motor`**: offsets [9,10,11] tras "MOTOR" con regex alfanumérico o frase de fabricación → `"S/N"`

**`extraer_serie`**: inline en la misma línea de "SERIE" → offsets [9,10,11,12] → `"S/N"`

**`extraer_placas`** (el fallback más largo del archivo, 6 niveles):
1. Detección de "TRÁMITE" (atajo, no es fallback sino caso especial que corta todo lo demás)
2. `buscar_desde_patrones`: tras anclas de sección, rango de 11 líneas, validado por `validar_placa`
3. `buscar_en_rango_lineas`: tras "placas:"/"placa:", rango de 11 líneas
4. `buscar_en_tabla`: estructura de bloques/líneas de PyMuPDF (única vía no basada en texto plano)
5. `extraer_seccion_vehiculo` + `buscar_en_seccion`: recorta la sección vehículo y aplica regex de placa con lookahead
6. `buscar_con_regex`: 5 regex genéricos crecientemente permisivos sobre el texto completo
7. Fallback final: offset fijo +7 tras "placas:"/"placa:" con validación de longitud 5-10
8. Fallback final-final: recorte de sección "DESCRIPCIÓN DEL VEHÍCULO ASEGURADO" + split por `:`
9. Fallback absoluto: split por `:` en cualquier línea que contenga "placas:"/"placa:", sin validación
10. `"No encontrado"`

**`extraer_cp`**: 3 fuentes acumuladas con voto de frecuencia (no es fallback secuencial estricto, es "recolectar todo y votar"): tras "INCISO" +7..9, tras "C.P.:" dentro de bloques de asegurado +7..9, tras "ENDOSO" +10 → el CP más repetido gana → `""` si no hay ninguno

**`extraer_municipio`**: regex con "Estado:" en la misma línea → regex simple sin "Estado:" → posición geométrica entre índice de CP e índice de Estado dentro de una ventana de 15 líneas → `""`

**`extraer_direccion`**: bloque asegurado→vehículo usando CP como ancla (línea anterior al CP) → bloque usando fecha de inicio de vigencia + palabras clave de dirección en ventana de 2-6 líneas → CP global + línea anterior → `""`

**`extraer_descripcion_vehiculo`**: tras "English" +12..15 con formato numérico → línea anterior a fecha de inicio dentro de bloque asegurado→importante → línea -7 antes de "INFORMACIÓN DEL ASEGURADO" (validada contra `DESCARTAR_PATTERNS`) → voto de frecuencia entre los candidatos recolectados → `""`

**`extraer_colonia`**: tras "COLONIA:" +6..9 validado por estado cercano → penúltima línea del bloque asegurado validada por estado cercano → vía municipio, buscar "COLONIA:" en la línea siguiente al municipio → mensaje de "no encontrado"

---

## 12. Mapa de dependencias entre funciones

```
leer_pdf_completo()                         [I/O — no de negocio]
   └── produce: texto, paginas_dict

es_poliza_auto_qualitas(texto)              [clasificador, independiente]

extraer_tipo_poliza(texto)                  [independiente]
extraer_numero_poliza_qualitas(texto)       [independiente]

extraer_rfc_mas_repetido(texto)             [independiente]

extraer_vigencia_por_frecuencia(texto)
   └── usa: normalizar_texto(texto)
   └── consumida por:
        ├── extraer_nombre_cliente(texto)
        ├── extraer_direccion(texto)
        └── extraer_descripcion_vehiculo(texto)   [la llama 2 veces, con distintos sub-bloques]

extraer_nombre_cliente(texto)
   └── usa: extraer_vigencia_por_frecuencia(texto)

extraer_prima_neta / extraer_tasa_financiamiento /
extraer_gastos_expedicion / extraer_subtotal /
extraer_prima_total / extraer_iva                  [todas independientes entre sí, mismo patrón estructural]

extraer_forma_pago(texto)                   [independiente]
extraer_moneda(texto)                       [independiente]
extraer_motor(texto)                        [independiente]
extraer_serie(texto)                        [independiente]

extraer_placas(texto, paginas_dict)
   └── funciones internas (privadas, no reutilizables fuera): 
        buscar_desde_patrones, buscar_en_rango_lineas, extraer_seccion_vehiculo,
        buscar_en_tabla, buscar_en_seccion, buscar_con_regex,
        validar_placa, formatear_placa

extraer_cp(texto)
   └── consumida por:
        ├── extraer_direccion(texto)
        └── extraer_descripcion_vehiculo(texto)   [indirectamente, no — revisar: en realidad no la llama]

ESTADOS_MX (constante)
   └── usada por: extraer_municipio, extraer_colonia

extraer_municipio(texto)
   └── usa: ESTADOS_MX
   └── consumida por: extraer_colonia(texto)

extraer_tipo_vehiculo(texto)                [independiente]

extraer_direccion(texto)
   └── usa: extraer_cp(texto), extraer_vigencia_por_frecuencia(texto)

DESCARTAR_PATTERNS (constante)
   └── usada por: extraer_descripcion_vehiculo

extraer_descripcion_vehiculo(texto)
   └── usa: extraer_vigencia_por_frecuencia(texto) [x2]

extraer_colonia(texto)
   └── usa: ESTADOS_MX, extraer_municipio(texto)
```

**Observación de arquitectura**: no existe una función orquestadora `extraer_poliza()` que llame a todas — cada función se invoca de forma independiente desde fuera del archivo (probablemente desde el router de la API). Las dependencias reales son solo las 6-7 listadas arriba; el resto de los ~23 campos son extractores totalmente aislados sin reutilización de lógica común (cada uno reimplementa su propio bucle de líneas, su propio `Counter`, su propia normalización).

---

## 13. Conocimiento de negocio (lo más importante — no es programación)

Estas son afirmaciones sobre **cómo Qualitas diseña sus PDFs**, extraídas de la lógica del código. Es el conocimiento que debe sobrevivir la migración, independientemente de cómo se implemente:

1. **El documento identifica a Qualitas por la palabra "QUALITAS" en el texto**, y se confirma como póliza de auto si contiene alguna de: VEHÍCULO, COBERTURA, AUTOMÓVIL, USO PARTICULAR, PLACAS.
2. **El campo "PLAN:" en el documento indica el tipo de póliza** (Amplia/Limitada/Básica/RC), y puede aparecer más de una vez; se confía en el valor más repetido.
3. **Existe ambigüedad conocida entre "INCISO" y el número de póliza**: el código intenta primero usar un número de 7 a 15 dígitos que sigue a la palabra "INCISO" como número de póliza. *(Esto sugiere que en el layout de Qualitas, cerca de "INCISO" hay un número que a veces es el de póliza — o es un bug histórico. Debe validarse con el negocio si esto es correcto o es una confusión heredada.)*
4. **El RFC del asegurado suele estar dentro del bloque "INFORMACION DEL ASEGURADO"**, pero el mismo patrón de RFC puede matchear accidentalmente códigos de motor (V6, V8, TDI, etc.) que aparecen en la sección de vehículo — por lo que Qualitas coloca ambos tipos de código en formatos parecidos.
5. **Existen dos formas de RFC en el documento: estándar (12-13 caracteres) y truncado (10 caracteres)** — Qualitas parece truncar el RFC en alguna parte del layout, y el estándar es preferible cuando ambos existen.
6. **El monto de "PRIMA NETA" está posicionado exactamente 8 líneas de texto después de la etiqueta** en el layout estándar de Qualitas (con un caso de layout alterno donde está 1 línea después). Este "+8" es un valor de negocio (posición de columna en una tabla que al extraerse como texto plano se "aplana" a N líneas de distancia), no una decisión de programación.
7. Lo mismo aplica para: **TASA FINANCIAMIENTO (+8/+1)**, **GASTOS DE EXPEDICIÓN (+8/+1)**, **SUBTOTAL (+8/+1)**, **IMPORTE TOTAL/PRIMA TOTAL (+7, o dentro de una ventana de hasta 36 líneas tomando el último monto)**, **IVA (+7, o +1 tras el texto "16%")**. Estos desplazamientos numéricos son **el corazón del conocimiento de negocio del layout de Qualitas** y son extremadamente frágiles: cualquier cambio de plantilla de Qualitas los rompe.
8. **"FORMA DE PAGO" está normalmente 1 línea después de la etiqueta, pero en otro layout de Qualitas está 45 líneas después** — evidencia de que Qualitas tiene (al menos) dos plantillas de documento distintas, y el código intenta cubrir ambas con offsets distintos.
9. **El nombre del asegurado (persona física o moral) aparece inmediatamente después de "INFORMACION DEL ASEGURADO"**, ya sea en la misma línea (tras los dos puntos) o en alguna de las siguientes 6 líneas, y se identifica por: contener una terminación de razón social (S.A. DE C.V., S. DE R.L., etc.) **o** ser una línea en mayúsculas de al menos 2 palabras que no sea una etiqueta de otro campo (domicilio, RFC, etc.).
10. **Si no se encuentra el nombre en la sección de asegurado, suele estar cerca de la fecha de fin de vigencia**, y en un tercer layout aparece 7 líneas después de la palabra "FAX".
11. **El documento repite las fechas de vigencia varias veces**; las dos fechas más frecuentes del documento corresponden a Inicio y Fin de vigencia, en ese orden de frecuencia.
12. **La tasa de IVA vigente es 16%**, y esto se usa como ancla alternativa cuando la etiqueta "IVA" no lleva directamente al monto.
13. **El motor y la serie (VIN) aparecen como código alfanumérico varias líneas después de su etiqueta** (motor: 9-11 líneas; serie: 12-17 caracteres, 9-12 líneas o inline), y en algunos documentos, en vez del número de motor aparece una leyenda ("HECHO EN...", "FABRICADO EN...", "ENSAMBLADO EN...") cuando el motor no aplica o no se registró.
14. **Las placas tienen al menos 6 layouts distintos de Qualitas**: en texto corrido tras secciones de asegurado/vehículo, en formato tabular "Modelo...Placas" (bloques de PyMuPDF), inline tras "Placas:", o pueden decir literalmente "TRÁMITE" cuando el vehículo aún no tiene placas asignadas.
15. **Los formatos de placas mexicanas válidos** siguen 5 patrones conocidos (según estado/época de emisión): `LLL-NNNN`, `LLLL-NNN`, `NNN-LLLL`, `L-NN-LLL`, `LL-NN-LL` (L=letra, N=número), longitud total 6-7 caracteres.
16. **El código postal aparece cerca de "INCISO" (7-9 líneas después), dentro de bloques que empiezan con "INFORMACION DEL ASEGURADO" cerca de "C.P.:" (7-9 líneas), o cerca de "ENDOSO" (10 líneas después)** — de nuevo evidencia de múltiples ubicaciones del mismo dato en distintas secciones/layouts del PDF de Qualitas, resuelto por voto de frecuencia.
17. **El municipio aparece en formato "Municipio: X Estado: Y" en la misma línea**, o en su defecto, se ubica geométricamente entre la línea donde aparece el código postal y la línea donde aparece el nombre de un estado válido.
18. **El tipo de vehículo usa una taxonomía fija de Qualitas**: "Automóviles Nacionales", "Automóviles Importados", "Camiones-Panel", "Motocicletas", "Tractocamión" — aparece cerca de "DESCRIPCIÓN DEL VEHÍCULO ASEGURADO".
19. **La dirección del asegurado está justo antes de la línea del código postal**, dentro del bloque entre "INFORMACIÓN DEL ASEGURADO" y "DESCRIPCIÓN DEL VEHÍCULO ASEGURADO"; alternativamente, aparece 2-6 líneas después de la fecha de inicio de vigencia y contiene palabras típicas de domicilio mexicano (MZA, LTE, CALLE, AV., COLONIA, etc.).
20. **La descripción del vehículo (marca/submarca/año) aparece cerca de la palabra "English"** (aparentemente parte de un aviso bilingüe en el documento), en formato numérico de 2-5 dígitos (posiblemente el año del modelo) seguido del texto de descripción; o bien, aparece justo antes de la fecha de inicio de vigencia dentro del bloque de asegurado; o 7 líneas antes de "INFORMACIÓN DEL ASEGURADO" en un layout distinto — descartando si el texto cae dentro de párrafos legales conocidos (avisos de privacidad, cláusulas del Art. 25 de la Ley del Contrato de Seguro, etc.).
21. **La colonia aparece 6-9 líneas después de "COLONIA:"**, validada porque unas líneas antes debe existir un nombre de estado mexicano válido (para descartar falsos positivos); alternativamente es la penúltima línea del bloque de asegurado, o aparece justo después de una línea que contiene el nombre del municipio.

**Constantes de negocio identificadas** (candidatas directas a tablas de referencia, no de layout):
- `ESTADOS_MX`: catálogo de 32 estados de México (con y sin variantes como "MEXICO"/"ESTADO DE MEXICO").
- `DESCARTAR_PATTERNS`: 7 frases legales/boilerplate de Qualitas que nunca son la descripción del vehículo.
- `otras_aseguradoras`: catálogo de competidores para descartar documentos que no son de Qualitas.
- Catálogo de tipos de póliza, formas de pago, monedas, tipos de vehículo — mencionados arriba.

---

## 14. Clasificación final

### A) Debe permanecer como código
- `leer_pdf_completo` — I/O de PyMuPDF, sin conocimiento de negocio.
- El motor genérico de búsqueda: "buscar ancla → tomar línea N después → aplicar regex → normalizar → validar" debe convertirse en una función *genérica* reutilizable (parametrizada por los datos de §14B), no en 20 copias.
- Lógica de frecuencia/voto (`Counter`, "tomar el más común") — es un **algoritmo genérico**, aplicable a cualquier aseguradora, aunque hoy esté repetido función por función.
- Lógica de cascada de fallbacks (probar estrategia 1, si falla probar 2, etc.) — el *motor* de fallback es código; la *lista y orden* de estrategias por campo es dato.
- Utilidades genéricas: `normalizar_texto` (NFKD), limpieza de montos, limpieza de placas — son transformaciones universales, no específicas de Qualitas.
- `validar_placa` / formatos de placas mexicanas — es regla nacional de tránsito, no de Qualitas; puede permanecer como catálogo de código o migrar a datos si se prevén cambios de normativa (ej. nuevos formatos de placas por estado).

### B) Debe migrarse a SQLite (conocimiento configurable)
- **Todos los alias de etiquetas** (§2): "PRIMA NETA", "IMPORTE TOTAL"/"PRIMA TOTAL", "COLONIA:", "MOTOR", "SERIE", etc., por campo y por aseguradora.
- **Todos los offsets numéricos de línea** (§13, punto 6-8, 13, 16, 21): +8, +1, +7, +9-12, +45, rangos de barrido (30, 36 líneas) — es el conocimiento más volátil y el que más cambia entre plantillas de Qualitas.
- **Los regex específicos de formato de valor** por campo (monto con/sin signo, con/sin decimales; formatos de fecha; longitud de motor/serie) — parametrizables como "patrón de validación" por campo.
- **Las secciones/anclas de inicio y fin de bloque** (§6): "INFORMACIÓN DEL ASEGURADO", "DESCRIPCIÓN DEL VEHÍCULO ASEGURADO", marcadores de cierre (DESGLOSE, CONSIDERACIONES, IMPORTE, OBSERVACIONES).
- **El orden y definición de cada estrategia de fallback por campo** (§11) — qué método probar primero, segundo, tercero, y con qué parámetros (offset, ventana, sección).
- **Catálogos de valores válidos**: tipos de póliza, formas de pago, monedas, tipos de vehículo, `ESTADOS_MX`, `otras_aseguradoras`, `exclusiones_motor`, `palabras_excluidas`, `DESCARTAR_PATTERNS`.
- **Reglas de exclusión** (§10) en general — son listas de negocio, cambian con el tiempo (nuevas aseguradoras competidoras, nuevos modelos de motor, nuevas frases legales).
- La ambigüedad "INCISO como ancla de número de póliza" (§13.3) debe documentarse explícitamente como regla de negocio revisable, no solo migrarse ciegamente.

### C) Debe eliminarse (código muerto / duplicado / innecesario)
- `es_monto_valido` está **redefinida idénticamente 4 veces** (dentro de `extraer_gastos_expedicion`, `extraer_subtotal`, `extraer_prima_total`, `extraer_iva`) — debe unificarse en una sola función/regla de validación de monto.
- El patrón "buscar etiqueta → Counter → most_common" está duplicado casi textualmente en `extraer_forma_pago`, `extraer_moneda`, `extraer_tipo_poliza` — candidato a una sola función genérica "extraer_por_catalogo_de_valores".
- En `extraer_placas`, la variable `frases_validas` (no existe — es de `extraer_motor`) y en general **hay 9-10 estrategias acumuladas de placas sin que quede claro cuáles siguen siendo necesarias** en la práctica; algunas parecen redundantes entre sí (p. ej. los fallbacks 7, 8 y 9 al final de la función duplican lógica ya cubierta por `buscar_en_rango_lineas` y `buscar_con_regex`). Se recomienda auditar con datos reales cuáles estrategias disparan alguna vez y eliminar las que nunca ganan.
- `es_poliza_auto_qualitas`: el bloque `if any(aseg in texto_upper for aseg in otras_aseguradoras): return False` es lógicamente muerto — la función ya retorna `False` en el `if "QUALITAS" not in texto_upper:` sin importar el resultado del `any(...)` interno (ambas ramas retornan `False`). Es código confuso que simula una decisión que no toma.
- En `extraer_direccion`, hay un comentario/expectativa de que `extraer_descripcion_vehiculo` usa `extraer_cp`, pero no es así — verificar si esa dependencia estaba planeada y quedó incompleta, o si es simplemente independiente (afecta el mapa de dependencias, no es urgente pero conviene aclarar intención).
- Mensajes de "no encontrado" inconsistentes (`""`, `"No encontrado"`, `"S/N"`, `"No se encontró X"`) deberían normalizarse a un solo valor centinela (ej. `None`) en la capa de código, dejando el mensaje humano como responsabilidad de la capa de presentación — no es "conocimiento", es deuda técnica de contrato de función.

---

## Resumen ejecutivo para el rediseño

El archivo contiene, en esencia, **un solo algoritmo genérico repetido ~20 veces con parámetros distintos**: `ancla(s) textual(es) → estrategia de localización (offset / ventana / sección / tabla) → patrón de extracción/validación → normalización → fallback siguiente si falla → (opcional) voto por frecuencia`. El motor de extracción configurable debería modelar exactamente esos cinco componentes como datos por campo, y dejar en código únicamente el intérprete que los ejecuta en orden. El conocimiento más crítico y más volátil a preservar no son los regex (son en su mayoría genéricos y reutilizables entre aseguradoras), sino:
1. los **offsets de línea específicos de cada plantilla de Qualitas**,
2. las **anclas textuales exactas** (con sus variantes de acento) y
3. el **orden de las estrategias de fallback** por campo.
