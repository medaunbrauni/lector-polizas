# Dominio interno del motor de extracción (DDD)

Continuación de [Arquitectura del Motor Configurable](../01_Arquitectura/01_ARQUITECTURA_MOTOR_CONFIGURABLE.md). Sin persistencia, sin SQL, sin Python, sin UML. Puente entre la arquitectura y el futuro esquema de datos. Nomenclatura en inglés (convención DDD estándar), descripciones en español.

---

## 0. Bounded Context

Un único Bounded Context: **Document Extraction**. Todo lo que sigue vive dentro de él. No se modela un contexto separado para "clasificación de aseguradora" ni para "presentación de salida" — son subdominios dentro del mismo contexto, porque comparten el mismo lenguaje ubicuo (Campo, Sección, Layout, Estrategia) y las mismas entidades raíz. Separarlos en contextos distintos introduciría traducción entre modelos sin beneficio real a este tamaño de problema.

**Lenguaje ubicuo (glosario mínimo)**: *Company* (aseguradora), *Layout* (plantilla/versión de documento), *Section* (región del documento), *Field* (dato de negocio a extraer), *Strategy* (método de localización de un Field), *Rule* (condición evaluable, usada en clasificación/detección), *Catalog* (colección reutilizable de Regex/Validation/Normalization/Exclusion).

---

## 1. Entidades — inventario completo

### `InsuranceCompany`
- **Responsabilidad**: representar una aseguradora como raíz de configuración; agrupa sus Layouts y su regla de clasificación.
- **Contiene**: identidad, nombre, `ClassificationRule` (referencia/composición).
- **Operaciones**: `matches(documentText) → ConfidenceScore` (delega en `ClassificationRule`); `layouts() → List<LayoutDefinition>`.
- **Conoce**: `LayoutDefinition` (los suyos), `ClassificationRule`.
- **No debe conocer**: `Document`, `ExecutionContext`, ni ningún detalle de cómo se ejecuta el pipeline — es configuración pura, no ejecución.
- **Dependencias**: ninguna hacia afuera del dominio.
- **Core Domain.**

### `ClassificationRule`
- **Responsabilidad**: encapsular la condición que decide si un texto pertenece a una `InsuranceCompany` dada.
- **Contiene**: catálogo de palabras/patrones requeridos, catálogo de palabras de confirmación, catálogo de exclusiones (competidores).
- **Operaciones**: `evaluate(documentText) → ConfidenceScore`.
- **Conoce**: `RegexDefinition`/`AliasDefinition` (si las condiciones se expresan con ellos), `ConfidenceScore`.
- **No debe conocer**: `InsuranceCompany` (relación unidireccional: la Company conoce su regla, la regla no necesita saber de quién es).
- **Core Domain.**

### `LayoutDefinition`
- **Responsabilidad**: representar una variante/versión de plantilla de una aseguradora (ej. "Qualitas 2022", "Qualitas Empresarial").
- **Contiene**: identidad, nombre, referencia a su `InsuranceCompany`, `LayoutDetectionRule`, colección de `SectionDefinition`, colección de `FieldDefinition`, referencia opcional a un `LayoutDefinition` padre (herencia, ver arquitectura §8 — opcional, no obligatorio en v1).
- **Operaciones**: `matches(document) → ConfidenceScore`; `sections() → List<SectionDefinition>`; `fields() → List<FieldDefinition>`; `resolveInherited() → LayoutDefinition` (si aplica herencia).
- **Conoce**: `SectionDefinition`, `FieldDefinition`, `LayoutDetectionRule`.
- **No debe conocer**: `Document`, `ExecutionContext`, ni cómo se ejecuta ninguna estrategia — solo declara qué existe, no cómo se corre.
- **Core Domain.**

### `LayoutDetectionRule`
- **Responsabilidad**: condición que distingue un Layout de otro dentro de la misma Company.
- **Contiene**: catálogo de huellas textuales/estructurales requeridas o ausentes.
- **Operaciones**: `evaluate(document) → ConfidenceScore`.
- **Core Domain.**

### `SectionDefinition`
- **Responsabilidad**: describir una región lógica del documento (ancla de inicio, ancla(s) de fin, o margen de seguridad si no hay ancla de fin).
- **Contiene**: identidad, nombre lógico ("Información del Asegurado"), `AliasDefinition` para el inicio, `AliasDefinition`(s) para el fin, margen de seguridad por defecto (`Offset` o `Distance`).
- **Operaciones**: ninguna de ejecución (es declarativa) — la resolución real la hace el servicio `SectionLocator` sobre un `Document`.
- **Conoce**: `AliasDefinition`, `Offset`/`Distance`.
- **No debe conocer**: el `Document` concreto ni el resultado de su propia localización — eso vive en `ResolvedSection` (ver Value Objects), no en la definición.
- **Core Domain.**

