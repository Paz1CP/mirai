# Biblioteca y gestión de CV — Documentación técnica

> **Tipo:** Técnico  
> **Alcance:** Implementación de la biblioteca de CV, documentos originales, persistencia, almacenamiento, extracción, renderizado, concurrencia e integración con candidaturas.  
> **Responsable:** Ingeniería  
> **Última verificación:** 2026-11-24

## 1. Resumen técnico

La feature de CV combina tres fuentes de datos: el perfil profesional de la cuenta, los registros de CV principal y variantes, y los documentos originales almacenados como objetos privados.

La API Express expone las operaciones de biblioteca y delega las escrituras en CvRepository. Los contratos Zod compartidos validan las entradas y salidas. El almacenamiento S3-compatible conserva los archivos originales y el paquete @mirai/cv-renderer genera el PDF canónico desde el perfil estructurado.

El agente consulta el repositorio de CV, prepara adjuntos y registra referencias documentales en los resultados de candidatura.

## 2. Contexto y límites

### Responsabilidades

- Mantener un CV principal por cuenta.
- Mantener variantes con contenido estructurado independiente.
- Registrar originales y asociarlos opcionalmente a CV.
- Controlar ownership, revisiones y concurrencia.
- Extraer perfiles desde PDF y DOCX.
- Generar y previsualizar PDF con un renderer compartido.
- Proporcionar documentos al agente y referencias a Applications.

### Límites

- La feature no mantiene snapshots históricos de CV.
- El campo revision implementa control de concurrencia, no historial de versiones.
- La persistencia de candidaturas no archiva el contenido binario ni la revisión del documento.
- El renderer no edita documentos originales: renderiza el perfil estructurado.
- El frontend web no invoca la ruta de importación confirmada de variantes; el flujo de biblioteca utilizado importa originales y los convierte mediante scan.

## 3. Arquitectura y componentes

~~~mermaid
flowchart TD
  WEB["Next.js: CvLibrary / ProfileProvider"]
  API["Express: profile routes + /cvs"]
  CV["CvRepository"]
  PROFILE["ProfileRepository"]
  EXTRACT["Profile extractor"]
  CLEAN["Document cleanup"]
  STORAGE["S3-compatible object storage"]
  DB["Neon PostgreSQL"]
  CONTRACTS["@mirai/contracts"]
  RENDER["@mirai/cv-renderer"]
  AGENT["MiraiAgent"]
  TOOLS["miraiTools"]
  ATTACH["playwrightTools: prepareAttachment"]
  RESULTS["resultsRepository"]
  BROWSER["Playwright MCP / Chrome extension"]

  WEB --> API
  API --> CV
  API --> PROFILE
  API --> EXTRACT
  CV --> DB
  PROFILE --> DB
  CV --> CLEAN
  PROFILE --> CLEAN
  CLEAN --> STORAGE
  API --> CONTRACTS
  WEB --> RENDER
  AGENT --> TOOLS
  TOOLS --> CV
  TOOLS --> RESULTS
  AGENT --> ATTACH
  ATTACH --> CV
  ATTACH --> STORAGE
  ATTACH --> RENDER
  ATTACH --> BROWSER
  RESULTS --> DB
~~~

| Componente | Responsabilidad | Entradas | Salidas |
|---|---|---|---|
| CvLibrary | Biblioteca, acciones y vistas | Consultas de CV y originales | Operaciones del candidato |
| CvDraftDialog | Edición, reemplazo y resolución de conflictos | Perfil, metadatos y revisión actual | Guardado o confirmación |
| CvRepository | Fuente de verdad de CV y originales | Account ID, identificadores y contratos | DTO de biblioteca, CV y originales |
| ProfileRepository | Perfil profesional, extracción y onboarding | Perfil, operación de extracción y preferencias | Perfil confirmado y CV principal |
| DocumentStorage | Archivos originales | Account ID, clave y bytes | Lectura, carga, URL firmada y eliminación |
| DocumentCleanup | Adopción y eliminación segura de archivos | Claves y referencias de cuenta | Estado de limpieza |
| Profile extractor | Validación y extracción estructurada | PDF/DOCX y contexto | CvExtraction |
| StandardCv | Renderizado canónico | ProfessionalProfile y locale | Documento PDF |
| miraiTools | Lectura de documentos para el agente | Account ID y DocumentRef | Inventario y contenido autorizado |
| playwrightTools | Preparación de adjuntos | DocumentRef | Archivo temporal autorizado |
| resultsRepository | Referencias de documentos en candidaturas | DocumentRef[] | Detalle con documentos resolubles |

## 4. Dependencias

