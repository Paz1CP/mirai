# ENCARGO MAESTRO PARA CODEX — MIRAI UI/UX DESKTOP E2E EN FIGMA

**Modalidad:** ejecución integral · diseño de producto · Figma Starter/Free · sin implementación del backend.  
**Fecha de referencia:** 14 de noviembre de 2026.  
**Archivo normativo de estilo:** `mirai_design_system.md` (se entrega junto a este encargo).  
**Resultado obligatorio:** archivo Figma editable + `mirai_ui_ux_e2e.md` + actualizaciones fundamentadas al Design System, si corresponden.
** NUNCA GASTAR DINERO EN LICENCIAS DE FIGMA NI KITS DE PAGO.**

> **INSTRUCCIÓN PRINCIPAL**
>
> Actúa como **Senior Product Designer, Design Systems Engineer y UX Engineer**. Tu trabajo es diseñar **la aplicación web autenticada de Mirai completa, de extremo a extremo, en Figma**, priorizando desktop. Debe sentirse como un producto profesional listo para ser implementado. Tienes **libertad creativa real** para resolver composición, espaciado, comportamiento y presentación; respeta las decisiones fundamentales del producto, sus límites funcionales y la identidad visual aprobada. **Haz el trabajo, produce los archivos y verifica el resultado.** No termines con un plan o con pantallas incompletas.

---

## A. Contexto, materiales y precedencia

### A1. Documentos que debes leer al iniciar

Localiza en el repositorio/proyecto Mirai, en este orden:

1. `mirai_design_system.md` — identidad visual y política de componentes (**fuente principal de estilo**).
2. `01. Discovery & Business Analysis.md` — producto, valor y límites del MVP.
3. `02. Requirements Engineering.md` — requisitos, casos de uso, restricciones y escenarios E2E.
4. `03. Architecture & Design.md` — módulos, procesos, estados y mecanismos técnicos.
5. Otros documentos del repositorio que describan decisiones posteriores y explícitas del fundador.

**Regla de precedencia:** decisiones actuales de este encargo y Design System > decisiones recientes del fundador > documentos anteriores. Los requisitos de la SRS/arquitectura pueden contener conceptos **sustituidos**, especialmente identidad, almacenamiento, cierre de pestaña y bandeja de mensajes. **No resucitar funciones descartadas** al copiar listas de pantallas antiguas. Si falta un archivo, continúa con las fuentes presentes; registra la ausencia sin inventar contenido.

### A2. Referencias visuales disponibles

El fundador dejará **cuatro referencias visuales definitivas** accesibles en Chrome/Codex. Identifícalas entre las pestañas/sitios que él tenga abiertos; **no presupongas que son necesariamente las cuatro primeras**. Utiliza también las capturas aprobadas de la pantalla principal de Mirai cuando estén adjuntas o accesibles.

- **Resend** y **ChatGPT Desktop / Codex Desktop** tienen mayor peso estético.
- Las otras referencias elegidas por el fundador aportan patrones complementarios.
- La **biblioteca Figma gratuita de shadcn/ui ya abierta** es la fuente preferente de componentes.
- La documentación oficial y código de https://ui.shadcn.com/ sirven para comprobar componentes, variaciones y patrones.

**La auditoría comparativa de referencias ya fue realizada. No la repitas.** Haz solo la inspección puntual de una referencia necesaria para resolver un componente, una medida o una interacción. Usa observación visual, interfaz y fuentes públicas disponibles; **no exijas acceso al código privado de otras webs**. Si un dato no es inspeccionable, toma una decisión de diseño y sigue.

**Material visual base aprobado (si está accesible en los adjuntos/repo):** Mirai en reposo, buscando/evaluando, postulando y campaña completada. Conserva su lenguaje visual; mejóralo en función de los requisitos, sin tratar sus datos ficticios ni sus métricas ilustrativas como verdades del producto.

### A3. No expandir el producto

