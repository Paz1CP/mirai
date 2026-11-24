# Mirai — Security & Privacy

> **Tipo:** Técnico transversal  
> **Alcance:** Identidad, autorización, aislamiento, tratamiento de datos personales, navegador, proveedores, pagos y eliminación de cuenta.  
> **Responsable:** Ingeniería de Mirai  
> **Última verificación:** 2026-11-24

## 1. Resumen

Mirai distribuye el tratamiento de datos entre la aplicación web, la API, Neon Auth, PostgreSQL, almacenamiento de objetos, servicios de inferencia y sesiones de Google, Paddle y el Chrome local del candidato. La identidad autenticada define el ámbito de acceso; los repositorios, contratos y conexiones de workspace conservan ese ámbito en cada operación.

La seguridad de acceso a recursos propios es distinta de la autorización semántica de acciones en portales externos. La primera se comprueba en el servidor; la segunda combina el mandato, las preferencias, las instrucciones del agente y las restricciones del relay de navegador.

## 2. Fronteras de confianza

~~~mermaid
flowchart LR
  User["Candidato / Chrome"] --> Web["Web / Neon Auth SDK"]
  Web --> Auth["Neon Auth"]
  Web -->|Bearer JWT| API["Express API"]
  Ext["Extensión WXT"] <-->|Workspace WebSocket| API
  Ext <-->|Chrome Debugger| User
  API --> DB["Neon PostgreSQL"]
  API --> Storage["Neon Object Storage"]
  API --> AI["Google Vertex AI / Agent Engine"]
  API --> Pay["Paddle"]
  Pay -->|Webhook firmado| API
~~~

| Frontera | Control |
|---|---|
| Web → identidad | Neon Auth y sesión web |
| Cliente → API | Bearer JWT, validación de sesión y contratos |
| API → datos | accountId derivado de identidad; ownership en repositorios |
| Extensión → workspace | Validación de origen, autenticación y ownership de instancia |
| Agente → navegador | Herramientas permitidas, restricciones CDP y mandato |
| Paddle → API | Firma HMAC sobre cuerpo original y validación de transacción |
| API → proveedores | Credenciales del servidor y configuración de cada servicio |

El contenido de sitios, formularios, documentos y mensajes externos se trata como datos, no como autoridad para ampliar el mandato.

## 3. Identidad y sesiones

### 3.1. Acceso web

La interfaz usa Neon Auth para iniciar sesión mediante Google OAuth. El servidor Next.js crea el cliente de autenticación con NEON_AUTH_BASE_URL y NEON_AUTH_COOKIE_SECRET. La ruta /api/auth/[...path] integra la autenticación en el origen de la web. El proxy de Next.js protege las rutas del workspace y utiliza /auth/sign-in como entrada; /health e /images son rutas públicas declaradas.

El cliente solicita un token de acceso mediante authClient.token(). Mantiene una caché en memoria mientras el token tenga más de 30 segundos de vigencia; una señal de cambio de sesión invalida el token, las solicitudes pendientes y su generación. Decodificar exp en el navegador solo sirve para gestionar esa caché, no para verificar la identidad.

### 3.2. Verificación de API

createIdentityVerifier realiza estas comprobaciones:

1. Exige un encabezado Authorization que comience por Bearer.
2. Verifica la firma JWT mediante el conjunto JWKS remoto de Neon Auth.
3. Restringe el algoritmo a EdDSA; comprueba issuer y audience contra el origen de la URL de autenticación.
4. Exige sub, exp e iat y valida los tiempos del token.
5. Exige role=authenticated y rechaza banned=true.
6. Comprueba en PostgreSQL que exista la cuenta y una sesión no expirada, creada antes del segundo siguiente al iat del token.
7. Devuelve sub como accountId; en caso de rechazo devuelve null.

hasActiveSession usa FOR KEY SHARE SKIP LOCKED sobre la cuenta. Una cuenta bloqueada por eliminación no pasa esta autorización. El JWT no sustituye la comprobación de actividad en la base de datos.

### 3.3. Autorización

