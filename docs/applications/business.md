# 08. Postulaciones, resultados y dashboard — Documento de negocio

> **Tipo:** Negocio  
> **Alcance:** Registro y clasificación de resultados, consultas, seguimiento y documentos asociados.  
> **Responsable:** Ingeniería de Mirai  
> **Última verificación:** 2026-11-24

## 1. Resumen

Cada registro de candidatura representa el resultado operativo de una oportunidad dentro de una campaña. Dashboard resume el trabajo de la cuenta; Applications permite explorar resultados y consultar su detalle. La recepción por el portal, una acción incierta y una intervención del candidato son situaciones distintas.

## 2. Actores y responsabilidades

| Actor | Responsabilidad |
|---|---|
| Candidato | Consulta resultados y resuelve intervenciones |
| Agente | Evalúa oportunidades, observa resultados y los registra |
| Portal laboral | Recibe candidaturas y presenta señales de resultado |
| Dashboard y Applications | Presentan datos persistidos, no inferencias a partir del texto del chat |

## 3. Estados de candidatura

| Estado | Significado funcional | Tratamiento |
|---|---|---|
| confirmed — Confirmada | El agente observa una señal suficiente de recepción por el destino | Cuenta como candidatura recibida |
| unconfirmed — No confirmada | El envío pudo ocurrir, pero no hay confirmación suficiente | Revisar antes de repetir; no presentarla como confirmada |
| pending_review — Pendiente de revisión | Falta información, permiso, acceso o acción personal | Resolver intervención; puede no haberse enviado |
| failed — Fallida | Fallo terminal conocido de la operación | Conservar motivo; no equivale a rechazo del empleador |
| skipped — Omitida | La oportunidad se excluye o no se continúa | No representa un envío |

Estos estados describen la operación de candidatura, no el proceso posterior de selección del empleador. Confirmada no significa entrevista, contratación o aprobación.

## 4. Flujo de registro

1. El agente inspecciona una oportunidad y aplica el mandato.
2. Decide postular, omitir o solicitar intervención.
3. Si opera el formulario, observa el resultado del destino.
4. Registra empresa, puesto, enlace, plataforma, ubicación, estado, motivo, documentos utilizados y fecha de envío cuando corresponda.
5. La campaña actualiza conteos y presupuesto; Dashboard y Applications reflejan el registro.

El agente debe guardar cada resultado antes de continuar otras acciones. Un clic no demuestra recepción. Un resultado pendiente no obliga a detener toda la campaña si hay oportunidades independientes.

## 5. Reconciliación e identidad

El mismo registro puede actualizarse sin crear otra fila. La identidad habitual distingue campaña, URL, plataforma y un intento genuinamente separado. No constituye deduplicación global entre campañas.

Una confirmada no se degrada a otro estado. La primera fecha de envío se conserva. Una candidatura no confirmada o pendiente de revisión puede reconciliarse después de detener la campaña. La reconciliación requiere observar el resultado, no reenviar a ciegas.

El presupuesto cuenta confirmadas, no confirmadas y cualquier registro con fecha de envío. Las cinco categorías de resultados y el presupuesto no son la misma métrica.

## 6. Dashboard

El candidato consulta:

- Conteos de candidaturas por estado.
- Conteos de campañas por estado.
- Cinco candidaturas recientes por actualización.
- Lista paginada de campañas y sus conteos.
- Mandato, motivo, estado y límite de la campaña seleccionada.
- Explorador de candidaturas filtrado por campaña.

Dashboard no controla Stop o Resume; esas acciones pertenecen a Chat. No calcula costo por candidatura ni métricas del proceso de contratación.

## 7. Applications y detalle

El explorador permite buscar por puesto, empresa, plataforma o ubicación; filtrar por estado; ordenar por actualización, empresa, puesto o estado; y cambiar de página. Dashboard incorpora filtro por campaña y configuración de columnas.

El detalle muestra puesto, empresa, URL, campaña, plataforma, ubicación, estado, motivo, fechas y documentos que se pueden resolver actualmente. Los enlaces documentales apuntan a la biblioteca vigente; no muestran una copia histórica congelada. Un documento eliminado deja de resolverse.

No existe edición manual de candidaturas desde la interfaz. El agente registra y reconcilia resultados. No se conserva una colección independiente de capturas o evidencia del portal.

## 8. Reglas de negocio

| ID | Regla |
|---|---|
| BR-APP-01 | Cada resultado pertenece a una campaña de la cuenta |
| BR-APP-02 | Solo una señal de recepción permite clasificar como confirmada |
| BR-APP-03 | Envío incierto y revisión pendiente son categorías distintas |
| BR-APP-04 | Fallo operativo no equivale a rechazo del empleador |
| BR-APP-05 | Omitir una oportunidad no significa enviarla |
| BR-APP-06 | No confirmada, pendiente y fallida requieren motivo |
| BR-APP-07 | La confirmación y la primera fecha de envío se preservan |
| BR-APP-08 | La reconciliación no implica reanudar la campaña |
| BR-APP-09 | Los documentos asociados pertenecen a la misma cuenta |
| BR-APP-10 | Los conteos reflejan registros persistidos |
| BR-APP-11 | El presupuesto incluye envíos inciertos y fechados |

## 9. Documentación relacionada

[Implementación técnica](technical.md) · [Campañas](../campaigns/business.md) · [Biblioteca de CV](../03.2_cv_library_and_management_business.md) · [Agente](../agent/business.md)
