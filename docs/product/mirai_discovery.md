# 01. Discovery & Business Analysis

**Entregable:** Product Brief + Business Model  
**Versión:** 2.0  
**Fecha:** 24 de noviembre de 2026  
**Producto:** Mirai  
**Documentos relacionados:** [Requirements Engineering](mirai_requirements.md) · [Architecture & Design](../architecture/mirai_architecture.md) · [Mirai WorkFlow E2E](mirai_workflow_e2e.md) · [Technical Delivery Planning](../planning/mirai_technical_delivery_plan.md) · [Campaigns — Business](../features/campaigns/mirai_campaigns.md) · [Browser — Business](../features/browser/mirai_browser.md) · [Applications — Business](../features/applications/mirai_applications.md)

---

## 1. Executive Summary

Mirai es un servicio de búsqueda y postulación laboral asistida por un agente autónomo. El candidato aporta su información profesional, define el tipo de empleo que busca, establece restricciones y autoriza los canales de actuación. Mirai utiliza un navegador de escritorio vinculado para descubrir oportunidades, evaluar su pertinencia, preparar documentos, completar formularios, enviar candidaturas cuando las condiciones lo permiten y organizar el seguimiento.

La propuesta de valor no es generar recomendaciones ni mostrar un porcentaje de compatibilidad. Es **reducir el trabajo operativo que separa al candidato de participar en oportunidades pertinentes**, conservando control, trazabilidad y evidencia de los resultados.

El candidato mantiene la autoridad sobre su identidad profesional, sus restricciones, sus permisos y las decisiones que requieren presencia personal. La autonomía se aplica dentro del mandato autorizado y de las condiciones de acceso de cada plataforma externa.

**Promesa central:** define qué empleo buscas; Mirai se ocupa del trabajo digital repetitivo y te muestra qué ocurrió.

Mirai no promete conseguir entrevistas, ofertas ni empleo. Esos resultados dependen de empleadores, vacantes, competencia y decisiones externas. El resultado que el producto puede controlar es la calidad y trazabilidad del trabajo que realiza en nombre del candidato.

## 2. Contexto de mercado

### 2.1. Mercado laboral regional

La visión geográfica comprende Latinoamérica, incluido Brasil. La región no constituye un mercado laboral homogéneo: las condiciones de contratación, formalidad, salarios, plataformas dominantes, idiomas y protección de datos varían entre países.

La OIT, en *Tendencias del mercado laboral en América Latina y el Caribe* (30 de julio de 2026), describe un crecimiento del empleo regional durante 2025, niveles de desocupación relativamente bajos en términos históricos y una reducción de la informalidad, junto con diferencias persistentes entre países y brechas que afectan especialmente a mujeres y jóvenes. Este contexto justifica tratar la región como un conjunto de mercados relacionados, no como una única jurisdicción ni como un segmento con necesidades idénticas.

Mirai se concentra en la parte digital del proceso de búsqueda: vacantes publicadas en portales, páginas de empresas y sistemas ATS; formularios electrónicos; documentos profesionales; y comunicaciones laborales digitales.

### 2.2. Trabajo que el candidato necesita resolver

Una búsqueda laboral digital puede exigir que el candidato:

- Consulte fuentes y portales distintos.
- Revise ofertas y descarte las incompatibles.
- Adapte su CV y sus respuestas a cada oportunidad.
- Cree cuentas, gestione sesiones y complete formularios heterogéneos.
- Adjunte documentos y verifique si el envío llegó al destino.
- Evite repetir candidaturas.
- Revise correos y bandejas externas.
- Mantenga un registro de oportunidades, envíos, respuestas y pendientes.

La fricción no se limita a encontrar vacantes. Una parte importante del esfuerzo aparece después del descubrimiento, cuando el candidato repite operaciones similares en distintos sitios.

## 3. Customer & Problem Discovery

### 3.1. Job to Be Done

> Cuando busco empleo y las oportunidades están distribuidas entre diferentes portales y páginas de empresas, quiero delegar la búsqueda, preparación, envío y seguimiento de candidaturas basados en mi perfil y mis condiciones, para participar en oportunidades pertinentes sin administrar manualmente cada formulario.

