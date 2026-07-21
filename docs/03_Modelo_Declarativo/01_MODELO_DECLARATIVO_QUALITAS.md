# Modelo declarativo del extractor Qualitas

Punto de partida: `poliza_qualitas.py` no existe. Todo lo que ese archivo sabía se describe aquí como configuración pura — etiquetas, alias, posiciones, regex por nombre, validaciones, fallbacks. Ningún fragmento de Python. Basado en [Auditoría Qualitas](../06_Auditorias/01_AUDITORIA_QUALITAS.md).

Convención de ficha: cada campo tiene una lista ordenada de **estrategias** (prioridad 1, 2, 3...). Cada estrategia declara método, parámetros, y qué pasa si no produce valor (pasa a la siguiente prioridad). Cuando el campo original resolvía por "voto de frecuencia" entre varias fuentes, se declara como estrategia `frecuencia` con sus fuentes.

---

## 1. Fichas técnicas — todos los campos de Qualitas

### Campo: Tipo de Póliza
- **Aseguradora**: Qualitas
- **Sección**: Ninguna (búsqueda en todo el documento)
- **Prioridad 1 — Estrategia**: Buscar_por_regex_en_cada_linea
  - Regex: `Regex_Plan_Poliza` → `PLAN:\s*(AMPLIA|LIMITADA|BÁSICA|RESPONSABILIDAD CIVIL)`
  - Resolución si hay múltiples matches: `frecuencia` (el valor más repetido gana)
- **Prioridad 2 — Fallback — Estrategia**: Buscar_por_frecuencia_texto_completo
  - Catálogo de valores: `AMPLIA`, `LIMITADA`, `BÁSICA`, `RESPONSABILIDAD CIVIL`
  - Cuenta ocurrencias literales de cada valor en todo el texto; gana el más frecuente
- **Normalización**: Uppercase (comparación) → Title_Case (resultado final)
- **Validación**: Pertenece al catálogo de valores válidos
- **Valor si no se encuentra**: `""`

---

### Campo: Número de Póliza
- **Aseguradora**: Qualitas
- **Sección**: Ninguna
- **Prioridad 1 — Estrategia**: Buscar_por_regex
  - Regex: `Regex_Inciso_Poliza` → `INCISO\s+(\d{7,15})`
  - ⚠️ Nota de negocio (ambigüedad heredada, ver auditoría §13.3): usa "INCISO" como ancla del número de póliza; debe confirmarse con negocio si es correcto o histórico
- **Prioridad 2 — Fallback — Estrategia**: Buscar_por_regex (lista de patrones alternativos, se prueban en orden)
  - Regex: `Regex_Poliza_Alias_1` → `P[oó]liza\s*(?:No\.|Núm\.?|Número)?\s*[:\-]?\s*([A-Z0-9\-]{6,20})`
  - Regex: `Regex_Poliza_Alias_2` → `No\.?\s*de\s*P[oó]liza\s*[:\-]?\s*([A-Z0-9\-]{6,20})`
  - Regex: `Regex_Poliza_Alias_3` → `N°\s*P[oó]liza\s*[:\-]?\s*([A-Z0-9\-]{6,20})`
- **Normalización**: Eliminar_espacios_extremos (strip)
- **Validación**: Ninguna estructural (solo el propio regex de captura)
- **Valor si no se encuentra**: `"No encontrado"`

---

### Campo: RFC del Asegurado
- **Aseguradora**: Qualitas
- **Sección**: Información del asegurado (usada como criterio de preferencia, no de recorte estricto)
- **Prioridad 1 — Estrategia**: Buscar_por_regex_con_exclusion_y_frecuencia
  - Regex: `Regex_RFC` → `\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{0,3}\b`
  - Exclusión: `Exclusion_Codigos_Motor` (ver catálogo de exclusiones)
  - Preferencia: RFC de longitud 12-13 (estándar) sobre longitud 10 (truncado)
  - Preferencia secundaria: el RFC que aparece dentro del bloque de sección "Información del asegurado"
  - Resolución final si hay varios candidatos válidos: `frecuencia`
- **Normalización**: Uppercase
- **Validación**: `Validacion_RFC`
- **Valor si no se encuentra**: `"No se encontraron RFCs válidos"`

---

### Campo: Prima Neta
- **Aseguradora**: Qualitas
- **Sección**: Desglose de primas
- **Etiqueta**: `PRIMA NETA`
- **Prioridad 1 — Estrategia**: Buscar_por_etiqueta_y_desplazamiento
  - Posición: 8 líneas debajo
  - Regex de valor: `Regex_Monto_Con_Signo_Opcional` → `\$?\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?`
- **Prioridad 2 — Fallback — Estrategia**: Buscar_por_etiqueta_y_desplazamiento
  - Posición: 1 línea debajo (mismo regex)
- **Normalización**: Eliminar_espacios_internos
- **Validación**: `Validacion_Monto`
- **Valor si no se encuentra**: `"No se encontró PRIMA NETA"`