Mirai es un agente que, autorizado por el candidato, busca ofertas, evalúa requisitos, adapta CV, postula y realiza comunicaciones laborales rutinarias **en portales o correo**. El usuario conversa con lenguaje natural; **no redacta prompts maestros**, no rellena largos formularios si el CV ya contiene los datos y no debe aprobar cada acción rutinaria de una campaña autorizada.

**Fuera del MVP de diseño:** landing page comercial, Recruiter Inbox propio, mensajería paralela, plataforma de cursos, coaching, preparación de entrevistas, bolsa de empleo propia, porcentajes artificiales de compatibilidad, pantallas de marketing, gamificación, tab de «Actividad» independiente, formularios gigantes y dashboards llenos de métricas cosméticas.

No diseñes componentes solo para demostrar variedad visual. Cada componente debe tener una función real.

---

## B. Contratos de producto que el diseño debe respetar

Estas decisiones están cerradas y gobiernan todas las pantallas:

| Tema | Comportamiento que debe reflejar la UI |
|---|---|
| Login | **Solo continuar con Google** mediante Neon Auth/Managed Better Auth. Sin Firebase ni elección de proveedores de login. |
| Una instancia | **Una sola instancia controladora por cuenta**. Si se abre otra pestaña/navegador/incógnito/PC: modal «Mirai está abierto en otra ventana» con `Cancelar` / `Usar aquí`; transferencia exclusiva y feedback en instancia anterior. |
| Continuidad | El agente trabaja en el dispositivo del usuario mediante extensión, en pestañas secundarias. **Cerrar la pestaña de Mirai pausa las nuevas acciones**. Reanudar explícitamente al volver. |
| Autonomía | Tras autorización inicial aplicable, el agente ejecuta una campaña completa y notifica lo relevante. Pide información cuando es imprescindible; no bloquea el resto de candidaturas por una sola pendiente. |
| Instrucción natural | Ejemplo: «Aplica en LinkedIn a máximo 50 puestos Backend Engineer, 100 % remotos y salario mínimo US$1 000; usa mi especialización de backend». La UI no transforma eso en un editor de prompts. |
| Comunicaciones | Reclutadores/CEOs/contactos profesionales solo por **correo o mensajes dentro del portal autorizado**, con permiso concedido una vez y revocable. **No existe inbox interno**. |
| Seguimiento | Resultados y acciones pertinentes aparecen en un **Dashboard con tabla tipo Excel**. Registrar una postulación no interrumpe visualmente la tarea ni necesita regresar físicamente al Dashboard. |
| CV | Original intacto/inmutable. Biblioteca persistente, variantes por especialización, versiones editables, diff, restauración, vista previa, descarga y eliminación. **Sin expiración automática de CV**. |
| Estado de envío | Distinguir **confirmado, no confirmado, pendiente, fallido y descartado**; no inflar el contador de enviados. |
| Navegadores | Chromium (Chrome, Edge, Brave, Opera y compatibles) y Firefox de escritorio. El diseño gestiona permisos/conexión y diferencias solo cuando afectan la tarea. |
| Pago | El producto puede tener control de suscripción; **no inventar precio ni plan** ni dar protagonismo a facturación en la interfaz principal. |
| Infraestructura | Next.js/React, Express, Neon PostgreSQL/archivos/auth, Google Cloud Run y Vertex AI; extensión WXT. No diseñar paneles de configuración para herramientas internas. |

### B1. Principal novedad visual: Chat + navegador y toggle Operator

La pantalla principal mantiene **sidebar + chat + espacio de navegación/observación**. Existe un botón discreto pero descubrible sobre el **divisor entre chat y navegador**, identificado con un icono de intercambio:

- **Normal:** chat dominante, navegador secundario.
- **Operator:** navegador dominante, chat secundario.
- Es un **toggle de disposición sobre la misma pantalla**, sin cambiar de ruta, sin duplicar campañas, sin reiniciar el agente y sin perder información.
- Puede variar el ancho de cada panel y su posición según la mejor composición. Debe poder revertirse con un clic y funcionar con teclado.
- Debe preverse cuando el navegador está vacío, activo, bloqueado, esperando interacción y al cerrar una campaña.

