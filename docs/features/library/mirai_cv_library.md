# Biblioteca y gestión de CV — Documento de negocio

> **Tipo:** Negocio  
> **Alcance:** Gestión funcional de documentos originales, CV principal, variantes, edición, selección predeterminada, reemplazo, comparación y utilización en candidaturas.  
> **Responsable:** Ingeniería de producto  
> **Última verificación:** 2026-11-24

## 1. Resumen

La biblioteca de Mirai separa los archivos profesionales que aporta el candidato de los CV estructurados que utiliza el producto. El candidato conserva sus documentos originales, mantiene un CV principal basado en su perfil profesional y puede crear variantes independientes para distintos enfoques laborales.

La biblioteca permite revisar, editar, duplicar, renombrar, comparar, descargar y eliminar CV. También permite establecer una variante predeterminada y reemplazar el documento principal. El agente consulta los documentos disponibles para elegir uno relevante durante una candidatura.

## 2. Propósito y valor

La biblioteca resuelve tres necesidades:

- **Conservar las fuentes:** mantener los archivos originales aportados por el candidato, separados de los datos profesionales extraídos.
- **Reutilizar información profesional:** representar el perfil como un CV principal y crear variantes editables sin modificar el documento fuente.
- **Preparar candidaturas:** permitir que Mirai consulte los documentos, seleccione el más pertinente y prepare el archivo correspondiente.

El resultado es una biblioteca donde el candidato controla el contenido profesional y puede mantener distintas presentaciones de su experiencia.

## 3. Actores y responsabilidades

| Actor | Responsabilidad | Condiciones de participación |
|---|---|---|
| Candidato | Importar, revisar, editar, duplicar, comparar, seleccionar y eliminar documentos | Cuenta autenticada y perfil habilitado para acceder a Documents |
| Mirai | Extraer información, mostrar los CV, generar documentos y consultar la biblioteca | Opera con los documentos autorizados de la cuenta |
| Agente de postulaciones | Evaluar documentos y seleccionar uno pertinente para una oportunidad | Actúa dentro del mandato y utiliza información profesional guardada |
| Portal de empleo | Recibir el archivo adjunto durante una candidatura | Depende del formulario y de las capacidades de interacción disponibles en el navegador |

## 4. Alcance funcional

**Incluye:**

- Documentos originales PDF y DOCX.
- CV principal basado en el perfil profesional confirmado.
- Variantes independientes del CV principal.
- Edición del contenido y de los datos de identificación del CV.
- Duplicación, renombrado y eliminación de variantes.
- Selección de una variante predeterminada.
- Reemplazo del documento principal.
- Vista previa, descarga PDF y comparación de dos o tres CV.
- Consulta y preparación de documentos para candidaturas.
- Asociación de documentos a los registros de candidatura.

**Límites del comportamiento actual:**

- La biblioteca no conserva un historial de versiones ni permite restaurar una revisión anterior.
- La comparación muestra documentos actuales; no compara revisiones históricas.
- La selección predeterminada no fija un CV a una campaña concreta.
- El agente selecciona documentos por pertinencia; no modifica automáticamente una variante para adaptarla a cada oferta.
- El registro de candidatura conserva una referencia al documento, no una copia histórica inmutable de su contenido.
- La preparación del archivo por el agente no garantiza que el navegador complete la carga en el formulario externo.

## 5. Conceptos y funcionamiento

### 5.1. Documento original

Es el archivo PDF o DOCX que el candidato aporta. Se conserva separado del contenido profesional estructurado y puede visualizarse desde la biblioteca.

El original no se modifica cuando el candidato edita un CV derivado. El candidato puede eliminarlo explícitamente. Al hacerlo, se desvincula de los CV relacionados, pero no se elimina el contenido estructurado que estos ya contienen.

### 5.2. CV principal

Es la representación principal del perfil profesional confirmado. Su contenido se comparte con el perfil que Mirai utiliza para conocer la experiencia, formación y habilidades del candidato.

Editar el CV principal también modifica el perfil profesional. El CV principal no es una copia independiente del perfil.

### 5.3. Variante

Es una copia estructurada e independiente del contenido de otro CV. Puede representar una especialización o enfoque profesional diferente.

Editar una variante no modifica el CV del que se duplicó ni el perfil principal. Una variante puede estar asociada a un documento original, pero esa asociación es independiente de su contenido editable.

Duplicar un CV copia su contenido estructurado; no duplica el archivo original asociado.

### 5.4. Documento predeterminado

El candidato puede marcar una variante como predeterminada. Solo una variante puede tener esa selección explícita a la vez.