| Dependencia | Propósito | Integración | Impacto de indisponibilidad |
|---|---|---|---|
| @mirai/contracts | Esquemas Zod y tipos compartidos | Import directo en web y API | No se validan contratos de CV |
| Drizzle ORM / PostgreSQL | Persistencia y transacciones | Repositorios de perfil, CV y candidaturas | Lectura y escritura de biblioteca indisponibles |
| S3-compatible object storage | Archivos originales privados | AWS SDK S3 | No se pueden guardar, leer ni eliminar originales |
| @google/genai | Extracción de información profesional | Gemini mediante el servicio de billing | No se puede extraer o reemplazar el perfil desde documentos |
| @react-pdf/renderer | Generación PDF | Browser y Node | No se genera el PDF del CV |
| pdfjs-dist | Vista previa y thumbnails PDF | Frontend | El PDF puede generarse, pero no mostrarse como vista renderizada |
| mammoth | Lectura de texto DOCX | API y frontend | No se extrae ni previsualiza texto DOCX |
| pdf-lib | Validación estructural PDF | API | No se puede validar el PDF antes de extracción |
| @playwright/mcp / Playwright | Herramientas de navegador y archivo | Backend | El agente no ejecuta el flujo de navegador |

### 4.1. Validación y extracción

Profile extractor admite PDF y DOCX. documentPart valida que el PDF comience con %PDF- y que pdf-lib pueda abrirlo y encontrar páginas. Para DOCX utiliza Mammoth para extraer texto sin formato; rechaza texto vacío o superior a dos millones de caracteres. PDF se entrega al modelo como inlineData base64; DOCX se entrega como texto extraído.

CV_EXTRACTOR_PROMPT identifica el primer documento como CV principal y los siguientes como evidencias complementarias. La salida se valida contra cvExtractionSchema y su esquema JSON. La inferencia usa ThinkingLevel.MEDIUM y timeout de 120 segundos. El modelo primario es gemini-4-hydrogen; los errores 404, 429, 500, 502, 503 y 504 activan el fallback gemini-3.8-flash. La operación pasa por billing.generate con el tipo cv_extraction.

### 4.2. Renderizado y vistas previas

packages/cv-renderer/src/StandardCv.tsx define el componente StandardCv compartido por web y Node. registerStandardCvFonts registra Geist Regular y Geist Semibold desde apps/web/public/fonts. El documento utiliza tamaño A4, márgenes de 20 mm y tipografía base de 10.5 pt. El renderer elimina entradas vacías, ordena experiencia y formación por fecha, prioriza experiencia actual y evita repetir idiomas dentro de habilidades.

- El frontend utiliza renderCvPdf en apps/web/src/features/profiles/cvPdf.tsx con @react-pdf/renderer y genera un Blob para descarga.
- MiraiCv mantiene la vista previa del CV; LivePdfPreview utiliza pdfjs-dist para mostrar las páginas.
- CvThumbnail y pdfThumbnail generan thumbnails de los PDF de forma diferida.
- El renderer Node exporta renderCvAttachment y produce el PDF que prepara el agente.
- El original PDF se muestra desde sus bytes; el original DOCX se presenta como texto extraído mediante Mammoth, no como una reproducción visual de Word.

## 5. Flujos técnicos

### 5.1. Onboarding: extracción y asociación de fuentes

~~~mermaid
sequenceDiagram
  participant UI as ProfileProvider
  participant API as Import routes
  participant DB as ProfileRepository
  participant EXT as Profile extractor
  participant STORE as DocumentStorage
  participant CLEAN as DocumentCleanup

  UI->>API: begin(files.length)
  API->>DB: beginExtraction(operationId)
  DB-->>API: operation accepted
  par Extraction
    UI->>API: extract(primary + evidence)
    API->>EXT: documentPart + Gemini
    EXT-->>API: CvExtraction
    API->>DB: completeExtraction(operationId)
  and Source uploads
    loop Each selected file
      UI->>API: upload(file, primary/evidence)
      API->>CLEAN: stage + storage.upload
      CLEAN-->>API: storage key
      API->>DB: attachDocument + adoptDocument
    end
  end
  UI->>API: save profile and preferences
  UI->>API: confirm + complete
  API->>DB: completeOnboarding
  DB->>DB: insert primary cv_documents row
~~~

El frontend inicia la extracción y las cargas de archivos como solicitudes independientes después de crear una operación. La extracción puede terminar antes que las cargas.

ProfileRepository evita que una extracción antigua reemplace una operación más reciente mediante extractionOperationId. completeExtraction conserva las correcciones manuales cuando el perfil cambió desde que empezó la extracción.

completeOnboarding exige perfil confirmado y preferencias existentes. Al completar, crea el registro primary en cv_documents.

### 5.2. Importar originales desde la biblioteca

1. CvImportDialog valida el conjunto con documentSelectionError.
2. cvApi.uploadOriginals envía archivos e identificadores UUID generados por el cliente.
3. POST /v1/cvs/originals valida cantidad, extensión, tamaño y firma PDF o ZIP DOCX.
4. DocumentCleanup.stage registra una clave temporal y carga el objeto.
5. CvRepository.saveOriginals abre una transacción, bloquea la cuenta y adopta las claves.
6. adoptDocument elimina la marca temporal vigente e inserta original_documents.
7. La API devuelve los originales que pertenecen a los identificadores enviados.

La ruta de originales valida la firma del archivo, pero no ejecuta el análisis estructural completo. Esa validación ocurre cuando se solicita scan o extracción. La carga es idempotente por los identificadores de original enviados por el cliente.

