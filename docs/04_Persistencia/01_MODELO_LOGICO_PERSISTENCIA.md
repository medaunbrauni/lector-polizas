# Modelo lógico de persistencia (sin SQL)

Traducción del dominio descrito en [Dominio DDD](../02_Dominio/01_DOMINIO_DDD.md) hacia un modelo relacional lógico, previo a SQLite. Sin `CREATE TABLE`, sin código, sin ORM, sin UML. Cada sección usa el vocabulario relacional (tabla, clave, restricción, cardinalidad) de forma puramente conceptual.

---

## 1. Convenciones de este documento

- **Clave primaria (PK)**: se recomienda identificador sintético (surrogate key) en toda tabla de configuración, no clave natural (nombres), porque los nombres cambian (una aseguradora puede renombrarse) y las claves foráneas no deben depender de eso.
- **Clave foránea (FK)**: se describe como "tabla referenciada + cardinalidad", sin nombre de columna concreto.
- **Soft delete**: se declara "sí/no" por tabla según si un registro eliminado debe seguir siendo referenciable por trazabilidad histórica (ver §3.7-3.8) o si es seguro borrar en duro.
- **Versionado**: se declara "sí/no" por tabla según si la fila puede cambiar de forma que afecte resultados ya producidos, y por tanto necesita conservar su estado histórico (ver §6.5).
- **Auditoría**: se declara "sí/no" por tabla según si cambios sobre ella deben quedar registrados con quién/cuándo, independientemente del versionado del contenido.

---

## 2. Traducción entidad → tabla

### 2.1 `InsuranceCompany` → tabla **Company**
- **Propósito**: raíz de todo el árbol de configuración de una aseguradora.
- **Atributos**: identificador, nombre, nombre corto/código, estado (activa/inactiva), fecha de alta.
- **PK**: identificador sintético.
- **FK**: ninguna saliente.
- **Restricciones**: nombre no vacío.
- **Unicidad**: nombre único (evita dos aseguradoras con el mismo nombre por error de captura); código corto único si existe.
- **Índices recomendados**: por nombre (búsquedas administrativas), por estado (filtrar activas rápidamente).
- **Cardinalidad**: 1 Company → N Layout; 1 Company → 1 ClassificationRule.
- **Aggregate**: raíz de `InsuranceCompanyAggregate`.
- **Reglas de integridad**: no se puede desactivar una Company que tenga Layouts activos sin desactivarlos explícitamente primero (regla de aplicación, no solo de base de datos).
- **Soft delete**: **sí** — una Company nunca debe borrarse en duro porque `ExtractionResult` históricos (si se persisten) la referencian; se desactiva, no se elimina.
- **Versionado**: no a nivel de fila completa (el nombre/código no afecta resultados pasados de forma crítica), pero ver §6.5 para el efecto indirecto vía sus hijos.
- **Auditoría**: sí — alta/baja/cambio de estado debe quedar registrado (quién agregó una aseguradora nueva, cuándo).

### 2.2 `ClassificationRule` → tabla **CompanyClassificationRule**
- **Propósito**: condición que decide si un documento pertenece a una Company.
- **Atributos**: identificador, referencia a Company, tipo de condición (obligatoria/confirmación/exclusión), referencia a catálogo de Regex o Alias usado, orden de evaluación.
- **PK**: identificador sintético.
- **FK**: Company (obligatoria, 1), opcionalmente Regex/Alias (catálogo global).
- **Restricciones**: cada Company debe tener al menos una condición de tipo "obligatoria" (si no, el motor no podría discriminarla — ver riesgo de ambigüedad, arquitectura §12).
- **Unicidad**: no aplica (una Company puede tener múltiples condiciones).
- **Índices**: por Company (consulta frecuente: "traer todas las reglas de esta Company").
- **Cardinalidad**: 1 Company → N reglas de clasificación.
- **Aggregate**: parte de `InsuranceCompanyAggregate`.
- **Reglas de integridad**: si la condición referencia un Regex/Alias, ese registro debe existir y estar activo.
- **Soft delete**: sí, misma razón que Company.
- **Versionado**: sí — ver §6.5, porque cambiar una regla de clasificación puede alterar cómo se clasificaron documentos procesados antes del cambio.
- **Auditoría**: sí.

### 2.3 `LayoutDefinition` → tabla **Layout**
- **Propósito**: representar una variante/versión de plantilla dentro de una Company.
- **Atributos**: identificador, referencia a Company, nombre (ej. "Qualitas 2022"), referencia opcional a Layout padre (herencia), es-default (booleano), estado.
- **PK**: identificador sintético.
- **FK**: Company (obligatoria, 1); Layout padre (opcional, 0 o 1, autorreferencia).
- **Restricciones**: exactamente un Layout por Company debe estar marcado `es-default = true` en un momento dado (regla de aplicación, ver §5.4 integridad).
- **Unicidad**: nombre único dentro de la misma Company.
- **Índices**: por Company; por (Company, es-default) para resolver rápido el layout de respaldo.
- **Cardinalidad**: 1 Company → N Layout; 1 Layout → 0..1 Layout padre (autorreferencia, ver §5).
- **Aggregate**: parte de `InsuranceCompanyAggregate`.
- **Reglas de integridad**: un Layout no puede ser padre de sí mismo ni formar ciclos de herencia (A hereda de B, B hereda de A) — validación de grafo acíclico en tiempo de escritura.
- **Soft delete**: sí.
- **Versionado**: sí (ver §6.5) — cambiar la herencia o el contenido de un Layout activo afecta la reproducibilidad de resultados pasados.
- **Auditoría**: sí.

