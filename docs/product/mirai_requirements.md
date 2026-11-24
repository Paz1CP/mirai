# 02. Requirements Engineering

**Entregable:** Product Requirements Document (PRD) + Software Requirements Specification (SRS)  
**Versión:** 2.0  
**Fecha:** 24 de noviembre de 2026  
**Producto:** Mirai  
**Documento de entrada:** [01. Discovery & Business Analysis](mirai_discovery.md)  
**Documentos relacionados:** [03. Architecture & Design](../architecture/mirai_architecture.md) · [03.1. Mirai WorkFlow E2E](mirai_workflow_e2e.md) · [06. Campaigns](../features/campaigns/mirai_campaigns.md) · [07. Browser](../features/browser/mirai_browser.md) · [08. Applications](../features/applications/mirai_applications.md)

---

## 1. Purpose

Este documento convierte la visión y el alcance de Mirai en requisitos funcionales, atributos de calidad, reglas de negocio, casos de uso y criterios de aceptación verificables.

Los requisitos describen el comportamiento funcional del runtime y sus límites actuales. Cuando una capacidad está incompleta, la fila lo indica expresamente; los diseños de Figma y los planes de entrega no se interpretan como capacidades implementadas. Las decisiones de librerías, tablas y endpoints corresponden a Architecture & Design y a la documentación técnica de cada feature.

### 1.1. Convenciones

- **FR:** Functional Requirement.
- **NFR:** Non-Functional Requirement.
- **BR:** Business Rule.
- **UC:** Use Case.
- **US:** User Story.
- **E2E:** End-to-End Acceptance Scenario.
- **MUST:** condición obligatoria para aceptar el comportamiento.
- **SHOULD:** condición recomendada, con excepción justificada.

Los identificadores son estables para mantener trazabilidad entre requisitos, arquitectura, pruebas y planificación.

## 2. Product Scope

### 2.1. Dentro del alcance

1. Identidad, sesiones y ciclo de vida de cuenta.
2. Onboarding, importación de CV, perfil profesional y preferencias.
3. Biblioteca de originales, CV principal y variantes editables.
4. Chat, historial, adjuntos y actividad del agente.
5. Agente que interpreta mandatos y coordina herramientas.
6. Navegador local Chrome vinculado mediante extensión de escritorio.
7. Descubrimiento contextual y evaluación de oportunidades mediante el navegador.
8. Registro de candidaturas y resultados observados.
9. Campañas, presupuesto calculado, Stop, Resume y recuperación.
10. Dashboard, listado, detalle y filtros de resultados.
11. Acceso comercial y consumo de créditos de inferencia.

El alcance no implica que todas las acciones de portales estén completadas: la carga de archivos externos, los snapshots de documentos y la evidencia independiente del ATS no forman parte del runtime actual.

### 2.2. Fuera del alcance

- Bolsa de empleo o marketplace propio.
- Bandeja de reclutadores independiente de los canales originales.
- Cursos, coaching, mentoría o formación profesional.
- Entrevistas simuladas como núcleo de la experiencia.
- Suplantación del candidato en entrevistas, pruebas personales o verificaciones de identidad.
- Aceptación de ofertas, firma de contratos o decisiones personales en nombre del candidato.
- Garantía de entrevista, oferta o contratación.
- Automatización de fuentes que prohíban ese uso.

### 2.3. Actores

| Actor | Responsabilidad |
|---|---|
| Candidato | Aporta datos, define el mandato, concede permisos, controla campañas y atiende intervenciones |
| Agente Mirai | Interpreta instrucciones, consulta contexto, coordina herramientas y comunica resultados |
| Extensión | Vincula el navegador del candidato y transmite operaciones autorizadas |
| Portal / ATS | Presenta vacantes, formularios, verificaciones y respuestas externas |
| Reclutador | Recibe candidaturas y comunicaciones |
| Operador del servicio | Administra seguridad, soporte, continuidad y condiciones comerciales |

## 3. Functional Requirements

### 3.1. Identity & Account