### 5.3. Escanear un original y crear una variante

~~~mermaid
sequenceDiagram
  participant UI as CvOriginalDialog
  participant API as CV routes
  participant CV as CvRepository
  participant STORE as DocumentStorage
  participant EXT as Profile extractor
  participant DB as PostgreSQL

  UI->>API: GET originals/:id/cv
  API->>CV: linkedCv(accountId, key)
  CV-->>UI: CV existente o null
  UI->>API: POST originals/:id/scan
  API->>CV: original(accountId, id)
  API->>CV: linkedCv(accountId, key)
  alt Ya existe un CV asociado
    CV-->>UI: CV existente
  else Sin CV asociado
    API->>STORE: read(accountId, key)
    STORE-->>API: bytes originales
    API->>EXT: extract(document)
    EXT-->>API: ProfessionalProfile
    API->>CV: saveScan(accountId, originalId, profile)
    CV->>DB: lockAccount + linkedCv + insert variant
    DB-->>UI: CV variante con sourceKey
  end
~~~

saveScan vuelve a comprobar linkedCv dentro de la transacción bloqueada. Esto evita crear dos variantes vinculadas cuando dos solicitudes escanean el mismo original de forma concurrente.

### 5.4. Editar o renombrar un CV

1. CvLibrary obtiene el detalle mediante GET /v1/cvs/:id.
2. CvDraftDialog mantiene un borrador local del perfil y sus metadatos.
3. El candidato modifica el formulario.
4. El frontend valida ProfessionalProfile, metadatos y fechas.
5. PATCH /v1/cvs/:id envía revision y los campos modificados.
6. CvRepository bloquea la fila de candidate_profiles y compara la revisión recibida con la actual.
7. Para el principal actualiza candidate_profiles.profile; para una variante actualiza cv_documents.profile.
8. Actualiza metadatos, revision y updated_at, y devuelve el detalle actualizado.

Si la revisión no coincide, la API responde CV_CONFLICT. El frontend permite consultar el contenido más reciente y confirmar una sobrescritura con la revisión nueva.

### 5.5. Reemplazar el CV principal

~~~mermaid
sequenceDiagram
  participant UI as CvReplaceDialog
  participant API as CV routes
  participant EXT as Profile extractor
  participant CV as CvRepository
  participant CLEAN as DocumentCleanup
  participant DB as PostgreSQL

  UI->>API: POST import/extract(file, language)
  API->>EXT: validate + extract
  EXT-->>UI: ProfessionalProfile
  UI->>UI: Review extracted profile
  UI->>API: POST primary/replace(file, id, revision, operationId, profile)
  API->>CV: replacement(accountId, input)
  alt operationId already applied
    CV-->>API: Existing document
  else New replacement
    API->>CLEAN: stage(file)
    API->>CV: replacePrimary
    CV->>DB: lockAccount + adoptDocument
    CV->>DB: update candidate_profiles and lastReplacementId
    CV->>DB: queue old source key
    API-->>UI: Updated primary + cleanup state
  end
~~~

La extracción inicial no persiste el archivo. El archivo se carga y adopta al confirmar el reemplazo. operationId hace idempotente la operación; lastReplacementId permite reconocer un reemplazo ya aplicado. La clave anterior se pone en limpieza, pero permanece almacenada si sigue referenciada por original_documents.

### 5.6. Duplicar y seleccionar el predeterminado

duplicate lee el CV fuente dentro de una transacción bloqueada e inserta una variante con el perfil copiado, metadatos recibidos y sourceKey nulo. El ID suministrado por el cliente permite devolver la variante existente cuando se repite la misma operación.

defaultVariant bloquea la cuenta, valida que el documento sea una variante, retira isDefault de la selección anterior y marca la variante solicitada. Si no se envía un ID, elimina la selección explícita.

library devuelve el ID de la variante marcada; si ninguna está marcada, devuelve el ID del principal; si no existe ninguno, devuelve null.

### 5.7. Preparar y registrar un documento en una candidatura

~~~mermaid
sequenceDiagram
  participant AG as MiraiAgent
  participant TOOLS as miraiTools
  participant CV as CvRepository
  participant ATT as playwrightTools
  participant RENDER as cv-renderer
  participant STORE as DocumentStorage
  participant CH as Chrome
  participant RES as resultsRepository

  AG->>TOOLS: listDocuments()
  TOOLS->>CV: library + originals
  CV-->>AG: cvs, originals, defaultId, primaryId
  AG->>TOOLS: getDocument(id, kind)
  TOOLS->>CV: read CV or original + linkedCv
  CV-->>AG: saved document data
  AG->>ATT: prepareAttachment(id, kind)
  alt kind = cv
    ATT->>CV: read(accountId, id)
    CV-->>ATT: ProfessionalProfile
    ATT->>RENDER: renderCvAttachment(profile, locale)
    RENDER-->>ATT: PDF buffer
  else kind = original
    ATT->>CV: original(accountId, id)
    CV-->>ATT: storage key
    ATT->>STORE: read(accountId, key)
    STORE-->>ATT: Original bytes
  end
  ATT-->>AG: Temporary path
  AG->>CH: browser_file_upload(path)
  AG->>RES: recordApplication(documentRefs)
  RES->>CV: Resolve IDs and current names by account
  RES-->>AG: Application result
