# 04. Technical & Delivery Planning — Mirai

**Entregable:** Implementation Plan  
**Alcance:** desarrollo E2E de Mirai, desde el primer acceso hasta la ejecución autónoma de campañas laborales. Se parte de que el usuario ya tiene acceso al servicio; no se planifica facturación.

**Referencias:** [Figma — Mirai](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai) · [Mapa E2E de 11 recorridos](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-30989) · [UI/UX E2E](https://github.com/Paz1CP/mirai/blob/main/docs/design/mirai_ui_ux_e2e.md) · [Requisitos](https://github.com/Paz1CP/mirai/blob/main/docs/02.%20Requirements%20Engineering.md) · [Arquitectura](https://github.com/Paz1CP/mirai/blob/main/docs/03.%20Architecture%20%26%20Design.md).

## 1. Organización del desarrollo

Mirai se construirá siguiendo una secuencia de **capacidades funcionales completas**, no por capas técnicas aisladas ni por pantallas sueltas. Cada sprint incorpora el recorrido correspondiente en web, backend, datos y extensión cuando esas partes sean necesarias. Las comprobaciones de funcionamiento se realizan dentro del mismo sprint, sin reservar toda la calidad para el final.

Una funcionalidad no se deja al 25 % para retomarla varios sprints después. La única continuidad entre sprints es la **integración natural** de capacidades ya terminadas: por ejemplo, la biblioteca de CV existe antes de que una postulación pueda asociarse a una versión utilizada, y el Dashboard se alimentará de más postulaciones cuando exista la ejecución masiva.

**Secuencia general:**

```text
01. Acceso y extensión
    ↓
02. Onboarding profesional completo
    ↓
03. Chat y búsqueda real de oportunidades
    ↓
04. Gestión avanzada de CV y perfil
    ↓
05. Primera postulación E2E y seguimiento
    ↓
06. Ejecución autónoma de campañas
```

Los números indican **orden de construcción**, no una estimación de duración. El Sprint 05 y el Sprint 06 se mantienen deliberadamente al final, después de la gestión avanzada de documentos y perfil.

---

## 2. Sprints de implementación

### Sprint 01 — Acceso, extensión y control de cuenta

Implementación y ejecución local: [entrega del Sprint 01](sprint01_delivery.md). Decisión posterior del fundador: acceso solo desde escritorio; los teléfonos muestran un modal bloqueante. Los destinos de otros módulos se habilitan funcionalmente en sus respectivos sprints.

**Recorrido:** abrir Mirai → iniciar sesión con Google → acceder a la aplicación → instalar o vincular la extensión → disponer de una conexión reconocida y de una única instancia controladora de la cuenta.

Se entrega íntegro el acceso: carga, errores y reintentos de autenticación; conexión, desconexión y reconexión de la extensión; identificación de la ventana controladora; y decisión de **Cancelar** o **Usar aquí** cuando otra ventana o dispositivo intenta asumir el control. La transferencia desautoriza al controlador anterior. La interfaz básica y su navegación quedan disponibles para continuar con el onboarding.

**Figma — pantallas:** [X-01 Google login](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2266) · [X-01 Loading](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2273) · [X-01 Login error](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2281) · [X-02 Connect extension](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2289) · [X-03 Second instance](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2300) · [X-03 Control transferred](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2310).

**Figma — componentes:** Sidebar / Nav item, Button, Dialog, Status, en [Foundations & Components](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=20-2).

### Sprint 02 — Onboarding profesional completo

**Recorrido:** extensión conectada → importar CV original → revisar la información extraída → confirmar o corregir perfil → definir preferencias y restricciones → conceder permisos → llegar al Chat con la identidad profesional preparada.

El onboarding queda completo, incluidos los errores de importación, la consulta del CV original, la edición posterior de los datos profesionales, la distinción entre restricciones obligatorias y preferencias, y la gestión de autorizaciones por portal, mensajes y correo. Los permisos pueden revisarse o revocarse individualmente. Las preguntas para corregir hechos del perfil ya funcionan como mecanismo reutilizable para cuando el agente necesite información más adelante.

**Figma — pantallas:** [CV-01 Empty](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1311) · [CV-03 Importing](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1439) · [CV-03 Import error](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1486) · [PROF-01 Import review](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1958) · [PROF-02 Profile](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2020) · [PROF-03 Correction](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2079) · [PROF-03 Correction answered](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-28637) · [PROF-04 Preferences](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2132) · [PROF-05 First permission](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-28127) · [PROF-05 Permissions](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2203).

**Figma — variantes de permisos:** [Revoked portal](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-28517) · [Revoked messages](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-28259) · [Revoked email](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-28385).

### Sprint 03 — Biblioteca y gestión de CV

El candidato administra su CV principal y variantes independientes desde la Biblioteca de CV. Puede abrir y editar cada CV, duplicarlo, importar un PDF o DOCX con revisión previa, exportar un PDF, comparar hasta tres CV, cambiar el predeterminado y eliminar documentos.

El CV principal usa el perfil profesional como fuente de contenido. Eliminar ese CV conserva el perfil, sus preferencias y sus permisos. El candidato puede recrearlo desde su perfil o reemplazar su archivo original tras revisar el contenido nuevo. Cada variante conserva su propio perfil profesional y puede tener un archivo fuente.

La edición y la comparación trabajan sobre documentos actuales. El identificador de revisión detecta conflictos entre ediciones simultáneas. Los archivos fuente se eliminan cuando pierden todas sus referencias. Los PDF exportados se generan bajo demanda.

**Referencias visuales:** [CV-02 Biblioteca](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1358) · [CV-05 Edición](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1591) · [CV-08 Acciones](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-27981).
**Entrega:** [Sprint 03](sprint03_delivery.md).

### Sprint 04 — Chat, agentes y búsqueda de oportunidades

**Recorrido:** entrar al Chat → dar una instrucción natural → interpretar el mandato (puestos, sitios, modalidad, salario y máximo si se indican) → iniciar búsqueda en los portales autorizados → evaluar ofertas → conservar oportunidades elegibles y descartar las incompatibles o duplicadas.

El Chat y el **descubrimiento de empleos** funcionan juntos, sin quedarse en una conversación decorativa. La búsqueda observa los portales reales mediante la extensión, registra las oportunidades encontradas y permite ver el navegador vinculado. El modo **Normal / Operator** es reversible y conserva la misma conversación y actividad. También quedan completos los chats recientes, el historial expandido y la presentación de conversaciones largas.

Este sprint termina la capacidad de **buscar y evaluar**, no la de enviar candidaturas: el envío es una capacidad diferente que se construirá íntegra en el Sprint 05. No se presentan simulaciones como postulaciones enviadas.

**Figma — pantallas:** [CHAT-01 New](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=22-3) · [CHAT-02 Briefing](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-126) · [CHAT-03 Searching](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-227) · [CHAT-11 Operator empty](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-1013) · [CHAT-11 Operator working](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=22-147) · [CHAT-12 History expanded](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-30809) · [CHAT-12 Long context](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-912).

**Figma — componentes:** Composer, CampaignSummary, ExecutionLog y navegador vinculado, en [Foundations & Components](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=20-2). Los estados del navegador **BROW-01/02/03/05/06** están integrados en las pantallas de Chat, no son páginas independientes.

### Sprint 05 — Primera postulación E2E y seguimiento completo

**Recorrido:** oportunidad elegible → elegir o adaptar el CV → preparar respuestas y documentos → abrir el formulario real → completar y enviar → comprobar el resultado → conservar evidencia y versión exacta del CV → consultar la postulación en Dashboard y Postulaciones.

Se construye **la primera candidatura completa de principio a fin**, con sus alternativas de resultado: confirmada, no confirmada, pendiente, fallida o descartada. Incluye la prevención de duplicados, la recuperación de un envío incierto sin repetirlo a ciegas y la conservación del documento usado. La selección automática del CV es la opción habitual; no aparece una aprobación obligatoria antes de cada envío rutinario.

En este mismo sprint se termina **Dashboard y Postulaciones**, porque ya existen datos reales que seguir: vacío, carga y error; tabla, búsqueda, filtros, orden, columnas y paginación; lista de candidaturas, detalle, evidencias, enlaces externos y versión documental histórica. Las vistas de campaña pausada o completada quedan resueltas como estados del panel; en el Sprint 06 las campañas autónomas las alimentarán sin tener que construir otra parte del Dashboard.

**Figma — postulación:** [CHAT-04 Applying](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=22-67) · [CHAT-05 Recorded & continue](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-325) · [CV-04 Applied version](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-33184) · [QA-1366 Chat applying](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2704).

**Figma — seguimiento:** [DATA-01 Empty](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-546) · [DATA-02 Dashboard](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-587) · [DATA-03 Filtered](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-694) · [DATA-04 Applications explorer](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1252) · [DATA-04 Application detail](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-769) · [DATA-05 Uncertain](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-826) · [DATA-06 Paused](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-883) · [DATA-06 Completed](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1145) · [DATA-08 Loading](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-30351) · [DATA-08 Load error](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1047) · [DATA-08 Column settings](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1088) · [QA-1366 Dashboard](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2784).

**Figma — componentes:** ResultRow, Application row, Status y Lista y detalle, en [Foundations & Components](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=20-2).

### Sprint 06 — Ejecución autónoma de campañas E2E

**Recorrido:** instrucción del candidato → búsqueda → evaluación → selección de CV → postulación → verificación → registro → siguiente oportunidad → repetición hasta el límite solicitado o la finalización de la campaña → notificación y reporte. Todo se mantiene en la misma campaña y sesión controladora.

La capacidad de **campañas autónomas completas** se entrega junta: múltiples ofertas; continuidad sin aprobación rutinaria por candidatura; respeto de restricciones y del máximo definido por el candidato; pausa y reanudación; cierre de pestaña y regreso; suspensión, errores de extensión o portal; intervención por datos faltantes, CAPTCHA, identidad o acciones personales; recuperación de intentos inciertos; y continuación de otras oportunidades cuando una queda pendiente. El modo Operator y el Dashboard muestran el trabajo en curso, pausado y finalizado.

Se completa también el recorrido de **comunicaciones externas autorizadas**: consultar y responder en los portales o Gmail a través del navegador, registrar solo la actividad operativa pertinente, evitar respuestas duplicadas y derivar decisiones personales al candidato. No se incorpora una bandeja de mensajes propia. La revocación de permisos previamente implementada tiene efecto sobre estas acciones.

**Figma — ejecución y recuperación:** [CHAT-06 Missing fact](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-423) · [CHAT-07 Paused](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-516) · [CHAT-08 Return after close](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-614) · [CHAT-09 Extension error](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-712) · [BROW-04 Portal blocked](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2366) · [X-04 Close warning](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2319) · [X-05 Personal action](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2327).

**Figma — comunicaciones y cierre:** [DATA-07 Contact](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-990) · [CHAT-10 Completed](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=23-812) · [X-06 Completion notification](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-2339) · [DATA-06 Completed](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=18-1145) · [PROF-03 Correction answered](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=26-28637).

**Figma — componentes:** Intervention, ExecutionLog, CampaignSummary, CompactReport y Composer en estado Running/Paused, en [Foundations & Components](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai?node-id=20-2).

---

## 3. Continuidad entre sprints

La sucesión no obliga a rehacer funcionalidades: cada sprint **consume lo que el anterior ya dejó completo**.

| Transición | Qué se aprovecha |
|---|---|
| 01 → 02 | Cuenta autenticada y extensión vinculada para guardar y proteger el perfil. |
| 02 → 03 | CV, datos profesionales, restricciones y permisos reales para interpretar y ejecutar búsquedas. |
| 03 → 04 | Roles y oportunidades encontrados para crear variantes documentales útiles, sin inventar datos profesionales. |
| 04 → 05 | CV original, variantes y versiones ya disponibles para la primera postulación verificable. |
| 05 → 06 | Envío individual seguro, evidencias y seguimiento ya funcionando; la campaña autónoma repite ese ciclo y gestiona excepciones. |

**Resultado del plan:** Mirai se desarrolla en el mismo orden en que adquiere capacidades útiles. La primera postulación y la autonomía no se adelantan a sus dependencias ni se fragmentan entre sprints distantes.