| ID | Requisito |
|---|---|
| **FR-01** | El sistema deberá permitir que el candidato cree una cuenta e inicie sesión mediante los proveedores de identidad habilitados, incluido Google OAuth. |
| **FR-02** | El sistema deberá validar la identidad y la vigencia de la sesión antes de permitir acceso a datos o acciones protegidas. |
| **FR-03** | El candidato deberá poder cerrar sesión y consultar el estado de acceso de su cuenta. |
| **FR-04** | El candidato deberá poder solicitar la eliminación permanente de su cuenta mediante una confirmación explícita. La operación deberá abarcar datos personales, documentos, sesiones y recursos asociados conforme a la política de retención. |

### 3.2. Onboarding & Professional Profile

| ID | Requisito |
|---|---|
| **FR-05** | El sistema deberá aceptar CV en PDF y DOCX, validar tipo y tamaño, y comunicar errores de carga. |
| **FR-06** | El sistema deberá extraer información profesional del documento y separar los hechos identificados de los datos que requieren revisión. |
| **FR-07** | El candidato deberá poder revisar, corregir y confirmar la información extraída antes de utilizarla en candidaturas. |
| **FR-08** | El perfil deberá representar identidad profesional, experiencia, formación, proyectos, habilidades, idiomas, enlaces y datos de contacto. |
| **FR-09** | El candidato deberá poder editar su perfil sin volver a importar el documento original. |
| **FR-10** | El candidato deberá poder definir preferencias de empleo: roles, seniority, industria, modalidad, ubicación, salario, moneda, periodicidad, horario, contrato, idiomas, movilidad y patrocinio de visa. |
| **FR-11** | Cada preferencia deberá distinguir entre condición obligatoria y preferencia flexible cuando el dominio lo permita. |
| **FR-12** | El candidato deberá poder añadir reglas personalizadas de búsqueda y revisar cómo afectan el mandato. |
| **FR-13** | El candidato deberá poder conceder y revocar permisos por alcance, especialmente navegación y comunicaciones. |

### 3.3. CV Library

| ID | Comportamiento actual |
|---|---|
| FR-14 | Los originales se conservan separados del contenido estructurado y no se modifican al editar un CV derivado. El candidato puede eliminarlos desde la biblioteca. |
| FR-15 | El candidato puede crear, editar, renombrar, duplicar y eliminar variantes. |
| FR-16 | El candidato puede marcar una variante como predeterminada. Si no hay una variante marcada, el CV principal es el fallback. No existe selección persistida por campaña. |
| FR-17 | No existe historial persistente de versiones ni restauración de snapshots. revision se utiliza para concurrencia. |
| FR-18 | El candidato puede comparar dos o tres CV actuales; la comparación no muestra diferencias históricas ni restaura revisiones. |
| FR-19 | La candidatura conserva documentRefs con id y kind; no conserva revisión, contenido ni bytes inmutables del documento utilizado. |
| FR-20 | El candidato puede visualizar y descargar originales y CV renderizados; el detalle de candidatura resuelve el documento actual mientras siga disponible. |

### 3.4. Chat & Agent

| ID | Comportamiento actual |
|---|---|
| FR-21 | El candidato puede crear conversaciones, consultar historial, renombrar y eliminar conversaciones no activas. |
| FR-22 | El chat acepta instrucciones en lenguaje natural y adjuntos admitidos por los contratos. |
| FR-23 | El agente interpreta mandatos y crea campañas con título, texto, criterios y límite. Los nombres de fuentes permanecen en texto/criterios; no se normalizan en un campo sources. |
| FR-24 | El agente puede solicitar aclaraciones mediante razonamiento del modelo; no existe un motor determinista de ambigüedad. |
| FR-25 | El agente puede solicitar datos o acciones personales y registrar candidaturas pending_review. |
| FR-26 | El chat muestra actividad, fases, nombres de herramientas y CampaignSummary. Las herramientas browser_* muestran solo el nombre; sus argumentos, resultados y capturas no se exponen. |
| FR-27 | El candidato puede detener el turno con Stop, añadir instrucciones durante la ejecución y reanudar una campaña stopped con Resume. pause_task conserva una continuación que se reanuda con la respuesta solicitada. |
| FR-28 | El historial se conserva en sesiones ADK y el contexto puede compactarse. |