**Restricción de implementación a comunicar visualmente:** no dar por hecho que un portal externo puede incrustarse como `iframe` real (políticas del sitio). La representación del navegador debe poder mapearse después a una ventana/pestaña externa vinculada, observación permitida o mecanismo equivalente; diseña la experiencia sin prometer un iframe universal.

### B2. Ejecución agente y UI generativa

- El **chat es el punto de entrada**. Mirai comunica pasos de trabajo observables, resultados y excepciones con brevedad: buscar → evaluar → preparar → enviar → registrar resultado → continuar.
- **El botón de envío en el compositor pasa a Pausar** mientras Mirai trabaja; al pausar/reanudar debe reflejar el estado real. No agregues otros botones permanentes solo para mostrar estado.
- Puede renderizar **componentes de UI generativa** dentro de la conversación: resúmenes, registros compactos, tablas, tarjetas de resultados, revisión de CV, comparaciones de versiones, pendientes con acciones y reportes. Utiliza componentes tipados y reutilizables como diseños de referencia; no depender de HTML libre generado por IA.
- Mostrar **flujo observable de acciones y decisiones resumidas**, no supuestos razonamientos internos privados del modelo.
- No crear mensajes nuevos en el chat únicamente para incrementar un contador. Los cambios de trazabilidad se reflejan como datos estructurados en el Dashboard.
- El estado técnico normal no necesita insignias persistentes como «Extensión conectada» o «Sesión activa». Mostrarlo solo si hay una incidencia accionable.

---

## C. Tecnología de diseño y presupuesto: Figma Starter/Free, US$0

**No comprar licencias, pagar kits, consumir servicios de terceros de pago ni pedir un upgrade de Figma.** Aprovecha primero los recursos existentes.

### C1. Camino principal: código temporal → Code to Canvas

**Figma Code to Canvas** está disponible en **Starter** con un cliente MCP compatible. Úsalo como ruta principal si `use_figma` de escritura no está permitido en este plan:

1. Comprueba las herramientas y permisos reales de la sesión de Codex/Figma. No asumas capacidades por el nombre del conector.
2. Si se puede escribir nativamente en Figma con permisos efectivos, aprovéchalo; en **Starter normalmente no está disponible `use_figma` para Write to Canvas**, así que no bloquees el trabajo insistiendo.
3. Construye localmente un **prototipo visual en React/Next.js + Tailwind + shadcn/ui**, con datos ficticios tipados. Es un taller de diseño **no** una implementación funcional de Mirai. Cubre las pantallas y sus estados mediante rutas, parámetros o un selector interno de estados reproducible.
4. Levanta el servidor local y captura las UI mediante `generate_figma_design` (Code to Canvas), usando el **Figma MCP remoto** y un archivo Figma editable. Conserva frames separados y ordenados de cada estado.
5. Revisa los frames importados en Figma. Son **capas editables**, pero pueden ser planas: organiza, renombra y reconstruye componentes maestros/instancias cuando los medios disponibles lo permitan. **No anuncies reutilización nativa donde solo hay capas copiadas.**

Documentación operativa: https://developers.figma.com/docs/figma-mcp-server/code-to-canvas/

### C2. Complementos, sin depender de licencias pagadas