~~~

prepareAttachment genera un PDF StandardCv para kind=cv y copia los bytes originales para kind=original. El archivo se escribe en un directorio temporal con permisos 0600. authorizeUpload permite únicamente rutas preparadas durante la invocación actual y limita la operación a diez archivos.

El paso de carga en Chrome tiene una restricción: remoteBrowser bloquea el comando CDP DOM.setFileInputFiles. El flujo estándar de Playwright para asignar archivos a un input termina en ese comando. Por ello, la preparación local funciona, pero la asignación del archivo al formulario queda bloqueada por la política actual de la extensión.

### 5.8. Resolver documentos en el detalle de candidatura

recordApplication recibe documentRefs con ID y tipo. resolveDocuments busca los CV y originales bajo el accountId autenticado y añade el nombre actual. Los identificadores que no pertenecen a la cuenta o que ya no existen se omiten.

La escritura en applications.document_refs conserva únicamente ID y tipo. getApplication vuelve a resolver esas referencias cuando se consulta el detalle. ApplicationDetail presenta enlaces a /documents?kind=...&id=....

No se guarda revision, perfil JSON ni bytes del documento en la candidatura. Una edición posterior se refleja al abrir la referencia; una eliminación hace que deje de resolverse.

## 6. Contratos e interfaces

### 6.1. Contratos compartidos

| Contrato | Campos relevantes | Uso |
|---|---|---|
| ProfessionalProfile | personal, headline, summary, experience, education, skills, languages, projects, certifications, courses, awards, volunteering, publications, references, other_sections | Perfil estructurado |
| CvSummary | id, kind, name, specialization, hasSource, createdAt, updatedAt, revision | Elemento de biblioteca |
| CvDetail | CvSummary + profile | Detalle editable |
| CvLibrary | documents, defaultId, canCreatePrimary, cleanupPending | Respuesta de biblioteca |
| OriginalDocument | id, name, format, createdAt | Registro de archivo original |
| CvUpdate | revision, name?, specialization?, profile? | Edición |
| CvDuplicate | id, sourceId, name, specialization | Duplicación |
| CvReplace | operationId, id, revision, profile | Reemplazo del principal |
| DocumentRef | id, kind: cv \| original | Referencia usada por el agente y la candidatura |
| CvExtraction | profile, suggested_roles | Resultado de extracción; máximo cinco roles sugeridos |

Los contratos se definen en packages/contracts/src/profile.ts, cvs.ts, documents.ts y results.ts.

### 6.2. API de CV

Todas las rutas están montadas bajo /v1/cvs y heredan autenticación de createProfileRoutes. Las respuestas llevan Cache-Control: no-store.

| Método | Ruta | Operación |
|---|---|---|
| GET | /v1/cvs | Lista CV, defaultId, canCreatePrimary y cleanupPending |
| GET | /v1/cvs/:id | Lee el detalle de un CV |
| PATCH | /v1/cvs/:id | Actualiza metadatos y/o perfil con revisión |
| DELETE | /v1/cvs/:id | Elimina un registro de CV |
| POST | /v1/cvs/duplicate | Duplica un CV como variante |
| PUT | /v1/cvs/:id/default | Marca una variante como predeterminada |
| DELETE | /v1/cvs/default | Retira la selección explícita |
| POST | /v1/cvs/primary/create | Crea el registro principal desde el perfil existente |
| POST | /v1/cvs/import/extract | Extrae un perfil sin persistir el archivo |
| POST | /v1/cvs/import/confirm | Persiste una variante y su archivo fuente |
| POST | /v1/cvs/primary/replace | Reemplaza el perfil y archivo del principal |
| GET | /v1/cvs/:id/source/access | Devuelve URL firmada del archivo fuente asociado |
| GET | /v1/cvs/originals | Lista originales |
| POST | /v1/cvs/originals | Carga y registra originales |
| GET | /v1/cvs/originals/:id/content | Devuelve el contenido del original |
| GET | /v1/cvs/originals/:id/cv | Busca el CV vinculado al original |
| POST | /v1/cvs/originals/:id/scan | Extrae el original y crea una variante si no existe vínculo |
| DELETE | /v1/cvs/originals/:id | Elimina el original y desvincula sus referencias |
| POST | /v1/cvs/cleanup | Reintenta la limpieza de archivos |

POST /v1/cvs/import/confirm existe en el backend, pero cvApi no expone un método para llamarlo. La interfaz de biblioteca utiliza POST /v1/cvs/originals y POST /v1/cvs/originals/:id/scan.

### 6.3. Integración con el agente y Applications

| Herramienta o función | Contrato | Responsabilidad |
|---|---|---|
| listDocuments | includeProfiles? | Devuelve CV, originales, defaultId y primaryId; puede incluir datos resumidos del perfil |
| getDocument | DocumentRef | Lee el contenido estructurado de un CV o el CV vinculado a un original |
| prepareAttachment | DocumentRef | Prepara PDF de CV u original en bytes |
| browser_file_upload | paths[] | Entrega archivos preparados al formulario del navegador |
| recordApplication | documentRefs[] | Registra referencias documentales de la candidatura |
| getApplication | Application ID | Resuelve las referencias existentes para el detalle |