### 3.5. Browser & Extension

| ID | Comportamiento actual |
|---|---|
| FR-29 | El candidato puede vincular una extensión WXT desde la aplicación web de escritorio. |
| FR-30 | Chat muestra checking, connected, unavailable e incompatible, y ofrece Retry cuando corresponde. |
| FR-31 | El agente opera Chrome del candidato mediante la extensión. La pestaña controladora de Mirai queda excluida del inventario. |
| FR-32 | Las demás pestañas del perfil son visibles y pueden ser operadas por el agente. No existe clasificación ni bloqueo por pestaña personal/de trabajo. |
| FR-33 | users.account_controllers mantiene una instancia por cuenta. La interfaz ofrece Transfer; en la ruta de extensión se puede adjuntar otra página al workspace existente, mientras que la ruta web de compatibilidad sustituye la instancia. |
| FR-34 | No existe viewport de navegador ni modo Operator. La actividad de browser_* se representa por nombre de herramienta en la transcripción. |

### 3.6. Campaigns & Opportunity Discovery

| ID | Comportamiento actual |
|---|---|
| FR-35 | El agente crea campañas desde mandatos delegados y las asocia a accountId y chatSessionId. No hay formulario independiente de creación ni paso de aprobación del resumen. |
| FR-36 | Campaign conserva title, mandate, criteria, maxApplications, status, statusReason y timestamps. No tiene campo sources estructurado. |
| FR-37 | El agente puede actualizar título, mandato, criterios y límite mientras la campaña está running. Stop y Resume se controlan desde Chat; Dashboard es de consulta. |
| FR-38 | El agente descubre oportunidades mediante herramientas browser_* en el Chrome local. No existe matriz de fuentes ni enforcement determinista por portal. |
| FR-39 | No existe entidad Opportunity. Cuando se registra un resultado, applications conserva empresa, puesto, URL, plataforma, ubicación, estado, motivo, documentos y fechas. |
| FR-40 | El agente aplica restricciones obligatorias y preferencias flexibles mediante el prompt y el razonamiento del modelo; no existe motor de scoring independiente. |
| FR-41 | El agente puede registrar una oportunidad como skipped con motivo; el contrato permite que statusReason sea nulo para skipped. |
| FR-42 | applicationId es determinista por campaña, URL normalizada sin fragmento, plataforma y attemptKey. La identidad es local a la campaña; no hay deduplicación global. |
| FR-43 | El presupuesto cuenta confirmed, unconfirmed y cualquier registro con submittedAt. Se calcula después de persistir el resultado; no hay reserva previa ni gate transaccional por acción externa. |

### 3.7. Application Preparation & Submission

| ID | Comportamiento actual |
|---|---|
| FR-44 | El agente puede seleccionar un CV existente u original según la oportunidad. |
| FR-45 | El agente no crea ni adapta variantes automáticamente durante una campaña. |
| FR-46 | El agente puede navegar y completar campos de formularios. La preparación del archivo funciona, pero browser_file_upload no completa la asignación al input porque DOM.setFileInputFiles está bloqueado. |
| FR-47 | La política del agente comprueba mandato y permisos; no existe un gate backend que valide campaña y autorización antes de cada comando browser_*. |
| FR-48 | El modelo de resultados distingue intento incierto y recepción confirmada. |
| FR-49 | applications conserva estado, statusReason, URL, fechas y documentRefs. No conserva evidencia independiente. |
| FR-50 | Los estados admitidos son confirmed, unconfirmed, pending_review, failed y skipped. |
| FR-51 | El repositorio permite reconciliar registros unconfirmed y pending_review aun con campaña stopped. La consulta del portal para reconciliar depende del agente; no existe servicio automático de verificación. |
| FR-52 | No existe almacenamiento de capturas, HTML, respuesta ATS o ApplicationEvidence. La explicación del resultado se conserva en statusReason. |

### 3.8. Communication & Follow-up

