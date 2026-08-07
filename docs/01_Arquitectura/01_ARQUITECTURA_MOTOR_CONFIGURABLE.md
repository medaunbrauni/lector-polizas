# Arquitectura del motor de extracción configurable

Documento de diseño arquitectónico. No contiene SQL, tablas, INSERT, migraciones ni código Python. Construye sobre [Auditoría Qualitas](../06_Auditorias/01_AUDITORIA_QUALITAS.md), [Auditoría GNP](../06_Auditorias/02_AUDITORIA_GNP.md) y [Modelo Declarativo](../03_Modelo_Declarativo/01_MODELO_DECLARATIVO_QUALITAS.md). Objetivo: eliminar `poliza_qualitas.py` y `poliza_gnp.py` como archivos con conocimiento hardcodeado, y sustituirlos por un único motor que interpreta configuración.

---

## 1. Flujo completo del motor (PDF → JSON)

```
PDF de entrada
   │
   ▼
[1] INGESTA
   Se abre el PDF, se extrae texto plano por página y estructura de bloques/líneas/spans
   con coordenadas (bbox). Salida: un objeto "documento leído", agnóstico de aseguradora.
   │
   ▼
[2] DETECCIÓN DE ASEGURADORA
   El motor consulta la configuración de TODAS las aseguradoras registradas y evalúa,
   para cada una, sus reglas de clasificación (palabras obligatorias, palabras de
   confirmación, exclusiones). No hay "if es Qualitas" en el código: hay un bucle
   genérico "para cada aseguradora configurada, evalúa su regla de clasificación".
   Salida: identificador de aseguradora (o "no reconocida" → detiene el pipeline).
   │
   ▼
[3] DETECCIÓN DE LAYOUT / PLANTILLA
   Dada la aseguradora, el motor consulta sus layouts configurados (ej. "Qualitas 2022",
   "Qualitas 2024", "Qualitas Empresarial") y evalúa las reglas de detección de cada uno
   (huellas textuales, presencia/ausencia de ciertas anclas, estructura de página).
   Si ningún layout específico matchea, se cae al layout "default" de esa aseguradora.
   Salida: identificador de layout. A partir de aquí, TODA la configuración restante
   se resuelve en el contexto (aseguradora, layout) — nunca solo aseguradora.
   │
   ▼
[4] LOCALIZACIÓN DE SECCIONES
   El motor consulta las secciones configuradas para (aseguradora, layout) y ejecuta,
   por cada una, su regla de detección de inicio/fin (texto, posición, o ambos).
   Salida: un mapa de secciones resueltas → cada una con su rango (líneas o coordenadas).
   Si una sección no se encuentra, queda marcada como "no disponible" — no es un error
   fatal, simplemente los campos que dependan de ella no podrán usar esa sección como
   ámbito de búsqueda y probarán su siguiente estrategia.
   │
   ▼
[5] RESOLUCIÓN DE ORDEN DE CAMPOS
   El motor consulta el grafo de dependencias entre campos (algunos campos, como
   "Dirección", dependen del valor ya resuelto de otro campo, como "Código Postal").
   Se calcula un orden topológico de evaluación. Los campos sin dependencias se
   evalúan primero (y pueden paralelizarse); los dependientes esperan a que su
   campo de referencia tenga resultado.
   │
   ▼
[6] BUCLE DE EXTRACCIÓN POR CAMPO (se repite para cada campo configurado)
   │
   ├─ [6.1] Selección de la lista de estrategias del campo, ordenadas por prioridad.
   │
   ├─ [6.2] Para la estrategia actual:
   │        a) Resolver el ámbito de búsqueda (todo el documento, una sección, o
   │           relativo a otro campo ya resuelto).
   │        b) Ejecutar el método de la estrategia (etiqueta+offset, bbox geométrico,
   │           regex, tabla, frecuencia, ventana, etc.) con sus parámetros configurados.
   │        c) Si produce uno o más candidatos, pasar al paso de validación.
   │        d) Si no produce nada, pasar a la SIGUIENTE estrategia (por prioridad).
   │
   ├─ [6.3] VALIDACIÓN del candidato (formato: RFC, VIN, CP, placa, monto, pertenencia
   │        a catálogo, según lo configurado para el campo). Si falla, se descarta el
   │        candidato y se continúa con la siguiente estrategia (no se detiene el campo).
   │
   ├─ [6.4] NORMALIZACIÓN del candidato validado (uppercase, unicode, title case,
   │        limpieza de caracteres, formateo específico como el guion de placas).
   │
   ├─ [6.5] Si hubo múltiples candidatos válidos acumulados (estrategia de frecuencia,
   │        o varias fuentes), se resuelve por la regla de desempate configurada
   │        (más frecuente, primero encontrado, más cercano geométricamente, etc.).
   │
   └─ [6.6] Si se agotaron todas las estrategias sin candidato válido, se asigna el
            "valor por defecto" configurado para el campo (que puede ser vacío, un
            texto descriptivo, o null — decisión de configuración, no del motor).
   │
   ▼
[7] ENSAMBLADO DEL RESULTADO
   El motor construye el diccionario/JSON de salida siguiendo la configuración de
   PRESENTACIÓN por (aseguradora, layout): qué campos exponer, con qué etiqueta
   visible, en qué orden, con qué formato adicional (ej. prefijo "$"). Esto es lo que
   hoy vive hardcodeado en `app.py` — también se convierte en dato.
   │
   ▼
[8] TRAZABILIDAD (opcional pero recomendable)
   El motor puede registrar, por campo, qué estrategia ganó, qué candidatos se
   descartaron y por qué. Esto no es negocio, es observabilidad — ver §12.
   │
   ▼
JSON final
```

