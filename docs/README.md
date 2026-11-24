# Documentación de Mirai

Este directorio reúne la documentación de producto, arquitectura, funcionalidades, diseño, plataforma y operación de Mirai. Los documentos canónicos describen el comportamiento y la implementación vigentes; los registros de entrega y notas de trabajo se mantienen separados.

## Mapa de documentación

| Área | Contenido |
|---|---|
| [Producto](product/) | Discovery, requisitos y flujo E2E |
| [Arquitectura](architecture/) | Arquitectura general del sistema |
| [Features](features/) | Comportamiento e implementación de cada capacidad |
| [Diseño](design/) | Design System, UI/UX, materiales de Figma y capturas |
| [Plataforma](platform/) | Security & Privacy, Infrastructure & Deployment, Developer Environment |
| [Estándares](standards/) | Convenciones para redactar y mantener documentación |
| [Proceso](process/) | Ciclo de vida de desarrollo de producto |
| [Planificación](planning/) | Mapa de capacidades y dependencias |
| [Entregas](delivery/) | Evidencia y notas de entregas concretas |
| [Notas](notes/) | Notas de trabajo no canónicas y sus recursos |

## Producto y arquitectura

- [Discovery](product/mirai_discovery.md)
- [Requirements](product/mirai_requirements.md)
- [Workflow E2E](product/mirai_workflow_e2e.md)
- [Arquitectura de Mirai](architecture/mirai_architecture.md)
- [Plan técnico de entrega](planning/mirai_technical_delivery_plan.md)
- [Ciclo de vida de desarrollo](process/mirai_product_development_lifecycle.md)

## Features

| Feature | Comportamiento del producto | Implementación |
|---|---|---|
| Agente | [mirai_agent.md](features/agent/mirai_agent.md) | [mirai_agent_implementation.md](features/agent/mirai_agent_implementation.md) |
| Applications | [mirai_applications.md](features/applications/mirai_applications.md) | [mirai_applications_implementation.md](features/applications/mirai_applications_implementation.md) |
| Browser | [mirai_browser.md](features/browser/mirai_browser.md) | [mirai_browser_implementation.md](features/browser/mirai_browser_implementation.md) |
| Campaigns | [mirai_campaigns.md](features/campaigns/mirai_campaigns.md) | [mirai_campaigns_implementation.md](features/campaigns/mirai_campaigns_implementation.md) |
| Chat | [mirai_chat.md](features/chat/mirai_chat.md) | [mirai_chat_implementation.md](features/chat/mirai_chat_implementation.md) |
| Biblioteca de CV | [mirai_cv_library.md](features/cv_library/mirai_cv_library.md) | [mirai_cv_library_implementation.md](features/cv_library/mirai_cv_library_implementation.md) |

## Plataforma

- [Security & Privacy](platform/mirai_security_and_privacy.md)
- [Infrastructure & Deployment](platform/mirai_infrastructure_and_deployment.md)
- [Developer Environment](platform/mirai_developer_environment.md)

## Diseño y documentación

- [Design System](design/mirai_design_system.md)
- [UI/UX E2E](design/mirai_ui_ux_e2e.md)
- [Encargo E2E para Figma](design/mirai_codex_figma_e2e_prompt.md)
- [Estándar de documentación](standards/mirai_documentation_standard.md)

## Entregas y notas

- [Entrega de la biblioteca de CV](delivery/mirai_cv_library_delivery.md)
- [Nota sobre distribución de la extensión](notes/mirai_extension_distribution.md)

## Convención de nombres

Los documentos Markdown canónicos utilizan el prefijo `mirai_` y nombres en `snake_case`. Dentro de cada feature, el archivo principal describe el comportamiento del producto y el archivo terminado en `_implementation.md` describe su implementación. El tipo de perspectiva se declara en los metadatos del documento, no en el nombre del archivo.