MIRAI_INSTRUCTIONS ordena seleccionar por pertinencia y utilizar primaryId con kind=cv cuando el CV se genera desde el perfil de Mirai. Aunque listDocuments devuelve defaultId, la instrucción no establece que el agente deba utilizarlo como selección automática.

## 7. Modelo de datos y propiedad

### 7.1. Entidades

| Entidad | Campos relevantes | Fuente de verdad |
|---|---|---|
| candidate_profiles | account_id, cv_url, evidence_urls, extraction, profile, revision, profile_updated_at, confirmed, onboarding_completed, extraction_operation_id | Perfil principal y referencias a fuentes |
| cv_documents | id, account_id, kind, name, specialization, profile, source_key, is_default, revision, last_replacement_id, created_at, updated_at | Metadatos y contenido de variantes |
| original_documents | id, account_id, key, name, created_at | Registro de archivos fuente |
| document_cleanup | key, account_id, due_at | Archivos en espera de adopción o eliminación |
| applications | document_refs JSONB | Referencias de documentos usadas por la candidatura |

### 7.2. Invariantes de persistencia

**cv_documents:**

- kind solo admite primary o variant.
- El índice parcial cv_one_primary permite un principal por cuenta.
- El índice parcial cv_one_default permite una variante predeterminada por cuenta.
- Un primary requiere profile, source_key e is_default nulos/falso.
- Un variant requiere profile JSON objeto y last_replacement_id nulo.
- name tiene entre 1 y 120 caracteres después de trim; specialization admite hasta 120.
- account_id referencia candidate_profiles.account_id.

**original_documents:**

- key es único.
- account_id referencia candidate_profiles.account_id con eliminación en cascada.
- format se deriva de la extensión de key: pdf o docx.

**Relaciones de fuente:**

- El CV principal obtiene su archivo fuente desde candidate_profiles.cv_url.
- Una variante utiliza cv_documents.source_key.
- source_key no es una foreign key a original_documents; la asociación se resuelve por account_id y key.
- El contenido estructurado del principal vive en candidate_profiles.profile.
- El contenido estructurado de una variante vive en cv_documents.profile.

**Referencias de candidatura:**

- applications.document_refs es un array JSONB de DocumentRef.
- DocumentRef contiene id y kind; no incluye revision, snapshot ni storage key.
- No existe una foreign key entre document_refs y cv_documents/original_documents.
- resultsRepository resuelve ownership y nombre al registrar y vuelve a resolver al consultar el detalle.

### 7.3. Selección predeterminada

library calcula defaultId con este orden:

1. ID de la variante con is_default=true.
2. ID del principal, si existe.
3. null si no existe ninguno.

El principal no puede tener is_default=true. La selección explícita siempre corresponde a una variante.

## 8. Estados, concurrencia y consistencia

### 8.1. Control de revisiones

- Las escrituras de CvRepository abren una transacción y ejecutan lockAccount.
- lockAccount aplica lock_timeout de cinco segundos y bloquea candidate_profiles con SELECT FOR UPDATE.
- La revisión de una variante es cv_documents.revision.
- La revisión del principal combina cv_documents.revision y candidate_profiles.revision.
- update compara la revisión recibida con la revisión actual antes de escribir.
- Un conflicto devuelve CV_CONFLICT y no sobrescribe el contenido concurrente.
- La revisión no representa una versión histórica y no existe una entidad cv_versions.

### 8.2. Idempotencia

| Operación | Mecanismo |
|---|---|
| Carga de originales | IDs generados por cliente y comprobación de originales existentes |
| Duplicación | ID de la nueva variante |
| Escaneo de original | Consulta linkedCv antes de extraer y nueva comprobación dentro de saveScan |
| Importación confirmada | ID de variante y consulta imported |
| Reemplazo del principal | operationId guardado en last_replacement_id |

### 8.3. Eliminación y referencias

- Eliminar el CV principal borra su fila y pone candidate_profiles.cv_url en null; el perfil y las preferencias permanecen.
- Eliminar una variante borra su fila, pero no elimina automáticamente original_documents.
- Eliminar un original retira su fila, elimina su referencia de cv_url/evidence_urls y pone source_key en null para las variantes asociadas.
- El contenido estructurado de una variante permanece después de retirar su original.
- Las referencias de candidaturas no se actualizan al eliminar un documento; getApplication omite las referencias que ya no se pueden resolver.

### 8.4. Ciclo de vida del almacenamiento

