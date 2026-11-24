# 04. Technical Delivery Planning — Mirai

**Entregable:** Implementation Plan + Backlog Structure  
**Versión:** 2.0  
**Fecha:** 24 de noviembre de 2026  
**Producto:** Mirai  
**Documentos de referencia:** [Discovery & Business Analysis](01.%20Discovery%20%26%20Business%20Analysis.md) · [Requirements Engineering](02.%20Requirements%20Engineering.md) · [Architecture & Design](03.%20Architecture%20%26%20Design.md) · [Mirai WorkFlow E2E](03.1.%20Mirai%20WorkFlow%20E2E.md)

---

## 1. Purpose

Este plan organiza el trabajo de desarrollo de Mirai en incrementos funcionales ejecutables, ordenados por dependencias, riesgo y valor de producto.

El objetivo es construir una ruta E2E coherente desde el acceso hasta una campaña capaz de descubrir, preparar, enviar, verificar y seguir candidaturas dentro de fuentes permitidas.

El plan define **qué construir primero, qué depende de qué y qué condiciones debe satisfacer cada incremento**. Los detalles de comportamiento pertenecen a Requirements Engineering; las decisiones de solución pertenecen a Architecture & Design.

## 2. Delivery Principles

1. **Vertical slices:** cada sprint debe integrar las capas necesarias para producir un resultado observable, no acumular componentes aislados.
2. **Risk first:** identidad, control del navegador, recuperación, permisos y efectos externos reciben prioridad por su impacto.
3. **Contract first:** web, API, extensión y agente comparten contratos explícitos.
4. **Evidence over activity:** un clic, una llamada o un formulario completado no sustituyen el resultado verificable.
5. **No blind retries:** las operaciones externas inciertas requieren reconciliación antes de repetir.
6. **Security throughout:** ownership, permisos, protección de datos y prompt injection forman parte de cada incremento.
7. **Quality within the sprint:** pruebas, documentación y criterios de salida acompañan cada capacidad.
8. **Source-specific compatibility:** la automatización se planifica por portal y flujo, según compatibilidad y condiciones de uso.
9. **Desktop-first:** Chrome y Chromium compatibles son el objetivo de ejecución del MVP; la experiencia móvil no forma parte de la ejecución del navegador.
10. **No speculative infrastructure:** se priorizan los componentes necesarios para los recorridos del producto antes de introducir servicios adicionales.

## 3. Delivery Scope

### 3.1. Capabilities in the plan

- Identidad, sesiones y control de cuenta.
- Conexión de extensión y ownership del navegador.
- Onboarding, extracción de CV, perfil y preferencias.
- Biblioteca de originales, variantes y versiones.
- Chat, sesiones, streaming y contexto del agente.
- Interpretación de mandatos y gestión de campañas.
- Descubrimiento y evaluación de oportunidades.
- Preparación, envío y verificación de candidaturas.
- Resultados, dashboard y evidencia.
- Pausa, reanudación, recuperación y transferencia de control.
- Comunicaciones autorizadas y derivación de acciones personales.
- Métricas de consumo y control de costos.

### 3.2. Explicit exclusions

- Aplicación móvil nativa.
- Marketplace o bolsa laboral propia.
- Bandeja de reclutadores independiente.
- Cursos, coaching y entrenamiento profesional.
- Automatización de fuentes que prohíban expresamente ese uso.
- Suplantación del candidato en entrevistas o pruebas personales.
- Infraestructura distribuida sin necesidad demostrable.

## 4. Dependency Map

La secuencia funcional será:

**Sprint 01 — Access & Browser Control**  
↓  
**Sprint 02 — Onboarding & Professional Profile**  
↓  
**Sprint 03 — CV Library & Document Lifecycle**  
↓  
**Sprint 04 — Chat, Agent & Opportunity Discovery**  
↓  
**Sprint 05 — First Application E2E & Results**  
↓  
**Sprint 06 — Autonomous Campaigns, Recovery & Communication**

Dependencias principales:

| Incremento | Depende de | Habilita |
|---|---|---|
| Sprint 01 | Contratos de identidad y workspace | Todos los flujos que requieren sesión y navegador |
| Sprint 02 | Sprint 01 | Contexto profesional y permisos |
| Sprint 03 | Sprint 02 | Selección y preparación documental |
| Sprint 04 | Sprint 01 y Sprint 02 | Mandatos, agente y descubrimiento |
| Sprint 05 | Sprint 02, Sprint 03 y Sprint 04 | Primer envío verificable y dashboard |
| Sprint 06 | Sprint 04 y Sprint 05 | Autonomía recurrente, recuperación y seguimiento |

La integración de seguridad, pruebas, observabilidad, documentación y despliegue atraviesa los seis incrementos; no se reserva para una fase final.

## 5. Sprint 01 — Access & Browser Control

### Objective

Establecer identidad, sesión, conexión con el navegador local y control exclusivo de la cuenta.

### Work Packages

**WP-01.1 — Identity**
- Definir el flujo de inicio y cierre de sesión.
- Validar JWT, issuer, audience, expiración y sesión activa.
- Aplicar ownership por cuenta en todas las rutas protegidas.
- Definir el flujo de eliminación de cuenta y revocación de sesiones.

**WP-01.2 — Extension Connection**
- Definir instalación, permisos y conexión desde la web.
- Establecer el protocolo de mensajes entre web, API y extensión.
- Implementar estados de conexión y recuperación.
- Validar orígenes y pestañas autorizadas.

**WP-01.3 — Workspace Ownership**
- Definir controlador único por cuenta.
- Gestionar heartbeat, lease, transferencia y cierre.
- Proteger la pestaña controladora.
- Evitar comandos concurrentes incompatibles.

**WP-01.4 — Browser Bridge**
- Definir el adaptador Chrome Debugger / CDP.
- Conectar BrowserModel con Playwright MCP.
- Limitar comandos, URLs, payloads y tiempos de espera.
- Separar pestañas de trabajo y pestaña de control.

### Deliverables

- Flujo de acceso y sesión.
- Extensión conectada con estado visible.
- Contrato Workspace WebSocket.
- Controlador exclusivo y transferencia.
- Adaptador de navegador con comandos tipados.
- Pruebas de conexión, desconexión, ownership y recuperación.

### Exit Criteria

- Un candidato puede iniciar sesión y conectar la extensión.
- Una instancia puede controlar el navegador de la cuenta.
- Una segunda instancia no puede ejecutar en paralelo.
- La transferencia invalida la autoridad anterior.
- La pestaña controladora permanece protegida.
- Una desconexión impide nuevas acciones y comunica el estado.
- Las pruebas negativas impiden acceso cruzado entre cuentas.

## 6. Sprint 02 — Onboarding & Professional Profile

### Objective

Convertir el CV y las respuestas del candidato en un perfil profesional estructurado, revisable y reutilizable.

### Work Packages

**WP-02.1 — Document Intake**
- Definir validación de PDF y DOCX.
- Establecer límites de tamaño y tratamiento de archivos inválidos.
- Separar documento fuente, extracción y perfil confirmado.

**WP-02.2 — Profile Extraction**
- Definir el schema de extracción.
- Extraer experiencia, educación, proyectos, habilidades, idiomas y enlaces.
- Representar campos desconocidos y ambigüedades.
- Asociar cada hecho a su fuente cuando sea posible.

**WP-02.3 — Profile Review**
- Diseñar la revisión y corrección de hechos.
- Permitir confirmar, editar y guardar el perfil.
- Evitar que una nueva extracción sobrescriba correcciones sin revisión.

**WP-02.4 — Job Preferences**
- Definir roles, seniority, industria, modalidad, ubicación, salario, horario, contrato, idiomas y movilidad.
- Separar restricciones obligatorias de preferencias flexibles.
- Incorporar reglas personalizadas.

**WP-02.5 — Permissions**
- Separar permisos de navegación y comunicación.
- Definir alcance, vigencia, consulta y revocación.
- Exigir autorización aplicable antes de una acción externa.

