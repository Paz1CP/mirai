# 07. Control local del navegador y extensión — Documentación técnica

> **Tipo:** Técnico  
> **Alcance:** Control de Chrome desde el agente de Mirai, transporte entre backend y extensión, integración con Playwright MCP, ownership y límites de seguridad.  
> **Documento funcional:** [Browser — Business](business.md)  
> **Responsable:** Ingeniería de Mirai  
> **Última verificación:** 2026-11-24

## 1. Resumen técnico

Mirai ejecuta el agente y la orquestación de herramientas en el backend Express. Playwright MCP proporciona las definiciones y la ejecución de herramientas de navegador. Una extensión WXT en Chrome transporta las órdenes hacia las API de depuración de Chrome y devuelve resultados y eventos.

La extensión no contiene el agente, no interpreta instrucciones del usuario y no implementa un servidor MCP. Su responsabilidad es exponer una conexión autenticada con Chrome y ejecutar el protocolo de control que recibe desde el backend.

El navegador controlado es una instancia de Chrome del usuario. El backend no inicia un navegador cloud ni depende de un proveedor externo de sesiones de navegador.

## 2. Decisión arquitectónica

Mirai utiliza **Playwright MCP dentro del backend**, conectado a un adaptador propio de Chrome DevTools Protocol (CDP), y una **extensión WXT** como transporte de ejecución hacia Chrome.

La integración tiene tres límites explícitos:

1. **Agente y decisión:** el backend de Mirai determina cuándo navegar y qué herramienta invocar.
2. **Automatización:** Playwright MCP define las herramientas y utiliza Playwright para ejecutar sus operaciones.
3. **Acceso al navegador:** la extensión traduce los mensajes de Mirai a llamadas de Chrome, principalmente mediante chrome.debugger y chrome.tabs.

El servidor MCP y el endpoint CDP que utiliza Playwright son locales al proceso del backend: escuchan en loopback y usan rutas aleatorias por conexión. El tráfico de control entre el backend y el Chrome del usuario viaja por el WebSocket de workspace.

## 3. Arquitectura y componentes

~~~mermaid
flowchart TD
  UI["Next.js: ChatWorkspace / useController"]
  CONTENT["WXT content script"]
  BG["WXT background service worker"]
  API["Express: /v1/workspace"]
  SESSION["WorkspaceSocket + controllerRepository"]
  AGENT["ChatExecution + MiraiAgent / Google ADK"]
  TOOLS["createLazyPlaywrightTools"]
  MCP["Playwright MCP + MCPToolset"]
  PW["Playwright Chromium client"]
  MODEL["BrowserModel: CDP ↔ protocolo Mirai"]
  REMOTE["Extension Workspace + remoteBrowser"]
  CHROME["chrome.debugger / chrome.tabs"]
  TABS["Pestañas de Chrome del usuario"]

  UI --> CONTENT --> BG --> API
  API --> SESSION --> AGENT --> TOOLS --> MCP --> PW
  PW --> MODEL
  MODEL <--> SESSION
  SESSION <--> BG
  BG --> REMOTE --> CHROME --> TABS
~~~

### 3.1. Aplicación web

La interfaz usa el controlador de workspace para abrir la conexión de la cuenta y enviar operaciones de chat. La ruta principal solicita al content script una conexión de workspace mediante el puerto de extensión correspondiente.

Cuando la extensión no ofrece ese puerto, la aplicación conserva una ruta de compatibilidad: abre el WebSocket desde la página y usa el puente de extensión para transportar los frames del navegador. En esta ruta, el puente valida un handshake y comprueba que la extensión pueda enumerar pestañas.

La aplicación web no ejecuta Playwright ni contiene la autoridad para emitir comandos CDP directamente.

### 3.2. Extensión WXT

La extensión contiene dos entrypoints relevantes:

- **background.ts:** valida el origen y el frame de la pestaña controladora, y enruta los puertos de workspace o de navegador.
- **bridge.content.ts:** acepta mensajes únicamente desde la ventana superior de los orígenes permitidos y conecta la página con el service worker.

