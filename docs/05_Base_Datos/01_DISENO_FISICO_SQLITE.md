# Diseño físico de persistencia SQLite

Traducción del [Modelo Lógico de Persistencia](../04_Persistencia/01_MODELO_LOGICO_PERSISTENCIA.md) hacia SQLite. Sin `CREATE TABLE`, sin `INSERT`, sin `TRIGGER`, sin `VIEW`, sin ORM, sin código. Documentación técnica de diseño físico, pensada para que el SQL final sea mecánico.

---

## 1. Convenciones SQLite

### 1.1 `INTEGER PRIMARY KEY` y `AUTOINCREMENT`
Toda tabla de este esquema usa `INTEGER PRIMARY KEY` como clave sintética. En SQLite, una columna declarada exactamente así se convierte en alias del `rowid` interno de la tabla — la forma más eficiente de clave primaria posible en este motor (evita crear un índice B-tree adicional; el propio almacenamiento de la tabla es el índice).

**Decisión sobre `AUTOINCREMENT`: no se usa, salvo excepción justificada por tabla.** `AUTOINCREMENT` en SQLite impone un costo adicional (mantiene una tabla interna `sqlite_sequence` para garantizar que nunca se reutilice un ID, ni siquiera tras borrar la fila con el ID más alto). Para las tablas de este dominio, la reutilización de un ID tras un borrado no es un riesgo real: (a) casi todas las tablas usan soft delete, por lo que un ID borrado en duro es un caso raro y controlado; (b) las relaciones se resuelven por FK, no por referencias externas al ID que sobrevivan al ciclo de vida de la fila. Se reserva `AUTOINCREMENT` únicamente para `ExecutionLog` y `ExtractionResultLog` (ver §2.36-2.37), porque son tablas de auditoría append-only donde la garantía de "un ID nunca se repite ni siquiera tras compactación" tiene valor real para trazabilidad externa (ej. referencias en logs de aplicación fuera de la base de datos).

### 1.2 `BOOLEAN` mediante `INTEGER`
SQLite no tiene un tipo `BOOLEAN` nativo. Toda columna booleana se declara `INTEGER` con una restricción `CHECK` que limite el dominio a `0` o `1` (nunca se confía solo en la convención de la aplicación). Nombres de columna booleanas siempre en forma de pregunta afirmativa (`es_default`, `es_activo`, `permite_misma_fila`) para que `0`/`1` se lean sin ambigüedad.

### 1.3 Fechas y timestamps
SQLite no tiene tipo `DATETIME` nativo; se almacenan como `TEXT` en formato ISO-8601 (`YYYY-MM-DDTHH:MM:SSZ`, UTC siempre) — es el formato que SQLite reconoce nativamente para sus funciones de fecha (`date()`, `datetime()`, comparaciones lexicográficas correctas porque ISO-8601 ordena igual como texto que como fecha). Se descarta almacenar como `INTEGER` (epoch unix) porque, aunque más compacto, sacrifica legibilidad directa al inspeccionar la base de datos durante desarrollo/soporte — la ganancia de espacio no compensa la pérdida de operabilidad en un proyecto de este tamaño.

### 1.4 Enumeraciones
SQLite no tiene tipo `ENUM`. Dos mecanismos, elegidos según el caso:
- **Enumeraciones cerradas y estables de bajo nivel de motor** (ej. tipo de condición de clasificación: obligatoria/confirmación/exclusión; tipo de relación de dependencia) → columna `TEXT` con restricción `CHECK (columna IN (...))`. Es una enumeración fija que solo cambia si el motor evoluciona, no por captura de negocio — no necesita ser una tabla propia.
- **Enumeraciones abiertas o gobernadas por catálogo mantenido en datos** (`StrategyType`, tipos de validador, tipos de normalizador) → tabla de referencia propia (ya prevista en el modelo lógico), porque estas colecciones sí crecen con el tiempo (agregar un `StrategyType` nuevo es un evento esperado del roadmap) y una tabla permite además guardar metadatos por tipo (descripción, tabla de parámetros asociada) que un simple `CHECK` no podría.

### 1.5 Política de `NULL`
Regla general: **`NOT NULL` por defecto en toda columna que participe en una regla de negocio o de integridad**; `NULL` se permite explícitamente solo donde el modelo lógico ya declaró opcionalidad real (ej. `Layout.padre_layout_id`, catálogos con propietario opcional). Nunca se usa `NULL` como "valor por defecto perezoso" para columnas que en realidad siempre deberían tener un valor — evita la ambigüedad clásica de "¿está vacío a propósito o se olvidó de llenarse?".

### 1.6 Soft delete
Ver desarrollo completo en §5. Convención de columna: `esta_activo INTEGER NOT NULL DEFAULT 1` (con `CHECK` 0/1) en toda tabla que lo requiera — se prefiere una columna booleana de estado sobre una columna `eliminado_en` de timestamp nulable, porque simplifica los índices de filtrado (`WHERE esta_activo = 1` sobre una columna indexada booleana es más simple y igualmente eficiente que `WHERE eliminado_en IS NULL`) y porque, según §6, el "cuándo se desactivó" se puede derivar del registro de auditoría (`actualizado_en` en el momento en que `esta_activo` pasó a 0) sin duplicar la información en dos columnas.

### 1.7 Convenciones de nombres
- Tablas: `PascalCase` en singular (`Company`, `Layout`, `Field`) para las entidades de dominio — consistencia directa con el nombre de la entidad en el documento DDD, de forma que la trazabilidad entidad → tabla sea inmediata.
- Columnas: `snake_case` en español para atributos de negocio (`nombre`, `esta_activo`, `prioridad`), y sufijo `_id` para toda clave foránea (`company_id`, `layout_id`, `campo_requerido_id`). Se usa español para las columnas de negocio (coherente con los documentos previos, donde todo el vocabulario de dominio está en español) y se mantiene el nombre de tabla en PascalCase/inglés únicamente por trazabilidad 1:1 con las entidades DDD ya nombradas en inglés en el documento de dominio.
- Tablas de asociación N:M: concatenación de las dos tablas relacionadas (`StrategyRegex`, `FieldPresentation`) — señala explícitamente que es una tabla puente, no una entidad de negocio con nombre propio.
- Tablas satélite de parámetros polimórficos: prefijo `StrategyParameters` + sufijo del tipo (`StrategyParametersGeometric`) — hace explícita la relación 1:1 con `Strategy` desde el propio nombre.

### 1.8 Convenciones para claves foráneas
- Toda FK se declara con el nombre `<entidad_referenciada_en_singular>_id` (ej. `layout_id` referenciando `Layout.id`), salvo cuando una tabla tiene más de una FK hacia la misma tabla con roles distintos (`FieldDependency`), donde se antepone el rol (`campo_dependiente_id`, `campo_requerido_id`) para evitar ambigüedad.
- Todas las FK se declaran con verificación activa (`PRAGMA foreign_keys = ON` a nivel de conexión, decisión de infraestructura fuera de este documento pero mencionada aquí porque **el diseño físico asume que esta verificación está activa**; sin ella, ninguna restricción `FOREIGN KEY` de SQLite se aplica realmente).

---

## 2. Diseño físico por tabla

### Company

#### Propósito
Raíz de configuración de una aseguradora.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK, alias de rowid |
| nombre | TEXT | NO | — | Nombre completo de la aseguradora |
| codigo | TEXT | NO | — | Código corto/técnico, ej. "QUALITAS", "GNP" |
| esta_activo | INTEGER | NO | 1 | CHECK IN (0,1) |
| creado_en | TEXT | NO | (timestamp de inserción) | ISO-8601 |
| actualizado_en | TEXT | NO | (timestamp de inserción) | ISO-8601, se actualiza en cada modificación |
| creado_por | TEXT | SÍ | NULL | Identificador de usuario/proceso; nulo aceptable en cargas iniciales de seed |
| actualizado_por | TEXT | SÍ | NULL | — |

#### Clave primaria
`id`.

#### Claves foráneas
Ninguna saliente.

#### Restricciones
- `UNIQUE(nombre)`.
- `UNIQUE(codigo)`.
- `CHECK(esta_activo IN (0,1))`.

#### Índices
- Índice único implícito por `nombre` y por `codigo` (ya cubiertos por las restricciones UNIQUE, que en SQLite crean el índice automáticamente).
- Índice sobre `esta_activo` — consulta muy frecuente ("traer todas las aseguradoras activas" en cada arranque de clasificación).

#### Relaciones
`Company` 1 → N `Layout`; 1 → N `CompanyClassificationRule`; 1 → N (catálogos con propietario, opcional).

#### Comentarios de diseño
Tabla casi estática (alta frecuencia de lectura, bajísima frecuencia de escritura — solo cuando se integra una aseguradora nueva o se retira una).

---

### CompanyClassificationRule

#### Propósito
Condición atómica que determina si un documento pertenece a una `Company`.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK |
| company_id | INTEGER | NO | — | FK → Company.id |
| tipo_condicion | TEXT | NO | — | CHECK IN ('obligatoria','confirmacion','exclusion') |
| anchor_id | INTEGER | NO | — | FK → Anchor.id (ver §2, tabla Anchor) |
| orden_evaluacion | INTEGER | NO | 0 | Orden relativo de evaluación dentro de la misma Company |
| esta_activo | INTEGER | NO | 1 | CHECK IN (0,1) |
| creado_en / actualizado_en / creado_por / actualizado_por | — | — | — | Iguales a Company |

#### Clave primaria
`id`.

#### Claves foráneas
- `company_id` → `Company.id`.
- `anchor_id` → `Anchor.id`.

#### Restricciones
- `CHECK(tipo_condicion IN ('obligatoria','confirmacion','exclusion'))`.
- `UNIQUE(company_id, anchor_id, tipo_condicion)` — evita declarar la misma condición dos veces para la misma Company.

#### Índices
- Índice sobre `company_id` (consulta: "traer todas las reglas de esta Company", ejecutada en cada clasificación de documento).

#### Relaciones
N:1 hacia `Company`; N:1 hacia `Anchor`.

#### Comentarios de diseño
Se decidió resolver la ancla mediante la entidad unificada `Anchor` (recomendada en el modelo lógico §6.2) en vez de dos columnas opcionales (alias_id / regex_id) — elimina la necesidad de una restricción de exclusividad mutua repetida en cada tabla que necesita anclas.

---

### Layout

#### Propósito
Variante/versión de plantilla dentro de una `Company`.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK |
| company_id | INTEGER | NO | — | FK → Company.id |
| nombre | TEXT | NO | — | Ej. "Qualitas 2022" |
| padre_layout_id | INTEGER | SÍ | NULL | FK → Layout.id (autorreferencia, herencia) |
| es_default | INTEGER | NO | 0 | CHECK IN (0,1) |
| esta_activo | INTEGER | NO | 1 | CHECK IN (0,1) |
| creado_en / actualizado_en / creado_por / actualizado_por | — | — | — | Estándar |

