# 08. Postulaciones, resultados y dashboard — Documentación técnica

> **Tipo:** Técnico  
> **Alcance:** Esquema, identidad, upsert, ownership, referencias documentales, agregaciones, consultas y eventos.  
> **Responsable:** Ingeniería de Mirai  
> **Última verificación:** 2026-11-24

## 1. Arquitectura

Applications comparte ResultsRepository con Campaigns. El agente escribe resultados mediante recordApplication; Dashboard y Applications consumen las rutas GET protegidas. PostgreSQL conserva los registros; las notificaciones invalidan las consultas de la interfaz.

~~~mermaid
flowchart LR
  Agent --> miraiTools --> ResultsRepository --> PostgreSQL
  Dashboard --> ResultsRoutes --> ResultsRepository
  ApplicationExplorer --> ResultsRoutes
  ApplicationDetail --> ResultsRoutes
  ResultsRepository --> Notify["mirai_results"] --> WorkspaceSocket --> Query["React Query"]
~~~

## 2. Modelo de datos

Tabla users.applications:

| Campo | Tipo / significado |
|---|---|
| id | UUID PK |
| account_id | text, propietario |
| campaign_id | UUID, campaña |
| company_name, job_title, job_url | text, obligatorios |
| platform, location | text nullable |
| status | confirmed, unconfirmed, pending_review, failed, skipped |
| status_reason | text nullable |
| document_refs | JSONB array de id y kind |
| submitted_at | timestamptz nullable |
| created_at, updated_at | timestamptz |

FK compuesta (account_id, campaign_id) a campaigns(account_id, id), ON DELETE RESTRICT. Constraints: estados admitidos, document_refs array y motivo no vacío salvo confirmed/skipped. Índices por cuenta/updatedAt, cuenta/campaña/updatedAt y cuenta/estado/updatedAt, con ID para orden estable.

No existe entidad Opportunity, historial SubmissionAttempt, almacén ApplicationEvidence, reserva de envíos ni snapshot de CV. Los datos de la vacante y el resultado se guardan en la misma fila.

## 3. Contratos

packages/contracts/src/results.ts define recordApplicationSchema, applicationSchema, applicationDetailSchema y consultas paginadas.

| Campo | Validación |
|---|---|
| id, campaignId | UUID |
| companyName, jobTitle | 1–250 caracteres |
| jobUrl | HTTP/HTTPS, hasta 4.000 caracteres |
| platform, location | Nullable; hasta 150 y 250 caracteres |
| status | Cinco estados admitidos |
| statusReason | Nullable; hasta 20.000; obligatorio para unconfirmed, pending_review, failed |
| submittedAt | ISO datetime o null |
| documentRefs | Hasta 20 pares UUID y kind (cv/original) |

El DTO de lista incluye campaignTitle y timestamps. El detalle agrega documents con nombre resuelto. La escritura exige la campaña seleccionada en AgentScope y el chat autenticado.

## 4. Identidad e idempotencia

miraiTools genera applicationId si no recibe un ID explícito. Normaliza la URL mediante URL y elimina el fragmento; normaliza la plataforma con trim/lowercase; serializa campaña, URL, plataforma y attemptKey opcional. SHA-256 proporciona una identidad UUID determinista. El attemptKey (hasta 120 caracteres) diferencia intentos genuinamente separados. El ID devuelto debe reutilizarse al reconciliar.

La campaña forma parte de la identidad: repetir una oportunidad en otra campaña no produce necesariamente el mismo registro. La idempotencia es de persistencia, no una garantía de que el portal no reciba dos acciones externas.

## 5. Flujo transaccional

1. recordApplication valida el scope y los argumentos.
2. ResultsRepository resuelve referencias documentales de la cuenta.
3. Inicia transacción y bloquea la campaña por accountId, chatSessionId e ID con FOR UPDATE.
4. Lee la candidatura previa por ID, propietario y campaña.
5. Si la campaña no está running, admite reconciliar unconfirmed/pending_review; en otros casos solo devuelve idempotentemente el resultado existente del mismo estado.
6. Ejecuta INSERT ON CONFLICT DO UPDATE por ID, condicionado a ownership y campaña.
7. Impide degradar confirmed a cualquier otro estado. Preserva la primera fecha no nula mediante COALESCE(existing, excluded).
8. Solo actualiza cuando los campos son distintos. Si no hubo escritura, devuelve el registro existente autorizado; si pertenece a otro ámbito, APPLICATION_CONFLICT.
9. Calcula presupuesto dentro de la transacción y devuelve el DTO.
10. Publica mirai_results si hay mutación.

El repositorio no consulta el portal externo. confirmed representa la observación registrada por el agente. statusReason conserva su explicación, no un artefacto independiente de recepción.

## 6. Referencias documentales

document_refs almacena únicamente id y kind. resolveDocuments consulta cv_documents y original_documents filtrando accountId y omite referencias inexistentes o ajenas. getApplication resuelve nuevamente nombres y disponibilidad actuales.

