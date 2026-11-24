# Mirai — Infrastructure & Deployment

> **Tipo:** Técnico transversal  
> **Alcance:** Topología de ejecución, contenedores, servicios administrados, configuración, build, publicación de artefactos y operación de los servicios.  
> **Responsable:** Ingeniería de Mirai  
> **Última verificación:** 2026-11-24

## 1. Resumen

Mirai combina dos servicios HTTP independientes, una extensión de escritorio y servicios administrados de identidad, datos, inferencia y pagos. Cloud Run es el destino de ejecución de Web y API; Cloud Build construye sus imágenes Docker y Artifact Registry las almacena. El agente se ejecuta en la API y opera el Chrome del candidato mediante la extensión, sin requerir un navegador cloud dedicado.

El contrato de infraestructura se define por los Dockerfiles, cloudbuild.yaml, las variables de entorno de cada aplicación, los módulos de bootstrap y ops/configure-api.ps1. La configuración de recursos se distingue de la lógica de negocio de cada feature.

## 2. Topología

~~~mermaid
flowchart TD
  Chrome["Chrome del candidato"] --> Web["Cloud Run: mirai-web / Next.js"]
  Chrome --> Ext["WXT extension"]
  Web --> Auth["Neon Auth"]
  Web --> API["Cloud Run: mirai-api / Express"]
  Ext <-->|WSS| API
  API --> DB["Neon PostgreSQL"]
  API --> S3["Neon Object Storage / S3"]
  API --> Engine["Vertex AI Agent Engine / sesiones"]
  API --> Gemini["Google GenAI / inferencia"]
  API --> Paddle["Paddle API"]
  Paddle -->|Webhook HTTPS| API
  Git["Repositorio Git"] --> Build["Cloud Build"]
  Build --> Registry["Artifact Registry"]
  Registry -. Imagen web .-> Web
  Registry -. Imagen API .-> API
~~~

| Unidad | Tecnología | Responsabilidad |
|---|---|---|
| Web | Next.js, React | Autenticación web, UI, consultas y controlador cliente |
| API | Node.js, Express, ws | Autorización, dominios, agente, billing, workspace y eventos |
| Extensión | WXT, Chrome Debugger API | Transporte y ejecución en navegador del candidato |
| Base de datos | Neon PostgreSQL, Drizzle, pg | Estado relacional y coordinación distribuida |
| Objetos | Neon Object Storage, API S3 | Originales y archivos documentales |
| Sesiones | VertexAiSessionService, Google ADK | Historial y estado de conversaciones |
| Inferencia | Google GenAI / Vertex AI | Chat, herramientas y extracción profesional |
| Pagos | Paddle sandbox/live | Checkout, transacciones y ajustes |

## 3. Entorno cloud y recursos

| Parámetro | Referencia de configuración |
|---|---|
| Proyecto GCP | mirai-514723 (ejemplo API y script operativo) |
| Región de servicios/registro | us-east4 |
| Registro | us-east4-docker.pkg.dev/$PROJECT_ID/mirai |
| Imagen API | mirai-api:<tag> |
| Imagen web | mirai-web:<tag> |
| Servicio API | mirai-api |
| Servicio web | mirai-web |
| Región de inferencia por defecto | global |
| Región de cliente S3 por defecto | us-east-1 |
| Bucket documental por defecto | mirai-documents |

Las regiones tienen responsabilidades distintas. La región de Agent Engine se extrae del nombre de recurso GOOGLE_ADK_AGENT_ENGINE; la región del modelo se configura independientemente mediante GOOGLE_CLOUD_LOCATION. AWS_REGION configura el cliente compatible con S3, no la región de Cloud Run.

Los nombres de bucket se declaran en neon.ts: mirai-documents y mirai-temporary. DocumentStorage utiliza NEON_STORAGE_BUCKET o el primero por defecto; la declaración del segundo bucket no implica que el flujo documental lo utilice.