Ningún paso de este flujo menciona "Qualitas" o "GNP". El pipeline es el mismo para cualquier aseguradora; lo único que cambia es qué filas de configuración se leen en cada paso.

---

## 2. Componentes principales y responsabilidades

| Componente | Responsabilidad | Qué debe consultar | Qué JAMÁS debe conocer |
|---|---|---|---|
| **`pdf_reader`** (hoy disperso en `leer_pdf_completo`) | Abrir el PDF, extraer texto plano y estructura de bloques/líneas/spans con bbox. Es la única pieza que toca PyMuPDF directamente. | Nada de configuración — es pura I/O. | Nada sobre aseguradoras, campos, ni reglas. No debe existir ni una constante con el nombre de una aseguradora. |
| **`detector`** (clasificador de aseguradora + layout) | Ejecutar las reglas de clasificación de aseguradora y de layout contra el texto/estructura ya leídos. Devuelve `(aseguradora_id, layout_id)`. | Configuración de reglas de clasificación (por aseguradora) y de detección de layout (por aseguradora+layout). | El *contenido* semántico de los campos de negocio (no necesita saber qué es "Prima Total"). Solo necesita las reglas de clasificación, que son datos, no lógica de negocio de extracción. |
| **`section_locator`** | Dado `(aseguradora, layout)` y el documento leído, resolver el rango (textual o geométrico) de cada sección configurada. | Configuración de secciones por `(aseguradora, layout)`. | Qué campos existen ni para qué se usará cada sección — solo resuelve rangos. |
| **`rule_engine`** (el corazón del motor) | Orquestar, para cada campo, la cascada de estrategias: seleccionar ámbito, invocar el método de extracción correspondiente, aplicar validación y normalización, resolver desempates, aplicar fallback. | Configuración completa de campos, estrategias, catálogos de regex/validaciones/normalizaciones/exclusiones, y los resultados de `detector`/`section_locator`. | No conoce PyMuPDF directamente (delega en `pdf_reader` los datos ya leídos); no tiene ninguna rama de código condicionada al nombre de una aseguradora. |
| **`strategy_library`** (catálogo de métodos ejecutables) | Contener la implementación genérica de cada estrategia del catálogo (§4): "buscar por etiqueta y offset", "buscar por bbox geométrico", "buscar por regex", "buscar por tabla", etc. Cada método recibe parámetros de datos, nunca literales de negocio embebidos. | Solo sus propios parámetros de entrada (pasados por `rule_engine`). | No conoce el nombre del campo que está resolviendo, ni la aseguradora. Un método de esta librería podría usarse igual para extraer "RFC de Qualitas" o "Número de Cliente de una aseguradora nueva" sin ninguna modificación. |
| **`validators`** | Implementar los validadores genéricos (RFC, VIN, CP, placa mexicana, monto, pertenencia a catálogo). | Solo el valor candidato y los parámetros del validador (patrón, catálogo). | No conoce campos ni aseguradoras — un validador de "placa mexicana" es válido para cualquier aseguradora que opere en México. |
| **`normalizers`** | Implementar las normalizaciones genéricas (uppercase, NFKD, strip, title case, limpieza de caracteres, formateos con parámetros). | Solo el valor y los parámetros de la normalización. | Igual que `validators`: cero conocimiento de negocio. |
| **`output_formatter`** | Ensamblar el JSON final según la configuración de presentación por `(aseguradora, layout)`: nombres visibles, orden, prefijos/sufijos de formato. | Configuración de presentación + resultados ya extraídos. | No vuelve a tocar el PDF ni re-ejecuta extracción; es una capa de traducción "resultado interno → contrato de salida". |
| **`config_repository`** (antes `database.py`, ampliado conceptualmente) | Único punto de acceso a la configuración almacenada (aseguradoras, layouts, secciones, campos, estrategias, catálogos). Expone consultas, nunca lógica de negocio. | La base de datos. | No debe contener ninguna regla de negocio propia — es una capa de acceso a datos, no un intérprete. Si `config_repository` empieza a tener `if aseguradora == "qualitas"`, la arquitectura se rompió. |
| **`ai_service` / `ai_utils`** (rol acotado, ver §13) | Actuar como una **estrategia más** dentro del catálogo (§4) para los casos en que ninguna estrategia determinista resuelva el campo — nunca como sustituto del motor de reglas. | El texto/sección relevante y el nombre semántico del campo a extraer (para prompting), configurado también como dato (plantilla de prompt por campo, si aplica). | No debe decidir qué aseguradora es, ni ejecutar lógica de negocio determinista — es un método de último recurso, auditable como cualquier otro. |
| **`clasificador_service`** (ya existente en el proyecto — ver `api/services/clasificador_service.py`) | Si el proyecto ya distingue "clasificar tipo de documento" de "extraer campos", este servicio debería reducirse a invocar `detector` y devolver el resultado — no debe tener su propia copia de reglas de clasificación. | Los mismos datos que `detector`. | Nada nuevo — es una posible capa de aplicación sobre `detector`, no una segunda fuente de verdad. |

**Principio rector de esta tabla**: cualquier componente que necesite un `if` que mencione el nombre de una aseguradora está mal diseñado. La única excepción legítima es un *seed* de datos inicial (fuera del código de ejecución).

---

## 3. Pipeline de extracción — orden correcto y por qué