#### Clave primaria
`id`.

#### Claves foráneas
- `company_id` → `Company.id`.
- `padre_layout_id` → `Layout.id` (autorreferencia, nulable).

#### Restricciones
- `UNIQUE(company_id, nombre)`.
- `CHECK(es_default IN (0,1))`.
- **Restricción de negocio no expresable como CHECK simple** (requiere validación de aplicación, ver §9 del modelo lógico): exactamente un `Layout` por `Company` con `es_default = 1` entre los activos. SQLite no soporta restricciones parciales condicionadas entre filas de forma declarativa directa sin `TRIGGER` (explícitamente fuera de alcance de este documento) — se documenta como regla de aplicación a validar en la capa de escritura de configuración.
- **Aciclicidad de `padre_layout_id`**: no expresable como `CHECK` (requiere recorrer la cadena) — regla de aplicación, validada antes de escribir.

#### Índices
- Índice sobre `company_id`.
- Índice compuesto sobre `(company_id, es_default)` — acelera la resolución del layout de respaldo.
- Índice sobre `padre_layout_id` — acelera la resolución de la cadena de herencia hacia los hijos de un layout dado.

#### Relaciones
N:1 hacia `Company`; 0..1:N autorreferencia (padre/hijos); 1 → N `Section`, `Field`, `LayoutDetectionRule`.

#### Comentarios de diseño
Tabla casi estática. El volumen esperado es bajo (decenas de layouts en total, no miles), por lo que el costo de las validaciones de aplicación (aciclicidad, unicidad de default) es irrelevante en términos de rendimiento.

---

### LayoutDetectionRule

#### Propósito
Condición que distingue un `Layout` de otro dentro de la misma `Company`.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK |
| layout_id | INTEGER | NO | — | FK → Layout.id |
| anchor_id | INTEGER | NO | — | FK → Anchor.id |
| orden_evaluacion | INTEGER | NO | 0 | — |
| peso_confianza | REAL | NO | 1.0 | Aporte a `ConfidenceScore` si matchea; CHECK entre 0 y 1 |
| esta_activo | INTEGER | NO | 1 | — |
| auditoría estándar | — | — | — | — |

#### Clave primaria
`id`.

#### Claves foráneas
`layout_id` → `Layout.id`; `anchor_id` → `Anchor.id`.

#### Restricciones
- `CHECK(peso_confianza >= 0.0 AND peso_confianza <= 1.0)`.
- `UNIQUE(layout_id, anchor_id)`.

#### Índices
Índice sobre `layout_id`.

#### Relaciones
N:1 hacia `Layout`; N:1 hacia `Anchor`.

#### Comentarios de diseño
`peso_confianza` como `REAL` (no `INTEGER`) porque `ConfidenceScore` se definió en el dominio como magnitud normalizada 0.0–1.0, no como entero — se preserva el tipo de dato del Value Object.

---

### Anchor (nueva, recomendada en el modelo lógico §6.2)

#### Propósito
Unificar "una ancla es un Alias o un Regex", evitando repetir el par de columnas opcionales en cada tabla que necesita anclas (Section inicio/fin, ClassificationRule, LayoutDetectionRule).

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK |
| tipo_ancla | TEXT | NO | — | CHECK IN ('alias','regex') |
| alias_id | INTEGER | SÍ | NULL | FK → Alias.id |
| regex_id | INTEGER | SÍ | NULL | FK → RegexCatalog.id |
| esta_activo | INTEGER | NO | 1 | — |
| auditoría estándar | — | — | — | — |

#### Clave primaria
`id`.

#### Claves foráneas
`alias_id` → `Alias.id` (nulable); `regex_id` → `RegexCatalog.id` (nulable).

#### Restricciones
- `CHECK((tipo_ancla = 'alias' AND alias_id IS NOT NULL AND regex_id IS NULL) OR (tipo_ancla = 'regex' AND regex_id IS NOT NULL AND alias_id IS NULL))` — la restricción de exclusividad mutua queda centralizada aquí una sola vez, en vez de repetirse en cada tabla consumidora.

#### Índices
Índice sobre `alias_id`; índice sobre `regex_id` (ambos parciales por naturaleza, útiles para joins desde las tablas consumidoras).

#### Relaciones
Consumida por `CompanyClassificationRule`, `LayoutDetectionRule`, `Section` (inicio), `SectionEndAnchor` (fin, N:M).

#### Comentarios de diseño
Esta tabla es la materialización física de la simplificación recomendada en el documento de modelo lógico. Reduce de 4-5 pares de columnas opcionales repetidas a un único punto de verdad para "qué es una ancla".

---

### Section

#### Propósito
Región lógica del documento dentro de un `Layout`.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK |
| layout_id | INTEGER | NO | — | FK → Layout.id |
| nombre | TEXT | NO | — | Ej. "Información del Asegurado" |
| anchor_inicio_id | INTEGER | NO | — | FK → Anchor.id |
| margen_seguridad_magnitud | INTEGER | SÍ | NULL | Nulo si siempre hay ancla de fin resuelta; obligatorio si no |
| margen_seguridad_unidad | TEXT | SÍ | NULL | CHECK IN ('linea','punto') si no nulo |
| es_override | INTEGER | NO | 0 | Ver §4.5 del modelo lógico (herencia de layouts) |
| esta_activo | INTEGER | NO | 1 | — |
| auditoría estándar | — | — | — | — |

#### Clave primaria
`id`.

#### Claves foráneas
`layout_id` → `Layout.id`; `anchor_inicio_id` → `Anchor.id`.

#### Restricciones
- `UNIQUE(layout_id, nombre)`.
- `CHECK((margen_seguridad_magnitud IS NULL AND margen_seguridad_unidad IS NULL) OR (margen_seguridad_magnitud IS NOT NULL AND margen_seguridad_unidad IS NOT NULL))` — ambas columnas se llenan juntas o ninguna.
- `CHECK(es_override IN (0,1))`.

#### Índices
Índice sobre `layout_id`.

#### Relaciones
N:1 hacia `Layout`; N:1 hacia `Anchor` (inicio); N:M hacia `Anchor` vía `SectionEndAnchor` (fin); 1 → N `Field`.

#### Comentarios de diseño
No se exige `margen_seguridad_*` como obligatorio siempre porque, si la sección tiene al menos una ancla de fin registrada en `SectionEndAnchor`, el margen es innecesario — la regla real ("debe tener ancla de fin O margen") requiere validar contra la tabla de asociación, por lo que queda como regla de aplicación, no como `CHECK` puro de esta tabla.

---

### SectionEndAnchor

#### Propósito
Asociación N:M entre `Section` y `Anchor` para anclas de cierre alternativas.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| section_id | INTEGER | NO | — | FK → Section.id |
| anchor_id | INTEGER | NO | — | FK → Anchor.id |
| orden_evaluacion | INTEGER | NO | 0 | — |

#### Clave primaria
Compuesta: `(section_id, anchor_id)`.

#### Claves foráneas
`section_id` → `Section.id`; `anchor_id` → `Anchor.id`.

#### Restricciones
Ninguna adicional — la PK compuesta ya impide duplicados.

#### Índices
Índice sobre `section_id` (consulta dominante: "traer todas las anclas de fin de esta sección").

#### Relaciones
N:M entre `Section` y `Anchor`.

#### Comentarios de diseño
Tabla puente pura, sin columnas de auditoría propias (el ciclo de vida de la asociación se gobierna por el de `Section`).

---

### Field

#### Propósito
Dato de negocio a extraer dentro de un `Layout`.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK |
| layout_id | INTEGER | NO | — | FK → Layout.id |
| section_id | INTEGER | SÍ | NULL | FK → Section.id, ámbito por defecto opcional |
| nombre | TEXT | NO | — | Ej. "Prima Total" |
| tipo_dato | TEXT | NO | — | CHECK IN ('monto','fecha','texto','catalogo','booleano') |
| valor_por_defecto | TEXT | SÍ | NULL | Literal a devolver si todas las estrategias fallan |
| representacion_valor_defecto | TEXT | NO | 'vacio' | CHECK IN ('vacio','texto','nulo') — resuelve la inconsistencia detectada en la auditoría |
| es_override | INTEGER | NO | 0 | Herencia de layouts |
| esta_activo | INTEGER | NO | 1 | — |
| auditoría estándar | — | — | — | — |

#### Clave primaria
`id`.

#### Claves foráneas
`layout_id` → `Layout.id`; `section_id` → `Section.id` (nulable).

#### Restricciones
- `UNIQUE(layout_id, nombre)`.
- `CHECK(tipo_dato IN ('monto','fecha','texto','catalogo','booleano'))`.
- `CHECK(representacion_valor_defecto IN ('vacio','texto','nulo'))`.

#### Índices
- Índice sobre `layout_id`.
- Índice compuesto sobre `(layout_id, section_id)` — soporta la consulta "campos de esta sección dentro de este layout".

#### Relaciones
N:1 hacia `Layout`; N:1 hacia `Section` (opcional); 1 → N `Strategy`; 1 → N `FieldDependency` (en ambos roles); N:M hacia `PresentationProfile` vía `FieldPresentation`.

#### Comentarios de diseño
`valor_por_defecto` se guarda siempre como `TEXT` (incluso para campos de tipo monto/fecha) porque es un literal de configuración, no un valor calculado — su interpretación tipada ocurre en el motor, no en la base de datos.

---

### FieldDependency

#### Propósito
Relación "este campo necesita el resultado de otro ya resuelto".

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK |
| campo_dependiente_id | INTEGER | NO | — | FK → Field.id |
| campo_requerido_id | INTEGER | NO | — | FK → Field.id |
| tipo_relacion | TEXT | NO | — | CHECK IN ('ancla_offset','filtro_exclusion','delimitador_ventana') |
| esta_activo | INTEGER | NO | 1 | — |
| auditoría estándar | — | — | — | — |

#### Clave primaria
`id`.

#### Claves foráneas
`campo_dependiente_id` → `Field.id`; `campo_requerido_id` → `Field.id` (dos FK hacia la misma tabla, roles distintos).

#### Restricciones
- `UNIQUE(campo_dependiente_id, campo_requerido_id, tipo_relacion)`.
- `CHECK(campo_dependiente_id != campo_requerido_id)` — un campo no puede depender de sí mismo (protección directa, expresable como CHECK; la aciclicidad transitiva de N pasos sigue siendo regla de aplicación).