| ID | Comportamiento actual |
|---|---|
| FR-53 | job_preferences.allow_communication controla la instrucción que recibe el agente y su valor predeterminado es false. No existe gate semántico por acción browser_*. |
| FR-54 | El agente puede utilizar herramientas genéricas del navegador; no existe EmailTool dedicado. |
| FR-55 | Las acciones personales se derivan al candidato mediante conversación y pending_review/pause_task. |
| FR-56 | Las comunicaciones se realizan en la interfaz del canal original; no existe bandeja paralela de reclutadores. |
| FR-57 | No existe un registro de comunicación independiente con historial de intentos e idempotencia por mensaje. |

### 3.9. Dashboard & Results

| ID | Comportamiento actual |
|---|---|
| FR-58 | Dashboard muestra conteos por estado de candidatura, conteos por estado de campaña, cinco candidaturas recientes y lista de campañas. |
| FR-59 | Applications permite buscar, filtrar por estado, ordenar y paginar. Dashboard añade filtro por campaña y selección de columnas. |
| FR-60 | El detalle muestra puesto, empresa, URL, campaña, plataforma, ubicación, estado, motivo, fechas y documentos que pueden resolverse actualmente. |
| FR-61 | Los conteos distinguen confirmed, unconfirmed, pending_review, failed y skipped. |
| FR-62 | documentRefs apunta a la biblioteca actual. Una edición cambia el contenido al que resuelve el ID; una eliminación hace que la referencia deje de mostrarse. |
| FR-63 | results.changed invalida consultas del cliente en tiempo real. La notificación local de chat se emite al completar un turno; no existe un sistema de push para cada intervención o cambio de campaña. |

### 3.10. Commercial Access & Usage

| ID | Requisito |
|---|---|
| **FR-64** | El servicio deberá comprobar el derecho de acceso comercial antes de habilitar operaciones sujetas a pago. |
| **FR-65** | El candidato deberá poder consultar saldo, créditos, movimientos, compras, vencimientos y consumo de inferencia. |
| **FR-66** | El sistema deberá registrar el consumo por tipo de operación y permitir su conciliación con el proveedor de inferencia y pagos. |
| **FR-67** | Una insuficiencia de créditos deberá detener nuevas operaciones facturables sin convertir un resultado incierto en una candidatura fallida o confirmada. |

## 4. Non-Functional Requirements

| ID | Característica | Comportamiento y límite actual |
|---|---|---|
| NFR-01 | Adecuación funcional | La elegibilidad y la compatibilidad se razonan mediante el modelo; no existe scoring determinista independiente. |
| NFR-02 | Rendimiento | La UI utiliza consultas paginadas y caché React Query; la latencia de portales e inferencia depende de servicios externos. |
| NFR-03 | Observabilidad | Billing registra consumo de inferencia por operación. Chat mantiene métricas de turno; Dashboard no atribuye costo, duración o intervenciones por campaña. |
| NFR-04 | Compatibilidad | El control del navegador tiene como objetivo Chrome de escritorio y Chromium con chrome.debugger. El build Firefox no ofrece paridad. |
| NFR-05 | Compatibilidad de fuentes | No existe una matriz versionada de compatibilidad por portal aplicada por el runtime. |
| NFR-06 | Capacidad de interacción | El mandato se define en lenguaje natural desde Chat. |
| NFR-07 | Accesibilidad | Los estados y acciones web se representan mediante etiquetas y componentes accesibles según el código de UI. |
| NFR-08 | Fiabilidad | Las escrituras de resultados son idempotentes por ID determinista dentro de una campaña; esto no garantiza deduplicación externa entre campañas. |
| NFR-09 | Fiabilidad | confirmed depende de la observación del agente; ResultsRepository no consulta el ATS para certificar recepción. |
| NFR-10 | Seguridad | Las rutas REST y repositorios aplican ownership por accountId; el chat valida la pertenencia de campaña. |
| NFR-11 | Seguridad | Los secretos de proveedores permanecen en backend; el storage privado valida ownership. |
| NFR-12 | Seguridad | El prompt trata páginas, ofertas, documentos y correos externos como datos no confiables. |
| NFR-13 | Seguridad | allow_communication se inyecta al prompt; no existe gate de autorización por cada operación browser_*. |
| NFR-14 | Mantenibilidad | Los contratos compartidos usan Zod y los repositorios usan Drizzle/PostgreSQL. |
| NFR-15 | Mantenibilidad | La semántica de campaña y candidatura se mantiene en ResultsRepository y contracts, separada del proveedor de inferencia. |
| NFR-16 | Flexibilidad | El navegador genérico permite operar páginas compatibles sin un conector específico por portal. |
| NFR-17 | Localización | La interfaz dispone de español e inglés. |
| NFR-18 | Seguridad operacional | Stop cancela la ejecución del chat; no revierte una acción externa que Chrome ya transmitió. |
| NFR-19 | Seguridad operacional | Una desconexión real del WebSocket cancela ejecuciones; cerrar solo la pestaña controladora no equivale a Stop en la ruta de extensión. |
| NFR-20 | Observabilidad | Dashboard ofrece conteos de estado y cinco resultados recientes; no agrega intentos, costos, intervenciones o tasas por campaña. |