1. **Detección de aseguradora antes que nada**: sin saber la aseguradora, no hay ninguna configuración que cargar. Es el filtro de entrada obligatorio.
2. **Detección de layout inmediatamente después**: la aseguradora sola no basta (Qualitas 2022 ≠ Qualitas 2024 en offsets/anclas). El layout decide qué versión de la configuración de secciones/campos aplica. Debe resolverse antes de tocar secciones porque las anclas de sección pueden cambiar entre layouts.
3. **Secciones antes que campos**: varios campos restringen su búsqueda a una sección (ver auditorías). Resolver secciones primero permite que la búsqueda de campos sea más precisa y más rápida (no hay que barrer el documento completo si ya se sabe el rango).
4. **Orden de campos por dependencia, no alfabético ni arbitrario**: campos como "Dirección" (depende de "C.P.") o "Nombre del cliente" (depende de "Fin de Vigencia") necesitan que su campo de referencia ya tenga resultado. Este orden se calcula, no se hardcodea.
5. **Dentro de cada campo, estrategias en cascada por prioridad**: el motor prueba la estrategia 1; si no produce un candidato que pase validación, prueba la 2, y así sucesivamente. Esto es exactamente el patrón de fallback ya identificado en la auditoría (offsets 8→1, ventanas 36→30, etc.), generalizado.
6. **Validación antes que normalización**: se valida el dato crudo (para decidir si el candidato es aceptable) y luego se normaliza el dato ya aceptado (para presentarlo). Invertir el orden arriesgaría normalizar (y por tanto alterar) un valor que después resulta inválido.
7. **Resolución de empates/frecuencia como paso explícito**, no implícito dentro de cada método — para que cualquier estrategia pueda opcionalmente acumular varios candidatos y decidir al final, en vez de que cada método reimplemente su propio criterio de "cuál gano".
8. **Fallback a valor por defecto solo al agotar todas las estrategias configuradas** — nunca antes, y siempre como último paso explícito, configurable por campo (no un valor fijo global tipo `""` para todos).
9. **Ensamblado del resultado al final**, separado de la extracción — permite cambiar el formato de salida (JSON, nombres visibles, orden) sin tocar ninguna lógica de extracción.

---

## 4. Catálogo de estrategias (ampliado)

Basado en el catálogo ya identificado en la auditoría, mas las estrategias que GNP demostró y algunas adicionales necesarias para generalizar:

| Estrategia | Descripción | Parámetros típicos |
|---|---|---|
| `POR_ETIQUETA_Y_OFFSET` | Ancla textual + desplazamiento fijo de líneas (o múltiples offsets candidatos) | etiqueta(s)/alias, offset o lista de offsets |
| `POR_ETIQUETA_Y_VENTANA` | Ancla textual + rango de líneas a explorar, con regla de "primer match" o "último match" | etiqueta(s), tamaño de ventana, criterio de selección |
| `POR_REGEX` | Aplicación directa de un patrón de regex sobre un ámbito (línea, sección, documento completo) | referencia a regex del catálogo, ámbito |
| `POR_REGEX_MULTIPLE` | Lista de regex alternativos, probados en orden hasta el primero que matchee | lista ordenada de referencias a regex |
| `POR_ALIAS` | Variante de "por etiqueta" donde la propia resolución de alias es el mecanismo (probar cada alias configurado como ancla equivalente) | grupo de alias |
| `POR_FRECUENCIA` | Recolectar todos los candidatos de una o varias fuentes y devolver el más repetido | fuentes a combinar, criterio de desempate secundario |
| `POR_SECCION` | Acotar la búsqueda al rango ya resuelto de una sección configurada, delegando en otra estrategia dentro de ese rango | referencia a sección, estrategia interna a aplicar |
| `POR_TABLA` | Requiere estructura de bloques/líneas (no solo texto). Detecta una fila de encabezados de tabla y ubica el valor en la celda correspondiente | patrón de encabezados de columna, offset de fila |
| `POR_COORDENADAS_MISMA_FILA` | Búsqueda geométrica: valor a la derecha de la etiqueta, dentro de tolerancia vertical | tolerancia de fila, distancia mínima horizontal |
| `POR_COORDENADAS_MISMA_COLUMNA` | Búsqueda geométrica: valor debajo de la etiqueta, dentro de tolerancia horizontal | tolerancia de columna (x), distancia vertical máxima |
| `POR_COORDENADAS_MULTILINEA` | Como columna, pero concatenando varias líneas hasta un salto vertical excesivo | tolerancia x, distancia y máxima, máximo de líneas, salto máximo entre líneas |
| `POR_BLOQUE` | Delimitar un bloque de texto entre dos anclas (no necesariamente una "sección" formal) y buscar dentro | ancla de inicio, ancla(s) de fin, estrategia interna |
| `POR_DISTANCIA` | Generalización de "misma fila/columna": elegir el candidato geométricamente más cercano a la etiqueta según una función de distancia configurable | función de distancia, radio máximo |
| `RELATIVO_A_OTRO_CAMPO` | Usar el valor ya resuelto de otro campo como ancla o como filtro | campo de referencia, tipo de relación (offset desde su posición, exclusión de su valor, etc.) |
| `POR_POSICION_ENTRE_ANCLAS` | El valor está entre dos anclas dadas (ej. municipio entre CP y Estado) | ancla A, ancla B, regla de orden |
| `POR_LISTA_BLANCA` | El valor debe pertenecer a un catálogo cerrado; se busca cerca de una etiqueta y se valida contra el catálogo | etiqueta, referencia a catálogo de valores |
| `POR_EXCLUSION_DE_CANDIDATOS` | No es una estrategia de localización por sí misma, sino un filtro aplicable a cualquier otra: descarta candidatos que coincidan con un catálogo de exclusión | referencia a catálogo de exclusión |
| `POR_TEXTO_COMPLETO` | Sin ancla ni sección: aplica un regex o catálogo directamente sobre todo el documento (último recurso) | patrón o catálogo |
| `POR_PAGINA_ESPECIFICA_O_RELATIVA` | Restringe la búsqueda a una página concreta (ej. "primera página", "última página que contenga X") — necesario para el caso de la sección Agente en GNP | índice de página o regla ("primera", "última con ancla") |
| `POR_IA_ASISTIDA` *(estrategia de último recurso, no determinista)* | Delega en un modelo de lenguaje la extracción cuando el resto de estrategias deterministas fallan; se trata como una estrategia más dentro de la misma cascada, con su propio nivel de prioridad (normalmente el último) | plantilla de prompt, ámbito de texto a enviar |