---

### Campo: Tasa de Financiamiento
- **Aseguradora**: Qualitas
- **Sección**: Desglose de primas
- **Etiqueta**: `TASA FINANCIAMIENTO`
- **Prioridad 1**: Buscar_por_etiqueta_y_desplazamiento — Posición: 8 líneas debajo — Regex: `Regex_Monto_Con_Signo_Negativo` → `-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?`
- **Prioridad 2 — Fallback**: Buscar_por_etiqueta_y_desplazamiento — Posición: 1 línea debajo (mismo regex)
- **Normalización**: Ninguna adicional
- **Validación**: `Validacion_Monto` (variante que acepta signo negativo)
- **Valor si no se encuentra**: `"No se encontró tasa de financiamiento"`

---

### Campo: Gastos de Expedición
- **Aseguradora**: Qualitas
- **Sección**: Desglose de primas
- **Alias de etiqueta**: `GASTOS POR EXPEDICIÓN`, `GASTOS DE EXPEDICIÓN`
- **Prioridad 1**: Buscar_por_etiqueta_y_desplazamiento — Posición: 8 líneas debajo — Regex: `Regex_Monto_Decimal_Estricto` → `-?\d{1,3}(?:,\d{3})*\.\d{2}`
- **Prioridad 2 — Fallback**: Buscar_por_etiqueta_y_desplazamiento — Posición: 1 línea debajo (mismo regex)
- **Validación**: `Validacion_Monto_Estricto` (debe matchear desde el inicio del valor)
- **Valor si no se encuentra**: `"No se encontró gastos de expedición"`

---

### Campo: Subtotal
- **Aseguradora**: Qualitas
- **Sección**: Desglose de primas
- **Etiqueta**: `SUBTOTAL`
- **Prioridad 1**: Buscar_por_etiqueta_y_desplazamiento — Posición: 8 líneas debajo — Regex: `Regex_Monto_Decimal_Estricto`
- **Prioridad 2 — Fallback**: Buscar_por_etiqueta_y_desplazamiento — Posición: 1 línea debajo (mismo regex)
- **Validación**: `Validacion_Monto_Estricto`
- **Valor si no se encuentra**: `"No se encontró subtotal"`

---

### Campo: Prima Total
*(el ejemplo dado por el usuario — se documenta con el detalle exacto solicitado)*

| Atributo | Valor |
|---|---|
| Campo | Prima Total |
| Aseguradora | Qualitas |
| Sección | Desglose de primas |
| Etiqueta | `IMPORTE TOTAL` |
| Alias | `PRIMA TOTAL` |
| Método principal | Buscar por etiqueta y desplazamiento |
| Posición | 7 líneas debajo |
| Regex utilizado | `Regex_Monto_Decimal_Estricto` |
| Prioridad | 1 |
| Fallback (prioridad 2) | Ventana de 36 líneas debajo de la etiqueta; si hay varios montos válidos, toma el **último** |
| Segundo fallback (prioridad 3) | Ventana de 30 líneas debajo de la etiqueta; toma el último monto válido |
| Normalización | Ninguna adicional (el regex ya excluye espacios) |
| Validación | Validación de monto decimal estricto (`Validacion_Monto_Estricto`) |
| Valor si no se encuentra | `"No se encontró prima total"` |

---

### Campo: Nombre o razón social del cliente
- **Aseguradora**: Qualitas
- **Sección**: Información del asegurado
- **Etiqueta**: `INFORMACION DEL ASEGURADO` / `INFORMACIÓN DEL ASEGURADO`
- **Prioridad 1 — Estrategia**: Buscar_por_seccion_inline_o_ventana
  - Si tras la etiqueta (misma línea, tras `:`) hay texto y no contiene `Exclusion_Palabras_No_Nombre` → se usa ese texto
  - Si no, ventana de 6 líneas debajo; cada candidato se acepta si matchea `Regex_Terminacion_Razon_Social` **o** cumple heurística `Regex_Heuristica_Nombre_Mayusculas` (≥2 palabras, ≥5 caracteres) y no está en `Exclusion_Palabras_No_Nombre`
- **Prioridad 2 — Fallback — Estrategia**: Buscar_relativo_a_otro_campo
  - Campo de referencia: Fin de Vigencia (ya extraído)
  - Ubica la línea donde aparece esa fecha; evalúa hasta 2 líneas debajo con los mismos criterios de aceptación que prioridad 1
- **Prioridad 3 — Fallback — Estrategia**: Buscar_por_etiqueta_y_desplazamiento
  - Etiqueta: `FAX` — Posición: 7 líneas debajo
- **Normalización**: Title_Case (resultado final)
- **Validación**: Heurística de forma (mayúsculas, longitud, ausencia de exclusiones) — no hay validador estructural estricto
- **Valor si no se encuentra**: `"No se encontró nombre o razón social"`

---

