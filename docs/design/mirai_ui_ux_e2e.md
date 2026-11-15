# Mirai — UI/UX E2E

**Diseño:** [Mirai — Product UI E2E](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai). Aplicación autenticada, MVP desktop.

**Fuentes:** [encargo](mirai_codex_figma_e2e_prompt.md), [Design System](mirai_design_system.md), [requisitos](../02.%20Requirements%20Engineering.md) y [arquitectura](../03.%20Architecture%20%26%20Design.md).
Los datos son ficticios. Figma representa estados e interacciones; no ejecuta campañas reales.

## 1. Índice navegable

El archivo existente conserva tres páginas: [Foundations & Components](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=20-2), [Desktop Screens](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=22-2) y [Flows & QA](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2924). Se conserva el material de referencia anterior. Las familias se ordenan por nombre y estado, con rótulos de sección.

**72 frames de producto/estado**, incluido un toast: no son 72 rutas de aplicación. Los nombres identifican el estado; la sección 3 explica su propósito e interacción.

| Área | Frame Figma y estado | Tamaño |
|---|---|---|
| BROW | [BROW-04-portal-blocked](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2366) | 1440 × 900 |
| CHAT | [CHAT-01-new](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=22-3) | 1440 × 900 |
| CHAT | [CHAT-02-briefing](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-126) | 1440 × 900 |
| CHAT | [CHAT-03-searching](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-227) | 1440 × 900 |
| CHAT | [CHAT-04-applying](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=22-67) | 1440 × 900 |
| CHAT | [CHAT-05-recorded-continue](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-325) | 1440 × 900 |
| CHAT | [CHAT-06-missing-fact](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-423) | 1440 × 900 |
| CHAT | [CHAT-07-paused](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-516) | 1440 × 900 |
| CHAT | [CHAT-08-return-after-close](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-614) | 1440 × 900 |
| CHAT | [CHAT-09-extension-error](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-712) | 1440 × 900 |
| CHAT | [CHAT-10-completed](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-812) | 1440 × 900 |
| CHAT | [CHAT-11-operator-empty](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-1013) | 1600 × 900 |
| CHAT | [CHAT-11-operator-working](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=22-147) | 1600 × 900 |
| CHAT | [CHAT-12-history-expanded](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-30809) | 1440 × 900 |
| CHAT | [CHAT-12-long-context](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-912) | 1440 × 900 |
| CV | [CV-01-empty](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1311) | 1600 × 900 |
| CV | [CV-02-library](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1358) | 1600 × 900 |
| CV | [CV-03-import-error](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1486) | 1600 × 900 |
| CV | [CV-03-importing](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1439) | 1600 × 900 |
| CV | [CV-04-applied-version](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-33184) | 1600 × 900 |
| CV | [CV-04-original](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1533) | 1600 × 900 |
| CV | [CV-05-copy-saved](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-27217) | 1600 × 900 |
| CV | [CV-05-created-copy](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-26886) | 1600 × 900 |
| CV | [CV-05-edit-variant](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1591) | 1600 × 900 |
| CV | [CV-05-manual-edit](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-32998) | 1600 × 900 |
| CV | [CV-05-saved](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-26730) | 1600 × 900 |
| CV | [CV-06-copy-diff](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-27041) | 1600 × 900 |
| CV | [CV-06-diff](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1656) | 1600 × 900 |
| CV | [CV-07-compare-versions](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-27407) | 1600 × 900 |
| CV | [CV-07-restored](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-27584) | 1600 × 900 |
| CV | [CV-07-version-history](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1717) | 1600 × 900 |
| CV | [CV-08-actions](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-27981) | 1600 × 900 |
| CV | [CV-08-delete-confirmation](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1776) | 1600 × 900 |
| CV | [CV-08-deleted](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-27740) | 1600 × 900 |
| CV | [CV-08-download-feedback](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1827) | 364 × 88 |
| CV | [CV-09-select-variant](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1877) | 1600 × 900 |
| DATA | [DATA-01-empty](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-546) | 1600 × 900 |
| DATA | [DATA-02-dashboard](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-587) | 1600 × 900 |
| DATA | [DATA-03-filtered](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-694) | 1600 × 900 |
| DATA | [DATA-04-application-detail](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-769) | 1600 × 900 |
| DATA | [DATA-04-applications-explorer](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1252) | 1600 × 900 |
| DATA | [DATA-05-uncertain](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-826) | 1600 × 900 |
| DATA | [DATA-06-completed](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1145) | 1600 × 900 |
| DATA | [DATA-06-paused](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-883) | 1600 × 900 |
| DATA | [DATA-07-contact](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-990) | 1600 × 900 |
| DATA | [DATA-08-column-settings](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1088) | 1600 × 900 |
| DATA | [DATA-08-load-error](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1047) | 1600 × 900 |
| DATA | [DATA-08-loading](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-30351) | 1600 × 900 |
| PROF | [PROF-01-import-review](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1958) | 1600 × 900 |
| PROF | [PROF-02-profile](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2020) | 1600 × 900 |
| PROF | [PROF-03-correction](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2079) | 1600 × 900 |
| PROF | [PROF-03-correction-answered](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-28637) | 1600 × 900 |
| PROF | [PROF-04-preferences](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2132) | 1600 × 900 |
| PROF | [PROF-05-first-permission](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-28127) | 1600 × 900 |
| PROF | [PROF-05-permissions](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2203) | 1600 × 900 |
| PROF | [PROF-05-revoked-email](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-28385) | 1600 × 900 |
| PROF | [PROF-05-revoked-messages](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-28259) | 1600 × 900 |
| PROF | [PROF-05-revoked-portal](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-28517) | 1600 × 900 |
| QA | [QA-1366-chat-applying](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2704) | 1366 × 768 |
| QA | [QA-1366-cv-diff](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-29877) | 1366 × 768 |
| QA | [QA-1366-dashboard](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2784) | 1366 × 768 |
| X | [X-01-google-login](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2266) | 1440 × 900 |
| X | [X-01-login-error](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2281) | 1440 × 900 |
| X | [X-01-login-loading](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2273) | 1440 × 900 |
| X | [X-02-connect-extension](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2289) | 1440 × 900 |
| X | [X-03-control-transferred](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2310) | 1440 × 900 |
| X | [X-03-second-instance](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2300) | 1440 × 900 |
| X | [X-04-close-warning](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2319) | 1440 × 900 |
| X | [X-05-personal-action](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2327) | 1440 × 900 |
| X | [X-06-completion-notification](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2339) | 1440 × 900 |
| X | [X-07-service-access](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2348) | 1440 × 900 |
| X | [X-08-save-error](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2357) | 1600 × 900 |