### `FieldDefinition`
- **Responsabilidad**: describir un dato de negocio a extraer — su identidad conceptual, no su valor.
- **Contiene**: identidad, nombre lógico ("Prima Total"), tipo de dato esperado (monto, fecha, texto, catálogo cerrado...), referencia opcional a `SectionDefinition` (ámbito por defecto), colección ordenada de `StrategyDefinition` (por prioridad), colección de `FieldDependency`, valor por defecto declarado.
- **Operaciones**: `strategiesInOrder() → List<StrategyDefinition>`; `dependsOn() → List<FieldDependency>`.
- **Conoce**: `StrategyDefinition`, `SectionDefinition`, `FieldDependency`.
- **No debe conocer**: `ExtractionResult`, `ExecutionContext`, ni ningún dato de una ejecución concreta — es catálogo, no instancia.
- **Core Domain.**

### `FieldDependency`
- **Responsabilidad**: representar que un `FieldDefinition` necesita el resultado de otro ya resuelto para ejecutar alguna de sus estrategias (típicamente `RELATIVO_A_OTRO_CAMPO`).
- **Contiene**: referencia al Field dependiente, referencia al Field requerido, tipo de relación (ancla de offset, filtro de exclusión, delimitador de ventana).
- **Operaciones**: ninguna propia — es consumida por el servicio `DependencyResolver`.
- **Core Domain.**

### `StrategyDefinition`
- **Responsabilidad**: describir un método concreto de localización para un campo, con sus parámetros, en una posición de prioridad.
- **Contiene**: identidad, referencia al `StrategyType` (del catálogo cerrado, ver Aggregates), `Priority`, bolsa de parámetros propia del tipo (offset/ventana/tolerancias/ancla de sección/campo de referencia — la forma varía por tipo, ver nota en §5 del documento de arquitectura), referencias a `RegexDefinition`(s), `ValidationDefinition`(s), `NormalizationDefinition`(s) (en orden), `ExclusionDefinition`(s).
- **Operaciones**: ninguna de ejecución propia (declarativa) — el servicio `StrategyExecutor` interpreta esta definición contra un `ExecutionContext`.
- **Conoce**: `RegexDefinition`, `ValidationDefinition`, `NormalizationDefinition`, `ExclusionDefinition`, `Priority`.
- **No debe conocer**: cómo se ejecuta ni contra qué documento — solo qué se necesita para ejecutarla.
- **Core Domain.**

### `RegexDefinition`
- **Responsabilidad**: nombrar y versionar un patrón reutilizable (ej. `Regex_Monto_Decimal_Estricto`).
- **Contiene**: identidad, nombre lógico, patrón, descripción de qué representa (para trazabilidad humana).
- **Core Domain — pero transversal** (no pertenece a ninguna Company; vive en el catálogo global, ver Aggregates).

### `AliasDefinition`
- **Responsabilidad**: agrupar variantes textuales equivalentes de una misma ancla (ej. "INFORMACION DEL ASEGURADO" / "INFORMACIÓN DEL ASEGURADO").
- **Contiene**: identidad, lista de variantes textuales, si la coincidencia es exacta o por contención, si es sensible a mayúsculas/acentos.
- **Operaciones**: `matchesAny(text) → boolean`.
- **Core Domain.**

### `ValidationDefinition`
- **Responsabilidad**: describir una regla de validez de formato (ej. `Validacion_RFC`).
- **Contiene**: identidad, nombre, tipo de validador (referencia al catálogo cerrado de validadores del dominio: RFC, VIN, CP, Placa, Monto, PerteneceACatalogo), parámetros propios (ej. referencia al catálogo de valores si es "pertenece a catálogo").
- **Core Domain — transversal.**

### `NormalizationDefinition`
- **Responsabilidad**: describir una transformación determinista sobre un valor (ej. `Formateo_Title_Case`).
- **Contiene**: identidad, tipo de normalizador (catálogo cerrado), parámetros propios, orden relativo si se compone con otras.
- **Core Domain — transversal.**

### `ExclusionDefinition`
- **Responsabilidad**: describir un catálogo de valores/patrones que invalidan un candidato (ej. `Exclusion_Codigos_Motor`).
- **Contiene**: identidad, nombre, colección de literales o patrones a excluir.
- **Core Domain — transversal (algunas específicas de Company, ver §7 de arquitectura).**

### `ValueCatalog`
- **Responsabilidad**: representar una lista blanca de valores válidos para un campo (ej. `Catalogo_Formas_Pago`, taxonomía de tipos de vehículo).
- **Contiene**: identidad, nombre, colección de valores permitidos, propietario opcional (`InsuranceCompany` si es específico, nulo si es global).
- **Core Domain.**

### `Document`
- **Responsabilidad**: representar la entrada cruda ya leída (texto + estructura), agnóstica de aseguradora.
- **Contiene**: identidad de la instancia de procesamiento, texto plano por página, estructura de bloques/líneas/spans con sus `BBox`, número total de páginas.
- **Operaciones**: `textOf(pageIndex)`, `spansOf(pageIndex)` — accesores de solo lectura sobre lo ya leído. No relee el PDF ni conoce PyMuPDF.
- **Conoce**: nada del dominio de aseguradoras — es la frontera entre infraestructura de lectura y el dominio.
- **No debe conocer**: `InsuranceCompany`, `LayoutDefinition`, `FieldDefinition`.
- **Es una entidad de dominio "pobre" a propósito**: representa datos ya extraídos del archivo, no el archivo en sí (la lectura del PDF es Infrastructure — ver Servicios).
- **Core Domain (como estructura de datos de entrada), construida por Infrastructure.**

