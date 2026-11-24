# 07. Control local del navegador y extensión — Documento de negocio

> **Tipo:** Negocio  
> **Alcance:** Conexión, pestañas, transferencia de control, actividad, detención y recuperación.  
> **Responsable:** Ingeniería de Mirai  
> **Última verificación:** 2026-11-24

## 1. Resumen

Mirai opera el navegador de escritorio del candidato, aprovechando sus sesiones existentes en portales laborales. La extensión vincula Chrome con el agente. El candidato controla el trabajo desde Chat y conserva su navegador real en su equipo.

## 2. Valor y actores

| Actor | Responsabilidad |
|---|---|
| Candidato | Instala la extensión, conecta Mirai, define el alcance y controla la ejecución |
| Agente | Selecciona pestañas, inspecciona páginas y ejecuta acciones del mandato |
| Extensión | Conecta el navegador local y ejecuta operaciones autorizadas por la conexión |
| Portal externo | Presenta datos, formularios, desafíos y resultados |

El agente puede reutilizar sesiones iniciadas, navegar por distintas fuentes y completar campos sin trasladar las credenciales del candidato a un navegador cloud.

## 3. Conexión y estados visibles

1. El candidato inicia sesión en Mirai desde Chrome de escritorio e instala la extensión.
2. Mirai detecta y conecta la extensión.
3. El workspace autenticado queda disponible.
4. El agente inicia el control del navegador cuando la tarea lo necesita.

| Estado | Significado | Acción |
|---|---|---|
| checking | Comprobación o restauración | Esperar conexión |
| connected | Conexión disponible | Utilizar Chat |
| unavailable | Extensión no accesible | Retry |
| incompatible | Extensión no compatible con el contrato de conexión | Actualizar y Retry |
| Conflicto de control | Otra instancia mantiene el workspace | Cancel o Transfer |

La conexión disponible no significa que exista una tarea activa. Dashboard y Applications permiten consultar resultados sin asumir el control de ejecución.

## 4. Pestañas y actividad

La pestaña de Mirai está protegida de la automatización. Las demás pestañas del perfil se exponen al agente, que puede seleccionar una existente, crear otra sin tomar el foco, navegar, inspeccionar, escribir y cerrar pestañas permitidas. No hay clasificación independiente de pestañas personales y de trabajo.

El candidato ve las páginas reales en Chrome. Chat muestra progreso, nombres de herramientas y respuesta del agente; no replica el navegador, ni presenta los argumentos, resultados o capturas de sus herramientas de navegación. No existe modo Operator en la interfaz activa.

El agente puede seleccionar y preparar un documento, pero la carga externa de archivos no se completa mediante el control disponible. Preparar el CV no equivale a haberlo adjuntado.

## 5. Transferencia de control

La cuenta mantiene un workspace controlador. Si se abre Mirai desde otra instancia y aparece un conflicto, el candidato elige Cancel o Transfer. Cancel conserva el control existente. Transfer autoriza la nueva página al workspace o sustituye la instancia controladora, según la conexión utilizada.

Las páginas autorizadas pueden compartir el workspace; no representan controladores independientes. Las áreas de consulta no muestran el diálogo de transferencia.

## 6. Detener, reanudar y recuperarse

- Stop cancela el trabajo activo del Chat; los resultados persistidos se conservan. No revierte una acción ya entregada al portal.
- Resume continúa una campaña detenida desde su conversación. Una tarea que espera una respuesta continúa con la respuesta solicitada.
- La renovación controlada de la conexión puede mantener la continuidad del turno.
- La pérdida real de la conexión del workspace cancela sus ejecuciones. Al reconectar, se recupera el acceso; la campaña detenida requiere reanudación explícita.
- Cerrar únicamente la página de Mirai no equivale a Stop: la extensión puede conservar la conexión.

Si una acción externa quedó incierta, el agente revisa el destino antes de repetirla. El usuario puede consultar los resultados ya guardados en Dashboard.

## 7. Reglas de negocio

| ID | Regla |
|---|---|
| BR-BRW-01 | El navegador controlado es el del candidato |
| BR-BRW-02 | La pestaña controladora está protegida |
| BR-BRW-03 | Las demás pestañas accesibles pueden seleccionarse |
| BR-BRW-04 | Una cuenta mantiene un controlador de workspace |
| BR-BRW-05 | La transferencia requiere autorización explícita |
| BR-BRW-06 | Las pestañas nuevas no toman el foco |
| BR-BRW-07 | La actividad del navegador se representa en Chat, sin viewport integrado |
| BR-BRW-08 | Stop y Resume controlan la tarea, no un estado visual de la pestaña |
| BR-BRW-09 | Reconectar no autoriza repetir acciones inciertas |
| BR-BRW-10 | Preparar un archivo no significa que el portal lo haya recibido |
| BR-BRW-11 | La autorización del candidato no sustituye las condiciones del portal |

## 8. Documentación relacionada

[Implementación técnica](mirai_browser_implementation.md) · [Chat](../chat/mirai_chat.md) · [Campañas](../campaigns/mirai_campaigns.md) · [Agente](../agent/mirai_agent.md)