## 4. Web y API: imágenes de contenedor

### 4.1. Base compartida

Ambos Dockerfiles emplean node:26-bookworm-slim en etapas build y runtime, e instalan pnpm 10.33.0 durante build. Copian los manifests del workspace y los patches, ejecutan pnpm install --no-frozen-lockfile y construyen @mirai/contracts y @mirai/cv-renderer antes de la aplicación correspondiente.

Los contextos excluyen dependencias locales, salidas de compilación, documentos, cachés y secretos según .dockerignore. Las imágenes de runtime ejecutan el proceso como usuario node, con NODE_ENV=production y PORT=8080.

### 4.2. API

apps/api/Dockerfile compila TypeScript a apps/api/dist. La etapa runtime contiene el árbol de dependencias, los paquetes internos compilados, el manifest API y las fuentes tipográficas Geist necesarias para renderizar CV.

Comando de entrada:

~~~bash
node apps/api/dist/bootstrap/server.js
~~~

server.ts carga variables mediante dotenv, escucha en 0.0.0.0 y usa PORT o 4000 fuera de la configuración del contenedor. Adjunta el workspace WebSocket al mismo servidor HTTP.

Al recibir SIGTERM o SIGINT solicita el cierre del workspace, deja de aceptar conexiones HTTP y espera el cierre de sesiones antes de terminar el pool de DB y el proceso.

### 4.3. Web

apps/web/Dockerfile utiliza NEXT_PUBLIC_API_ORIGIN como argumento de build. Next.js genera rutas tipadas, ejecuta typecheck explícito y compila en modo standalone. next.config.ts amplía outputFileTracingRoot a la raíz del monorepo y transpila los paquetes compartidos.

El runtime copia .next/standalone, .next/static y public; HOSTNAME=0.0.0.0 y PORT=8080. Comando:

~~~bash
node apps/web/server.js
~~~

NEXT_PUBLIC_API_ORIGIN queda asociado al artefacto web durante build; API_URL y las variables de autenticación del servidor pertenecen al entorno de ejecución. Cambiar el origen público requiere construir un artefacto con ese valor.

## 5. Build y publicación de imágenes

cloudbuild.yaml contiene una etapa Docker parametrizada:

| Sustitución | Valor por defecto | Propósito |
|---|---|---|
| _APP | api | Selecciona apps/<app>/Dockerfile |
| _TAG | setup | Etiqueta de la imagen |
| _API_ORIGIN | URL HTTPS de API configurada en cloudbuild.yaml | Argumento NEXT_PUBLIC_API_ORIGIN |

El paso construye desde la raíz del repositorio, etiqueta la imagen como us-east4-docker.pkg.dev/$PROJECT_ID/mirai/mirai-${_APP}:${_TAG}, y la declara en images para publicación en Artifact Registry. La opción de logging es CLOUD_LOGGING_ONLY.

### 5.1. Comandos de build

Desde la raíz, con Google Cloud CLI autenticada y permisos de Cloud Build y Artifact Registry:

~~~bash
gcloud builds submit . --project=mirai-514723 --config=cloudbuild.yaml --substitutions=_APP=api,_TAG=release-001
gcloud builds submit . --project=mirai-514723 --config=cloudbuild.yaml --substitutions=_APP=web,_TAG=release-001,_API_ORIGIN=https://<api-origin>
~~~

Sustituir release-001 por la etiqueta de release y <api-origin> por el host HTTPS real. Las etiquetas del ejemplo son parámetros operativos, no identificadores de una release certificada.

### 5.2. Actualización de servicios

El YAML publica imágenes; no contiene un paso de actualización de Cloud Run. El cambio de revisión de cada servicio es una operación independiente. Para actualizar una configuración de servicio existente con la imagen correspondiente:

~~~bash
gcloud run services update mirai-api --project=mirai-514723 --region=us-east4 --image=us-east4-docker.pkg.dev/mirai-514723/mirai/mirai-api:release-001
gcloud run services update mirai-web --project=mirai-514723 --region=us-east4 --image=us-east4-docker.pkg.dev/mirai-514723/mirai/mirai-web:release-001
~~~

Estos comandos describen el procedimiento de actualización; conservan la configuración del servicio y no sustituyen la provisión de identidad, credenciales, red y variables. No forman parte del script de build. Utilizar la misma referencia de release para los componentes que comparten contratos.

ops/configure-api.ps1 configura un timeout de 3600 segundos para mirai-api en el proyecto y región indicados:

~~~powershell
./ops/configure-api.ps1
~~~

El script cambia únicamente el timeout; no crea el servicio ni configura memoria, CPU, concurrencia o secretos.

## 6. Datos e infraestructura de eventos

### 6.1. PostgreSQL

createDatabase utiliza pg.Pool con máximo de cinco conexiones, timeout de conexión de 5 segundos y statement_timeout de 10 segundos. Drizzle proporciona acceso tipado a las tablas.

| Conexión | Propósito |
|---|---|
| DATABASE_URL | Consultas y transacciones de dominio |
| DATABASE_URL_UNPOOLED o DATABASE_URL_DIRECT | LISTEN/NOTIFY, locks de sesión, controlador, coordinación de borrado |
| URL de Drizzle Kit | Prefiere unpooled, luego direct y finalmente DATABASE_URL |

El workspace necesita conexión directa para mantener LISTEN y advisory locks de sesión. Los eventos mirai_control, mirai_results, mirai_billing y mirai_account_deletion coordinan instancias sin depender de memoria compartida entre contenedores.

La persistencia se organiza en users, billing, catalog y neon_auth. Los schemas Drizzle residen en apps/api/src/features/**/schema.ts; Drizzle Kit utiliza apps/api/database/migrations. Las migraciones se ejecutan explícitamente, no desde el entrypoint del contenedor:

~~~bash
pnpm --filter @mirai/api db:migrate
~~~

La configuración de migración se selecciona desde el entorno de API; comprobar el destino antes de ejecutar una mutación de esquema.

### 6.2. Almacenamiento de objetos

DocumentStorage crea S3Client con endpoint AWS_ENDPOINT_URL_S3, AWS_REGION y forcePathStyle=true. El SDK obtiene credenciales AWS del entorno. NEON_STORAGE_BUCKET define el bucket. Las operaciones aplican ownership de clave y URLs firmadas de 120 segundos; upload, read y remove tienen plazos de 60, 30 y 10 segundos respectivamente.

Los originales persisten en object storage; el PDF renderizado y archivos de navegador se producen según necesidad. Los archivos de herramientas viven en un directorio temporal local a la invocación, no en un volumen compartido de ejecución. El runtime limpia ese directorio al cerrar PlaywrightTools.

## 7. Google Cloud e inferencia

GOOGLE_ADK_AGENT_ENGINE tiene formato projects/<project>/locations/<region>/reasoningEngines/<id>. ManagedChats extrae proyecto, región e ID para VertexAiSessionService; si el recurso no coincide con ese formato no crea el servicio de sesiones.

GoogleAuth solicita el scope cloud-platform. La integración Google GenAI utiliza configuración enterprise y credenciales Google del entorno. La identidad de ejecución debe disponer de permisos para las operaciones de sesiones, modelos e interacciones correspondientes.

| Variable | Propósito |
|---|---|
| GOOGLE_CLOUD_PROJECT | Proyecto de extracción y contexto de proveedor |
| GOOGLE_CLOUD_LOCATION | Región de inferencia; global por defecto |
| GOOGLE_ADK_AGENT_ENGINE | Nombre completo del recurso de sesiones |
| GOOGLE_ADK_SESSION_TTL | TTL de nuevas sesiones; 7776000s por defecto |
| GOOGLE_ADK_MODEL | Override del modelo inicial de chat |
| GOOGLE_GENAI_MODEL | Modelo de extracción y fallback de configuración inicial del chat; gemini-4-hydrogen por defecto |
| GOOGLE_GENAI_FALLBACK_MODEL | Modelo de respaldo de extracción; gemini-3.8-flash por defecto |