### Deliverables

- Flujo de importación y revisión.
- Modelo de perfil y preferencias.
- Interfaz de edición.
- Permisos por alcance.
- Pruebas de extracción, corrección, persistencia y revocación.

### Exit Criteria

- El candidato puede importar un documento válido y revisar los hechos.
- El perfil conserva correcciones manuales.
- Los datos desconocidos no se inventan.
- Las preferencias obligatorias se distinguen de las flexibles.
- Los permisos pueden consultarse y revocarse.
- El agente puede consultar contexto profesional bajo ownership.

## 7. Sprint 03 — CV Library & Document Lifecycle

### Objective

Organizar originales, CV principal, variantes y versiones para reutilización segura en candidaturas.

### Work Packages

**WP-03.1 — Original Documents**
- Definir registro y almacenamiento de originales.
- Mantener ownership y acceso privado.
- Incorporar limpieza de temporales y eliminación.

**WP-03.2 — CV Library**
- Definir CV principal y variantes.
- Permitir crear, duplicar, renombrar, editar, seleccionar y eliminar variantes.
- Mantener un documento predeterminado.

**WP-03.3 — Version History**
- Definir snapshots inmutables por variante.
- Registrar número, fecha, origen y motivo.
- Separar revisión de concurrencia e historial de versiones.
- Permitir comparación y restauración como nueva versión.

**WP-03.4 — Document Rendering**
- Definir renderizado de PDF y previsualización.
- Mantener consistencia entre documento editable y archivo enviado.
- Validar fuentes, saltos, tablas y contenido largo.

**WP-03.5 — Application Snapshot Contract**
- Definir la referencia inmutable al documento utilizado en cada candidatura.
- Evitar que una edición posterior altere el documento histórico.
- Establecer lectura y descarga desde el detalle de candidatura.

### Deliverables

- Biblioteca de originales y variantes.
- Editor y flujo de comparación.
- Modelo de versiones.
- Renderizador de documentos.
- Contrato de snapshot documental por candidatura.
- Pruebas de integridad, concurrencia, restauración y descarga.

### Exit Criteria

- El original permanece inmutable.
- Una variante puede editarse sin modificar el original.
- Cada guardado genera una versión identificable.
- Restaurar produce una nueva versión.
- El documento asociado a una candidatura no cambia después de su registro.
- La previsualización y el archivo exportado mantienen el mismo contenido.

## 8. Sprint 04 — Chat, Agent & Opportunity Discovery

### Objective

Permitir que el candidato defina un mandato en lenguaje natural y que el agente descubra oportunidades mediante herramientas controladas.

### Work Packages

**WP-04.1 — Managed Chat**
- Definir creación, listado, historial y recuperación de conversaciones.
- Integrar streaming de eventos y estados visibles.
- Gestionar adjuntos y mensajes encolados.

**WP-04.2 — Agent Runtime**
- Definir instrucciones, contexto y scope de ejecución.
- Integrar Google ADK, sesiones administradas y proveedor de inferencia.
- Establecer herramientas de dominio tipadas.
- Diseñar compactación de contexto sin pérdida del mandato.

**WP-04.3 — Campaign Mandate**
- Interpretar roles, fuentes, restricciones, preferencias y límites.
- Mostrar un resumen legible antes de iniciar.
- Solicitar aclaración cuando una ambigüedad afecte elegibilidad o autorización.
- Definir creación, actualización, pausa y finalización de campañas.

**WP-04.4 — Opportunity Discovery**
- Conectar herramientas Playwright MCP con el workspace.
- Definir navegación, snapshots, capturas y formularios.
- Capturar datos de vacantes y origen.
- Construir matriz de fuentes y condiciones de uso.

**WP-04.5 — Evaluation & Deduplication**
- Aplicar restricciones obligatorias.
- Evaluar preferencias flexibles.
- Detectar oportunidades repetidas.
- Conservar razones de inclusión y exclusión.

### Deliverables