### 2.4 `LayoutDetectionRule` → tabla **LayoutDetectionRule**
- **Propósito**: condición que distingue un Layout de otro dentro de la misma Company.
- **Atributos**: identificador, referencia a Layout, tipo de condición, referencia a Regex/Alias, orden de evaluación, peso/confianza que aporta si matchea.
- **PK**: identificador sintético.
- **FK**: Layout (obligatoria, 1); Regex/Alias (catálogo global, opcional).
- **Unicidad**: no aplica.
- **Índices**: por Layout.
- **Cardinalidad**: 1 Layout → N reglas de detección.
- **Aggregate**: parte de `InsuranceCompanyAggregate`.
- **Soft delete**: sí. **Versionado**: sí. **Auditoría**: sí.

### 2.5 `SectionDefinition` → tabla **Section**
- **Propósito**: describir una región lógica del documento.
- **Atributos**: identificador, referencia a Layout, nombre lógico, referencia a Alias/Regex para ancla de inicio, referencia a Alias/Regex para ancla(s) de fin (puede ser N, ver §4.2), margen de seguridad por defecto (magnitud + unidad).
- **PK**: identificador sintético.
- **FK**: Layout (obligatoria, 1); ancla de inicio → Alias o Regex (uno de los dos, no ambos — ver §5 restricción de exclusividad); ancla(s) de fin → relación N:M hacia Alias/Regex (ver §2.16).
- **Unicidad**: nombre lógico único dentro del mismo Layout.
- **Índices**: por Layout.
- **Cardinalidad**: 1 Layout → N Section.
- **Aggregate**: parte de `InsuranceCompanyAggregate`.
- **Reglas de integridad**: debe tener ancla de inicio siempre; si no tiene ninguna ancla de fin registrada, el margen de seguridad por defecto es obligatorio (no puede quedar indefinida indefinidamente).
- **Soft delete**: sí. **Versionado**: sí (ver §6.5). **Auditoría**: sí.

### 2.6 `FieldDefinition` → tabla **Field**
- **Propósito**: describir un dato de negocio a extraer.
- **Atributos**: identificador, referencia a Layout, nombre lógico, tipo de dato esperado (enumerado: monto/fecha/texto/catálogo/booleano), referencia opcional a Section (ámbito por defecto), valor por defecto declarado, representación del valor por defecto (vacío/texto/nulo — ver auditoría, inconsistencia a resolver aquí como dato explícito).
- **PK**: identificador sintético.
- **FK**: Layout (obligatoria, 1); Section (opcional, 0 o 1).
- **Unicidad**: nombre lógico único dentro del mismo Layout.
- **Índices**: por Layout; por (Layout, Section) para consultas de "campos de esta sección".
- **Cardinalidad**: 1 Layout → N Field; 1 Section → N Field (opcional).
- **Aggregate**: parte de `InsuranceCompanyAggregate`.
- **Reglas de integridad**: debe tener al menos una Strategy asociada (un Field sin estrategias nunca podría resolverse — validación de configuración, no solo de base de datos).
- **Soft delete**: sí. **Versionado**: sí. **Auditoría**: sí.

### 2.7 `FieldDependency` → tabla **FieldDependency**
- **Propósito**: relación "este campo necesita el resultado de otro ya resuelto".
- **Atributos**: identificador, Field dependiente (FK), Field requerido (FK), tipo de relación (enumerado: ancla-de-offset / filtro-de-exclusión / delimitador-de-ventana).
- **PK**: identificador sintético.
- **FK**: Field (dependiente, 1); Field (requerido, 1) — dos FK hacia la misma tabla `Field`, con roles distintos.
- **Unicidad**: combinación (Field dependiente, Field requerido, tipo de relación) única — evita declarar la misma dependencia dos veces.
- **Índices**: por Field dependiente (resolución de orden topológico se consulta "de quién depende X"); por Field requerido (consulta inversa "quién depende de Y", útil para no eliminar un Field que otros necesitan).
- **Cardinalidad**: N:M entre Field y Field (un campo puede depender de varios; varios campos pueden depender del mismo).
- **Aggregate**: parte de `InsuranceCompanyAggregate`.
- **Reglas de integridad**: **no debe permitir ciclos** (A depende de B, B depende de A) — validación de grafo acíclico obligatoria antes de guardar, porque `DependencyResolver` (servicio de dominio) asume que existe un orden topológico válido; ambos Field deben pertenecer al mismo Layout (ver nota de dominio sobre no cruzar Aggregates).
- **Soft delete**: no necesario — si se elimina, se elimina la relación, no hay trazabilidad histórica que perder aquí (la trazabilidad vive en `ExtractionResult`, no en la dependencia declarada). **Versionado**: no aplica directamente (ver nota en §6.5, el versionado del Field cubre esto indirectamente). **Auditoría**: sí, deseable.

### 2.8 `StrategyDefinition` → tabla **Strategy**
- **Propósito**: describir un método de localización concreto para un Field, en una posición de prioridad.
- **Atributos**: identificador, referencia a Field, referencia a tipo de estrategia (catálogo cerrado, ver §2.9), valor de prioridad (entero, orden de ejecución).
- **PK**: identificador sintético.
- **FK**: Field (obligatoria, 1); StrategyType (obligatoria, 1, catálogo cerrado).
- **Unicidad**: combinación (Field, prioridad) única — dos estrategias del mismo campo no pueden compartir la misma prioridad (ambigüedad de orden).
- **Índices**: por (Field, prioridad) — es la consulta más frecuente del motor ("traer las estrategias de este campo, en orden").
- **Cardinalidad**: 1 Field → N Strategy.
- **Aggregate**: parte de `InsuranceCompanyAggregate`.
- **Reglas de integridad**: las prioridades de un mismo Field deben ser una secuencia sin huecos ambiguos (recomendado, no estrictamente obligatorio: 1,2,3 en vez de 1,5,9 — facilita mantenimiento, pero no es un requisito duro del motor, que solo necesita orden relativo).
- **Soft delete**: sí (permite desactivar una estrategia sin perder su historial de uso en resultados pasados). **Versionado**: sí — crítico, ver §6.5. **Auditoría**: sí.

