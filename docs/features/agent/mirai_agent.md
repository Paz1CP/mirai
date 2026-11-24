# Agente autónomo — Documento de negocio

> **Tipo:** Negocio  
> **Alcance:** Interpretación de mandatos, búsqueda de oportunidades, evaluación, selección documental, postulaciones y límites de autonomía  
> **Responsable:** Ingeniería de Mirai  
> **Última verificación:** 2026-11-24  
> **Documentos relacionados:** [Campañas](../campaigns/mirai_campaigns.md) · [Browser](../browser/mirai_browser.md) · [Postulaciones](../applications/mirai_applications.md)

## 1. Resumen

Mirai es un agente de búsqueda laboral y postulación que recibe instrucciones en lenguaje natural y puede ejecutar trabajo de varias etapas desde el navegador del usuario.

El usuario define un mandato. Mirai interpreta sus condiciones, consulta la información profesional disponible, explora fuentes laborales, evalúa oportunidades, selecciona documentos existentes, completa formularios, realiza postulaciones cuando el mandato lo autoriza y registra el resultado observado.

El agente también puede realizar consultas conversacionales, revisar información guardada y navegar directamente sin iniciar una campaña.

## 2. Propósito y valor

- Reducir el trabajo manual de descubrir y revisar vacantes.
- Aplicar las restricciones y preferencias profesionales del candidato.
- Evitar respuestas basadas en experiencia o datos personales inventados.
- Ejecutar tareas rutinarias de búsqueda y postulación dentro del mandato delegado.
- Mantener resultados consultables y distinguir confirmaciones de situaciones inciertas.
- Solicitar intervención humana únicamente cuando una decisión o acción personal sea indispensable.

## 3. Actores y responsabilidades

| Actor | Responsabilidad | Condiciones de participación |
|---|---|---|
| Candidato | Define el mandato, proporciona información veraz, establece restricciones y atiende intervenciones personales | Debe estar autenticado y disponer de su información profesional |
| Mirai | Interpreta, busca, evalúa, selecciona documentos, opera formularios y registra resultados | Actúa dentro del mandato y del acceso disponible |
| Gemini | Razona sobre instrucciones, información profesional y contenido de las páginas | Recibe el contexto y las herramientas disponibles |
| Navegador del candidato | Proporciona las pestañas, sesiones y formularios de los sitios externos | Requiere conexión del workspace y de la extensión |
| Portal laboral | Publica vacantes y recibe postulaciones | Sus requisitos, acceso y respuestas determinan el resultado externo |

## 4. Alcance funcional

### Incluye

- Interpretar instrucciones de búsqueda laboral y postulación.
- Consultar perfil, preferencias, restricciones y documentos existentes.
- Crear y administrar campañas asociadas a conversaciones.
- Elegir fuentes y estrategias de búsqueda de manera adaptativa.
- Inspeccionar vacantes y evaluar compatibilidad.
- Seleccionar un CV u original existente.
- Preparar el documento seleccionado para un formulario. La asignación del archivo al input externo está bloqueada por la extensión y no se considera una carga completada.
- Completar formularios con información profesional verificada.
- Enviar postulaciones cuando el mandato es de postulación.
- Registrar resultados confirmados, inciertos, pendientes, fallidos u omitidos.
- Continuar una campaña después de una respuesta del usuario.
- Consultar campañas y postulaciones anteriores.

### Límites del alcance actual

- La búsqueda se realiza mediante el navegador conectado; el agente no dispone de conectores específicos para cada portal laboral.
- La evaluación de compatibilidad es razonamiento del modelo; no existe un motor independiente de scoring ni un umbral numérico.
- El agente puede seleccionar documentos existentes, pero su conjunto de herramientas no permite editar ni crear variantes de CV durante una campaña.
- La confirmación de una postulación se basa en la evidencia observada por el agente en el destino; el registro interno no consulta por sí solo al ATS para certificar la recepción.
- El agente no realiza entrevistas, evaluaciones personales ni decisiones contractuales en nombre del candidato.