## 2. Modelo de navegación

La sidebar de 216 px contiene Chat, Dashboard, Postulaciones, Biblioteca de CV y Perfil profesional. Nuevo chat inicia conversación; recientes permite volver al trabajo o CV. No existe Recruiter Inbox ni tab Actividad.

El chat reúne mensaje natural, actividad observable anidada, bloques generativos y compositor fijo. El navegador vinculado presenta el contexto del portal. El toggle del divisor intercambia protagonismo y posición entre ambos, conservando campaña, mensaje, documento y operación. Se diseñó Normal/Operator vacío y trabajando. El prototipo permite clic reversible y atajo O. En implementación, el control debe admitir Tab y Enter/Espacio, nombre accesible y foco visible.

Dashboard supervisa registros en una tabla. Postulaciones usa lista y detalle para explorar evidencia, documento utilizado y anotaciones pertinentes. El CV conservado con una candidatura es de solo lectura e independiente de la variante actual; Volver al registro recupera el origen.

La biblioteca separa original y variantes; el editor reúne documento, cambios y versiones. Los diálogos mantienen el contexto de fondo. Descargar muestra un toast inferior derecho con cierre y autoocultado a los cuatro segundos, sin reemplazar la pantalla.

## 3. Inventario de estados, propósito y transiciones