Esta lista es **cerrada pero extensible**: agregar una estrategia nueva significa escribir código una vez (en `strategy_library`) y queda disponible para todas las aseguradoras futuras sin que cada una necesite su propio código.

---

## 5. Modelo conceptual (entidades, sin tablas)

El árbol propuesto por el usuario es un buen punto de partida, pero necesita más profundidad para representar todo lo auditado. Modelo conceptual completo:

```
Aseguradora
   │
   ├─ Regla de Clasificación (cómo se detecta esta aseguradora en un texto)
   │
   └─ Layout (una o varias versiones/plantillas de esta aseguradora)
         │
         ├─ Regla de Detección de Layout (cómo distinguir esta versión de otra)
         │
         ├─ Sección (0 o más)
         │     └─ Regla de Detección de Sección (ancla de inicio, ancla(s) de fin,
         │        o margen de seguridad si no hay ancla de fin)
         │
         └─ Campo (0 o más)
               │
               ├─ Metadato del campo (nombre lógico, tipo de dato esperado,
               │  si es "de negocio" o "derivado/calculado")
               │
               ├─ Dependencia (0 o más) → referencia a otro Campo que debe
               │  resolverse antes (para estrategias RELATIVO_A_OTRO_CAMPO)
               │
               ├─ Grupo de Alias (0 o más) — todas las variantes textuales
               │  de la etiqueta que identifica a este campo
               │
               └─ Estrategia (1 o más, ordenadas por prioridad)
                     │
                     ├─ Tipo de Estrategia (referencia al catálogo de §4)
                     │
                     ├─ Parámetros de la Estrategia (offset, ventana, tolerancias
                     │  geométricas, ancla de sección a usar, campo de referencia...)
                     │  — la forma exacta de estos parámetros varía según el tipo
                     │  de estrategia, por lo que conceptualmente es una entidad
                     │  "parametrizable" distinta por tipo, no una fila plana única
                     │
                     ├─ Regex asociado (0 o más, referencia al Catálogo de Regex,
                     │  no una copia del patrón)
                     │
                     ├─ Validación asociada (0 o más, referencia al Catálogo de
                     │  Validaciones)
                     │
                     ├─ Normalización asociada (0 o más, referencia al Catálogo
                     │  de Normalizaciones, en el orden en que deben aplicarse)
                     │
                     ├─ Exclusión asociada (0 o más, referencia al Catálogo de
                     │  Exclusiones)
                     │
                     └─ Valor por Defecto (qué devolver si esta estrategia —y
                        todas las siguientes— fallan; normalmente solo se define
                        en la última estrategia del campo)

Catálogo de Regex          ─┐
Catálogo de Validaciones    │  Entidades TRANSVERSALES, no dependen de
Catálogo de Normalizaciones │  ninguna Aseguradora/Layout/Campo — se
Catálogo de Exclusiones     │  REFERENCIAN desde Estrategia, nunca se
Catálogo de Valores (listas │  duplican por aseguradora.
  blancas: monedas, formas  │
  de pago, tipos de vehículo│
  por aseguradora, si son  ─┘
  propios) — nota: algunos catálogos de valores SÍ son específicos de
  aseguradora (ej. taxonomía de tipos de vehículo de Qualitas vs. GNP),
  por lo que este catálogo puede tener variantes "globales" y variantes
  "con dueño" (aseguradora) — ver §6 y §7.

Documento (una instancia real de PDF procesado)
   │
   ├─ resuelve → Aseguradora + Layout (resultado de la etapa de detección)
   ├─ resuelve → 0 o más instancias de Sección (con su rango concreto)
   └─ produce → Resultado
                  │
                  └─ 1 valor resuelto por Campo, más metadato de trazabilidad
                     (qué estrategia ganó, qué candidatos se descartaron)

Perfil de Presentación (por Aseguradora + Layout, o compartido)
   └─ define, por Campo: nombre visible en el JSON de salida, orden,
      formato adicional (prefijos, sufijos) — separado del Campo en sí,
      porque la misma extracción puede presentarse distinto según el
      consumidor de la API (ej. si en el futuro hay un cliente que quiere
      los campos en otro idioma o con otra forma).
```

**Diferencia clave frente al árbol simple propuesto por el usuario**: se añaden explícitamente (a) los **catálogos transversales** como entidades de primer nivel fuera de la jerarquía Aseguradora→Layout→Sección→Campo (para que sean reutilizables sin duplicación), (b) la **dependencia entre campos** como relación explícita, (c) el **Layout** como nivel obligatorio entre Aseguradora y Sección/Campo (no opcional — incluso si una aseguradora hoy solo tiene un layout, debe modelarse como "layout default" desde el día uno, para no tener que migrar el esquema el día que aparezca un segundo layout), y (d) el **Perfil de Presentación** separado del Campo, para no mezclar "qué es el dato" con "cómo se ve en la salida".

---

## 6. Componentes reutilizables (compartibles entre aseguradoras)