**Nota importante (resuelve la advertencia de diseño del documento de dominio, §9 final)**: `Strategy` **no contiene columnas de parámetros propias** (no columnas anchas con offset/ventana/tolerancias todas presentes y casi siempre nulas). Los parámetros viven en tablas satélite específicas por tipo, descritas en §4 (Table per Type). `Strategy` es la tabla "delgada" que ancla identidad + prioridad + tipo; cada tipo de estrategia tiene su propia tabla de parámetros relacionada 1:1 con `Strategy`.

### 2.9 `StrategyType` → tabla **StrategyType** (catálogo cerrado, tabla de referencia)
- **Propósito**: enumerar los tipos de estrategia disponibles en el motor (§4 del documento de arquitectura: POR_ETIQUETA_Y_OFFSET, POR_COORDENADAS_MISMA_FILA, POR_TABLA, etc.).
- **Atributos**: identificador, código/nombre técnico, descripción humana, nombre de la tabla de parámetros asociada (metadato de mapeo, útil para el motor al momento de resolver polimorfismo — ver §4).
- **PK**: identificador sintético (o el propio código, ya que es un catálogo cerrado y estable — aceptable usar clave natural aquí por excepción, dado que no cambia por captura de usuario final sino por evolución del motor).
- **Unicidad**: código único.
- **Cardinalidad**: 1 StrategyType → N Strategy (de cualquier Field/Layout/Company).
- **Aggregate**: no pertenece a `InsuranceCompanyAggregate` — es catálogo global del motor, mantenido por el equipo de desarrollo, no por captura de negocio.
- **Soft delete**: no aplica normalmente (se agregan tipos nuevos, raramente se retiran; si se retira uno, debe impedirse mientras existan `Strategy` activas de ese tipo). **Versionado**: no. **Auditoría**: sí (cambios aquí son eventos de evolución del motor, dignos de registro).

### 2.10 `RegexDefinition` → tabla **RegexCatalog**
- **Propósito**: patrón reutilizable con nombre.
- **Atributos**: identificador, nombre lógico, patrón, descripción, indicadores (case-insensitive, multilínea), propietario opcional (Company, si es un regex específico y no global).
- **PK**: identificador sintético.
- **FK**: Company (opcional, 0 o 1 — nulo si es global).
- **Unicidad**: nombre lógico único (globalmente, o único dentro del propietario si tiene dueño — ver restricción condicional en §5).
- **Índices**: por nombre; por propietario.
- **Cardinalidad**: 1 RegexCatalog → N Strategy (vía tabla de asociación, ver §2.16); 0..1 Company → N RegexCatalog propios.
- **Aggregate**: `RegexCatalogAggregate` (independiente).
- **Reglas de integridad**: no puede eliminarse (ni siquiera soft-delete sin marcar) si está referenciado por alguna `Strategy` activa — regla de integridad referencial reforzada por lógica de aplicación además de FK.
- **Soft delete**: sí. **Versionado**: sí — crítico (ver §6.5: cambiar un patrón regex reutilizado por 10 campos de 3 aseguradoras es un cambio de alto impacto). **Auditoría**: sí.

### 2.11 `ValidationDefinition` → tabla **ValidationCatalog**
- Estructura análoga a `RegexCatalog`: identificador, nombre, tipo de validador (catálogo cerrado: RFC/VIN/CP/Placa/Monto/PerteneceACatalogo), referencia opcional a `ValueCatalog` si el tipo es "pertenece a catálogo", propietario opcional.
- **PK/FK/Unicidad/Índices/Cardinalidad**: análogos a §2.10.
- **Aggregate**: `ValidationCatalogAggregate`.
- **Soft delete**: sí. **Versionado**: sí. **Auditoría**: sí.

### 2.12 `NormalizationDefinition` → tabla **NormalizationCatalog**
- Análoga: identificador, nombre, tipo de normalizador (catálogo cerrado: Uppercase/NFKD/Strip/TitleCase/LimpiarCaracteres/FormateoConParametros), parámetros propios (ver nota de polimorfismo, mismo patrón que Strategy — si un tipo de normalización tiene parámetros propios como "qué caracteres limpiar", va en tabla satélite, no en columnas anchas).
- **Aggregate**: `NormalizationCatalogAggregate`.
- **Soft delete**: sí. **Versionado**: sí. **Auditoría**: sí.

### 2.13 `ExclusionDefinition` → tabla **ExclusionCatalog** (cabecera) + tabla **ExclusionItem** (detalle, 1:N)
- **Propósito**: nombrar un catálogo de exclusión (ej. "Exclusion_Codigos_Motor") y enumerar sus elementos.
- **ExclusionCatalog — atributos**: identificador, nombre, descripción, propietario opcional (Company).
- **ExclusionItem — atributos**: identificador, referencia a ExclusionCatalog, valor literal o patrón excluido.
- **PK**: sintético en ambas.
- **FK**: ExclusionItem → ExclusionCatalog (obligatoria, 1).
- **Unicidad**: nombre de ExclusionCatalog único (global o por propietario); (ExclusionCatalog, valor) único en ExclusionItem para evitar duplicados.
- **Cardinalidad**: 1 ExclusionCatalog → N ExclusionItem.
- **Aggregate**: `ExclusionCatalogAggregate`.
- **Soft delete**: sí (en ambas). **Versionado**: sí (agregar/quitar un ítem de exclusión cambia comportamiento futuro). **Auditoría**: sí.

### 2.14 `ValueCatalog` → tabla **ValueCatalog** (cabecera) + tabla **ValueCatalogItem** (detalle, 1:N)
- Misma estructura que §2.13, pero semánticamente es "lista blanca" en vez de "lista de exclusión". Se modelan como tablas separadas de `ExclusionCatalog`/`ExclusionItem` porque, aunque estructuralmente idénticas, tienen ciclos de vida y significados de negocio distintos (una es "esto SÍ es válido", la otra "esto NUNCA es válido") — mezclarlas en una sola tabla genérica de "listas" obligaría a un campo discriminador y complicaría las restricciones de integridad específicas de cada una sin beneficio real.
- **Aggregate**: `ExclusionCatalogAggregate` (se agrupan bajo el mismo Aggregate por conveniencia de gobierno, dado que ambos son catálogos de listas de valores con el mismo patrón de mantenimiento — decisión de agrupación, no de estructura).
- **Soft delete/Versionado/Auditoría**: igual que §2.13.