### `ResolvedSection`
- **Responsabilidad**: representar el resultado concreto de localizar una `SectionDefinition` dentro de un `Document` específico.
- **Contiene**: referencia a la `SectionDefinition` de origen, rango resuelto (`LineRange` o `PageRegion`), si fue encontrada o se usó el margen de seguridad.
- **Es una instancia de ejecución, no configuración** — vive dentro del `ExecutionContext`, no en el catálogo.
- **Core Domain.**

### `ExecutionContext`
- Ver desarrollo completo en §6.

### `ExtractionResult`
- Ver desarrollo completo en §7.

### `PresentationProfile`
- **Responsabilidad**: describir el contrato de salida (JSON) para una `InsuranceCompany`/`LayoutDefinition` — o compartido si es genérico.
- **Contiene**: identidad, colección ordenada de `FieldPresentation` (referencia a `FieldDefinition`, nombre visible, formato adicional como prefijo/sufijo).
- **Operaciones**: `format(results: List<ExtractionResult>) → OutputDocument` (delegado realmente al servicio `PresentationEngine`, la entidad solo declara la forma).
- **Core Domain.**

### `RuleDefinition` (abstracción compartida)
- **Responsabilidad**: superclase conceptual de `ClassificationRule` y `LayoutDetectionRule` — ambas son "evaluar una condición contra un documento y producir una confianza". Se modela como concepto compartido para que el motor de evaluación de reglas sea uno solo, no dos implementaciones paralelas.
- **Core Domain.**

---

## 2. Diagrama textual (flujo de conocimiento entre entidades, no de invocación de infraestructura)

```
InsuranceCompany ─────────────┐
      │ tiene                │ referencia
      ▼                       │
ClassificationRule            │
      │ evalúa contra         │
      ▼                       │
   Document ◄──────────────────
      │
      │ [tras clasificar] resuelve
      ▼
LayoutDefinition ──────────────┐
      │ tiene                  │ tiene
      ▼                        ▼
LayoutDetectionRule      SectionDefinition ──┐
      │ evalúa contra           │ se resuelve │ dentro de
      ▼                         ▼             ▼
   Document              ResolvedSection   ExecutionContext
                                                │
LayoutDefinition                               │ acumula
      │ tiene                                  │
      ▼                                        │
FieldDefinition ◄── FieldDependency ────────────┘
      │ tiene (ordenadas por Priority)
      ▼
StrategyDefinition ──────┬── referencia ──► RegexDefinition
      │                  ├── referencia ──► ValidationDefinition
      │                  ├── referencia ──► NormalizationDefinition
      │                  └── referencia ──► ExclusionDefinition / ValueCatalog
      │
      │ [se interpreta contra ExecutionContext, produce]
      ▼
ExtractionResult ──────────────────► (se acumula en) ExecutionContext
      │
      │ [una vez todos los Field resueltos]
      ▼
PresentationProfile
      │ formatea
      ▼
Salida final (documento de resultado, agnóstico de persistencia/transporte)
```

**Lectura del diagrama**: las flechas representan *conocimiento/composición conceptual*, no llamadas de método. `Document` es el único punto donde converge tanto la configuración (`InsuranceCompany`, `LayoutDefinition`) como la evaluación real — es la frontera del dominio. Todo lo que está a la izquierda de `Document` en cada bloque es configuración pura (no cambia por ejecución); todo lo que aparece después (`ResolvedSection`, `ExtractionResult`, `ExecutionContext`) es estado de una ejecución concreta y desaparece al terminar de procesar ese documento (salvo que se decida persistir trazabilidad).

---

## 3. Value Objects

Un Value Object se justifica cuando (a) no tiene identidad propia — dos instancias con los mismos atributos son intercambiables — y (b) es inmutable.