## 5. Business Rules

| ID | Regla vigente |
|---|---|
| BR-01 | Una campaña pertenece a una única cuenta autenticada. |
| BR-02 | El mandato y el prompt delimitan la autonomía; el backend valida ownership y estado al registrar, pero no intercepta semánticamente cada acción browser_*. |
| BR-03 | La autorización del candidato no sustituye las condiciones del portal de destino. |
| BR-04 | El agente puede omitir una oportunidad que incumple una restricción obligatoria. |
| BR-05 | Las preferencias flexibles influyen en la evaluación contextual del modelo. |
| BR-06 | El agente debe fundamentar respuestas personales en información del candidato. |
| BR-07 | El agente no inventa experiencia, títulos, certificaciones, fechas, empleadores ni métricas. |
| BR-08 | El agente puede solicitar datos cuando falta información crítica. |
| BR-09 | pending_review no detiene por sí solo oportunidades independientes. |
| BR-10 | Un intento sin señal suficiente de recepción no se registra como confirmed. |
| BR-11 | Una candidatura confirmed no se degrada a unconfirmed. |
| BR-12 | Las acciones personales se derivan al candidato. |
| BR-13 | allow_communication es una política del agente y requiere permiso habilitado y solicitud expresa. |
| BR-14 | ResultsRepository solo registra nuevas candidaturas en campañas running; las campañas stopped admiten idempotencia y reconciliación de unconfirmed/pending_review. Las herramientas de navegador no consultan ese estado como gate antes de cada acción. |
| BR-15 | Cerrar la pestaña controladora no equivale a Stop. La pérdida del WebSocket del workspace cancela las ejecuciones asociadas. |
| BR-16 | Una cuenta tiene un único instance_id controlador en users.account_controllers; el workspace de extensión puede autorizar más de un puerto de página. |
| BR-17 | El ID determinista evita repetir el mismo registro dentro de una campaña; no deduplica entre campañas diferentes. |
| BR-18 | El presupuesto cuenta confirmed, unconfirmed y cualquier fila con submittedAt no nulo. No hay reserva previa ni bloqueo transaccional del envío externo. |
| BR-19 | Los estados de campaña son running, stopped, completed y failed. stopped se reanuda; completed y failed son terminales. |
| BR-20 | Las candidaturas guardan referencias documentales id/kind, no snapshots. |
| BR-21 | Los originales se separan del contenido estructurado y pueden eliminarse. No existe historial de versiones de CV. |
| BR-22 | Los resultados de candidatura son confirmed, unconfirmed, pending_review, failed y skipped. |
| BR-23 | Los cambios de perfil o mandato afectan acciones futuras; no reescriben automáticamente resultados persistidos. |
| BR-24 | Los desafíos de acceso y restricciones de portal se resuelven con intervención, omisión o detención, no con bypass. |
| BR-25 | Ninguna cuenta puede consultar perfiles, documentos, campañas, chats o resultados de otra cuenta. |
| BR-26 | Billing e identidad del resultado son dominios separados. |

## 6. State Models

### 6.1. Campaign