### 2.15 `Document` — **no se persiste como tabla de configuración**
`Document` es un objeto transitorio de ejecución (texto + estructura ya leída de un PDF concreto). No tiene lugar en el modelo de configuración. Si se decide guardar una referencia al documento fuente por trazabilidad (ver §6.7), se modela como una tabla de **auditoría de ejecución** separada (`ExecutionLog`, ver §2.19), nunca como parte del árbol Company→Layout→Section→Field.

### 2.16 Tablas de asociación (N:M) necesarias

| Tabla de asociación | Relaciona | Por qué N:M |
|---|---|---|
| **StrategyRegex** | Strategy ↔ RegexCatalog | Una estrategia puede usar varios regex en orden (lista de alternativos, `POR_REGEX_MULTIPLE`); un mismo regex puede usarse en muchas estrategias de muchos campos/aseguradoras |
| **StrategyValidation** | Strategy ↔ ValidationCatalog | Una estrategia puede requerir más de una validación (raro pero posible); una validación se reutiliza en muchas estrategias |
| **StrategyNormalization** | Strategy ↔ NormalizationCatalog | Una estrategia aplica normalizaciones en cadena (orden importa — la tabla de asociación debe llevar un atributo de orden, ver §5); reutilización total entre estrategias |
| **StrategyExclusion** | Strategy ↔ ExclusionCatalog | Una estrategia puede filtrar contra más de un catálogo de exclusión a la vez |
| **SectionEndAnchor** | Section ↔ (Alias o Regex) | Una sección puede tener varias anclas de cierre alternativas (ej. Qualitas: `DESGLOSE`/`CONSIDERACIONES`/`IMPORTE`/`OBSERVACIONES`) |
| **FieldPresentation** *(ver §2.18)* | Field ↔ PresentationProfile | Un campo puede presentarse de forma distinta en perfiles distintos; un perfil cubre muchos campos |

### 2.17 `AliasDefinition` → tabla **Alias** (cabecera) + tabla **AliasVariant** (detalle, 1:N)
- **Alias — atributos**: identificador, nombre lógico del grupo (ej. "Ancla_Informacion_Asegurado"), modo de coincidencia (exacta/contiene), sensibilidad a mayúsculas/acentos.
- **AliasVariant — atributos**: identificador, referencia a Alias, texto de la variante.
- **Cardinalidad**: 1 Alias → N AliasVariant.
- **Aggregate**: se agrupa junto con los catálogos transversales por el mismo argumento de reutilización (un mismo Alias puede usarse como ancla de Section en varias Company que compartan terminología, o dentro de reglas de clasificación/detección).
- **Soft delete**: sí. **Versionado**: sí. **Auditoría**: sí.

### 2.18 `PresentationProfile` → tabla **PresentationProfile** (cabecera) + tabla **FieldPresentation** (detalle, N:M resuelta)
- **PresentationProfile — atributos**: identificador, referencia a Company (o Layout, si el contrato de salida varía por layout), nombre del perfil.
- **FieldPresentation — atributos**: identificador, referencia a PresentationProfile, referencia a Field, nombre visible en la salida, orden de presentación, formato adicional (prefijo/sufijo).
- **PK**: sintético en ambas.
- **FK**: FieldPresentation → PresentationProfile (1) y → Field (1).
- **Unicidad**: (PresentationProfile, Field) único — un campo no puede aparecer dos veces en el mismo perfil; (PresentationProfile, orden) único si se quiere garantizar un orden sin ambigüedad.
- **Cardinalidad**: 1 PresentationProfile → N FieldPresentation; 1 Field → N FieldPresentation (un campo puede estar en varios perfiles).
- **Aggregate**: `PresentationProfileAggregate`.
- **Soft delete**: sí. **Versionado**: sí (cambiar nombres visibles de un contrato de API ya consumido es un cambio de alto impacto externo). **Auditoría**: sí.

### 2.19 `ExecutionContext` / `ExtractionResult` — persistencia opcional de auditoría
Ver desarrollo completo en §6.6-6.7. Resumen: no forman parte del árbol de configuración; si se persisten, es en un esquema de **auditoría/trazabilidad** separado (`ExecutionLog`, `ExtractionResultLog`), con su propio ciclo de vida (append-only, sin versionado en el sentido de §6.5 porque no se editan, se crean una vez y se conservan).

---

## 3. Relaciones — inventario completo con justificación

### 3.1 Relaciones 1:1
| Relación | Justificación |
|---|---|
| **Strategy ↔ tabla de parámetros satélite** (una por StrategyType, ver §4) | Cada `Strategy` tiene exactamente un conjunto de parámetros, y ese conjunto varía de forma en que un modelo "Table per Type" resuelve mejor que columnas anchas — la relación entre `Strategy` y, por ejemplo, `StrategyParametersOffset` es 1:1 estricta: una fila de parámetros por estrategia, nunca más de una del mismo tipo. |
| **Company ↔ ClassificationRule** *(conceptualmente 1:1 "principal", aunque el modelo permite varias condiciones — ver 3.2)* | Cada Company tiene un conjunto de reglas que en conjunto determinan su clasificación; si se modela como una única regla compuesta (en vez de varias condiciones atómicas), sería 1:1 puro. Se optó por 1:N (§3.2) porque ya se demostró en la auditoría que las condiciones son atómicas y de distinto tipo (obligatoria/confirmación/exclusión) — mantenerlo así es más flexible que forzar una regla monolítica. |

