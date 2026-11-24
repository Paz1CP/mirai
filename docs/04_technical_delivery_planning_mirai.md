# 04. Technical Delivery Planning — Mirai

**Entregable:** Mapa de entrega y dependencias vigentes  
**Fecha:** 24 de noviembre de 2026

## 1. Propósito

Organizar el alcance técnico actual de Mirai por capacidades y dependencias. La descripción del sistema reside en Architecture & Design y en los documentos de cada feature; este mapa no certifica pruebas, entregas ni fechas.

## 2. Mapa de capacidades

| Área | Alcance vigente | Dependencia |
|---|---|---|
| Acceso | Identidad, cuenta y sesión | Neon Auth |
| Perfil | Importación, revisión, preferencias | Perfil profesional y originales |
| Biblioteca | CV principal, variantes, comparación de documentos actuales | Perfil, almacenamiento privado |
| Chat | Historial, adjuntos, turnos, cola, streaming | Sesiones ADK, workspace |
| Agente | Interpretación, herramientas de dominio y navegación | Chat, perfil, documentos, inferencia |
| Campaigns | Mandato, criterios, límite calculado, estados, recuperación | Chat, ResultsRepository |
| Browser | Chrome local, WXT, Playwright MCP, CDP, ownership y relay | Extensión, workspace, controlador |
| Applications | Cinco resultados operativos, detalle, búsqueda y Dashboard | Campaña, referencias documentales |
| Billing | Créditos y consumo de inferencia | Identidad, ledger, proveedor de pago |

## 3. Dependencias de ejecución

Identidad → perfil y biblioteca → chat y agente → workspace y navegador → campaña → registro de candidatura → consultas de resultados.

La navegación directa no exige campaña. El registro de candidatura sí exige una campaña asociada al chat. Las consultas de Dashboard no necesitan una sesión de navegador activa.

## 4. Fronteras de entrega

- El CV se selecciona entre documentos existentes; revision controla concurrencia, no historial.
- La preparación de archivos no completa su carga externa: DOM.setFileInputFiles está bloqueado.
- El presupuesto es un contador posterior al registro, no una reserva transaccional.
- Applications conserva resultados y referencias documentales actuales, no snapshots ni evidencia independiente.
- La identidad estable es local a la campaña.
- Chat controla Stop y Resume; Dashboard consulta y recupera campañas interrumpidas.
- El navegador permanece en Chrome; la UI no incluye viewport ni Operator.
- allow_communication se incorpora al prompt; no constituye un gate por comando de navegador.

## 5. Documentación de referencia

- [Discovery & Business Analysis](01.%20Discovery%20%26%20Business%20Analysis.md)
- [Requirements Engineering](02.%20Requirements%20Engineering.md)
- [Architecture & Design](03.%20Architecture%20%26%20Design.md)
- [Workflow E2E](03.1.%20Mirai%20WorkFlow%20E2E.md)
- [Biblioteca de CV](03.2_cv_library_and_management_technical.md)
- [Chat](chat/technical.md)
- [Agente](agent/technical.md)
- [Campañas](campaigns/technical.md)
- [Browser](browser/technical.md)
- [Applications](applications/technical.md)
- [Estándar de documentación](MIRAI_DOCUMENTATION_STANDARD.md)