| Frames / entrada | UI y acciones | Transición / recuperación |
|---|---|---|
| X-01: primera visita, carga y error | Solo Google; reintento si falla | Acceso → conexión de extensión. Sin elección de proveedores. |
| X-02 / CHAT-09: navegador desconectado | Conectar o recuperar conexión | Volver al trabajo preservado; reanudación explícita cuando corresponda. |
| CV-01/03: importar | Seleccionar, validar, analizar, revisar extracción | CV vacío → análisis → PROF-01. Error: elegir otro archivo. La extracción está simulada. |
| PROF-01/02: hechos del perfil | Identidad, experiencia, proyectos, educación, habilidades, idiomas y enlaces | Revisar datos extraídos y confirmar; no exigir rellenarlos de nuevo. |
| PROF-03: dato desconocido | Pregunta breve y estado respondido; Guardar deshabilitado sin respuesta | Guardar incorpora el hecho reutilizable. Volver no lo inventa. |
| PROF-04: preferencias | Rol, modalidad, salario y restricciones reutilizables | Guardar preferencias → perfil. |
| PROF-05: primera autorización y revocaciones | Alcances de portal, mensajería y correo | Autorizar una vez → chat. Revocar por canal conserva datos y bloquea nuevas acciones de ese alcance. |
| CHAT-01/02: nueva instrucción | Bienvenida, sugerencias, adjunto; mensaje y restricciones interpretadas | Briefing → búsqueda sin aprobación rutinaria adicional. El compositor ofrece Pausar. |
| CHAT-03/04/05: ejecución | Pasos completados, operación actual y subpasos, CV y contexto de portal | Buscar → evaluar → preparar → enviar → verificar → registrar → continuar. Registrar no obliga a abrir Dashboard. |
| CHAT-06: falta un dato | Pregunta, motivo y responder/omitir; otras oportunidades siguen | Resolver mediante PROF-03 o continuar sin bloquear campaña. |
| CHAT-07/08: pausa / regreso tras cierre | Punto recuperable y Reanudar | Volver a la operación solo tras acción explícita. |
| CHAT-10 / X-06: finalización | Reporte compacto y notificación | Abrir registros o revisar pendientes; inciertas no cuentan como enviadas. |
| CHAT-11: Operator | Navegador dominante, mismo contenido y campaña | Toggle reversible en reposo y trabajando; clic o atajo O en el prototipo. |
| CHAT-12: contexto largo | Historial plegado/expandido, documento y scroll | Volver a actividad actual sin reiniciar campaña. |
| BROW-01…06 | Reposo en CHAT-01/02; búsqueda en 03; formulario en 04; intervención en BROW-04; pausa en 07/08/09; Operator en 11 | No se promete iframe universal ni actividad durante desconexión. |
| DATA-01/02/03 | Vacío; tabla; búsqueda/filtro, orden y paginación | Crear campaña desde chat; filtro incierto y limpieza de filtro. |
| DATA-04 | Lista de candidaturas y detalle con evidencia, portal y CV/version | Abrir documento conservado o enlace externo; volver al registro. |
| DATA-05 | Intento sin confirmación | Verificar en el portal; sin reenvío automático ni éxito ficticio. |
| DATA-06 | Campaña activa/pausada/terminada | Contexto operativo y acceso al chat; tabla conserva registros. |
| DATA-07 | Anotación de contacto laboral | Abrir conversación en portal/correo original; sin inbox. |
| DATA-08 | Carga, error y menú de columnas; tabla compacta con scroll por ejes | Reintentar consulta sin perder contexto. |
| CV-04 | Original protegido y versión usada en candidatura | Original: leer/descargar/crear variante. Archivo usado: leer/descargar/volver. |
| CV-05 | Variante, nombre y especialización; edición manual y guardado | Guardar/Cancelar; estados de copia creada, copia guardada y versión guardada. |
| CV-06 | Diff antes/después, adiciones, eliminaciones tachadas y contexto | Guardar versión, Descartar o Ajustar con Mirai. La copia regresa a su propio contexto. |
| CV-07 | Timeline, versión seleccionada, comparar y restaurar | Restaurar crea una versión nueva y conserva historial. |
| CV-08 | Menú, descargar, confirmar borrado y biblioteca resultante | Cancelar conserva biblioteca; borrar quita solo la variante elegida; original y otras variantes permanecen. |
| CV-09 | Elegir documento aplicable a campaña | Usar Backend Engineer → briefing. |
| X-03 | Otra ventana: Cancelar / Usar aquí | Transferencia exclusiva; la ventana anterior pierde control. |
| X-04 | Aviso al cerrar | Quedarse o pausar/cerrar; regreso en CHAT-08 con reanudación explícita. |
| X-05 / BROW-04 | Acción personal o bloqueo del portal | Motivo y acceso al sitio; no simular resolver CAPTCHA/login externo. |
| X-07 | Acceso al servicio no habilitado | Explicación y recuperación, sin precio o plan inventado. |
| X-08 | Fallo al guardar | Conservar cambios y reintentar; no declarar versión guardada. |