| Componente | Por qué es reutilizable |
|---|---|
| **Motor de ejecución de estrategias** (`strategy_library`) | El *algoritmo* de "buscar por etiqueta+offset" o "buscar por bbox misma fila" no depende de qué aseguradora sea — son operaciones genéricas sobre texto/estructura de página. |
| **Regex de formato universal** (RFC, CP, monto, fecha, VIN/serie con norma ISO, formatos de placa mexicana) | Son reglas **regulatorias o de formato nacional/internacional**, no inventadas por ninguna aseguradora. Un RFC tiene el mismo formato sin importar quién asegura el vehículo. |
| **Validadores** (RFC, VIN, CP, placa, monto) | Consecuencia directa de lo anterior: si el formato es universal, el validador también lo es. |
| **Normalizadores** (uppercase, NFKD, strip, title case, limpieza de caracteres) | Son transformaciones de texto puras, sin ningún conocimiento de seguros. |
| **Catálogo de estrategias en sí** (el "menú" de métodos disponibles, §4) | Cualquier aseguradora nueva elige entre las mismas piezas; no necesita inventar una estrategia nueva salvo un caso de layout genuinamente inédito (raro, y aun así se añade una vez y queda disponible para todas). |
| **Motor de resolución de dependencias entre campos** | El algoritmo de "ordena los campos según qué depende de qué" es un algoritmo de grafos estándar, ajeno a seguros. |
| **Motor de detección de aseguradora/layout** (el intérprete de reglas de clasificación) | El *mecanismo* de "evaluar una regla de clasificación contra un texto" es genérico; lo específico son los datos de la regla (qué palabras buscar), no el mecanismo. |
| **Exclusiones de tipo "formato nacional"** (ej. catálogo de 32 estados de México, formatos de placa por norma de tránsito) | Aunque hoy viven "dentro" del extractor de una aseguradora, en realidad describen México, no a Qualitas ni a GNP — deberían ser catálogos globales, referenciables por cualquier aseguradora que opere en el país. |
| **Motor de resolución de desempates por frecuencia** | Algoritmo genérico de conteo/votación, no de negocio. |

---

## 7. Componentes específicos (exclusivos de una aseguradora/layout)

| Componente | Por qué es específico |
|---|---|
| **Alias/etiquetas exactas por campo** | Cada aseguradora imprime sus propias etiquetas ("PRIMA NETA" en Qualitas vs. "Prima Neta" con otra capitalización/posición en GNP) — es un hecho de diseño de formulario de esa aseguradora. |
| **Offsets de línea y parámetros geométricos (bbox)** | Dependen exactamente del layout visual de cada plantilla — el mismo concepto de negocio puede estar 1 línea o 45 líneas después de su etiqueta según la aseguradora y el layout. |
| **Anclas de sección** | "INFORMACIÓN DEL ASEGURADO" (Qualitas) vs. "CONTRATANTE" (GNP) son nombres de sección completamente distintos para el mismo concepto de negocio (el cliente). |
| **Reglas de clasificación de aseguradora** | La palabra obligatoria ("QUALITAS" vs. ausencia de ese requisito en GNP) y las palabras de confirmación son propias de cada aseguradora. |
| **Reglas de detección de layout** | Qué distingue "Qualitas 2022" de "Qualitas 2024" es, por definición, un hecho específico de esas dos versiones concretas. |
| **Catálogos de valores propios de negocio** (ej. taxonomía de "Tipo de Vehículo" de Qualitas: Automóviles Nacionales/Importados/Camiones-Panel/Motocicletas/Tractocamión) | Aunque *podrían* coincidir entre aseguradoras, no hay garantía — deben modelarse como catálogo "con dueño" (aseguradora), con la posibilidad de que dos aseguradoras referencien el mismo catálogo si de hecho comparten la taxonomía. |
| **RFC corporativo propio a excluir** (ej. `GNP9211244P0`) | Es un dato literal de esa aseguradora específica. |
| **Frases legales/boilerplate a excluir** (ej. avisos de privacidad de Qualitas) | Texto legal propio de cada aseguradora, cambia si la aseguradora actualiza su aviso de privacidad. |
| **Perfil de presentación de salida** (nombres visibles, si lleva "$", orden de campos) | Cada aseguradora, en el sistema actual, define su propio contrato de salida — aunque a futuro podría estandarizarse. |

---

## 8. Múltiples layouts por aseguradora (el punto crítico)

**El error de diseño a evitar**: modelar "Aseguradora" como si tuviera un único conjunto de reglas. La auditoría ya demostró que **incluso dentro de Qualitas existen al menos 2 layouts reales** (evidenciado por los offsets alternativos: "Forma de Pago" a veces está 1 línea después, a veces 45 líneas después — eso no es un fallback aleatorio, es la huella de dos plantillas distintas coexistiendo).

**Solución arquitectónica**:

1. **Layout es una entidad de primera clase, no un caso especial.** Toda configuración de secciones, campos y estrategias se ata a `(aseguradora, layout)`, nunca solo a `aseguradora`. Incluso si hoy solo existe un layout por aseguradora, se registra igual como "layout default" — así, cuando aparezca un segundo layout, es una operación de **alta de datos**, no de cambio de esquema.

2. **Detección de layout como paso explícito del pipeline** (§1, paso 3), con sus propias reglas (huellas textuales o estructurales que distinguen una versión de otra), evaluadas *después* de saber la aseguradora pero *antes* de tocar secciones/campos.

3. **Herencia opcional entre layouts de la misma aseguradora** (recomendado, no obligatorio en la primera versión): un layout nuevo puede declarar "hereda de layout X" y solo sobreescribir las secciones/campos que cambian, en vez de redefinir los 23 campos desde cero. Esto reduce drásticamente el trabajo de mantenimiento cuando una aseguradora saca una versión nueva de su póliza que cambia solo 2-3 campos. (Si se quiere evitar la complejidad de un mecanismo de herencia real en la primera versión, la alternativa más simple es "clonar y editar" — funcionalmente correcta, solo menos elegante.)

