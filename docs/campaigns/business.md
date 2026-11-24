# 06. Campañas de búsqueda laboral — Documento de negocio

> **Tipo:** Negocio  
> **Alcance:** Mandato, criterios, límites, seguimiento y ciclo de vida.  
> **Responsable:** Ingeniería de Mirai  
> **Última verificación:** 2026-11-24

## 1. Resumen

Una campaña agrupa el trabajo delegado por el candidato: buscar oportunidades, evaluarlas y, si el mandato lo autoriza, postular. Conserva el objetivo, sus condiciones, el límite y los resultados de la ejecución. La conversación constituye la superficie de instrucción y control; Dashboard permite consultar el trabajo persistido.

## 2. Actores y responsabilidades

| Actor | Responsabilidad |
|---|---|
| Candidato | Define y modifica el mandato, responde intervenciones, detiene y reanuda |
| Agente | Interpreta condiciones, selecciona fuentes, ejecuta el trabajo y registra resultados |
| Portal laboral | Presenta oportunidades, formularios y señales de recepción |
| Dashboard | Presenta campañas, motivos de estado y resultados |

## 3. Mandato y criterios

El mandato conserva la instrucción completa del candidato. Puede comprender roles, seniority, modalidad, ubicación, industria, salario, contrato, horarios, idiomas, exclusiones, fuentes y máximo de candidaturas. Los criterios complementan el mandato mediante condiciones descriptivas; el agente los evalúa junto al perfil y preferencias. Las fuentes se expresan en el mandato o criterios, no como una lista independiente.

Buscar o evaluar no autoriza enviar candidaturas. Una consulta conversacional o navegación directa no requiere crear campaña. Un nuevo mandato delegado crea una campaña distinta; una conversación puede contener varias.

## 4. Ciclo de vida

| Estado | Significado | Transiciones disponibles |
|---|---|---|
| running | Mandato en ejecución | stopped, completed, failed |
| stopped | Ejecución detenida, interrumpida o esperando información | running mediante reanudación |
| completed | Mandato finalizado | Terminal |
| failed | Fallo terminal del mandato | Terminal |

### 4.1. Creación y seguimiento

1. El candidato describe un mandato de varias etapas en Chat.
2. El agente interpreta objetivo, condiciones y límite; consulta el contexto profesional necesario.
3. Crea la campaña asociada a esa conversación e inicia el trabajo.
4. Chat muestra el resumen de campaña. Dashboard incorpora el registro y sus conteos.
5. El agente explora oportunidades, registra los resultados observados y actualiza el progreso.

No existe formulario independiente de creación o aprobación de campaña.

### 4.2. Modificar el mandato

El candidato envía nuevas instrucciones en la conversación. El agente actualiza título, mandato, criterios y límite de la campaña activa. Solo se modifica una campaña en ejecución. El límite alcanzado obliga al agente a finalizar, en lugar de ampliar unilateralmente el trabajo.

### 4.3. Detener y continuar

Stop cancela el turno del chat. La campaña activa queda detenida, salvo que ya haya alcanzado el límite y deba completarse. Se conservan los resultados registrados y el motivo de detención.

Resume permite continuar una campaña detenida desde la conversación correspondiente. El agente revisa las candidaturas inciertas antes de repetir acciones externas. En cambio, si solicitó un dato indispensable y dejó una tarea en espera, la respuesta del candidato continúa esa misma tarea. Una candidatura pendiente no obliga a detener oportunidades independientes.

### 4.4. Finalización y recuperación

El agente completa la campaña al alcanzar la condición de cierre del mandato. Puede marcarla fallida ante una condición terminal. Los errores recuperables y desconexiones detienen el trabajo, no representan por sí solos un fallo terminal.

Cuando Dashboard detecta una campaña que figura en ejecución pero no tiene trabajo activo, la recupera como detenida o completada según su presupuesto. Recuperar la conexión no reanuda por sí solo una campaña detenida.

## 5. Límite de candidaturas

Un máximo omitido significa que no hay límite numérico configurado. El presupuesto cuenta cada candidatura confirmada, no confirmada o que tenga fecha de envío, independientemente de su estado. Una pendiente sin fecha de envío no consume presupuesto.

El contador se actualiza después del registro de resultados. Al alcanzarlo, el agente debe detener nuevos envíos y completar el mandato. El límite no constituye una reserva anticipada de plazas.

## 6. Reglas de negocio

| ID | Regla |
|---|---|
| BR-CAM-01 | Cada campaña pertenece a una cuenta y a una conversación |
| BR-CAM-02 | Crear una campaña no reanuda otra |
| BR-CAM-03 | El mandato delimita búsqueda y postulación |
| BR-CAM-04 | El agente utiliza criterios y preferencias como contexto de evaluación |
| BR-CAM-05 | Las modificaciones requieren una campaña en ejecución |
| BR-CAM-06 | El presupuesto incluye envíos confirmados, inciertos o fechados |
| BR-CAM-07 | Stop controla la ejecución; Dashboard es de consulta |
| BR-CAM-08 | La reanudación de una detención manual requiere solicitud explícita |
| BR-CAM-09 | La respuesta solicitada por una tarea en espera continúa esa tarea |
| BR-CAM-10 | Las campañas completadas o fallidas son terminales |
| BR-CAM-11 | Una recuperación no duplica una ejecución activa |
| BR-CAM-12 | Los resultados registrados permanecen consultables tras detener el trabajo |

## 7. Información y resultados visibles

Chat presenta mandato, criterios, límite y conteos de campaña. Dashboard lista campañas y permite seleccionar una para consultar su mandato, estado, motivo, límite y candidaturas. Los conteos proceden de registros persistidos, no de mensajes del agente.

El registro de campaña no contiene todas las páginas visitadas ni todas las oportunidades exploradas. Los resultados se materializan al registrar una candidatura, incluida una oportunidad omitida.

## 8. Documentación relacionada

- [Agente autónomo](../agent/business.md)
- [Chat](../chat/business.md)
- [Navegador](../browser/business.md)
- [Postulaciones y resultados](../applications/business.md)
- [Implementación técnica](technical.md)
