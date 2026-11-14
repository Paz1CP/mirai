# Mirai — UI/UX E2E

Estado: en construcción. Este documento acompaña al diseño; no declara cobertura E2E completa.

Archivo existente: [Mirai](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai).
Sesión MCP: `4f7e07c5-a5d8-4e03-b984-d291c105fac7`.
Fuentes: [Design System](mirai_design_system.md) y [encargo](mirai_codex_figma_e2e_prompt.md).

## Índice de frames construidos

| Estado | Node ID | Propósito |
|---|---|---|
| CHAT-01-new | 22:3 | Primera conversación y adjuntar CV |
| CHAT-02-briefing | 23:126 | Mandato y autorización |
| CHAT-03-searching | 23:227 | Buscar y filtrar |
| CHAT-04-applying | 22:67 | Completar formulario sin declarar envío confirmado |
| CHAT-05-recorded-continue | 23:325 | Registro automático y continuación |
| CHAT-06-missing-fact | 23:423 | Pregunta puntual y alternativas |
| CHAT-07-paused | 23:516 | Pausa manual |
| CHAT-08-return-after-close | 23:614 | Regreso con reanudación explícita |
| CHAT-09-extension-error | 23:712 | Error accionable de extensión |
| CHAT-10-completed | 23:812 | Reporte de fin |
| CHAT-11-operator-working | 22:147 | Navegador dominante, mismo trabajo |
| CHAT-11-operator-empty | 23:1013 | Operator en reposo |
| CHAT-12-long-context | 23:912 | Historial plegable y regreso a trabajo actual |

Los enlaces se forman con `https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=22-67`, sustituyendo el ID.

## Organización y componentes

El contenido original de la página `0:1` se conserva. Página de fundamentos: `20:2`; pantallas: `22:2`.

Se crearon 36 variables locales: 19 colores, 11 espacios y 6 radios, en la colección `Mirai / Semantic`, modo Dark. Los cinco estilos usan la familia Geist disponible en Figma (Geist Sans), sin Geist Mono.

Componentes nativos construidos: cuatro botones, cinco estados de resultado, sidebar, tres compositores (Idle, Running, Paused) y seis bloques generativos. IDs raíz: Button 21:36/40/44/48; Status 21:53/57/61/65/69; Sidebar 21:75; Composer 21:106/115/124; bloques 21:133/136/139/142/145/148.

Los componentes convencionales siguen patrones shadcn/ui. Se inspeccionó el kit gratuito abierto `sJaAgWX93KZ4bMiwaLcPAF`. Su búsqueda de biblioteca devolvió resultados vacíos y dos importaciones por clave fallaron con “Component ... not found”. Estos son componentes locales creados para Mirai, no instancias importadas del kit. Los frames usan instancias reales y variables vinculadas, no capturas planas.

## Navegación e interacción

Sidebar: Chat, Dashboard, Postulaciones, Biblioteca de CV, Perfil profesional. Normal mantiene el chat dominante; Operator intercambia posición y proporción de chat/navegador. El compositor pasa de Enviar a Pausar mientras trabaja. Las incidencias técnicas se muestran solo cuando requieren acción.

La representación del portal es un ejemplo ficticio observado, no una promesa de iframe universal. La autorización de comunicaciones es reutilizable y revocable; no hay inbox interno.

## UI generativa

| Bloque | Entradas conceptuales | Trigger |
|---|---|---|
| CampaignSummary | fuentes, restricciones, máximo, CV | Mandato interpretado |
| ExecutionLog | acción observable, estado, siguiente paso | Trabajo del agente |
| Intervention | pregunta, causa, opciones | Dato indispensable ausente |
| DocumentReview | documento, versión, cambio propuesto | Edición de CV |
| ResultRow | candidatura, resultado, referencia | Resultado verificable |
| CompactReport | confirmadas, inciertas, descartadas, pendientes | Campaña terminada |

## Verificación y trabajo pendiente

Revisión visual efectuada en CHAT-04 a 1440×900 y Operator a 1600×900. Se corrigió la adaptación de textos de bloques al ancho secundario mediante Fill. La inspección estructural verificó Geist y ausencia de imágenes en los 13 frames de chat. El resto de estados requiere revisión visual y enlaces.

La cobertura actual y las revisiones que faltan se detallan a continuación. No se ha diseñado móvil ni implementado backend.
## Ampliación nativa mediante Scripter

El límite de llamadas MCP de Figma Starter se alcanzó durante la creación de la fila de datos. Se continuó por el plugin gratuito Scripter ya abierto en el archivo, usando la Figma Plugin API desde su editor. No se compró licencia ni se creó otro archivo.