En la ruta principal, **workspace.ts** mantiene el WebSocket hacia el backend, autoriza los puertos de las páginas Mirai y multiplexa mensajes de chat y frames del navegador. Mantiene un controlador por cuenta y gestiona la renovación de la conexión.

**remoteBrowser.ts** recibe los comandos de navegador y ejecuta las operaciones permitidas mediante las API de Chrome.

### 3.3. Backend y control de sesión

**createWorkspaceSocket** atiende el endpoint WebSocket **/v1/workspace**. Verifica la identidad y asocia la conexión a una cuenta. En la ruta principal, cuyo WebSocket pertenece a la extensión, crea un BrowserModel por chat cuando el agente necesita navegador. En la ruta de compatibilidad iniciada desde el origen web, mantiene un binding de navegador compartido y evita que otra conversación lo utilice mientras el chat anterior sigue ejecutándose.

**controllerRepository** mantiene la propiedad del controlador en **users.account_controllers**. Usa una transacción, bloqueo de fila y advisory locks de PostgreSQL para evitar dos controladores activos para una misma cuenta y coordinar transferencias y renovaciones.

El backend distingue conexiones cuyo origen pertenece a la extensión de Chrome y conexiones originadas desde el dominio web configurado. La identidad se valida mediante el token de acceso y la cuenta declarada debe coincidir con la cuenta autenticada.

### 3.4. BrowserModel

**BrowserModel** es el adaptador entre el protocolo CDP que utiliza Playwright y el protocolo de comandos/eventos de la extensión.

Sus responsabilidades son:

- Obtener el inventario de pestañas que la extensión puede controlar.
- Adjuntar Chrome Debugger a una pestaña y obtener su target CDP.
- Mapear identificadores de pestaña de Chrome a sesiones CDP visibles para Playwright.
- Enrutar comandos CDP hacia la pestaña propietaria de cada sesión.
- Convertir eventos de Chrome en eventos CDP para el cliente Playwright.
- Mantener la pestaña seleccionada y gestionar attach, detach, cierre y sustitución de pestañas.

Solo expone targets de tipo page que Chrome puede adjuntar. Las sesiones secundarias de CDP, como workers y OOPIF, se asocian a la pestaña propietaria para enrutar sus comandos.

### 3.5. Playwright MCP

**openPlaywrightTools** crea, por invocación de chat:

1. Un directorio temporal privado para adjuntos.
2. Un servidor HTTP local en 127.0.0.1 con una ruta MCP aleatoria.
3. Un endpoint WebSocket CDP local con una ruta aleatoria.
4. Un MCPToolset de Google ADK que expone únicamente la lista permitida de herramientas de navegador.
5. Un cliente Playwright conectado con chromium.connectOverCDP al endpoint local.

El servidor MCP usa Streamable HTTP. La conexión interna entre el servidor de herramientas de Playwright y el cliente MCP utiliza InMemoryTransport. Playwright no se conecta a un navegador lanzado por el backend: se conecta al CDP relay que representa las pestañas de Chrome del usuario.

La conexión al navegador es diferida. Las definiciones de herramientas se descubren sin abrir Chrome; el BrowserModel y la conexión Playwright se utilizan cuando el agente solicita una operación de navegador.

## 4. Flujo técnico de una operación

~~~mermaid
sequenceDiagram
  participant U as Usuario
  participant WEB as Next.js
  participant EXT as Extensión WXT
  participant API as WorkspaceSocket
  participant AG as MiraiAgent
  participant MCP as Playwright MCP
  participant BM as BrowserModel
  participant CH as Chrome

  U->>WEB: Envía instrucción de navegación
  WEB->>API: chat.send
  API->>AG: Ejecuta el turno
  AG->>MCP: Invoca herramienta browser_*
  MCP->>BM: Comando CDP por WebSocket local
  BM->>API: browser.frame
  API->>EXT: Frame por WebSocket workspace
  EXT->>CH: chrome.debugger / chrome.tabs
  CH-->>EXT: Resultado o evento
  EXT-->>API: browser.frame
  API-->>BM: Respuesta de extensión
  BM-->>MCP: Respuesta CDP
  MCP-->>AG: Resultado de herramienta
  AG-->>WEB: Actividad y respuesta del turno