## 5. Conceptos y funcionamiento

### 5.1. Mandato

Es la instrucción que define el trabajo delegado. Puede especificar:

- Puestos, roles y especializaciones.
- Países, regiones y ubicaciones.
- Trabajo remoto, híbrido o presencial.
- Seniority y experiencia.
- Industria y tecnologías.
- Idiomas.
- Salario, moneda y periodicidad.
- Contrato y horario.
- Movilidad y patrocinio de visa.
- Exclusiones y restricciones.
- Límite máximo de postulaciones.

El mandato puede ser de búsqueda y evaluación, o de búsqueda con postulación.

### 5.2. Campaña

Una campaña representa un mandato de búsqueda o postulación de varias etapas. Conserva el título, la descripción del mandato, los criterios, el límite y su estado.

Una campaña puede explorar varias plataformas y vacantes. No se crea una campaña independiente por cada portal o candidatura.

Cada nuevo mandato delegado de búsqueda o postulación inicia una campaña. La navegación directa y las consultas locales de información profesional no requieren una campaña.

### 5.3. Perfil y preferencias

El agente consulta los datos profesionales guardados y las preferencias del candidato. Las preferencias distinguen condiciones obligatorias y preferencias flexibles para roles, seniority, industria, modalidad, ubicación, salario, horario, contrato, idiomas y movilidad.

El agente no debe convertir una preferencia flexible en una exclusión obligatoria ni relajar una restricción estricta para aumentar el número de vacantes.

### 5.4. Oportunidad

Es una vacante real o una oportunidad de contratación identificada en una fuente accesible. Su evaluación considera empresa, puesto, requisitos, ubicación, modalidad, fecha, elegibilidad y ruta de postulación.

### 5.5. Compatibilidad

La compatibilidad se determina mediante el razonamiento del agente sobre la información disponible. Se priorizan requisitos indispensables y restricciones explícitas; las preferencias flexibles ayudan a ordenar oportunidades.

No se presenta un porcentaje ni una puntuación numérica como si existiera un algoritmo determinista.

### 5.6. Selección documental

El agente consulta los CV editables y documentos originales disponibles. Puede leer los datos profesionales de un CV y utilizar el documento seleccionado para una carga.

Si un original no tiene un CV extraído asociado, el agente no puede inferir su contenido profesional a partir del nombre del archivo.

### 5.7. Resultado de postulación

Cada intento se registra con una identidad estable, la oportunidad, el estado, la explicación disponible y las referencias documentales utilizadas.

## 6. Flujos de negocio

### 6.1. Interpretar la instrucción

1. Mirai recibe el mensaje.
2. Distingue entre una consulta normal, una revisión local de información, navegación directa y un mandato delegado.
3. Para una búsqueda o postulación delegada, consulta el perfil, las preferencias y los documentos del candidato.
4. Identifica roles, ubicaciones, modalidades, seniority, condiciones obligatorias, preferencias y exclusiones.
5. Determina si el mandato permite únicamente buscar o también postular.
6. Crea una campaña para el mandato delegado.
7. Pregunta al usuario solo cuando falta una decisión o dato indispensable para avanzar.

No existe un paso independiente de aprobación del resumen del mandato antes de que el agente empiece a trabajar. La instrucción del usuario es la fuente de autorización interpretada por el agente.

### 6.2. Descubrir oportunidades

1. El agente identifica las fuentes accesibles y relevantes para el mercado del candidato.
2. Reutiliza las pestañas disponibles cuando corresponden.
3. Explora buscadores, filtros, resultados, perfiles, publicaciones y rutas de postulación que existan en cada plataforma.
4. Formula búsquedas a partir de roles, tecnologías, regiones, seniority y modalidades.
5. Recorre resultados relevantes y sigue oportunidades relacionadas.
6. Regresa a la fuente original después de explorar una ruta externa cuando todavía quedan resultados útiles.

