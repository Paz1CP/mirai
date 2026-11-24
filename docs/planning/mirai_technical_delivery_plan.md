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

- [Discovery & Business Analysis](../product/mirai_discovery.md)
- [Requirements Engineering](../product/mirai_requirements.md)
- [Architecture & Design](../architecture/mirai_architecture.md)
- [Workflow E2E](../product/mirai_workflow_e2e.md)
- [Biblioteca de CV](../features/cv_library/mirai_cv_library_implementation.md)
- [Chat](../features/chat/mirai_chat_implementation.md)
- [Agente](../features/agent/mirai_agent_implementation.md)
- [Campañas](../features/campaigns/mirai_campaigns_implementation.md)
- [Browser](../features/browser/mirai_browser_implementation.md)
- [Applications](../features/applications/mirai_applications_implementation.md)
- [Estándar de documentación](../standards/mirai_documentation_standard.md)
