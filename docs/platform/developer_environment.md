# Mirai — Developer Environment

> **Tipo:** Técnico transversal  
> **Alcance:** Herramientas locales, monorepo, configuración por aplicación, dependencias externas, comandos de desarrollo y diagnóstico.  
> **Responsable:** Ingeniería de Mirai  
> **Última verificación:** 2026-11-24

## 1. Resumen

El entorno de desarrollo de Mirai utiliza un monorepo pnpm con tres aplicaciones y dos paquetes compartidos. La API y la web se ejecutan como procesos locales independientes; la extensión se desarrolla mediante WXT en Chrome. PostgreSQL, Neon Auth, almacenamiento de objetos, Google y Paddle se conectan mediante las variables del entorno elegido.

Esta guía describe la configuración y los comandos del repositorio, sin requerir cambios de arquitectura ni copiar credenciales a código fuente.

## 2. Requisitos

| Herramienta | Referencia | Uso |
|---|---|---|
| Git | Repositorio | Clonado y control de cambios |
| Node.js 26 | Dockerfiles node:26-bookworm-slim | Runtime alineado con contenedores |
| pnpm 10.33.0 | packageManager de raíz | Workspace y scripts |
| Chrome 118+ | Manifest WXT | Control local mediante Chrome Debugger |
| Google Cloud CLI | Cloud Build y credenciales ADC | Operaciones GCP cuando corresponda |
| Docker | Dockerfiles | Build local de imágenes, opcional |
| Editor TypeScript | .vscode/launch.json | Desarrollo y depuración web |

Node 26 es la versión de referencia de las imágenes. El manifest raíz no declara una restricción engines adicional. Las versiones de dependencias se resuelven mediante pnpm-lock.yaml.

## 3. Monorepo y responsabilidades

~~~text
mirai/
  apps/
    api/                Express, dominio, runtime de agente, datos
    web/                Next.js, React, interfaz y cliente de workspace
    extension/          WXT, background, content script, relay
  packages/
    contracts/          Esquemas Zod y tipos compartidos
    cv-renderer/        Renderizado de CV en web y Node
  patches/              Parche versionado de Google ADK
  ops/                  Configuración operativa Cloud Run
  docs/                 Documentación de producto y técnica
  cloudbuild.yaml
  pnpm-workspace.yaml
  pnpm-lock.yaml
  tsconfig.base.json
  vitest.config.ts
~~~

| Paquete | Nombre pnpm | Dependencias internas |
|---|---|---|
| API | @mirai/api | contracts, cv-renderer |
| Web | @mirai/web | contracts, cv-renderer |
| Extensión | @mirai/extension | contracts |
| Contratos | @mirai/contracts | Zod |
| Renderizador | @mirai/cv-renderer | contracts, React PDF |

Los paquetes internos se resuelven con workspace:*. contracts exporta dist/index.js y dist/index.d.ts; cv-renderer exporta la superficie React y el subpath ./node. Por ello, los consumidores necesitan las salidas compiladas de los paquetes.

pnpm-workspace.yaml permite build de esbuild, fija @opentelemetry/api a 1.9.0 dentro de Google ADK y aplica patches/@google__adk@2.5.0.patch. Mantener el patch y lockfile junto a los manifests al instalar o actualizar dependencias.

## 4. Preparación local

### 4.1. Obtener el repositorio e instalar

~~~bash
git clone https://github.com/Paz1CP/mirai.git
cd mirai
npm install --global pnpm@10.33.0
pnpm install --frozen-lockfile
~~~

El acceso Git debe estar autorizado. --frozen-lockfile evita modificar el lockfile durante una instalación reproducible. Los Dockerfiles utilizan --no-frozen-lockfile como parte de su receta de build.

### 4.2. Crear archivos de entorno

Desde la raíz, en PowerShell:

~~~powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/extension/.env.example apps/extension/.env
~~~

Equivalente en Bash:

~~~bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/extension/.env.example apps/extension/.env
~~~

Realizar la copia solo cuando el archivo local no exista, para preservar la configuración existente. La API carga dotenv/config desde su directorio de trabajo; Next.js y WXT cargan sus entornos respectivos. Los comandos pnpm --filter se ejecutan en el paquete correspondiente.

No versionar valores reales. .gitignore excluye .env y .env.* salvo .env.example, además de paddle_secrets.env y salidas de build.

## 5. Configuración de API

### 5.1. HTTP e identidad

| Variable | Valor local de referencia / función |
|---|---|
| PORT | 4000 |
| WEB_ORIGIN | http://localhost:3000 |
| NEON_AUTH_BASE_URL | URL del servicio de Neon Auth correspondiente a la DB |