El recurso de sesiones no aloja Chrome: MiraiAgent corre en la API y utiliza Google para inferencia y persistencia de sesiones. El flujo de navegador establece un servidor MCP y CDP en loopback dentro del proceso API, conectado al navegador mediante WorkspaceSocket.

## 8. Extensión y contratos de red

La extensión es una unidad independiente del despliegue de contenedores. WXT construye paquetes Chrome y Firefox; el control depende de chrome.debugger, por lo que el empaquetado Firefox no implica paridad funcional.

WXT_WEB_ORIGIN y WXT_API_ORIGIN parametrizan el origen adicional autorizado y su API. webOrigins.ts también conserva un par de orígenes HTTPS de Cloud Run para el entorno de servicio. La extensión comprueba el origen de página y selecciona WSS para HTTPS; HTTP local admite WS.

~~~bash
pnpm --filter @mirai/extension build
pnpm --filter @mirai/extension zip
~~~

El resultado de WXT contiene los permisos, content scripts y background de la versión declarada en apps/extension/package.json. La API y extensión deben conservar compatibilidad con los contratos de workspace y relay. Consultar [Browser — Technical](../browser/technical.md).

## 9. Configuración de servicios

### 9.1. API

| Grupo | Variables |
|---|---|
| HTTP | PORT, WEB_ORIGIN |
| Identidad | NEON_AUTH_BASE_URL |
| DB | DATABASE_URL, DATABASE_URL_UNPOOLED, DATABASE_URL_DIRECT (alias) |
| Google | GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, GOOGLE_ADK_AGENT_ENGINE, GOOGLE_ADK_SESSION_TTL, GOOGLE_ADK_MODEL, GOOGLE_GENAI_MODEL, GOOGLE_GENAI_FALLBACK_MODEL |
| S3 | AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, AWS_REGION, NEON_STORAGE_BUCKET |
| Billing | BILLING_ENVIRONMENT, BILLING_SANDBOX_ACCOUNT_IDS |
| Paddle | PADDLE_SANDBOX_* y PADDLE_LIVE_* |

Para cada entorno Paddle, los sufijos son API_KEY, CLIENT_TOKEN, WEBHOOK_SECRET, PRODUCT_ID y PRICE_10, PRICE_25, PRICE_50, PRICE_100. La API usa endpoints sandbox/live según el entorno y valida configuración de checkout. Los webhooks entran por /v1/billing/paddle/:environment/webhook.

### 9.2. Web y extensión

| Variable | Consumidor | Naturaleza |
|---|---|---|
| API_URL | Web servidor | URL interna/configurada de API |
| NEXT_PUBLIC_API_ORIGIN | Web cliente | URL pública; build-time |
| NEON_AUTH_BASE_URL | Web servidor | URL de Neon Auth |
| NEON_AUTH_COOKIE_SECRET | Web servidor | Secreto de sesión |
| WXT_WEB_ORIGIN | Extensión | Origen web configurado; build-time |
| WXT_API_ORIGIN | Extensión | Origen API configurado; build-time |

Los secretos se inyectan en el entorno de ejecución, no en argumentos públicos de build. Los .env.example enumeran la configuración sin credenciales reales. La gestión de secretos y políticas de acceso se desarrolla en [Security & Privacy](mirai_security_and_privacy.md).

## 10. Arranque, disponibilidad y diagnóstico