### Campo: Vigencia — Inicio y Fin
- **Aseguradora**: Qualitas
- **Sección**: Ninguna (texto completo, normalizado)
- **Prioridad 1 — Estrategia**: Buscar_por_regex_multiple_y_frecuencia
  - Normalización previa obligatoria: `Normalizacion_Unicode_NFKD` (quita acentos antes de aplicar regex)
  - Catálogo de regex de fecha (se aplican todos, se acumulan resultados): `Regex_Fecha_DDMMYYYY_Slash`, `Regex_Fecha_DDMMYYYY_Guion`, `Regex_Fecha_YYYYMMDD_Guion`, `Regex_Fecha_Texto_Largo` (`DD de MES de AAAA`), `Regex_Fecha_Mes_Abreviado` (`DD/MES3/AAAA`)
  - Resolución: `frecuencia` — las 2 fechas más repetidas del documento son, en orden, Inicio y Fin de Vigencia
- **Normalización**: Ninguna sobre el valor final (se devuelve tal cual matcheó)
- **Validación**: Solo sintáctica (formato), no valida rango de fechas real
- **Valor si no se encuentra**: `{"Inicio Vigencia": "No encontrada", "Fin Vigencia": "No encontrada"}`

---

### Campo: I.V.A. 16%
- **Aseguradora**: Qualitas
- **Sección**: Desglose de primas
- **Alias de etiqueta**: `I.V.A.`, `IVA`
- **Prioridad 1 — Estrategia**: Buscar_por_etiqueta_y_desplazamiento
  - Posición: 7 líneas debajo — Regex: `Regex_Monto_Decimal_Estricto`
- **Prioridad 2 — Fallback — Estrategia**: Buscar_por_regex_y_desplazamiento
  - Ancla alternativa: `Regex_Porcentaje_IVA` → `16\s*%`
  - Posición: 1 línea debajo del porcentaje
- **Validación**: `Validacion_Monto_Estricto`
- **Valor si no se encuentra**: `"No se encontró I.V.A."`

---

### Campo: Forma de Pago
- **Aseguradora**: Qualitas
- **Sección**: Ninguna
- **Etiqueta**: `FORMA DE PAGO`
- **Prioridad 1 — Estrategia**: Buscar_por_etiqueta_y_desplazamiento_con_lista_blanca
  - Posición: 1 línea debajo — el valor debe pertenecer al catálogo `Catalogo_Formas_Pago`
- **Prioridad 2 — Fallback — Estrategia**: Buscar_por_etiqueta_y_desplazamiento_con_lista_blanca
  - Posición: 45 líneas debajo (layout alterno de Qualitas — ver conocimiento de negocio §13.8 de la auditoría)
- **Prioridad 3 — Fallback — Estrategia**: Buscar_por_frecuencia_texto_completo
  - Catálogo: `Catalogo_Formas_Pago` → `CONTADO`, `SEMESTRAL`, `TRIMESTRAL`, `MENSUAL`, `ANUAL`
- **Normalización**: Title_Case
- **Validación**: Pertenece al catálogo
- **Valor si no se encuentra**: `"Forma de pago no encontrada"`

---

### Campo: Moneda
- **Aseguradora**: Qualitas
- **Sección**: Ninguna
- **Etiqueta**: `MONEDA`
- **Prioridad 1 — Estrategia**: Buscar_por_etiqueta_y_desplazamiento_con_lista_blanca
  - Posición: 1 línea debajo — catálogo: `Catalogo_Monedas` → `PESOS`, `DÓLARES`, `USD`, `MXN`, `EUROS`, `EUR`
- **Prioridad 2 — Fallback — Estrategia**: Buscar_por_frecuencia_texto_completo (mismo catálogo)
- **Normalización**: Title_Case
- **Validación**: Pertenece al catálogo
- **Valor si no se encuentra**: `"Moneda no encontrada"`

---

### Campo: Motor
- **Aseguradora**: Qualitas
- **Sección**: Vehículo asegurado (implícita, no recortada explícitamente)
- **Etiqueta**: `MOTOR`
- **Prioridad 1 — Estrategia**: Buscar_por_etiqueta_y_desplazamiento_multiple
  - Posiciones candidatas (se prueban en orden): 9, 10, 11 líneas debajo
  - Aceptación: matchea `Regex_Alfanumerico_Motor` (`[A-Z0-9]{9,13}`) **o** contiene alguna frase del catálogo `Catalogo_Frases_Fabricacion` (`HECHO EN`, `FABRICADO EN`, `ENSAMBLADO EN`)
- **Normalización**: Title_Case si es una frase de fabricación
- **Validación**: Heurística de longitud (no valida checksum real)
- **Valor si no se encuentra**: `"S/N"`

---

### Campo: Serie (VIN)
- **Aseguradora**: Qualitas
- **Sección**: Vehículo asegurado (implícita)
- **Etiqueta**: `SERIE`
- **Prioridad 1 — Estrategia**: Buscar_inline_en_misma_linea
  - Regex: `Regex_Alfanumerico_Serie` → `[A-Z0-9]{12,17}`