Los tiempos automáticos de carga y briefing facilitan la demostración; no son plazos del servicio. Formularios, búsquedas y registros son estados ilustrativos, no datos mutables de una aplicación.

## 4. Componentes reutilizables

La base nativa contiene **75 componentes**, **5 conjuntos de variantes**, **44 variables** en Mirai / Semantic y **41 estilos de texto**. Los documentos usan texto y vectores editables. Los frames de producto no contienen fondos rasterizados que sustituyan la UI.

Los controles convencionales son adaptaciones locales de patrones shadcn/ui. El kit gratuito abierto fue inspeccionado, pero la importación por biblioteca no estuvo disponible: **no son instancias importadas del kit**. En implementación se reutiliza shadcn/ui con los tokens del DS. Se continuó gratuitamente mediante Scripter y Figma Plugin API tras agotarse el conector; sin Code to Canvas ni frontend temporal.

| Componente | Fuente | Variantes / propiedades conceptuales |
|---|---|---|
| Button | Patrón shadcn, maestro local | Primary/Secondary/Ghost/Danger × Default/Hover/Focus/Disabled; label, icon, hasIcon |
| Input / Select | Patrones shadcn, maestros locales | Default/Focus/Error/Disabled; label, value, suffix, help, validation |
| Sidebar / Nav item | Sidebar + composición Mirai | Área activa, destino, icono, recientes y cuenta |
| Status | Badge + icono y texto | Confirmada, Sin confirmar, Pendiente, Fallida, Descartada |
| Composer | Textarea/Button + Mirai | Idle/Running/Paused; text, attachment, contextualAction |
| AgentStep / ExecutionLog | Mirai | Completado/activo/pendiente/pausado; children, timestamp |
| CampaignSummary | Mirai | Preparada/trabajando/pausada/completada; constraints, document, progress |
| Application row | Data Table, maestro local | Fecha/hora, empresa/inicial, rol/metadatos, portal, CV/versión, resultado, última acción; 56 px |
| Lista y detalle | ScrollArea/Card + Mirai | Selección, evidencia, resultado y documento conservado |
| Document paper / review | Mirai + Tabs/ScrollArea | Fuente/variante/antes/después; secciones y versión; página 520 × 736 |
| Version timeline | Lista/selección + Mirai | Actual/seleccionada/histórica; autor, fecha y motivo |
| Dialog / Alert / Toast / menu | Patrones shadcn, composiciones locales | Normal/advertencia/error/destructiva; título, cuerpo y acciones |
| Skeleton / viewport | Patrones shadcn | Loading/populated/empty/error; desplazamiento por eje |

Iconografía: 32 SVG outline propios y marca Mirai nativa; no se declara un pack Iconsax importado. El DS permite SVG propio como alternativa. La fuente en Figma se llama Geist y corresponde a Geist Sans.

## 5. UI generativa

Seis maestros reales en Foundations. El agente entrega datos a componentes conocidos; no HTML arbitrario ni razonamiento privado.

| Bloque | Entrada mínima | Trigger / acciones |
|---|---|---|
| CampaignSummary | campaignId, role, portals[], constraints, maxApplications, cvVersionId, state, confirmedCount? | Mandato interpretado / consultar campaña y documento |
| ExecutionLog | operationId, state, summary, timestamp, steps[{id,label,state,children?}] | Trabajo observable / plegar y expandir |
| ResultRow | applicationId, company, role, result, evidenceRef?, cvVersionId | Resultado o intento incierto / abrir registro |
| Intervention | applicationId, question, reason, inputType, options?, requiredScope? | Dato indispensable / responder, omitir, abrir acción personal |
| DocumentReview | documentId, baseVersionId, proposedRevisionId, sections[{before,after,kind}] | Adaptación / revisar, ajustar, guardar o descartar según contexto |
| CompactReport | campaignId, confirmed, uncertain, pending, failed, discarded, resultRefs[] | Finalización / consultar registros y pendientes |

Los contadores no generan mensajes nuevos por sí solos. El Dashboard recibe resultados estructurados automáticamente. Las propuestas de CV reutilizan hechos aportados; no inventan años, experiencia ni métricas.