- Chat funcional con historial y streaming.
- Runtime del agente y herramientas de dominio.
- Modelo de campaña y mandato.
- Flujo de descubrimiento.
- Evaluación de oportunidades y deduplicación.
- Pruebas de prompt injection, filtros y fuentes.

### Exit Criteria

- El candidato define una campaña mediante lenguaje natural.
- El mandato estructurado refleja la instrucción confirmada.
- El agente consulta perfil, preferencias y CV con ownership.
- El navegador opera mediante herramientas autorizadas.
- Las restricciones obligatorias excluyen oportunidades incompatibles.
- Las oportunidades repetidas no se procesan dos veces.
- Una fuente no permitida queda excluida con motivo.
- Ninguna candidatura se envía todavía como parte de este incremento.

## 9. Sprint 05 — First Application E2E & Results

### Objective

Completar el primer flujo vertical de candidatura desde una oportunidad elegible hasta un resultado consultable y verificable.

### Work Packages

**WP-05.1 — Application Preparation**
- Seleccionar documento y snapshot.
- Preparar respuestas con procedencia de datos.
- Validar campos desconocidos y permisos.

**WP-05.2 — Form Execution**
- Definir navegación por formularios.
- Completar campos y adjuntar documentos.
- Manejar pasos, errores y cambios de página.
- Respetar condiciones de acceso de la fuente.

**WP-05.3 — Submission & Verification**
- Separar intención, intento, envío y confirmación.
- Definir idempotency keys.
- Registrar señal de recepción y evidencia.
- Clasificar resultados confirmed, unconfirmed, pending_review, failed y skipped.

**WP-05.4 — Applications & Dashboard**
- Crear listado y detalle de candidaturas.
- Implementar filtros, búsqueda, orden y paginación.
- Presentar evidencia, motivo y documento utilizado.
- Agregar resumen por campaña.

**WP-05.5 — Reconciliation**
- Definir tratamiento de timeout y desconexión durante envío.
- Consultar destino antes de reintentar.
- Reservar límite para resultados inciertos.

### Deliverables

- Un flujo E2E sobre una fuente permitida.
- Registro de candidatura y estado.
- Evidencia de recepción.
- Detalle de candidatura y dashboard.
- Mecanismo de deduplicación y reconciliación.
- Pruebas de envío confirmado, incierto, fallido y duplicado.

### Exit Criteria

- Una candidatura elegible puede recorrer preparación, formulario, envío y verificación.
- El documento enviado coincide con el snapshot seleccionado.
- Solo una señal verificable produce confirmed.
- Un resultado incierto queda unconfirmed.
- Una falla terminal queda failed con motivo.
- No se repite un envío por timeout o recuperación.
- El dashboard refleja el registro persistido.
- El flujo no depende de un único estado visual o texto del modelo.

## 10. Sprint 06 — Autonomous Campaigns, Recovery & Communication

### Objective

Coordinar múltiples candidaturas y fuentes dentro de una campaña recurrente, con límites, recuperación, comunicación autorizada y reporte final.

### Work Packages

**WP-06.1 — Campaign Orchestration**
- Coordinar descubrimiento, evaluación, preparación, envío y seguimiento.
- Respetar máximo de candidaturas y reservas inciertas.
- Permitir que pendientes independientes no bloqueen el resto.

**WP-06.2 — Pause & Resume**
- Implementar pausa manual y reanudación explícita.
- Detener nuevas acciones al cerrar la pestaña controladora.
- Preservar estado y checkpoints.

**WP-06.3 — Recovery**
- Recuperar después de desconexión, suspensión o reinicio.
- Reconciliar operaciones externas.
- Restaurar ownership del workspace.
- Evitar reenvíos ciegos.

**WP-06.4 — Human Intervention**
- Solicitar datos desconocidos.
- Derivar verificaciones personales y acciones indelegables.
- Mantener el contexto de la candidatura.
- Permitir omitir una oportunidad sin cancelar la campaña.