- **Prioridad 2 — Fallback — Estrategia**: Buscar_por_etiqueta_y_desplazamiento_multiple
  - Posiciones candidatas: 9, 10, 11, 12 líneas debajo (mismo regex)
- **Validación**: Heurística de longitud (no valida VIN real, a diferencia de la versión GNP que sí excluye I/O/Q)
- **Valor si no se encuentra**: `"S/N"`

---

### Campo: Placas
*(el campo más complejo del archivo — 6 estrategias en cascada)*
- **Aseguradora**: Qualitas
- **Sección**: Información del asegurado / Vehículo asegurado (variable según estrategia)
- **Caso especial (corta todo lo demás)**: si el texto contiene la palabra `TRÁMITE`, el valor es literalmente `"TRÁMITE"`
- **Prioridad 1 — Estrategia**: Buscar_por_seccion_y_ventana
  - Anclas de sección: `INFORMACIÓN DEL ASEGURADO`, `DESCRIPCIÓN DEL VEHÍCULO ASEGURADO`
  - Ventana: 11 líneas debajo de cada ancla, validando con `Validacion_Placa`
- **Prioridad 2 — Fallback — Estrategia**: Buscar_por_etiqueta_y_ventana
  - Etiqueta: `placas:` / `placa:` — Ventana: 11 líneas, validando con `Validacion_Placa`
- **Prioridad 3 — Fallback — Estrategia**: Buscar_por_tabla
  - Requiere estructura de bloques/líneas del documento (no solo texto plano)
  - Ancla: fila que contiene simultáneamente "modelo" y "placas"
  - Extrae valor inline con regex, o toma la línea inmediatamente siguiente dentro del mismo bloque
- **Prioridad 4 — Fallback — Estrategia**: Buscar_por_sección_delimitada
  - Recorta el bloque "Vehículo asegurado" (desde esa ancla hasta `DESGLOSE`/`CONSIDERACIONES`/`IMPORTE`/`OBSERVACIONES`)
  - Dentro del bloque, aplica regex con lookahead de límite (`Motor`, `Serie`, `Modelo`)
- **Prioridad 5 — Fallback — Estrategia**: Buscar_por_regex_texto_completo
  - Catálogo de 5 regex crecientemente permisivos, se prueban en orden, cada candidato validado con `Validacion_Placa`
- **Prioridad 6 — Fallback — Estrategia**: Buscar_por_etiqueta_y_desplazamiento
  - Etiqueta: `placas:`/`placa:` — Posición: 7 líneas debajo — validación de longitud (5-10 caracteres), sin validar formato estricto
- **Prioridad 7 — Fallback — Estrategia**: Buscar_por_seccion_delimitada_y_split
  - Recorta sección `DESCRIPCIÓN DEL VEHÍCULO ASEGURADO`; dentro, busca línea con `placas:`/`placa:`, toma el texto tras `:`, exige longitud exacta 5
- **Prioridad 8 — Fallback absoluto — Estrategia**: Buscar_por_etiqueta_inline_sin_validar
  - Cualquier línea con `placas:`/`placa:`, toma el texto tras `:` sin validar formato
- **Normalización**: `Normalizacion_Limpiar_No_Alfanumerico` + `Formateo_Placa_Con_Guion` (inserta guion según longitud 6 o 7)
- **Validación**: `Validacion_Placa`
- **Valor si no se encuentra**: `"No encontrado"`

---

### Campo: Código Postal (C.P.)
- **Aseguradora**: Qualitas
- **Sección**: Información del asegurado (para una de las 3 fuentes)
- **Prioridad única, con resolución por frecuencia — Estrategia**: Buscar_por_multiples_anclas_y_frecuencia
  - Fuente 1: Etiqueta `INCISO`, ventana 7-9 líneas debajo, valor debe matchear `Regex_CP` (`\d{4,5}`)
  - Fuente 2: Etiqueta `C.P.:`, buscada dentro de cada bloque delimitado por `INFORMACIÓN DEL ASEGURADO`, ventana 7-9 líneas debajo
  - Fuente 3: Etiqueta `ENDOSO`, posición fija 10 líneas debajo, valor debe matchear `\b\d{5}\b`
  - Resolución: todas las coincidencias de las 3 fuentes se acumulan y se devuelve la de mayor frecuencia
- **Validación**: `Validacion_CP`
- **Valor si no se encuentra**: `""`

---

### Campo: Municipio
- **Aseguradora**: Qualitas
- **Sección**: Ninguna explícita
- **Etiqueta**: `Municipio`
- **Prioridad 1 — Estrategia**: Buscar_por_regex_misma_linea
  - Regex: `Municipio\s*:\s*(.*?)\s*Estado\s*:` — el valor no debe estar en `Exclusion_Estados_MX` ni matchear formato de CP