| Value Object | Por qué es VO | Atributos conceptuales |
|---|---|---|
| **`BBox`** | Dos bbox con las mismas 4 coordenadas son el mismo bbox; no tiene ciclo de vida propio | x0, y0, x1, y1 |
| **`Coordinate`** | Un punto (x,y) no tiene identidad — es un valor | x, y |
| **`Offset`** | "8 líneas debajo" es un valor puro, comparable e inmutable | cantidad, dirección (arriba/abajo) |
| **`Window`** | Un rango de búsqueda ("ventana de 36 líneas") es un valor, no una entidad | inicio, tamaño, unidad (líneas/puntos) |
| **`Tolerance`** | Una tolerancia geométrica (`tolerancia_x=14`) es un número con semántica, sin identidad | magnitud, eje (x/y) |
| **`Distance`** | El resultado de medir separación entre dos elementos — puro valor derivado | magnitud, unidad |
| **`Priority`** | Un entero ordinal con semántica de orden — dos estrategias con prioridad 1 son "igual de prioritarias" sin ser la misma estrategia | valor ordinal |
| **`RegexPattern`** | El patrón en sí (no la entidad `RegexDefinition`, que sí tiene identidad y nombre) — el patrón crudo es un valor | expresión, flags (case-insensitive, multilinea) |
| **`Alias`** *(distinto de `AliasDefinition`)* | Una variante textual individual dentro de un `AliasDefinition` es un valor (el string y sus reglas de comparación) | texto, modo de coincidencia |
| **`ConfidenceScore`** | Un puntaje de confianza (0.0–1.0, o categórico Alta/Media/Baja) es un valor puro, sin ciclo de vida | magnitud normalizada |
| **`ValidationResult`** | El resultado de validar un candidato (válido/inválido + motivo) es un valor calculado, no una entidad persistente | booleano, motivo de rechazo (opcional) |
| **`NormalizedValue`** | El valor ya transformado, junto con qué normalización se aplicó — dos resultados normalizados idénticos son intercambiables | valor, lista de transformaciones aplicadas |
| **`PageReference`** | "Página 2, primera aparición" es un valor descriptivo de ubicación, no una entidad | índice de página, orden de aparición |
| **`FieldValue`** | El valor final resuelto de un campo, tipado (monto, fecha, texto) — inmutable una vez calculado | valor crudo, tipo de dato |
| **`LineRange`** | Rango de líneas de texto que delimita una sección — valor puro | línea inicio, línea fin |
| **`PageRegion`** | Rango geométrico `[y0,y1)` en una página — análogo geométrico de `LineRange` | página, y0, y1 |
| **`ExecutionDuration`** | Tiempo que tomó ejecutar algo — valor medido, no identidad | magnitud, unidad |
| **`Warning`** | Un mensaje de advertencia con severidad — dos warnings con el mismo texto y severidad son equivalentes | mensaje, severidad |
| **`SourceReference`** | De dónde vino un candidato (qué estrategia, qué ubicación) — valor descriptivo compuesto, no identidad propia | tipo de estrategia, ubicación (`PageReference` o `LineRange`) |

**Nota de diseño**: obsérvese que muchas entidades del catálogo (`RegexDefinition`, `ValidationDefinition`, `NormalizationDefinition`) **sí son entidades** (tienen identidad, nombre, se referencian por nombre desde múltiples `StrategyDefinition`), mientras que sus contrapartes de "instancia de uso" (`RegexPattern`, `ValidationResult`, `NormalizedValue`) son Value Objects. Esta distinción es intencional: el catálogo se referencia (identidad), el resultado de aplicarlo se calcula y se descarta (valor).

---

## 4. Aggregates

Un Aggregate agrupa entidades y value objects bajo una raíz que garantiza consistencia transaccional — cambios dentro del aggregate se hacen a través de la raíz.

| Aggregate | Raíz | Qué incluye | Invariante que protege |
|---|---|---|---|
| **`InsuranceCompanyAggregate`** | `InsuranceCompany` | `ClassificationRule`, colección de `LayoutDefinition` (cada uno con sus `SectionDefinition` y `FieldDefinition` completos, incluyendo `StrategyDefinition` anidadas) | Un Layout no puede existir sin pertenecer a una Company; los nombres de Layout deben ser únicos dentro de la misma Company; toda `FieldDependency` debe apuntar a un `FieldDefinition` que exista dentro del mismo Layout (o explícitamente declarado como compartido — ver nota abajo) |
| **`RegexCatalogAggregate`** | (raíz implícita: el catálogo global) | Colección de `RegexDefinition` | Nombres únicos dentro del catálogo; un patrón no puede eliminarse si sigue referenciado por alguna `StrategyDefinition` activa |
| **`ValidationCatalogAggregate`** | (raíz implícita) | Colección de `ValidationDefinition` | Igual que el anterior |
| **`NormalizationCatalogAggregate`** | (raíz implícita) | Colección de `NormalizationDefinition` | Igual |
| **`ExclusionCatalogAggregate`** | (raíz implícita) | Colección de `ExclusionDefinition` y `ValueCatalog` | Igual; un `ValueCatalog` con propietario (`InsuranceCompany`) debe validarse contra ese propietario si se intenta compartir |
| **`PresentationProfileAggregate`** | `PresentationProfile` | Colección de `FieldPresentation` | Cada `FieldPresentation` debe referenciar un `FieldDefinition` que exista y pertenezca a la Company/Layout de este perfil |
| **`ExecutionAggregate`** *(transitorio, no configuración — vive solo durante una corrida)* | `ExecutionContext` | `ResolvedSection`(s), `ExtractionResult`(s) acumulados | Un `ExtractionResult` no puede existir sin un `FieldDefinition` de origen resuelto contra el mismo `Document`; el contexto es el único punto de escritura de resultados durante la ejecución |

**Decisión de diseño clave**: los 4 catálogos transversales (Regex/Validation/Normalization/Exclusion) son Aggregates **independientes** de `InsuranceCompanyAggregate`, precisamente porque deben poder referenciarse desde cualquier Company sin pertenecerle — es la traducción directa del principio "componentes reutilizables" del documento de arquitectura (§6 de ese documento). Si se modelaran como parte del Aggregate de la Company, se rompería la reutilización (cada Company tendría su propia copia).