**WP-06.5 — Communication**
- Consultar canales autorizados.
- Responder comunicaciones rutinarias basadas en hechos.
- Derivar entrevistas, negociación y decisiones personales.
- Mantener la comunicación en el canal original.

**WP-06.6 — Reporting & Usage**
- Construir reporte de campaña.
- Separar confirmadas, inciertas, pendientes, fallidas y omitidas.
- Mostrar intervenciones, fuentes y errores.
- Relacionar consumo de inferencia con actividad y resultados.

### Deliverables

- Orquestación de campaña con múltiples oportunidades.
- Pausa, reanudación y recuperación.
- Flujo de intervención humana.
- Comunicación por canal autorizado.
- Reporte final y métricas.
- Suite de regresión E2E.

### Exit Criteria

- La campaña respeta el mandato y el límite.
- Una candidatura pendiente no detiene tareas independientes.
- La pausa detiene nuevas acciones.
- El cierre de la pestaña controladora deja la campaña pausada.
- La reconexión no duplica envíos.
- Los permisos revocados impiden acciones posteriores.
- Las comunicaciones rutinarias permanecen en el canal original.
- Las acciones personales se derivan al candidato.
- El reporte coincide con los registros persistidos.
- Los once recorridos E2E tienen criterios verificables.

## 11. Cross-Cutting Workstreams

Estos workstreams atraviesan todos los sprints y forman parte de sus criterios de salida.

### 11.1. Security & Privacy

- Ownership por cuenta.
- Validación de sesiones y permisos.
- Gestión de secretos.
- Aislamiento de documentos.
- Prompt injection y datos externos no confiables.
- Revocación y eliminación de cuenta.
- Retención y transferencias internacionales.

### 11.2. Data & Contracts

- Schemas compartidos.
- Migraciones compatibles.
- Integridad referencial.
- Versionado de documentos.
- Idempotencia de operaciones.
- Compatibilidad de eventos y WebSocket.

### 11.3. Quality Engineering

- Unit tests de reglas de dominio.
- Integration tests de repositorios y proveedores.
- Contract tests de REST y WebSocket.
- Browser tests por fuente.
- E2E de producto.
- Regression tests de permisos, deduplicación y recuperación.

### 11.4. Observability & Cost

- Correlation IDs por cuenta, chat, campaña y operación.
- Logs estructurados sin contenido sensible completo.
- Duración de inferencia y navegación.
- Tokens y costo por operación.
- Tasa de confirmación, incertidumbre y fallos.
- Alertas por errores de proveedor, conexión y billing.

### 11.5. UX & Accessibility

- Estados loading, empty, error, paused y completed.
- Foco visible y navegación por teclado.
- Estados que no dependan solo del color.
- Consistencia entre chat, navegador y dashboard.
- Acciones destructivas con confirmación contextual.

### 11.6. Localization

- Español e inglés para la experiencia inicial.
- Portugués de Brasil como requisito de expansión regional.
- Mensajes, formatos de fecha, moneda y salario localizables.

## 12. Priority Framework

| Prioridad | Criterio | Ejemplos |
|---|---|---|
| **P0 — Critical** | Seguridad, integridad o resultado externo | Ownership, permisos, no duplicación, evidencia, pausa, recuperación |
| **P1 — Core** | Flujo principal de producto | Perfil, CV, chat, mandato, búsqueda, candidatura y dashboard |
| **P2 — Expansion** | Cobertura y experiencia avanzada | Nuevas fuentes, comunicación ampliada, localización y métricas adicionales |
| **P3 — Later** | Mejora no esencial para el primer E2E | Personalizaciones y optimizaciones sin impacto en integridad |

No se debe adelantar una capacidad P2/P3 si una condición P0 de seguridad o integridad sigue abierta.

## 13. Risk Register