- **Biblioteca shadcn/ui de Figma abierta por el usuario:** inspecciona y copia/reutiliza componentes gratuitos permitidos al propio archivo Mirai; idealmente crea componentes maestros locales y variantes. No necesitarás publicar librerías de equipo.
- **Scripter (plugin gratuito):** si es accesible desde la UI de Figma, úsalo para ejecutar scripts TypeScript con Figma Plugin API y crear/ajustar capas, Auto Layout, estilos, componentes o lotes repetitivos. Comprueba disponibilidad real; no presupongas un puente automático de Codex a Scripter.
- **Figma UI:** si tienes control de interfaz suficiente, realiza directamente ajustes puntuales, componentes y enlaces de prototipo.
- **`html_to_figma` oficial de Figma:** alternativa técnica opcional si está habilitada en tu conexión; no confundir con el tercero `html.to.design`, que queda **descartado**. Como Code to Canvas, puede requerir reorganizar capas.
- **No usar `html.to.design`.** No convertir el entregable final en imágenes PNG no editables.

Referencias: https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/ · https://github.com/rsms/scripter · https://ui.shadcn.com/docs/figma

### C3. Organización económica de Figma

Prioriza **un solo archivo Figma Draft/Starter**. Si aplica el límite de tres páginas del plan, organiza con:

- `00 Foundations & Components`
- `01 Desktop Screens`
- `02 Flows & QA`

Usa **secciones y nombres semánticos** para acomodar todos los frames dentro de esas páginas. Reutiliza un archivo Mirai ya existente si está disponible y es editable; **no destruyas su contenido previo**. No toques otros archivos ajenos.

---

## D. Inventario mínimo de diseño E2E

**La lista siguiente define la cobertura funcional, no la cantidad obligatoria de páginas o rutas.** Es válido resolver una necesidad mediante modal, drawer, panel embebido, tarjeta de UI generativa o estado de la pantalla existente. **Diseña todo lo que haga falta para cubrir el MVP sin multiplicar pantallas artificialmente.**

### D1. Navegación principal aprobada

La referencia de sidebar contiene:

1. **Chat** — inicio, conversaciones, instrucciones y trabajo del agente.
2. **Dashboard** — supervisión y trazabilidad tabular acumulada de campañas.
3. **Postulaciones** — exploración y detalle de candidaturas; debe aportar algo distinto de Dashboard.
4. **Biblioteca de CV** — fuentes, variantes, edición y versiones.
5. **Perfil profesional** — hechos reutilizables y preferencias del candidato.

**Sin tab «Actividad», sin Recruiter Inbox.** Si observas redundancia entre Dashboard y Postulaciones, resuélvela mediante jerarquía funcional, no con duplicación de tablas idénticas. La apariencia de sidebar podrá ajustarse, manteniendo accesibilidad y rutas claras. SI FALTA ALGUNA RUTA O FLOW O PANTALLA O COMPONENTE, PARA CUMPLIR CON LOS REQUERIMIENTOS, DEBES CREARLA; NO OMITAS NINGUNA.

### D2. Chat / pantalla principal: estados obligatorios

| ID | Situación | Contenido/interacción que debe existir |
|---|---|---|
| `CHAT-01` | Primera visita / conversación nueva | Bienvenida, compositor, adjuntos y siguiente acción sugerida sin onboarding invasivo. |
| `CHAT-02` | Conversación y briefing de campaña | Mensaje natural del usuario, respuesta breve, resumen de restricciones interpretadas y permisos aplicables. |
| `CHAT-03` | Búsqueda y evaluación | Trabajo observable; sitio, filtros obligatorios, descartes relevantes y siguiente acción. |
| `CHAT-04` | Postulación en curso | CV utilizado, formulario/operación actual, estado de envío aún sin confirmar, navegador visible. |
| `CHAT-05` | Registro y continuación | Resultado confirmado/no confirmado registrado en Dashboard de manera silenciosa; continuación a siguiente vacante. |
| `CHAT-06` | Pendiente que necesita dato | Pregunta puntual, motivo, opción de responder/omitir, continuar con otras oportunidades. |
| `CHAT-07` | Agente pausado manualmente | Estado, control Reanudar, preservación del trabajo anterior. |
| `CHAT-08` | Pestaña cerrada y posterior regreso | Aviso de pausa por cierre, punto recuperable y reanudación explícita. |
| `CHAT-09` | Error/permiso/desconexión | Explicación accionable con recuperación, sin perder datos ni declarar éxito falso. |
| `CHAT-10` | Campaña completada | Resumen final, enviados confirmados, descartes, pendientes/no confirmados y acceso natural a los registros. |
| `CHAT-11` | Vista Normal/Operator | Toggle reversible de paneles en estados vacío y trabajando. |
| `CHAT-12` | Conversación larga / contexto | Scrolling, bloques generativos expandibles, mensajes históricos, regreso a actividad actual. |