Cuando no existe una variante predeterminada, el CV principal funciona como selección predeterminada de la biblioteca. Esta preferencia no constituye una asignación por campaña.

### 5.5. Documento utilizado en una candidatura

El agente consulta los CV y originales disponibles, evalúa su pertinencia y selecciona el documento adecuado. Cuando utiliza el perfil profesional de Mirai como CV generado, emplea el CV principal.

El detalle de una candidatura muestra los documentos que todavía puede resolver desde la biblioteca. No conserva una copia histórica del archivo que se adjuntó.

## 6. Flujos de negocio

### 6.1. Importar el primer CV y completar el perfil

1. El candidato entra en Profile o intenta acceder a una sección protegida por el onboarding.
2. Selecciona un CV principal y, opcionalmente, documentos de evidencia.
3. Mirai extrae los datos profesionales y guarda los archivos originales como operaciones independientes.
4. El candidato revisa y corrige la información extraída.
5. Guarda el perfil y las preferencias de empleo, y confirma los datos.
6. Mirai habilita el workspace y crea el CV principal a partir del perfil confirmado.

La extracción y la carga de los archivos pueden terminar en momentos distintos. La interfaz presenta sus estados por separado y permite reintentar una operación fallida.

### 6.2. Importar documentos originales desde Documents

1. El candidato abre Documents y selecciona Import.
2. Elige uno o varios archivos PDF o DOCX.
3. Mirai valida el tipo, tamaño y cantidad antes de guardar.
4. La biblioteca muestra los originales importados.
5. Si se importa un único documento, la interfaz abre su vista; si se importan varios, vuelve a la biblioteca.

Importar un original no crea automáticamente una variante editable.

### 6.3. Convertir un original en un CV editable

1. El candidato abre un original.
2. Selecciona Edit.
3. Si ya existe un CV relacionado, Mirai abre ese CV.
4. Si no existe, el candidato confirma que desea extraerlo.
5. Mirai analiza el original y crea una variante editable vinculada a ese archivo.
6. El candidato puede revisar y modificar el contenido de la variante.

Si el original ya está vinculado a un CV, la operación reutiliza ese CV en lugar de crear otro.

### 6.4. Editar y renombrar un CV

1. El candidato abre un CV y selecciona Edit.
2. Modifica los datos personales, resumen, experiencia, formación, habilidades u otras secciones disponibles.
3. Puede cambiar el nombre y la especialización del documento.
4. Guarda los cambios.
5. Mirai actualiza el documento y la vista previa.

Si el documento cambió desde que comenzó la edición, Mirai muestra la versión actual para revisión. El candidato puede conservar su borrador o confirmar que desea sobrescribir el contenido actual. Los cambios sin guardar activan una confirmación al cerrar.

### 6.5. Duplicar un CV

1. El candidato selecciona Duplicate sobre un CV.
2. Define el nombre y la especialización de la nueva variante.
3. Mirai copia el contenido profesional actual.
4. La nueva variante queda disponible para edición independiente.

La duplicación no crea una copia del archivo original ni conserva el vínculo de origen del CV duplicado.

### 6.6. Seleccionar el CV predeterminado

1. El candidato abre el menú de una variante.
2. Selecciona Set as default.
3. Mirai registra esa variante como predeterminada.
4. Si el candidato retira la selección, el CV principal vuelve a ser el predeterminado cuando existe.

La selección predeterminada pertenece a la biblioteca. El agente elige documentos según la pertinencia para la oportunidad y no existe una selección documental persistida por campaña.

### 6.7. Reemplazar el CV principal

1. El candidato abre el menú del CV principal y selecciona Replace.
2. Selecciona un archivo PDF o DOCX.
3. Mirai extrae el contenido profesional.
4. El candidato revisa la información extraída.
5. Confirma el reemplazo.
6. Mirai actualiza el perfil principal y conserva el nuevo archivo como original.
7. El archivo fuente anterior permanece en la sección de originales mientras el candidato no lo elimine.

El reemplazo modifica el contenido profesional principal; no crea una variante.

### 6.8. Comparar CV

1. El candidato selecciona Compare.
2. Selecciona dos o tres CV de la biblioteca.
3. Mirai muestra sus documentos en columnas.
4. El candidato puede desplazarse por las vistas sincronizadas y ajustar el zoom.

La comparación es visual y utiliza el contenido actual de cada CV. No muestra un historial de cambios ni una restauración.

### 6.9. Utilizar documentos en una candidatura

