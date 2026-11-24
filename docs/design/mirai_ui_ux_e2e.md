# Mirai — UI/UX E2E

> **Tipo:** Técnico  
> **Alcance:** Rutas del workspace web, estados visibles, interacciones, errores y recorridos de usuario de extremo a extremo.  
> **Responsable:** Ingeniería de producto  
> **Última verificación:** 2026-11-24

## 1. Resumen

Este documento describe la interfaz web de Mirai según su comportamiento actual. Define las áreas de navegación, los estados observables, las acciones disponibles y los recorridos que conectan onboarding, chat, navegador, campañas, postulaciones, documentos y perfil.

La interfaz web es la superficie de conversación y control de cuenta. El navegador real permanece en Chrome del usuario; la actividad del agente se muestra dentro de la transcripción del chat.

## Documentación funcional relacionada

[Campañas](../campaigns/business.md) · [Browser](../browser/business.md) · [Postulaciones y resultados](../applications/business.md)

## 2. Fuentes de verdad

| Ámbito | Fuente principal |
|---|---|
| Rutas y áreas | apps/web/src/features/sessions/workspaceRoutes.ts |
| Shell y navegación | apps/web/src/features/sessions/WorkspaceShell.tsx |
| Selección de pantalla | apps/web/src/features/sessions/WorkspaceView.tsx |
| Control de workspace y extensión | apps/web/src/features/sessions/useController.ts |
| Puente web-extensión | apps/web/src/features/sessions/extensionBridge.ts |
| Chat y envío | apps/web/src/features/chat/ChatWorkspace.tsx |
| Composer | apps/web/src/features/chat/ChatComposer.tsx |
| Transcript y actividad | apps/web/src/features/chat/ChatTranscript.tsx |
| Historial de conversaciones | apps/web/src/features/chat/ChatNavigation.tsx |
| Dashboard | apps/web/src/features/dashboard/DashboardPage.tsx |
| Postulaciones | apps/web/src/features/applications |
| Biblioteca de CV | apps/web/src/features/cvs/CvLibrary.tsx |
| Onboarding y perfil | apps/web/src/features/profiles |

Las reglas funcionales de la biblioteca pertenecen a [CV Library — Business](../03.2_cv_library_and_management_business.md); su persistencia, extracción y renderizado se documentan en [CV Library — Technical](../03.2_cv_library_and_management_technical.md). Los componentes y tokens visuales pertenecen a [Mirai Design System](mirai_design_system.md). La arquitectura del navegador pertenece a [Browser Control Architecture](../05_browser_control_architecture.md).

## 3. Arquitectura de información y rutas

| Área | Ruta | Contenido principal |
|---|---|---|
| Chat | / | Conversación nueva o bienvenida |
| Chat existente | /chat/{chatId} | Transcripción, actividad y composer |
| Dashboard | /dashboard | Resumen, campañas, actividad reciente y postulaciones |
| Applications | /applications | Explorador de postulaciones |
| Documents | /documents | Biblioteca de CV y documentos originales |
| Profile | /profile | Onboarding, perfil profesional, preferencias y ajustes |

La sidebar contiene Chat, Dashboard, Applications, Documents y Profile. También contiene el historial de chats, el menú de facturación, el selector de idioma y el cierre de sesión.

El historial permite abrir conversaciones, renombrarlas y eliminarlas mediante un menú contextual. Al eliminar la conversación activa, la navegación vuelve a Chat.

## 4. Estados globales del workspace

### 4.1. Control de sesión

| Estado | Significado visible | Interacción |
|---|---|---|
| Conectando | El controlador está comprobando la conexión | La interfaz espera el resultado |
| Activo | El backend acepta comandos para la cuenta | Chat y operaciones autorizadas quedan disponibles |
| Conexión perdida | El workspace no mantiene una conexión válida | Toast con acción Retry |
| Control en conflicto | Otra instancia conserva el control de la cuenta | Diálogo con Cancel o Transfer |
| Inactivo | El servidor libera el workspace por inactividad | Una interacción del usuario inicia una nueva conexión |
| Autenticación requerida | El token no permite continuar | La aplicación redirige a /auth/sign-in |

El diálogo de transferencia se muestra en las áreas que admiten control de escritura. Dashboard y Applications son áreas de solo lectura para este diálogo. La transferencia utiliza el identificador de instancia que comunica el backend.

### 4.2. Conexión de la extensión