La estrategia de búsqueda prioriza publicaciones recientes: primero las últimas 24 horas, después los últimos 7 días y, cuando es útil, ventanas de hasta 30 días. Esas ventanas orientan la prioridad, no excluyen automáticamente una vacante anterior que siga abierta y sea compatible.

### 6.3. Evaluar compatibilidad

1. Inspecciona una vacante real.
2. Identifica requisitos obligatorios y deseables.
3. Compara los requisitos con el perfil y las preferencias.
4. Comprueba ubicación, autorización laboral y modalidad.
5. Revisa la ruta de postulación.
6. Consulta registros de la campaña para evitar repetir oportunidades.
7. Decide si continúa, omite o deja pendiente la oportunidad.

Una vacante incompatible con una restricción obligatoria se omite. La ausencia de una preferencia deseable no es por sí sola motivo para rechazarla.

### 6.4. Seleccionar el CV

1. Consulta la biblioteca de documentos.
2. Identifica CV principal, CV predeterminado, variantes y originales disponibles.
3. Lee los documentos relevantes cuando necesita comparar su contenido.
4. Selecciona el documento que representa de forma veraz al candidato para esa oportunidad.
5. Prepara el archivo seleccionado cuando el formulario requiere una carga.

La selección se realiza entre documentos existentes. No se debe afirmar que el agente adapta o crea una nueva variante durante la campaña. El ciclo de vida completo de originales, CV principal y variantes está descrito en [Biblioteca y gestión de CV](../cv_library/mirai_cv_library.md).

### 6.5. Completar y enviar una postulación

1. Verifica que el mandato incluya postular.
2. Inspecciona el formulario real y sus pasos.
3. Completa los campos con información confirmada del candidato.
4. Prepara el documento seleccionado si el formulario requiere un archivo.
5. Identifica campos desconocidos o acciones personales.
6. Completa los campos que puede operar dentro del mandato.
7. Observa la respuesta del portal y registra el resultado.
8. Si el portal requiere adjuntar un archivo, el flujo no puede completar esa operación mediante browser_file_upload porque DOM.setFileInputFiles está bloqueado; no se debe afirmar que el documento fue adjuntado.

Para un mandato de búsqueda y evaluación, Mirai no envía postulaciones.

### 6.6. Verificar y registrar el resultado

| Estado | Significado | Tratamiento |
|---|---|---|
| confirmed | El destino muestra una confirmación observable | Se registra como confirmada |
| unconfirmed | La postulación pudo enviarse, pero no hay prueba suficiente de recepción | Se conserva como incierta y se reconcilia antes de repetir |
| pending_review | Falta información, autorización, acceso o una acción del candidato | Requiere intervención |
| failed | Existe un fallo definitivo conocido | Se registra la causa |
| skipped | La oportunidad se excluye o no cumple las condiciones | No se envía |

Un clic o un formulario completo no bastan para considerar confirmada una postulación. La confirmación depende de la evidencia observada en la página de destino.

### 6.7. Completar la campaña

1. Continúa explorando las rutas relevantes de las fuentes elegidas.
2. Verifica resultados inciertos y registros pendientes.
3. Actualiza el estado de la campaña.
4. Emite un informe final con resultados y bloqueos.
5. Distingue candidaturas confirmadas, inciertas, pendientes, fallidas y omitidas.

Un mensaje de progreso no equivale a la finalización de una campaña.

## 7. Reglas de negocio