#### Índices
- Índice sobre `campo_dependiente_id` (resolución de orden topológico: "de quién depende X").
- Índice sobre `campo_requerido_id` (consulta inversa: "quién depende de Y", para impedir eliminar un Field referenciado).

#### Relaciones
N:M entre `Field` y `Field` (autorreferencia vía tabla propia, no vía columna simple, porque un campo puede depender de varios).

#### Comentarios de diseño
Ambas FK deben apuntar a `Field` de un mismo `layout_id` — no expresable como `CHECK` entre columnas de tablas distintas en SQLite; se documenta como regla de aplicación (validar que `campo_dependiente.layout_id = campo_requerido.layout_id` antes de insertar).

---

### StrategyType

#### Propósito
Catálogo cerrado de tipos de estrategia disponibles en el motor.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK |
| codigo | TEXT | NO | — | Ej. "POR_ETIQUETA_Y_OFFSET" |
| descripcion | TEXT | NO | — | — |
| tabla_parametros | TEXT | NO | — | Nombre de la tabla satélite asociada, metadato de mapeo para el motor |
| esta_activo | INTEGER | NO | 1 | — |
| auditoría estándar | — | — | — | — |

#### Clave primaria
`id`.

#### Claves foráneas
Ninguna.

#### Restricciones
`UNIQUE(codigo)`.

#### Índices
Índice sobre `codigo` (ya cubierto por UNIQUE).

#### Relaciones
1 → N `Strategy`.

#### Comentarios de diseño
Tabla de mantenimiento del equipo de desarrollo (no de negocio) — volumen mínimo (una fila por tipo de estrategia del catálogo cerrado, ver arquitectura §4: en torno a 15-20 filas totales esperadas). `tabla_parametros` es texto plano descriptivo, no una FK real hacia una tabla dinámica (SQLite no soporta FK "a una tabla variable") — el motor la usa como metadato de enrutamiento en tiempo de ejecución, no la base de datos para integridad referencial.

---

### Strategy

#### Propósito
Método de localización concreto para un `Field`, en una posición de prioridad.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK |
| field_id | INTEGER | NO | — | FK → Field.id |
| strategy_type_id | INTEGER | NO | — | FK → StrategyType.id |
| prioridad | INTEGER | NO | — | CHECK > 0 |
| esta_activo | INTEGER | NO | 1 | — |
| auditoría estándar | — | — | — | — |

#### Clave primaria
`id`.

#### Claves foráneas
`field_id` → `Field.id`; `strategy_type_id` → `StrategyType.id`.

#### Restricciones
- `UNIQUE(field_id, prioridad)`.
- `CHECK(prioridad > 0)`.

#### Índices
Índice compuesto sobre `(field_id, prioridad)` — es la consulta más frecuente del motor ("estrategias de este campo, en orden"); ya cubierto parcialmente por el UNIQUE, pero se declara explícitamente como índice de acceso, no solo de restricción.

#### Relaciones
N:1 hacia `Field`; N:1 hacia `StrategyType`; 1:1 hacia exactamente una de las tablas `StrategyParameters*` (según el tipo); N:M hacia `RegexCatalog`/`ValidationCatalog`/`NormalizationCatalog`/`ExclusionCatalog` vía tablas puente.

#### Comentarios de diseño
Tabla deliberadamente delgada — ninguna columna de parámetros propia (ver §1.7 y modelo lógico §4.1). Es la tabla de mayor volumen relativo de configuración (una fila por cada estrategia de cada campo de cada layout), pero sigue siendo pequeña en términos absolutos (decenas de campos × 2-3 estrategias promedio × pocos layouts).

---

### StrategyParametersOffsetLine

#### Propósito
Parámetros de estrategias tipo `POR_ETIQUETA_Y_OFFSET`.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| strategy_id | INTEGER | NO | — | PK y FK → Strategy.id |
| offset_lineas | INTEGER | NO | — | Puede ser negativo (offset hacia arriba) |
| offsets_alternativos | TEXT | SÍ | NULL | Lista serializada simple (ver nota) si hay varios offsets candidatos (ej. Motor: 9,10,11) |

#### Clave primaria
`strategy_id` (comparte PK con la FK — patrón estándar de tabla satélite 1:1).

#### Claves foráneas
`strategy_id` → `Strategy.id`.

#### Restricciones
Ninguna adicional.

#### Índices
Ninguno adicional — el acceso es siempre por PK (`strategy_id`), ya cubierto.

#### Relaciones
1:1 con `Strategy`.

#### Comentarios de diseño
`offsets_alternativos` es la única concesión a una lista simple dentro de una columna de texto en todo este esquema (ej. `"9,10,11"`). Se acepta aquí, y no se convierte en una tabla de detalle 1:N, porque: (a) es una lista corta y de tamaño acotado (nunca más de 4-5 valores según la auditoría), (b) no se consulta ni se filtra por elementos individuales de la lista (solo se lee completa y se itera en el motor), y (c) crear una tabla `StrategyParametersOffsetLineAlternative` para esto sería sobre-normalización sin beneficio de consulta real. Es una excepción documentada y deliberada, no una inconsistencia.

---

### StrategyParametersWindow

#### Propósito
Parámetros de estrategias tipo `POR_ETIQUETA_Y_VENTANA` / `POR_VENTANA_SIN_ETIQUETA_FIJA`.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| strategy_id | INTEGER | NO | — | PK y FK |
| inicio_ventana | INTEGER | NO | 0 | Offset donde empieza la ventana |
| tamano_ventana | INTEGER | NO | — | CHECK > 0 |
| criterio_seleccion | TEXT | NO | 'primero' | CHECK IN ('primero','ultimo') |

#### Clave primaria
`strategy_id`.

#### Claves foráneas
`strategy_id` → `Strategy.id`.

#### Restricciones
`CHECK(tamano_ventana > 0)`; `CHECK(criterio_seleccion IN ('primero','ultimo'))`.

#### Relaciones
1:1 con `Strategy`.

---

### StrategyParametersGeometric

#### Propósito
Parámetros de estrategias tipo `POR_COORDENADAS_MISMA_FILA` / `POR_COORDENADAS_MISMA_COLUMNA`.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| strategy_id | INTEGER | NO | — | PK y FK |
| tolerancia_x | REAL | NO | — | CHECK >= 0 |
| tolerancia_fila | REAL | NO | — | CHECK >= 0 |
| distancia_y_maxima | REAL | NO | — | CHECK >= 0 |
| permite_misma_fila | INTEGER | NO | 1 | CHECK IN (0,1) |
| permite_columna_abajo | INTEGER | NO | 1 | CHECK IN (0,1) |
| coincidencia_exacta | INTEGER | NO | 0 | CHECK IN (0,1) |

#### Clave primaria
`strategy_id`.

#### Claves foráneas
`strategy_id` → `Strategy.id`.

#### Restricciones
- `CHECK(tolerancia_x >= 0 AND tolerancia_fila >= 0 AND distancia_y_maxima >= 0)`.
- `CHECK(permite_misma_fila IN (0,1) AND permite_columna_abajo IN (0,1) AND coincidencia_exacta IN (0,1))`.
- `CHECK(permite_misma_fila = 1 OR permite_columna_abajo = 1)` — al menos una de las dos estrategias geométricas debe estar habilitada, o la estrategia nunca podría producir resultado.

#### Relaciones
1:1 con `Strategy`.

#### Comentarios de diseño
Tipos `REAL` (no `INTEGER`) para las tolerancias/distancias, porque en el layout de GNP estas magnitudes son puntos de página (unidad PyMuPDF, 1/72 pulgada), que en la práctica pueden requerir precisión fraccionaria.

---

### StrategyParametersMultiline

#### Propósito
Parámetros de `POR_COORDENADAS_MULTILINEA`.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| strategy_id | INTEGER | NO | — | PK y FK |
| tolerancia_x | REAL | NO | — | CHECK >= 0 |
| distancia_y_maxima | REAL | NO | — | CHECK >= 0 |
| maximo_lineas | INTEGER | NO | — | CHECK > 0 |
| salto_maximo_entre_lineas | REAL | NO | — | CHECK >= 0 |

#### Clave primaria
`strategy_id`. **FK**: `strategy_id` → `Strategy.id`.

#### Relaciones
1:1 con `Strategy`.

---

### StrategyParametersRelativeField

#### Propósito
Parámetros de `RELATIVO_A_OTRO_CAMPO`.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| strategy_id | INTEGER | NO | — | PK y FK → Strategy.id |
| campo_referencia_id | INTEGER | NO | — | FK → Field.id |
| tipo_relacion | TEXT | NO | — | CHECK IN ('offset_desde_posicion','exclusion_de_valor','delimitador_ventana') |
| offset_relativo | INTEGER | SÍ | NULL | Aplica solo si tipo_relacion = 'offset_desde_posicion' |

#### Clave primaria
`strategy_id`.

#### Claves foráneas
`strategy_id` → `Strategy.id`; `campo_referencia_id` → `Field.id`.

#### Restricciones
`CHECK(tipo_relacion IN ('offset_desde_posicion','exclusion_de_valor','delimitador_ventana'))`.

#### Índices
Índice sobre `campo_referencia_id` — permite responder "qué estrategias dependen de este campo" desde el lado de parámetros, complementario al índice ya existente en `FieldDependency`.

#### Relaciones
1:1 con `Strategy`; N:1 hacia `Field` (como referencia).

#### Comentarios de diseño
Esta tabla materializa la misma relación que `FieldDependency` pero a nivel de ejecución de la estrategia concreta; `FieldDependency` es la declaración de dependencia a nivel de `Field` (usada por `DependencyResolver` para el orden topológico), mientras que esta tabla es el parámetro operativo de la estrategia específica que efectivamente usa esa dependencia. Ambas deben mantenerse consistentes por regla de aplicación (si existe una `StrategyParametersRelativeField`, debe existir su `FieldDependency` correspondiente).

---

### StrategyParametersTable

#### Propósito
Parámetros de `POR_TABLA`.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| strategy_id | INTEGER | NO | — | PK y FK |
| patron_encabezado_id | INTEGER | NO | — | FK → RegexCatalog.id (patrón que identifica la fila de encabezados) |
| offset_fila_valor | INTEGER | NO | 1 | — |

#### Clave primaria
`strategy_id`. **FK**: `strategy_id` → `Strategy.id`; `patron_encabezado_id` → `RegexCatalog.id`.

#### Relaciones
1:1 con `Strategy`; N:1 hacia `RegexCatalog`.

---

### StrategyParametersFrequency

#### Propósito
Parámetros de `POR_FRECUENCIA`.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| strategy_id | INTEGER | NO | — | PK y FK |
| criterio_desempate_secundario | TEXT | SÍ | NULL | CHECK IN ('primero_encontrado','mas_cercano_geometrico') si no nulo |