| Estado | Significado | Transición |
|---|---|---|
| running | Mandato en ejecución | stopped, completed o failed |
| stopped | Ejecución detenida, esperando al candidato o interrumpida | running mediante reanudación |
| completed | Mandato finalizado | Terminal |
| failed | Fallo terminal marcado por el agente | Terminal |

La ruta expuesta al agente no reabre campañas completed o failed. La respuesta a una tarea awaitingTaskInput puede reactivar la campaña stopped; una detención manual requiere Resume.

### 6.2. Application

| Estado | Significado | Consume presupuesto |
|---|---|---|
| confirmed | Señal observable de recepción | Sí |
| unconfirmed | Envío posible sin confirmación suficiente | Sí |
| pending_review | Requiere información o acción del candidato | Solo si submittedAt no es nulo |
| failed | Fallo terminal conocido | Solo si submittedAt no es nulo |
| skipped | Oportunidad omitida | Solo si submittedAt no es nulo |

El presupuesto cuenta además cualquier fila con submittedAt no nulo, independientemente del estado.

### 6.3. Browser workspace

Estados visibles: checking, connected, unavailable e incompatible. El conflicto de ownership y el estado idle son condiciones de control separadas.

### 6.4. CV

Un documento es original, principal o variante. revision detecta concurrencia; no representa un snapshot. La comparación opera sobre dos o tres CV actuales.

## 7. Use-Case Specifications

### UC-01 — Acceder y preparar el perfil

- **Actor:** candidato.
- **Flujo:** iniciar sesión → importar CV → revisar extracción → confirmar perfil y preferencias → completar onboarding.
- **Postcondición:** perfil profesional disponible para el agente.

### UC-02 — Crear una campaña

- **Actor:** candidato y agente.
- **Flujo:** describir mandato → agente interpreta objetivo, criterios y límite → createCampaign → estado running → CampaignSummary en Chat y campaña en Dashboard.
- **Límites:** no existe pantalla de aprobación del resumen ni formulario independiente de campaña.
- **Postcondición:** campaña asociada a accountId y chatSessionId.

### UC-03 — Descubrir y evaluar oportunidades

- **Actor:** agente.
- **Flujo:** consultar navegador → inspeccionar oportunidad → aplicar mandato y preferencias → consultar resultados de campaña → decidir postular, omitir o pedir revisión.
- **Límites:** no existe entidad Opportunity ni matriz de fuentes aplicada por el runtime.
- **Postcondición:** oportunidad lista para operar; solo se persiste al registrar un resultado.

### UC-04 — Preparar y registrar una candidatura

- **Actor:** agente.
- **Flujo:** seleccionar documento existente → preparar PDF/original → completar campos → observar resultado → recordApplication → actualizar presupuesto y Dashboard.
- **Límites:** DOM.setFileInputFiles está bloqueado, por lo que el upload externo no completa el flujo.
- **Postcondición:** resultado persistido con estado, motivo, URL, fechas y referencias documentales.

### UC-05 — Resolver dato o acción personal

- **Actor:** candidato.
- **Flujo:** el agente solicita información → puede registrar pending_review → si la tarea debe esperar, usa pause_task → el candidato responde → la misma tarea continúa.
- **Postcondición:** la intervención se resuelve sin detener oportunidades independientes.

### UC-06 — Gestionar comunicaciones

- **Actor:** candidato y agente.
- **Flujo:** consultar allow_communication → interpretar permiso y solicitud → utilizar interfaz web original mediante navegador genérico → derivar decisiones personales.
- **Límite:** el permiso se incorpora al prompt; no existe EmailTool ni gate por acción browser_*.

### UC-07 — Detener, reanudar y recuperar

- **Actor:** candidato o sistema.
- **Flujo:** Stop → campaña stopped → Resume explícito; o desconexión del workspace → cancelación → Dashboard recupera campaña huérfana como stopped/completed.
- **Excepción:** una respuesta a awaitingTaskInput continúa la tarea pendiente.
- **Postcondición:** la campaña queda lista para reanudación; no se reanuda automáticamente tras desconexión.

### UC-08 — Consultar resultados