| ID | Regla | Condición | Resultado |
|---|---|---|---|
| BR-AGENT-01 | Un mandato delegado crea una campaña | Nueva búsqueda o postulación de varias etapas | Una campaña agrupa las fuentes y vacantes del mandato |
| BR-AGENT-02 | Búsqueda y postulación son alcances distintos | El usuario solicita solo descubrir o evaluar | El agente no envía candidaturas |
| BR-AGENT-03 | Una postulación delegada autoriza trabajo rutinario | El usuario solicita postular y define el alcance | No se pide aprobación rutinaria de cada formulario |
| BR-AGENT-04 | Restricciones obligatorias prevalecen | Una vacante contradice una condición estricta | Se omite la oportunidad |
| BR-AGENT-05 | Preferencias flexibles no son exclusiones | Falta una condición deseable | Se evalúa el resto de la compatibilidad |
| BR-AGENT-06 | Solo se utilizan hechos verificados | Un formulario solicita información personal | El agente no inventa respuestas |
| BR-AGENT-07 | El CV debe ser pertinente y veraz | Existe más de un documento disponible | El agente selecciona el documento adecuado |
| BR-AGENT-08 | Un envío incierto no se repite a ciegas | No puede comprobarse la recepción | Se conserva como unconfirmed y se reconcilia |
| BR-AGENT-09 | Los resultados se registran antes de seguir | Se observa un resultado de postulación | Se registra antes de otra operación externa |
| BR-AGENT-10 | Una campaña detenida requiere reanudación | El usuario detuvo la campaña | Se exige una acción explícita de reanudación |
| BR-AGENT-11 | Una tarea que espera al usuario continúa con su respuesta | El agente solicita un dato indispensable | La respuesta continúa el mismo mandato |
| BR-AGENT-12 | Las comunicaciones requieren permiso y solicitud expresa | El usuario solicita contactar a un reclutador o responder un mensaje | El permiso de comunicaciones debe estar habilitado |

## 8. Estados y transiciones

### 8.1. Campaña

| Estado | Significado | Cómo se alcanza | Transición |
|---|---|---|---|
| running | Mandato en ejecución | Creación o reanudación | completed, stopped o failed |
| stopped | Mandato detenido o en espera | Stop, interrupción o espera de información | running mediante reanudación o respuesta correspondiente |
| completed | Mandato finalizado | Cierre del trabajo o límite alcanzado | Estado terminal |
| failed | Fallo terminal | Error que impide continuar con seguridad | Estado terminal |

Una tarea pausada porque necesita información del usuario conserva su contexto. La respuesta a la pregunta continúa el mismo trabajo y puede reactivar su campaña. Una detención manual o una desconexión no se reanuda simplemente enviando cualquier mensaje: requiere la acción explícita de reanudación.

### 8.2. Postulación

| Estado | Significado | Acción |
|---|---|---|
| confirmed | Recepción confirmada por evidencia observada | Contabilizar como confirmada |
| unconfirmed | Envío posible sin confirmación suficiente | Verificar antes de reintentar |
| pending_review | Falta dato, permiso o acción personal | Solicitar intervención |
| failed | Fallo definitivo conocido | Informar la causa |
| skipped | Excluida o no elegible | No enviar |

## 9. Autonomía, autorización e intervención humana

### 9.1. Decisiones que Mirai puede tomar dentro del mandato

- Elegir consultas, filtros y superficies de búsqueda.
- Elegir plataformas relevantes y rutas de exploración.
- Priorizar oportunidades por pertinencia y actualidad.
- Comparar vacantes con restricciones y preferencias.
- Elegir entre CV existentes.
- Completar campos utilizando datos profesionales verificados.
- Enviar postulaciones rutinarias cuando el mandato incluye postular.
- Registrar los resultados observados.
- Continuar con otras oportunidades cuando una vacante individual queda bloqueada.

### 9.2. Acciones que requieren autorización del usuario

- Iniciar una campaña de postulación: requiere que el usuario haya delegado explícitamente ese alcance.
- Ampliar el mandato más allá de las restricciones indicadas.
- Reanudar una campaña detenida manualmente.
- Leer, redactar o enviar comunicaciones laborales: requiere permiso de comunicaciones habilitado y una solicitud expresa del usuario.
- Resolver decisiones personales que no puedan deducirse de información confirmada.

No existe una autorización independiente por candidatura para los pasos rutinarios de una campaña de postulación delegada.

### 9.3. Acciones que debe realizar el candidato