| Riesgo | Impacto | Mitigación planificada |
|---|---|---|
| Portal prohíbe automatización | Bloqueo, restricción de cuentas o incumplimiento | Matriz de fuentes permitidas y parada por política |
| Formulario cambia | Fallos de navegación y envío | Pruebas por fuente, detección de cambios y estados inciertos |
| Resultado de envío ambiguo | Duplicados o falsas confirmaciones | SubmissionAttempt, evidencia y reconciliación |
| Sesión de navegador expira | Interrupción de campaña | Intervención explícita y reanudación segura |
| Prompt injection externo | Acciones o filtración no autorizadas | Scope de herramientas y datos externos no confiables |
| Perfil incompleto | Respuestas incorrectas | Procedencia de hechos y pending_review |
| Costo de inferencia elevado | Economía unitaria negativa | Medición por operación y costo por confirmación |
| Transferencia de control concurrente | Dos agentes operan la misma cuenta | Controller exclusivo y handoff |
| Eliminación incompleta | Exposición residual de datos | Flujo coordinado de DB, sesiones y storage |
| Incompatibilidad de navegador | Pérdida de ejecución | Chromium como objetivo principal y adaptadores separados |

## 14. Definition of Ready

Una unidad de trabajo entra a un sprint cuando:

- Tiene requisito o decisión de arquitectura de referencia.
- Tiene resultado observable y criterio de aceptación.
- Sus dependencias están identificadas.
- Los contratos afectados están definidos.
- Los riesgos de seguridad y datos están identificados.
- El alcance puede verificarse en un entorno concreto.

## 15. Definition of Done

Una unidad de trabajo sale de un sprint cuando:

- El comportamiento satisface sus criterios de aceptación.
- Las pruebas correspondientes pasan.
- No existen defectos P0 abiertos.
- Los contratos y schemas mantienen compatibilidad.
- Los logs y errores permiten diagnosticar el flujo.
- La documentación relacionada refleja el comportamiento acordado.
- Los casos de fallo y recuperación tienen tratamiento definido.
- La evidencia de QA queda asociada al incremento.

## 16. Release Readiness Gate

Antes de preparar una publicación:

1. Ejecutar la suite de regresión.
2. Verificar los escenarios E2E críticos.
3. Revisar la matriz de fuentes y sus condiciones de uso.
4. Validar permisos, ownership y eliminación de cuenta.
5. Comprobar integridad de documentos y resultados.
6. Medir costo de inferencia y costo por candidatura confirmada.
7. Verificar despliegue, migraciones, smoke tests y rollback.
8. Preparar distribución y actualización de la extensión.
9. Revisar soporte, errores conocidos y comunicación al usuario.

## 17. Estimation & Scheduling

El plan no asigna fechas arbitrarias. La duración de cada sprint se establecerá después de:

- Descomponer los work packages en tareas técnicas.
- Estimar complejidad y riesgo.
- Identificar trabajo de integración y pruebas.
- Determinar capacidad disponible.
- Incorporar margen para dependencias externas, especialmente portales y navegador.

La prioridad se determina por dependencias, riesgo e impacto sobre los recorridos E2E, no por la cantidad de archivos o componentes que puedan producirse.

## 18. Delivery Governance

- Requirements Engineering define el comportamiento exigido.
- Architecture & Design define las fronteras y contratos técnicos.
- Este plan define el orden de construcción.
- QA & Verification conserva la evidencia de aceptación.
- Release & Operations define publicación, recuperación y mantenimiento.

Cualquier cambio de alcance deberá actualizar requisitos, arquitectura, E2E y planificación afectados. No se debe introducir una capacidad nueva únicamente desde el backlog técnico sin identificar su efecto en el producto.

## 19. References

1. [01. Discovery & Business Analysis](01.%20Discovery%20%26%20Business%20Analysis.md).
2. [02. Requirements Engineering](02.%20Requirements%20Engineering.md).
3. [03. Architecture & Design](03.%20Architecture%20%26%20Design.md).
4. [03.1. Mirai WorkFlow E2E](03.1.%20Mirai%20WorkFlow%20E2E.md).
5. [Product Development Lifecycle](product_build_framework.md).
6. [UI/UX E2E](design/mirai_ui_ux_e2e.md).
7. [Design System](design/mirai_design_system.md).
8. [Figma — Mirai Product UI E2E](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai).