- **Prioridad 2 — Fallback — Estrategia**: Buscar_por_regex_misma_linea_simple
  - Regex: `Municipio\s*:\s*(.+)` (sin exigir "Estado:" en la misma línea), mismas exclusiones
- **Prioridad 3 — Fallback — Estrategia**: Buscar_por_posicion_relativa_entre_anclas
  - Ventana de 15 líneas desde la etiqueta
  - Ubica el índice de un CP (`Regex_CP`) y el índice de un Estado válido (`Exclusion_Estados_MX`)
  - El municipio es el texto entre ambos índices, si el Estado aparece después del CP
- **Validación**: No debe coincidir con un estado válido, no debe ser un número de 4-5 dígitos
- **Valor si no se encuentra**: `""`

---

### Campo: Tipo de Vehículo
- **Aseguradora**: Qualitas
- **Sección**: Vehículo asegurado
- **Etiqueta**: `DESCRIPCIÓN DEL VEHÍCULO ASEGURADO`
- **Prioridad 1 — Estrategia**: Buscar_por_etiqueta_y_ventana_con_catalogo
  - Ventana: 11 líneas debajo
  - Aceptación: la línea matchea alguno de los patrones del catálogo `Catalogo_Tipos_Vehiculo` (al inicio de línea), o hay una etiqueta inline `Tipo:` cuyo valor matchea el catálogo
  - Si hay múltiples coincidencias en la ventana, resolución por `frecuencia`
- **Normalización**: Ninguna adicional (se devuelve tal cual aparece)
- **Validación**: Pertenece al catálogo `Catalogo_Tipos_Vehiculo`
- **Valor si no se encuentra**: `""`

---

### Campo: Dirección
- **Aseguradora**: Qualitas
- **Sección**: Información del asegurado → Vehículo asegurado (bloque delimitado)
- **Prioridad 1 — Estrategia**: Buscar_relativo_a_otro_campo
  - Campo de referencia: Código Postal (ya extraído dentro del mismo bloque)
  - El valor es la línea inmediatamente anterior a la línea donde aparece el CP
- **Prioridad 2 — Fallback — Estrategia**: Buscar_relativo_a_otro_campo_con_palabras_clave
  - Campo de referencia: Inicio de Vigencia
  - Ventana: 2-6 líneas debajo de la fecha, dentro del bloque acotado hasta "Información del asegurado"
  - Aceptación: la línea contiene alguna palabra de `Catalogo_Palabras_Direccion` (MZA, MZ, MANZANA, LTE, LOTE, CALLE, AV., AVENIDA, NO. EXT, NO. INT, COLONIA)
- **Prioridad 3 — Fallback — Estrategia**: Buscar_relativo_a_otro_campo (CP global, no solo el del bloque)
  - Igual que prioridad 1 pero sin acotar al bloque
- **Validación**: Ninguna estructural
- **Valor si no se encuentra**: `""`

---

### Campo: Descripción del Vehículo
- **Aseguradora**: Qualitas
- **Sección**: Información del asegurado → Información importante (bloque delimitado); también Póliza de Seguro de Automóviles → Información del asegurado
- **Prioridad 1 — Estrategia**: Buscar_por_etiqueta_y_ventana
  - Ancla: `English` — Ventana: 12-15 líneas debajo — Aceptación: la línea matchea formato numérico de 2-5 dígitos; se recolecta también la línea siguiente
- **Prioridad 2 — Estrategia (se acumula, no reemplaza)**: Buscar_relativo_a_otro_campo
  - Campo de referencia: Inicio de Vigencia, dentro del bloque "Información del asegurado" → "Información importante"
  - Se toma la línea inmediatamente anterior a la fecha
- **Prioridad 3 — Estrategia (se acumula)**: Buscar_por_desplazamiento_negativo_con_exclusion
  - Bloque: "Póliza de Seguro de Automóviles" → "Información del asegurado"
  - Posición: 7 líneas **antes** del final del bloque
  - Exclusión: `Exclusion_Frases_Legales` (`DESCARTAR_PATTERNS`) — si el candidato cae en alguna, se descarta (retorna vacío)
- **Resolución final**: `frecuencia` entre todos los candidatos acumulados de las 3 estrategias
- **Validación**: Exclusión de frases legales conocidas
- **Valor si no se encuentra**: `""`

---

### Campo: Colonia
- **Aseguradora**: Qualitas
- **Sección**: Información del asegurado (bloque delimitado hasta "Descripción del vehículo asegurado")
- **Etiqueta**: `COLONIA:`
- **Prioridad 1 — Estrategia**: Buscar_por_etiqueta_y_ventana_con_validacion_de_contexto
  - Ventana: 6-9 líneas debajo de la etiqueta
  - Validación de contexto: en alguna de las 5 líneas anteriores al candidato debe aparecer un Estado válido (`Exclusion_Estados_MX` usado aquí como catálogo de validación positiva, no de exclusión)