### 3.2 Relaciones 1:N
| Relación | Justificación |
|---|---|
| Company → Layout | Una aseguradora puede tener múltiples plantillas/versiones (requisito central del documento de arquitectura, §8). |
| Company → CompanyClassificationRule | Una clasificación se compone de varias condiciones atómicas evaluadas en conjunto. |
| Layout → LayoutDetectionRule | Igual razón, a nivel de layout. |
| Layout → Section | Cada layout define su propio conjunto de secciones (pueden diferir entre layouts de la misma Company). |
| Layout → Field | Cada layout define su propio conjunto de campos y su configuración (mismo campo lógico puede tener estrategias distintas en layouts distintos — de ahí que Field cuelgue de Layout, no de Company directamente). |
| Section → Field | Un campo tiene, como máximo, una sección de ámbito por defecto (opcional) — una sección puede ser el ámbito de muchos campos. |
| Field → Strategy | Un campo tiene una cascada ordenada de estrategias. |
| ExclusionCatalog → ExclusionItem / ValueCatalog → ValueCatalogItem | Un catálogo de lista se compone de varios ítems atómicos. |
| Alias → AliasVariant | Un grupo de alias se compone de varias variantes textuales equivalentes. |
| PresentationProfile → FieldPresentation | Un perfil de salida define la presentación de varios campos. |
| Layout → Layout (autorreferencia, padre) | Mecanismo de herencia de layouts (§8 de la arquitectura) — cada layout tiene, como máximo, un padre, pero un padre puede tener muchos layouts hijos. |

### 3.3 Relaciones N:M
| Relación | Tabla de asociación | Justificación |
|---|---|---|
| Strategy ↔ RegexCatalog | StrategyRegex | Reutilización total: el mismo patrón de regex de monto se usa en decenas de estrategias de ambas aseguradoras auditadas; una estrategia con regex alternativos (`POR_REGEX_MULTIPLE`) necesita más de un regex. |
| Strategy ↔ ValidationCatalog | StrategyValidation | Igual razón — un validador de "monto decimal estricto" se reutiliza en Gastos de Expedición, Subtotal, Prima Total, IVA (demostrado en la auditoría Qualitas). |
| Strategy ↔ NormalizationCatalog | StrategyNormalization | Una estrategia puede encadenar varias normalizaciones (uppercase → limpiar caracteres → title case); cada normalización se reutiliza ampliamente. |
| Strategy ↔ ExclusionCatalog | StrategyExclusion | El mismo catálogo `Exclusion_Estados_MX` se usa tanto para excluir en Municipio como para validar contexto en Colonia (dos estrategias distintas, mismo catálogo). |
| Field ↔ PresentationProfile | FieldPresentation | Un campo puede aparecer en más de un perfil de salida (ej. un perfil "interno" con más detalle y uno "cliente final" resumido); un perfil cubre muchos campos. |
| Section ↔ (Alias/Regex) para ancla de fin | SectionEndAnchor | Ya justificado en §2.16 — múltiples anclas de cierre alternativas por sección. |

**Por qué N:M y no 1:N en los catálogos transversales**: es la traducción directa del principio de "componentes reutilizables" (arquitectura §6) y de la decisión de Aggregates independientes (dominio §4). Si fuera 1:N (un regex pertenece a una sola estrategia), se perdería exactamente la reutilización que motiva tener catálogos globales en primer lugar — se volvería a duplicar el mismo patrón de monto una vez por campo, el problema original que esta migración busca eliminar.

---

## 4. Almacenamiento correcto de casos especiales

### 4.1 `StrategyParameters` polimórficos
**Alternativa elegida: Table per Type** (una tabla satélite distinta por cada `StrategyType`, en relación 1:1 con `Strategy`). Ejemplos de tablas satélite:
- **StrategyParametersOffsetLine**: offset (entero), lista de offsets alternativos si aplica, unidad (siempre "línea").
- **StrategyParametersWindow**: inicio de ventana, tamaño de ventana, criterio de selección (primero/último match).
- **StrategyParametersGeometric**: tolerancia_x, tolerancia_fila, distancia_y_máxima, permite_misma_fila (booleano), permite_columna_abajo (booleano), coincidencia_exacta (booleano).
- **StrategyParametersMultiline**: tolerancia_x, distancia_y_máxima, máximo_de_líneas, salto_máximo_entre_líneas.
- **StrategyParametersRelativeField**: referencia al Field de referencia, tipo de relación, offset relativo.
- **StrategyParametersTable**: patrón de encabezado de columna esperado, offset de fila de valor.
- **StrategyParametersFrequency**: referencias a las fuentes a combinar (puede resolverse como N:M adicional si las fuentes son en sí otras Strategy), criterio de desempate secundario.
- **StrategyParametersAIAssisted**: referencia a plantilla de prompt, ámbito de texto a enviar (referencia a Section o "documento completo").

Cada `Strategy` se vincula, a través de su `StrategyType`, a exactamente una de estas tablas satélite (la relación se resuelve por convención: el `StrategyType` sabe qué tabla de parámetros le corresponde — metadato ya previsto en §2.9). Esto evita tanto una tabla ancha con decenas de columnas nulas como una tabla EAV difícil de validar (ver §5 para la comparación completa de alternativas).

### 4.2 Catálogos reutilizables (Regex/Validation/Normalization/Exclusion)
Ya resuelto en §2.10-2.14: tablas de catálogo independientes, con propietario **opcional** (nulo = global, no nulo = específico de una Company), y asociadas a `Strategy` mediante tablas N:M (§2.16). Esto permite que un mismo regex sea usado por Qualitas y GNP simultáneamente sin duplicar la fila, y que una aseguradora nueva pueda tanto reutilizar catálogos existentes como declarar los suyos propios sin afectar a las demás.

### 4.3 Configuraciones compartidas (más allá de catálogos)
El caso ya cubierto por catálogos con propietario opcional se extiende igual a `ValueCatalog` (ej. una taxonomía de tipos de vehículo que dos aseguradoras terminan compartiendo si de hecho usan la misma). La regla general: **toda tabla de catálogo transversal lleva una columna de propietario opcional**, nunca una tabla separada "por aseguradora" — así, compartir es simplemente dejar el propietario en nulo o hacer que dos `Strategy` de Companies distintas referencien la misma fila de catálogo.

