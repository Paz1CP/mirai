# Documentación de Mirai

[← Volver a Mirai](../README.md)

Este directorio reúne la documentación de producto, arquitectura, funcionalidades, diseño, plataforma y operación. Los documentos canónicos describen el comportamiento y la implementación vigentes; los registros de entrega y notas se mantienen separados.

## 🧭 Producto y arquitectura

| Documento | Alcance |
|---|---|
| [Discovery](product/mirai_discovery.md) | Contexto y propuesta de valor |
| [Requirements](product/mirai_requirements.md) | Requisitos |
| [Workflow E2E](product/mirai_workflow_e2e.md) | Recorrido operativo del candidato |
| [Arquitectura](architecture/mirai_architecture.md) | Diseño del sistema |
| [Plan técnico](product/mirai_technical_delivery_plan.md) | Organización de capacidades |
| [Ciclo de desarrollo](product/mirai_product_development_lifecycle.md) | Proceso de ingeniería |

## 🧩 Features

| Feature | Producto | Implementación |
|---|---|---|
| Agente | [Comportamiento](features/agent/mirai_agent.md) | [Técnico](features/agent/mirai_agent_implementation.md) |
| Applications | [Comportamiento](features/applications/mirai_applications.md) | [Técnico](features/applications/mirai_applications_implementation.md) |
| Browser | [Comportamiento](features/browser/mirai_browser.md) | [Técnico](features/browser/mirai_browser_implementation.md) |
| Campaigns | [Comportamiento](features/campaigns/mirai_campaigns.md) | [Técnico](features/campaigns/mirai_campaigns_implementation.md) |
| Chat | [Comportamiento](features/chat/mirai_chat.md) | [Técnico](features/chat/mirai_chat_implementation.md) |
| Biblioteca de CV | [Comportamiento](features/library/mirai_cv_library.md) | [Técnico](features/library/mirai_cv_library_implementation.md) |

## ⚙️ Plataforma

| Documento | Alcance |
|---|---|
| [CI/CD y DevSecOps](platform/mirai_ci_cd.md) | Pipeline, gates, migraciones, despliegue y rollback |
| [Infrastructure & Deployment](platform/mirai_infrastructure_and_deployment.md) | Topología, contenedores y recursos cloud |
| [Developer Environment](platform/mirai_developer_environment.md) | Configuración y comandos locales |
| [Security & Privacy](platform/mirai_security_and_privacy.md) | Identidad, permisos y datos |

## 🎨 Diseño y estándares

- [Design System](design/mirai_design_system.md)
- [UI/UX E2E](design/mirai_ui_ux_e2e.md)
- [Estándar de documentación](product/mirai_documentation_standard.md)

## 📎 Entregas y notas

- [Entrega de biblioteca de CV](delivery/mirai_cv_library_delivery.md)
- [Distribución de la extensión](notes/mirai_extension_distribution.md)

Los documentos canónicos utilizan el prefijo mirai_ y nombres en snake_case. La perspectiva se declara en los metadatos. Consultar el estándar para las convenciones completas.