| Estado | Significado | Respuesta de interfaz |
|---|---|---|
| checking | La aplicación detecta o restablece el puente | No muestra un error permanente |
| connected | En la ruta principal, el WebSocket autenticado de la extensión recibe control.ready. En la ruta de compatibilidad web, el estado requiere extension.initialized y una prueba extension.workspaceTabs | El chat puede solicitar herramientas de navegador; el primer comando inicializa el relay de Chrome |
| unavailable | La detección del puente web agota el tiempo o se desconecta. En la ruta principal, una pérdida del WebSocket se presenta como error del workspace y el estado vuelve a checking | Aviso en el chat con Retry cuando el estado es unavailable |
| incompatible | En la ruta de compatibilidad web, la extensión responde al handshake, pero no admite la prueba extension.workspaceTabs | Aviso en el chat con Retry |

El aviso de extensión aparece en el área Chat cuando el workspace está activo y el estado es unavailable o incompatible. El reintento vuelve a ejecutar la detección del puente. En la ruta principal, connected describe la conexión de workspace autenticada; no representa una comprobación anticipada de que una pestaña Chrome ya esté adjunta.

## 5. Chat

### 5.1. Estado vacío

Cuando no hay conversación ni eventos visibles, el chat muestra:

- Mensaje de bienvenida.
- Sugerencias de inicio que rellenan el composer.
- Composer disponible para escribir o adjuntar archivos.

El primer mensaje crea una conversación y la aplicación navega a /chat/{chatId} después de la aceptación del envío.

### 5.2. Composer

El composer contiene un editor contenteditable que convierte Markdown y permite:

- Escribir texto con formato Markdown.
- Enviar con Enter.
- Insertar una nueva línea con Shift+Enter.
- Adjuntar imágenes PNG, JPEG o WebP.
- Adjuntar documentos PDF o DOCX.
- Pegar texto o imágenes desde el portapapeles.
- Retirar archivos de la bandeja de adjuntos antes del envío.
- Seleccionar el modelo y el nivel de esfuerzo de generación.
- Consultar el uso y la capacidad de contexto.
- Compactar el contexto en conversaciones existentes.
- Activar o retirar el permiso de comunicación.

Los límites de tamaño, cantidad y almacenamiento se validan con los contratos compartidos. Los errores de selección o almacenamiento se muestran junto al composer o mediante una notificación.

### 5.3. Permiso de comunicación

El control Communication refleja el permiso guardado en las preferencias del perfil.

- Si el permiso está desactivado, el control abre un diálogo que explica el alcance y solicita confirmación.
- Si está activado, el control permite retirarlo.
- Durante el guardado, el control queda deshabilitado y muestra el estado de operación.
- Un error de persistencia se muestra como alerta.

### 5.4. Modelo y esfuerzo

El selector muestra el modelo activo y el esfuerzo configurado. Los modelos visibles en el código del composer son Gemini 4 Hydrogen y Gemini 3.8 Flash. El nivel de esfuerzo se selecciona con un slider cuyos valores válidos proceden de los contratos compartidos.

### 5.5. Envío y ejecución

| Estado | Comportamiento |
|---|---|
| Draft | El usuario edita el texto y los adjuntos |
| Sending | El mensaje aparece como pendiente y el composer bloquea operaciones incompatibles |
| Working | El transcript muestra la actividad del turno y el composer permite añadir instrucciones |
| Completed | La respuesta final aparece después de la actividad |
| Stopped | El turno se detiene; una campaña detenida ofrece Resume |
| Error | El mensaje de error aparece sobre el composer y el borrador/adjuntos se restauran cuando el envío no se confirma |

Mientras el agente trabaja:

- El botón principal cambia a Stop.
- Si el usuario escribe texto o añade archivos, aparece Add instruction para enviar una instrucción adicional.
- La actividad del turno muestra la fase y el tiempo transcurrido.
- El usuario puede expandir o contraer la actividad.

El menú de contexto permite compactar el historial cuando existe una conversación. La acción Resume aparece cuando la campaña asociada tiene estado stopped y el agente no está trabajando.

### 5.6. Transcripción y actividad

La transcripción agrupa mensajes por turno y separa la actividad del agente de la respuesta final.

Los elementos visibles son:

- Mensajes del usuario y sus adjuntos.
- Texto y Markdown del agente.
- Actividad de razonamiento y tiempo del turno.
- Tarjetas de llamadas a herramientas.
- Argumentos y resultados de herramientas de dominio cuando el evento los incluye. Las herramientas browser_*, openBrowser y prepareAttachment no exponen argumentos ni resultados en la transcripción.
- Tarjeta CampaignSummary cuando existe una campaña.
- Indicador de envío pendiente.
- Carga progresiva del historial anterior.