### 4.4 `PresentationProfile`
Ya resuelto en §2.18: cabecera + detalle N:M explícito hacia `Field`, desacoplado deliberadamente de la extracción en sí — cambiar cómo se presenta un campo (nombre visible, prefijo `$`) nunca debe requerir tocar `Strategy` ni ninguna tabla de extracción.

### 4.5 Herencia de Layouts
Se resuelve con **autorreferencia simple** en la tabla `Layout` (una columna de referencia opcional al propio `Layout` como padre), no con una jerarquía de tablas separada por nivel de herencia. La resolución de "qué hereda de qué" es responsabilidad del servicio de dominio `LayoutDefinition.resolveInherited()` (ya descrito en el documento de dominio), no de la base de datos — el motor, al cargar un Layout, sigue la cadena de padres y va completando lo que el Layout hijo no sobreescribe explícitamente. La base de datos solo necesita garantizar que la cadena de herencia es acíclica (regla de integridad, §2.3) y opcionalmente registrar, por cada `Section`/`Field` de un Layout hijo, si es una definición propia o una herencia explícita marcada como "override" de la del padre (atributo adicional recomendado: `es_override` booleano en `Section`/`Field`, para que el motor sepa si debe combinar o reemplazar).

### 4.6 `FieldDependency`
Ya resuelto en §2.7: tabla propia con dos FK hacia `Field` (roles distintos: dependiente/requerido), con restricción de aciclicidad. No se modela como columna dentro de `Field` (ej. "depende_de_field_id") porque un campo puede depender de **más de uno** (N:M real, no 1:N con una sola FK).

### 4.7 `ExecutionContext` (si se persiste)
**No se persiste como tal.** `ExecutionContext` es, por diseño de dominio, un contenedor de estado transitorio de una ejecución en memoria (configuración cargada, secciones resueltas, caché, logger). Persistir el contexto completo no tiene valor de negocio — lo que sí tiene valor es persistir su *resultado* (`ExtractionResult`, §4.8) y, opcionalmente, un resumen de la ejecución (ver `ExecutionLog` en §6.7).

### 4.8 `ExtractionResult` (si se persiste)
Si el negocio decide auditar resultados históricos (recomendado para depuración y para el riesgo de "versionado de configuración" del documento de arquitectura), se modela como una tabla **append-only** (`ExtractionResultLog`): un registro por cada campo resuelto en cada ejecución de un documento, con referencia a qué `Strategy` ganó, qué `Company`/`Layout` se usó, el valor crudo y normalizado, el `ConfidenceScore`, y una referencia al `ExecutionLog` (identificador de la corrida completa). Esta tabla **nunca se actualiza, solo se inserta** — es un registro histórico, no configuración editable, y por tanto no participa de las reglas de versionado de configuración (§6.5): cada fila ya es, en sí misma, una versión congelada de un resultado puntual.

---

## 5. Alternativas de modelado — análisis y justificación

| Alternativa | Descripción | Aplicabilidad a este proyecto |
|---|---|---|
| **Single Table (una tabla ancha para todo)** | Una sola tabla `Strategy` con todas las columnas posibles de todos los tipos de parámetros, la mayoría nulas según el tipo. | **Descartada.** Es exactamente el anti-patrón que el documento de dominio advirtió evitar (§9, "God Object" a nivel de columnas). Dificulta las restricciones de integridad (no se puede exigir "si tipo=geométrico, tolerancia_x es obligatoria" con una restricción declarativa simple), y crece indefinidamente cada vez que se agrega un tipo de estrategia nuevo. |
| **Table per Type (una tabla por cada subtipo concreto, relacionada 1:1 con la tabla base)** | `Strategy` (tabla base delgada) + `StrategyParametersOffsetLine`, `StrategyParametersGeometric`, etc. (una tabla por tipo). | **Elegida** para `Strategy`/`StrategyParameters` y recomendada también para `NormalizationCatalog` si sus tipos desarrollan parámetros propios complejos. Permite restricciones de integridad específicas por tipo (columnas obligatorias reales, no "obligatorias solo si..."), consultas más eficientes (no se leen columnas irrelevantes), y extensión limpia (agregar un `StrategyType` nuevo es agregar una tabla nueva, no alterar una existente). |
| **Table per Concrete Type (aplanar toda la jerarquía en tablas totalmente independientes, sin tabla base común)** | En vez de `Strategy` + satélites, tener `OffsetStrategy`, `GeometricStrategy`, etc. como tablas completamente independientes, cada una con su propia identidad, prioridad, Field, etc. | **Descartada.** Duplicaría columnas comunes (Field, prioridad, referencias a Regex/Validation/Normalization) en cada tabla, y las consultas que necesitan "todas las estrategias de un campo, sin importar el tipo" (la consulta más frecuente del motor) requerirían una unión de N tablas distintas en vez de una sola tabla base — exactamente lo que Table per Type evita al mantener `Strategy` como ancla común. |
| **JSON Columns (una columna de tipo texto/JSON dentro de `Strategy` que contenga los parámetros como documento libre)** | `Strategy` tendría una columna `parametros` con una estructura JSON cuya forma depende del tipo. | **Descartada como mecanismo principal**, aceptable solo como escape hatch acotado (ver nota abajo). Pierde las ventajas de un esquema relacional: no hay validación de tipos a nivel de motor de base de datos, no hay índices eficientes sobre campos internos del JSON en SQLite sin funciones adicionales, y la "casi mecánica" traducción de dominio a tablas que se pidió como objetivo se pierde — todo el polimorfismo colapsa a texto sin estructura verificable. *Nota*: SQLite sí soporta funciones JSON, por lo que esta alternativa no es descartable por incapacidad técnica, sino por diseño — se prefiere la trazabilidad y validación que da el modelo relacional explícito para un dominio que, como ya se demostró en la auditoría, tiene un catálogo cerrado y conocido de tipos de estrategia (no es un dominio de forma verdaderamente abierta que justifique un documento libre). |
| **EAV (Entity-Attribute-Value: una tabla genérica `atributo`/`valor` para cualquier configuración)** | Una tabla `StrategyAttribute` con (Strategy_id, nombre_atributo, valor_atributo) para representar cualquier parámetro sin esquema fijo. | **Descartada con firmeza.** EAV resuelve el problema de "esquema desconocido a priori", que no es el problema de este dominio — el catálogo de `StrategyType` es cerrado y ya está completamente enumerado en la auditoría y en el documento de arquitectura (§4 de ese documento). Usar EAV aquí sacrificaría toda validación de tipo, toda restricción de integridad declarativa, y el rendimiento de lectura (cada estrategia requeriría N lecturas de fila en vez de 1), sin ganar nada a cambio, porque no hay necesidad real de un esquema infinitamente abierto. EAV es la alternativa correcta cuando el conjunto de atributos es verdaderamente desconocido o cambia constantemente sin control del equipo de desarrollo — no es este caso. |