4. **Un layout puede no tener nombre "de versión" reconocible** (ej. "Qualitas Empresarial" vs. "Qualitas Individual" no son una progresión temporal, son variantes de producto). El modelo no debe asumir que layout = versión cronológica; layout = "cualquier variante de plantilla visual/estructural", sea por fecha, por tipo de producto, o por canal de emisión.

5. **La detección de layout debe tener un layout "catch-all" o "default"** para el caso en que ninguna regla específica matchee, en vez de fallar duro — así un documento ligeramente distinto a lo esperado aún puede procesarse con la configuración más genérica disponible, y solo lo que dependa de anclas específicas de un layout no reconocido quedará sin resolver campo por campo (degradación parcial, no fallo total).

6. **Cambiar de formato no debe "romper el sistema"** porque: (a) agregar un layout nuevo es insertar filas de configuración, no tocar el motor; (b) si un documento no matchea ningún layout conocido, cae al layout default en vez de lanzar una excepción; (c) cada campo falla de forma aislada (valor por defecto) sin tumbar la extracción completa de los demás campos — el pipeline nunca debe ser "todo o nada".

---

## 9. Extensibilidad — cómo agregar una aseguradora nueva sin escribir Python

Proceso completo, puramente de datos:

1. **Registrar la Aseguradora**: nombre, y su Regla de Clasificación (palabra obligatoria, palabras de confirmación, opcionalmente exclusiones de competidores — reutilizando el catálogo global de aseguradoras conocidas si aplica).
2. **Registrar al menos un Layout** para esa aseguradora (puede llamarse "default" si aún no hay evidencia de múltiples versiones), con su Regla de Detección de Layout (puede ser trivial: "siempre matchea" si es el único layout).
3. **Registrar las Secciones** relevantes de ese layout: nombre lógico, ancla(s) de inicio, ancla(s) de fin (o margen de seguridad).
4. **Registrar los Campos**: para cada campo de negocio que se quiera extraer, su nombre lógico, sus alias/etiquetas, y su tipo de dato esperado.
5. **Registrar las Estrategias de cada Campo**, en orden de prioridad, eligiendo entre las estrategias ya existentes en el catálogo (§4) y configurando sus parámetros (offset, ventana, tolerancias, referencias a regex/validaciones/normalizaciones/exclusiones del catálogo global, o a catálogos de valores propios de esta aseguradora si el campo lo requiere).
6. **Registrar el Perfil de Presentación**: nombre visible de cada campo en el JSON de salida, orden, formato adicional.
7. **(Opcional) Registrar catálogos de valores propios** si el campo usa listas blancas específicas de esta aseguradora que no existen aún en el catálogo global (ej. una taxonomía de tipos de vehículo distinta a la de Qualitas/GNP).
8. **Probar contra PDFs reales** — el motor ya sabe ejecutar el pipeline completo; solo hay que validar que la configuración capturada produce los resultados esperados, e iterar ajustando datos (offsets, tolerancias, alias) sin tocar ningún archivo de código.

En ningún paso se crea un archivo `.py` nuevo. Si en algún punto del proceso alguien piensa "necesito escribir una función especial para esta aseguradora", es una señal de que falta una estrategia genérica en el catálogo (§4) — y esa sí es una tarea de ingeniería única, que beneficia a todas las aseguradoras futuras, no una tarea por cliente.

---

## 10. Qué debe seguir siendo código (y por qué)

| Elemento | Por qué nunca debe vivir en SQLite |
|---|---|
| **Lectura del PDF / manejo de PyMuPDF** | Es interacción con una librería externa y con el sistema de archivos; no es conocimiento de negocio, es infraestructura. Meterlo en datos no aportaría flexibilidad, solo complejidad. |
| **El intérprete/orquestador del pipeline** (`rule_engine`) | El *orden* en que se ejecutan las etapas (detectar → secciones → campos → estrategias → validar → normalizar → ensamblar) es la arquitectura misma del sistema. Si esto se volviera configurable también, se estaría reinventando un lenguaje de programación dentro de la base de datos — complejidad sin beneficio real. |
| **La implementación de cada estrategia del catálogo** (el algoritmo de "cómo se busca por bbox misma fila", "cómo se calcula frecuencia", etc.) | Es lógica algorítmica pura, no una decisión de negocio de ninguna aseguradora. Cambia solo cuando se descubre una forma genuinamente nueva de localizar un valor — evento raro, no por-aseguradora. |
| **La implementación de cada validador/normalizador** | Mismo argumento: "cómo se valida un RFC" es una función determinista universal, no un dato. |
| **El motor de resolución de dependencias entre campos (orden topológico)** | Algoritmo de grafos genérico. |
| **La capa de acceso a datos (`config_repository`)** | Es el código que sabe *cómo* leer la configuración, no *qué* configuración existe. |
| **Manejo de errores, logging, trazabilidad, seguridad, autenticación de la API** | Infraestructura transversal de cualquier sistema, no conocimiento de extracción documental. |
| **La estrategia `POR_IA_ASISTIDA` como mecanismo** (la llamada al modelo, el manejo de su respuesta) | El *cómo* invocar un LLM es código; el *qué* preguntarle (plantilla de prompt por campo, si se decide parametrizarla) sí puede ser dato. |

Regla general: **si cambiarlo requiere pensar como programador (algoritmo, estructura de control, integración técnica), es código. Si cambiarlo requiere pensar como analista de negocio/documentos (dónde está impreso este dato, cómo se llama, qué formato tiene), es dato.**

---

## 11. Qué debe vivir exclusivamente en la base de datos