Las llamadas browser_* usan un icono de navegador en la actividad y muestran el nombre localizado de la herramienta. chatEvents.visibleToolData omite sus argumentos y resultados; las capturas de pantalla que recibe el modelo tampoco se muestran como imagen en la transcripción.

El transcript virtualiza los turnos visibles y mantiene la posición de lectura al cargar mensajes anteriores.

### 5.7. Historial

La lista de conversaciones aparece en la sidebar cuando existen chats. Cada elemento permite:

- Abrir la conversación.
- Precargar el historial al pasar el puntero o recibir foco.
- Renombrar desde un diálogo.
- Eliminar desde un diálogo de confirmación.

## 6. Control del navegador desde el chat

La operación de navegador es una capacidad del agente, no una ruta de navegación independiente.

1. El usuario solicita una tarea que requiere navegación.
2. El agente solicita openBrowser o una herramienta browser_*.
3. El backend abre las herramientas Playwright MCP de forma diferida.
4. La extensión transporta las órdenes a Chrome.
5. El resultado vuelve al agente y aparece como actividad de herramienta en el transcript.
6. El agente presenta su respuesta en el mismo chat.

La interfaz web no contiene un viewport del navegador ni un panel que replique la pestaña de Chrome. El usuario observa la actividad y los resultados en el chat, mientras Chrome conserva las páginas reales.

### 6.1. Estados visibles de extensión

- checking: detección o restauración.
- connected: puente disponible.
- unavailable: puente sin respuesta.
- incompatible: handshake válido, pero contrato de extensión no compatible.

Los estados unavailable e incompatible muestran un aviso con Retry en Chat cuando los produce la detección del puente web. En la ruta principal, la desconexión se comunica como pérdida del workspace. La respuesta técnica de herramientas sin conexión utiliza BROWSER_NOT_CONNECTED.

## 7. Dashboard

Dashboard reúne datos de campañas y postulaciones.

### 7.1. Resumen de postulaciones

La parte superior muestra conteos para los estados:

- confirmed
- unconfirmed
- pending_review
- failed
- skipped

El resumen puede representar el conjunto completo o la campaña seleccionada.

### 7.2. Campañas

- La lista pagina seis campañas por página.
- Seleccionar una campaña filtra el resumen y el explorador de postulaciones.
- Seleccionar de nuevo la campaña activa o usar All campaigns retira el filtro.
- El detalle de campaña muestra título, mandato, motivo de estado y límite de postulaciones.

### 7.3. Actividad reciente

La lista muestra puesto, empresa y fecha de actualización. Seleccionar un elemento abre el detalle de la postulación.

### 7.4. Explorador de postulaciones

En Dashboard, el explorador admite configuración de columnas. El detalle de postulación se abre en un Sheet.

## 8. Applications

La ruta /applications presenta el explorador de postulaciones.

### 8.1. Filtros y orden

- Búsqueda por texto.
- Filtro por estado.
- Orden por puesto, empresa o fecha de actualización.
- Paginación de veinte registros por página.

En Dashboard, el explorador también permite mostrar u ocultar columnas. La vista independiente de Applications utiliza el conjunto de columnas predeterminado.

### 8.2. Tabla

Las columnas disponibles son puesto, empresa, plataforma, estado, fecha de actualización y ubicación. El estado se muestra mediante etiqueta textual y color semántico.

Los estados de datos incluyen carga, error con Retry, resultados vacíos y ausencia de coincidencias para los filtros actuales.

### 8.3. Detalle de postulación

El Sheet de detalle muestra:

- Puesto y empresa.
- Enlace a la oferta externa.
- Estado y motivo.
- Campaña y plataforma.
- Ubicación.
- Fechas de creación, actualización y envío cuando existen.
- Documentos asociados con enlaces a Documents.

## 9. Documents

La ruta /documents presenta la biblioteca de CV y documentos originales, sujeta al gate de onboarding.

### 9.1. Biblioteca

Los CV aparecen en una cuadrícula con thumbnail, nombre, especialización y fecha de actualización. El CV principal se distingue de las variantes.

Las acciones disponibles para una variante incluyen:

- Ver.
- Editar.
- Duplicar.
- Renombrar.
- Descargar PDF.
- Abrir el original cuando existe.
- Establecer o retirar como variante predeterminada.
- Reemplazar el CV principal.
- Eliminar.

La biblioteca también presenta documentos originales y archivos adjuntos almacenados en conversaciones.

### 9.2. Importación de originales