- **Actor:** candidato.
- **Flujo:** abrir Dashboard/Applications → consultar conteos → filtrar y ordenar → abrir detalle → resolver documentos actuales.
- **Límites:** no se muestra evidencia independiente ni snapshot documental.
- **Postcondición:** el candidato consulta el resultado persistido.

## 8. User Stories & Acceptance Criteria

| ID | Historia | Comportamiento actual |
|---|---|---|
| US-01 | Importar mi CV | El candidato revisa y corrige los hechos extraídos antes de confirmar el perfil. |
| US-02 | Definir restricciones | El agente utiliza condiciones obligatorias y preferencias flexibles mediante razonamiento contextual. |
| US-03 | Crear campaña en lenguaje natural | El agente crea la campaña y muestra CampaignSummary; no hay formulario de aprobación independiente. |
| US-04 | Buscar en distintas fuentes | El agente navega en Chrome; la campaña no persiste un catálogo estructurado de fuentes. |
| US-05 | Elegir un documento adecuado | El agente selecciona un CV existente; no crea ni adapta variantes durante la campaña. |
| US-06 | Completar formularios | El agente puede operar campos; la carga de archivos está bloqueada por DOM.setFileInputFiles. |
| US-07 | Evitar registros repetidos | El ID estable evita repetir el mismo resultado dentro de una campaña; no deduplica entre campañas. |
| US-08 | Resolver un dato faltante | pending_review y pause_task permiten intervención sin detener oportunidades independientes. |
| US-09 | Distinguir resultados | El modelo separa confirmed, unconfirmed, pending_review, failed y skipped. |
| US-10 | Observar al agente | El chat muestra actividad y nombres de herramientas; browser_* no expone args/results ni screenshots. |
| US-11 | Utilizar mis pestañas | El agente puede operar todas las pestañas salvo la controladora de Mirai. |
| US-12 | Detener y reanudar | Stop detiene el turno; Resume reanuda una campaña stopped; una respuesta reanuda awaitingTaskInput. |
| US-13 | Recuperar una interrupción | La desconexión del workspace cancela la ejecución; Dashboard recupera campañas huérfanas sin reanudarlas. |
| US-14 | Utilizar comunicaciones autorizadas | allow_communication se incorpora al prompt; no es un gate técnico por acción. |
| US-15 | Consultar documentos asociados | La candidatura resuelve el documento actual por id/kind, no un snapshot. |
| US-16 | Transferir el control | La ruta de extensión adjunta otra página al workspace; la ruta web reemplaza la instancia de controlador. |

## 9. End-to-End Acceptance Scenarios

| ID | Recorrido documentado | Resultado actual |
|---|---|---|
| E2E-01 | Login → extensión → CV → revisión de perfil → preferencias | Perfil confirmado y workspace disponible |
| E2E-02 | Mandato → createCampaign → búsqueda | CampaignSummary y campaña running |
| E2E-03 | Misma URL/plataforma repetida dentro de una campaña | ID determinista reutilizado si attemptKey no cambia |
| E2E-04 | Oportunidad incompatible | El agente puede omitirla y registrar skipped |
| E2E-05 | Selección de CV → preparación → formulario con upload | El archivo se prepara; la asignación al input queda bloqueada |
| E2E-06 | Dato crítico ausente | pending_review y posible pausa de la tarea |
| E2E-07 | Stop → stopped → Resume | Campaña reanudada explícitamente |
| E2E-08 | Pérdida de WebSocket → cancelación → Dashboard | Campaña recuperada como stopped o completed por presupuesto |
| E2E-09 | Comunicación laboral | Política allow_communication en prompt, sin gate por acción |
| E2E-10 | Prompt injection desde portal | El prompt instruye tratar el contenido externo como no confiable |
| E2E-11 | Dos cuentas | Ownership separa perfiles, campañas, documentos y resultados |
| E2E-12 | Segunda instancia de Mirai | Transfer autoriza otra página o reemplaza la instancia según ruta |
| E2E-13 | Comparar CV | Se comparan dos o tres CV actuales; no existe historial |
| E2E-14 | Editar CV después de una candidatura | El detalle resuelve el documento actual, no un snapshot |
| E2E-15 | Límite de campaña | El presupuesto se calcula tras registrar; no existe reserva previa |
| E2E-16 | Eliminar cuenta | Se aplica el flujo de eliminación de cuenta definido en Auth |