1. Mirai consulta los CV y originales disponibles.
2. El agente revisa el contenido profesional necesario para determinar la pertinencia.
3. Selecciona un CV o un original.
4. Prepara el PDF estructurado del CV o el archivo original para adjuntarlo.
5. Registra la referencia documental en el resultado de la candidatura.
6. El detalle de la candidatura muestra un enlace al documento mientras este siga disponible en la biblioteca.

El agente selecciona por pertinencia. Cuando genera el CV a partir del perfil de Mirai, utiliza el CV principal. La selección predeterminada de la biblioteca no se convierte en una selección fija de campaña. Un original sin un CV vinculado puede prepararse como archivo, pero no aporta contenido profesional estructurado para la consulta del agente.

La preparación del archivo está disponible, pero la operación automatizada de asignarlo al campo de archivo del navegador está bloqueada en el flujo actual. Por tanto, el adjunto no se considera completado solo porque Mirai haya preparado el documento.

### 6.10. Eliminar documentos

**Eliminar el CV principal:**

- Elimina su entrada de la biblioteca.
- Conserva el perfil profesional y las preferencias.
- Desvincula el archivo fuente del perfil principal.
- Permite crear nuevamente un CV principal desde el perfil conservado.

**Eliminar una variante:**

- Elimina esa variante de la biblioteca.
- No elimina el documento original asociado.

**Eliminar un original:**

- Elimina el archivo fuente de la biblioteca.
- Desvincula el archivo del perfil principal, de las evidencias y de las variantes relacionadas.
- Conserva el contenido estructurado de los CV relacionados, que quedan sin archivo fuente asociado.

La eliminación física del archivo puede terminar después de la actualización de la biblioteca. Si la limpieza queda pendiente, la interfaz muestra una acción para reintentarla.

## 7. Reglas de negocio

| ID | Regla | Condición | Resultado |
|---|---|---|---|
| BR-01 | El perfil confirmado constituye el contenido del CV principal | Existe un perfil profesional confirmado | Editar el principal actualiza el perfil profesional |
| BR-02 | El original se conserva separado del contenido estructurado | El candidato importa un archivo | Editar un CV no modifica el archivo original |
| BR-03 | Una variante tiene contenido independiente | El candidato duplica o extrae un CV | Sus cambios no modifican el principal ni otras variantes |
| BR-04 | Duplicar copia el contenido, no el archivo fuente | Se duplica un CV | La variante nueva no hereda la asociación al original |
| BR-05 | Solo una variante puede ser predeterminada | El candidato selecciona una variante | La selección anterior se sustituye |
| BR-06 | El principal es el predeterminado de respaldo | No existe una variante predeterminada y existe un principal | La biblioteca devuelve el principal como selección predeterminada |
| BR-07 | La extracción utiliza los documentos aportados como evidencia | Se importa o escanea un documento | Los datos desconocidos permanecen vacíos; no se inventan credenciales ni experiencia |
| BR-08 | Un original ya vinculado no genera otra variante al volver a escanearse | Existe un CV asociado al original | Mirai devuelve el CV asociado |
| BR-09 | La comparación admite dos o tres CV | El candidato abre Compare | La interfaz presenta vistas actuales en columnas |
| BR-10 | Los documentos admitidos son PDF y DOCX | Se importa o reemplaza un archivo | Otros formatos se rechazan |
| BR-11 | La selección de archivos tiene límites de tamaño y cantidad | Se importa un conjunto de documentos | Máximo de 10 archivos, 10 MiB por archivo y 30 MiB por selección |
| BR-12 | El onboarding admite un CV principal y hasta nueve documentos de evidencia | Se completa la importación inicial | Se conservan por separado el documento principal y sus evidencias |
| BR-13 | El almacenamiento limita a 20 los originales y adjuntos de conversación que consumen espacio documental | Se agrega un archivo | La operación se rechaza si supera el límite compartido |
| BR-14 | El agente selecciona documentos por pertinencia | Una candidatura requiere un CV | No se elige únicamente por el orden de la lista |
| BR-15 | La candidatura conserva una referencia, no una copia histórica del documento | Se registra el resultado de una candidatura | El detalle resuelve el documento actual; si se elimina, deja de aparecer |
| BR-16 | El documento predeterminado no fija una selección por campaña | El agente prepara una candidatura | La selección se determina por pertinencia y por las instrucciones del mandato |
| BR-17 | La preparación del archivo no equivale a una carga confirmada | El agente prepara un adjunto | La candidatura no debe tratar el archivo como enviado hasta observar el resultado del portal |

## 8. Estados y transiciones

