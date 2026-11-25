# Mirai — CI/CD y DevSecOps

> **Tipo:** Técnico  
> **Alcance:** Integración continua, controles de calidad y seguridad, construcción de imágenes, migraciones, despliegue de API y Web, verificación y recuperación de tráfico. Excluye la provisión de recursos cloud y la distribución de la extensión.  
> **Responsable:** Ingeniería de Mirai  
> **Última verificación:** 2026-11-25

## 1. Resumen técnico

GitHub Actions coordina la integración continua (CI) y el despliegue continuo (CD) de Mirai. Las pull requests (PR) hacia `main` ejecutan validaciones y análisis de código. Cada push a `main` inicia una release automática: valida el monorepo, construye y analiza dos imágenes, comprueba y aplica migraciones compatibles, prepara revisiones de Cloud Run sin tráfico y las promueve si superan las comprobaciones. Un fallo durante la promoción activa la recuperación de la distribución anterior.

El pipeline utiliza identidad federada de Google Cloud, una rama Neon dev para integración y la conexión directa de producción exclusivamente para operaciones controladas de esquema. La extensión se compila en CI, pero no se publica mediante este CD. La topología de ejecución se define en [Infrastructure & Deployment](mirai_infrastructure_and_deployment.md).

## 2. Arquitectura y dependencias

~~~mermaid
flowchart TD
  PR["PR hacia main"] --> CI["ci.yml"]
  PR --> CQ["codeql.yml"]
  Push["Push a main"] --> Release["deploy.yml"]
  Release --> CI
  Release --> CQ
  CI --> Dev[("Neon dev")]
  CI --> Build["Cloud Build · API y Web"]
  Build --> AR["Artifact Registry"]
  AR --> Scan["Trivy · ambos digests"]
  CQ --> Migrate["Schema gate y migraciones"]
  Scan --> Migrate
  Migrate --> Prod[("Neon producción")]
  Migrate --> Stage["Cloud Run · candidatas"]
  Stage --> Check["Health checks"]
  Check --> Promote["Promoción + verificación"]
  Promote --> Summary["Release summary"]
  Promote -. Fallo .-> Restore["Restauración de tráfico"]
  Restore --> Summary
  Manual["rollback.yml · dispatch"] --> Restore
~~~

| Componente | Responsabilidad | Entradas | Salidas |
|---|---|---|---|
| GitHub Actions | Orquestación, gates y trazabilidad | Commit, evento, variables y secretos | Estados de jobs, artifacts y summaries |
| Neon dev | Datos e integración aislados de producción | Conexiones pooled/direct, credenciales S3 | Resultados de suites con servicios reales |
| CodeQL | Análisis estático de JavaScript y TypeScript | Código y baseline versionado | SARIF y resultado del gate |
| Cloud Build | Construcción asíncrona de dos imágenes | Archivo del commit, Dockerfile, sustituciones | Build ID, tag y digest |
| Artifact Registry | Almacenamiento de imágenes | Imágenes de Cloud Build | Referencias por SHA-256 |
| Trivy | Análisis de paquetes de SO y bibliotecas | Imagen remota por digest | JSON, SARIF y conteo bloqueante |
| Secret Manager | Entrega de la conexión directa de producción | Identidad GCP autorizada | Credencial para schema gate |
| Neon producción | Autoridad del ledger de migraciones | Migraciones revisadas | Huella de esquema y número aplicado |
| Cloud Run | Ejecución, revisiones y enrutamiento | Imágenes por digest y operaciones de tráfico | Revisiones, URLs, estado Ready y tráfico |
| Dependabot | Seguimiento de dependencias y actualizaciones | Manifests, lockfile, workflows y Dockerfiles | Alertas y PR de actualización |

GitHub, Cloud Build, Artifact Registry y Cloud Run son dependencias operativas del CD. Un fallo de autenticación, construcción, consulta de imágenes o escaneo impide avanzar a las etapas dependientes. La disponibilidad de Neon dev condiciona la integración obligatoria; la de Neon producción condiciona la validación de esquema y la migración.

## 3. Disparadores y controles de CI