#### Clave primaria
`strategy_id`. **FK**: `strategy_id` → `Strategy.id`.

#### Comentarios de diseño
Las "fuentes a combinar" mencionadas en el modelo lógico (§4.1) se resuelven **sin tabla adicional**: son, en la práctica, las propias estrategias de prioridad anterior del mismo `Field` cuyos candidatos se acumulan en vez de descartarse — el motor decide esto por convención de ejecución, no por una relación explícita en esta tabla. Se documenta aquí para que quede explícito por qué esta tabla es la más pequeña de todo el catálogo satélite.

---

### StrategyParametersAIAssisted

#### Propósito
Parámetros de `POR_IA_ASISTIDA`.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| strategy_id | INTEGER | NO | — | PK y FK |
| plantilla_prompt | TEXT | NO | — | Contenido de la plantilla, con marcadores de sustitución |
| ambito_texto | TEXT | NO | — | CHECK IN ('documento_completo','seccion') |
| section_id | INTEGER | SÍ | NULL | FK → Section.id; obligatorio si ambito_texto = 'seccion' |

#### Clave primaria
`strategy_id`. **FK**: `strategy_id` → `Strategy.id`; `section_id` → `Section.id`.

#### Restricciones
`CHECK((ambito_texto = 'seccion' AND section_id IS NOT NULL) OR (ambito_texto = 'documento_completo' AND section_id IS NULL))`.

#### Relaciones
1:1 con `Strategy`; N:1 opcional hacia `Section`.

---

### RegexCatalog

#### Propósito
Patrón reutilizable con nombre.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK |
| nombre | TEXT | NO | — | Ej. "Regex_Monto_Decimal_Estricto" |
| patron | TEXT | NO | — | Expresión regular |
| es_case_insensitive | INTEGER | NO | 0 | CHECK IN (0,1) |
| es_multilinea | INTEGER | NO | 0 | CHECK IN (0,1) |
| descripcion | TEXT | SÍ | NULL | — |
| company_id | INTEGER | SÍ | NULL | FK → Company.id; NULL = catálogo global |
| esta_activo | INTEGER | NO | 1 | — |
| auditoría estándar | — | — | — | — |

#### Clave primaria
`id`.

#### Claves foráneas
`company_id` → `Company.id` (nulable).

#### Restricciones
- `UNIQUE(nombre, company_id)` — en SQLite, `NULL` en una columna de un índice único **no colisiona** entre sí (dos filas con `company_id = NULL` y el mismo `nombre` **no** violan un `UNIQUE` estándar, porque SQLite trata cada `NULL` como distinto). Esto exige atención especial: si se requiere que los nombres de catálogo **global** (`company_id IS NULL`) también sean únicos entre sí, se necesita un índice único parcial (`CREATE UNIQUE INDEX ... WHERE company_id IS NULL`), mecanismo soportado por SQLite y que se reserva para el documento de SQL final — se documenta aquí la necesidad, no la sintaxis.
- `CHECK(es_case_insensitive IN (0,1) AND es_multilinea IN (0,1))`.

#### Índices
- Índice sobre `nombre`.
- Índice sobre `company_id`.
- Índice único parcial sobre `nombre` donde `company_id IS NULL` (ver restricción anterior).

#### Relaciones
0..1 `Company` → N `RegexCatalog`; N:M hacia `Strategy` vía `StrategyRegex`; referenciado también por `StrategyParametersTable.patron_encabezado_id` y por `Anchor.regex_id`.

#### Comentarios de diseño
Tabla de bajo volumen (decenas de patrones totales, según la auditoría) y de lectura muy frecuente (se resuelve en cada estrategia que la referencia) — candidata ideal a cachear en memoria en el `ExecutionContext` (ya previsto en el documento de dominio), reduciendo su impacto real de lectura en SQLite a una sola consulta por documento procesado, no una por campo.

---

### ValidationCatalog

#### Propósito
Regla de validez de formato reutilizable.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK |
| nombre | TEXT | NO | — | — |
| tipo_validador | TEXT | NO | — | CHECK IN ('rfc','vin','cp','placa','monto','pertenece_a_catalogo') |
| value_catalog_id | INTEGER | SÍ | NULL | FK → ValueCatalog.id; obligatorio si tipo_validador = 'pertenece_a_catalogo' |
| company_id | INTEGER | SÍ | NULL | FK → Company.id |
| esta_activo | INTEGER | NO | 1 | — |
| auditoría estándar | — | — | — | — |

#### Clave primaria
`id`.

#### Claves foráneas
`value_catalog_id` → `ValueCatalog.id`; `company_id` → `Company.id`.

#### Restricciones
- `CHECK(tipo_validador IN ('rfc','vin','cp','placa','monto','pertenece_a_catalogo'))`.
- `CHECK((tipo_validador = 'pertenece_a_catalogo' AND value_catalog_id IS NOT NULL) OR (tipo_validador != 'pertenece_a_catalogo' AND value_catalog_id IS NULL))`.
- `UNIQUE(nombre, company_id)` + índice único parcial para `company_id IS NULL`, igual que `RegexCatalog`.

#### Índices
Igual patrón que `RegexCatalog`.

#### Relaciones
N:M hacia `Strategy` vía `StrategyValidation`; N:1 opcional hacia `ValueCatalog`; 0..1 `Company` → N.

---

### NormalizationCatalog

#### Propósito
Transformación determinista reutilizable sobre un valor.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK |
| nombre | TEXT | NO | — | — |
| tipo_normalizador | TEXT | NO | — | CHECK IN ('uppercase','nfkd','strip','title_case','limpiar_caracteres','formateo_parametrizado') |
| parametros | TEXT | SÍ | NULL | Solo si tipo_normalizador = 'limpiar_caracteres' o 'formateo_parametrizado' (ver nota) |
| company_id | INTEGER | SÍ | NULL | FK → Company.id |
| esta_activo | INTEGER | NO | 1 | — |
| auditoría estándar | — | — | — | — |

#### Clave primaria
`id`.

#### Claves foráneas
`company_id` → `Company.id`.

#### Restricciones
- `CHECK(tipo_normalizador IN ('uppercase','nfkd','strip','title_case','limpiar_caracteres','formateo_parametrizado'))`.
- `UNIQUE(nombre, company_id)` + índice único parcial, mismo patrón.

#### Comentarios de diseño
`parametros` es la **segunda y última excepción documentada** a la regla de "no columnas de texto libre para configuración estructurada" (la primera fue `offsets_alternativos`). Se acepta aquí porque los tipos que la usan (`limpiar_caracteres`: qué caracteres eliminar; `formateo_parametrizado`: ej. dónde insertar el guion de placas) son casos de cola con parámetros muy simples (una lista corta o un par de números), y crear tablas satélite `NormalizationParametersX` para cada uno introduciría más tablas que beneficio real — a diferencia de `StrategyParameters`, donde la variedad y complejidad de parámetros por tipo sí justificó Table per Type. Se marca explícitamente como decisión de proporcionalidad, no de inconsistencia de criterio: **la regla general sigue siendo Table per Type cuando los parámetros son complejos/numerosos, y columna de texto acotada cuando son triviales y de un solo tipo de dato**.

---

### ExclusionCatalog

#### Propósito
Cabecera de un catálogo de exclusión.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK |
| nombre | TEXT | NO | — | Ej. "Exclusion_Codigos_Motor" |
| descripcion | TEXT | SÍ | NULL | — |
| company_id | INTEGER | SÍ | NULL | FK → Company.id |
| esta_activo | INTEGER | NO | 1 | — |
| auditoría estándar | — | — | — | — |

#### Clave primaria
`id`. **FK**: `company_id` → `Company.id`.

#### Restricciones
`UNIQUE(nombre, company_id)` + índice único parcial.

#### Relaciones
1 → N `ExclusionItem`; N:M hacia `Strategy` vía `StrategyExclusion`.

---

### ExclusionItem

#### Propósito
Elemento atómico de un `ExclusionCatalog`.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK |
| exclusion_catalog_id | INTEGER | NO | — | FK → ExclusionCatalog.id |
| valor | TEXT | NO | — | Literal o patrón excluido |
| esta_activo | INTEGER | NO | 1 | — |

#### Clave primaria
`id`. **FK**: `exclusion_catalog_id` → `ExclusionCatalog.id`.

#### Restricciones
`UNIQUE(exclusion_catalog_id, valor)`.

#### Índices
Índice sobre `exclusion_catalog_id`.

#### Relaciones
N:1 hacia `ExclusionCatalog`.

---

### ValueCatalog

#### Propósito
Cabecera de una lista blanca de valores válidos.

Idéntica estructura a `ExclusionCatalog` (§ correspondiente arriba): id, nombre, descripción, company_id opcional, esta_activo, auditoría estándar. Mismas restricciones y patrón de índice único parcial.

#### Relaciones
1 → N `ValueCatalogItem`; referenciado por `ValidationCatalog.value_catalog_id`.

---

### ValueCatalogItem

#### Propósito
Elemento atómico de un `ValueCatalog`.

Idéntica estructura a `ExclusionItem`, sustituyendo la FK por `value_catalog_id` → `ValueCatalog.id`.

---

### Alias

#### Propósito
Cabecera de un grupo de variantes textuales equivalentes.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK |
| nombre | TEXT | NO | — | Ej. "Ancla_Informacion_Asegurado" |
| modo_coincidencia | TEXT | NO | — | CHECK IN ('exacta','contiene') |
| es_sensible_a_mayusculas | INTEGER | NO | 0 | CHECK IN (0,1) |
| es_sensible_a_acentos | INTEGER | NO | 0 | CHECK IN (0,1) |
| company_id | INTEGER | SÍ | NULL | FK → Company.id |
| esta_activo | INTEGER | NO | 1 | — |
| auditoría estándar | — | — | — | — |

#### Clave primaria
`id`. **FK**: `company_id` → `Company.id`.

#### Restricciones
`UNIQUE(nombre, company_id)` + índice único parcial, mismo patrón que los catálogos anteriores.

#### Relaciones
1 → N `AliasVariant`; referenciado por `Anchor.alias_id`.

---

### AliasVariant

#### Propósito
Variante textual individual de un `Alias`.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK |
| alias_id | INTEGER | NO | — | FK → Alias.id |
| texto | TEXT | NO | — | Ej. "INFORMACIÓN DEL ASEGURADO" |

#### Clave primaria
`id`. **FK**: `alias_id` → `Alias.id`.

#### Restricciones
`UNIQUE(alias_id, texto)`.

#### Índices
Índice sobre `alias_id`.

---