**Motivación funcional:** reducir navegación repetitiva, adaptación documental, introducción de datos y seguimiento.

**Motivación emocional:** recuperar tiempo, reducir la fatiga de postular y evitar perder continuidad entre portales.

**Resultado esperado:** un registro claro de las oportunidades evaluadas, las candidaturas realmente enviadas, los resultados inciertos y las acciones que requieren participación personal.

### 3.2. Fricciones del proceso

| Fricción | Consecuencia | Respuesta de producto |
|---|---|---|
| Fuentes dispersas | Búsquedas repetidas y oportunidades omitidas | Descubrimiento desde las fuentes incluidas en el mandato |
| Evaluación repetitiva | Tiempo dedicado a vacantes incompatibles | Filtros obligatorios y evaluación profesional |
| Adaptación documental | CV y respuestas distintos para cada oportunidad | Biblioteca de documentos y adaptación basada en hechos declarados |
| Formularios heterogéneos | Repetición de datos y pasos | Automatización de interfaces autorizadas |
| Sesiones y verificaciones | Interrupciones y pérdida de continuidad | Navegador vinculado y gestión de intervención |
| Duplicados | Envíos repetidos y pérdida de credibilidad | Identidad de oportunidad y control de repetición |
| Resultado ambiguo | El candidato no sabe si la solicitud llegó | Estados diferenciados y evidencia del destino |
| Seguimiento fragmentado | Correos, portales y notas separados | Registro operativo centralizado sin crear una bandeja paralela |

### 3.3. Límites del problema

Mirai no controla:

- La cantidad ni la calidad de las vacantes disponibles.
- La decisión de contratación del empleador.
- La veracidad de la información que el candidato declara.
- La elegibilidad legal o migratoria que el candidato no puede acreditar.
- Entrevistas, pruebas presenciales, grabaciones personales, firmas ni decisiones contractuales.
- Los controles de acceso, términos de servicio o mecanismos antiabuso de plataformas externas.

El producto debe identificar estos límites y derivar al candidato aquello que requiera su presencia o una decisión personal.

### 3.4. Segmento objetivo

**Usuario y pagador principal:** persona que busca empleo y utiliza canales digitales para presentar candidaturas.

**Cobertura prevista:** profesiones, sectores y niveles de experiencia diversos; oportunidades presenciales, híbridas y remotas; mercados de habla española y portuguesa.

**Condiciones de uso del MVP:** equipo de escritorio, navegador Chromium compatible, extensión vinculada, perfil profesional revisado y autorización explícita de las fuentes y acciones correspondientes.

La propuesta es horizontal. La estrategia de validación comercial debe escoger segmentos concretos para medir resultados comparables; esa elección no convierte una profesión en requisito permanente del producto.

## 4. Market Research & Competitive Analysis

### 4.1. Alternativas directas

El mercado incluye productos que automatizan candidaturas, productos que preparan solicitudes para que el usuario las envíe y agentes generalistas que pueden operar sitios web.

