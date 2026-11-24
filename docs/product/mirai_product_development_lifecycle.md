# Product Development Lifecycle


Etapa	Documento o evidencia	Qué debe contener exclusivamente
01 · Discovery	Product Brief	Problema, mercado, propuesta, viabilidad y alcance inicial
02 · Requirements	Product Specification	Comportamientos, reglas, restricciones y criterios de aceptación
03 · Architecture & Design	Technical Design	UX/UI, arquitectura, modelos, contratos técnicos y decisiones
04 · Planning	Implementation Plan	Incrementos, prioridades, responsables y dependencias
05 · Implementation	Repository	Implementación, código y cambios trazables
06 · Verification	QA Evidence	Pruebas ejecutadas, resultados, defectos y riesgos pendientes
07 · Release	Release Package	Versión, despliegue, lanzamiento, soporte y recuperación
08 · Operate & Learn	Performance Review	Métricas reales, hallazgos y próximas decisiones

## 01. Discovery & Business Analysis

Objetivo: comprender el problema, el contexto empresarial y las necesidades reales antes de decidir qué producto construir.

Disciplinas y actividades:

1. Market Research & Competitive Analysis: investigar mercado, segmentos, competidores, alternativas actuales y oportunidades.
2. Customer & Problem Discovery: identificar necesidades, dificultades y comportamientos mediante investigación de usuarios.
3. Business Strategy & Objectives: establecer objetivos de negocio, propuesta de valor y resultados esperados.
4. Stakeholder Analysis: identificar actores interesados, responsabilidades, necesidades e influencia sobre el producto.
5. Current State / Future State Analysis (AS-IS / TO-BE): comprender cómo funciona actualmente el negocio y qué transformación se pretende conseguir.
6. Business Process Modeling — BPMN 2.0: representar procesos empresariales, actividades, participantes, decisiones y eventos.
7. Business Use-Case Modeling (suggested: MCUN / MAN): modelar los servicios externos del negocio y su organización interna, siguiendo el enfoque de RUP cuando aporte valor.
8. Business Model & Feasibility Analysis: evaluar modelo económico, restricciones legales, viabilidad operativa y riesgos de la propuesta.
9. Product Vision & Scope Definition: establecer la visión del producto, su alcance inicial y las capacidades que quedan fuera.

Entregable: `Product Brief + Business Model`

Incluye Product Vision, análisis del negocio, modelos de procesos pertinentes, propuesta de valor y estudio preliminar de viabilidad.

Referencias: BABOK / IIBA, Design Council Double Diamond, BPMN 2.0 y Product Discovery.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.iiba.org\&sz=32)


## 02. Requirements Engineering

Objetivo: transformar las necesidades del negocio y sus usuarios en requisitos completos, consistentes y verificables del sistema.

Disciplinas y actividades:
    

1. Functional Requirements Specification: definir capacidades, operaciones y comportamientos observables del sistema.
2. Non-Functional Requirements / Quality Requirements: especificar rendimiento, seguridad, confiabilidad, mantenibilidad y demás atributos de calidad. Utilizar ISO/IEC 25010:2023 como modelo de referencia.
3. Business Rules Specification: formalizar las reglas del dominio que el sistema debe respetar, separándolas de las decisiones de implementación.
4. Use-Case Specifications — ECU: detallar precondiciones, flujos principales, escenarios alternativos, excepciones y postcondiciones.
5. User Stories & Acceptance Criteria: expresar necesidades desde la perspectiva del usuario y establecer condiciones verificables de aceptación.

Entregable: `Product Requirements Document (PRD) + Software Requirements Specification (SRS)`

El PRD expresa el alcance y las expectativas del producto. La SRS formaliza los requisitos del software; pueden mantenerse como documentos vinculados o secciones de un mismo repositorio documental.

Referencias: ISO/IEC/IEEE 29148:2018, ISO/IEC 25010:2023 y BABOK.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.iso.org\&sz=32)

Requirements engineering+2



## 03. Architecture & Design

Objetivo: transformar los requisitos en un diseño técnico coherente que explique la estructura, el comportamiento y las interacciones del sistema.

Disciplinas y actividades:

1. Domain Modeling & Analysis Class Modeling: identificar entidades, value objects, relaciones, responsabilidades y límites del dominio; utilizar UML de clases cuando resulte apropiado.
2. Software Architecture Design — ISO/IEC/IEEE 42010: establecer decisiones arquitectónicas, responsabilidades de subsistemas, propiedades de calidad y perspectivas relevantes.
3. Architecture Visualization — C4 Model: representar System Context, Containers y Components según el nivel de detalle necesario.
4. Behavioral Modeling — UML State Machines: definir estados, eventos, transiciones válidas e invariantes de entidades y procesos.
5. Interaction & Workflow Modeling — UML Sequence / Activity: representar comunicación entre componentes, secuencias, decisiones y coordinación de operaciones.
6. Data Modeling & Database Design: desarrollar modelos conceptuales, lógicos y físicos de datos, incluyendo integridad, relaciones y estrategias de almacenamiento.
7. API & Interface Contract Design: especificar protocolos, contratos entre componentes, esquemas, errores y compatibilidad; utilizar OpenAPI cuando corresponda.
8. UX/UI Design — Human-Centred Design: diseñar recorridos, arquitectura de información, wireframes, prototipos y sistema visual a partir de los requisitos.
9. Security Architecture & Threat Modeling: identificar activos, fronteras de confianza, amenazas y controles de seguridad necesarios.
10. Architecture Decision Records — ADR: documentar decisiones significativas, alternativas descartadas y consecuencias técnicas.

Entregable: `Software Design Description (SDD) / Technical Design`

Contiene los modelos, diagramas, contratos y decisiones necesarios para implementar la solución.





## 04. Technical & Delivery Planning

Objetivo: organizar el desarrollo en unidades ejecutables, considerando dependencias, prioridades, recursos y riesgos.

Disciplinas y actividades:

1. Work Breakdown & Incremental Delivery Planning: descomponer el alcance en incrementos funcionales y unidades de trabajo, ordenados por dependencias, prioridad y riesgo, estableciendo hitos y criterios de finalización.

Entregable: `Implementation Plan`

Define el orden y organización del trabajo. No vuelve a especificar las funcionalidades ni a rediseñar la arquitectura.



## 05. Implementation

Objetivo: construir e integrar el software conforme a las especificaciones y el diseño establecidos.

Disciplinas y actividades:

1. Development Environment & Toolchain Setup: configurar repositorio, SDKs, dependencias, herramientas de desarrollo y entornos.
2. Software Construction: implementar módulos, algoritmos, reglas de dominio y componentes definidos.
3. Database Implementation & Schema Migrations: materializar modelos de datos, restricciones, migraciones y consultas.
4. API & External Systems Integration: conectar componentes internos, servicios y proveedores mediante los contratos especificados.
5. Version Control & Configuration Management: administrar commits, ramas, dependencias, configuraciones y cambios mediante Git.
6. Continuous Integration — CI: automatizar compilación, análisis estático y verificaciones iniciales ante cambios.
7. Developer Testing & Code Review: desarrollar pruebas durante la construcción y revisar corrección, seguridad, claridad y mantenibilidad.
8. Incremental Integration: integrar unidades terminadas preservando los contratos existentes.

Entregable: `Source Code Repository + Integrated Builds`

Código versionado, cambios trazables, pruebas de desarrollo y artefactos construibles.

Referencias: ISO/IEC/IEEE 12207:2026 y NIST Secure Software Development Framework.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.iso.org\&sz=32)

Software life cycle processes+1



## 06. Verification & Validation

Objetivo: reunir evidencia de que el software implementado cumple los requisitos y puede utilizarse adecuadamente para su propósito.

Disciplinas y actividades:

1. Test Planning & Test Case Design: definir cobertura, condiciones, datos y procedimientos de prueba a partir de los requisitos.
2. Unit & Integration Testing: verificar componentes individuales y la interacción entre módulos, bases de datos y dependencias.
3. System & End-to-End Testing: comprobar los flujos funcionales completos desde sus entradas hasta los resultados observables.
4. Contract & Regression Testing: verificar compatibilidad entre interfaces y detectar comportamientos dañados por cambios recientes.
5. Non-Functional Testing: comprobar rendimiento, carga, confiabilidad, accesibilidad y otras propiedades especificadas.
6. Security Verification & Testing: evaluar controles de autorización, validación, manejo de secretos y vulnerabilidades relevantes.
7. User Acceptance Testing — UAT: comprobar con usuarios o representantes autorizados que el producto satisface los criterios de aceptación.
8. Defect Management & Reverification: registrar defectos, evaluar su impacto y verificar las correcciones realizadas.
9. Release Readiness Assessment: determinar si la evidencia acumulada satisface los criterios necesarios para publicar.