### StrategyRegex, StrategyValidation, StrategyExclusion (tablas puente)

#### Propósito
Asociación N:M entre `Strategy` y, respectivamente, `RegexCatalog`, `ValidationCatalog`, `ExclusionCatalog`.

#### Columnas (idénticas estructuralmente en las tres)
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| strategy_id | INTEGER | NO | — | FK → Strategy.id |
| <catalogo>_id | INTEGER | NO | — | FK → RegexCatalog.id / ValidationCatalog.id / ExclusionCatalog.id según la tabla |
| orden_evaluacion | INTEGER | NO | 0 | Relevante para `POR_REGEX_MULTIPLE` (orden de prueba) |

#### Clave primaria
Compuesta: `(strategy_id, <catalogo>_id)`.

#### Índices
Índice sobre `strategy_id` en cada una (consulta dominante: "regex/validaciones/exclusiones de esta estrategia").

#### Relaciones
N:M en cada caso.

---

### StrategyNormalization (tabla puente, con orden significativo)

#### Propósito
Asociación N:M entre `Strategy` y `NormalizationCatalog`, donde el **orden de aplicación importa** (uppercase → limpiar caracteres → title case, en ese orden exacto).

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| strategy_id | INTEGER | NO | — | FK → Strategy.id |
| normalization_catalog_id | INTEGER | NO | — | FK → NormalizationCatalog.id |
| orden_aplicacion | INTEGER | NO | — | CHECK > 0 |

#### Clave primaria
Compuesta: `(strategy_id, normalization_catalog_id)`.

#### Restricciones
`UNIQUE(strategy_id, orden_aplicacion)` — dos normalizaciones de la misma estrategia no pueden compartir el mismo orden (ambigüedad de secuencia, mismo principio que la unicidad de `prioridad` en `Strategy`).

#### Índices
Índice compuesto sobre `(strategy_id, orden_aplicacion)`.

#### Comentarios de diseño
Es la única tabla puente de este esquema donde el orden es parte del contrato semántico, no solo un metadato accesorio — de ahí la restricción `UNIQUE` adicional que no tienen `StrategyRegex`/`StrategyValidation`/`StrategyExclusion`.

---

### PresentationProfile

#### Propósito
Contrato de salida (JSON) para una `Company`/`Layout`.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK |
| company_id | INTEGER | NO | — | FK → Company.id |
| layout_id | INTEGER | SÍ | NULL | FK → Layout.id; NULL = perfil válido para todos los layouts de la Company |
| nombre | TEXT | NO | — | — |
| esta_activo | INTEGER | NO | 1 | — |
| auditoría estándar | — | — | — | — |

#### Clave primaria
`id`.

#### Claves foráneas
`company_id` → `Company.id`; `layout_id` → `Layout.id` (nulable).

#### Restricciones
`UNIQUE(company_id, layout_id, nombre)` (con la misma consideración de `NULL` no colisionante ya señalada para catálogos, gestionable igual con índice único parcial si se requiere unicidad estricta también cuando `layout_id IS NULL`).

#### Relaciones
N:1 hacia `Company`; N:1 opcional hacia `Layout`; 1 → N `FieldPresentation`.

---

### FieldPresentation

#### Propósito
Detalle de presentación de un `Field` dentro de un `PresentationProfile`.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK |
| presentation_profile_id | INTEGER | NO | — | FK → PresentationProfile.id |
| field_id | INTEGER | NO | — | FK → Field.id |
| nombre_visible | TEXT | NO | — | Ej. "I.V.A. 16%" |
| orden_presentacion | INTEGER | NO | — | — |
| prefijo | TEXT | SÍ | NULL | Ej. "$" |
| sufijo | TEXT | SÍ | NULL | — |

#### Clave primaria
`id`.

#### Claves foráneas
`presentation_profile_id` → `PresentationProfile.id`; `field_id` → `Field.id`.

#### Restricciones
- `UNIQUE(presentation_profile_id, field_id)`.
- `UNIQUE(presentation_profile_id, orden_presentacion)`.

#### Índices
Índice sobre `presentation_profile_id`.

#### Relaciones
N:1 hacia `PresentationProfile`; N:1 hacia `Field`.

---

### ExecutionLog

#### Propósito
Registro append-only de cada corrida del pipeline sobre un documento.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK, **con AUTOINCREMENT** (ver §1.1) |
| company_id | INTEGER | SÍ | NULL | FK → Company.id; NULL si no se logró clasificar |
| layout_id | INTEGER | SÍ | NULL | FK → Layout.id; NULL si no se logró detectar |
| confianza_clasificacion | REAL | SÍ | NULL | — |
| confianza_layout | REAL | SÍ | NULL | — |
| duracion_total_ms | INTEGER | NO | — | — |
| campos_resueltos | INTEGER | NO | 0 | Cuántos campos obtuvieron valor real (no default) |
| campos_por_defecto | INTEGER | NO | 0 | Cuántos cayeron a valor por defecto |
| iniciado_en | TEXT | NO | — | ISO-8601 |

#### Clave primaria
`id` (AUTOINCREMENT).

#### Claves foráneas
`company_id` → `Company.id` (nulable); `layout_id` → `Layout.id` (nulable).

#### Restricciones
Ninguna adicional — es una tabla de hechos, no de configuración normativa.

#### Índices
Índice sobre `company_id`; índice sobre `iniciado_en` (consultas de auditoría por rango de fecha).

#### Relaciones
1 → N `ExtractionResultLog`.

#### Comentarios de diseño
Tabla de mayor volumen esperado de todo el esquema (una fila por documento procesado). Nunca se actualiza tras la inserción — coherente con la recomendación de "snapshot ligero" del modelo lógico (§6.5, mecanismo 2).

---

### ExtractionResultLog

#### Propósito
Registro append-only de cada campo resuelto en cada ejecución.

#### Columnas
| Columna | Tipo SQLite | NULL | Default | Observaciones |
|---|---|---|---|---|
| id | INTEGER | NO | — | PK, AUTOINCREMENT |
| execution_log_id | INTEGER | NO | — | FK → ExecutionLog.id |
| field_id | INTEGER | NO | — | FK → Field.id |
| winning_strategy_id | INTEGER | SÍ | NULL | FK → Strategy.id; NULL si se usó valor por defecto |
| valor_crudo | TEXT | SÍ | NULL | — |
| valor_normalizado | TEXT | SÍ | NULL | — |
| es_valor_por_defecto | INTEGER | NO | 0 | CHECK IN (0,1) |
| paso_validacion | INTEGER | SÍ | NULL | CHECK IN (0,1) si no nulo |
| confidence_score | REAL | SÍ | NULL | — |
| duracion_ms | INTEGER | NO | — | — |

#### Clave primaria
`id` (AUTOINCREMENT).

#### Claves foráneas
`execution_log_id` → `ExecutionLog.id`; `field_id` → `Field.id`; `winning_strategy_id` → `Strategy.id` (nulable).

#### Restricciones
`CHECK(es_valor_por_defecto IN (0,1))`.

#### Índices
Índice sobre `execution_log_id` (consulta dominante: "todos los resultados de esta ejecución"); índice sobre `field_id` (analítica: "qué tan seguido este campo termina en valor por defecto").

#### Relaciones
N:1 hacia `ExecutionLog`; N:1 hacia `Field`; N:1 opcional hacia `Strategy`.

#### Comentarios de diseño
`es_valor_por_defecto` materializa directamente el atributo `isDefaultValue` ya diseñado en `ExtractionResult` (documento de dominio §8) — es la traducción física exacta de la distinción explícita que se decidió introducir para resolver la ambigüedad heredada de los extractores originales (`""`/`"S/N"`/`"No encontrado"` mezclados como si fueran datos).

---

## 3. Índices globales — resumen y justificación

| Categoría | Ejemplos en este esquema | Justificación |
|---|---|---|
| **Índices únicos** | `Company.codigo`, `Layout(company_id, nombre)`, `Field(layout_id, nombre)`, `Strategy(field_id, prioridad)` | Traducen directamente las restricciones de unicidad del modelo lógico; en SQLite se crean automáticamente al declarar `UNIQUE`, pero se listan aquí porque son también el mecanismo de acceso más eficiente para las mismas consultas de resolución de configuración. |
| **Índices únicos parciales** | `RegexCatalog.nombre WHERE company_id IS NULL` (y análogos en todos los catálogos con propietario opcional) | Necesarios porque SQLite no aplica unicidad estándar entre múltiples `NULL` — sin este índice parcial, dos catálogos globales podrían terminar con el mismo nombre sin que ninguna restricción lo impida. |
| **Índices compuestos** | `Strategy(field_id, prioridad)`, `Field(layout_id, section_id)`, `StrategyNormalization(strategy_id, orden_aplicacion)` | Soportan directamente las consultas de "traer todo lo relacionado con X, en el orden correcto" que el motor ejecuta en cada extracción — sin ellos, el motor tendría que ordenar en memoria tras leer sin orden garantizado eficiente. |
| **Índices para búsquedas administrativas** | `Company.esta_activo`, `Layout(company_id, es_default)` | Soportan pantallas/consultas de gestión de configuración (no del motor de extracción en sí), pero igualmente necesarias para que la administración de datos sea eficiente a medida que el catálogo crece. |
| **Índices para joins** | Todas las columnas `*_id` de FK que no ya estén cubiertas por una restricción UNIQUE (ej. `Strategy.field_id` solo, además del compuesto con prioridad; `FieldPresentation.field_id`) | SQLite no crea automáticamente un índice sobre una columna de FK (a diferencia de otros motores) — cada FK usada en joins frecuentes debe indexarse explícitamente o las consultas de resolución de configuración degradan a escaneo completo de tabla. |
| **Índices para consultas frecuentes de auditoría** | `ExecutionLog.iniciado_en`, `ExtractionResultLog.execution_log_id`, `ExtractionResultLog.field_id` | Soportan análisis histórico (ej. "qué campos fallan más seguido") sin necesidad de escanear la tabla append-only completa a medida que crece. |

---

## 4. Estrategia de claves foráneas — `ON DELETE` / `ON UPDATE`

Principio general ya establecido en el modelo lógico (§6.1): **cascada de desactivación lógica en la aplicación, nunca cascada de borrado físico automático a nivel de base de datos** para las relaciones de configuración jerárquica. Traducido a las opciones reales de SQLite:

| Relación | ON DELETE | ON UPDATE | Justificación |
|---|---|---|---|
| `Layout.company_id` → `Company.id` | `RESTRICT` | `CASCADE` | Un `Company` con Layouts activos no debe poder borrarse en duro (se desactiva por aplicación, nunca se llega a ejecutar el DELETE físico en el flujo normal); si por excepción se permitiera un borrado administrativo de bajo nivel, `RESTRICT` lo impide mientras existan Layouts — fuerza a resolver la jerarquía explícitamente primero. `ON UPDATE CASCADE` porque, al usar `INTEGER PRIMARY KEY`/rowid, el id nunca cambia en la práctica, pero se declara por completitud/seguridad. |
| `Section.layout_id`, `Field.layout_id` → `Layout.id` | `RESTRICT` | `CASCADE` | Misma lógica: no se permite huérfanos por borrado físico accidental. |
| `Strategy.field_id` → `Field.id` | `CASCADE` | `CASCADE` | **Única cascada de borrado físico real del esquema de configuración**, y deliberada: si un `Field` se elimina en duro (evento raro, solo tras confirmar que no tiene `ExtractionResultLog` histórico que lo referencie — ver más abajo), sus `Strategy` no tienen razón de existir de forma independiente — no son una entidad con vida propia fuera de su Field. |
| `StrategyParameters*.strategy_id` → `Strategy.id` | `CASCADE` | `CASCADE` | Misma razón que el anterior, un nivel más abajo: los parámetros no existen sin su estrategia. |
| `StrategyRegex/Validation/Normalization/Exclusion.strategy_id` → `Strategy.id` | `CASCADE` | `CASCADE` | Las filas de la tabla puente no tienen sentido sin la estrategia; borrarlas en cascada es correcto porque son solo la *relación*, no el catálogo referenciado en sí. |
| `StrategyRegex.regex_id` → `RegexCatalog.id` (y análogos hacia Validation/Normalization/Exclusion) | `RESTRICT` | `CASCADE` | **Nunca cascada**: si se intenta borrar un `RegexCatalog` que sigue en uso, la operación debe fallar explícitamente — es exactamente la regla de integridad "no eliminar catálogos referenciados" ya establecida en el modelo lógico. |
| `FieldDependency.campo_dependiente_id` / `campo_requerido_id` → `Field.id` | `RESTRICT` | `CASCADE` | No debe poder borrarse un `Field` que sigue siendo requerido por otro — fuerza a resolver la dependencia primero (o desactivar, no borrar). |
| `ExecutionLog.company_id` / `layout_id` → `Company.id` / `Layout.id` | `SET NULL` | `CASCADE` | Única relación del esquema con `SET NULL`: si una `Company`/`Layout` se elimina en duro mucho después (caso administrativo excepcional, tras años), el registro histórico de auditoría **debe conservarse** (es un hecho pasado inmutable), simplemente pierde la referencia activa — no tiene sentido bloquear el borrado de configuración vieja por causa de logs de auditoría de hace años, ni tiene sentido borrar el log en cascada (se perdería el hecho histórico). |
| `ExtractionResultLog.execution_log_id` → `ExecutionLog.id` | `CASCADE` | `CASCADE` | Si se purga un `ExecutionLog` completo (política de retención futura, fuera de alcance), sus resultados asociados no tienen razón de sobrevivir sueltos. |
| `ExtractionResultLog.field_id` → `Field.id` | `RESTRICT` | `CASCADE` | Mismo argumento que `FieldDependency`: no debe poder desaparecer en duro un `Field` que sigue teniendo historial de resultados — si se necesita depurar un `Field`, primero debe purgarse o migrarse su historial de forma explícita y consciente, no como efecto colateral de un borrado. |
| `ExtractionResultLog.winning_strategy_id` → `Strategy.id` | `SET NULL` | `CASCADE` | Si la `Strategy` ganadora se elimina después (caso raro, tras rediseño de un campo), el resultado histórico conserva su valor pero pierde la referencia a "cuál estrategia exacta ganó" — preferible a `RESTRICT` (que bloquearía indefinidamente la limpieza de estrategias viejas) y a `CASCADE` (que borraría un resultado histórico válido solo porque su estrategia de origen ya no existe). |

**Resumen de la política**: `RESTRICT` es la opción por defecto para toda relación de configuración jerárquica y de catálogos reutilizables (protege contra pérdida accidental de integridad); `CASCADE` se reserva exclusivamente para relaciones de "parte-de" estricta (parámetros de una estrategia, filas de tablas puente); `SET NULL` se reserva exclusivamente para relaciones hacia tablas de auditoría histórica, donde el hecho pasado debe sobrevivir aunque su referencia de origen ya no exista.

---

## 5. Estrategia de soft delete

### Qué tablas la tienen
**Todas las tablas de configuración** (Company, ClassificationRule, Layout, LayoutDetectionRule, Anchor, Section, SectionEndAnchor*, Field, FieldDependency, Strategy, StrategyType, todos los catálogos transversales y sus ítems, Alias/AliasVariant, todas las tablas puente*, PresentationProfile, FieldPresentation) tienen columna `esta_activo`.

*Excepción: las tablas puente puras sin columnas propias de auditoría (`SectionEndAnchor`, `StrategyRegex`, `StrategyValidation`, `StrategyNormalization`, `StrategyExclusion`) **no llevan `esta_activo` propio** — su "activación" depende enteramente de que ambas filas que relaciona (ej. `Strategy` y `RegexCatalog`) estén activas; una fila de asociación huérfana funcionalmente se resuelve borrándola físicamente cuando se desvincula la relación, ya que no representa una entidad de negocio con historial propio, solo un enlace.

### Qué tablas NO la tienen
- **`ExecutionLog` y `ExtractionResultLog`**: son append-only por diseño; no se "desactivan" filas de auditoría histórica, se purgan completas bajo una política de retención (fuera de alcance) o se conservan indefinidamente.
- **`StrategyParameters*` (todas las satélite 1:1)**: su ciclo de vida está atado 1:1 al de su `Strategy` — si la `Strategy` se desactiva, sus parámetros son irrelevantes por transitividad sin necesitar su propia bandera; si la `Strategy` se borra en duro (única cascada real de borrado físico del esquema, §4), sus parámetros se borran con ella.
- **`ExclusionItem` / `ValueCatalogItem`**: tienen `esta_activo` (listado en §2), pero se documenta aquí la razón: a diferencia de sus cabeceras, un ítem individual sí puede querer "pausarse" sin desactivar el catálogo completo (ej. quitar temporalmente un estado de la lista de exclusión sin borrar el catálogo `Exclusion_Estados_MX` entero) — de ahí que sí necesiten la bandera propia.

### Cuándo se marca como eliminado
Exclusivamente por acción explícita de administración de configuración (nunca automáticamente por el motor de extracción, que solo lee configuración, no la modifica) — al retirar una aseguradora, descontinuar un layout obsoleto, o corregir un error de captura sin perder trazabilidad de qué existió en el pasado.

### Cuándo se permite borrado físico
Solo en dos escenarios, ambos excepcionales:
1. **Errores de captura sin uso real**: una fila creada por error y nunca referenciada por ninguna ejecución (`ExtractionResultLog` vacío para ella) puede borrarse físicamente sin pérdida de trazabilidad real — es indistinguible de "nunca existió".
2. **Purga administrativa deliberada de datos muy antiguos**, bajo política de retención explícita (fuera de alcance de este documento, mencionada como posibilidad futura en el modelo lógico §6.8).

En cualquier otro caso, **soft delete es la única vía**, precisamente porque las restricciones `RESTRICT` de §4 ya impiden el borrado físico mientras exista cualquier referencia activa — el diseño de FK y el diseño de soft delete se refuerzan mutuamente, no son mecanismos independientes.

---

## 6. Versionado — estrategia elegida

Se adopta el **mecanismo 2 ("snapshot ligero")** recomendado en el modelo lógico (§6.5), no el versionado temporal completo por vigencia. Traducción física de esa decisión:

- Las tablas de configuración (Layout, Section, Field, Strategy, catálogos) **no llevan columnas de vigencia temporal** (`vigente_desde`/`vigente_hasta`) en esta primera versión del esquema — se editan "en el sitio" (UPDATE directo), y su estado histórico exacto en el momento de cada ejecución pasada **no se reconstruye desde estas tablas**, sino desde la copia desnormalizada que ya vive en `ExtractionResultLog` (`valor_crudo`, `valor_normalizado`, `winning_strategy_id`, `confidence_score` — todos capturados en el momento de la ejecución, inmutables después).
- **Limitación aceptada y documentada explícitamente**: si se necesitara reconstruir *exactamente* qué `offset_lineas` o qué `tolerancia_x` estaba vigente cuando se generó un `ExtractionResultLog` de hace meses, y esos parámetros ya cambiaron desde entonces, este esquema **no lo permite** sin recurrir a backups externos de la base de datos. Es una limitación consciente, no un descuido — el modelo lógico ya justificó por qué se prefiere esta simplicidad inicial (§6.5: evitar sobre-ingeniería antes de que la necesidad sea real).
- **Camino de evolución ya previsto, sin implementarlo ahora**: si en producción se demuestra la necesidad de versionado temporal completo, la migración consistiría en agregar columnas `vigente_desde`/`vigente_hasta` a las tablas que lo requieran y cambiar el patrón de escritura de "UPDATE en el sitio" a "INSERT de nueva versión + cierre de la anterior" — cambio de comportamiento de la capa de aplicación, no una ruptura del esquema físico ya diseñado (las tablas ya tienen `creado_en`/`actualizado_en`, que sirven de base para calcular vigencia si se decide dar ese paso).

---

## 7. Auditoría — qué tablas tienen `created_at`/`updated_at`/`created_by`/`updated_by`

### Tablas que SÍ las tienen (traducidas a `creado_en`/`actualizado_en`/`creado_por`/`actualizado_por`, §1.7)
Todas las tablas de **configuración editable por humanos**: Company, CompanyClassificationRule, Layout, LayoutDetectionRule, Anchor, Section, Field, FieldDependency, Strategy, StrategyType, todos los `StrategyParameters*` *(ver excepción abajo)*, todos los catálogos transversales y sus ítems, Alias/AliasVariant, PresentationProfile, FieldPresentation.

**Justificación**: son datos que un humano (administrador de configuración) crea y modifica a lo largo del tiempo; sin auditoría, es imposible responder "¿quién cambió este offset y cuándo?" — pregunta que, según el propio riesgo de "mantenibilidad de datos" señalado en la arquitectura (§12), es exactamente el tipo de información necesaria para depurar configuración que empieza a comportarse mal después de un cambio.

**Excepción dentro de `StrategyParameters*`**: estas tablas satélite **no llevan columnas de auditoría propias** — su auditoría se resuelve por la de `Strategy` (relación 1:1 estricta; cualquier cambio en los parámetros implica, por flujo de la aplicación, una actualización también de `Strategy.actualizado_en`/`actualizado_por` como parte de la misma operación lógica). Duplicar auditoría en una tabla satélite 1:1 no aporta información nueva, solo redundancia.