La fila `Data / Application row` es el componente nativo `18:12`, con siete propiedades de texto (fecha, empresa, puesto, plataforma, CV, estado y acción). El archivo contiene ahora 52 frames de estados. Auditoría de lectura en Scripter: 1167 textos Geist, 302 instancias, cero imágenes dentro de esos frames y 323 nodos con conexiones de prototipo. No se detectó texto que excediera horizontalmente su contenedor. Esta auditoría no sustituye la revisión visual ni la validación de todas las interacciones.

| Estado | Node ID |
|---|---|
| DATA-01-empty | 18:546 |
| DATA-02-dashboard | 18:587 |
| DATA-03-filtered | 18:694 |
| DATA-04-application-detail | 18:769 |
| DATA-05-uncertain | 18:826 |
| DATA-06-paused | 18:883 |
| DATA-07-contact | 18:990 |
| DATA-08-load-error | 18:1047 |
| DATA-08-column-settings | 18:1088 |
| DATA-06-completed | 18:1145 |
| DATA-04-applications-explorer | 18:1252 |
| CV-01-empty | 18:1311 |
| CV-02-library | 18:1358 |
| CV-03-importing | 18:1439 |
| CV-03-import-error | 18:1486 |
| CV-04-original | 18:1533 |
| CV-05-edit-variant | 18:1591 |
| CV-06-diff | 18:1656 |
| CV-07-version-history | 18:1717 |
| CV-08-delete-confirmation | 18:1776 |
| CV-08-download-feedback | 18:1827 |
| CV-09-select-variant | 18:1877 |
| PROF-01-import-review | 18:1958 |
| PROF-02-profile | 18:2020 |
| PROF-03-correction | 18:2079 |
| PROF-04-preferences | 18:2132 |
| PROF-05-permissions | 18:2203 |
| X-01-google-login | 18:2266 |
| X-01-login-loading | 18:2273 |
| X-01-login-error | 18:2281 |
| X-02-connect-extension | 18:2289 |
| X-03-second-instance | 18:2300 |
| X-03-control-transferred | 18:2310 |
| X-04-close-warning | 18:2319 |
| X-05-personal-action | 18:2327 |
| X-06-completion-notification | 18:2339 |
| X-07-service-access | 18:2348 |
| X-08-save-error | 18:2357 |
| BROW-04-portal-blocked | 18:2366 |

Dashboard supervisa la campaña y ofrece trazabilidad tabular. Postulaciones utiliza una exploración por candidaturas y su detalle, evitando duplicar la tabla. El workspace de CV distingue fuente inmutable, variantes, diff e historial. Perfil separa información reutilizable, preferencias y permisos sin exigir volver a llenar todos los datos del CV.

Las conexiones nativas se construyeron con `node.reactions` y `actions`. `setReactionsAsync` dejó una promesa pendiente con un error del plugin; se detuvo esa ejecución tras verificar el fallo y se auditó que no había conexiones guardadas antes de aplicar el mecanismo compatible. El mecanismo final confirmó 323 conexiones. Se omiten destinos que son el mismo frame de origen.

## Próxima revisión de cierre

La vista CV-06-diff se inspeccionó visualmente en 1600×900: cambios añadidos/eliminados legibles y acciones diferenciadas. Dashboard también fue inspeccionado; el color success se volvió a fijar al valor aprobado mediante API nativa.

Se añadieron además `QA-1366-chat-applying` y `QA-1366-dashboard` (total actual: 54 frames). El chat compacto se revisó visualmente a 1366×768: conserva sidebar, compositor, panel vinculado y scroll del historial. El dashboard compacto dispone de viewport de tabla con scroll horizontal y contenido vertical. Su inspección visual queda pendiente. Los IDs de estos dos frames deben leerse del archivo en la siguiente auditoría.

Queda trabajo antes de cerrar el objetivo:

- Revisión visual de Dashboard compacto y familias restantes; la variante de chat 1366×768 ya fue inspeccionada.
- Verificar y completar los once recorridos E2E mediante uso del prototipo, no solo conteo de enlaces.
- Completar transiciones específicas de biblioteca/historial/descarga, filtros y permisos; los enlaces creados son la base de navegación.
- Verificar coherencia de datos ficticios: el footer se actualizó a 50 registros para incluir los descartes.
- Evitar que la confirmación de borrado simule eliminar el resto de la biblioteca; conservar original y otras variantes en el estado de resultado.
- Revisar estados de chat que reutilizan bloques: búsqueda debe describir búsqueda, y el contexto largo debe poder expandirse y desplazarse.
- Revisar toggle vacío y trabajando sin cambio de contenido ni instancia.
- Organizar y rotular componentes de fundamentos; completar variantes de foco, hover y disabled.
- Mapa explícito de los once flujos con destinos; cobertura requisito → frame y handoff final sin secciones de progreso contradictorias.