~~~mermaid
flowchart TD
  A["stageUpload"] --> B["document_cleanup due_at = now + 1 hour"]
  B --> C["S3 PutObject"]
  C --> D{"Adopción confirmada"}
  D -->|Sí| E["adoptDocument"]
  E --> F["Eliminar marca temporal vigente"]
  F --> G["Insert original_documents"]
  D -->|No| H["Cleanup al vencer"]
  G --> I{"Archivo referenciado"}
  H --> I
  I -->|Sí| J["Eliminar solo marca de cleanup"]
  I -->|No| K["S3 DeleteObject"]
  K --> L{"Eliminación exitosa"}
  L -->|Sí| M["Eliminar marca de cleanup"]
  L -->|No| N["Conservar para reintento"]
~~~

DocumentCleanup aplica un advisory transaction lock por cuenta mediante lockStoredFiles. checkOriginalCapacity cuenta original_documents y adjuntos de chat no clasificados como imágenes. adoptDocument valida capacidad y elimina la marca temporal solo si su due_at sigue vigente.

drainDue procesa hasta ocho claves por llamada. Antes de eliminar un objeto comprueba candidate_profiles.cv_url, evidence_urls, cv_documents.source_key y original_documents.key. Si el archivo sigue referenciado, elimina la marca de cleanup sin borrar el objeto. Si la eliminación física falla, conserva la entrada para reintento.

## 9. Errores y recuperación

| Condición | Detección | Respuesta | Recuperación |
|---|---|---|---|
| Archivo vacío | documentSelectionError / documentPart | EMPTY_DOCUMENT | Seleccionar otro archivo |
| Formato no admitido | Extensión y MIME | UNSUPPORTED_DOCUMENT | Usar PDF o DOCX |
| PDF/DOCX ilegible | Firma, pdf-lib o Mammoth | UNREADABLE_DOCUMENT | Reemplazar el archivo |
| Archivo demasiado grande | Límites de carga | DOCUMENT_TOO_LARGE | Reducir el archivo |
| Selección demasiado grande | Suma de tamaños | DOCUMENTS_TOO_LARGE | Reducir cantidad o tamaño |
| Capacidad documental agotada | checkOriginalCapacity | ORIGINAL_UPLOAD_LIMIT | Eliminar documentos que ya no se necesitan |
| Extracción no válida | Validación del resultado estructurado | NOT_A_CV / INVALID_EXTRACTION | Revisar el documento |
| Proveedor de IA no disponible | ApiError del proveedor | AI_UNAVAILABLE / 502 | Reintentar la operación |
| CV inexistente o ajeno | Consulta con ownership | CV_NOT_FOUND / 404 | Volver a consultar la biblioteca |
| Revisión obsoleta | Comparación de revision | CV_CONFLICT / 409 | Leer el contenido actual y confirmar la sobrescritura |
| Cuenta bloqueada por otra escritura | PostgreSQL 55P03 | CV_BUSY / 503 | Reintentar |
| Error de almacenamiento | Operación S3 | STORAGE_FAILED / 502 | Reintentar lectura o carga |
| Limpieza física fallida | documentCleanup | cleanupPending=true | POST /v1/cvs/cleanup |
| Documento eliminado | Resolución de referencias | Referencia omitida en el detalle | Seleccionar un documento que siga disponible |

Los errores de validación de request devuelven 400. Los errores de extracción se responden con 422. Los errores CV específicos utilizan el status definido por CvError.

## 10. Seguridad

### 10.1. Identidad y ownership

- createProfileRoutes valida el Bearer token mediante verifyIdentity.
- El accountId autenticado se coloca en res.locals.accountId.
- Todas las rutas de CV reciben el accountId autenticado, no uno enviado por el cliente.
- CvRepository aplica ownership en lecturas, escrituras y eliminaciones.
- resultsRepository filtra CV y originales por accountId antes de devolver referencias.
- Las rutas responden con Cache-Control: no-store.

### 10.2. Archivos privados

DocumentStorage calcula un prefijo por cuenta usando SHA-256 del accountId. Las claves incluyen un UUID, el digest SHA-256 del contenido y la extensión.

checkOwner verifica que la clave pertenezca al prefijo de la cuenta antes de leer, firmar o eliminar. Las URLs firmadas de lectura expiran a los 120 segundos.

### 10.3. Carga y adjuntos

- Multer utiliza memoryStorage.
- La API valida extensión, tamaño y contenido antes de extraer.
- El backend no acepta rutas arbitrarias para browser_file_upload.
- authorizeUpload permite únicamente rutas preparadas en la invocación actual.
- Los archivos temporales se escriben con permisos 0600 y se eliminan al cerrar las herramientas.
- La extensión protege la pestaña controladora y bloquea comandos CDP sensibles, incluido DOM.setFileInputFiles.

## 11. Configuración

| Variable | Uso | Valor por defecto |
|---|---|---|
| AWS_ENDPOINT_URL_S3 | Endpoint S3-compatible | Sin valor explícito |
| AWS_REGION | Región del cliente S3 | us-east-1 |
| NEON_STORAGE_BUCKET | Bucket de documentos | mirai-documents |
| GOOGLE_CLOUD_PROJECT | Proyecto para extracción | mirai-514723 |
| GOOGLE_CLOUD_LOCATION | Región de inferencia | global |
| GOOGLE_GENAI_MODEL | Modelo primario de extracción | gemini-4-hydrogen |
| GOOGLE_GENAI_FALLBACK_MODEL | Modelo alternativo | gemini-3.8-flash |
| MIRAI_CV_TEST_NEON | Habilita integración CV contra Neon | No habilitada |
| MIRAI_DB_TEST | Habilita prueba de integridad del perfil | No habilitada |