**Nota sobre `FieldDependency` cruzando Aggregates**: en la práctica, casi siempre un campo depende de otro campo del mismo Layout — por lo tanto la dependencia vive dentro del mismo `InsuranceCompanyAggregate` y no rompe el límite de consistencia. Si en el futuro se quisiera un campo compartible entre Layouts (poco probable dado lo auditado, pero no imposible), sería una violación deliberada a resolver con una relación débil (por identificador, no por composición fuerte), nunca extendiendo el Aggregate a través de Companies.

---

## 5. Servicios del dominio

Los servicios son **stateless** y operan sobre entidades/value objects sin poseerlos.

| Servicio | Responsabilidad | Entrada | Salida |
|---|---|---|---|
| **`CompanyClassifier`** | Evaluar todas las `InsuranceCompany` registradas contra un `Document` y decidir cuál aplica (incluyendo desempate si más de una matchea, ver riesgo de ambigüedad en la arquitectura §12) | `Document`, colección de `InsuranceCompany` | `InsuranceCompany` (o "no reconocida") + `ConfidenceScore` |
| **`LayoutDetector`** | Evaluar los `LayoutDefinition` de la Company ya determinada y decidir cuál aplica, cayendo al layout default si ninguno matchea con confianza suficiente | `Document`, `InsuranceCompany` | `LayoutDefinition` + `ConfidenceScore` |
| **`SectionLocator`** | Resolver cada `SectionDefinition` del Layout contra el `Document`, produciendo `ResolvedSection` (o "no disponible") | `Document`, colección de `SectionDefinition` | colección de `ResolvedSection` |
| **`DependencyResolver`** | Calcular el orden topológico de evaluación de `FieldDefinition` a partir de sus `FieldDependency` | colección de `FieldDefinition` con sus dependencias | secuencia ordenada de `FieldDefinition` |
| **`StrategyExecutor`** | Interpretar una `StrategyDefinition` contra el `ExecutionContext` actual (incluyendo resultados de campos ya resueltos si la estrategia es `RELATIVO_A_OTRO_CAMPO`) y producir 0 o más candidatos crudos | `StrategyDefinition`, `ExecutionContext` | colección de candidatos crudos (valor + `SourceReference`) |
| **`ValidationEngine`** | Aplicar una `ValidationDefinition` a un candidato crudo | candidato, `ValidationDefinition` | `ValidationResult` |
| **`NormalizationEngine`** | Aplicar, en orden, una o más `NormalizationDefinition` a un candidato ya validado | candidato validado, lista de `NormalizationDefinition` | `NormalizedValue` |
| **`FrequencyResolver`** | Cuando una estrategia o campo acumula múltiples candidatos válidos, decidir el ganador por frecuencia u otro criterio de desempate configurado | colección de candidatos válidos | un `FieldValue` ganador |
| **`FieldResolver`** *(orquestador de campo)* | Ejecutar, para un `FieldDefinition`, la cascada completa: recorrer sus `StrategyDefinition` por prioridad, invocando `StrategyExecutor` → `ValidationEngine` → `NormalizationEngine` → `FrequencyResolver`, hasta obtener un resultado o agotar estrategias | `FieldDefinition`, `ExecutionContext` | `ExtractionResult` |
| **`ExtractionPipeline`** *(orquestador general)* | Coordinar el flujo completo: clasificación → detección de layout → localización de secciones → orden de dependencias → resolución de cada campo → ensamblado | `Document`, catálogo completo de `InsuranceCompany` | colección de `ExtractionResult` (dentro del `ExecutionContext` final) |
| **`PresentationEngine`** | Aplicar un `PresentationProfile` sobre la colección de `ExtractionResult` para producir la salida final | colección de `ExtractionResult`, `PresentationProfile` | documento de salida (estructura clave-valor final) |
| **`RuleEvaluator`** *(compartido por `CompanyClassifier` y `LayoutDetector`)* | Evaluar una `RuleDefinition` (clasificación o detección de layout) contra un `Document`, produciendo `ConfidenceScore` | `RuleDefinition`, `Document` | `ConfidenceScore` |

---

## 6. Repositorios conceptuales (interfaces, sin implementación)

Cada uno es un **puerto** (en términos de Clean Architecture): el dominio declara qué necesita consultar; la infraestructura decide cómo (SQLite u otra cosa, decisión explícitamente diferida).

| Repositorio | Responsabilidad conceptual |
|---|---|
| **`InsuranceCompanyRepository`** | Obtener todas las `InsuranceCompany` registradas (para clasificación), u obtener una por identidad |
| **`LayoutRepository`** | Obtener los `LayoutDefinition` de una `InsuranceCompany` |
| **`SectionRepository`** | Obtener las `SectionDefinition` de un `LayoutDefinition` |
| **`FieldRepository`** | Obtener las `FieldDefinition` (con sus `StrategyDefinition` y `FieldDependency`) de un `LayoutDefinition` |
| **`RegexRepository`** | Obtener `RegexDefinition` por identidad/nombre, desde el catálogo global |
| **`ValidationRepository`** | Obtener `ValidationDefinition` por identidad/nombre |
| **`NormalizationRepository`** | Obtener `NormalizationDefinition` por identidad/nombre |
| **`ExclusionRepository`** | Obtener `ExclusionDefinition` y `ValueCatalog` por identidad/nombre (y filtrar por propietario si aplica) |
| **`AliasRepository`** | Obtener `AliasDefinition` por identidad/nombre (si se decide que los alias se catalogan de forma independiente en vez de vivir embebidos en `SectionDefinition`/`StrategyDefinition`) |
| **`PresentationRepository`** | Obtener el `PresentationProfile` correspondiente a una Company/Layout |
| **`ConfigurationRepository`** *(fachada opcional)* | Punto único que agrega los repositorios anteriores para cargar **toda** la configuración de `(Company, Layout)` en una sola operación — recomendado por la mitigación de rendimiento ya señalada en la arquitectura (§12: cargar una vez, mantener en memoria durante el procesamiento de un documento) |