## 10. Traceability Matrix

| Área | FR | BR | UC | E2E |
|---|---|---|---|---|
| Acceso y cuenta | 01–04 | 01, 25 | 01 | 01, 11, 16 |
| Perfil y preferencias | 05–13 | 06–09, 23 | 01, 02 | 01, 02 |
| Biblioteca de CV | 14–20 | 20, 21 | 04, 08 | 05, 13, 14 |
| Chat y agente | 21–28 | 02, 06–09 | 02–08 | 02, 06, 10 |
| Navegador y extensión | 29–34 | 14–16, 24 | 02, 07 | 07, 08, 12 |
| Campañas y búsqueda | 35–43 | 03–06, 14, 17–19 | 02, 03, 07 | 02–04, 15 |
| Postulación y resultados | 44–52 | 07–12, 17–22 | 04, 05, 08 | 05, 06, 08, 13–15 |
| Comunicación | 53–57 | 02, 13, 14, 24 | 06 | 09 |
| Dashboard | 58–63 | 10, 11, 22 | 08 | 05, 06 |
| Acceso comercial | 64–67 | 26 | 02 | 15 |

## 11. Assumptions & Decisions for Architecture

1. Chrome de escritorio y Chromium con chrome.debugger constituyen el objetivo real de ejecución.
2. El build Firefox no ofrece paridad de control del navegador.
3. La extensión controla el navegador local; el backend mantiene el agente y la orquestación.
4. La pestaña controladora está protegida; las demás pestañas del perfil son accesibles.
5. Campaigns y Applications comparten ResultsRepository.
6. Campaign conserva mandato y criterios, no una lista estructurada de fuentes.
7. Application conserva el resultado y referencias documentales actuales, no SubmissionAttempt, ApplicationEvidence ni snapshots.
8. El presupuesto se calcula desde candidaturas persistidas; no hay reserva previa.
9. allow_communication es política del agente, no autorización por acción implementada en herramientas.
10. El límite de carga de archivos se encuentra en DOM.setFileInputFiles bloqueado por la extensión.
11. El dashboard recupera campañas huérfanas cuando se solicita su resumen.
12. La economía unitaria se calcula a nivel de inferencia; Dashboard no agrega costo por candidatura o campaña.

## 12. Glossary

- **Campaign:** registro persistente de un mandato delegado.
- **Mandate:** texto que define objetivo y condiciones de búsqueda.
- **Criteria:** objeto de condiciones complementarias de campaña.
- **Application:** registro del resultado de una candidatura.
- **confirmed:** recepción observada en el destino.
- **unconfirmed:** envío posible sin confirmación suficiente.
- **pending_review:** requiere información o acción del candidato.
- **failed:** fallo terminal conocido de la operación.
- **skipped:** oportunidad omitida.
- **submittedAt:** fecha de envío declarada por el agente.
- **statusReason:** explicación del estado.
- **documentRefs:** referencias id/kind a documentos de la biblioteca.
- **attemptKey:** diferenciador utilizado para generar otra identidad de candidatura.
- **Workspace:** conexión autenticada entre web, backend y extensión.
- **Controller:** instancia propietaria del workspace.

## 13. Acceptance of the Specification

La especificación sirve como base para Architecture & Design cuando:

- Cada capacidad crítica tiene un requisito identificable.
- Las reglas de autonomía, permisos, restricciones y no invención son explícitas.
- Los estados de campaña y candidatura tienen semántica única.
- La recepción del destino se distingue del intento de envío.
- La recuperación y la deduplicación forman parte del comportamiento exigido.
- Las historias y escenarios E2E cubren los recorridos críticos.
- Los requisitos de calidad incluyen métodos de verificación y objetivos medibles.
- Las decisiones técnicas permanecen en Architecture & Design y no se mezclan con el contrato funcional.