**Calidad de la UI generativa:** diseña un **catálogo de bloques reutilizables** para (i) ejecución/log de pasos, (ii) resumen de campaña, (iii) fila/lista de candidaturas, (iv) intervención, (v) vista de documento/edición sugerida, (vi) reporte compacto. Que cada bloque tenga estados pertinentes y un contrato conceptual de entrada. No generes seis widgets inventados sin escenario real.

### D3. Espacio de navegador

| ID | Estado | Especificación |
|---|---|---|
| `BROW-01` | Reposo | Zona discreta y vacía; minimizar información decorativa. |
| `BROW-02` | Buscando empleos | Portal, filtros/resultados observables y control de espacio. |
| `BROW-03` | Formulario activo | Datos relevantes y progreso de interacción, sin controles de Mirai simulando el portal. |
| `BROW-04` | Requiere intervención | Contexto de sitio, motivo y acción posible del usuario. |
| `BROW-05` | Pausado/desconectado | Estado correcto, sin simulación de actividad inexistente. |
| `BROW-06` | Operator toggle | Chat y navegador intercambian posición/proporción sin perder contenido. |

### D4. Dashboard y Postulaciones

| ID | Estado o función | Necesidad cubierta |
|---|---|---|
| `DATA-01` | Sin campañas ni registros | Empty state genuino y próximo paso claro. |
| `DATA-02` | Tabla con registros | Fecha, empresa, puesto, portal, CV/versión, estado, enlaces y acciones/mensajes profesionales pertinentes. Columnas finales propuestas por criterio de producto. |
| `DATA-03` | Buscar/filtrar/ordenar | Navegación eficiente con volumen alto, persistencia razonable del filtro. |
| `DATA-04` | Candidatura individual | Datos y evidencia, resultado confirmado/no confirmado, CV utilizado, URL origen; vínculos externos. |
| `DATA-05` | Envío incierto o duplicado | Mostrar incertidumbre y diferencia entre intento, confirmación y descarte. |
| `DATA-06` | Campaña en ejecución/terminada/pausada | Resumen útil, estados fieles, sin tablero de gráficas decorativas. |
| `DATA-07` | Registro de contacto laboral | Solo la trazabilidad estrictamente pertinente al dashboard; redirigir al portal/correo real para conversar. |
| `DATA-08` | Tabla extensa/estado vacío/error | Columnas administrables, scroll horizontal, filtros y recuperación sin romper layout. |

La UI no define todavía las columnas como contrato irrevocable; propón una configuración eficaz y documenta sus decisiones.

### D5. Biblioteca y editor de CV

| ID | Estado o función | Necesidad cubierta |
|---|---|---|
| `CV-01` | Biblioteca vacía | Importar CV fuente o iniciar variante. |
| `CV-02` | Biblioteca poblada | Original claramente distinguible de variantes por rol, búsqueda y acciones. |
| `CV-03` | Importar/analizar CV | Estado de carga, validación, extracción y errores reales. |
| `CV-04` | Vista de original | Lectura/descarga; edición bloqueada con posibilidad de crear copia/variante. |
| `CV-05` | Vista y edición de variante | Edición, guardar, renombrar, asociación a especialización. |
| `CV-06` | Mirai propone modificaciones | Diff agregado/eliminado/modificado, aprobación/ajuste según contexto, historial. |
| `CV-07` | Historial/versión/restauración | Comparar dos versiones y recuperar una anterior sin duplicados visuales. |
| `CV-08` | Descargar/eliminar | Acción contextual, confirmación destructiva, estados de éxito/error. |
| `CV-09` | Elección automática/manual | Visualización de la variante seleccionada para una vacante o campaña. |