**Justificación final**: **Table per Type** para el polimorfismo de `StrategyParameters` (y análogamente para cualquier otro tipo con variantes, si aparecieran), combinado con **catálogos normalizados con relaciones N:M** para todo lo reutilizable. Es el punto de equilibrio correcto entre flexibilidad y capacidad de validar/indexar/mantener con las garantías de un modelo relacional — exactamente lo que se pidió como "casi mecánico" de traducir a SQL, sin caer en la rigidez de una tabla única ni en la anarquía de EAV/JSON libre.

---

## 6. Modelo conceptual de integridad

### 6.1 Cascadas
- **Company → Layout → Section/Field → Strategy**: se recomienda que la eliminación (soft delete) de un nivel superior **propague un estado de "inactivo" hacia abajo**, nunca un borrado físico en cascada — porque los niveles inferiores pueden estar referenciados por `ExtractionResultLog` histórico. Es decir: cascada de *desactivación*, no cascada de *borrado*.
- **Layout padre eliminado**: si un Layout que es padre de otros se desactiva, sus hijos no deben desactivarse automáticamente (sería una cascada peligrosa e inesperada) — en su lugar, deben quedar marcados con una advertencia de "padre inactivo", y su resolución de herencia debe decidir explícitamente si congelar el contenido heredado o requerir intervención manual.
- **Catálogos transversales (Regex/Validation/Normalization/Exclusion/Alias/ValueCatalog) eliminados**: **nunca cascada automática hacia `Strategy`** — un catálogo referenciado no puede eliminarse (ni soft-delete) mientras tenga referencias activas; debe forzarse a desvincular primero (regla de integridad de aplicación, reforzada por restricción de FK que impida el borrado mientras existan referencias).

### 6.2 Restricciones
- Restricciones de **unicidad condicionada** (nombre único "dentro de su propietario" para catálogos compartibles) — en SQLite esto se modela con índices únicos compuestos (propietario + nombre), permitiendo el mismo nombre bajo propietarios distintos pero no dos veces bajo el mismo propietario (o bajo "global").
- Restricciones de **exclusividad mutua** (ej. una `Section` debe tener ancla de inicio por Alias O por Regex, no ambos a la vez, si se decide que son mutuamente excluyentes) — se modelan como restricción de verificación (check) más que como estructura, o alternativamente rediseñando para que "ancla" sea siempre una referencia a un concepto unificado (ver nota de simplificación abajo).
- Restricciones de **rango** en catálogos de parámetros (ej. `Priority` debe ser positivo; `Tolerance` no debe ser negativa) — se modelan como restricciones de verificación a nivel de columna.

**Nota de simplificación recomendada**: en vez de que cada ancla (inicio de sección, fin de sección, condición de clasificación, condición de detección de layout) tenga su propio par de columnas "Alias opcional / Regex opcional", conviene introducir un concepto unificado de **Anchor** (ancla) como entidad propia, que internamente sea "un Alias o un Regex" (polimorfismo resuelto igual que en §4.1, Table per Type: `Anchor` base + `AnchorAlias`/`AnchorRegex` satélite). Esto evita repetir el mismo par de columnas opcionales en 4-5 tablas distintas del modelo (Section inicio, Section fin, ClassificationRule, LayoutDetectionRule) y centraliza la regla de exclusividad en un solo lugar.

### 6.3 Validaciones
Distinguir dos niveles, ninguno sustituto del otro:
- **Validaciones estructurales de base de datos** (tipos de dato, FK, unicidad, restricciones de verificación) — protegen la integridad mínima, siempre activas.
- **Validaciones de configuración de negocio** (¿todo `Field` tiene al menos una `Strategy`? ¿la cadena de herencia de Layouts es acíclica? ¿las prioridades de un Field no tienen huecos raros?) — no son expresables completamente como restricciones declarativas simples de SQLite; requieren una capa de validación en el momento de guardar configuración (ya prevista como necesidad en el documento de arquitectura, §12, mitigación de "mantenibilidad de datos vs. código"). Esta capa vive en la aplicación (Use Cases del dominio), no en la base de datos, pero **el modelo de tablas debe estar diseñado para que esas validaciones sean posibles de ejecutar con consultas simples** (de ahí la importancia de los índices por Field/Layout ya recomendados).

### 6.4 Consistencia
- La consistencia transaccional se garantiza a nivel de Aggregate (§4 del documento de dominio): toda escritura que afecte a un `InsuranceCompanyAggregate` completo (ej. dar de alta un Layout nuevo con sus Sections/Fields/Strategies) debe ejecutarse como una unidad atómica — SQLite soporta transacciones nativas, por lo que esto es directamente viable sin mecanismos adicionales.
- La consistencia **entre** Aggregates (ej. una `Strategy` que referencia un `RegexCatalog`) se garantiza por integridad referencial (FK) más las reglas de "no eliminar si está referenciado" ya descritas — nunca por transacciones que abarquen ambos Aggregates a la vez (eso violaría el límite de consistencia que un Aggregate está diseñado para proteger).