### Tablas que NO las tienen
- **`ExecutionLog` / `ExtractionResultLog`**: tienen su propio timestamp de negocio (`iniciado_en`), que cumple el mismo propósito que `creado_en` sin necesidad de duplicarlo con otro nombre — son append-only y nunca se actualizan, por lo que `actualizado_en`/`actualizado_por` no tendrían sentido (nunca habría un segundo valor que registrar). No tienen `creado_por`/`actualizado_por` porque no las crea un humano, las crea el propio motor de extracción en ejecución automática — de existir un "responsable", sería el propio proceso, no una persona, y ya queda implícito en el hecho de que la fila existe.
- **Tablas puente sin columnas propias** (`SectionEndAnchor`, `StrategyRegex`, `StrategyValidation`, `StrategyNormalization`, `StrategyExclusion`): mismo argumento que en soft delete — no son entidades con historial propio, son enlaces; su creación/eliminación queda implícita en la auditoría de las entidades que relacionan.

---

## 8. Rendimiento

### Tablas más consultadas (lectura intensiva durante la ejecución del motor)
`Strategy`, `StrategyParameters*`, `RegexCatalog`, `ValidationCatalog`, `NormalizationCatalog`, `ExclusionCatalog`/`ExclusionItem`, `Section`, `Field`, `Anchor`, `Alias`/`AliasVariant` — se consultan en cada documento procesado, potencialmente varias veces por campo si no se cachean.

**Mitigación de diseño (ya anticipada en el documento de dominio, `ExecutionContext`)**: cargar **toda** la configuración de un `(Company, Layout)` en una sola tanda de consultas al inicio del procesamiento de un documento, y mantenerla en memoria durante el resto del pipeline — convierte docenas de consultas potenciales por documento en un puñado fijo (una por tabla relevante), independientemente de cuántos campos tenga el layout.

### Tablas casi estáticas (escritura rarísima, solo por administración)
`Company`, `StrategyType`, y en menor medida `Layout` — cambian por eventos de negocio poco frecuentes (integrar una aseguradora, agregar un tipo de estrategia nuevo al motor). El costo de mantenimiento de sus índices es irrelevante frente a su beneficio de lectura.

### Tablas con mayor volumen esperado
`ExtractionResultLog` (una fila por campo por documento procesado — con potencialmente miles de documentos mensuales × ~25-50 campos cada uno, es, por lejos, la tabla de mayor crecimiento del esquema) y `ExecutionLog` (una fila por documento). El resto de las tablas de configuración tienen volumen bajo y estable (decenas a cientos de filas totales, no miles).

### Consultas más frecuentes (a optimizar explícitamente con los índices ya definidos en §3)
1. "Todas las Strategy de un Field, en orden de prioridad" — cubierta por índice compuesto `Strategy(field_id, prioridad)`.
2. "Todas las Section/Field de un Layout" — cubierta por índices sobre `layout_id` en ambas tablas.
3. "Regex/Validation/Normalization/Exclusion asociados a una Strategy" — cubiertas por índices sobre `strategy_id` en cada tabla puente.
4. "Resultados históricos de una ejecución" — cubierta por índice sobre `ExtractionResultLog.execution_log_id`.
5. "¿Qué Company clasifica este documento?" — recorre `Company` (tabla pequeña, filtrada por `esta_activo`) y luego `CompanyClassificationRule` por `company_id` — ambas ya indexadas.

### Impacto esperado en SQLite
Dado el volumen de configuración (decenas de aseguradoras, unos pocos layouts cada una, decenas de campos por layout, 2-4 estrategias por campo) el conjunto de tablas de configuración completo cabe holgadamente en memoria de página de SQLite incluso sin ajustes especiales — el motor embebido de SQLite maneja este volumen sin necesidad de particionamiento ni de motor externo. El único punto de atención real de escalabilidad es `ExtractionResultLog`, cuyo crecimiento no acotado sí puede requerir, a mediano plazo, una política de archivado/purga (mencionada como trabajo futuro, no resuelta en este documento) — pero no compromete el rendimiento de la configuración en sí, que vive en tablas completamente separadas y de crecimiento controlado.

---

## 9. Preparación para migraciones futuras

| Cambio futuro | Cómo lo absorbe este esquema sin romperlo |
|---|---|
| **Nueva aseguradora** | Inserción de filas en `Company` + su árbol completo (`Layout`, `Section`, `Field`, `Strategy`, `StrategyParameters*`, `PresentationProfile`) — ninguna tabla existente se altera. |
| **Nuevo Layout de una aseguradora existente** | Inserción de una fila en `Layout` (posiblemente con `padre_layout_id` apuntando a un layout existente para heredar) + su propio árbol de Section/Field/Strategy — no afecta a los layouts existentes de la misma Company. |
| **Nuevo `StrategyType`** | Dos pasos, ambos aditivos: (1) crear la tabla satélite `StrategyParameters<Nuevo>` (única alteración de esquema real, y es una tabla *nueva*, no una modificación de tabla existente); (2) insertar la fila correspondiente en `StrategyType`. Ninguna `Strategy` ni `StrategyParameters` existente se toca. |
| **Nuevo catálogo transversal (ej. un nuevo tipo de `ExclusionCatalog` conceptualmente distinto)** | Si es del mismo tipo estructural (cabecera + items), se resuelve como filas nuevas en las tablas ya existentes (`ExclusionCatalog`/`ExclusionItem`) — no requiere tabla nueva salvo que el nuevo catálogo tenga una forma estructural genuinamente distinta, caso en que aplica el mismo patrón que un `StrategyType` nuevo (tabla nueva, aditiva). |
| **Nueva regla de negocio no anticipada en el catálogo actual de tipos de condición/relación** (ej. un nuevo `tipo_condicion` para `CompanyClassificationRule`) | Requiere ampliar el `CHECK IN (...)` correspondiente — es la única categoría de cambio que técnicamente altera una restricción de una tabla existente (no agrega tabla), pero es una alteración de bajo riesgo (ampliar una lista de valores permitidos nunca invalida datos ya existentes, solo permite valores nuevos a futuro). |
| **Cambio en la forma de presentación de salida (nuevo formato, nuevo idioma de nombres visibles)** | Nuevo `PresentationProfile` (fila nueva) — no afecta al perfil existente ni a ningún dato de extracción. |
| **Necesidad futura de versionado temporal completo** (§6) | Ampliación aditiva de columnas (`vigente_desde`/`vigente_hasta`) sobre las tablas de configuración ya diseñadas — no requiere rediseñar relaciones ni claves, solo agregar columnas y cambiar el patrón de escritura de la capa de aplicación. |
| **Política de retención/purga de `ExtractionResultLog`/`ExecutionLog`** | Al ser tablas independientes del árbol de configuración (relacionadas solo por FK de solo lectura hacia configuración, nunca al revés), su purga o archivado no tiene ningún efecto sobre la capacidad del motor de seguir extrayendo — son estrictamente aditivas y desacopladas. |

**Principio que garantiza esta estabilidad**: en todo este esquema, **el crecimiento futuro se resuelve casi siempre con filas nuevas, y en el peor caso con tablas nuevas — nunca con la alteración de una tabla existente que ya tiene datos de producción**, salvo la única categoría marcada arriba (ampliar un `CHECK` de enumeración cerrada), que es de riesgo mínimo por construcción. Es la consecuencia directa de haber elegido Table per Type sobre Single Table desde el modelo lógico: cada punto de extensión ya tiene, por diseño, su propio espacio aislado para crecer.

---

## 10. Orden recomendado de creación de tablas

El orden de creación debe respetar la dirección de las FK — SQLite no exige que la tabla referenciada exista antes (a diferencia de otros motores, permite crear tablas en cualquier orden si las FK se declaran pero no se verifican hasta la inserción), pero exigir este orden igualmente es la práctica correcta porque: (a) documenta la jerarquía real de dependencia para quien lea el script de creación, (b) evita que una activación tardía de `PRAGMA foreign_keys = ON` en medio del proceso de creación deje referencias colgantes sin detectar, y (c) permite que un script de creación se ejecute de arriba a abajo sin necesidad de desactivar verificación de FK en ningún punto.

**Nivel 0 — Catálogos sin ninguna dependencia hacia otra tabla de este esquema**
1. `Company`
2. `StrategyType`
3. `RegexCatalog` *(su FK a `Company` es opcional/nulable — puede crearse antes de `Company` en términos de contenido, pero se ubica después por prerrequisito de FK; ver nota abajo)*

**Nivel 1 — Dependen únicamente de `Company` (o de nada, con FK opcional a `Company`)**
4. `Layout` *(depende de `Company`; su autorreferencia `padre_layout_id` no bloquea la creación de la tabla en sí — es una FK hacia la misma tabla que se está creando, válido en SQLite)*
5. `Alias` *(FK opcional a `Company`)*
6. `ValidationCatalog`, `NormalizationCatalog`, `ExclusionCatalog`, `ValueCatalog` *(todas con FK opcional a `Company`; `ValidationCatalog` además referencia `ValueCatalog`, por lo que `ValueCatalog` debe crearse antes que `ValidationCatalog` dentro de este mismo nivel — ver dependencia cruzada en §11)*

**Nivel 2 — Dependen de `Layout` y de los catálogos del Nivel 1**
7. `Anchor` *(depende de `Alias` y `RegexCatalog`, ambos ya creados en niveles anteriores)*
8. `CompanyClassificationRule` *(depende de `Company` y `Anchor`)*
9. `LayoutDetectionRule` *(depende de `Layout` y `Anchor`)*
10. `Section` *(depende de `Layout` y `Anchor`)*
11. `ExclusionItem`, `ValueCatalogItem` *(dependen de sus respectivas cabeceras del Nivel 1)*
12. `AliasVariant` *(depende de `Alias`)*

**Nivel 3 — Dependen de `Section`**
13. `SectionEndAnchor` *(depende de `Section` y `Anchor`)*
14. `Field` *(depende de `Layout` y, opcionalmente, `Section`)*

**Nivel 4 — Dependen de `Field`**
15. `FieldDependency` *(depende de `Field`, dos veces — ambos roles ya existen en este nivel)*
16. `Strategy` *(depende de `Field` y `StrategyType`)*
17. `PresentationProfile` *(depende de `Company` y, opcionalmente, `Layout`)*