### D6. Perfil profesional y configuración contextual

| ID | Estado o función | Necesidad cubierta |
|---|---|---|
| `PROF-01` | Perfil recién importado | Hechos extraídos del CV, secciones y necesidad de confirmar/corregir datos. |
| `PROF-02` | Perfil consolidado | Experiencia, habilidades, estudios, idiomas, proyectos, enlaces, especializaciones. |
| `PROF-03` | Dato faltante o contradictorio | Corrección puntual, procedencia y guardado. |
| `PROF-04` | Preferencias de trabajo | Ubicación, modalidad, sueldo/moneda, restricciones obligatorias y exclusiones. |
| `PROF-05` | Permisos/autorizaciones | Sitios, comunicación por correo/portales, capacidad de revisar o revocar. |

No obligues a recorrer campos que ya fueron interpretados del CV y no necesitan corrección.

### D7. Acceso y componentes transversales

| ID | Estado | Necesidad cubierta |
|---|---|---|
| `X-01` | Login con Google | Único método de acceso, carga y fallo. |
| `X-02` | Primera configuración operativa | Integración/extensión, permisos y consentimiento; preferir pasos contextuales a wizard extenso. |
| `X-03` | Segunda instancia abierta | Modal «Cancelar» / «Usar aquí» y efecto en sesión anterior. |
| `X-04` | Intención de cerrar pestaña con tarea activa | Advertencia nativa posible, texto de soporte pertinente; estado posterior de pausa. |
| `X-05` | Esperando una decisión/acción personal | Error y pendiente resueltos donde el usuario ya está trabajando. |
| `X-06` | Notificación de fin o intervención | Toast/aviso/notificación, entrada al resumen pertinente. |
| `X-07` | Estado de servicio insuficiente | Acceso no habilitado o permiso revocado; no inventar precio comercial. |
| `X-08` | Fallo de carga/guardado | Mensaje específico y recuperación verificable. |

Si estos estados funcionan mejor como **modales o piezas de un flujo existente**, no crees pantallas aisladas.

---

## E. Recorridos E2E que el prototipo debe permitir seguir

Crea un mapa de interacciones/prototipo y representa los estados críticos como frames conectables:

1. **Ingreso → CV → perfil → autorización → primera instrucción**: mínimo esfuerzo manual.
2. **Orden en lenguaje natural → agente busca → filtra → adapta CV → postula → registra → sigue**; mostrar Normal y Operator.
3. **Postulación confirmada → fila en Dashboard → detalle**; el registro no supone navegar el dashboard durante la campaña.
4. **Dato imprescindible desconocido → pendiente puntual → otras oportunidades continúan → usuario resuelve → campaña retoma lo pendiente**.
5. **CV original → crear variante Backend → modificar mediante Mirai → diff → guardar versión → reutilizar en otra campaña**.
6. **Pausa manual → reanudar**; compositor y navegador reflejan el estado.
7. **Cerrar pestaña controladora → regreso → pausa → reanudación segura**.
8. **Abrir Mirai en otra pestaña/otro navegador/dispositivo → aviso de instancia → transferir/control exclusivo**.
9. **Campaña terminada → notificación → reporte conversacional → registros**, sin paneles redundantes.
10. **Comunicación laboral autorizada → acción en portal/correo → anotación mínima en registro**; nunca bandeja propia.
11. **Error de extensión, permiso, bloqueo de portal, fallo de red o envío incierto → acción correctiva**.

El prototipo de Figma puede simular la secuencia y sus consecuencias visuales; **no implementes envíos reales a portales**. Evita fingir que los mocks demuestran viabilidad técnica de APIs externas.

---

## F. Proceso de ejecución — autonomía y disciplina