## 6. Flujos E2E

[Mapa nativo con once recorridos](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-30989). Las flechas incluyen eventos externos representados por un estado de llegada, además de clics del prototipo.

| Recorrido | Frames y destinos | Validación |
|---|---|---|
| 01 · Ingreso, CV y primera instrucción | [X-01-google-login](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2266) → [X-02-connect-extension](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2289) → [CV-01-empty](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1311) → [CV-03-importing](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1439) → [PROF-01-import-review](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1958) → [PROF-05-first-permission](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-28127) → [CHAT-01-new](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=22-3) → [CHAT-02-briefing](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-126) | CV y perfil se extraen una vez; autorización reutilizable antes de trabajar. |
| 02 · La campaña trabaja de forma continua | [CHAT-02-briefing](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-126) → [CHAT-03-searching](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-227) → [CV-09-select-variant](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1877) → [CHAT-04-applying](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=22-67) → [CHAT-11-operator-working](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=22-147) → [CHAT-05-recorded-continue](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-325) | Buscar, filtrar, seleccionar CV, postular, registrar y continuar. |
| 03 · Confirmación y trazabilidad | [CHAT-05-recorded-continue](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-325) → [DATA-02-dashboard](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-587) → [DATA-04-application-detail](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-769) | Un resultado confirmado tiene evidencia y un CV identificable. |
| 04 · Dato pendiente sin bloquear la campaña | [CHAT-06-missing-fact](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-423) → [CHAT-05-recorded-continue](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-325) → [PROF-03-correction](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2079) → [PROF-03-correction-answered](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-28637) → [CHAT-05-recorded-continue](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-325) | La pregunta se resuelve de forma puntual mientras siguen otras oportunidades. |
| 05 · Original, variante y revisión | [CV-04-original](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1533) → [CV-05-created-copy](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-26886) → [CV-06-copy-diff](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-27041) → [CV-05-copy-saved](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-27217) → [CV-09-select-variant](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1877) → [CHAT-02-briefing](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-126) | La fuente queda intacta. Se guarda una versión reutilizable, sin copias duplicadas. |
| 06 · Pausar y reanudar | [CHAT-04-applying](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=22-67) → [CHAT-07-paused](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-516) → [CHAT-04-applying](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=22-67) | El compositor y el navegador reflejan una pausa real. |
| 07 · Cerrar y volver | [CHAT-04-applying](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=22-67) → [X-04-close-warning](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2319) → [CHAT-08-return-after-close](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-614) → [CHAT-04-applying](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=22-67) | Cerrar pausa nuevas acciones; el regreso exige una reanudación explícita. |
| 08 · Control exclusivo entre ventanas | [X-03-second-instance](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2300) → [X-03-control-transferred](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2310) → [CHAT-08-return-after-close](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-614) | La ventana anterior pierde el control al transferirlo. |
| 09 · Finalización, aviso y reporte | [X-06-completion-notification](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2339) → [CHAT-10-completed](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-812) → [DATA-06-completed](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1145) | Solo las confirmadas cuentan como enviadas; no hay métricas cosméticas. |
| 10 · Comunicación en el canal original | [PROF-05-first-permission](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-28127) → [PROF-05-permissions](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2203) → [DATA-07-contact](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-990) | Permiso reutilizable; anotación pertinente y acceso al portal o correo real. |
| 11 · Recuperación y estados inciertos | [CHAT-09-extension-error](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-712) → [X-02-connect-extension](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2289) → [BROW-04-portal-blocked](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2366) → [DATA-05-uncertain](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-826) → [X-08-save-error](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2357) | No se inventa un éxito ni se reenvía automáticamente ante incertidumbre. |

Cierre real, notificación del sistema, transferencia entre equipos y callbacks del portal se representan mediante estados y mapa; no demuestran ejecución de infraestructura real.

## 7. Reglas de interacción