| Estado | Significado | Cómo se alcanza | Resultado o transición |
|---|---|---|---|
| Biblioteca cargando | Mirai consulta CV y originales | Se abre Documents | Muestra el contenido cuando terminan las consultas |
| Biblioteca disponible | Los documentos están listados | Las consultas finalizan correctamente | Permite abrir, editar y gestionar documentos |
| Importación en curso | Los archivos se están guardando | El candidato confirma una selección válida | Finaliza en originales disponibles o error |
| Extracción en curso | Mirai analiza un documento | Se inicia onboarding, escaneo o reemplazo | Finaliza con datos extraídos o error |
| Edición modificada | Hay cambios sin guardar | El candidato modifica el formulario | Permite guardar o descartar |
| Conflicto de edición | El contenido cambió durante la edición | El guardado detecta una revisión distinta | Permite revisar el contenido actual y confirmar la sobrescritura |
| Limpieza pendiente | Un archivo retirado todavía requiere limpieza | La eliminación física no termina | Permite reintentar la limpieza |
| Original sin CV asociado | El original está guardado, pero no tiene una variante vinculada | Se importa un original sin escanear | Permite iniciar su extracción |
| CV sin original | El contenido estructurado sigue disponible, pero se eliminó su fuente | Se elimina el original relacionado | El CV continúa editable y descargable |

## 9. Permisos y condiciones de acceso

- La cuenta autenticada solo puede consultar y modificar sus propios documentos.
- El acceso a Documents requiere un perfil confirmado y el onboarding completado.
- Profile permanece disponible para completar el onboarding.
- El candidato controla las operaciones de edición, reemplazo y eliminación.
- El agente consulta documentos dentro de la cuenta autenticada y del mandato vigente.
- El acceso a una candidatura no concede acceso a documentos de otra cuenta.

## 10. Información del candidato

La extracción y edición estructurada pueden incluir:

- Datos personales y enlaces.
- Titular profesional y resumen.
- Experiencia laboral.
- Formación académica.
- Habilidades e idiomas.
- Proyectos.
- Certificaciones y cursos.
- Premios.
- Voluntariado.
- Publicaciones.
- Referencias.
- Otras secciones profesionales.

Los originales conservan su formato de archivo. La vista de un PDF muestra el documento; la vista de un DOCX presenta el texto extraído para consulta.

## 11. Decisiones de producto

| Decisión | Justificación | Consecuencia funcional |
|---|---|---|
| Separar originales y CV estructurados | El archivo aportado y el contenido editable cumplen funciones distintas | Editar un CV no altera el original |
| Utilizar el perfil confirmado como CV principal | El perfil es la fuente profesional compartida por Mirai | Los cambios del principal se reflejan en el perfil |
| Mantener variantes independientes | Un candidato puede presentar enfoques distintos sin duplicar su identidad profesional | Cada variante se edita por separado |
| Utilizar el principal como selección predeterminada de respaldo | Evita que la biblioteca quede sin selección cuando no hay una variante marcada | La biblioteca devuelve el principal si no existe una variante predeterminada |
| Comparar documentos actuales | La comparación sirve para revisar presentaciones distintas de un CV | No constituye un historial de versiones |
| Conservar referencias documentales en candidaturas | Permite volver desde el resultado a la biblioteca | El detalle depende de que el documento referenciado siga disponible |

## 12. Resultados y garantías funcionales

- El candidato puede conservar originales y mantener CV estructurados independientes.
- El CV principal permanece asociado al perfil profesional confirmado.
- Una variante puede editarse sin modificar el principal.
- El PDF descargado y la vista previa se generan desde el mismo contenido estructurado.
- El original no se modifica al editar un CV derivado.
- La biblioteca informa cuando una operación de limpieza requiere reintento.
- La selección de un documento y la preparación de un archivo no constituyen evidencia de que el portal externo lo haya recibido.
- El detalle de candidatura no garantiza la conservación histórica del contenido si el documento de la biblioteca cambia o se elimina.

## 13. Glosario

| Término | Definición |
|---|---|
| Original | Archivo PDF o DOCX aportado por el candidato |
| CV principal | Presentación del perfil profesional confirmado |
| Variante | Copia estructurada e independiente de un CV |
| Predeterminado | Variante elegida como preferencia general de la biblioteca |
| Evidencia | Documento complementario utilizado para enriquecer la extracción del perfil |
| Extracción | Conversión de información de documentos en datos profesionales estructurados |
| Documento de candidatura | CV u original seleccionado para una oportunidad laboral |


## 14. Documentos relacionados

- [Biblioteca y gestión de CV — Documentación técnica](mirai_cv_library_implementation.md)
- [Mirai WorkFlow E2E](../../product/mirai_workflow_e2e.md)
- [UI/UX E2E](../../design/mirai_ui_ux_e2e.md)