**No vuelvas a proponer conceptos alternativos de producto ni variantes visuales competitivas.** Existe una dirección aprobada. Diseña una solución coherente y completa. No pidas confirmaciones por detalles menores; toma decisiones razonables, documéntalas y avanza. Solo consulta si falta un acceso o dato imprescindible que bloquea la entrega.

### F1. Lectura y puesta en marcha

- Examina el repositorio, el estado de Figma y los recursos permitidos.
- Comprueba que el Design System y los documentos de producto están accesibles.
- Determina el archivo Figma de destino; identifica un borrador/archivo Mirai existente para continuarlo sin sobrescribir recursos útiles.
- Descubre herramientas realmente disponibles: Figma MCP remoto, Code to Canvas, biblioteca shadcn/ui, plugin Scripter y, si corresponde, control del navegador.
- Si la ruta ideal falla, cambia a otra opción gratuita sin repetir intentos indefinidamente.

### F2. Sistema base y prototipo visual

- Aplica el Design System de referencia, con libertad creativa en composición y ajustes ópticos.
- Identifica las piezas reutilizables del kit antes de inventar controles; organiza componentes locales para campos, navegación, chat, filas de tabla, diálogos y documentos cuando las herramientas lo permitan.
- En el prototipo React temporal, evita dependencias innecesarias y reutiliza la configuración existente.

### F3. Diseño desktop exhaustivo

- Prioriza **1440×900 y 1600×900** como referencias de trabajo y verifica también el caso **1366×768**. No fijar layout solo para el monitor del creador.
- Diseña las cinco áreas funcionales de navegación y sus estados, además de login/onboarding y los modales indispensables.
- Utiliza UI generativa en el chat cuando aporte valor; comparte componentes visuales con los paneles especializados.
- Diseña Normal/Operator en la misma pantalla con un toggle evidente al utilizarlo, discreto en reposo y reversible.
- Da prioridad a la **legibilidad, funcionamiento y calidad visual real** antes que a completar una lista de tarjetas.

### F4. Validación visual y funcional

- Inspecciona visualmente los resultados generados, no te limites a contar frames.
- Corrige textos cortados, columnas ilegibles, elementos superpuestos, overflow, inconsistencias de radio, iconos incoherentes y áreas con demasiado azul.
- Revisa la transición entre estados del chat y la coherencia de navegación.
- Comprueba foco y objetivos de interacción, contraste, estados no solo cromáticos y casos de contenido largo.
- Revisa que haya suficientes diseños para los recorridos E2E de la sección E.
- Si hay componentes importados como capas planas, **declara cuáles están convertidos a componentes reales y cuáles siguen siendo capas editables**. No sobreprometas.

### F5. Documentar y entregar

Al terminar, deja **un documento operativo de handoff** con enlaces a Figma y relación completa entre pantallas y estados. Actualiza el Design System solamente si existe un ajuste justificado. No reescribas tres veces la misma decisión en distintas secciones.

---

## G. Entregables precisos

### 1) Figma — `Mirai — Product UI E2E`

**Obligatorio:** enlace al archivo, editabilidad real y frames organizados por función/estado, con nombres claros (`CHAT-04-applying`, `CV-06-diff`, etc.). Incluir:

- Fundamentos y componentes/variantes reutilizados o creados.
- Todas las pantallas y estados desktop especificados en D, sin duplicar innecesariamente páginas.
- Chat con UI generativa y toggle Normal/Operator.
- Dashboard con trazabilidad, vistas de Postulaciones, biblioteca de CV/versiones, perfil y flujos de acceso/permisos.
- Prototipo enlazado para los recorridos clave o, si los enlaces interactivos no son técnicamente realizables en el plan/herramientas disponibles, **mapa de navegación explícito con destinos de frames** y explicación de lo pendiente.

### 2) `mirai_ui_ux_e2e.md` — documentación de UX/UI y handoff

**Crear en el repositorio**, con esta estructura útil y sin relleno:

1. **Índice navegable:** ruta/área, ID, frame Figma, estado, propósito.
2. **Modelo de navegación:** sidebar, chat, panel de navegador, Normal/Operator, modales/drawers.
3. **Inventario de estados:** evento de entrada, UI que aparece, acciones, transición siguiente, recuperación de errores.
4. **Componentes reutilizables:** nombre, fuente shadcn/propio, variantes, props conceptuales, estados y uso.
5. **UI generativa:** catálogo real de bloques del chat, estructura de datos mínima, triggers y acciones disponibles.
6. **Flujos E2E:** trazados por IDs y enlaces a frames; qué valida cada uno.
7. **Reglas de interacción:** pausa, concurrencia/sesión exclusiva, cierre de pestaña, registro automático, permisos y CV original inmutable.
8. **Responsive posterior:** decisiones de adaptación necesarias y riesgos, **sin fingir haber diseñado pantallas móviles si no existen**.
9. **Cobertura y pendientes:** tabla de requerimiento → pantalla/estado/frame; excepciones justificadas, limitaciones técnicas y tareas de pulido.

No duplicar íntegramente la SRS ni el Design System; **referenciarlos**.

### 3) `mirai_design_system.md` — documento maestro de estilo

Este archivo ya se entrega preparado. **Conservarlo y enriquecerlo solo si el diseño real obliga a concretar tokens, componentes o comportamientos nuevos**. Registrar modificaciones con una nota de decisión breve. No generar un DS alternativo que compita con él.

### 4) Prototipo temporal de código (solo si empleas Code to Canvas)

Conservar los archivos mínimos que permitan regenerar las pantallas y estados importados, por ejemplo en `design/code-to-canvas/`. Incluye comando de ejecución y mapa ruta/estado → frame. **No confundir este prototipo con el frontend de producción ni desarrollar backend ficticio.**

---

## H. Criterios de cierre: no declares éxito antes de verificar

Marca la tarea finalizada **solo cuando** se cumpla:

- [ ] Archivo Figma real y accesible, con contenido editable; no solo imágenes o renders.
- [ ] Pantallas y estados críticos cubiertos (sección D) mediante frames o componentes pertinentes.
- [ ] Recorridos E2E de sección E trazables por prototipo o mapa de frames.
- [ ] Aplicación consistente del Design System, con componentes editables y reutilización documentada.
- [ ] Toggle Normal/Operator documentado y visualizado sin duplicar instancia.
- [ ] Compositor transforma Enviar → Pausar cuando Mirai ejecuta; registro de actividad sin interrupción artificiosa.
- [ ] No hay Recruiter Inbox, tab Actividad, indicadores decorativos persistentes, landing comercial ni planes/precios inventados.
- [ ] `mirai_ui_ux_e2e.md` enlaza las pantallas y explica cada interacción relevante.
- [ ] Los frames han pasado una revisión visual de legibilidad, consistencia, estados y overflow.
- [ ] El cierre enumera **qué quedó realmente producido**, qué depende de una limitación comprobada y cuál es su ruta/URL exacta.

**Cierre esperado del agente:** entrega enlaces y rutas reales, inventario cuantitativo (pantallas/estados/componentes), decisiones creativas relevantes y excepciones técnicas **solo si afectaron al resultado**. Si una ruta Figma queda bloqueada, entrega el máximo material editable conseguido y explica el bloqueo; nunca anuncies que está terminado un archivo que no se creó.

---

## I. Recordatorio final para Codex

No hagas un collage genérico de shadcn ni una copia literal de otra marca. Queremos una aplicación con la calidad percibida de **Resend + ChatGPT/Codex**, con la funcionalidad y arquitectura propias de Mirai. Reutiliza lo existente, decide con criterio de diseño, ejecuta sin solicitar autorización para cada detalle y comprueba lo que produces.

**La libertad creativa está permitida; la cobertura funcional, la consistencia y la editabilidad son obligatorias.**