- **Prioridad 2 — Fallback — Estrategia**: Buscar_por_posicion_fija_relativa_al_bloque
  - Toma la penúltima línea del bloque completo
  - Misma validación de contexto (Estado válido en las 5 líneas anteriores)
- **Prioridad 3 — Fallback — Estrategia**: Buscar_relativo_a_otro_campo
  - Campo de referencia: Municipio (ya extraído)
  - Ubica la línea del municipio; si la línea siguiente contiene `COLONIA:`, toma el valor tras `:`
- **Normalización**: Title_Case
- **Validación**: Contexto de Estado válido cercano
- **Valor si no se encuentra**: `"No se encontró colonia"`

---

### Campo (clasificador, no de negocio): ¿Es póliza de auto Qualitas?
- **Aseguradora**: Qualitas
- **Prioridad 1 — Estrategia**: Buscar_por_catalogo_de_confirmacion
  - Requiere presencia de `QUALITAS` en el texto
  - Si no está presente → resultado `False` (independientemente de si hay otra aseguradora)
  - Si está presente, requiere además al menos una palabra de `Catalogo_Palabras_Auto` (`VEHÍCULO`, `COBERTURA`, `AUTOMÓVIL`, `USO PARTICULAR`, `PLACAS`)
- **Exclusión referenciada (no funcional, ver auditoría §14C)**: `Exclusion_Aseguradoras_Competidoras`
- **Valor de salida**: booleano

---

## 2. Catálogos de conceptos reutilizables

### Catálogo de Regex

| Nombre | Patrón (declarativo) | Uso |
|---|---|---|
| `Regex_Monto_Con_Signo_Opcional` | signo `$` opcional + entero con separador de miles + decimales opcionales | Prima Neta |
| `Regex_Monto_Con_Signo_Negativo` | signo `-` opcional + entero con separador de miles + decimales opcionales | Tasa de Financiamiento |
| `Regex_Monto_Decimal_Estricto` | signo `-` opcional + entero con separador de miles + **decimales obligatorios** | Gastos de Expedición, Subtotal, Prima Total, IVA |
| `Regex_Porcentaje_IVA` | `16` + `%` con espacios opcionales | IVA (ancla alternativa) |
| `Regex_RFC` | 3-4 letras/Ñ/& + 6 dígitos + 0-3 alfanumérico | RFC |
| `Regex_CP` | 4 o 5 dígitos | C.P., Municipio |
| `Regex_Fecha_DDMMYYYY_Slash` / `_Guion` / `Regex_Fecha_YYYYMMDD_Guion` / `Regex_Fecha_Texto_Largo` / `Regex_Fecha_Mes_Abreviado` | catálogo de 5 formatos de fecha | Vigencia |
| `Regex_Alfanumerico_Motor` | alfanumérico de 9 a 13 caracteres | Motor |
| `Regex_Alfanumerico_Serie` | alfanumérico de 12 a 17 caracteres | Serie |
| `Regex_Formatos_Placa` (5 variantes) | combinaciones letra/número mexicanas, longitud 6-7 | Placas |
| `Regex_Plan_Poliza` | `PLAN:` + catálogo de tipos | Tipo de Póliza |
| `Regex_Inciso_Poliza` / `Regex_Poliza_Alias_1/2/3` | variantes de ancla de número de póliza | Número de Póliza |
| `Regex_Terminacion_Razon_Social` | terminaciones legales (S.A. DE C.V., S. DE R.L., etc.) | Nombre del cliente |
| `Regex_Heuristica_Nombre_Mayusculas` | mayúsculas/acentos, ≥2 palabras, ≥5 caracteres | Nombre del cliente |

**Observación**: los regex de monto (`Regex_Monto_*`) son 3 variantes del mismo concepto que difieren solo en si el signo/los decimales son obligatorios — candidatos a unificarse en un solo `Regex_Monto` parametrizado por 2 flags (`signo_permitido`, `decimales_obligatorios`) en vez de 3 entradas de catálogo separadas.

---

### Catálogo de Estrategias (métodos de localización)

