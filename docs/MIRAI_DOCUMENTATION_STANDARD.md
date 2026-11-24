# Estándar de documentación

## 1. Propósito

Este documento establece cómo se redacta, organiza, verifica y mantiene la documentación de Mirai.

La documentación debe representar con precisión el producto y el sistema tal como existen actualmente. Su función es permitir que una persona comprenda el comportamiento, las reglas y las decisiones del producto, o que pueda entender cómo está construido y cómo opera el sistema.

Se mantienen dos perspectivas complementarias:

- **Documentación de negocio:** explica qué ofrece el producto, cómo se comporta y bajo qué reglas, desde la perspectiva del usuario y del negocio.
- **Documentación técnica:** explica cómo está construido ese comportamiento, qué componentes participan y cómo se relacionan.

Ambas perspectivas describen la misma realidad desde audiencias distintas. No deben contradecirse ni duplicar contenido innecesariamente.

## 2. Principios obligatorios

### 2.1. Verdad actual

Cada documento describe exclusivamente el comportamiento y las decisiones vigentes.

- Redactar en presente.
- Documentar comportamientos implementados y reglas actualmente aplicables.
- Verificar las afirmaciones contra fuentes de verdad apropiadas.
- No presentar una intención, una suposición o un diseño propuesto como comportamiento existente.

### 2.2. Sin contenido histórico

La documentación no es una cronología del desarrollo.

- No incluir implementaciones anteriores.
- No conservar decisiones que ya no gobiernan el sistema.
- No describir migraciones como relato histórico.
- No añadir secciones de historial, versiones anteriores o componentes obsoletos.
- Cuando una decisión vigente necesite explicación, documentar su contexto actual, fundamento y consecuencias.

El historial de cambios del repositorio pertenece al control de versiones, no al contenido documental.

### 2.3. Sin contenido futuro

La documentación no es un roadmap ni una lista de trabajo.

- No incluir funcionalidades planeadas.
- No describir capacidades que todavía no existen.
- No añadir propuestas, pendientes, fases futuras ni escenarios hipotéticos como si fueran parte del producto.
- No utilizar marcadores como `TBD`, `TODO`, «por implementar» o «se añadirá próximamente».

Si un dato necesario no puede verificarse, debe investigarse antes de publicar el documento. No se rellena con especulaciones.

### 2.4. Evidencia antes que afirmaciones

Toda afirmación relevante debe tener una base verificable.

- En negocio: reglas aprobadas, comportamiento observable y decisiones vigentes del producto.
- En técnico: código, contratos, esquemas, configuración, pruebas y comportamiento operativo.
- No inventar garantías, límites, tiempos, políticas ni capacidades.
- Diferenciar claramente una regla de negocio de un detalle de implementación.

### 2.5. Una fuente de verdad por concepto

Un concepto debe explicarse en el documento que le corresponde. Los demás documentos pueden enlazarlo, pero no mantener copias divergentes.

- El documento de negocio es la referencia para el significado funcional y las reglas del producto.
- El documento técnico es la referencia para la arquitectura y la implementación.
- Si un dato cambia, se actualiza su fuente de verdad y se revisan los documentos dependientes.

### 2.6. Precisión y completitud

Un documento debe permitir entender el ámbito que cubre sin depender de conversaciones informales.

- Explicar los flujos completos, incluidos sus resultados y bifurcaciones relevantes.
- Identificar actores, responsabilidades, entradas, salidas y condiciones.
- Describir errores y recuperaciones cuando formen parte del comportamiento actual.
- Definir términos que puedan interpretarse de varias maneras.
- Evitar frases vagas como «gestiona», «procesa» o «sincroniza» sin explicar qué ocurre concretamente.

## 3. Tipos de documentación

### 3.1. Documento de negocio

**Audiencia:** producto, negocio, diseño, soporte y cualquier persona que necesite comprender el funcionamiento sin conocer la implementación.

Responde:

- ¿Qué problema o necesidad atiende?
- ¿Qué valor entrega?
- ¿Quién participa y qué responsabilidades tiene?
- ¿Cómo funciona desde la perspectiva del usuario?
- ¿Qué reglas determinan el resultado?
- ¿Qué estados y resultados puede observar el usuario?
- ¿Qué decisiones de producto gobiernan el comportamiento?

Debe incluir flujos, reglas, condiciones, resultados y decisiones de negocio. No debe incluir rutas de archivos, nombres de clases, tablas, endpoints, proveedores, infraestructura ni detalles de código.

### 3.2. Documento técnico

**Audiencia:** ingeniería, arquitectura, desarrollo, QA y operación técnica.

Responde:

- ¿Qué componentes implementan el comportamiento?
- ¿Qué responsabilidad tiene cada componente?
- ¿Cómo se comunican y en qué orden?
- ¿Qué dependencias participan?
- ¿Qué contratos, datos y estados intercambian?
- ¿Cómo se controlan seguridad, concurrencia y consistencia?
- ¿Qué sucede ante errores?
- ¿Cómo se verifica y observa el funcionamiento?

Debe describir la implementación real, sus límites y sus dependencias. No debe redefinir reglas de negocio ni sustituir la explicación funcional.

## 4. Estructura común de los documentos

Todos los documentos deben comenzar con un encabezado claro y metadatos mínimos.

| Campo | Contenido |
|---|---|
| Título | Nombre preciso del documento |
| Tipo | Negocio o técnico |
| Alcance | Qué cubre y qué queda fuera |
| Responsable | Persona responsable de su exactitud |
| Última verificación | Fecha en que se contrastó con la realidad vigente |

La fecha de verificación no es un historial de cambios. Indica cuándo se comprobó por última vez que el contenido seguía siendo correcto.

Reglas comunes:

1. Utilizar un título descriptivo y único.
2. Comenzar con un resumen breve que permita entender el propósito del documento.
3. Organizar el contenido de lo general a lo específico.
4. Usar encabezados jerárquicos sin saltar niveles.
5. Preferir tablas para comparar datos estructurados y listas para enumerar elementos.
6. Utilizar diagramas cuando aclaren relaciones, secuencias o estados.
7. Enlazar otros documentos en lugar de copiar su contenido.
8. Mantener nombres y términos consistentes en todo el repositorio.

## 5. Formato: documentación de negocio

La siguiente plantilla define la estructura de referencia. Se adaptan o eliminan secciones que no correspondan al alcance; no se rellenan apartados con contenido irrelevante.

```markdown
# [Nombre] — Documento de negocio

> **Tipo:** Negocio  
> **Alcance:** [Ámbito que cubre]  
> **Última verificación:** [AAAA-MM-DD]

## 1. Resumen

Descripción breve del propósito, funcionamiento y resultado principal.

## 2. Propósito y valor

- Necesidad que atiende.
- Valor que entrega.
- Resultado que busca producir para el usuario o el negocio.

## 3. Actores y responsabilidades

| Actor | Responsabilidad | Condiciones de participación |
|---|---|---|
| [Actor] | [Responsabilidad] | [Condición] |

## 4. Alcance funcional

- Incluye: [Comportamientos cubiertos].
- Excluye: [Límites explícitos del ámbito].

## 5. Conceptos y funcionamiento

Definición de los conceptos de negocio necesarios para comprender el comportamiento.

## 6. Flujos de negocio

### 6.1. Flujo principal

1. [Acción o condición inicial].
2. [Acción siguiente].
3. [Resultado observable].

### 6.2. Variantes y excepciones

Describir las bifurcaciones, cancelaciones, rechazos, errores y recuperaciones que existan.

## 7. Reglas de negocio

| ID | Regla | Condición | Resultado |
|---|---|---|---|
| BR-01 | [Regla precisa] | [Cuándo aplica] | [Qué determina] |

## 8. Estados y transiciones

| Estado | Significado | Cómo se alcanza | Resultado o transición |
|---|---|---|---|

## 9. Permisos y condiciones de acceso

Describir quién puede realizar cada acción y bajo qué condiciones, desde la perspectiva del producto.

## 10. Información del usuario

Describir qué información proporciona el usuario, qué información recibe y cómo se presenta o utiliza funcionalmente.

## 11. Decisiones de producto

Para cada decisión vigente:
- Decisión.
- Contexto y necesidad.
- Justificación.
- Consecuencias sobre el comportamiento.

## 12. Resultados y garantías funcionales

Precisar qué resultados puede esperar el usuario y bajo qué condiciones.

## 13. Glosario

| Término | Definición |
|---|---|
```

### Reglas específicas del documento de negocio

- Los flujos deben describir acciones y resultados comprensibles para una persona no técnica.
- Las reglas deben ser verificables y no ambiguas.
- Los estados deben tener significado funcional, no nombres internos de variables o columnas.
- Las decisiones deben explicar el criterio de producto y sus consecuencias.
- No incluir diagramas de clases, esquemas de base de datos, secuencias entre servicios ni detalles de infraestructura.

## 6. Formato: documentación técnica

La siguiente plantilla define la estructura de referencia. Se adaptan o eliminan secciones que no correspondan al alcance; no se rellenan apartados con contenido irrelevante.