### 6.5 Versionado de configuración
Este es el punto de mayor complejidad de todo el modelo, y merece una decisión explícita: **¿qué pasa con `ExtractionResultLog` histórico cuando la configuración que lo produjo cambia después?**

Se proponen dos mecanismos complementarios, no mutuamente excluyentes:
1. **Versionado por "vigencia temporal"** en las tablas de configuración que se marcaron como "Versionado: sí" (Layout, Section, Field, Strategy, catálogos): en vez de editar una fila en el sitio, un cambio crea una nueva versión con fecha de inicio de vigencia, y la versión anterior queda cerrada con fecha de fin de vigencia. `ExtractionResultLog` referencia la versión específica vigente en el momento de la ejecución, no la fila "actual". Esto es más costoso de mantener pero da trazabilidad perfecta.
2. **Versionado simplificado por "snapshot de ejecución"** (alternativa más ligera, recomendada para una primera versión del sistema): en vez de versionar cada tabla de configuración individualmente, `ExtractionResultLog` guarda una copia desnormalizada mínima de "qué configuración efectivamente se usó" (ej. una referencia a un identificador de "snapshot de configuración" congelado en el momento de la ejecución, o simplemente los identificadores + un sello de tiempo, asumiendo que en la práctica la configuración no cambia con tanta frecuencia como para que la ambigüedad sea un problema real).

**Recomendación**: comenzar con el mecanismo 2 (más simple, menor costo de implementación) y migrar al mecanismo 1 solo si, en producción, se demuestra que la trazabilidad exacta por versión de configuración es realmente necesaria (evita sobre-ingeniería temprana, coherente con la crítica de "no diseñar herencia de Layouts antes de que sea necesaria" ya hecha en el documento de arquitectura).

### 6.6 Persistencia de `ExecutionContext`
Como ya se explicó (§4.7), no se persiste. Lo que sí conviene persistir es un resumen — ver §6.7.

### 6.7 `ExecutionLog` (tabla de auditoría de ejecución, nueva, no prevista como entidad de dominio pero necesaria en persistencia)
- **Propósito**: registrar cada corrida del pipeline sobre un documento: qué Company/Layout se detectó, con qué confianza, cuánto tardó, cuántos campos se resolvieron vs. cuántos cayeron a valor por defecto, qué advertencias se generaron.
- **Naturaleza**: append-only, sin versionado (cada fila es un hecho histórico inmutable), con posible política de retención/purga a futuro (fuera de alcance de este documento) si el volumen crece demasiado.
- **Relación con `ExtractionResultLog`**: 1 `ExecutionLog` → N `ExtractionResultLog` (todos los campos resueltos en esa corrida).

### 6.8 Migraciones futuras
Aunque no se diseñan aquí, el modelo ya está preparado para migraciones de bajo riesgo porque:
- Agregar un `StrategyType` nuevo es **agregar una tabla nueva** (satélite de parámetros) + una fila en el catálogo `StrategyType` — no altera ninguna tabla existente.
- Agregar una aseguradora nueva es **insertar filas**, nunca alterar esquema (ya demostrado en el documento de arquitectura §9).
- Agregar un atributo nuevo a una entidad existente (ej. un nuevo parámetro opcional de geometría) es una alteración de tabla aislada a su propia tabla satélite, sin efecto en cascada sobre `Strategy` ni sobre otras tablas satélite de otros tipos — consecuencia directa de haber elegido Table per Type en vez de Single Table.

---

## 7. Roadmap — qué documento debe seguir

1. **Este documento (Modelo lógico de persistencia)** — completado aquí.
2. **Siguiente**: Diseño físico de tablas SQLite — ahora sí con nombres de tabla definitivos, tipos de columna concretos (INTEGER/TEXT/REAL/BOOLEAN vía convención SQLite), definición exacta de cada restricción `CHECK`, `UNIQUE`, `FOREIGN KEY`, e índices con su sintaxis real. Este paso es, gracias a los §2-§6 de este documento, mecánico: cada tabla lógica descrita aquí se traduce 1:1 (o 1:2 en los casos de cabecera/detalle) a una definición `CREATE TABLE`.
3. **Después**: Script de *seed* de datos — carga inicial del catálogo `StrategyType` (cerrado, conocido de antemano) y de los catálogos transversales ya identificados en la auditoría (Regex de monto/RFC/CP/placa/fecha, Validaciones, Normalizaciones, Exclusiones como `Exclusion_Estados_MX`, `Exclusion_Codigos_Motor`), como datos base reutilizables por cualquier aseguradora.
4. **Después**: Migración de configuración real de Qualitas y GNP — traducir las fichas del [Modelo Declarativo](../03_Modelo_Declarativo/01_MODELO_DECLARATIVO_QUALITAS.md) y las auditorías de GNP a filas concretas de `Company`, `Layout`, `Section`, `Field`, `Strategy` y sus parámetros — este es el primer punto en que "los datos de negocio reales" entran al sistema.
5. **En paralelo o después**: Diseño del intérprete (los Servicios de dominio del documento DDD — `ExtractionPipeline`, `FieldResolver`, `StrategyExecutor`, etc.) como componentes de aplicación concretos, con sus adaptadores de repositorio contra el esquema ya definido — aquí es donde el dominio se conecta con la infraestructura real (SQLite + PyMuPDF + FastAPI), fuera del alcance de los documentos puramente conceptuales producidos hasta ahora.
6. **Finalmente**: Plan de migración operativa — cómo convivirán temporalmente `poliza_qualitas.py`/`poliza_gnp.py` con el motor nuevo durante la transición (ej. ejecutar ambos en paralelo y comparar resultados antes de apagar el código legado), y criterios de aceptación para retirar los archivos originales con confianza.