~~~

La extensión responde tanto a comandos como a eventos del navegador. Los frames usan contratos Zod compartidos en el paquete contracts; los frames de workspace tienen un límite de 44 MiB y cada frame de navegador tiene un límite de 32 MiB.

## 5. Herramientas expuestas al agente

Playwright MCP descubre sus definiciones y Mirai filtra el conjunto expuesto a estos nombres:

| Grupo | Herramientas |
|---|---|
| Navegación | browser_navigate, browser_navigate_back |
| Observación | browser_snapshot, browser_find, browser_take_screenshot |
| Puntero | browser_mouse_move_xy, browser_mouse_click_xy, browser_mouse_wheel |
| Interacción | browser_click, browser_type, browser_fill_form, browser_press_key, browser_select_option, browser_hover, browser_drag |
| Pestañas y espera | browser_tabs, browser_wait_for |
| Archivos y diálogos | browser_file_upload, browser_handle_dialog |

Mirai añade las herramientas propias **openBrowser** y **prepareAttachment**. openBrowser conecta Chrome para una tarea solicitada y puede navegar a una URL HTTP o HTTPS indicada. prepareAttachment genera una ruta temporal para un documento de Mirai que el agente puede adjuntar durante el turno actual.

La operación browser_tabs admite listar, seleccionar, crear y cerrar pestañas. La selección y el cierre utilizan el identificador de pestaña devuelto por el inventario de workspace.

## 6. Ciclo de vida y concurrencia

- El BrowserModel pertenece a un chat dentro de una conexión de workspace de extensión.
- La conexión Playwright se abre bajo demanda al invocar una herramienta de navegador.
- El backend admite una llamada de navegador activa por chat. Las herramientas de navegador y las herramientas de campaña pasan por una cola de ejecución del agente.
- El servidor de workspace envía heartbeats cada 20 segundos.
- Una conexión sin actividad se libera después de 10 minutos cuando no hay comandos, restauraciones ni chats en ejecución.
- El workspace solicita renovación a los 59 minutos. La extensión abre una conexión sucesora y transfiere el control mediante el identificador de instancia y el estado de los chats activos.
- La restauración de la extensión cancela comandos pendientes y libera las sesiones debugger antes de anunciar que está lista.
- Al cerrar el turno o abortar la operación, el backend cierra el cliente MCP, el cliente Playwright, el CDP relay y el directorio temporal de esa invocación. Las pestañas de Chrome no se cierran por ese motivo.

### 6.1. Timeouts

| Operación | Límite configurado |
|---|---:|
| Comandos de pestaña en BrowserModel | 4 s |
| Comandos CDP en BrowserModel | 8 s |
| Captura CDP | 10 s |
| Acción Playwright habitual | 3 s |
| Estabilización Playwright | 100 ms |
| Captura de pantalla a nivel de herramienta | 9 s |
| Presupuesto de una llamada de herramienta | 30 s |
| Espera o navegación | 55 s |
| Conexión Playwright al CDP local | 30 s |

Los comandos Page.navigate, Page.reload y Page.navigateToHistoryEntry reciben el timeout CDP de 30 segundos. La captura de pantalla utiliza su límite específico.

## 7. Seguridad y límites de control

### 7.1. Identidad y origen

- El backend acepta el origen de la extensión Chrome o el origen web configurado.
- El content script solo opera en la ventana superior de los dominios Mirai permitidos.
- El background rechaza puertos que no proceden de una pestaña superior de un origen permitido.
- El backend verifica el token de acceso y comprueba la correspondencia entre la cuenta autenticada y la cuenta solicitada.
- La propiedad del workspace se mantiene por cuenta. Una segunda instancia necesita una transferencia explícita. En la ruta de extensión, la segunda página puede adjuntarse al workspace existente mediante control.attach; en la ruta web de compatibilidad, el backend sustituye instance_id y drena la instancia anterior.