**Nota de diseño**: no existe un `ExecutionResultRepository` en esta lista porque `ExtractionResult` es, por defecto, un objeto transitorio de la ejecución — solo si el negocio decide persistir trazabilidad histórica (mitigación de "versionado de configuración" y "auditoría" de la arquitectura §12) aparecería un repositorio de resultados, y sería explícitamente un repositorio de *auditoría*, no de configuración — otra responsabilidad, otro puerto.

---

## 7. `ExecutionContext` — diseño detallado

Objeto mutable (a diferencia de casi todo lo demás en este dominio) que vive durante el procesamiento de **un** documento y se descarta al terminar. Es el único lugar donde se permite mutación controlada, porque representa el progreso de una ejecución, no una decisión de negocio permanente.

| Elemento | Por qué pertenece al contexto |
|---|---|
| **`Document`** | Es la entrada sobre la que todo el pipeline opera; cada servicio necesita acceso de lectura a él sin que se le pase como parámetro repetido en cada llamada |
| **`InsuranceCompany` detectada** | Una vez resuelta, determina qué configuración cargar para el resto de la ejecución — debe estar disponible para todos los pasos siguientes |
| **`LayoutDefinition` detectado** | Igual razón — fija qué secciones/campos/estrategias aplican |
| **Colección de `ResolvedSection`** | Los campos necesitan consultar en qué rango buscar sin volver a ejecutar `SectionLocator` por cada campo — se resuelve una vez, se consulta muchas veces |
| **Colección de `ExtractionResult` ya resueltos** (indexados por campo) | Necesarios para las estrategias `RELATIVO_A_OTRO_CAMPO` — un campo debe poder leer el resultado de otro sin volver a ejecutarlo |
| **Configuración cargada en memoria** (todos los `FieldDefinition`, `StrategyDefinition`, catálogos referenciados para esta Company/Layout) | Evita ida y vuelta al repositorio en cada micro-decisión (mitigación de rendimiento, arquitectura §12) |
| **Caché de evaluación de reglas/regex ya aplicadas sobre el mismo texto** | Varias estrategias/campos pueden reutilizar el mismo cómputo (ej. dos campos que buscan en la misma sección) — cachear evita recalcular |
| **`Logger`/canal de trazabilidad** | El motor debe poder registrar qué estrategia ganó y por qué se descartaron otras (mitigación de "complejidad de configuración", arquitectura §12) — sin este canal, el motor sería una caja negra difícil de depurar |
| **Estadísticas de ejecución** (tiempo total, tiempo por campo, número de estrategias intentadas) | Necesarias para detectar campos lentos o layouts problemáticos, y para justificar decisiones de rendimiento a futuro |
| **Colección de `Warning`** | Señales no fatales (ej. "sección no encontrada, se usó margen de seguridad", "layout resuelto con baja confianza") que no detienen el pipeline pero deben ser visibles para quien revise el resultado |

**Lo que el `ExecutionContext` NO debe contener**: ninguna referencia a infraestructura de persistencia (no sabe qué es un repositorio SQL), ni a infraestructura de transporte (no sabe qué es un request HTTP) — es puramente un contenedor de estado de dominio durante una ejecución.

---

## 8. `ExtractionResult` — diseño detallado

Un string no basta porque, como demostró la auditoría, "cómo se obtuvo el valor" es tan importante como el valor mismo para poder depurar, auditar y mejorar el motor con el tiempo.