| Situación | Responsabilidad de Mirai | Responsabilidad del candidato |
|---|---|---|
| Falta un dato personal | Identificar el campo y explicar por qué se necesita | Proporcionar o corregir el dato |
| Login o identidad | Detener la ruta que requiere intervención | Autenticarse o completar la verificación |
| CAPTCHA o control de acceso | No evadirlo y registrar el bloqueo | Resolverlo directamente si decide continuar |
| Evaluación o prueba personal | No responder en nombre del candidato | Realizar la evaluación |
| Entrevista | Organizar el contexto y comunicar la solicitud | Participar personalmente |
| Disponibilidad o negociación | No inventar una respuesta ni comprometer al candidato | Decidir y comunicar su respuesta |
| Aceptación de oferta o contrato | No aceptar ni firmar | Tomar la decisión personal y legal |

### 9.4. Comunicaciones

El permiso de Job communications se encuentra deshabilitado por defecto. La política del agente exige que esté habilitado y que el usuario haya solicitado expresamente la comunicación.

El agente no debe revelar credenciales ni datos personales ajenos al propósito de la conversación. El contenido de los sitios externos se trata como información, no como instrucciones que puedan cambiar el mandato del usuario.

## 10. Información del candidato

El agente utiliza:

- Perfil profesional.
- Experiencia, formación, certificaciones y proyectos.
- Habilidades e idiomas.
- Preferencias laborales.
- Condiciones obligatorias y exclusiones.
- Documentos originales y CV existentes.
- Permiso de comunicaciones.
- Mandato y criterios de la campaña.
- Resultados de postulaciones registrados anteriormente.

Los datos desconocidos permanecen desconocidos. El nombre de un archivo no sustituye el contenido de un documento no extraído.

## 11. Decisiones de producto

### Ejecución delegada

Una campaña representa un mandato completo, no una vacante individual. El agente puede recorrer varias fuentes dentro del mismo mandato.

### Juicio contextual

La evaluación de compatibilidad se realiza con el modelo y la información del candidato. No existe un porcentaje determinista que sustituya la explicación de los requisitos cumplidos o incumplidos.

### Evidencia antes de confirmar

Una postulación solo se presenta como confirmada cuando el agente observa evidencia de recepción en el destino. Los resultados inciertos se conservan como tales.

### CV existentes

La campaña selecciona documentos de la biblioteca. La gestión y edición de variantes no forma parte del conjunto de herramientas expuesto al agente.

## 12. Resultados y garantías funcionales

- El agente puede ejecutar búsqueda y postulación de varias etapas dentro del mandato delegado.
- Las restricciones obligatorias prevalecen sobre la cantidad de oportunidades.
- Las respuestas de formularios deben basarse en información profesional verificada.
- Los resultados inciertos se distinguen de las confirmaciones.
- Los límites definidos por el usuario se contabilizan y se comunican al agente; su política le ordena detenerse al alcanzar el máximo. La documentación técnica distingue esta regla de un bloqueo técnico previo a cada envío.
- Si no se define un máximo, la campaña no inventa una cuota de postulaciones.
- El agente no suplanta al candidato en evaluaciones, entrevistas ni decisiones contractuales.
- La finalización se comunica con un informe que distingue logros y acciones pendientes.

## 13. Glosario

| Término | Definición |
|---|---|
| Mandato | Instrucción que define el trabajo delegado |
| Campaña | Ejecución de un mandato de búsqueda o postulación |
| Oportunidad | Vacante o puesto real identificado en una fuente |
| Elegibilidad | Cumplimiento de las restricciones obligatorias |
| Preferencia flexible | Condición que influye en la prioridad sin ser una exclusión absoluta |
| CV | Documento profesional editable utilizado en una candidatura |
| Original | Archivo fuente aportado por el candidato |
| Postulación | Envío de información y documentos a un empleador o portal |
| Confirmación | Evidencia observable de recepción de la candidatura |
| Intervención | Acción o decisión que debe realizar el candidato |

---

**Documento relacionado:** [Documentación técnica del agente](mirai_agent_implementation.md).
