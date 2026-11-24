# 06. Campañas de búsqueda laboral — Documentación técnica

> **Tipo:** Técnico  
> **Alcance:** Modelo de datos, herramientas, presupuesto, concurrencia, estados y recuperación.  
> **Responsable:** Ingeniería de Mirai  
> **Última verificación:** 2026-11-24

## 1. Arquitectura

Campaigns define el esquema de campaña. ResultsRepository, compartido con Applications, concentra persistencia, consultas, transiciones, presupuesto y recuperación. ChatExecution coordina la ejecución; MiraiAgent y miraiTools exponen el dominio al modelo.

~~~mermaid
flowchart LR
  Chat --> WorkspaceSocket --> ChatExecution --> MiraiAgent --> miraiTools --> ResultsRepository --> PostgreSQL
  Dashboard --> ResultsRoutes --> ResultsRepository
  ResultsRepository --> Notifications["mirai_results"]
  Notifications --> WorkspaceSocket
~~~

| Componente | Responsabilidad |
|---|---|
| Campaign Schema | Tabla y restricciones de campaña |
| ResultsRepository | Operaciones transaccionales, presupuesto y recuperación |
| AgentScope | campaignId, runningCampaignIds, taskMode y applicationLimitReached |
| ChatExecution | Cola, stop, resume, pausa, finalización y handoff |
| CampaignSummary | Resumen visible en Chat |
| DashboardPage | Consultas y selección de campaña |

## 2. Modelo de datos

Tabla users.campaigns:

| Campo | Tipo / significado |
|---|---|
| id | UUID PK |
| account_id | text; propietario |
| chat_session_id | text; identificador lógico de sesión ADK |
| title | text; título |
| mandate | text; mandato |
| criteria | JSONB object |
| max_applications | integer positivo, nullable |
| status | running, stopped, completed, failed |
| status_reason | text nullable |
| created_at, updated_at | timestamptz |
| started_at, ended_at | timestamptz nullable |

Unicidad compuesta (account_id, id) para la FK de Applications; índices por cuenta/actualización y cuenta/chat/actualización. La sesión de Vertex AI no tiene FK relacional. No existe una tabla CampaignSource ni revisión optimista de campaña.

## 3. Contratos y herramientas

Los contratos Zod residen en packages/contracts/src/results.ts. El título admite 200 caracteres, el mandato 30.000, criterios un objeto JSON y el máximo un entero positivo hasta 2.147.483.647 o null. Los motivos admiten hasta 20.000 caracteres.

| Herramienta | Entrada y resultado |
|---|---|
| createCampaign | Título, mandato, criterios opcionales, máximo opcional; genera UUID y selecciona campaña |
| listCampaigns | Página opcional; lista campañas del chat sin seleccionarlas |
| selectCampaign | ID y resume opcional; valida cuenta/chat, consulta presupuesto y reanuda stopped si se pide |
| updateCampaign | Campos editables; estado terminal opcional completed/failed y motivo |
| recordApplication | Registra resultado de la campaña seleccionada y devuelve presupuesto |
| listApplications / getApplication | Consultan resultados persistidos |

createCampaign transforma pares criterion/condition en un objeto, asigna máximo null si se omite y añade el ID a runningCampaignIds. El repositorio inserta running y startedAt; ON CONFLICT DO NOTHING devuelve el registro existente solo si coincide cuenta y chat, o CAMPAIGN_CONFLICT.

updateCampaign condiciona la escritura a cuenta, chat, ID y running. Si no coincide, CAMPAIGN_NOT_RUNNING. Los cambios de estado terminal son una operación compare-and-set posterior.

## 4. Estados y transiciones

~~~mermaid
stateDiagram-v2
    [*] --> running: createCampaign
    running --> stopped: Stop / pausa / interrupción
    stopped --> running: Resume / respuesta pendiente
    running --> completed: cierre / límite
    running --> failed: cierre terminal
    completed --> [*]
    failed --> [*]
~~~

transitionCampaign actualiza solo si coincide el estado anterior. Guarda statusReason y updatedAt; endedAt se establece únicamente para estados terminales. startedAt conserva el inicio inicial. Una transición concurrente que pierde el compare-and-set devuelve null.

## 5. Presupuesto de candidaturas

submissionBudget calcula el número de filas de la cuenta y campaña cuyo estado es confirmed o unconfirmed, o cuyo submitted_at no es nulo. Cada fila se cuenta una vez.

Devuelve submitted, max y reached (max no nulo y submitted mayor o igual al máximo). recordApplication calcula el presupuesto después del upsert en la misma transacción y bloquea la fila de campaña con FOR UPDATE. campaignBudget también permite consultarlo.