| Elemento | Por qué es dato y no código |
|---|---|
| **Aseguradoras y sus reglas de clasificación** | Cambian por catálogo comercial (nuevas aseguradoras que se integran), no por lógica de programación. |
| **Layouts y sus reglas de detección** | Cambian cada vez que una aseguradora actualiza su plantilla — evento de negocio frecuente y externo al equipo de desarrollo. |
| **Secciones y sus anclas** | Son hechos sobre el diseño visual de cada plantilla, no sobre el software. |
| **Campos** (catálogo de qué se extrae por aseguradora/layout) | Qué información le importa al negocio extraer de cada tipo de póliza es una decisión de producto, no de arquitectura de software. |
| **Alias por campo** | Vocabulario específico de cada formulario — dato puro. |
| **Estrategias asignadas a cada campo, en orden de prioridad** | Es la decisión de "cómo se busca este dato en este documento", que depende 100% del layout físico, no de un algoritmo universal. |
| **Parámetros de cada estrategia** (offsets, ventanas, tolerancias geométricas x/y, referencias a sección) | Son medidas empíricas del layout — literalmente números obtenidos de mirar PDFs reales, no derivaciones lógicas. |
| **Referencias a regex/validaciones/normalizaciones/exclusiones usadas por cada estrategia** | La *asociación* "este campo usa este regex" es una decisión de configuración; el regex en sí puede ser reutilizable (catálogo global) pero su asociación a un campo específico es dato de ese campo. |
| **Catálogos de regex, validaciones, normalizaciones y exclusiones en sí** (aunque el algoritmo que los ejecuta sea código) | El *patrón* de un regex, o la *lista* de estados/palabras excluidas, cambia por descubrimiento de nuevos casos reales (ej. una nueva forma de escribir una fecha) sin que cambie el algoritmo que lo aplica. |
| **Prioridades y orden de fallback** | Es la estrategia de negocio de "qué probar primero" — cambia con la experiencia sobre qué funciona mejor para cada campo/layout. |
| **Coordenadas y tolerancias de bbox** | Igual que los offsets: son mediciones del layout físico. |
| **Dependencias entre campos** | Es conocimiento de "este dato se ubica en relación a otro dato ya conocido" — una regla de negocio sobre cómo está organizado el documento. |
| **Reglas de exclusión/negocio no-programáticas** (RFC corporativo a excluir, frases legales a descartar, catálogo de valores especiales como "TRÁMITE" o "PERMISO") | Hechos específicos sobre cómo cada aseguradora redacta sus documentos. |
| **Perfil de presentación de salida** | Es un contrato de API que puede cambiar por requerimiento de un consumidor, sin que cambie ninguna lógica de extracción. |
| **Plantillas de prompt para la estrategia `POR_IA_ASISTIDA`** (si se usa) | El *contenido* de qué preguntar es dato; el mecanismo de invocación es código (ver §10). |

---

## 12. Riesgos y mitigaciones

| Riesgo | Descripción | Mitigación propuesta |
|---|---|---|
| **Complejidad de configuración** | Un motor totalmente genérico puede volverse difícil de razonar ("¿por qué este campo devolvió esto?") porque la lógica ya no está en un archivo legible, sino distribuida en filas de datos. | Trazabilidad obligatoria (§1, paso 8): registrar qué estrategia ganó y por qué en cada extracción. Herramienta de "explicar resultado" que reconstruya la cascada ejecutada para un campo dado, en lenguaje humano, a partir de los logs/trazas. |
| **Rendimiento** | Consultar configuración en cada extracción (por campo, por estrategia) puede introducir overhead de base de datos si no se cachea. | Cargar toda la configuración de `(aseguradora, layout)` una sola vez al inicio del procesamiento de un documento (una consulta, no N), y mantenerla en memoria durante todo el pipeline de ese documento. SQLite además es embebido — el costo de lectura es bajo si se evita hacer una consulta por cada micro-decisión. |
| **Mantenibilidad de datos vs. mantenibilidad de código** | El riesgo se traslada: ya no hay que mantener código Python por aseguradora, pero hay que mantener *configuración correcta* — y datos mal configurados pueden ser tan difíciles de depurar como código con bugs, con la desventaja de que no hay tests automáticos "de fábrica" sobre filas de una tabla. | Definir una capa de **validación de configuración** (no de PDFs, de la config en sí): al guardar un campo nuevo, verificar que sus referencias a regex/validaciones existan, que no haya ciclos en las dependencias entre campos, que cada campo tenga al menos una estrategia y un valor por defecto. Complementar con un conjunto de PDFs de prueba por (aseguradora, layout) que se re-ejecuten cada vez que cambia su configuración (una suite de regresión de datos, no de código). |
| **Versionado de configuración** | Si se edita una estrategia en producción, ¿qué pasa con la trazabilidad histórica de documentos ya procesados con la versión anterior? | Tratar los cambios de configuración con el mismo rigor que un cambio de esquema: mantener un histórico de versiones de configuración (o al menos fecha de vigencia por regla), de forma que sea posible saber con qué configuración se procesó un documento específico en el pasado, aunque hoy la configuración ya sea distinta. |
| **Aparición de layouts nuevos no anticipados** | Una aseguradora cambia su plantilla sin aviso y el detector de layout no la reconoce. | El layout "default"/catch-all (§8, punto 5) evita el fallo total. Además, registrar cuándo un documento cae al layout default con baja confianza, como señal para que un humano revise y registre el layout nuevo. |
| **Ambigüedad entre aseguradoras** (dos aseguradoras cuyas reglas de clasificación podrían matchear el mismo documento) | Si las reglas de clasificación no son suficientemente discriminantes, un documento podría clasificarse con la aseguradora incorrecta. | Requerir que la regla de clasificación de cada aseguradora incluya al menos una condición "positiva fuerte" (ej. nombre propio de la aseguradora) y no solo palabras genéricas de la industria (lección ya visible en la auditoría: el clasificador de GNP es más laxo que el de Qualitas y es más propenso a falsos positivos). Ejecutar la detección contra *todas* las aseguradoras y, si más de una matchea, aplicar una regla de desempate explícita (ej. la que tenga más señales positivas, o marcar como "ambiguo" para revisión manual) en vez de quedarse con la primera que matchee por orden arbitrario. |
| **Sobre-genericidad / parálisis de diseño** | Intentar anticipar cada estrategia imaginable antes de tener una segunda o tercera aseguradora real puede llevar a construir abstracciones que nunca se usan. | Diseñar el catálogo de estrategias (§4) a partir de lo que **ya se demostró necesario** en Qualitas y GNP (evidencia real, no especulación), y tratar cualquier estrategia adicional como algo que se agrega la primera vez que una aseguradora real la requiera, no antes. |
| **Costo de la estrategia asistida por IA** (si se usa) | Latencia y costo variable comparado con estrategias deterministas. | Modelarla explícitamente como la estrategia de **última prioridad** en la cascada de un campo, nunca la primera — solo se invoca cuando todo lo determinista ya falló. |