DATABASE_URL y NEON_AUTH_BASE_URL habilitan la composición de los dominios /v1. Si faltan, /health responde pero /v1 devuelve SERVICE_NOT_CONFIGURED. Neon Auth requiere Google OAuth configurado para el origen web utilizado; la web obtiene el JWT y la API verifica identidad y sesión contra la misma base.

### 5.2. PostgreSQL y storage

| Variable | Función |
|---|---|
| DATABASE_URL | Conexión normal de aplicación |
| DATABASE_URL_UNPOOLED | Conexión directa para workspace, borrado y operaciones de larga vida |
| DATABASE_URL_DIRECT | Alias alternativo de conexión directa admitido por código |
| AWS_ACCESS_KEY_ID | Credencial de acceso S3 |
| AWS_SECRET_ACCESS_KEY | Secreto S3 |
| AWS_ENDPOINT_URL_S3 | Endpoint compatible con S3 |
| AWS_REGION | Región del cliente; us-east-1 de referencia |
| NEON_STORAGE_BUCKET | mirai-documents por defecto |

El entorno de DB debe contener las tablas de Neon Auth compatibles con verifyIdentity. Las migraciones de Mirai definen los esquemas de dominio, no sustituyen la configuración del proveedor de autenticación.

### 5.3. Google

| Variable | Función |
|---|---|
| GOOGLE_CLOUD_PROJECT | Proyecto para extracción; ejemplo mirai-514723 |
| GOOGLE_CLOUD_LOCATION | Región de modelo; global por defecto |
| GOOGLE_ADK_AGENT_ENGINE | projects/<project>/locations/<region>/reasoningEngines/<id> |
| GOOGLE_ADK_SESSION_TTL | Retención de nuevas sesiones; 7776000s de referencia |
| GOOGLE_ADK_MODEL | Override opcional del modelo inicial de chat |
| GOOGLE_GENAI_MODEL | gemini-4-hydrogen de referencia |
| GOOGLE_GENAI_FALLBACK_MODEL | gemini-3.8-flash de referencia para extracción |

Para desarrollo con credenciales de usuario Google, configurar Application Default Credentials (ADC) desde Google Cloud CLI, cuando el proyecto y permisos lo admitan:

~~~bash
gcloud auth application-default login
gcloud auth application-default set-quota-project mirai-514723
~~~

La cuenta/identidad debe disponer de acceso a los servicios requeridos. El login de gcloud y ADC no son equivalentes. No colocar claves privadas en archivos públicos ni en NEXT_PUBLIC_*.

### 5.4. Billing

BILLING_ENVIRONMENT selecciona sandbox o live; .env.example usa sandbox. BILLING_SANDBOX_ACCOUNT_IDS permite configurar las cuentas correspondientes al entorno sandbox según la lógica de billing. Para operaciones de desarrollo utilizar credenciales, catálogo y webhooks del entorno elegido.

Por cada prefijo PADDLE_SANDBOX_ y PADDLE_LIVE_:

| Sufijo | Propósito |
|---|---|
| API_KEY | Autenticación API del proveedor |
| CLIENT_TOKEN | Token de checkout cliente |
| WEBHOOK_SECRET | Validación HMAC de eventos |
| PRODUCT_ID | Producto de créditos |
| PRICE_10, PRICE_25, PRICE_50, PRICE_100 | Precios asociados a paquetes USD |

No mezclar secretos ni identificadores entre entornos. Para recibir webhooks, el endpoint configurado en Paddle debe poder alcanzar la API y preservar el cuerpo original de la solicitud.

## 6. Configuración de Web y extensión

### 6.1. Web

~~~dotenv
API_URL=http://localhost:4000
NEXT_PUBLIC_API_ORIGIN=http://localhost:4000
NEON_AUTH_BASE_URL=
NEON_AUTH_COOKIE_SECRET=
~~~

Completar URL de Neon Auth y un secreto de cookies adecuado. El origen API público debe coincidir con el backend local. La aplicación inicia normalmente en http://localhost:3000. El proxy de autenticación controla las rutas y Google OAuth devuelve al origen de la web.

### 6.2. Extensión

~~~dotenv
WXT_WEB_ORIGIN=http://localhost:3000
WXT_API_ORIGIN=http://localhost:4000
~~~

El origen web configurado se incorpora a la lista de orígenes Mirai; webOrigins.ts selecciona el endpoint correspondiente. El content script se inyecta según los matches de origen y el background valida el emisor. Usar el mismo host en WEB_ORIGIN, WXT_WEB_ORIGIN y la página abierta; localhost y 127.0.0.1 son orígenes distintos.

## 7. Inicialización de datos

Desde la raíz del workspace:

~~~bash
pnpm --filter @mirai/api db:check
pnpm --filter @mirai/api db:migrate
pnpm --filter @mirai/api storage:check
~~~

db:check ejecuta SELECT 1 y cierra el pool. db:migrate aplica las migraciones de apps/api/database/migrations al destino seleccionado por drizzle.config.ts. Revisar el destino antes de ejecutar; no utilizar una base con datos reales para experimentos de esquema.

storage:check requiere las variables S3, crea un objeto temporal bajo setup-check/, lee y compara el contenido, y lo elimina en finally. No es una comprobación exclusivamente de lectura.

Cuando se modifica un schema Drizzle, el comando de generación es:

~~~bash
pnpm --filter @mirai/api db:generate
~~~

Revisar los SQL y metadata generados antes de aplicar una migración. Drizzle Kit busca DATABASE_URL_UNPOOLED, luego DATABASE_URL_DIRECT y después DATABASE_URL.

## 8. Arranque de desarrollo

### 8.1. Web y API

En una terminal, desde raíz:

~~~bash
pnpm dev
~~~

El script realiza:

1. Compilación de @mirai/contracts.
2. Compilación de @mirai/cv-renderer.
3. Ejecución paralela del watcher de contracts, next dev y tsx watch de la API.

El watcher de contracts actualiza dist ante cambios. cv-renderer se compila al inicio, pero no tiene script dev; volver a ejecutar su build cuando cambie.

El script raíz no inicia la extensión. Si se necesita iniciar cada componente por separado, compilar primero los paquetes internos:

~~~bash
pnpm --filter @mirai/contracts build
pnpm --filter @mirai/cv-renderer build
~~~

Luego, en terminales distintas:

~~~bash
pnpm --filter @mirai/api dev
pnpm --filter @mirai/web dev
~~~

### 8.2. Extensión

En otra terminal:

~~~bash
pnpm --filter @mirai/extension dev
~~~

WXT inicia el flujo de desarrollo Chromium. Abrir el origen web configurado en el navegador que dispone de la extensión, iniciar sesión y comprobar el estado del workspace. La extensión solicita permisos debugger y tabs. Chrome 118 o superior es la referencia del manifest.

Para empaquetar:

~~~bash
pnpm --filter @mirai/extension build
pnpm --filter @mirai/extension zip
~~~

Ambos scripts generan artefactos Chrome y Firefox. El script dev:firefox permite desarrollar el paquete Firefox; su runtime no dispone del mismo control chrome.debugger. Utilizar Chrome para los recorridos funcionales del navegador.

### 8.3. Flujo local de trabajo

~~~mermaid
flowchart TD
  Setup["Configurar env y proveedores"] --> DB["DB y storage accesibles"]
  DB --> Dev["pnpm dev: web + API + contracts"]
  Dev --> Ext["WXT dev: Chrome"]
  Ext --> Login["Login Google / Neon Auth"]
  Login --> Link["Workspace conectado"]
  Link --> Profile["Perfil y documentos"]
  Profile --> Chat["Chat y herramientas"]
  Chat --> Results["Campañas y resultados"]
~~~

El perfil y documentos aportan contexto; para utilizar el agente se requiere configuración de sesiones, inferencia y saldo aplicable. La consulta de resultados no necesita iniciar una tarea de navegador.

## 9. Comandos del workspace

| Comando | Propósito |
|---|---|
| pnpm dev | Build inicial de paquetes y watchers web/API/contracts |
| pnpm build | Build recursivo de paquetes con script build |
| pnpm lint | ESLint recursivo |
| pnpm typecheck | Build de paquetes compartidos y typecheck recursivo |
| pnpm test | Vitest run |
| pnpm test:watch | Vitest interactivo |
| pnpm format | Prettier --write de apps, packages y archivos de configuración declarados |
| pnpm format:check | Comprobación de formato sin escribir |
| pnpm check | lint → typecheck → test |

pnpm format modifica archivos; pnpm format:check no los modifica. Vitest utiliza entorno node y patrones apps/**/*.test.{ts,tsx} y packages/**/*.test.ts. Las suites de integración pueden requerir infraestructura y configuración propia; consultar sus condiciones antes de ejecutarlas. Estos comandos describen las herramientas disponibles, no resultados de ejecución.

### 9.1. Builds por paquete

| Comando | Salida / comportamiento |
|---|---|
| pnpm --filter @mirai/contracts build | dist con JS y declaraciones |
| pnpm --filter @mirai/cv-renderer build | dist del renderizador |
| pnpm --filter @mirai/api build | apps/api/dist; tsconfig.build.json |
| pnpm --filter @mirai/web build | next typegen, typecheck y next build |
| pnpm --filter @mirai/extension build | Build WXT para Chrome y Firefox |

