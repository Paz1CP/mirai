# Chat y espacio conversacional — Documento de negocio

> **Tipo:** Negocio  
> **Alcance:** Conversaciones, instrucciones, historial, adjuntos, actividad del agente y control de ejecución  
> **Responsable:** Ingeniería de Mirai  
> **Última verificación:** 2026-11-24

## 1. Resumen

El espacio conversacional es la interfaz principal para comunicarse con Mirai, delegar trabajo, aportar información y observar la actividad del agente. Cada conversación reúne los mensajes del usuario, las respuestas, el progreso de las tareas y los resultados asociados.

El chat no es únicamente una interfaz de preguntas y respuestas: permite iniciar trabajo de varias etapas, incorporar instrucciones mientras se ejecuta, consultar el historial y controlar la ejecución.

## 2. Propósito y valor

- Permitir que el usuario exprese objetivos e instrucciones en lenguaje natural.
- Mantener el contexto de cada conversación.
- Permitir que el usuario aporte imágenes y documentos como contexto.
- Mostrar el progreso y las acciones relevantes del agente.
- Dar al usuario control para detener, continuar o compactar el contexto.
- Facilitar la recuperación de conversaciones y la consulta de resultados.

## 3. Actores y responsabilidades

| Actor | Responsabilidad | Condiciones de participación |
|---|---|---|
| Usuario | Escribir instrucciones, aportar adjuntos, revisar resultados y controlar la ejecución | Cuenta autenticada y espacio de trabajo disponible |
| Mirai | Interpretar cada mensaje, responder o ejecutar el trabajo delegado y comunicar sus resultados | Debe disponer del contexto y de las herramientas necesarias |
| Navegador conectado | Proporcionar el entorno web cuando el trabajo requiere navegación | La extensión y el espacio de trabajo deben estar conectados |
| Sitio externo | Recibir las acciones realizadas desde el navegador y presentar sus respuestas | Su acceso y sus propias condiciones determinan qué operaciones son posibles |

## 4. Alcance funcional

### Incluye

- Crear conversaciones al enviar el primer mensaje.
- Consultar el historial y cargar mensajes anteriores.
- Renombrar y eliminar conversaciones.
- Escribir instrucciones y continuar una tarea con mensajes adicionales.
- Adjuntar imágenes, PDF y DOCX.
- Seleccionar el modelo y el nivel de razonamiento para los siguientes mensajes.
- Visualizar respuestas, resúmenes de razonamiento, actividad de herramientas y resultados de campañas.
- Consultar el uso del contexto y solicitar compactación manual.
- Detener una ejecución y reanudar campañas detenidas.
- Recibir una notificación local cuando una respuesta finaliza, si el navegador lo permite y el usuario concede permiso.

### Fuera del alcance conversacional

- No existe un campo independiente de instrucciones persistentes por conversación: las instrucciones se expresan mediante mensajes.
- No existe una bandeja de entrada paralela para conversaciones con reclutadores.
- Los borradores de texto no enviados no forman parte del historial persistente.
- Las notificaciones de finalización no constituyen un servicio de notificaciones push del servidor.

## 5. Conceptos y funcionamiento

### 5.1. Conversación

Es el espacio persistente donde se agrupan los mensajes del usuario, las respuestas de Mirai y la actividad asociada. Una conversación nueva se crea cuando se envía el primer mensaje, no simplemente al abrir el compositor vacío.

El título inicial se obtiene del primer mensaje o del nombre del primer archivo adjunto. El usuario puede cambiarlo posteriormente.

### 5.2. Mensaje e instrucción

Cada mensaje enviado constituye una nueva entrada de contexto. Puede contener texto, archivos o ambos.

Cuando el agente está trabajando, el usuario puede enviar otra instrucción. Esta se incorpora a la cola de la conversación y se aplica en un límite seguro de la ejecución actual. No se crea una conversación distinta por cada instrucción adicional.

### 5.3. Borrador

El texto escrito pero no enviado permanece temporalmente en la interfaz. No forma parte del historial hasta que el usuario lo envía. Los archivos seleccionados tampoco se convierten en adjuntos persistentes de la conversación hasta el envío.

### 5.4. Turno y actividad

Un turno representa un ciclo de respuesta o ejecución. Puede contener varios mensajes de progreso, llamadas a herramientas y resultados antes de producir una respuesta final.

La vista de actividad agrupa el trabajo intermedio y permite consultar los detalles disponibles de las operaciones. La respuesta final se presenta separada de la actividad que la precede.

### 5.5. Selección de generación

La selección de modelo y razonamiento pertenece al espacio de trabajo, no a una configuración individual de cada conversación. Se aplica a los mensajes que se envían mientras esa selección está activa.

La selección inicial es Gemini 4 Hydrogen con razonamiento alto. También está disponible Gemini 3.8 Flash. Los niveles disponibles dependen del modelo.

## 6. Flujos de negocio

### 6.1. Crear una conversación y enviar instrucciones