| Señal | Interpretación |
|---|---|
| API GET /health | Proceso HTTP responde status=ok |
| Web /health | Ruta pública de salud |
| SERVICE_NOT_CONFIGURED (503) | Falta DATABASE_URL o NEON_AUTH_BASE_URL; rutas /v1 no se montan |
| EVENTS_NOT_CONFIGURED | Workspace requiere conexión DB directa |
| ACCOUNT_DELETION_UNAVAILABLE | Falta conexión directa de borrado |
| BILLING_UNAVAILABLE | Configuración o servicio de pagos no disponible |
| Error de sesión/agent | Revisar recurso Agent Engine, credenciales y modelo |
| Extensión unavailable/incompatible | Revisar orígenes, versión y handshake |

GET /health no comprueba la conexión a todos los proveedores ni garantiza el flujo de candidatura. Las comprobaciones específicas de PostgreSQL y storage están disponibles mediante db:check y storage:check; véase [Developer Environment](mirai_developer_environment.md).

La API registra señales de arranque, request_failed y errores de proveedores con los detalles definidos por cada módulo. Cloud Build envía logs a Cloud Logging. Para observar servicios y revisiones se pueden utilizar las herramientas de Google Cloud:

~~~bash
gcloud run services describe mirai-api --project=mirai-514723 --region=us-east4
gcloud run revisions list --service=mirai-api --project=mirai-514723 --region=us-east4
gcloud run services logs read mirai-api --project=mirai-514723 --region=us-east4 --limit=50
~~~

### 10.1. Continuidad

La renovación de workspace coordina handoff antes del límite de conexión y permite restaurar sesiones y trabajo activo. Una interrupción ordinaria cancela el turno; los resultados ya persistidos sobreviven. La recuperación de campañas se realiza desde ResultsRepository, no desde Cloud Build.

La revisión anterior de Cloud Run puede utilizarse como referencia para revertir tráfico; un rollback de imagen no revierte automáticamente las migraciones de PostgreSQL ni la configuración del proveedor. Las operaciones de infraestructura deben conservar compatibilidad de esquema, contratos y extensión.

## 11. Fuentes de implementación

| Responsabilidad | Fuente |
|---|---|
| Build e imágenes | [cloudbuild.yaml](../../cloudbuild.yaml), [API Dockerfile](../../apps/api/Dockerfile), [Web Dockerfile](../../apps/web/Dockerfile) |
| Operación Cloud Run | [configure-api.ps1](../../ops/configure-api.ps1) |
| Configuración de build | [next.config.ts](../../apps/web/next.config.ts), [wxt.config.ts](../../apps/extension/wxt.config.ts) |
| Bootstrap y cierre | [app.ts](../../apps/api/src/bootstrap/app.ts), [server.ts](../../apps/api/src/bootstrap/server.ts) |
| DB y migración | [client.ts](../../apps/api/src/infrastructure/database/client.ts), [drizzle.config.ts](../../apps/api/drizzle.config.ts), [migrations](../../apps/api/database/migrations) |
| Object storage | [neon.ts](../../neon.ts), [documentStorage.ts](../../apps/api/src/features/profiles/documentStorage.ts) |
| Google | [managedChats.ts](../../apps/api/src/features/agents/managedChats.ts), [extractProfile.ts](../../apps/api/src/features/profiles/extractProfile.ts) |
| Workspace | [workspaceSocket.ts](../../apps/api/src/features/sessions/workspaceSocket.ts), [webOrigins.ts](../../apps/extension/lib/webOrigins.ts) |
| Paddle | [paddleClient.ts](../../apps/api/src/features/billing/paddleClient.ts) |
| Entornos | [API](../../apps/api/.env.example), [Web](../../apps/web/.env.example), [Extension](../../apps/extension/.env.example) |
| Contextos | [.dockerignore](../../.dockerignore), [.gcloudignore](../../.gcloudignore), [.gitignore](../../.gitignore) |

Los tamaños de instancias, IAM efectivo, dominios personalizados y políticas de backups son propiedades de la configuración de recursos cloud; este documento no fija valores que el repositorio no declara.