### 7.2. Pestañas y navegación

- La pestaña que aloja el controlador de Mirai queda protegida y no aparece en el inventario controlable.
- Todas las demás pestañas del perfil son visibles para el agente; no existe clasificación por pestaña personal/de trabajo ni un bloqueo de intervención por pestaña.
- La navegación admite URL HTTP y HTTPS sin credenciales embebidas. about:blank se admite como estado inicial.
- Las pestañas nuevas se crean con active: false.
- Page.bringToFront y Target.activateTarget no activan la pestaña de Chrome. Playwright puede cambiar su pestaña seleccionada sin tomar el foco de Chrome.
- El cierre de una pestaña comprueba que no pertenezca a otra conexión de Mirai.

### 7.3. Comandos CDP restringidos

La extensión rechaza comandos que modifican cookies, permisos, caché, descargas o el ciclo de vida completo del navegador, además de DOM.setFileInputFiles. Entre los métodos bloqueados se encuentran:

- Storage.setCookies y Storage.clearCookies.
- Network.clearBrowserCookies y Network.clearBrowserCache.
- Browser.grantPermissions, Browser.resetPermissions y Browser.setPermission.
- Browser.setDownloadBehavior y Browser.close.
- Target.attachToTarget, Target.activateTarget.
- Page.bringToFront y DOM.setFileInputFiles.

La creación y el cierre de pestañas pasan por operaciones específicas de chrome.tabs, controladas por BrowserModel y remoteBrowser, no por esos métodos CDP bloqueados.

### 7.4. Adjuntos