| Recurso | Ámbito |
|---|---|
| Perfil, preferencias, originales y CV | accountId |
| Sesión de chat | userId/accountId y sessionId; ManagedChats.owned comprueba propietario |
| Candidatura | accountId y campaignId; FK compuesta a la campaña |
| Mutación de campaña por agente | accountId, chatSessionId e ID |
| Adjunto de chat | accountId, chatId, messageId y posición |
| Wallet y ledger | accountId y entorno de billing |
| Workspace | accountId e instanceId; control de ejecución por chat |

Las rutas de resultados y billing autenticadas usan Cache-Control: no-store. La API valida sus entradas mediante Zod y no admite accountId libre del modelo como autoridad de escritura. La separación entre cuentas depende de los filtros de repositorio, las comprobaciones de propiedad y las restricciones relacionales; no se describe como aislamiento automático proporcionado por el frontend.

## 4. Seguridad de transporte y workspace

Express desactiva X-Powered-By y configura CORS con WEB_ORIGIN (por defecto http://localhost:3000). CORS no reemplaza la autenticación.

WorkspaceSocket acepta upgrades únicamente en /v1/workspace, desde el WEB_ORIGIN configurado o un origen con formato chrome-extension:// seguido de un ID Chromium válido. La comprobación de formato no fija un ID único de extensión; la apertura requiere la autoridad de cuenta correspondiente.

- Apertura normal: token Bearer verificado; la cuenta declarada debe coincidir con la identidad.
- control.attach: solo para conexiones de extensión, con nuevo token que pertenezca a la misma cuenta.
- Renovación sin token fresco: ruta restringida de extensión, con renewal, expectedInstanceId y tabId; el controlador anterior y sus advisory locks autorizan la continuidad.
- Ownership: una fila de account_controllers por cuenta y locks de PostgreSQL coordinan adquisición, transferencia y cierre.
- Las notificaciones PostgreSQL de resultados, billing y eliminación se filtran por cuenta; billing también se filtra por entorno.
- La pérdida de ownership o de conexión cancela las ejecuciones correspondientes.

La extensión valida mensajes same-origin, frame superior, pestaña emisora y los orígenes Mirai permitidos. La URL de API se transforma de HTTPS a WSS; WS se admite únicamente para HTTP de localhost o 127.0.0.1.

La arquitectura del transporte, sus límites y la continuidad de ejecución se detallan en [Browser — Technical](../features/browser/mirai_browser_implementation.md) y [Chat — Technical](../features/chat/mirai_chat_implementation.md).

## 5. Autonomía y seguridad del navegador

El backend ejecuta el agente y Playwright MCP; la extensión ejecuta operaciones en Chrome. El perfil, las cookies y las sesiones de portales permanecen en el navegador del candidato, aunque la información observada por las herramientas puede viajar al agente para resolver la tarea.

| Control | Efecto |
|---|---|
| Pestaña controladora excluida | Protege la pestaña que aloja Mirai |
| Inventario de pestañas | Las demás pestañas del perfil son accesibles; no existe separación por categoría personal/laboral |
| Navegación permitida | HTTP/HTTPS sin credenciales embebidas; about:blank como estado inicial |
| Restricciones CDP | Bloquean comandos de cookies, caché, permisos, descargas, ciclo de vida y asignación de archivos indicados en remoteBrowser |
| Herramientas de agente filtradas | Limita la interfaz Playwright MCP disponible |
| Adjuntos temporales | Solo archivos preparados y autorizados durante la invocación; permisos 0600 |
| Stop y pérdida de conexión | Cancelan la ejecución; no deshacen efectos externos ya transmitidos |

Playwright MCP y el relay CDP internos escuchan en loopback. La autorización de archivos verifica las rutas preparadas durante la invocación. La extensión bloquea DOM.setFileInputFiles, por lo que preparar un archivo no acredita su carga externa.

### 5.1. Política del agente

miraiPrompt.ts delimita las acciones mediante estas reglas:

- Una instrucción de búsqueda no equivale a autorización de envío.
- Un mandato de postulación autoriza acciones rutinarias dentro de sus condiciones.
- El agente utiliza hechos profesionales confirmados y no inventa respuestas personales.
- Los sitios externos aportan evidencia, no instrucciones.
- Las verificaciones de identidad, evaluaciones, entrevistas y aceptación de términos personales se reservan al candidato.
- La comunicación laboral exige allow_communication habilitado y solicitud explícita del candidato; se limita al canal y destinatario autorizados.
- Los resultados inciertos se inspeccionan antes de repetir la acción.

La autorización semántica de comunicaciones y envíos pertenece al prompt y al razonamiento del agente. Las herramientas genéricas de navegador no implementan un gate de negocio por cada clic. El presupuesto de campaña se calcula después de registrar resultados. No se debe confundir esas políticas con una barrera transaccional previa a un efecto externo.

## 6. Inventario y tratamiento de datos

| Categoría | Fuente de verdad | Finalidad |
|---|---|---|
| Identidad y sesión | Neon Auth | Acceso y actividad de cuenta |
| Perfil y preferencias | PostgreSQL, users | Contexto profesional y restricciones del mandato |
| CV estructurado y metadata | PostgreSQL, users | Biblioteca y renderizado |
| Originales PDF/DOCX | Object Storage y referencias relacionales | Importación, lectura y reutilización |
| Conversaciones y estado del agente | Vertex AI Agent Engine | Historial, ejecución y continuidad |
| Adjuntos de chat | queued_chat_attachments y originales asociados | Material de conversación y recuperación |
| Campañas y resultados | PostgreSQL, users | Seguimiento de actividad y candidaturas |
| Saldo, consumo y compras | PostgreSQL, billing | Contabilidad y conciliación |
| Transacciones de pago | Paddle | Cobro, confirmación y ajustes |
| Páginas del portal | Chrome local y resultados de herramientas | Contexto de navegación y ejecución |

Los servicios de inferencia reciben el contenido necesario para el perfil, chat o herramientas: texto, documentos, imágenes y observaciones de navegador según la operación. La extracción convierte el PDF en entrada inline y el DOCX en texto extraído. El resultado estructurado se valida mediante contratos.

Las candidaturas conservan datos de oportunidad, estado, motivo, fechas y referencias de documentos. No mantienen un snapshot inmutable del CV ni un almacén independiente de evidencias de recepción.

### 6.1. Almacenamiento documental

DocumentStorage genera claves con el prefijo profiles/<SHA-256 de accountId>/, un UUID y el hash SHA-256 del archivo. checkOwner verifica prefijo y formato del nombre antes de upload, read, access o remove. El hash del identificador no constituye anonimización de la cuenta.

Las URLs de lectura firmadas duran 120 segundos; son credenciales temporales de acceso al objeto. La API no devuelve las credenciales S3 al cliente. Los archivos se guardan con ContentType, ContentDisposition de adjunto y metadata de nombre original.

El límite compartido de documentos es de diez por selección, 10 MiB por archivo, 30 MiB en conjunto y nueve documentos de evidencia. La capacidad de originales es veinte, contabilizando también adjuntos no-imagen guardados. Multer limita tamaño, cantidad y campos; la extracción comprueba formato y contenido antes de utilizarlo.

### 6.2. Ciclo de vida y retención técnica

| Recurso | Regla de ciclo de vida |
|---|---|
| Original adoptado | Permanece asociado a la biblioteca hasta su eliminación o la eliminación de cuenta |
| Upload pendiente | La fila document_cleanup establece una ventana de una hora para adopción |
| Objeto retirado | Se encola para limpieza; se comprueba que no esté referenciado antes de borrarlo |
| URL firmada | 120 segundos |
| Archivo temporal de herramientas | Directorio temporal por invocación, eliminado al cerrar el conjunto de herramientas |
| Sesión ADK | TTL configurado por GOOGLE_ADK_SESSION_TTL, por defecto 7776000s (90 días) |
| Adjuntos de chat | Referencias por mensaje y cuenta; operaciones de eliminación del repositorio |
| Datos relacionales de cuenta | Eliminación explícita en el flujo de borrado |

documentCleanup procesa lotes de hasta ocho objetos pendientes de una cuenta. Si un objeto sigue referenciado, retira la entrada de limpieza; si el borrado falla, conserva la entrada para reintento. La ventana de una hora es una condición de elegibilidad para limpieza, no una promesa de eliminación exactamente al cumplirse.

El TTL de sesión no constituye una política universal de retención para todos los proveedores o datos de Mirai.

## 7. Privacidad de actividad y errores

chatEvents.visibleToolData omite argumentos/resultados de getCandidateContext, getDocument, prepareAttachment y herramientas browser_*. listDocuments reduce su resultado visible a inventario de CV y originales, con identificadores de selección. Los demás datos JSON visibles deben respetar el límite de 8.000 caracteres.

Esta reducción protege la superficie de presentación; no significa que el proveedor de inferencia o la sesión nunca reciban el resultado original de la herramienta.

El middleware general registra request_failed y el tipo de error; responde INTERNAL_ERROR sin devolver la traza interna. Los errores de documentos y billing exponen códigos de dominio. Los logs específicos de extracción, pagos y limpieza incluyen eventos y estados útiles para diagnóstico. Los scripts locales de comprobación de infraestructura pueden imprimir errores de proveedor: sus salidas deben tratarse como información operativa privada.

## 8. Pagos y webhooks

Billing separa sandbox y live en configuración y datos de wallet. El checkout se crea desde el backend para la cuenta autenticada; el cliente recibe el token público de Paddle y el ID de transacción, no la API key.

La ruta POST /v1/billing/paddle/:environment/webhook usa cuerpo raw JSON de hasta 256 KiB, sin inflación. Antes de interpretar JSON verifica Paddle-Signature:

1. Exige un único timestamp válido dentro de una diferencia de cinco segundos.
2. Calcula HMAC-SHA256 sobre timestamp, separador y cuerpo original.
3. Compara la firma h1 mediante timingSafeEqual.
4. Rechaza configuración sin secreto o con el mismo secreto para ambos entornos.
5. Valida el evento y reconcilia la transacción contra el intento interno, entorno, producto, precio e identificadores correspondientes.

La acreditación, movimientos y ajustes se coordinan dentro del ámbito de wallet. El ledger y las claves de movimiento permiten reconocer repeticiones. Un evento firmado por sí solo no autoriza acreditar una compra que no corresponda a su intento interno.

## 9. Eliminación de cuenta

### 9.1. Confirmación y reautenticación

POST /v1/account/deletion exige Bearer válido, confirmación textual ELIMINAR o DELETE, confirmed=true y token de sesión. El backend comprueba una sesión de la misma cuenta, no impersonada, vigente y creada dentro de los últimos diez minutos. Si no existe devuelve RECENT_AUTH_REQUIRED (403). El frontend puede solicitar un nuevo inicio de sesión con Google.

La ruta requiere conexión PostgreSQL directa; sin ella devuelve ACCOUNT_DELETION_UNAVAILABLE.

### 9.2. Secuencia de eliminación

~~~mermaid
sequenceDiagram
  participant U as AccountSettings
  participant A as AccountDeletion
  participant D as PostgreSQL
  participant W as Workspace / Activity
  participant P as Google / Storage / Paddle
  U->>A: Confirmación + JWT + prueba de sesión
  A->>D: BEGIN y lock de cuenta
  A->>D: Revocar sesiones y notificar eliminación
  D-->>W: mirai_account_deletion
  A->>D: Drenar locks de actividad
  A->>P: Eliminar recursos y cancelar pagos pendientes
  A->>D: Eliminar filas propias e identidad
  A->>D: COMMIT
  A-->>U: complete + unconfirmed
~~~

El lock de cuenta evita nuevas autorizaciones; la revocación de sesiones y notificación cancelan actividad asociada. AccountActivity utiliza locks compartidos y escucha el evento de eliminación para abortar operaciones remotas. El drenaje dispone de 45 segundos y registra activity si no puede confirmarse.

La eliminación externa se realiza con un plazo de 45 segundos: lista sesiones de Google e identificadores de interacciones desde sesiones/ledger, intenta cancelar interacciones activas cuando corresponde y las elimina; elimina sesiones y comprueba una vez las restantes; recorre y borra objetos del prefijo de cuenta hasta que no queden; cancela transacciones pendientes de Paddle en ambos entornos, incluidas las que todavía no están enlazadas.

La transacción elimina candidaturas antes de campañas, adjuntos, CV, originales, limpieza pendiente, preferencias, perfil, controlador, ledger, topups y wallets; elimina verificaciones de email e identidad de Neon Auth.

### 9.3. Fallos parciales

Los fallos de proveedores no impiden borrar los datos propios de Mirai. La respuesta status=complete incorpora unconfirmed con recursos cuya eliminación o cancelación no se pudo comprobar: activity, sessions, interactions, storage o paddle. El cliente presenta el resultado y limpia el token.

La cancelación de transacciones pendientes no equivale a borrar el historial comercial del proveedor. El contrato describe la eliminación técnica de la cuenta, no una garantía sobre backups, conservación legal o plazos internos de terceros.

## 10. Secretos y configuración

Los secretos de cookies, DB, S3, Google y Paddle pertenecen al servidor o al mecanismo de credenciales del proveedor. Los archivos .env y .env.* están excluidos de Git salvo .env.example; los contextos Docker y Cloud Build excluyen archivos de entorno y paddle_secrets.env. Los parámetros NEXT_PUBLIC_* y WXT_* se incorporan a artefactos cliente y no deben contener secretos.

Consultar [Infrastructure & Deployment](mirai_infrastructure_and_deployment.md) y [Developer Environment](mirai_developer_environment.md) para el inventario de configuración y los procedimientos.

## 11. Mapa de implementación

| Responsabilidad | Fuente |
|---|---|
| Identidad y actividad | [verifyIdentity](../../apps/api/src/features/auth/verifyIdentity.ts), [accountActivity](../../apps/api/src/features/auth/accountActivity.ts) |
| Auth web | [server](../../apps/web/src/shared/auth/server.ts), [client](../../apps/web/src/shared/auth/client.ts), [proxy](../../apps/web/src/proxy.ts) |
| Composición y errores | [app.ts](../../apps/api/src/bootstrap/app.ts) |
| Workspace y ownership | [workspaceSocket](../../apps/api/src/features/sessions/workspaceSocket.ts), [controllerRepository](../../apps/api/src/features/sessions/controllerRepository.ts) |
| Relay | [background](../../apps/extension/entrypoints/background.ts), [remoteBrowser](../../apps/extension/lib/remoteBrowser.ts), [webOrigins](../../apps/extension/lib/webOrigins.ts) |
| Política y actividad | [miraiPrompt](../../apps/api/src/features/agents/miraiPrompt.ts), [chatEvents](../../apps/api/src/features/agents/chatEvents.ts), [playwrightTools](../../apps/api/src/features/agents/playwrightTools.ts) |
| Archivos | [documentStorage](../../apps/api/src/features/profiles/documentStorage.ts), [documentCleanup](../../apps/api/src/features/profiles/documentCleanup.ts), [documentHttp](../../apps/api/src/features/profiles/documentHttp.ts), [chatAttachments](../../apps/api/src/features/agents/chatAttachments.ts) |
| Sesiones administradas | [managedChats](../../apps/api/src/features/agents/managedChats.ts) |
| Resultados | [resultsRepository](../../apps/api/src/features/applications/resultsRepository.ts), [schema](../../apps/api/src/features/applications/schema.ts) |
| Billing | [paddleClient](../../apps/api/src/features/billing/paddleClient.ts), [paddleBilling](../../apps/api/src/features/billing/paddleBilling.ts), [routes](../../apps/api/src/features/billing/routes.ts) |
| Eliminación | [accountDeletion](../../apps/api/src/features/auth/accountDeletion.ts), [AccountSettings](../../apps/web/src/features/profiles/AccountSettings.tsx), [contrato](../../packages/contracts/src/account.ts) |

Este documento describe controles y tratamiento técnico de datos. No sustituye un aviso de privacidad contractual ni afirma certificaciones o políticas de retención de proveedores no expresadas por el sistema.