| Estrategia | Parámetros que necesita | Campos que la usan |
|---|---|---|
| `Buscar_por_etiqueta_y_desplazamiento` | etiqueta(s), offset de línea | Prima Neta, Tasa Financiamiento, Gastos Expedición, Subtotal, Prima Total, IVA, Forma de Pago, Moneda |
| `Buscar_por_etiqueta_y_desplazamiento_multiple` | etiqueta, lista de offsets candidatos | Motor, Serie |
| `Buscar_por_etiqueta_y_ventana` | etiqueta, tamaño de ventana | Placas (varias variantes) |
| `Buscar_por_ventana_sin_etiqueta_fija` | ancla, tamaño de ventana, criterio de aceptación | Prima Total (fallback), Tipo de Vehículo |
| `Buscar_por_regex` | patrón(es) de regex, sobre qué ámbito (línea/texto completo) | Número de Póliza, RFC, Serie (inline), Vigencia |
| `Buscar_por_regex_en_cada_linea` | patrón de regex aplicado línea por línea | Tipo de Póliza |
| `Buscar_por_frecuencia_texto_completo` | catálogo de valores candidatos | Tipo de Póliza (fallback), Forma de Pago (fallback), Moneda (fallback) |
| `Buscar_por_seccion_delimitada` | ancla de inicio, ancla(s) de fin | Placas, Dirección, Descripción del Vehículo, Colonia, C.P. |
| `Buscar_por_tabla` | estructura de bloques/líneas (no solo texto) | Placas |
| `Buscar_relativo_a_otro_campo` | campo de referencia ya extraído, offset relativo | Nombre del cliente, Dirección, Descripción del Vehículo, Colonia |
| `Buscar_por_posicion_relativa_entre_anclas` | ancla A, ancla B, regla de "está entre ambas" | Municipio |
| `Buscar_por_multiples_anclas_y_frecuencia` | lista de (ancla, offset), resolución por voto | C.P. |
| `Buscar_por_catalogo_de_confirmacion` | catálogo de palabras requeridas/prohibidas | Clasificador de aseguradora |

---

### Catálogo de Validaciones

| Validación | Regla |
|---|---|
| `Validacion_RFC` | Formato `Regex_RFC`; longitud 10, 12 o 13; no debe estar en `Exclusion_Codigos_Motor` |
| `Validacion_Placa` | Longitud exacta 6 o 7; debe matchear alguno de los 5 `Regex_Formatos_Placa` |
| `Validacion_Monto` | Matchea `Regex_Monto_Con_Signo_Opcional` o `_Negativo` según el campo |
| `Validacion_Monto_Estricto` | Debe matchear `Regex_Monto_Decimal_Estricto` desde el inicio del valor (no en cualquier posición) |
| `Validacion_CP` | Matchea `Regex_CP` (4-5 dígitos) |
| `Validacion_Formato_Vehiculo` (implícita, no formalizada en el original) | Longitud alfanumérica (Motor: 9-13, Serie: 12-17) — sin checksum real |
| `Validacion_Pertenece_A_Catalogo` | El valor debe estar exactamente en un catálogo de valores permitidos (Tipo de Póliza, Forma de Pago, Moneda, Tipo de Vehículo) |

---

### Catálogo de Normalizaciones

| Normalización | Descripción | Dónde se aplica |
|---|---|---|
| `Normalizacion_Uppercase` | Convierte todo a mayúsculas antes de comparar | Casi todos los campos, como paso previo a la búsqueda |
| `Normalizacion_Unicode_NFKD` | Descompone y elimina diacríticos (acentos) | Vigencia (para tolerar meses con/sin acento) |
| `Normalizacion_Eliminar_Espacios_Extremos` | `strip()` | Universal |
| `Normalizacion_Eliminar_Espacios_Internos` | Quita espacios dentro del valor (ej. montos con espacio accidental) | Prima Neta |
| `Normalizacion_Limpiar_No_Alfanumerico` | Elimina cualquier carácter que no sea letra o número | Placas, C.P. embebido en texto |
| `Formateo_Title_Case` | Convierte el resultado final a formato "Legible" (primera letra de cada palabra en mayúscula) | Tipo de Póliza, Nombre del cliente, Forma de Pago, Moneda, Colonia, Motor (frase de fabricación) |
| `Formateo_Placa_Con_Guion` | Inserta un guion en la posición correspondiente según longitud (6 o 7) | Placas |

---

### Catálogo de Exclusiones

| Catálogo | Contenido | Usado por |
|---|---|---|
| `Exclusion_Codigos_Motor` | `V6`, `V8`, `I4`, `H6`, `2ZRFE`, `1.6L`, `2.0L`, `TSI`, `TDI`, `DOHC`, `SOHC`, `TURBO`, `HYBRID`, `ELECTRIC` | RFC (evita falsos positivos) |
| `Exclusion_Estados_MX` | 32 estados de México (con variantes: "MEXICO"/"ESTADO DE MEXICO") | Municipio (exclusión), Colonia (como validación positiva de contexto) |
| `Exclusion_Palabras_No_Nombre` | `DOMICILIO`, `RFC`, `C.P`, `MUNICIPIO`, `ESTADO`, `VIGENCIA`, `TELEFONO`, `DESDE LAS`, `INFORMACIÓN IMPORTANTE`, `OFICINA`, `ATENCIÓN`, `CANAL` | Nombre del cliente |
| `Exclusion_Aseguradoras_Competidoras` | `GNP`, `AXA`, `MAPFRE`, `CHUBB`, `ZURICH`, `ANA SEGUROS`, `HDI`, `AFIRME`, `BANORTE`, `BBVA SEGUROS` | Clasificador (referenciada pero lógicamente inerte, ver auditoría §14C) |
| `Exclusion_Frases_Legales` | 7 frases de avisos legales/privacidad de Qualitas | Descripción del Vehículo |