Import abre un diálogo con una zona de selección de documentos. La validación se ejecuta antes de subirlos. Los estados visibles incluyen selección, carga, error y reintento.

### 9.3. Comparación

Compare permite seleccionar entre dos y tres CV. La comparación presenta las vistas de documento en columnas, sincroniza el desplazamiento y permite ajustar el zoom. Compara los documentos actuales; no representa un historial de revisiones.

### 9.4. Edición y reemplazo

La edición abre una vista dividida entre el documento y el formulario. Los cambios sin guardar activan confirmación al cerrar. Un conflicto de revisión permite consultar el contenido más reciente antes de confirmar la escritura. La revisión protege la concurrencia y no representa un historial restaurable.

El reemplazo del CV principal sigue una secuencia de selección de archivo, extracción, revisión del perfil extraído y confirmación del reemplazo.

## 10. Profile y onboarding

### 10.1. Gate de onboarding

El acceso al chat nuevo y a Documents requiere que el perfil tenga onboarding_completed y confirmed. Si alguna condición falta, la interfaz presenta ProfessionalPage en lugar del contenido protegido.

La ruta /profile presenta ProfessionalPage directamente.

### 10.2. Importación inicial

Cuando no existe un perfil extraído, la interfaz permite:

1. Seleccionar un CV principal.
2. Añadir documentos de evidencia.
3. Escribir una nota contextual.
4. Iniciar la extracción.
5. Consultar el progreso y el estado de carga.
6. Reintentar una carga o extracción fallida.

La extracción muestra una pantalla de progreso. Al completar, la interfaz presenta el espacio de revisión profesional.

### 10.3. Revisión del perfil

ProfessionalWorkspace divide la vista entre la previsualización del CV y el panel de edición. Las pestañas son:

- Review: datos del perfil profesional.
- Preferences: preferencias de empleo.
- Settings: ajustes de cuenta.

Los cambios de perfil y preferencias se guardan mediante Save. La interfaz valida los datos y las fechas antes de enviar. Los errores se presentan junto al formulario y el estado de guardado deshabilita las acciones incompatibles.

## 11. Recorridos E2E

### 11.1. Primer acceso y onboarding

~~~mermaid
flowchart TD
  A["Abrir Chat o Documents"] --> B{"Perfil confirmado y onboarding completo"}
  B -->|No| C["ProfessionalPage"]
  C --> D{"Existe perfil extraído"}
  D -->|No| E["Importar CV principal y evidencias"]
  E --> F["Extraer y mostrar progreso"]
  F --> G["Revisar perfil"]
  D -->|Sí| G
  G --> H["Revisar preferencias"]
  H --> I["Guardar"]
  I --> J["Gate permite el área solicitada"]
  B -->|Sí| J
~~~

### 11.2. Crear conversación y ejecutar una tarea

~~~mermaid
flowchart TD
  A["Chat vacío"] --> B["Escribir o elegir sugerencia"]
  B --> C["Añadir adjuntos opcionales"]
  C --> D["Enviar"]
  D --> E["Crear chat si no existe"]
  E --> F["Aceptar mensaje y navegar a /chat/id"]
  F --> G["Agente ejecuta el turno"]
  G --> H{"¿Necesita navegador?"}
  H -->|Sí| I["openBrowser / browser_*"]
  I --> J["Extensión ejecuta en Chrome"]
  J --> K["Actividad de herramienta en transcript"]
  H -->|No| L["Actividad del agente"]
  K --> M["Respuesta final"]
  L --> M
~~~

### 11.3. Detener y reanudar una campaña

1. El agente trabaja sobre una campaña.
2. El usuario selecciona Stop.
3. El backend detiene el turno y actualiza el estado visible.
4. Cuando la campaña queda stopped y el agente no trabaja, aparece Resume.
5. Resume envía la acción de reanudación para la campaña seleccionada.

### 11.4. Consultar resultados

1. El usuario abre Dashboard.
2. Selecciona una campaña o conserva All campaigns.
3. Revisa conteos y actividad reciente.
4. Filtra, ordena o pagina el explorador.
5. Selecciona una postulación.
6. Consulta el detalle, la oferta externa y los documentos asociados.

### 11.5. Gestionar CV

1. El usuario abre Documents.
2. Importa originales o selecciona una variante existente.
3. Abre, edita, duplica, renombra, descarga o compara documentos.
4. Si reemplaza el CV principal, revisa la extracción antes de confirmar.
5. La biblioteca actualiza la vista después de la respuesta del backend.

### 11.6. Editar perfil y preferencias