- Campaña autorizada continua: buscar, preparar, enviar, verificar, registrar y seguir, sin aprobación por cada acción rutinaria. Un pendiente no bloquea las demás candidaturas.
- Enviar cambia a Pausar mientras trabaja; pausa y regreso tras cierre requieren Reanudar explícito. Cerrar detiene nuevas acciones.
- Una sola instancia controladora por cuenta entre pestañas, navegadores y equipos. Transferir revoca la anterior.
- Solo una confirmación verificable cuenta como enviada. Intento, incertidumbre, fallo y descarte permanecen distintos; no reintentar un envío incierto a ciegas.
- Comunicaciones únicamente en portal/correo autorizado, con permiso reutilizable y revocable por alcance. La anotación pertinente queda en Dashboard.
- Original inmutable; variantes persistentes sin TTL. Guardar conserva versiones; restaurar crea una nueva. Editar después no altera el archivo usado en una candidatura.
- Guardar/Cancelar para cambios manuales; conservar propuesta ante fallo. Borrar nombra el documento y exige confirmación contextual.
- Operator redistribuye la misma instancia y conserva conversación, documento, operación y posición razonable del scroll.
- El navegador es contexto vinculado de la extensión; no promete un iframe universal.
- Foco visible, nombres accesibles, estado con texto/icono y navegación Tab/Enter/Espacio/Escape son contrato de implementación. Figma no certifica semántica DOM ni lector de pantalla.

## 8. Responsive posterior

Bases 1440 × 900 y 1600 × 900. Hay composiciones de comprobación a **1366 × 768** para chat activo, Dashboard y diff: compositor fijo, mensajes desplazables, tabla con scroll por ejes y documento de diff unificado legible.

La implementación debe conservar anchura útil de documento, acceso a metadatos truncados y controles críticos fuera del contenido desplazable, sin remontar la campaña al cambiar de disposición.

**No se diseñaron pantallas móviles.** Deben resolverse después navegación, documento/diff y portal como vistas alternables. Zoom de navegador, traducciones largas y tecnologías asistivas requieren validación en el frontend implementado.

## 9. Cobertura, verificación y límites

| Requisito | Evidencia |
|---|---|
| D1 | Sidebar con las cinco áreas aprobadas |
| D2: CHAT-01…12 | Todos indexados; Operator vacío/activo y contexto largo plegado/expandido |
| D3: BROW-01…06 | Integrados en CHAT y BROW-04, según sección 3 |
| D4: DATA-01…08 | Tabla, filtro, detalle, incertidumbre, campañas, contacto, columnas, vacío/carga/error y compacto |
| D5: CV-01…09 | Fuente, variantes, importación, edición, diff, versiones/restauración, descarga/borrado y selección |
| D6 | PROF-01…05; estados respondido y revocaciones por alcance |
| D7 | X-01…08 y BROW-04 |
| E | Once recorridos con destinos en sección 6 y mapa nativo |
| G | Archivo editable existente, este handoff, DS y exportaciones nativas en qa/ |
| H | Tokens, estilos, instancias y revisión de píxeles por familias y a tamaño nativo |

La carpeta **qa/** contiene exportaciones PNG nativas de los 72 estados; overview/ reúne vistas de conjunto para inspección. El [resultado de auditoría](qa/verification.json) registra el inventario: 2 291 instancias, 919 nodos con conexiones, cero imágenes que sustituyan la UI y cero recortes involuntarios de texto. El análisis excluye miniaturas y desplazamiento intencional por eje; se comprobaron también los destinos de los once flujos y los límites de los controles interactivos. La revisión visual detectó y corrigió problemas de margen, datos y destinos, además de los recortes corregidos durante la construcción.

Se probó el prototipo real en Chrome: acceso simulado → conexión → importación → revisión de perfil → autorización → chat; bienvenida → briefing → búsqueda → postulación; Operator por clic y retorno mediante O; pausa/reanudación; fila incierta → detalle → documento conservado; aviso de descarga sobre el documento; biblioteca → original → copia; diff → guardar; historial → restaurar como nueva versión; Usar aquí → trabajo recuperable; Pausar y salir → regreso pausado; reporte → Dashboard completado. El resto de escenarios dispone de frames y mapa explícito; la inspección de esos destinos no equivale a un evento externo ejecutado.

**Límites:** entradas y registros estáticos. Backend Engineer demuestra el recorrido de documentos; Frontend y Datos son ejemplos visuales sin un editor independiente programado. Figma no sube CV reales, genera PDFs, envía mensajes, ejecuta OAuth ni automatiza portales. No se verificó backend, frontend de producción, accesibilidad DOM, Firefox real ni exclusividad entre equipos. No se compró ninguna licencia ni se creó otro archivo Figma.