AgentScope acumula applicationLimitReached durante el turno. Si ya está alcanzado, updateCampaign rechaza cambiar el máximo o marcar failed con APPLICATION_LIMIT_REACHED. El agente debe completar el mandato. No hay reserva previa ni gate transaccional sobre los comandos del navegador; el registro de resultados no se rechaza únicamente por superar el máximo.

## 6. Ejecución, pausa y recuperación

### 6.1. Serialización

campaignTail serializa las mutaciones createCampaign, selectCampaign, updateCampaign, recordApplication y las herramientas de navegador dentro de la ejecución del agente. PostgreSQL añade bloqueo de fila para el registro de candidaturas y compare-and-set para transiciones. Los advisory locks de ejecución por chat coordinan la concurrencia entre procesos.

### 6.2. Stop y pausa

chat.action stop cancela el turno. El finalizador procesa runningCampaignIds: una campaña aún running se completa si alcanza el presupuesto; si no, se detiene con el motivo de ejecución.

pause_task conserva pendingTask en el estado de sesión y el motivo awaitingTaskInput. El siguiente mensaje que responde a esa espera continúa el mismo trabajo. Una detención manual no equivale a una tarea pendiente de respuesta.

### 6.3. Resume

chat.action resume lleva campaignId. ChatExecution valida ownership, conversación y estado stopped; encola y reanuda el trabajo. selectCampaign con resume=true realiza la transición desde stopped. Los estados terminales no se reabren mediante estas rutas. La UI consulta el estado de la campaña más reciente del chat para ofrecer Resume.

### 6.4. Recuperación y renovación

GET /v1/dashboard ejecuta stopInterruptedCampaigns antes de devolver el resumen. Bajo el advisory lock de handoff por cuenta, comprueba los locks de ejecución de los chats con campañas running. Si no hay ejecución activa, cambia las campañas a completed por límite o stopped por interrupción. No inicia trabajo nuevo.

La renovación controlada del workspace suspende turnos, conserva miraiWorkspaceHandoff y permite continuar en la conexión sucesora. Una desconexión ordinaria cancela ejecuciones; no equivale a renovación. Véase [Browser](../browser/mirai_browser_implementation.md).

## 7. Interfaces de consulta y eventos

| Método | Ruta | Salida |
|---|---|---|
| GET | /v1/campaigns | items y total; filtros status/chatSessionId, paginación |
| GET | /v1/campaigns/:id | CampaignSummary con conteos por estado |
| GET | /v1/dashboard | Conteos de campañas y candidaturas, cinco resultados recientes |
| GET | /v1/chats/:id/status | Estado de ejecución, campaña reciente y contexto |

Las rutas de resultados validan Bearer token, derivan accountId y usan Cache-Control: no-store. No ofrecen escritura REST. Los cambios publican pg_notify en mirai_results; WorkspaceSocket emite results.changed y el cliente invalida consultas de resultados y estado de chat.

## 8. Errores y garantías

| Condición | Resultado |
|---|---|
| Campaña ajena o inexistente | CAMPAIGN_NOT_FOUND |
| Creación con ID ocupado por otro ámbito | CAMPAIGN_CONFLICT |
| Cambio sin campaña seleccionada | CAMPAIGN_REQUIRED |
| Actualización fuera de running | CAMPAIGN_NOT_RUNNING |
| Transición concurrente | null |
| Presupuesto alcanzado y cambio de límite o fallo | APPLICATION_LIMIT_REACHED |
| Interrupción del workspace | Cancelación y recuperación del estado |

La identidad de cuenta/chat proviene del contexto autenticado. La FK de Applications impide relacionar resultados con campañas de otra cuenta. El repositorio no certifica las acciones externas del navegador.

## 9. Mapa de implementación

| Responsabilidad | Ruta |
|---|---|
| Schema | [campaigns/schema.ts](../../../apps/api/src/features/campaigns/schema.ts) |
| Persistencia | [resultsRepository.ts](../../../apps/api/src/features/applications/resultsRepository.ts) |
| Contratos | [results.ts](../../../packages/contracts/src/results.ts) |
| Tools | [miraiTools.ts](../../../apps/api/src/features/agents/miraiTools.ts) |
| Agente | [miraiAgent.ts](../../../apps/api/src/features/agents/miraiAgent.ts) |
| Ejecución | [chatExecution.ts](../../../apps/api/src/features/agents/chatExecution.ts) |
| REST | [applications/routes.ts](../../../apps/api/src/features/applications/routes.ts) |
| UI | [CampaignSummary.tsx](../../../apps/web/src/features/chat/CampaignSummary.tsx), [DashboardPage.tsx](../../../apps/web/src/features/dashboard/DashboardPage.tsx) |

[Negocio](mirai_campaigns.md) · [Applications](../applications/mirai_applications_implementation.md) · [Chat](../chat/mirai_chat_implementation.md)