1. El usuario abre el espacio conversacional.
2. Escribe una instrucción o selecciona archivos.
3. Envía el mensaje.
4. Mirai crea la conversación si todavía no existe.
5. La interfaz muestra el mensaje y el estado de ejecución.
6. Mirai responde o comienza el trabajo solicitado.
7. La respuesta y la actividad quedan asociadas a la conversación.

**Resultado:** conversación creada y primer mensaje incorporado al historial.

### 6.2. Continuar una conversación

1. El usuario abre una conversación existente.
2. Consulta el historial disponible.
3. Escribe una nueva instrucción.
4. Mirai incorpora el mensaje al mismo contexto.
5. La ejecución responde o continúa el trabajo asociado.

Si ya existe una ejecución activa, el mensaje queda encolado y se procesa cuando la ejecución alcanza un límite seguro.

### 6.3. Adjuntar información

1. El usuario selecciona o pega imágenes, PDF o DOCX.
2. La interfaz valida tipo, cantidad y tamaño.
3. El usuario puede combinar texto y archivos en un mismo envío.
4. Mirai incorpora el contenido del archivo al mensaje y conserva su referencia para la conversación.
5. Los adjuntos aparecen junto al mensaje correspondiente.

Un archivo que no supera las validaciones no se envía.

### 6.4. Consultar y administrar el historial

1. El usuario abre la lista de conversaciones.
2. Selecciona una conversación.
3. Mirai presenta los mensajes disponibles en orden cronológico.
4. Al consultar mensajes anteriores, la interfaz carga páginas adicionales.
5. El usuario puede renombrar o eliminar la conversación.

La eliminación de una conversación activa se rechaza hasta que la ejecución termine o se detenga.

### 6.5. Observar el trabajo del agente

La interfaz presenta:

- Mensajes de progreso.
- Resúmenes de razonamiento proporcionados por el modelo.
- Nombres de las herramientas utilizadas.
- Resultados de herramientas que se consideran visibles.
- Indicadores de fase y duración del turno.
- Resúmenes de campañas cuando corresponde.
- La respuesta final.

Los detalles sensibles del perfil, documentos y operaciones del navegador no se exponen como contenido bruto de actividad.

### 6.6. Detener o continuar el trabajo

- **Detener:** el usuario solicita detener la ejecución activa. Mirai cancela la generación y detiene las campañas que dependen de ella.
- **Responder una pregunta del agente:** cuando el agente pausa una tarea porque necesita información indispensable, la respuesta del usuario continúa la misma tarea.
- **Reanudar una campaña detenida:** requiere una acción explícita de reanudación.

Detener una ejecución no revierte una acción externa que el navegador ya haya entregado al sitio. Si el resultado de una acción es incierto, debe comprobarse antes de repetirla.

### 6.7. Compactar el contexto

Mirai puede compactar automáticamente el contexto cuando se aproxima a su capacidad. El usuario también puede solicitar la compactación manualmente.

La compactación conserva la información necesaria para continuar el trabajo, como instrucciones vigentes, restricciones, decisiones, acciones pendientes e identificadores de registros persistidos.

### 6.8. Notificación de finalización

Cuando un turno termina con una respuesta final, el navegador puede mostrar una notificación local. Al seleccionarla, el usuario vuelve a la conversación correspondiente.

La notificación requiere permiso del navegador y no se emite para cualquier cambio de estado: una pausa, una interrupción o un error no equivalen a una respuesta final completada.

## 7. Reglas de negocio

| ID | Regla | Condición | Resultado |
|---|---|---|---|
| BR-CHAT-01 | Creación diferida | El usuario todavía no ha enviado un mensaje | El compositor vacío no crea una conversación |
| BR-CHAT-02 | Título inicial | Se envía el primer mensaje | El título se deriva del texto o del primer adjunto |
| BR-CHAT-03 | Persistencia de instrucciones | El usuario envía un mensaje | El mensaje pasa a formar parte de la conversación |
| BR-CHAT-04 | Instrucciones durante ejecución | Existe un turno activo | El nuevo mensaje se encola y se aplica en un límite seguro |
| BR-CHAT-05 | Administración | El usuario renombra o elimina una conversación | El cambio se aplica al historial; no se permite eliminar una conversación activa |
| BR-CHAT-06 | Adjuntos | El usuario incorpora archivos admitidos | Los archivos se validan antes de procesarse |
| BR-CHAT-07 | Generación | El usuario cambia modelo o razonamiento | La selección afecta a los siguientes mensajes del espacio de trabajo |
| BR-CHAT-08 | Actividad | Mirai utiliza herramientas o produce progreso | La interfaz muestra la actividad disponible y separa la respuesta final |
| BR-CHAT-09 | Detención | El usuario solicita detener | La ejecución activa se cancela y las campañas vinculadas se detienen |
| BR-CHAT-10 | Reanudación | Una campaña está detenida manualmente | Requiere una acción explícita de reanudación |
| BR-CHAT-11 | Notificación | Un turno produce una respuesta final y existe permiso | Se muestra una notificación local del navegador |
| BR-CHAT-12 | Contexto | El contexto se aproxima a su capacidad o el usuario solicita compactar | Se conserva un resumen operativo para continuar |