| Campo del objeto | Por qué es necesario |
|---|---|
| **`fieldValue`** (`FieldValue`, ya normalizado) | El dato final, tipado — el propósito primario del resultado |
| **`rawValue`** (antes de normalizar) | Permite auditar qué transformó exactamente la normalización, sin tener que re-ejecutar la extracción |
| **`field`** (referencia a `FieldDefinition`) | Sin saber a qué campo pertenece, el resultado no tiene sentido fuera de su colección |
| **`company` / `layout`** (referencias) | El mismo campo puede comportarse distinto según Company/Layout — la trazabilidad debe decir con qué configuración se obtuvo este resultado, especialmente relevante para el riesgo de "versionado de configuración" (arquitectura §12) |
| **`winningStrategy`** (referencia a `StrategyDefinition`, o a su tipo + prioridad) | Explica *cómo* se obtuvo el valor — indispensable para depurar por qué un campo devolvió algo inesperado, y para medir qué estrategias "ganan" más en la práctica (información valiosa para simplificar cascadas largas como la de Placas) |
| **`confidenceScore`** (`ConfidenceScore`) | No todas las estrategias son igualmente confiables (una coincidencia exacta de regex validado no es lo mismo que un fallback de última prioridad); permite a un consumidor decidir si necesita revisión humana |
| **`validationResult`** (`ValidationResult`) | Indica si el valor pasó su validación formal, y con qué motivo si falló pero aun así se usó (ej. un fallback que no valida estrictamente, como el último nivel de Placas en Qualitas) |
| **`normalizationsApplied`** (lista de `NormalizationDefinition` referenciadas) | Trazabilidad de qué transformaciones se aplicaron, en qué orden |
| **`sourceReference`** (`SourceReference`: página, línea o `BBox`, tipo de ancla usada) | Permite, dado un resultado, volver físicamente al lugar del documento de donde salió — esencial para que un humano verifique un resultado dudoso sin releer el PDF completo a mano |
| **`executionDuration`** (`ExecutionDuration`) | Detecta campos/estrategias lentas — insumo directo para la mitigación de rendimiento |
| **`attemptedStrategies`** (lista de estrategias probadas antes de la ganadora, con su motivo de descarte) | Es la explicación completa de la cascada de fallback ejecutada — responde exactamente a la necesidad de "explicar resultado" señalada como mitigación de complejidad en la arquitectura |
| **`warnings`** (lista de `Warning`) | Señales específicas de este campo (ej. "el candidato ganador no pasó validación estricta, se usó por ser el único disponible") |
| **`isDefaultValue`** (booleano) | Distingue explícitamente "se encontró un valor real" de "se agotaron las estrategias y se devolvió el valor por defecto" — hoy esta distinción no existe en los extractores originales (mensajes de error como string se confunden con datos) |
| **`metadata`** (bolsa abierta clave-valor para extensiones futuras no anticipadas) | Evita tener que romper el contrato del objeto cada vez que aparezca una necesidad nueva de trazabilidad; es la única concesión deliberada a la extensibilidad no tipada, y se documenta como tal |

**Por qué se diseña así**: cada atributo responde directamente a un riesgo o requisito ya identificado en los documentos previos (trazabilidad, versionado, rendimiento, distinción entre "no encontrado" y "encontrado con baja confianza"). No es un objeto sobre-diseñado por estética — es la respuesta concreta a problemas ya señalados como reales en la auditoría (ej. la inconsistencia de valores por defecto tipo `""`/`"S/N"`/`"No encontrado"` en Qualitas, que aquí se resuelve con `isDefaultValue` explícito en vez de inferir del string).

---

## 9. Análisis de principios (SOLID, Clean Architecture, DDD)

### Single Responsibility Principle
**Cumplido, con un punto de vigilancia**: cada entidad tiene una única razón de cambio (`FieldDefinition` cambia solo si cambia qué se extrae; `StrategyDefinition` cambia solo si cambia cómo se localiza). El punto de vigilancia es `ExtractionPipeline`: al ser el orquestador general, existe el riesgo de que acumule lógica de más de una etapa con el tiempo. Mitigación ya incorporada en el diseño: delega explícitamente en `CompanyClassifier`, `LayoutDetector`, `SectionLocator`, `DependencyResolver` y `FieldResolver` — su única responsabilidad real es *secuenciar*, no *ejecutar*.

### Open/Closed Principle
**Cumplido por diseño explícito**: agregar una aseguradora nueva (o un layout nuevo) no requiere modificar ninguna entidad ni servicio existente — solo se crean nuevas instancias de configuración (`InsuranceCompany`, `LayoutDefinition`, etc.). El único punto de extensión que **sí requiere tocar el dominio** es agregar un `StrategyType` genuinamente nuevo al catálogo cerrado (ver arquitectura §4) — y esto es una extensión consciente y aceptada del principio: se extiende el catálogo de tipos (cerrado pero ampliable), no se modifica el comportamiento de los tipos existentes.

### Liskov Substitution
No aplica de forma central en este dominio porque no se propuso jerarquía de herencia fuerte, salvo el caso opcional de `LayoutDefinition` heredando de otro `LayoutDefinition` (arquitectura §8, punto 3) y `RuleDefinition` como abstracción compartida de `ClassificationRule`/`LayoutDetectionRule`. Ambos casos son sustituibles sin sorpresas: cualquier lugar que espere evaluar una `RuleDefinition` puede recibir indistintamente una `ClassificationRule` o una `LayoutDetectionRule` sin romper el contrato (`evaluate(document) → ConfidenceScore`).

### Interface Segregation
**Cumplido**: los repositorios conceptuales (§6) están segregados por tipo de entidad en vez de un único repositorio monolítico "de configuración" — un servicio como `StrategyExecutor` solo depende de `RegexRepository`/`ValidationRepository`/`NormalizationRepository` según lo que su `StrategyDefinition` concreta necesite, no de una interfaz gigante con todos los métodos de configuración posibles. La única concesión deliberada es `ConfigurationRepository` como fachada *opcional* (no obligatoria) para el caso de carga masiva al inicio del procesamiento — y una fachada de agregación no viola ISP mientras los repositorios finos sigan existiendo por debajo.