Las pruebas de integración cargan apps/api/.env cuando se habilitan. No se documentan valores secretos.

## 12. Rendimiento y recursos

| Recurso | Límite |
|---|---:|
| Archivos por selección | 10 |
| Tamaño por archivo | 10 MiB |
| Tamaño total por selección | 30 MiB |
| Originales y adjuntos de chat no-imagen | 20 por cuenta |
| Documentos de evidencia en onboarding | 9 |
| Archivos por operación browser_file_upload | 10 |
| Timeout de extracción del modelo | 120 s |
| Timeout de carga S3 | 60 s |
| Timeout de lectura S3 | 30 s |
| Timeout de eliminación S3 | 10 s |
| Vigencia de URL firmada | 120 s |
| Claves procesadas por drainDue | 8 por llamada |

CvLibrary mantiene la consulta de biblioteca y originales en caché de React Query durante 30 segundos. CvThumbnail carga detalles y genera thumbnails cuando el elemento se aproxima al viewport. El thumbnail generado se identifica por cuenta, CV, revisión e idioma.

## 13. Observabilidad

Los eventos de log relevantes incluyen:

| Evento | Contexto |
|---|---|
| cv_source_upload_failed | Fallo al guardar un archivo fuente |
| document_cleanup_pending | Error durante la eliminación física |
| document_cleanup_check_failed | Fallo al comprobar el estado de limpieza |
| extraction_provider_failed | Fallo del proveedor de extracción |

Los logs registran tipo de error y estado del proveedor; no deben incluir bytes, claves completas de almacenamiento ni el contenido del perfil.

## 14. Verificación técnica

### 14.1. Pruebas existentes

| Prueba | Cobertura |
|---|---|
| apps/api/src/features/cvs/cvLibrary.test.ts | Aislamiento por cuenta, duplicación idempotente, variantes independientes, concurrencia optimista, selección predeterminada, validación e idempotencia de import/confirm, reemplazo idempotente, eliminación del principal, recreación, URLs firmadas y limpieza física |
| apps/api/src/features/profiles/profileRepository.test.ts | Exclusión de extracciones antiguas, preservación de ediciones manuales, asociación de evidencias, preferencias y finalización del onboarding |
| apps/api/src/features/profiles/extractProfile.test.ts | Rechazo de archivos vacíos o corruptos y validación de PDF antes de invocar el modelo |
| packages/contracts/src/cvs.test.ts | Validación de contratos de biblioteca, duplicación, importación y actualización |
| packages/contracts/src/documents.test.ts | Límites de cantidad, tamaño, formato y selección |

cvLibrary.test.ts está condicionado a MIRAI_CV_TEST_NEON=1 y requiere DATABASE_URL de Neon y AWS_ENDPOINT_URL_S3. profileRepository.test.ts requiere MIRAI_DB_TEST=1. Las pruebas de extracción y contratos no requieren servicios Neon.

### 14.2. Cobertura no presente en el repositorio

- No hay una suite de Playwright E2E para la interfaz de biblioteca de CV.
- No hay pruebas de componentes web bajo apps/web/src/features/cvs.
- No hay pruebas del renderer StandardCv en packages/cv-renderer.
- cvLibrary.test.ts no cubre la carga de originales usada por CvImportDialog, el flujo scan, la eliminación de originales ni la extracción real de Gemini.
- No hay pruebas de renderizado de StandardCv, de preparación de adjuntos, de la carga en Chrome ni de persistencia/resolución de referencias documentales en candidaturas.
- El manifiesto docs/design/screenshots/verification.json describe referencias visuales estáticas; no constituye una ejecución E2E ni prueba de generación PDF o envío real.

No se ejecutan pruebas como parte de esta verificación documental.

### 14.3. Comandos de prueba

~~~bash
pnpm exec vitest run apps/api/src/features/profiles/extractProfile.test.ts packages/contracts/src/cvs.test.ts packages/contracts/src/documents.test.ts

MIRAI_CV_TEST_NEON=1 pnpm exec vitest run apps/api/src/features/cvs/cvLibrary.test.ts --testTimeout 90000 --hookTimeout 45000

MIRAI_DB_TEST=1 pnpm exec vitest run apps/api/src/features/profiles/profileRepository.test.ts
~~~

## 15. Decisiones técnicas vigentes