---

## 13. Recomendaciones sobre la arquitectura actual (crítica constructiva)

Observaciones directas sobre el estado real del proyecto (`api/services/*`, `app.py`, los dos extractores auditados):

1. **`poliza_qualitas.py` y `poliza_gnp.py` son, en esencia, dos implementaciones parciales del mismo framework**, en distintos niveles de madurez. GNP ya construyó gran parte de `strategy_library` (motor de posición geométrica) sin saberlo — el trabajo de generalización no parte de cero, parte de refactorizar y despojar de literales de negocio lo que GNP ya resolvió bien en código.

2. **`app.py` mezcla tres responsabilidades que deberían separarse**: (a) transporte HTTP (recepción de archivo, manejo de errores HTTP), (b) selección de qué extractor usar (hoy resuelta por *endpoint distinto*, debería resolverse por *detección automática* dentro de un único endpoint), (c) forma de la respuesta (hoy hardcodeada por aseguradora, debería ser el Perfil de Presentación de §5). Cuando el motor configurable exista, `app.py` debería reducirse a un único endpoint `/extraer_poliza` que reciba el PDF, delegue todo a `rule_engine`, y devuelva lo que este produzca.

3. **El nombre de archivo temporal fijo por aseguradora es un riesgo de concurrencia real** (ya señalado en la auditoría GNP) — debe resolverse independientemente de esta migración, con un identificador único por request.

4. **La existencia de `_extraer_placas_legacy` dentro de `poliza_gnp.py`** (una copia reducida de la cascada de placas de Qualitas) es evidencia de que, sin un catálogo de estrategias compartido, el conocimiento se re-inventa en cada archivo en vez de reutilizarse — exactamente el problema que este framework resuelve de raíz.

5. **`ai_utils.py` y `clasificador_service.py`** deberían, tras la migración, tener responsabilidades muy acotadas: `clasificador_service` se convierte en una capa fina sobre `detector` (o se fusiona con él), y `ai_utils` se convierte en la implementación de la estrategia `POR_IA_ASISTIDA` del catálogo — no en un camino paralelo de extracción que compita con el motor de reglas.

6. **Recomendación de secuencia de migración** (no pedida explícitamente, pero relevante para la crítica): no migrar los 23+28 campos de una sola vez. Empezar por los campos cuya estrategia ya es más simple y más estable (ej. Vigencia, Serie, RFC) para validar el motor genérico end-to-end con pocos campos, y solo después migrar los campos con cascadas largas (Placas, Descripción del Vehículo) una vez que el intérprete esté probado. Migrar todo de golpe con un motor sin probar es el mayor riesgo práctico de este rediseño.

7. **No sobre-diseñar el mecanismo de herencia entre layouts (§8, punto 3) en la primera versión.** Es una optimización de mantenimiento, no un requisito funcional — sin ella, el sistema funciona igual (solo se duplica configuración entre layouts parecidos). Añadirla prematuramente es exactamente el tipo de complejidad que un framework de este tipo debe evitar hasta que la necesidad sea real (varios layouts por aseguradora, en producción, con evidencia de que la duplicación duele).

---

## 14. Resultado final esperado — checklist de cumplimiento

| Requisito | Cómo lo satisface este diseño |
|---|---|
| El motor nunca conoce una aseguradora específica | Todo el pipeline (§1) opera sobre `(aseguradora_id, layout_id)` resueltos dinámicamente; ningún componente (§2) tiene ramas condicionadas a un nombre de aseguradora |
| Toda la inteligencia de negocio vive en SQLite | Inventario completo en §11: clasificación, layouts, secciones, campos, alias, estrategias, parámetros, catálogos, dependencias, presentación |
| Agregar una aseguradora implica solo insertar registros | Proceso completo descrito en §9, sin ningún paso de creación de archivo `.py` |
| No se crean archivos Python por aseguradora | `poliza_qualitas.py` y `poliza_gnp.py` desaparecen; queda un único conjunto de módulos genéricos (§2) que se reutiliza para cualquier aseguradora presente o futura |
| Escalable y mantenible | Catálogos transversales evitan duplicación (§6); riesgos identificados con mitigación concreta (§12); crítica honesta sobre deuda actual y ruta de migración incremental (§13) |
| Preparado para múltiples layouts por aseguradora | Layout como entidad de primera clase desde el diseño inicial, con detección explícita y comportamiento de degradación parcial ante layouts desconocidos (§8) |

Este documento es la base conceptual. El siguiente paso natural — **fuera de este alcance por instrucción explícita** — sería traducir el modelo conceptual de §5 a un esquema de tablas concreto.