Para ejecutar la API y web compiladas localmente se usan pnpm --filter @mirai/api start y pnpm --filter @mirai/web start, respectivamente. El script start de web usa next start; el contenedor standalone usa su server.js. Son rutas de ejecución distintas.

## 10. Depuración y diagnóstico

.vscode/launch.json define Mirai — Frontend, con Chrome apuntando a http://localhost:3000 y webRoot apps/web. Permite depurar la interfaz desde VS Code. La API se desarrolla con tsx watch; los logs aparecen en su terminal.

| Síntoma | Comprobación |
|---|---|
| /v1 devuelve SERVICE_NOT_CONFIGURED | DATABASE_URL y NEON_AUTH_BASE_URL de API |
| /health responde pero falla DB | db:check, conectividad y credenciales |
| Error de login o AUTH_REQUIRED | Configuración Neon Auth, cookies, OAuth, token y sesión DB |
| Workspace no conecta | DATABASE_URL_UNPOOLED/DIRECT, orígenes, extensión y permisos |
| Extensión unavailable/incompatible | Navegador correcto, build WXT, protocolo y Retry |
| Chats no disponibles | Formato GOOGLE_ADK_AGENT_ENGINE, ADC y acceso al recurso |
| Error de modelo/extracción | Proyecto, región, modelo, credenciales y saldo |
| Error de storage | Endpoint, bucket, credenciales y storage:check |
| BILLING_UNAVAILABLE | Entorno, API key, token cliente, producto, precio y secreto correspondientes |
| Webhook rechazado | Endpoint, cuerpo raw, firma y reloj |
| Paquete compartido no resuelve tipos | Reconstruir contracts y cv-renderer; revisar workspace |
| Cambios de CV renderer no aparecen | Reconstruir cv-renderer y recargar consumidor |

Para comprobar que la API responde:

~~~bash
curl http://localhost:4000/health
~~~

En PowerShell puede utilizarse Invoke-RestMethod. El resultado de salud no acredita acceso a los proveedores.

## 11. Límites de entorno y prácticas de trabajo

- Mantener alineados contratos, consumidores y lockfile.
- Utilizar recursos de desarrollo aislados para las operaciones de escritura y borrado.
- Evitar copiar secretos en capturas, mensajes, logs compartidos o artefactos.
- Mantener los parámetros de origen coherentes entre Web, API y extensión.
- Separar las configuraciones públicas compiladas de los secretos de ejecución.
- Al modificar comportamiento de dominio, actualizar el documento de feature correspondiente según [MIRAI_DOCUMENTATION_STANDARD](../MIRAI_DOCUMENTATION_STANDARD.md).

La configuración cloud, recetas Docker, publicación de imágenes y parámetros de servicios se describen en [Infrastructure & Deployment](infrastructure_and_deployment.md). Los controles de autenticación, ownership, datos personales y eliminación se describen en [Security & Privacy](security_and_privacy.md).

## 12. Fuentes de implementación

| Responsabilidad | Fuente |
|---|---|
| Scripts y versiones | [package.json](../../package.json), [pnpm-workspace.yaml](../../pnpm-workspace.yaml), [pnpm-lock.yaml](../../pnpm-lock.yaml) |
| Paquetes | [API](../../apps/api/package.json), [Web](../../apps/web/package.json), [Extension](../../apps/extension/package.json), [Contracts](../../packages/contracts/package.json), [CV Renderer](../../packages/cv-renderer/package.json) |
| Ejemplos env | [API](../../apps/api/.env.example), [Web](../../apps/web/.env.example), [Extension](../../apps/extension/.env.example) |
| DB | [drizzle.config.ts](../../apps/api/drizzle.config.ts), [checkConnection.ts](../../apps/api/src/infrastructure/database/checkConnection.ts) |
| Storage | [checkConnection.ts](../../apps/api/src/infrastructure/storage/checkConnection.ts), [neon.ts](../../neon.ts) |
| Arranque | [server.ts](../../apps/api/src/bootstrap/server.ts), [app.ts](../../apps/api/src/bootstrap/app.ts) |
| Config web | [next.config.ts](../../apps/web/next.config.ts), [launch.json](../../.vscode/launch.json) |
| Extensión | [wxt.config.ts](../../apps/extension/wxt.config.ts), [webOrigins.ts](../../apps/extension/lib/webOrigins.ts) |
| Herramientas | [vitest.config.ts](../../vitest.config.ts), [tsconfig.base.json](../../tsconfig.base.json), [.prettierrc.json](../../.prettierrc.json) |
| Exclusiones | [.gitignore](../../.gitignore), [.dockerignore](../../.dockerignore), [.gcloudignore](../../.gcloudignore) |