**Nivel 5 — Dependen de `Strategy`**
18. Las ocho tablas `StrategyParameters*` (`OffsetLine`, `Window`, `Geometric`, `Multiline`, `RelativeField`, `Table`, `Frequency`, `AIAssisted`) — cada una depende de `Strategy`; `RelativeField` depende además de `Field` (ya creada) y `Table` depende además de `RegexCatalog` (ya creada); `AIAssisted` depende opcionalmente de `Section` (ya creada).
19. `StrategyRegex`, `StrategyValidation`, `StrategyNormalization`, `StrategyExclusion` — cada una depende de `Strategy` y de su catálogo correspondiente (ya creados en niveles anteriores).
20. `FieldPresentation` — depende de `PresentationProfile` y `Field` (ambas ya creadas).

**Nivel 6 — Tablas de auditoría/ejecución, sin las cuales el esquema de configuración ya es completo y usable**
21. `ExecutionLog` *(FK opcionales a `Company` y `Layout`)*
22. `ExtractionResultLog` *(depende de `ExecutionLog`, `Field` y, opcionalmente, `Strategy`)*

**Nota sobre `RegexCatalog` y `Company`**: aunque `RegexCatalog.company_id` es nulable (catálogo global por defecto), se posiciona en el Nivel 0 con la advertencia de que su FK hacia `Company` exige que `Company` ya exista si se va a insertar un registro con propietario — la *creación de la tabla* no depende de `Company`, pero la *carga de datos* sí, en el caso de catálogos con dueño. Esta distinción (orden de creación de esquema vs. orden de carga de datos) es intencional y se retoma en el roadmap del modelo lógico (seed de catálogos globales antes que configuración de aseguradoras).

---

## 11. Dependencias entre tablas (mapa completo)

```
Company
  ├─ Layout (company_id)
  │    ├─ Layout (padre_layout_id, autorreferencia)
  │    ├─ LayoutDetectionRule (layout_id) ── Anchor (anchor_id)
  │    ├─ Section (layout_id) ── Anchor (anchor_inicio_id)
  │    │    ├─ SectionEndAnchor (section_id, anchor_id) ── Anchor
  │    │    └─ Field (section_id, opcional)
  │    ├─ Field (layout_id)
  │    │    ├─ FieldDependency (campo_dependiente_id, campo_requerido_id) ── Field (autorreferencia vía tabla propia)
  │    │    └─ Strategy (field_id) ── StrategyType (strategy_type_id)
  │    │         ├─ StrategyParametersOffsetLine (strategy_id)
  │    │         ├─ StrategyParametersWindow (strategy_id)
  │    │         ├─ StrategyParametersGeometric (strategy_id)
  │    │         ├─ StrategyParametersMultiline (strategy_id)
  │    │         ├─ StrategyParametersRelativeField (strategy_id) ── Field (campo_referencia_id)
  │    │         ├─ StrategyParametersTable (strategy_id) ── RegexCatalog (patron_encabezado_id)
  │    │         ├─ StrategyParametersFrequency (strategy_id)
  │    │         ├─ StrategyParametersAIAssisted (strategy_id) ── Section (section_id, opcional)
  │    │         ├─ StrategyRegex (strategy_id) ── RegexCatalog
  │    │         ├─ StrategyValidation (strategy_id) ── ValidationCatalog ── ValueCatalog (value_catalog_id, opcional)
  │    │         ├─ StrategyNormalization (strategy_id) ── NormalizationCatalog
  │    │         └─ StrategyExclusion (strategy_id) ── ExclusionCatalog ── ExclusionItem (1:N)
  │    └─ PresentationProfile (layout_id, opcional)
  ├─ CompanyClassificationRule (company_id) ── Anchor (anchor_id)
  ├─ PresentationProfile (company_id) ── FieldPresentation (presentation_profile_id) ── Field (field_id)
  ├─ RegexCatalog (company_id, opcional)
  ├─ ValidationCatalog (company_id, opcional)
  ├─ NormalizationCatalog (company_id, opcional)
  ├─ ExclusionCatalog (company_id, opcional) ── ExclusionItem (1:N)
  ├─ ValueCatalog (company_id, opcional) ── ValueCatalogItem (1:N)
  ├─ Alias (company_id, opcional) ── AliasVariant (1:N)
  ├─ ExecutionLog (company_id, opcional; layout_id, opcional)
  │    └─ ExtractionResultLog (execution_log_id) ── Field (field_id), Strategy (winning_strategy_id, opcional)

Anchor (independiente, sin FK hacia Company/Layout — es consumida por referencia desde arriba)
  ├─ Alias (alias_id, opcional)
  └─ RegexCatalog (regex_id, opcional)
```

**Lectura del mapa**: existen dos tipos de dependencia mezclados a propósito y que conviene distinguir al planear cualquier migración futura:
- **Dependencia jerárquica de configuración** (Company → Layout → Section/Field → Strategy → StrategyParameters/tablas puente): sigue estrictamente el árbol del Aggregate `InsuranceCompanyAggregate` del documento de dominio — nunca se salta niveles, nunca hay referencias "hacia arriba" fuera de esta cadena.
- **Dependencia transversal hacia catálogos compartidos** (cualquier nivel de la jerarquía puede referenciar `RegexCatalog`, `ValidationCatalog`, `NormalizationCatalog`, `ExclusionCatalog`, `ValueCatalog`, `Alias`, `Anchor`): estas referencias cruzan Aggregates deliberadamente (ya justificado en el documento de dominio §4) y son las que garantizan reutilización — el mapa las distingue visualmente con `──` en vez de anidamiento, para diferenciar "es parte de" de "referencia a".

**Ciclo de dependencia más profundo del esquema**: `Field` → `Strategy` → `StrategyParametersRelativeField` → `Field` (autorreferencia indirecta vía una tabla intermedia). No es un ciclo de creación de esquema (las tres tablas se crean en niveles distintos y sucesivos, §10), sino un ciclo de **dependencia de datos** que debe validarse en tiempo de escritura (aciclicidad de `FieldDependency`, ya señalada en §2 de este documento) — se resalta aquí porque es el único punto del mapa donde una tabla de configuración termina, indirectamente, dependiendo de sí misma.

---

## 12. Riesgos conocidos del diseño físico (consolidado)

Esta sección consolida, en un solo lugar, los riesgos que ya aparecieron dispersos en §1-§9, para que sirvan como checklist de revisión antes de generar el SQL final:

| Riesgo | Dónde se originó en este documento | Mitigación ya adoptada |
|---|---|---|
| `NULL` no colisiona en restricciones `UNIQUE` de SQLite, permitiendo duplicados no deseados entre catálogos "globales" | §2 (RegexCatalog, ValidationCatalog, NormalizationCatalog, ExclusionCatalog, ValueCatalog, Alias, PresentationProfile) | Índice único parcial `WHERE company_id IS NULL` (y análogo `WHERE layout_id IS NULL` en PresentationProfile) en cada caso — debe implementarse sin excepción en el SQL final, es fácil de omitir por descuido al ser sintaxis menos común. |
| Reglas de negocio no expresables como `CHECK` declarativo simple (un solo Layout default por Company activo; aciclicidad de herencia de Layouts; aciclicidad transitiva de `FieldDependency` más allá de un paso; mismo `layout_id` entre ambos lados de una `FieldDependency`) | §2 (Layout, FieldDependency) | Documentadas explícitamente como reglas de validación de aplicación — **riesgo real si se omite esta capa**: sin ella, la base de datos por sí sola permite estados inconsistentes que el motor de extracción podría interpretar de forma impredecible (ej. dos layouts default, o un ciclo de dependencia que cuelgue `DependencyResolver`). |
| Columnas de texto libre como excepción deliberada (`offsets_alternativos`, `NormalizationCatalog.parametros`) | §2 | Aceptado y documentado como decisión de proporcionalidad, no de descuido — pero cualquier tercera excepción futura debe revisarse contra el mismo criterio (¿la variedad/complejidad de parámetros justifica una tabla satélite, o es un caso de cola trivial?) para no erosionar gradualmente la disciplina de Table per Type. |
| `ExtractionResultLog` como tabla de crecimiento no acotado | §8 | Señalado como el único punto real de atención de escalabilidad a mediano plazo; sin política de purga/archivado, puede convertirse en la tabla dominante del archivo `.db` completo — riesgo aceptado en esta fase, a resolver explícitamente antes de un volumen de producción sostenido. |
| Ausencia de versionado temporal completo (§6 del documento anterior) | Modelo lógico §6.5, ratificado aquí | No se puede reconstruir con exactitud la configuración vigente en un momento pasado si ya cambió — riesgo aceptado deliberadamente por proporcionalidad, con camino de migración ya previsto (agregar columnas de vigencia) si se demuestra necesario en producción. |
| Dependencia cruzada de creación entre `ValueCatalog` y `ValidationCatalog` (Nivel 1 de §10) | §10 | Requiere que, dentro del mismo nivel de creación, `ValueCatalog` se cree estrictamente antes que `ValidationCatalog` — si el script de creación no respeta este sub-orden, la FK de `ValidationCatalog.value_catalog_id` fallará; se documenta aquí para que no se pierda al traducir a SQL secuencial. |
| Falta de índice automático sobre columnas FK en SQLite (a diferencia de otros motores) | §3 del documento anterior, ratificado aquí | Cada FK usada en joins frecuentes fue indexada explícitamente en el diseño (§2-§3) — el riesgo real es que, al escribir el SQL final, se omita alguno de estos índices por no ser "obligatorio" para que la FK funcione (SQLite no lo exige para la integridad referencial en sí, solo para el rendimiento) — debe verificarse contra la lista completa de §3 del documento anterior antes de considerar el SQL terminado. |

---

## 13. Cómo verificar que este diseño está completo antes de pasar a SQL

Checklist de cierre de esta fase (no es un paso adicional de diseño, es una verificación de que no falta nada):
1. Toda tabla listada en §10 (orden de creación) tiene una entrada correspondiente en la sección 2 de este documento con su diseño físico completo. ✔ (verificado: las 35 tablas del inventario del modelo lógico están representadas, incluyendo las 8 satélite de `StrategyParameters*` y las 5 tablas puente).
2. Toda FK mencionada en §11 (mapa de dependencias) tiene una política `ON DELETE`/`ON UPDATE` explícita en la sección correspondiente del documento anterior (§4) — ninguna FK debe llegar al SQL final sin esta decisión ya tomada.
3. Toda tabla con `company_id` u otra columna de propietario opcional tiene su índice único parcial correspondiente ya señalado (§2 de este documento y riesgo consolidado en §12).
4. Ninguna tabla de configuración quedó sin columnas de auditoría, salvo las excepciones ya justificadas explícitamente (§7 del documento anterior).

Con este checklist satisfecho, el siguiente documento (SQL físico real, `CREATE TABLE` con sintaxis SQLite concreta) no debería requerir ninguna decisión de diseño nueva — solo traducción sintáctica directa de lo ya establecido en este documento y en el modelo lógico.