| Decisión | Contexto | Justificación | Consecuencia |
|---|---|---|---|
| El principal reutiliza candidate_profiles.profile | El perfil es la fuente profesional de la cuenta | Evita mantener dos perfiles principales divergentes | Editar el principal actualiza el perfil |
| Las variantes guardan su propio profile | Cada variante puede tener contenido distinto | Aísla sus modificaciones | Duplicar no modifica el origen |
| sourceKey vincula una variante a un original | Una variante puede derivar de un archivo fuente | Permite consultar y retirar la fuente sin perder el contenido estructurado | La relación se mantiene por cuenta y clave |
| revision controla concurrencia | Dos ediciones pueden partir del mismo contenido | Evita sobrescrituras silenciosas | Un guardado obsoleto devuelve CV_CONFLICT |
| El PDF usa un renderer compartido | Web y agente necesitan la misma presentación | Evita generar dos formatos divergentes | StandardCv sirve para preview, descarga y adjunto |
| La limpieza se separa de la escritura de biblioteca | La base de datos y el almacenamiento no comparten transacción | Evita borrar archivos aún referenciados y permite reintentar | document_cleanup coordina la eliminación |
| Las candidaturas guardan referencias actuales | El contrato DocumentRef solo contiene ID y tipo | La lectura se resuelve contra la biblioteca del propietario | No existe snapshot histórico del documento utilizado |

## 16. Mapa de implementación

| Responsabilidad | Ubicación |
|---|---|
| Contratos de CV y originales | packages/contracts/src/cvs.ts |
| Perfil profesional estructurado | packages/contracts/src/profile.ts |
| Límites de documentos | packages/contracts/src/documents.ts |
| Esquema de CV y originales | apps/api/src/features/cvs/schema.ts |
| Repositorio de CV | apps/api/src/features/cvs/cvRepository.ts |
| Rutas de CV | apps/api/src/features/cvs/routes.ts |
| Almacenamiento de originales | apps/api/src/features/profiles/documentStorage.ts |
| Adopción y limpieza | apps/api/src/features/profiles/documentCleanup.ts |
| Validación multipart | apps/api/src/features/profiles/documentHttp.ts |
| Extracción de perfil | apps/api/src/features/profiles/extractProfile.ts |
| Prompt de extracción | apps/api/src/features/profiles/cv_extractor_prompt.ts |
| Persistencia del perfil y onboarding | apps/api/src/features/profiles/profileRepository.ts |
| Biblioteca web | apps/web/src/features/cvs/CvLibrary.tsx |
| Importación de originales | apps/web/src/features/cvs/CvImportDialog.tsx |
| Vista de originales y escaneo | apps/web/src/features/cvs/CvOriginalDialog.tsx |
| Edición y conflictos | apps/web/src/features/cvs/CvDraftDialog.tsx |
| Reemplazo principal | apps/web/src/features/cvs/CvReplaceDialog.tsx |
| Comparación | apps/web/src/features/cvs/CvComparison.tsx |
| API web de CV | apps/web/src/features/cvs/cvApi.ts |
| Vista y edición de perfil | apps/web/src/features/profiles/DocumentWorkspace.tsx, ProfileEditor.tsx |
| Importación y onboarding | apps/web/src/features/profiles/ImportDocuments.tsx, ProfileProvider.tsx, OnboardingGate.tsx |
| Vista previa PDF | apps/web/src/features/profiles/MiraiCv.tsx, LivePdfPreview.tsx, pdfThumbnail.ts |
| PDF del frontend | apps/web/src/features/profiles/cvPdf.tsx |
| PDF canónico compartido | packages/cv-renderer/src/StandardCv.tsx |
| Renderer Node para adjuntos | packages/cv-renderer/src/node.tsx |
| Herramientas de documentos del agente | apps/api/src/features/agents/miraiTools.ts |
| Instrucciones de selección documental | apps/api/src/features/agents/miraiPrompt.ts |
| Preparación y autorización de adjuntos | apps/api/src/features/agents/playwrightTools.ts |
| Política CDP de Chrome | apps/extension/lib/remoteBrowser.ts |
| Referencias documentales de candidaturas | apps/api/src/features/applications/schema.ts, resultsRepository.ts |
| Detalle de candidatura | apps/web/src/features/applications/ApplicationDetail.tsx |
| Integración de rutas | apps/api/src/features/profiles/routes.ts, apps/api/src/bootstrap/app.ts |

## 17. Glosario

| Término | Definición |
|---|---|
| ProfessionalProfile | Estructura normalizada de los datos profesionales |
| CvRepository | Repositorio de lectura y escritura de CV y originales |
| sourceKey | Clave del objeto original asociada a una variante |
| revision | Token utilizado para detectar escrituras concurrentes |
| original_documents | Registro de archivos fuente pertenecientes a una cuenta |
| cv_documents | Registro del CV principal y las variantes |
| document_cleanup | Cola de claves que deben adoptarse o eliminarse |
| DocumentRef | Identificador y tipo de documento utilizado por el agente o una candidatura |
| StandardCv | Componente compartido que representa un perfil como PDF |
| prepareAttachment | Operación que prepara un CV u original para una carga desde el navegador |


## 18. Documentos relacionados

- [Biblioteca y gestión de CV — Documento de negocio](mirai_cv_library.md)
- [Mirai WorkFlow E2E](../../product/mirai_workflow_e2e.md)
- [Architecture & Design](../../architecture/mirai_architecture.md)
- [UI/UX E2E](../../design/mirai_ui_ux_e2e.md)
- [Browser Control Architecture](../browser/mirai_browser_implementation.md)