### Dependency Inversion
**Cumplido por construcción**: todo el dominio (§1 a §7) no menciona SQLite, PyMuPDF, ni ningún detalle de infraestructura — los repositorios son interfaces conceptuales (puertos), y quien los implemente (adaptador SQLite, o cualquier otro almacén futuro) es una decisión de infraestructura completamente externa al dominio. `Document` es la única entidad que "nace" de infraestructura (lectura de PDF), pero se modela deliberadamente como una estructura de datos ya resuelta — el dominio la consume, no la construye.

### Clean Architecture (capas)
El dominio descrito aquí corresponde a las capas **Entities** y **Use Cases** de Clean Architecture:
- **Entities** (el núcleo más interno, sin dependencias de nada): `InsuranceCompany`, `LayoutDefinition`, `SectionDefinition`, `FieldDefinition`, `StrategyDefinition`, los catálogos transversales, y todos los Value Objects.
- **Use Cases** (orquestación de Entities para cumplir un objetivo, sin saber de infraestructura): los Servicios del dominio (§5), especialmente `ExtractionPipeline` como el caso de uso principal ("extraer los campos de un documento").
- **Interface Adapters** (fuera de este documento, pertenece a la siguiente fase): implementaciones concretas de los repositorios (§6) contra SQLite, y la traducción de `Document` desde PyMuPDF.
- **Frameworks/Drivers** (fuera de este documento): FastAPI, PyMuPDF, SQLite en sí.

Ningún elemento descrito en este documento depende de una capa más externa — la regla de dependencia de Clean Architecture (las capas internas no conocen a las externas) se cumple porque, deliberadamente, no se ha nombrado ni SQLite ni FastAPI ni PyMuPDF en ninguna definición de entidad, value object o servicio.

### DDD — separación Core Domain vs. soporte
Todas las entidades listadas en §1 se marcaron como **Core Domain** porque, en este sistema, *toda* la lógica de extracción configurable es el negocio mismo — no hay aquí un "Generic Subdomain" (como autenticación o envío de emails) que sea candidato a resolverse con una librería de terceros sin conocimiento de negocio. La única salvedad es que los catálogos transversales (Regex/Validation/Normalization/Exclusion) tienen un carácter más "utilitario" dentro del Core Domain — podrían describirse como un **Supporting Subdomain** (dan soporte al Core pero no son la diferenciación competitiva del sistema), sin dejar de ser parte del mismo Bounded Context.

### Punto de riesgo detectado (no una violación, una advertencia)
`StrategyDefinition` tiene una "bolsa de parámetros propia del tipo" que varía según el `StrategyType` (offset para unas, tolerancias geométricas para otras, referencia a campo para otras). Modelado sin cuidado, esto podría degenerar en una entidad con muchísimos atributos opcionales (anti-patrón "God Object" / violación de SRP a nivel de atributos, no de comportamiento). La forma correcta de resolverlo conceptualmente —sin aún diseñar tablas— es tratar cada combinación (`StrategyType` + su forma de parámetros) como una **variante de Value Object de parámetros**, no como campos sueltos de `StrategyDefinition`. Es decir: `StrategyDefinition` contiene un `StrategyParameters` (Value Object polimórfico conceptualmente: `OffsetParameters`, `WindowParameters`, `GeometricParameters`, `RelativeFieldParameters`, etc.), y no una fila plana con 20 columnas casi siempre vacías. Esta distinción es exactamente la que hará que el futuro paso a tablas SQL sea "casi mecánico", como pide el objetivo del documento: cada variante de `StrategyParameters` es candidata natural a su propia tabla relacionada por tipo, en vez de una tabla ancha con NULLs.

---

## 10. Resumen — de este documento al siguiente paso

Este documento entrega:
1. Un inventario cerrado de entidades (§1) con responsabilidad, conocimiento y pertenencia a Core Domain — todas lo son.
2. Un diagrama de conocimiento (§2) que separa claramente configuración (izquierda) de ejecución (derecha).
3. Un catálogo de Value Objects (§3) con su justificación de inmutabilidad/ausencia de identidad.
4. Aggregates (§4) con sus invariantes explícitas — la base directa de las futuras restricciones de integridad en SQL.
5. Servicios de dominio (§5) stateless, cada uno mapeable 1:1 a un módulo de ejecución futuro.
6. Repositorios conceptuales (§6) como puertos, sin ninguna mención a SQLite.
7. `ExecutionContext` (§7) y `ExtractionResult` (§8) diseñados objeto por objeto, con la razón de negocio detrás de cada atributo — no como structs genéricos.
8. Un análisis honesto de principios (§9), incluyendo una advertencia de diseño concreta (`StrategyParameters` polimórfico) que debe resolverse antes de pasar a tablas, para evitar heredar el mismo problema de "columnas casi siempre vacías" que un enfoque naïve produciría.

Lo que sigue, fuera de este alcance, es traducir cada Aggregate y sus entidades a un esquema de tablas — trabajo que este documento deja deliberadamente preparado para ser mecánico.