| Producto | Enfoque publicado | Precio público consultado | Lectura competitiva |
|---|---|---|---|
| [Tsenta](https://tsenta.com/pricing) | Búsqueda, adaptación, envío y seguimiento; declara soporte para más de 30 sistemas de empleadores | 25 solicitudes iniciales gratuitas; USD 19/600, USD 39/1.500 y USD 99/4.500 por ciclo de 30 días | Competidor directo con precio vinculado a volumen y recibos por candidatura |
| [AIApply](https://support.aiapply.co/es/articles/16864279-como-funcionan-los-planes-los-creditos-y-los-cobros) | Auto Apply con créditos, perfil y biblioteca de respuestas | USD 49/100 o USD 99/250 al mes; USD 199/750 por trimestre; personalización de CV y carta como complementos de USD 12/mes cada uno | Separa la automatización de los complementos de personalización |
| [JobCopilot](https://jobcopilot.com/es/precios/) | Copilotos, búsqueda, automatización, seguimiento y herramientas de carrera | Premium desde USD 0,93/día; Elite desde USD 1,05/día; hasta 20 o 50 coincidencias diarias, respectivamente | Combina auto-apply con funcionalidades adyacentes de carrera |
| [LoopCV](https://www.loopcv.pro/pricing) | Búsqueda, auto-apply, extensión, seguimiento y servicios asistidos | Gratis: hasta 10 solicitudes o correos/mes; Standard €8,99/100; Premium €29,99/300; Done For You €159,99/mes | Combina automatización, agregación y un servicio de acompañamiento |
| [Winche](https://winche.ai/es/pricing/) | Copiloto regional, análisis de oportunidades y preparación de candidaturas | PRO desde USD 11,99/mes; modalidad Radar desde USD 3,99/mes cuando el usuario la acepta | Su propuesta principal es asistida: el usuario envía, salvo flujos específicos como Recruitee con aprobación |
 
Los precios corresponden a páginas públicas de proveedores consultadas el 24 de noviembre de 2026. Pueden variar por país, moneda, impuestos, ciclo de facturación o cambios comerciales. Las capacidades descritas son declaraciones de cada proveedor, no pruebas independientes de calidad o tasa de éxito.

### 4.2. Sustitutos generalistas

[ChatGPT Work con Cloud Browser](https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt) permite operar sitios compatibles, iniciar sesión, completar formularios y ejecutar tareas desde un navegador alojado en la nube. Puede continuar trabajando después de que el usuario cierre su computadora y detenerse cuando necesita información, inicio de sesión o confirmación.

Los agentes generalistas amplían el conjunto de alternativas de Mirai. La especialización laboral, por sí sola, no constituye una ventaja defendible. La propuesta debe demostrar mejor continuidad del flujo, control de permisos, trazabilidad de envíos, consistencia documental y claridad del costo por resultado.

### 4.3. Implicaciones competitivas

- «Usa IA», «adapta el CV» y «postula automáticamente» no son diferenciadores exclusivos.
- La cantidad de portales anunciada por un proveedor no demuestra compatibilidad estable en todos sus flujos.
- El número de intentos no equivale al número de candidaturas confirmadas.
- Un precio bajo por solicitud solo es comparable si las definiciones de solicitud, límites, personalización y seguimiento coinciden.
- Mirai debe competir por la confiabilidad del trabajo delegado y por la calidad de la evidencia, no por inflar el volumen de clics.

**Hipótesis de diferenciación que deben medirse:** menor intervención humana por candidatura confirmada, control local del navegador del usuario, recuperación segura, claridad de resultados y una experiencia unificada entre perfil, documentos, chat y seguimiento.

## 5. Business Strategy & Objectives

### 5.1. Prioridad estratégica

La prioridad de ingeniería es demostrar un sistema de software autónomo que coordine modelos, herramientas, navegador, datos, permisos, recuperación y efectos externos verificables.

La oportunidad comercial es secundaria a esa prioridad y debe evaluarse con costos reales, cobertura de fuentes y compras efectivas. Una demostración visual sin ejecución confiable no satisface el objetivo técnico; una ejecución costosa o incompatible con las condiciones de los portales tampoco constituye un negocio sostenible.

### 5.2. Propuesta de valor

> Sube tu información profesional, define qué trabajos buscas y delega el trabajo digital de postular. Mirai encuentra oportunidades alineadas, prepara documentos y respuestas basados en tu perfil, opera los formularios permitidos y conserva un registro claro de lo ocurrido.

### 5.3. Principios de producto

1. **Autonomía dentro de un mandato:** una campaña autorizada puede procesar oportunidades elegibles sin aprobación rutinaria por candidatura.
2. **Control del candidato:** las restricciones, permisos, pausas y decisiones personales pertenecen al usuario.
3. **Hechos profesionales verificables:** el agente puede reorganizar y redactar información aportada, pero no inventar experiencia, títulos, certificados ni resultados.
4. **Resultado honesto:** pulsar «Enviar» no equivale a recepción confirmada.
5. **Cobertura por fuentes:** cada portal requiere una evaluación de compatibilidad y condiciones de uso propias.
6. **Continuidad segura:** una interrupción no autoriza un reenvío ciego.
7. **Foco:** búsqueda, postulación y seguimiento; no cursos, coaching, marketplace laboral ni entrevistas simuladas como núcleo del producto.

### 5.4. Objetivos de negocio y producto

| Objetivo | Indicador |
|---|---|
| Reducir trabajo manual | Minutos de intervención humana por candidatura confirmada |
| Ejecutar candidaturas útiles | Candidaturas confirmadas por campaña |
| Proteger la calidad | Envíos incompatibles con restricciones obligatorias y duplicados |
| Mejorar continuidad | Tareas recuperadas sin pérdida de resultado ni repetición externa |
| Ampliar cobertura | Flujos permitidos y confirmados por fuente |
| Controlar economía unitaria | Costo total por candidatura confirmada |
| Entregar trazabilidad | Porcentaje de resultados con motivo, destino y documento identificable |
| Observar el resultado laboral | Respuestas, entrevistas y ofertas reportadas, sin atribuir causalidad automática a Mirai |

La retención mensual no debe interpretarse aisladamente: la búsqueda de empleo es episódica y un candidato puede dejar de utilizar el servicio después de conseguir trabajo.

## 6. Business Model & Feasibility

### 6.1. Business Model Canvas

| Bloque | Definición |
|---|---|
| Segmentos | Candidatos individuales que participan en procesos digitales de contratación en LATAM |
| Propuesta de valor | Delegación operativa, autonomía autorizada y resultados trazables |
| Canales | Distribución digital directa y alianzas por evaluar |
| Relación | Autoservicio, configuración inicial, notificaciones y soporte para incidencias |
| Ingresos | Servicio pagado; empaquetado y límites vinculados al consumo y al valor entregado |
| Actividades | Descubrir, evaluar, preparar, navegar, enviar, verificar, registrar, seguir y recuperar |
| Recursos | Software, modelos, infraestructura, sesiones locales, perfil y autorizaciones |
| Socios | Proveedores de inferencia, infraestructura, almacenamiento, pagos y canales externos |
| Costos | Inferencia, API, base de datos, almacenamiento, pagos, mantenimiento, soporte y seguridad |

### 6.2. Economía unitaria

La métrica comercial central es el costo por candidatura confirmada, no el costo por clic ni por intento.

**Costo de campaña =** inferencia + infraestructura atribuible + almacenamiento + operaciones de recuperación + seguimiento + comisiones de pago + soporte atribuible.

**Costo por candidatura confirmada =** costo de campaña / candidaturas confirmadas.

El navegador local desplaza parte del cómputo de navegación al equipo del candidato, pero no elimina los costos de inferencia, API, persistencia, almacenamiento, pagos, soporte y mantenimiento.

La política comercial debe hacer comprensible el consumo de créditos y evitar presentar como resultado facturable una candidatura que no llegó al destino. El documento de Billing define tarifas, paquetes, caducidad y conciliación.

### 6.3. Viabilidad técnica

La combinación de extensión de escritorio, Chrome Debugger Protocol, Playwright MCP y un agente de modelos permite automatizar interfaces web reales sin depender de una API específica de cada portal.

La viabilidad se evalúa por flujo y por fuente. Formularios dinámicos, sesiones caducadas, verificaciones de identidad, CAPTCHA, cambios de interfaz y restricciones de automatización limitan la cobertura. La arquitectura local tampoco equivale a ejecución permanente con el equipo apagado.

**Criterio:** Mirai debe reportar qué fuentes y flujos admite, cuáles requieren intervención y cuáles no puede operar. No debe prometer compatibilidad universal.

### 6.4. Acceso y condiciones de terceros

Operar una interfaz con autorización del candidato no anula los términos de servicio de la plataforma de destino.

- [LinkedIn — Automated activity](https://www.linkedin.com/help/linkedin/answer/a1341543) prohíbe software y extensiones de terceros que automaticen actividad, extraigan datos o modifiquen la apariencia de su sitio.
- [Indeed — Terms of Service](https://www.indeed.com/legal?hl=en_US) prohíbe bots, scripts y automatización de Indeed Apply fuera de proveedores y herramientas oficiales o autorizados.

Por tanto, la compatibilidad comercial debe depender de una matriz por fuente que registre condiciones, flujos permitidos, restricciones y fecha de revisión. Cuando una plataforma no permita automatización, Mirai debe detener esa acción y comunicar la alternativa disponible; resolver un CAPTCHA no convierte una actividad prohibida en permitida.

### 6.5. Privacidad y regulación regional

Mirai procesa identidad, CV, trayectoria, contactos, preferencias, respuestas de formularios, documentos, sesiones y comunicaciones laborales.

En Perú, el marco principal incluye la Ley 29733 y su Reglamento aprobado por el Decreto Supremo 016-2024-JUS, vigente desde el 31 de marzo de 2025. La ANPD mantiene el compendio y los procedimientos aplicables a bancos de datos personales.

En Brasil, la LGPD regula el tratamiento de datos personales. La Resolución CD/ANPD 19/2024 establece mecanismos y garantías para transferencias internacionales de datos, incluidas cláusulas contractuales estándar.

La expansión a otros países requiere una revisión por jurisdicción de finalidades, bases legales, consentimiento, derechos del titular, transferencias, conservación y obligaciones del responsable y encargados.

## 7. AS-IS / TO-BE

### 7.1. AS-IS — proceso manual

1. El candidato busca en varios portales y páginas de empresas.
2. Revisa cada oferta y compara requisitos con su perfil.
3. Adapta el CV y redacta respuestas.
4. Inicia sesión y completa el formulario.
5. Envía la solicitud y busca una confirmación.
6. Registra manualmente la actividad o depende de su memoria.
7. Revisa portales y correo para detectar respuestas.
8. Repite el ciclo para la siguiente oportunidad.

### 7.2. TO-BE — servicio delegado

El modelo objetivo de producto es:

1. El candidato proporciona perfil, CV, restricciones y permisos.
2. Define una campaña en lenguaje natural.
3. Mirai interpreta el mandato y valida sus condiciones.
4. El agente busca oportunidades en fuentes autorizadas.
5. Evalúa restricciones, pertinencia y duplicados.
6. Selecciona documentos basados en hechos declarados.
7. Opera los formularios que el navegador y la fuente permiten.
8. Registra el resultado observado.
9. Atiende comunicaciones rutinarias dentro del permiso concedido.
10. Deriva información ausente y acciones personales.
11. Continúa con otras oportunidades y entrega un reporte consultable.

Este flujo describe el objetivo de producto; el comportamiento implementado se resume en la sección siguiente.

### 7.3. Baseline implementado

| Capacidad | Comportamiento actual |
|---|---|
| Mandato y campaña | El agente crea campañas desde el chat y conserva mandato, criterios, límite, conversación y estado |
| Fuentes | El agente navega mediante el Chrome local; la campaña no conserva una lista estructurada de fuentes ni existe una matriz de compatibilidad aplicada por el runtime |
| Control del navegador | WXT conecta Chrome, protege la pestaña de Mirai y expone las demás pestañas del perfil |
| Actividad | El chat muestra progreso y nombres de herramientas; no hay viewport de navegador ni modo Operator |
| Selección documental | El agente selecciona CV existentes; no adapta ni crea variantes durante una campaña |
| Adjuntos externos | El backend prepara documentos, pero la extensión bloquea DOM.setFileInputFiles; el upload externo no completa el flujo |
| Resultados | Se persisten cinco estados y los datos de la candidatura; no se almacenan capturas ni evidencia independiente del portal |
| Identidad de candidatura | El ID es determinista por campaña, URL, plataforma y attemptKey; no hay deduplicación global entre campañas |
| Presupuesto | Se calcula desde resultados registrados; no existe reserva transaccional previa al envío |
| Dashboard | Muestra conteos por estado, campañas y cinco candidaturas recientes; no calcula costo por campaña ni tasas de conversión |
| Referencias documentales | Las candidaturas guardan ID y tipo; el detalle resuelve el documento actual, no un snapshot histórico |
| Comunicaciones | allow_communication se incorpora al prompt; no existe un bloqueo semántico por cada acción browser_* |

Los documentos [Campañas — Negocio](../features/campaigns/mirai_campaigns.md), [Control local del navegador — Negocio](../features/browser/mirai_browser.md) y [Postulaciones y resultados — Negocio](../features/applications/mirai_applications.md) describen los recorridos actuales.

## 8. Stakeholders

| Actor | Necesidad | Responsabilidad o influencia |
|---|---|---|
| Candidato | Delegar trabajo sin perder control de identidad y decisiones | Usuario, pagador y titular de los datos |
| Mirai / operador | Servicio confiable, seguro y económicamente sostenible | Diseño, operación y soporte |
| Empleador / reclutador | Recibir solicitudes pertinentes y comunicaciones legítimas | Receptor externo |
| Portal / ATS | Controlar acceso, automatización y uso de su plataforma | Puede permitir, limitar o bloquear flujos |
| Proveedor de modelos | Inferencia y herramientas de agente | Dependencia tecnológica |
| Proveedor de infraestructura | Cómputo, datos y almacenamiento | Disponibilidad y seguridad |
| Proveedor de pagos | Procesar transacciones y eventos comerciales | Dependencia financiera |
| Autoridades de datos | Protección de los titulares | Marco regulatorio por jurisdicción |

## 9. Business Process Modeling

### BP-01 — Configuración del mandato

Candidato aporta perfil, define condiciones, selecciona fuentes y concede permisos. Mirai valida que la instrucción sea suficientemente clara y que las condiciones de ejecución se cumplan.

### BP-02 — Descubrimiento y evaluación

Mirai consulta fuentes permitidas, identifica oportunidades, aplica restricciones obligatorias, evalúa pertinencia y evita duplicados.

### BP-03 — Preparación y envío

Mirai selecciona un CV existente, prepara respuestas a partir de hechos confirmados y opera los campos del formulario mediante el navegador local. La preparación de un archivo no equivale a adjuntarlo: la extensión bloquea el comando CDP utilizado por Playwright para asignar archivos a un input. Cuando el portal exige un adjunto, el flujo no puede considerarse completado por Mirai.

El agente observa la respuesta del portal y registra el resultado. Una señal de recepción permite confirmed; una acción sin confirmación suficiente queda unconfirmed; una intervención del candidato puede quedar pending_review; un fallo terminal queda failed; una oportunidad excluida queda skipped.

### BP-04 — Seguimiento y comunicación

Mirai conserva el resultado operativo de cada candidatura y permite consultar el estado, el motivo, la URL y las referencias documentales. La comunicación laboral utiliza herramientas genéricas del navegador. allow_communication es una instrucción del agente, no un gate técnico por acción de navegador.

### BP-05 — Control y cierre

El candidato consulta campañas y candidaturas en Dashboard. Las acciones Stop y Resume se realizan desde Chat. Una respuesta solicitada por pause_task continúa la tarea pendiente; una campaña detenida por Stop o desconexión requiere reanudación explícita. Dashboard recupera campañas running sin ejecución activa cuando solicita su resumen.

## 10. Business Use Cases

| ID | Caso de uso | Actor iniciador | Resultado |
|---|---|---|---|
| BUC-01 | Configurar y autorizar una búsqueda | Candidato | Mandato de búsqueda claro y acotado |
| BUC-02 | Descubrir oportunidades pertinentes | Candidato / campaña | Oportunidades evaluadas y justificadas |
| BUC-03 | Presentar candidaturas | Candidato / campaña autorizada | Solicitudes con resultado verificable |
| BUC-04 | Consultar actividad y resultados | Candidato | Historial operativo comprensible |
| BUC-05 | Resolver una intervención personal | Candidato | Dato o acción pendiente atendida |
| BUC-06 | Cambiar o detener la delegación | Candidato | Nuevas acciones sujetas al mandato vigente |

## 11. Product Vision & Scope

### 11.1. Visión

Ser el servicio que asume el trabajo digital repetitivo de buscar y postular a empleos en nombre del candidato, con autonomía práctica, control explícito y resultados verificables.

### 11.2. Capacidades dentro del producto

- Identidad y perfil profesional.
- Importación, revisión y administración de originales, CV principal y variantes.
- Preferencias y reglas del candidato.
- Chat como interfaz principal para definir mandatos.
- Agente que interpreta instrucciones y coordina herramientas.
- Navegación en sitios laborales mediante el navegador local autorizado.
- Descubrimiento y evaluación contextual de oportunidades.
- Selección de CV existentes y preparación de respuestas fundamentadas.
- Registro de candidaturas con estados diferenciados.
- Seguimiento de campañas y resultados en Dashboard.
- Detención, reanudación, recuperación y transferencia del workspace.

### 11.2.1. Límites del runtime actual

La biblioteca no conserva historial de versiones de CV. Las campañas no tienen un campo estructurado de fuentes ni un editor independiente en Dashboard. El agente no crea variantes adaptadas durante la postulación. El flujo de carga de archivos a portales está bloqueado por la política CDP de la extensión. El registro de candidaturas no conserva capturas ni snapshots de documentos. La interfaz no incorpora el panel de navegador ni el modo Operator de Figma.

### 11.3. Fuera del alcance central

- Bolsa de empleo propia o marketplace entre candidatos y reclutadores.
- Bandeja de mensajes independiente de los canales originales.
- Cursos, coaching, mentoría o entrenamiento profesional.
- Simulación o suplantación durante entrevistas.
- Pruebas personales, firmas o aceptación de contratos en nombre del candidato.
- Garantías de entrevistas, ofertas o contratación.
- Automatización de plataformas que prohíban expresamente ese uso.
- Puntuaciones decorativas de compatibilidad como promesa principal.

## 12. Success Metrics

| Métrica | Definición |
|---|---|
| Confirmed applications | Envíos con señal observable de recepción |
| Confirmation rate | Confirmadas / registros que representan un envío |
| Duplicate rate | Registros repetidos dentro de una campaña |
| Eligibility violation rate | Envíos que incumplen restricciones obligatorias |
| Human intervention rate | Intervenciones requeridas por candidatura |
| Recovery success | Tareas recuperadas sin pérdida de resultados persistidos |
| Source coverage | Flujos permitidos y comprobados por portal |
| Cost per confirmed application | Costo atribuible dividido entre envíos confirmados |
| Data integrity | Correspondencia entre perfil, documento utilizado y respuesta enviada |

El dashboard actual ofrece conteos por estado, conteos de campañas y cinco candidaturas recientes. No agrega todavía tasa de confirmación, costo por campaña, cobertura por portal, intervención por candidatura ni recuperación por campaña. Los resultados laborales posteriores —respuestas, entrevistas y ofertas— siguen siendo señales que no controla Mirai.

## 13. Business Risks & Hypotheses

| Riesgo o hipótesis | Consecuencia | Evidencia necesaria |
|---|---|---|
| Restricciones de portales relevantes | Cobertura limitada o cuentas restringidas | Matriz de condiciones y pruebas por fuente |
| Costo elevado por resultado | Margen negativo | Medición de inferencia, reintentos y costo por confirmación |
| Resultado de envío ambiguo | Pérdida de confianza | Confirmación observable y reconciliación |
| Datos biográficos incorrectos | Daño al candidato y al producto | Procedencia de cada hecho y controles de generación |
| Intervención humana frecuente | Menor valor de autonomía | Minutos y pendientes por candidatura |
| Instrucciones maliciosas en páginas o correos | Exposición de datos o acciones no autorizadas | Pruebas de prompt injection y límites de herramientas |
| Oferta insuficiente para un perfil | Poco valor percibido | Cobertura y oportunidades elegibles por segmento |
| Sustitutos generalistas | Menor disposición a pagar | Comparación de tareas, costos y resultados equivalentes |

### Hipótesis comerciales

1. Los candidatos valoran más el trabajo completado que una lista de vacantes recomendadas.
2. La autonomía reduce de manera material el tiempo activo por candidatura.
3. La cobertura de fuentes permitidas es suficiente para generar valor recurrente o episódico.
4. El costo por candidatura confirmada permite un modelo comercial sostenible.
5. La trazabilidad y el control del navegador generan confianza suficiente para delegar acciones externas.

## 14. Product Decisions

| ID | Decisión |
|---|---|
| D-01 | El candidato individual es el usuario y pagador principal |
| D-02 | La visión geográfica comprende LATAM, incluido Brasil |
| D-03 | La cobertura profesional es horizontal |
| D-04 | La interacción principal es conversacional |
| D-05 | La autonomía es la opción predeterminada dentro de permisos vigentes |
| D-06 | Las respuestas y documentos se fundamentan en datos declarados |
| D-07 | La confirmación del destino determina el resultado del envío |
| D-08 | El navegador del candidato es el entorno de ejecución del MVP |
| D-09 | El candidato puede pausar, reanudar y revocar permisos |
| D-10 | El producto no crea una bandeja paralela de comunicaciones |
| D-11 | El servicio es pagado; la economía unitaria se evalúa por resultado confirmado |
| D-12 | No se garantiza compatibilidad universal ni contratación |

## 15. Glossary

- **Mandato:** instrucción estructurada que define objetivo, fuentes, filtros, límites y permisos de una campaña.
- **Restricción obligatoria:** condición que excluye una oportunidad cuando se incumple.
- **Preferencia flexible:** criterio que influye en la evaluación sin actuar como exclusión absoluta.
- **Oportunidad:** vacante identificada en una fuente externa.
- **Candidatura:** registro de la solicitud de una persona para una oportunidad.
- **Confirmada:** el destino presenta una señal observable de recepción.
- **No confirmada:** hubo un intento, pero no existe evidencia suficiente de recepción.
- **Pendiente de revisión:** la tarea requiere información, autorización o presencia del candidato.
- **Campaña:** mandato que agrupa el trabajo de búsqueda y postulación.
- **Fuente:** portal, ATS, página corporativa o canal externo autorizado.

## 16. References

**Fecha de consulta de fuentes públicas:** 24 de noviembre de 2026.

1. OIT — [Tendencias del mercado laboral en América Latina y el Caribe, 2026](https://www.ilo.org/es/publications/tendencias-del-mercado-laboral-en-america-latina-y-el-caribe).
2. Tsenta — [Pricing](https://tsenta.com/pricing) y [planes y definición de candidatura](https://help.tsenta.com/plans-and-pricing).
3. AIApply — [Planes, créditos y cobros](https://support.aiapply.co/es/articles/16864279-como-funcionan-los-planes-los-creditos-y-los-cobros).
4. JobCopilot — [Precios](https://jobcopilot.com/es/precios/).
5. LoopCV — [Pricing](https://www.loopcv.pro/pricing).
6. Winche — [Precios](https://winche.ai/es/pricing/) y [producto](https://winche.ai/es/).
7. OpenAI — [Using Cloud Browser in ChatGPT](https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt).
8. LinkedIn — [Automated activity](https://www.linkedin.com/help/linkedin/answer/a1341543).
9. Indeed — [Terms of Service](https://www.indeed.com/legal?hl=en_US).
10. Perú, ANPD — [Decreto Supremo 016-2024-JUS](https://www.gob.pe/institucion/anpd/normas-legales/6554453-n-016-2024-jus) y [vigencia del nuevo Reglamento](https://www.gob.pe/institucion/anpd/campa%C3%B1as/128319-nuevo-reglamento-de-proteccion-de-datos-personales).
11. Brasil, ANPD — [Transferência Internacional de Dados](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados) y [Resolução CD/ANPD 19/2024](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024).
12. Mirai — [Requirements Engineering](mirai_requirements.md), [Architecture & Design](../architecture/mirai_architecture.md), [UI/UX E2E](../design/mirai_ui_ux_e2e.md) y [Figma](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai).