Entregable: `Test Report + QA Evidence + Release Readiness Assessment`

Conserva resultados de las pruebas, defectos abiertos, cobertura relevante y decisión de preparación para el lanzamiento.

Referencias: ISO/IEC/IEEE 12207:2026, ISO/IEC/IEEE 29148 y NIST SSDF.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.iso.org\&sz=32)

Software life cycle processes+2



## 07. Release & Deployment

Objetivo: distribuir una versión verificada y ponerla a disposición de los usuarios de manera controlada.

Disciplinas y actividades:

1. Release Management & Versioning: identificar la versión, consolidar los cambios y preparar las notas de publicación.
2. Build & Artifact Management: generar, almacenar y verificar los artefactos distribuibles con sus dependencias y procedencia.
3. Production Environment Preparation: preparar infraestructura, configuración, secretos, permisos y recursos de producción.
4. Deployment & Database Migration: ejecutar el despliegue del software y las migraciones compatibles necesarias.
5. Progressive Delivery & Rollout Strategy: definir habilitación gradual, pilotos, canary releases o feature flags según el riesgo.
6. Operational Readiness & Rollback Planning: comprobar alertas, procedimientos operativos, soporte y mecanismos de mitigación o reversión.
7. Go-to-Market & Product Launch: ejecutar la distribución, comunicación comercial y activación de los canales de adquisición previamente definidos.
8. Production Smoke Testing & Release Monitoring: confirmar que la versión funciona en el entorno real y observar las señales inmediatas de salud.

Entregable: `Release Package + Deployment Record + Launch Plan`

Identifica qué se publicó, dónde, bajo qué configuración, para quién y con qué mecanismos de recuperación.

Referencias: ISO/IEC/IEEE 12207:2026, NIST SSDF y prácticas de entrega de software estudiadas por DORA.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.iso.org\&sz=32)

Software life cycle processes+2



## 08. Operations & Continuous Improvement

Objetivo: mantener el producto en funcionamiento, medir su desempeño real y utilizar esa información para decidir cómo evolucionarlo.

Disciplinas y actividades:

1. Service Operations & Monitoring: administrar el servicio y supervisar disponibilidad, latencia, errores, recursos y funcionamiento general.
2. Observability & Reliability Engineering — SRE: utilizar métricas, logs, trazas, SLIs y SLOs para evaluar la confiabilidad del sistema.
3. Incident & Problem Management: detectar incidentes, mitigar su impacto, restaurar el servicio e investigar causas y recurrencias.
4. Product Analytics & Performance Measurement: medir adquisición, activación, adopción, retención, conversión y resultados económicos.
5. User Feedback & Solution Evaluation: analizar experiencia real, limitaciones del producto y necesidades que permanecen sin resolver.
6. Experimentation & Product Optimization: evaluar cambios mediante experimentos controlados y resultados observables cuando corresponda.
7. Software Maintenance & Technical Debt Management: realizar mantenimiento correctivo, adaptativo, perfectivo y preventivo.
8. Continuous Improvement & Product Evolution: utilizar las evidencias para priorizar nuevas oportunidades y alimentar otro ciclo de desarrollo.
9. Deprecation & Retirement Management: gestionar la sustitución y retirada controlada de funcionalidades, contratos o productos cuando dejen de ser necesarios.

Entregable: `Product Performance Review + Improvement Backlog`

Incluye métricas, incidencias relevantes, aprendizaje del producto y decisiones de evolución.

Referencias: IIBA Solution Evaluation, DORA Software Delivery Performance Metrics y gestión de incidentes NIST.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.iiba.org\&sz=32)

IIBA®+2



## Mapa definitivo de entregables

| Etapa                                    | Entregable principal                     |
| ---------------------------------------- | ---------------------------------------- |
| 01 · Discovery & Business Analysis       | Product Brief + Business Model           |
| 02 · Requirements Engineering            | PRD + SRS                                |
| 03 · Architecture & Design               | SDD / Technical Design                   |
| 04 · Technical & Delivery Planning       | Implementation Plan + Backlog            |
| 05 · Implementation                      | Source Code Repository + Builds          |
| 06 · Verification & Validation           | Test Report + QA Evidence                |
| 07 · Release & Deployment                | Release Package + Launch Plan            |
| 08 · Operations & Continuous Improvement | Performance Review + Improvement Backlog |