---

### Catálogo de Secciones

| Sección | Ancla(s) de inicio | Ancla(s) de fin | Campos que delimita |
|---|---|---|---|
| `Seccion_Informacion_Asegurado` | `INFORMACION DEL ASEGURADO` / `INFORMACIÓN DEL ASEGURADO` | (variable según campo consumidor) | RFC, Nombre del cliente, C.P., Dirección, Descripción del Vehículo, Colonia |
| `Seccion_Vehiculo_Asegurado` | `VEHÍCULO ASEGURADO` | `DESGLOSE` / `CONSIDERACIONES` / `IMPORTE` / `OBSERVACIONES` | Placas |
| `Seccion_Descripcion_Vehiculo` | `DESCRIPCIÓN DEL VEHÍCULO ASEGURADO` | (implícita, ventana fija) | Placas, Tipo de Vehículo, Dirección, Colonia |
| `Seccion_Informacion_Importante` | `INFORMACIÓN IMPORTANTE` | — (usada como ancla de fin) | Descripción del Vehículo |
| `Seccion_Poliza_Seguro_Automoviles` | `PÓLIZA DE SEGURO DE AUTOMÓVILES` | `INFORMACIÓN DEL ASEGURADO` | Descripción del Vehículo |
| `Seccion_Desglose_Primas` | (implícita — no tiene ancla propia, se infiere por las etiquetas de monto) | — | Prima Neta, Tasa Financiamiento, Gastos de Expedición, Subtotal, Prima Total, IVA |

---

## 3. La pregunta final

> **Si mañana elimináramos completamente `poliza_qualitas.py`, ¿qué información tendría que existir para reconstruir exactamente el mismo comportamiento?**

Tendría que existir, para cada aseguradora (Qualitas incluida):

1. **Un registro de clasificación de aseguradora**: palabra(s) obligatoria(s) de identificación, catálogo de palabras de confirmación adicional, catálogo de aseguradoras competidoras a excluir.

2. **Un catálogo de secciones**: nombre lógico, lista de anclas de texto que la identifican (con sus variantes de acento/mayúscula), y cuál(es) ancla(s) marcan su cierre — o la regla de "sin ancla de cierre, usar margen fijo de N líneas/puntos".

3. **Una ficha por campo**, con:
   - Nombre del campo y aseguradora a la que pertenece.
   - Sección a la que está asociado (o "ninguna" si se busca en todo el documento).
   - Una **lista ordenada de estrategias** (prioridad 1, 2, 3...), donde cada estrategia declara:
     - el **método** (de un catálogo cerrado de métodos: por etiqueta+desplazamiento, por ventana, por regex, por tabla, por sección delimitada, relativo a otro campo, por frecuencia, por posición entre anclas),
     - los **parámetros** que ese método necesita (etiqueta o alias, offset o rango de offsets, tamaño de ventana, patrón de regex a usar del catálogo, campo de referencia si es relativo, catálogo de valores válidos si es por lista blanca),
     - **qué hacer si no produce resultado** (pasar a la siguiente prioridad, o terminar y devolver el valor por defecto).
   - La **normalización** a aplicar al resultado (de un catálogo cerrado: uppercase, unicode/NFKD, strip, title case, limpieza de caracteres, formateo específico como el guion de placas).
   - La **validación** a aplicar (de un catálogo cerrado: RFC, VIN/serie, CP, placa, monto, pertenencia a catálogo).
   - El **valor por defecto** cuando ninguna estrategia produce resultado (y si ese valor debe representarse como vacío, como texto descriptivo, o como nulo — hoy es inconsistente, y esa inconsistencia también debe decidirse como parte del diseño, no heredarse tal cual).

4. **Los catálogos reutilizables en sí** (regex, exclusiones, valores válidos por campo tipo lista-blanca) — no como parte de la ficha de cada campo, sino como entidades propias referenciadas por nombre desde las fichas, de modo que un mismo catálogo (ej. `Exclusion_Estados_MX`, o un futuro `Regex_Monto` unificado) se pueda compartir entre campos y entre aseguradoras sin duplicarse.

5. **Las relaciones de dependencia entre campos**: qué campos deben resolverse antes que otros porque sirven de referencia (ej. Vigencia antes que Nombre del cliente y Dirección; Municipio antes que Colonia; C.P. antes que Dirección) — es decir, un **orden de evaluación**, no solo una lista plana de campos independientes.

Con esos cinco bloques de información — clasificación, secciones, fichas de campo con sus estrategias en cascada, catálogos reutilizables, y orden de dependencia entre campos — un motor genérico que simplemente "siga las instrucciones" podría reproducir el comportamiento exacto de `poliza_qualitas.py` sin que exista una sola línea de código específica de Qualitas. El código que quedaría sería un intérprete único, agnóstico de aseguradora, que ejecuta esas cinco piezas de configuración en orden.