```markdown
# [Nombre] — Documentación técnica

> **Tipo:** Técnico  
> **Alcance:** [Ámbito que cubre]  
> **Última verificación:** [AAAA-MM-DD]

## 1. Resumen técnico

Descripción de la responsabilidad del sistema o ámbito documentado y de su lugar en la arquitectura.

## 2. Contexto y límites

- Responsabilidad.
- Límites del sistema.
- Componentes externos e internos con los que interactúa.
- Qué responsabilidades quedan fuera de su ámbito.

## 3. Arquitectura y componentes

| Componente | Responsabilidad | Entradas | Salidas |
|---|---|---|---|

Incluir un diagrama de contexto o componentes cuando aporte claridad.

## 4. Dependencias

| Dependencia | Propósito | Forma de integración | Impacto de indisponibilidad |
|---|---|---|---|

Distinguir dependencias internas, externas, servicios administrados y bibliotecas relevantes.

## 5. Flujos técnicos

Describir la secuencia real de ejecución, identificando:
- Componente que inicia la operación.
- Llamadas y eventos intercambiados.
- Operaciones síncronas y asíncronas.
- Límites de confianza.
- Escrituras y lecturas relevantes.
- Condiciones que habilitan cada paso.
- Resultado de la operación.

## 6. Contratos e interfaces

Documentar APIs, eventos, mensajes y contratos internos relevantes:
- Identificador y propósito.
- Emisor y receptor.
- Entradas y validaciones.
- Salidas.
- Errores y códigos relevantes.
- Autenticación y autorización aplicables.

## 7. Modelo de datos y propiedad

- Entidades y relaciones.
- Fuente de verdad de cada dato.
- Responsabilidad de escritura y lectura.
- Restricciones e invariantes.
- Ciclo de vida de los datos.
- Políticas de retención y eliminación aplicables.

## 8. Estados, concurrencia y consistencia

Explicar los estados técnicos, sus transiciones y las garantías de consistencia. Documentar concurrencia, idempotencia, deduplicación, orden y sincronización cuando apliquen.

## 9. Errores y recuperación

| Condición | Detección | Comportamiento | Recuperación |
|---|---|---|---|

Incluir timeouts, reintentos, límites, compensaciones y fallos parciales que existan.

## 10. Seguridad

- Autenticación.
- Autorización.
- Aislamiento y límites de confianza.
- Protección de datos.
- Gestión de secretos.
- Controles relevantes para las operaciones descritas.

## 11. Configuración

Variables, parámetros y condiciones de configuración necesarias para ejecutar el sistema. Documentar nombres y propósito, nunca valores secretos.

## 12. Rendimiento y recursos

Límites, concurrencia, cachés, conexiones, latencia y consumo de recursos cuando sean relevantes y estén verificados.

## 13. Observabilidad

Logs, métricas, trazas, identificadores de correlación y señales disponibles para diagnosticar el comportamiento.

## 14. Verificación técnica

Pruebas que cubren el comportamiento, comandos relevantes y resultados de validación comprobados. No afirmar que una prueba pasa si no se ha ejecutado.

## 15. Decisiones técnicas vigentes

Para cada decisión que gobierna la implementación:
- Decisión.
- Contexto y restricciones actuales.
- Justificación técnica.
- Consecuencias y trade-offs.

## 16. Mapa de implementación

| Responsabilidad | Ubicación en el repositorio |
|---|---|
| [Responsabilidad] | [Ruta o módulo] |

## 17. Glosario

| Término | Definición |
|---|---|
```

### Reglas específicas del documento técnico

- Describir componentes y responsabilidades reales, no la arquitectura que se desearía tener.
- Los diagramas de secuencia deben utilizar los nombres reales de los participantes y mostrar el orden efectivo de las interacciones.
- Identificar explícitamente qué operaciones son síncronas y cuáles asíncronas.
- Especificar quién es propietario de cada dato y cuál es su fuente de verdad.
- Describir los fallos parciales, no solamente el camino exitoso.
- Referenciar rutas de archivos, módulos, esquemas y pruebas cuando ayuden a localizar la implementación.
- Evitar números de línea como referencias permanentes; cambian con facilidad.
- No copiar bloques extensos de código. Documentar responsabilidades, contratos e invariantes.

## 7. Flujos y diagramas

Los diagramas complementan la explicación textual; nunca la sustituyen.

### 7.1. Flujos de negocio

Representan:
- Actores y acciones.
- Decisiones y condiciones.
- Resultados visibles.
- Variantes y excepciones.

No representan clases, servicios, tablas ni detalles de transporte.

### 7.2. Flujos técnicos

Representan:
- Componentes participantes.
- Llamadas, eventos y respuestas.
- Orden y dirección de las interacciones.
- Operaciones síncronas y asíncronas.
- Persistencia y límites transaccionales cuando correspondan.
- Errores, timeouts y rutas de recuperación.

### 7.3. Diagramas de estados