1. El usuario abre Profile.
2. Selecciona Review o Preferences.
3. Modifica los campos disponibles.
4. Save valida y persiste los cambios.
5. Settings abre los ajustes de cuenta.

## 12. Errores y recuperación

| Área | Condición | Respuesta visible |
|---|---|---|
| Workspace | Conexión perdida | Toast con Retry |
| Workspace | Control en conflicto | Diálogo Cancel / Transfer |
| Auth | Sesión no válida | Redirección a inicio de sesión |
| Extensión | unavailable o incompatible | Aviso en Chat con Retry |
| Chat | Envío no confirmado | Error y restauración del borrador/adjuntos |
| Chat | Error de persistencia o stream | Alerta sobre el composer |
| Adjuntos | Tipo, cantidad o tamaño no válido | Toast o alerta de validación |
| Dashboard | Consulta fallida | Alerta con Retry |
| Applications | Consulta fallida | Alerta con Retry |
| Documents | Carga o mutación fallida | Error y acción de reintento cuando corresponde |
| CV | Conflicto de revisión | Acción para consultar la versión más reciente |
| Profile | Extracción o guardado fallido | Error junto al proceso o formulario y Retry |

## 13. Referencias Figma y límite de runtime

El archivo [Mirai en Figma](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai) contiene referencias visuales de chat, historial, estados de extensión y una composición Chat + navegador con modo Normal/Operator.

Algunas referencias relevantes:

| Frame Figma | Referencia |
|---|---|
| CHAT-01 New | [Abrir frame](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=22-3) |
| CHAT-02 Briefing | [Abrir frame](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-126) |
| CHAT-03 Searching | [Abrir frame](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-227) |
| CHAT-09 Extension error | [Abrir frame](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-712) |
| CHAT-10 Completed | [Abrir frame](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-812) |
| CHAT-11 Operator empty | [Abrir frame](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-1013) |
| CHAT-11 Operator working | [Abrir frame](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=22-147) |
| CHAT-12 History expanded | [Abrir frame](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-30809) |
| CHAT-12 Long context | [Abrir frame](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-912) |

Estas referencias son artefactos de diseño. El frontend actual no contiene el panel visual del navegador ni el toggle Normal/Operator. Tampoco utiliza un botón Pause para el turno: durante la ejecución muestra Stop y, si hay texto o adjuntos adicionales, Add instruction.

El workspace web es de escritorio. Los agentes de usuario móviles reciben la pantalla DesktopOnly, no el layout completo de la aplicación.

## 14. Mapa de implementación y pruebas

| Responsabilidad | Ubicación |
|---|---|
| Rutas del workspace | apps/web/src/features/sessions/workspaceRoutes.ts |
| Shell, navegación y control | apps/web/src/features/sessions/WorkspaceShell.tsx |
| Resolución de pantallas | apps/web/src/features/sessions/WorkspaceView.tsx |
| Estado de sesión y extensión | apps/web/src/features/sessions/useController.ts |
| Handshake de extensión | apps/web/src/features/sessions/extensionBridge.ts |
| Conversación y envío | apps/web/src/features/chat/ChatWorkspace.tsx |
| Editor y acciones del composer | apps/web/src/features/chat/ChatComposer.tsx |
| Transcripción y actividad | apps/web/src/features/chat/ChatTranscript.tsx |
| Historial de conversaciones | apps/web/src/features/chat/ChatNavigation.tsx |
| Dashboard | apps/web/src/features/dashboard/DashboardPage.tsx |
| Explorador y detalle | apps/web/src/features/applications |
| Biblioteca de CV | apps/web/src/features/cvs/CvLibrary.tsx |
| Onboarding y perfil | apps/web/src/features/profiles |

Las pruebas de rutas y puente de extensión están en:

- apps/web/src/features/sessions/workspaceRoutes.test.ts
- apps/web/src/features/sessions/extensionBridge.test.ts

Estas rutas identifican pruebas disponibles para los contratos descritos. La existencia de una prueba no equivale a afirmar que se ejecutó en esta verificación documental.

## 15. Glosario

| Término | Definición |
|---|---|
| Composer | Editor y controles para redactar y enviar mensajes |
| Transcript | Transcripción de mensajes, actividad y respuestas del agente |
| CampaignSummary | Tarjeta de resumen de una campaña |
| Workspace | Área autenticada de trabajo de una cuenta |
| Extension bridge | Transporte entre la página web y la extensión |
| Onboarding gate | Condición que exige perfil confirmado y onboarding completo |
| Operator | Composición visual de Figma que da protagonismo al navegador; no es una ruta del frontend actual |