browser_file_upload aparece en la lista permitida y solo acepta rutas que prepareAttachment registra para la invocación actual. La autorización valida que todas las rutas recibidas pertenezcan a ese conjunto y limita la operación a diez archivos. El backend escribe los archivos en un directorio temporal con permisos 0600 y elimina ese directorio al cerrar la conexión de herramientas. Existe una restricción cruzada: remoteBrowser bloquea DOM.setFileInputFiles, mientras que la API de Playwright para seleccionar archivos utiliza Locator.setInputFiles. Por ello, el agente recibe la definición de browser_file_upload y el backend autoriza sus rutas, pero el límite CDP de la extensión bloquea la asignación al input. El código actual no permite afirmar que la carga de archivos de navegador complete el recorrido E2E. Referencia: [Playwright Locator.setInputFiles](https://playwright.dev/docs/api/class-locator#locator-set-input-files).

## 8. Estados y errores de conexión

| Condición | Comportamiento técnico |
|---|---|
| Workspace de extensión conectado | El WebSocket autenticado recibe control.ready; el relay de navegador se inicializa cuando llega el primer frame de navegador |
| Puente web incompatible | El handshake responde, pero la prueba extension.workspaceTabs devuelve Unknown Playwright relay command y el puente clasifica la conexión como incompatible |
| Puente web desconectado | Se cierra el puente y el controlador vuelve a comprobar la conexión; en la ruta de workspace de extensión, la pérdida del WebSocket se refleja como pérdida del workspace y el estado vuelve a checking |
| BrowserModel sin conexión lista | La herramienta devuelve BROWSER_NOT_CONNECTED |
| Herramienta no disponible | La llamada devuelve BROWSER_TOOL_UNAVAILABLE |
| Comando Chrome sin respuesta | BrowserModel genera BrowserCommandTimeout |
| WebSocket CDP cerrado durante una operación | Se aborta la operación de navegador activa |
| Controlador sustituido | El backend notifica control.lost y cierra la conexión anterior |

Una cancelación termina la espera del comando y cerca la conexión local de herramientas. Chrome no ofrece AbortSignal para chrome.debugger.sendCommand; por ello, la extensión deja de esperar y descarta respuestas tardías de comandos cancelados.

## 9. Dependencias y versiones declaradas

| Dependencia | Versión declarada | Uso |
|---|---:|---|
| @playwright/mcp | 0.0.86 | Definiciones y ejecución de herramientas MCP |
| playwright | 1.66.0-alpha-2026-11-18 | Cliente Playwright y conexión CDP |
| @modelcontextprotocol/sdk | 1.32.2 | Cliente, servidor y transportes MCP |
| @google/adk | 2.5.0 | MCPToolset y ejecución del agente |
| ws | 8.23.0 | WebSocket del backend |
| wxt | ^0.21.5 | Construcción y runtime de la extensión |

BrowserModel y remoteBrowser contienen adaptaciones de código de Microsoft Playwright en el commit 28c4b2e0ad892723c17c0b8d280207c1da670998, bajo licencia Apache 2.0.

El manifiesto Chrome declara minimum_chrome_version 118 y permisos debugger y tabs. Aunque el paquete de extensión contiene comandos de build para Firefox, la ruta de control descrita depende de chrome.debugger y de la API Chrome; este documento no atribuye control E2E equivalente a Firefox.

## 10. Límite de la interfaz de usuario

La interfaz web no representa las pestañas de Chrome en un viewport embebido.

chatEvents.visibleToolData omite los argumentos y resultados de las herramientas browser_*, openBrowser y prepareAttachment. ChatTranscript presenta la tarjeta de actividad con el nombre de la herramienta, pero no expone sus argumentos, resultado JSON ni las capturas que recibe el modelo. El agente puede comunicar un resumen textual de lo observado.

El estado de conexión de la extensión se comunica desde el controlador de workspace. En el chat, la interfaz muestra un aviso cuando el estado es unavailable o incompatible y ofrece una acción de reintento.

El diseño de navegador integrado y el modo Operator que aparecen en Figma son referencias visuales, no componentes del runtime actual.

## 11. Mapa de implementación

| Responsabilidad | Ubicación |
|---|---|
| Composición del backend | apps/api/src/bootstrap/app.ts |
| Workspace WebSocket y BrowserModel por chat | apps/api/src/features/sessions/workspaceSocket.ts |
| Control exclusivo y handoff por cuenta | apps/api/src/features/sessions/controllerRepository.ts |
| Agente y herramientas browser | apps/api/src/features/agents/miraiAgent.ts |
| Servidor MCP, CDP local y MCPToolset | apps/api/src/features/agents/playwrightTools.ts |
| Adaptador CDP / extensión | apps/api/src/features/agents/playwright/browserModel.ts |
| Contrato de comandos y eventos Chrome | apps/api/src/features/agents/playwright/protocol.ts |
| Contrato WebSocket compartido | packages/contracts/src/workspaceSocket.ts |
| Background service worker | apps/extension/entrypoints/background.ts |
| Puente desde la página web | apps/extension/entrypoints/bridge.content.ts |
| Workspace y multiplexación de extensión | apps/extension/lib/workspace.ts |
| Ejecución Chrome Debugger | apps/extension/lib/remoteBrowser.ts |
| Handshake desde Next.js | apps/web/src/features/sessions/extensionBridge.ts |
| Controlador de sesión del frontend | apps/web/src/features/sessions/useController.ts |

## 12. Glosario

| Término | Definición |
|---|---|
| CDP | Chrome DevTools Protocol, protocolo que permite inspeccionar y controlar páginas de Chrome |
| BrowserModel | Adaptador de Mirai entre CDP y los comandos/eventos de la extensión |
| Workspace | Conexión autenticada de control y eventos asociada a una cuenta |
| Controller | Instancia propietaria de la conexión activa de workspace para una cuenta |
| MCP | Model Context Protocol, contrato de herramientas que consume el agente |
| Remote browser | Transporte entre el backend y las pestañas de Chrome del usuario; no es un navegador cloud |

## 13. Documentación relacionada

[Negocio](business.md) · [Chat](../chat/technical.md) · [Agente](../agent/technical.md) · [Campañas](../campaigns/technical.md)