No se almacena revision, profile, storage_key ni bytes históricos. La edición de un documento no cambia su identidad; la eliminación impide resolver la referencia. Véase [CV Library](../cv_library/mirai_cv_library_implementation.md).

## 7. Presupuesto y estados

submissionBudget cuenta filas cuyo status es confirmed/unconfirmed o submittedAt no es null. La operación cuenta cada fila una vez. El cálculo posterior al upsert devuelve submitted, max y reached; no reserva plazas antes de enviar. El finalizador de ChatExecution y la recuperación de campañas consultan este presupuesto. Véase [Campaigns](../campaigns/mirai_campaigns_implementation.md).

| Estado | Motivo requerido | Consume presupuesto sin fecha de envío |
|---|---|---|
| confirmed | No | Sí |
| unconfirmed | Sí | Sí |
| pending_review | Sí | No |
| failed | Sí | No |
| skipped | No | No |

## 8. Consultas, filtros y agregaciones

listApplications filtra accountId obligatorio y campaignId/status/q opcionales. q busca empresa, puesto, plataforma y ubicación. sort admite updatedAt, companyName, jobTitle, status; direction asc/desc. Por defecto updatedAt desc, página 1 y 20 resultados. page admite 1–1.000.000 y pageSize 1–100. Aplica LIMIT/OFFSET y devuelve items/total.

getApplication devuelve el resultado unido a su campaña por cuenta/ID y los documentos resueltos. listCampaigns filtra por cuenta, estado y chat; agrega candidaturas por campaña y estado. getDashboardSummary devuelve counts, campaignCounts y cinco candidaturas recientes por actualización.

El dashboard ejecuta stopInterruptedCampaigns antes de leer el resumen. Esta recuperación puede modificar campañas huérfanas; no es una lectura estrictamente pura.

## 9. Endpoints y eventos

| Método | Ruta | Respuesta |
|---|---|---|
| GET | /v1/dashboard | Resumen de la cuenta |
| GET | /v1/applications | Página filtrada de resultados |
| GET | /v1/applications/:id | Detalle |
| GET | /v1/campaigns | Página de campañas |
| GET | /v1/campaigns/:id | Campaña con conteos |

createResultsRoutes se monta bajo /v1; verifica identidad, deriva accountId y establece Cache-Control: no-store. No hay endpoints REST de escritura.

Las mutaciones publican pg_notify('mirai_results', payload de cuenta). WorkspaceSocket envía results.changed; useController invalida las consultas de resultados y estado de chat; React Query recarga las vistas activas.

## 10. Errores y consistencia

| Condición | Resultado |
|---|---|
| Falta de autenticación | 401 AUTH_REQUIRED |
| Query o parámetros inválidos | 400 INVALID_REQUEST |
| Recurso inexistente/ajeno | 404 APPLICATION_NOT_FOUND o CAMPAIGN_NOT_FOUND en REST |
| Registro sin campaña seleccionada | CAMPAIGN_REQUIRED |
| Campaña inexistente o ajena al chat | CAMPAIGN_NOT_FOUND |
| Nueva escritura en campaña no activa | CAMPAIGN_NOT_RUNNING |
| Colisión de identidad fuera del ámbito | APPLICATION_CONFLICT |
| Referencia documental no autorizada | Se omite |

La escritura está serializada por fila de campaña y limitada por la FK compuesta. El propietario se toma del contexto autenticado, nunca de un argumento libre del modelo.

## 11. Mapa de implementación

| Componente | Ruta |
|---|---|
| Esquema | [applications/schema.ts](../../../apps/api/src/features/applications/schema.ts) |
| Repositorio | [resultsRepository.ts](../../../apps/api/src/features/applications/resultsRepository.ts) |
| Contratos | [results.ts](../../../packages/contracts/src/results.ts) |
| Identidad y herramienta | [miraiTools.ts](../../../apps/api/src/features/agents/miraiTools.ts) |
| Rutas | [applications/routes.ts](../../../apps/api/src/features/applications/routes.ts) |
| Dashboard | [DashboardPage.tsx](../../../apps/web/src/features/dashboard/DashboardPage.tsx) |
| Explorador | [ApplicationExplorer.tsx](../../../apps/web/src/features/applications/ApplicationExplorer.tsx) |
| Detalle | [ApplicationDetail.tsx](../../../apps/web/src/features/applications/ApplicationDetail.tsx) |
| Cliente | [resultsApi.ts](../../../apps/web/src/features/applications/resultsApi.ts) |
| Eventos | [workspaceSocket.ts](../../../apps/api/src/features/sessions/workspaceSocket.ts), [useController.ts](../../../apps/web/src/features/sessions/useController.ts) |

[Negocio](mirai_applications.md) · [Campaigns](../campaigns/mirai_campaigns_implementation.md)