| Workflow | Disparador | Responsabilidad |
|---|---|---|
| [ci.yml](../../.github/workflows/ci.yml) | PR hacia main; workflow_call | Validar workspace, código, pruebas e integración |
| [codeql.yml](../../.github/workflows/codeql.yml) | PR hacia main; lunes 07:25 UTC; workflow_call | Análisis y gate de seguridad de código |
| [deploy.yml](../../.github/workflows/deploy.yml) | Push a main | Ejecutar CI, invocar CodeQL y entregar la release |
| [rollback.yml](../../.github/workflows/rollback.yml) | workflow_dispatch en main | Recuperar una pareja verificada de revisiones |

El ruleset Main CI Gate exige el check CI Gate sobre main y admite el bypass configurado para el propietario. La protección de main impide eliminación y cambios no fast-forward. El CD vuelve a ejecutar CI después de un push, incluso cuando el cambio entra mediante bypass.

La acción [.github/actions/setup](../../.github/actions/setup/action.yml) instala Node.js 26 y pnpm 10.33.0, usa caché de pnpm e instala el workspace con `--frozen-lockfile`.

~~~mermaid
flowchart LR
  Setup --> Static["Static Analysis"]
  Setup --> Automated["Automated Testing"]
  Setup --> Integration["Integration Testing"]
  Setup --> Build["Build Validation"]
  Static --> Gate["CI Gate"]
  Automated --> Gate
  Integration --> Gate
  Build --> Gate
~~~

| Job | Operaciones y criterio |
|---|---|
| setup | Valida versiones de Node, pnpm y Vitest |
| static | pnpm lint y pnpm typecheck |
| automated | Compila paquetes compartidos, ejecuta test:ci con cobertura y pruebas de recuperación aisladas |
| integration | Verifica Neon dev, aplica migraciones dev y ejecuta suites obligatorias |
| build | Compila contracts, cv-renderer, API, Web y extensión Chrome |
| gate | Se ejecuta aunque fallen dependencias; exige éxito de todas las etapas aplicables |

### 3.1. Cobertura y alcance de pruebas

Vitest utiliza V8 y mide código fuente de API, Web, extensión y paquetes internos incluidos por [vitest.config.ts](../../vitest.config.ts). Excluye archivos de pruebas y declaraciones de tipos. Los umbrales son globales para esta medición, no una garantía de cobertura por módulo.

| Métrica | Umbral mínimo (%) |
|---|---:|
| Líneas | 29 |
| Sentencias | 27,8 |
| Funciones | 18,38 |
| Ramas | 24,48 |

El job produce text-summary, JSON y HTML; publica el artifact `vitest-coverage` y el resumen de métricas. El comando `test:ci` excluye las tres suites Neon ejecutadas en el job de integración y las pruebas de extensión Chrome y continuidad del workspace enumeradas en [package.json](../../package.json). No representa un E2E real de todas las funcionalidades de usuario.

### 3.2. Integración Neon dev

El script [test-neon-dev.sh](../../.github/scripts/test-neon-dev.sh) comprueba hosts pooled y direct autorizados, base mirai, SSL, endpoint de storage, credenciales disponibles y flags de integración. Abre ambas conexiones, aplica las migraciones dev y ejecuta secuencialmente:

- `billing.integration.test.ts`
- `profileRepository.test.ts`
- `cvLibrary.test.ts`

El script inspecciona el reporte JSON de Vitest y falla si falta una suite, no ejecuta pruebas o alguna no pasa. Utiliza timeouts de prueba de 90 s y hooks de 45 s. El grupo `mirai-neon-dev-integration` serializa accesos a la rama compartida. En PR de forks y de Dependabot la integración se omite para no entregar secretos; CI Gate exige ese estado skipped y las restantes validaciones exitosas. En releases de main la integración es obligatoria.

## 4. Seguridad y quality gates

### 4.1. CodeQL

Analiza JavaScript y TypeScript sin build, publica SARIF (Static Analysis Results Interchange Format) y ejecuta [codeql-gate.mjs](../../ops/codeql-gate.mjs). Para hallazgos de seguridad con severidad numérica igual o superior a 7 compara regla, ruta relativa y fingerprint con [codeql-baseline.json](../../ops/codeql-baseline.json), respetando multiplicidades. Falla si aparece un hallazgo alto/crítico no reconocido, falta el reporte o el análisis no es válido. El baseline admite los hallazgos reconocidos; no afirma que el código carezca de vulnerabilidades.