## 8. Estados y transiciones

Los siguientes estados describen el comportamiento observable de una conversación. No todos son estados persistidos independientes.

| Estado | Significado | Cómo se alcanza | Resultado o transición |
|---|---|---|---|
| Nueva | El usuario todavía no ha enviado el primer mensaje | Abre el compositor vacío | El primer envío crea la conversación |
| Inactiva | No hay una ejecución activa | No existe un turno en curso o este termina | Puede recibir una nueva instrucción |
| En ejecución | Mirai está procesando un turno | Se acepta una instrucción | Puede mostrar actividad, recibir mensajes en cola o finalizar |
| En espera de información | Una tarea necesita una respuesta indispensable | El agente pausa la tarea | La respuesta del usuario continúa la misma tarea |
| Detenida | La ejecución o campaña se detuvo | El usuario detiene, se interrumpe la conexión o se detiene una tarea | Una campaña detenida manualmente requiere reanudación explícita |
| Completada | El turno produce su respuesta final | La ejecución termina con texto final | Se presenta el resultado y puede emitirse una notificación |
| Con error | La ejecución no pudo completarse normalmente | Fallo de conexión, persistencia, proveedor o recursos | Se presenta el error y se conserva el historial disponible |

### Fases visibles de un turno

- **Sesión:** preparación del contexto.
- **Espera:** espera de respuesta del proveedor.
- **Razonamiento:** actividad de razonamiento resumida.
- **Texto:** generación de contenido.
- **Herramientas:** ejecución de operaciones.

## 9. Permisos y condiciones de acceso

- El usuario debe estar autenticado para consultar y administrar sus conversaciones.
- El historial de una conversación pertenece a la cuenta que la creó.
- La navegación autónoma requiere un espacio de trabajo y un navegador conectado.
- Las notificaciones requieren permiso del navegador.
- El usuario puede detener una ejecución activa.
- La reanudación de una campaña detenida requiere una acción explícita, salvo la continuación normal de una tarea que estaba esperando la respuesta solicitada al usuario.

## 10. Información del usuario

### Mensajes

- Texto de hasta 30.000 caracteres por envío.
- Un mensaje debe contener texto, adjuntos o ambos.

### Archivos admitidos

| Tipo | Formatos | Límite por archivo |
|---|---|---:|
| Imagen | PNG, JPEG, WebP | 15 MiB |
| Documento | PDF, DOCX | 10 MiB |

Límites adicionales de selección:

- Hasta 20 archivos por mensaje.
- Máximo 10 imágenes y 10 documentos por mensaje.
- Hasta 30 MiB combinados en la selección de archivos.
- La cuenta dispone de un límite de 30 imágenes almacenadas en conversaciones.

## 11. Decisiones de producto

### Creación al primer envío

Una conversación se crea cuando existe contenido real que guardar. Esto evita llenar el historial con conversaciones vacías.

### Instrucciones como mensajes

Las instrucciones se conservan como parte del diálogo. No existe una configuración paralela de instrucciones por conversación.

### Una selección de generación para el espacio de trabajo

La selección de modelo y razonamiento se comparte entre conversaciones abiertas en el mismo espacio de trabajo. No se presenta como una preferencia persistente individual de cada chat.

### Actividad separada de respuesta

El progreso y las herramientas se muestran como actividad; el texto posterior a la última operación se presenta como respuesta. Así se distingue lo que Mirai hizo de lo que finalmente comunica.

## 12. Resultados y garantías funcionales

- Los mensajes enviados forman parte del historial de la conversación.
- El usuario puede consultar conversaciones anteriores mientras sus sesiones se encuentren retenidas.
- Los mensajes adicionales durante una ejecución se asocian a la misma conversación.
- La interfaz distingue progreso, respuesta final, pausa y error.
- El usuario dispone de un control explícito para detener el trabajo.
- Una acción externa incierta no debe presentarse como confirmada.
- Una notificación de finalización indica que existe una respuesta final del turno, no que todos los resultados externos de una tarea estén necesariamente confirmados.

## 13. Glosario

| Término | Definición |
|---|---|
| Conversación | Espacio persistente que agrupa mensajes y actividad |
| Mensaje | Entrada enviada por el usuario o respuesta de Mirai |
| Instrucción | Mensaje que expresa una petición o modifica el trabajo |
| Borrador | Texto aún no enviado |
| Turno | Ciclo de respuesta o ejecución iniciado por una instrucción |
| Actividad | Progreso, razonamiento resumido y operaciones realizadas |
| Contexto | Información disponible para el modelo durante la generación |
| Compactación | Resumen del contexto para conservar información relevante |
| Campaña | Trabajo delegado de búsqueda o postulación asociado a una conversación |

---

**Documento relacionado:** [Documentación técnica del chat](technical.md).