Deben mostrar:
- Estados válidos.
- Evento o condición que provoca una transición.
- Estado resultante.
- Transiciones no permitidas cuando sean relevantes.

### 7.4. Convenciones

- Utilizar Mermaid cuando el diagrama pueda mantenerse como texto en el repositorio.
- Nombrar los nodos con términos definidos en el documento.
- Etiquetar las condiciones de las bifurcaciones.
- Evitar diagramas excesivamente grandes; dividirlos por responsabilidad o nivel.
- Mantener cada diagrama sincronizado con la descripción textual.

## 8. Cómo documentar decisiones

Una decisión vigente debe poder entenderse sin consultar conversaciones externas.

Utilizar esta estructura:

| Elemento | Descripción |
|---|---|
| Decisión | Qué regla o elección gobierna actualmente |
| Contexto | Necesidad, restricciones y condiciones actuales |
| Justificación | Por qué es la opción adecuada |
| Consecuencias | Efectos, beneficios, costes y limitaciones |

Documentar el razonamiento que permite entender la solución actual. No convertir esta sección en una cronología ni en un registro de alternativas descartadas durante el desarrollo.

## 9. Referencias y trazabilidad

Las referencias deben permitir comprobar el contenido sin convertir el documento en un inventario de enlaces.

### Para negocio

Utilizar referencias a:
- Reglas y políticas de producto vigentes.
- Decisiones de producto aprobadas.
- Comportamiento observable y recorridos funcionales.
- Interfaces y textos que formen parte del comportamiento documentado.

### Para técnico

Utilizar referencias a:
- Rutas de código y módulos.
- Contratos e interfaces.
- Esquemas y restricciones de datos.
- Configuración relevante.
- Pruebas que verifican el comportamiento descrito.
- Documentación oficial de dependencias externas cuando sea necesaria.

Preferir enlaces relativos dentro del repositorio. Cada referencia debe respaldar una afirmación concreta y mantenerse válida.

## 10. Estilo de redacción y Markdown

- Escribir en español claro, preciso y profesional. SIEMPRE EN MARKDOWN
- Utilizar presente y voz activa.
- Preferir frases directas y párrafos breves.
- Definir siglas en su primera aparición.
- Mantener un único término para cada concepto.
- Utilizar listas para enumeraciones y tablas para relaciones estructuradas.
- Usar bloques de código únicamente para contratos, comandos o ejemplos técnicos necesarios.
- No usar capturas de pantalla como sustituto de una explicación.
- No introducir adornos, slogans ni lenguaje promocional en documentación técnica.
- Evitar explicaciones introductorias que no aporten información al ámbito documentado.

## 11. Proceso de elaboración y mantenimiento

1. **Delimitar:** definir el alcance y la audiencia del documento.
2. **Investigar:** contrastar la realidad con las fuentes de verdad correspondientes.
3. **Separar perspectivas:** decidir qué corresponde a negocio y qué corresponde a técnico.
4. **Modelar:** identificar actores, reglas, componentes, contratos, estados y flujos relevantes.
5. **Redactar:** utilizar la plantilla correspondiente y mantener una estructura coherente.
6. **Verificar:** comprobar cada afirmación contra el producto, el código, las pruebas o las decisiones vigentes, según corresponda.
7. **Revisar consistencia:** comprobar que los documentos relacionados no se contradicen ni duplican contenido.
8. **Publicar:** actualizar la fecha de verificación y guardar el documento en la ubicación correspondiente.
9. **Mantener:** cuando cambie el comportamiento o la implementación, actualizar la documentación afectada en el mismo contexto de trabajo.

## 12. Criterios de aceptación documental

Un documento está listo cuando cumple todos estos puntos:

- [ ] Tiene un propósito, alcance y audiencia claros.
- [ ] Describe exclusivamente la realidad vigente.
- [ ] Todas las afirmaciones relevantes están verificadas.
- [ ] Los flujos principales y las variantes relevantes están completos.
- [ ] Las reglas y decisiones son explícitas y comprensibles.
- [ ] Distingue correctamente la perspectiva de negocio de la técnica.
- [ ] No duplica contenido que pertenece a otra fuente de verdad.
- [ ] Los diagramas coinciden con la explicación textual.
- [ ] Las referencias apuntan a fuentes válidas y relevantes.
- [ ] No contiene contenido histórico, obsoleto, hipotético o futuro.
- [ ] No contiene marcadores, pendientes ni afirmaciones sin verificar.
- [ ] La fecha de última verificación corresponde a una revisión real.

---

**Regla final:** la documentación debe permitir comprender la realidad vigente sin reconstruir conversaciones, interpretar intenciones ni deducir cómo funciona el sistema a partir de información incompleta.