CodeQL corre en paralelo al CI y a las primeras etapas de publicación; debe terminar exitosamente antes del job de migraciones.

### 4.2. Trivy

[scan-release.sh](../../ops/scan-release.sh) descarga Trivy 0.76.2 y verifica el SHA-256 del binario distribuido. Autentica Docker en el registro y escanea la imagen remota por digest, con scanners de vulnerabilidades y tipos de paquetes os/library. Publica JSON, SARIF y conteos en artifacts y GitHub Code Scanning.

La política bloquea hallazgos HIGH o CRITICAL que disponen de una versión corregida. Los hallazgos sin corrección disponible se reportan, pero no bloquean por sí solos. Un error del escáner o de sus resultados impide alcanzar la migración.

### 4.3. Dependabot

[dependabot.yml](../../.github/dependabot.yml) define actualizaciones semanales de npm/pnpm en la raíz, GitHub Actions y Dockerfiles de API/Web; agrupa actualizaciones relacionadas. Las PR de Dependabot pasan las validaciones aplicables de CI y CodeQL; la integración con secretos se exige en la release de main. Las alertas y actualizaciones de seguridad se consultan en [GitHub Security](https://github.com/Paz1CP/mirai/security/dependabot).

## 5. Flujo de release

### 5.1. Construcción y publicación

Tras CI exitoso, la matriz images construye API y Web en paralelo. Cada job realiza checkout del SHA exacto del evento, comprueba identidad GCP activa y consulta si ya existe el tag del SHA completo en Artifact Registry.

Si no existe, crea un tar gzip a partir de git archive del commit, excluyendo patrones de archivos de entorno, credenciales temporales y claves. Envía el archivo al bucket de staging de Cloud Build con el YAML parametrizado por aplicación, SHA y origen API público. Cloud Build se ejecuta de forma asíncrona; el runner consulta su estado cada 10 s hasta éxito o error. Comprueba que el digest publicado coincide con el resultado de build. Si el tag ya existe, reutiliza la referencia registrada. El grupo por SHA y aplicación reduce builds duplicados.

Los Dockerfiles utilizan Node 26 bookworm-slim fijado por digest, pnpm 10.33.0, instalación congelada y etapas separadas. API utiliza dependencias de producción en runtime; Web utiliza la salida standalone de Next.js. Ambos procesos corren como node y eliminan npm/npx del runtime. El origen público de API forma parte de la construcción web. El resultado `image.json` identifica commit, imagen por digest y Build ID (o indicación de reutilización).

### 5.2. Schema gate y migraciones de producción

El job migrate espera Trivy y CodeQL. Obtiene temporalmente el secreto mirai-neon-db-unpooled y ejecuta `node ops/schema-gate.mjs migrate`.

El gate verifica el destino directo de producción, compara el ledger de migraciones Drizzle con los archivos del repositorio y calcula una huella SHA-256 del ledger. Cada transición pendiente debe estar revisada en `compatibleMigrations` de [release-policy.json](../../ops/release-policy.json). La compatibilidad se representa mediante huellas de origen y destino; el código no deduce por sí solo la compatibilidad semántica de SQL, que requiere revisión de ingeniería.

Con la política válida invoca `pnpm --filter @mirai/api db:migrate`, aplica las migraciones pendientes y comprueba que el ledger final es el esperado. La conexión se entrega al proceso; el gate utiliza límites de conexión y consulta de 15 s y configura lock_timeout de 5 s y statement_timeout de 120 s para el comando de migración. Devuelve schema y applied como outputs del job. Si no existen migraciones pendientes, el resultado válido es cero.

Ante un ledger no reconocido, una transición no autorizada o un error de Drizzle, la release no crea candidatas. La recuperación de tráfico no revierte PostgreSQL.

### 5.3. Captura y creación de revisiones

El job deploy descarga los artifacts de ambas imágenes, obtiene la huella de esquema y ejecuta `ops/deploy.sh capture`. Registra tráfico previo de API/Web, tags, commit, run, digests, builds y huellas de configuración de runtime. Publica `previous-traffic` antes de actualizar Cloud Run.

`ops/deploy.sh stage` actualiza API y luego Web por digest con `--no-traffic`. Utiliza el sufijo run ID/attempt y un tag temporal de la forma `r-<run>-<attempt>`. Verifica la pertenencia de cada revisión al servicio, su digest, condición Ready=True, tráfico sin cambios y huella de runtime idéntica. Comprueba también que API_URL de Web apunta al origen configurado. Las URLs etiquetadas se guardan en `candidates.json`.

### 5.4. Health checks

El job candidate_health usa las URLs de los tags temporales y vuelve a comprobar revisión y digest.

| Superficie | Condición |
|---|---|
| API /health | HTTPS, HTTP 200 y JSON con status = ok |
| Web /health | HTTPS, HTTP 200 y texto API: connected |
| Revisión Cloud Run | Ready=True, servicio y digest esperados |

El helper intenta hasta diez veces, con timeout de conexión de 8 s, timeout total HTTP de 20 s y espera de 5 s entre intentos fallidos. La Web candidata consulta la API configurada, que todavía recibe el tráfico anterior; por eso la verificación de la pareja nueva se repite después de la promoción. Los health checks no equivalen a probar todos los flujos de negocio ni todos los proveedores externos.

### 5.5. Promoción y verificación final

El job promote comprueba que el tráfico sigue coincidiendo con la captura. Actualiza API al 100 % de la revisión candidata y luego Web al 100 %, utilizando nombres de revisión explícitos. Verifica los endpoints principales, elimina los tags de esa release, comprueba que los tags ajenos se mantienen y confirma las asignaciones finales. Publica un recibo de release con las revisiones, imágenes, builds, commit y huella de esquema.

La promoción de dos servicios es secuencial y no atómica; la compatibilidad de esquema y de contratos durante la ventana de transición es una condición operativa. La recuperación restaura el estado previo ante fallos, sin prometer una ausencia absoluta de latencia o errores transitorios.

~~~mermaid
sequenceDiagram
  participant GA as GitHub Actions
  participant DB as Neon producción
  participant A as Cloud Run API
  participant W as Cloud Run Web
  GA->>DB: Validar ledger y aplicar pendientes compatibles
  DB-->>GA: Huella de esquema
  GA->>A: Capturar tráfico y crear candidata 0%
  GA->>W: Capturar tráfico y crear candidata 0%
  GA->>A: Ready, digest y health por tag
  GA->>W: Ready, digest y health por tag
  alt Ambas candidatas válidas
    GA->>A: Promover revisión exacta
    GA->>W: Promover revisión exacta
    GA->>A: Health URL principal
    GA->>W: Health URL principal y API conectada
    alt Verificación correcta
      GA->>GA: Registrar recibo y resultado
    else Fallo de promoción o salud
      GA->>A: Restaurar tráfico previo
      GA->>W: Restaurar tráfico previo
    end
  else Candidata inválida
    GA->>GA: Detener promoción
  end
~~~

## 6. Contratos y propiedad de datos

| Dato / artifact | Productor | Consumidor y significado |
|---|---|---|
| image-api / image-web | images | scan y deploy; image.json contiene commit, image y build |
| scan-api / scan-web | scan | Evidencia de análisis por digest y summary |
| schema / applied | migrate | deploy y summary; huella del ledger y número de migraciones |
| previous-traffic | deploy | promote y recover; estado anterior y datos de la release |
| candidates | deploy | candidate_health y promote; revisiones, digests, URLs y metadata |
| release-receipt | promote exitoso | rollback manual; release.json identifica la pareja compatible |
| promotion-state / recovery-state | promote / recover | summary; resultado y tráfico final cuando están disponibles |
| vitest-coverage | automated | Ingeniería; métricas y reporte HTML/JSON |
| rollback-previous / rollback-result | rollback.yml | Captura y evidencia de operación manual |

GitHub conserva estos artifacts con su política de retención aplicable. Artifact Registry es la autoridad del contenido identificado por digest; Cloud Run es la autoridad de las revisiones y tráfico efectivos; el ledger de Neon es la autoridad del esquema aplicado. El recibo no sustituye las comprobaciones contra estas autoridades. La recuperación manual por run ID depende de la disponibilidad del recibo y de las revisiones correspondientes.

## 7. Concurrencia, estados y recuperación

Los workflows de release y rollback comparten `mirai-production` con `cancel-in-progress: false`, de modo que no modifican simultáneamente producción a través de estos workflows. GitHub Actions no garantiza orden FIFO ni conserva todas las ejecuciones pendientes cuando se acumulan pushes; una ejecución activa no se cancela por la llegada de otra al grupo. Las operaciones externas al pipeline quedan fuera de esa exclusión; promote comprueba que el tráfico previo no ha variado.

| Estado | Condición / transición |
|---|---|
| Validando | CI y CodeQL; la publicación depende de CI |
| Publicado | Ambas imágenes existen por digest |
| Escaneado | Trivy y CodeQL superan sus gates |
| Esquema validado | Ledger esperado y migraciones compatibles |
| Candidata | Revisión Ready sin tráfico principal |
| Promoviendo | Ambas candidatas pasan health checks |
| Release verificada | Ambas revisiones al 100 %, health principal exitoso y recibo |
| Fallida | Una etapa obligatoria falla; las siguientes se bloquean |
| Recuperada | Rollback restaura el tráfico anterior y verifica salud |
| Recuperación fallida | El pipeline registra fallo y requiere intervención del operador |

### 7.1. Manejo de fallos

| Condición | Detección | Comportamiento / recuperación |
|---|---|---|
| CI, identidad GCP o build | Job o comando falla | No se despliegan nuevas revisiones |
| CodeQL o Trivy | Gate o análisis falla | No se ejecutan migraciones de producción |
| Migración incompatible o fallida | Schema gate | No se crean candidatas; revisar ledger y política |
| Candidata inválida | Ready/digest/configuración o health | No se promueve; se intenta retirar los tags temporales |
| Cambio externo de tráfico | Comparación con snapshot | Se bloquea la promoción |
| Promoción parcial o fallo de salud posterior | Error en promote | Trap ejecuta restore; job recover actúa adicionalmente si promote falla o se cancela y candidate_health fue exitoso |
| Fallo de recuperación | Tráfico, tags o salud no coinciden | Registrar fallo, inspeccionar estado real e intervenir |

`ops/rollback.sh restore` reestablece los porcentajes previos de cada servicio, incluidos splits, comprueba los tags preexistentes y ejecuta health checks. El helper evita repetir una actualización si la asignación ya coincide. No reconstruye imágenes ni ejecuta migraciones inversas.

### 7.2. Rollback manual

1. Abrir [Production rollback](https://github.com/Paz1CP/mirai/actions/workflows/rollback.yml).
2. Seleccionar Run workflow en la rama main.
3. Introducir en release el ID de un run exitoso de Production release en main (evento push), o `baseline` para la pareja declarada en release-policy.json.
4. Ejecutar el workflow y consultar su summary.

El workflow descarga el recibo o lee la baseline, verifica la huella de esquema actual y la compatibilidad declarada, captura el tráfico previo y comprueba existencia, servicio, Ready, digest y origen API de la pareja solicitada. Requiere salud inicial de producción, promueve la pareja y verifica salud final. Si falla después de iniciar cambios, intenta restaurar el tráfico anterior. Si el recibo caduca o las revisiones ya no existen, la selección no es válida.

## 8. Seguridad e identidad

GitHub Actions utiliza OpenID Connect (OIDC) y Workload Identity Federation (WIF), mediante [gcp-auth](../../.github/actions/gcp-auth/action.yml). Los jobs cloud solicitan id-token: write y utilizan credenciales temporales para impersonar la cuenta de servicio configurada, sin una clave JSON permanente. La identidad de despliegue es distinta de las identidades runtime de API/Web. Las operaciones que publican SARIF requieren security-events: write; el rollback utiliza actions: read para obtener recibos.

Los secretos de integración se limitan a los jobs que ejecutan Neon dev. La conexión directa de producción se obtiene desde Secret Manager para el gate y la lectura de esquema del rollback, no para pruebas. El contexto de Cloud Build se origina en Git, no en los archivos temporales del runner. El fingerprint de runtime comprueba que la modificación de imagen no altera el template de ejecución. La configuración runtime se explica en [Infrastructure & Deployment](mirai_infrastructure_and_deployment.md) y la gestión de datos en [Security & Privacy](mirai_security_and_privacy.md).

## 9. Configuración

### 9.1. GitHub Actions Secrets

| Nombre | Propósito |
|---|---|
| NEON_DEV_DATABASE_URL | Conexión pooled de integración |
| NEON_DEV_DATABASE_URL_UNPOOLED | Conexión directa y migraciones dev |
| NEON_DEV_STORAGE_ENDPOINT | Endpoint S3 de dev |
| NEON_DEV_STORAGE_ACCESS_KEY_ID | Identificador de acceso de dev |
| NEON_DEV_STORAGE_SECRET_ACCESS_KEY | Credencial de storage dev |

### 9.2. GitHub Actions Variables

| Nombre | Propósito |
|---|---|
| AWS_REGION | Región del cliente S3 de integración |
| NEON_STORAGE_BUCKET | Bucket de documentos dev |
| MIRAI_DB_TEST | Habilita integración DB |
| MIRAI_CV_TEST_NEON | Habilita pruebas CV con Neon |
| GCP_PROJECT_ID | Proyecto de destino |
| GCP_REGION | Región de Cloud Build y Cloud Run |
| GCP_WORKLOAD_IDENTITY_PROVIDER | Referencia al provider WIF |
| GCP_SERVICE_ACCOUNT | Cuenta impersonada por GitHub |
| GCP_ARTIFACT_REGISTRY | Registro de imágenes |
| MIRAI_API_SERVICE / MIRAI_WEB_SERVICE | Servicios de destino |
| MIRAI_API_ORIGIN / MIRAI_WEB_ORIGIN | Orígenes principales para verificación; API_ORIGIN también se usa al construir Web |

### 9.3. Configuración operativa

| Fuente | Función |
|---|---|
| Secret Manager: mirai-neon-db-unpooled | Conexión directa de producción, entregada temporalmente |
| ops/release-policy.json | Baseline de recuperación y transiciones de esquema revisadas |
| ops/codeql-baseline.json | Identidades de hallazgos altos/críticos reconocidos |
| vitest.config.ts | Alcance y mínimos de cobertura |
| cloudbuild.yaml | Parámetros APP, TAG y API_ORIGIN de build |

No se incluyen valores de credenciales.

## 10. Observabilidad y operación

Para iniciar una release, integrar un cambio en main; el workflow Production release se activa automáticamente. El resumen se ejecuta con always() para recoger resultados disponibles incluso cuando falla una etapa. Registra commit, CI, cobertura, CodeQL, Trivy, builds, digests, migraciones, candidatas, tráfico observado, resultado de despliegue y recuperación. Si no puede observar un dato, no debe interpretarse como confirmación de éxito.

| Superficie | Uso |
|---|---|
| [GitHub Actions](https://github.com/Paz1CP/mirai/actions) | DAG de jobs, logs, summaries, artifacts y estados |
| [GitHub Code Scanning](https://github.com/Paz1CP/mirai/security/code-scanning) | Hallazgos CodeQL y Trivy |
| Cloud Build / Cloud Logging | Estado y logs de construcción, por Build ID |
| Artifact Registry | Tag por commit y digest |
| Cloud Run | Revisión activa, asignación de tráfico y logs de runtime |

Comandos de observación desde un checkout autenticado:

~~~bash
gh run list --workflow deploy.yml --limit 5
gh run watch <run-id> --exit-status
gh run view <run-id> --log-failed
~~~

Los jobs de build tienen timeout de 30 minutos, los de escaneo de 20 y los de migración, stage, health, promoción y recuperación de 25. Estos límites son presupuestos del runner, no un SLA de disponibilidad.

## 11. Verificación técnica

Las comprobaciones de código, integración, seguridad, migración y promoción se ejecutan en GitHub Actions. [test-release-controls.py](../../ops/test-release-controls.py) verifica con fixtures aislados la restauración de tráfico frente a fallos de promoción parcial y salud posterior; no interrumpe servicios reales. El rollback manual se valida contra revisiones existentes y los endpoints principales.

| Verificación | Evidencia |
|---|---|
| CI, cobertura, CodeQL, Trivy, migraciones, candidatas y promoción real | [Production release](https://github.com/Paz1CP/mirai/actions/runs/45615408735) |
| Bloqueo antes de stage por error de schema gate | [Release bloqueada](https://github.com/Paz1CP/mirai/actions/runs/45611946799) |
| Pruebas aisladas de recuperación automática | [Automated Testing](https://github.com/Paz1CP/mirai/actions/runs/45615408735/job/139209631904) |
| Verificación posterior y tráfico observado | [Promoción](https://github.com/Paz1CP/mirai/actions/runs/45615408735/job/139213320208), [Summary](https://github.com/Paz1CP/mirai/actions/runs/45615408735/job/139213707284) |
| Recuperación manual de pareja y retorno a otra release | [Rollback](https://github.com/Paz1CP/mirai/actions/runs/45616829512), [Restauración](https://github.com/Paz1CP/mirai/actions/runs/45617062340) |

Los runs demuestran las capacidades indicadas; el éxito de una ejecución no implica que todos los recorridos funcionales del producto estén cubiertos.

## 12. Decisiones técnicas vigentes

| Decisión | Contexto y justificación | Consecuencias |
|---|---|---|
| CI reutilizable y CodeQL independiente | PR y release comparten controles sin duplicar definiciones | La publicación espera CI; las migraciones esperan también CodeQL |
| Aislar integración en Neon dev | Las pruebas necesitan persistencia y servicios reales | No acceden a producción; se serializan por rama |
| Etiquetas por commit y despliegue por digest | Trazar el código y evitar depender de tags mutables al promover | El mismo digest se analiza y despliega; se puede reutilizar un tag existente |
| WIF | El runner necesita acceso cloud temporal | Evita distribuir claves permanentes; depende de la política de confianza e IAM |
| Candidatas sin tráfico | Validar una revisión antes de sustituir la activa | Permite comprobaciones previas; la promoción de dos servicios sigue siendo secuencial |
| Gate de esquema revisado | Las revisiones antiguas pueden seguir usando el esquema durante un cambio | Requiere revisión explícita de cada transición; rollback no deshace datos |
| Recuperar parejas de revisiones | API y Web comparten contratos | Se recuperan ambas y se verifica compatibilidad; requiere recibos y revisiones disponibles |

## 13. Mapa de implementación

| Responsabilidad | Ubicación |
|---|---|
| Workflows | [.github/workflows](../../.github/workflows/) |
| Toolchain e identidad | [.github/actions](../../.github/actions/) |
| Integración Neon | [test-neon-dev.sh](../../.github/scripts/test-neon-dev.sh) |
| Política de dependencias | [dependabot.yml](../../.github/dependabot.yml) |
| Cobertura y pruebas | [vitest.config.ts](../../vitest.config.ts), [package.json](../../package.json) |
| Construcción | [cloudbuild.yaml](../../cloudbuild.yaml), [API Dockerfile](../../apps/api/Dockerfile), [Web Dockerfile](../../apps/web/Dockerfile) |
| Controles de seguridad | [codeql-gate.mjs](../../ops/codeql-gate.mjs), [scan-release.sh](../../ops/scan-release.sh) |
| Migración compatible | [schema-gate.mjs](../../ops/schema-gate.mjs), [release-policy.json](../../ops/release-policy.json) |
| Despliegue y salud | [deploy.sh](../../ops/deploy.sh), [cloud-run.sh](../../ops/cloud-run.sh) |
| Rollback y validación | [rollback.sh](../../ops/rollback.sh), [test-release-controls.py](../../ops/test-release-controls.py) |
| Resumen | [release-summary.sh](../../ops/release-summary.sh) |

## 14. Glosario

| Término | Definición |
|---|---|
| CI Gate | Check que exige el resultado de todas las validaciones CI aplicables |
| Digest | Identificador SHA-256 del contenido de una imagen |
| Release | Ejecución que lleva un commit validado a producción |
| Revisión candidata | Revisión Cloud Run preparada sin tráfico principal |
| Huella de esquema | SHA-256 del ledger de migraciones, utilizado para comparar compatibilidad declarada |
| Recibo de release | Artifact con la pareja verificada de revisiones y sus metadatos |
| Rollback | Restauración de tráfico a revisiones compatibles sin revertir automáticamente PostgreSQL |
