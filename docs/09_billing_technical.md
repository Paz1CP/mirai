# 09. Billing y wallet — Documentación técnica

> **Tipo:** Técnico  
> **Alcance:** Arquitectura, modelo de datos, consumo de inferencia, tarifas, Paddle, webhooks, ledger, recargas, idempotencia, conciliación, concurrencia, entornos y configuración.  
> **Responsable:** Mirai Engineering  
> **Última verificación:** 2026-11-24

## 1. Resumen técnico

Billing implementa una billetera prepagada por cuenta y entorno. PostgreSQL conserva los lotes de créditos y el ledger contable; Wallet Repository serializa las operaciones de cada billetera; Inference Billing admite y liquida inferencias; Pricing convierte el uso de Google GenAI en unidades internas; Paddle Client y Paddle Billing procesan checkout, pagos y ajustes.

El backend es la fuente de verdad del saldo. La interfaz consulta el resumen y abre el checkout de Paddle, pero no acredita créditos. La acreditación depende de un webhook válido y de la confirmación del pago.

## 2. Contexto y límites

### Responsabilidades

- Mantener saldos y lotes de créditos.
- Admitir inferencias cuando existe saldo positivo.
- Registrar el tarifario aplicable al admitir cada inferencia.
- Liquidar el consumo con el uso reportado por Google.
- Procesar compras, fallos de pago, reembolsos y contracargos de Paddle.
- Conciliar inferencias cuyo resultado de uso no llegó al flujo original.
- Notificar cambios de saldo y detener ejecuciones cuando se agotan los créditos.

### Límites

- Billing factura consumo de inferencia de Google GenAI. No cobra directamente por clics, navegación o acciones de Playwright.
- No existe un endpoint de consulta del ledger para el usuario. El resumen público de Billing devuelve saldo y lotes de recarga.
- El tarifario se encuentra definido en código; no se consulta dinámicamente en cada inferencia.
- La expiración se aplica al acceder a la billetera, no mediante un proceso programado independiente.

## 3. Arquitectura y componentes

| Componente | Responsabilidad | Entradas | Salidas |
|---|---|---|---|
| Wallet Repository | Transacciones, bloqueo de billetera, lotes, saldo, FEFO y ledger. | Cuenta, entorno y operación. | Saldo, movimientos, asignaciones y notificaciones. |
| Inference Billing | Admisión, recuperación, liquidación, liberación y conciliación de inferencias. | Operación, modelo, región y uso. | Movimiento de consumo o liberación. |
| Pricing | Tarifas versionadas, validación de uso y cálculo exacto. | Modelo, región, fecha y tokens. | Costo del proveedor y cargo Mirai. |
| Paddle Client | Configuración por entorno, transacciones y validación de firmas. | Credenciales, intención y webhook. | ID de transacción y evento validado. |
| Paddle Billing | Checkout, acreditación, fallos de pago y ajustes. | Cuenta, paquete y eventos Paddle. | Lote acreditado o ajustado y movimientos del ledger. |
| Billing Routes | Contratos HTTP de consulta, checkout y webhook. | Solicitudes REST. | Resumen, checkout o respuesta de webhook. |
| Streaming Gemini | Facturación de interacciones de chat y persistencia del ID del proveedor. | Solicitud de modelo y eventos de interacción. | Uso liquidado o inferencia pendiente de conciliación. |
| Mirai Agent | Facturación de compactación del contexto. | Solicitud del resumidor. | Uso liquidado. |
| Profile Extractor | Facturación de extracción de CV. | Documentos, modelo y región. | Extracción y uso liquidado. |
| Workspace Socket | Difusión de cambios de saldo y coordinación ante agotamiento. | Notificaciones PostgreSQL. | Evento **billing.changed** y cancelación de ejecuciones. |
| Billing Menu | Consulta del resumen y apertura del checkout. | Contratos compartidos y eventos Paddle. | Saldo, recargas y estado visual del pago. |
| Account Deletion | Cancelación de pagos pendientes y eliminación de datos de billing. | Cuenta y entornos. | Transacciones pendientes canceladas o advertencia de proveedor. |

## 4. Dependencias

| Dependencia | Propósito | Integración | Impacto de indisponibilidad |
|---|---|---|---|
| Neon PostgreSQL | Fuente de verdad de lotes, ledger y billeteras. | Drizzle ORM y pg. | No se pueden consultar ni modificar saldos de forma segura. |
| Google GenAI / Vertex AI | Ejecución de inferencias y consulta de interacciones. | SDK @google/genai. | No se puede obtener uso ni completar conciliaciones externas. |
| Paddle | Checkout, transacciones y ajustes. | API REST, Paddle.js y webhooks. | No se pueden confirmar compras o procesar eventos de pago. |
| Zod | Validación de contratos y datos externos. | Schemas compartidos y validación interna. | Las entradas inválidas se rechazan. |
| TanStack Query | Consulta y actualización del resumen en frontend. | billingOptions e invalidación de caché. | La interfaz no actualiza el saldo hasta recuperar la consulta. |

## 5. Flujos técnicos

### 5.1. Checkout y acreditación

~~~mermaid
sequenceDiagram
    participant UI as Billing Menu
    participant API as Billing Routes
    participant PB as Paddle Billing
    participant WR as Wallet Repository
    participant P as Paddle
    participant DB as PostgreSQL

    UI->>API: POST /v1/billing/checkout
    API->>PB: checkout(account, environment, package)
    PB->>WR: Crear lote pendiente
    WR->>DB: Insert topup con remaining = 0
    PB->>P: Crear transacción con custom_data
    P-->>PB: transaction_id
    PB->>WR: Asociar transaction_id al lote
    PB-->>UI: environment, transactionId, clientToken
    UI->>P: Abrir Paddle Checkout
    P->>API: POST /v1/billing/paddle/:environment/webhook
    API->>API: Validar firma y payload
    API->>PB: Procesar transaction.completed
    PB->>WR: Confirmar lote y acreditar nominal
    WR->>DB: Insert purchase y paddle event
    DB-->>UI: Notificación de cambio de saldo
    UI->>API: GET /v1/billing
    API-->>UI: Resumen actualizado
~~~

El checkout crea primero un lote pendiente con saldo cero. Después crea la transacción de Paddle y asocia su identificador al lote. El backend no confía en el evento visual **checkout.completed** del navegador para acreditar créditos.

La acreditación ocurre cuando llega **transaction.completed** y se cumplen estas condiciones:

1. La intención de compra existe en el mismo entorno.
2. La transacción coincide con el identificador asociado a la intención.
3. Existe exactamente un artículo y su cantidad es uno.
4. El precio y producto coinciden con los configurados para el lote.
5. La transacción está en estado **completed**.
6. Existe al menos un pago capturado con **captured_at**.
7. La suma de pagos capturados es mayor que cero y coincide con **grand_total**.
8. El descuento es cero.
9. La moneda de los totales coincide con la moneda de la transacción.

La validación exige consistencia entre las monedas informadas por Paddle; no impone un código de moneda fijo. El último pago capturado determina **purchasedAt**. **expiresAt** se calcula sumando 720 horas.

### 5.2. Admisión y liquidación de inferencia

~~~mermaid
sequenceDiagram
    participant R as Runtime
    participant IB as Inference Billing
    participant WR as Wallet Repository
    participant DB as PostgreSQL
    participant G as Google GenAI

    R->>IB: begin(account, operation, model, region)
    IB->>WR: withWallet + totals
    WR->>DB: Bloquear wallet y consultar lotes
    DB-->>WR: Saldo disponible
    WR-->>IB: Saldo y hora de base de datos
    alt Saldo mayor que cero
        IB->>DB: Insert inference_pending con tarifa
        IB-->>R: ID y tarifa capturada
        R->>G: Ejecutar inferencia
        G-->>R: Resultado y uso de tokens
        R->>IB: settle(inference, usage, providerId)
        IB->>WR: withWallet + debit(charge)
        WR->>DB: Descontar lotes FEFO
        IB->>DB: Insert settled:<id> con collected y uncollected
        IB-->>R: Saldo actualizado
    else Saldo cero
        IB-->>R: INSUFFICIENT_CREDITS (402)
    end
~~~

La admisión comprueba saldo positivo y registra una inferencia pendiente. No reserva créditos ni reduce lotes. El cargo se calcula y se descuenta cuando se recibe el uso del proveedor.

Cada llamada facturable utiliza una de estas operaciones:

- **chat:** StreamingGemini llama a begin por interacción de modelo. El ID de la interacción de Google se guarda para permitir su recuperación.
- **compaction:** Mirai Agent utiliza billing.generate. Se activa al alcanzar el 80 % de la capacidad de contexto y conserva seis eventos.
- **cv_extraction:** Profile Extractor utiliza billing.generate para la extracción estructurada. Si el modelo principal devuelve uno de los estados configurados para fallback, ejecuta el modelo alternativo mediante otra admisión facturable.

Una conversación puede generar varias inferencias chat. El número de mensajes o acciones del navegador no determina directamente el cargo.

### 5.3. Conciliación de inferencias pendientes

GET /v1/billing ejecuta reconcilePending(accountId) antes de construir el resumen.

El proceso:

1. Selecciona hasta ocho inferencias pendientes, ordenadas por fecha y clave.
2. Incluye inferencias que tienen un providerId registrado o cuyo registro tiene más de siete días. La antigüedad se calcula desde el registro del providerId cuando existe; si no existe, desde la admisión.
3. Consulta google.interactions.get con un timeout de cinco segundos cuando existe providerId.
4. Acepta los estados terminales completed, requires_action, failed, cancelled, incomplete y budget_exceeded.
5. Valida el uso reportado y liquida la inferencia con su tarifa original.
6. Si no existe uso verificable y venció la ventana de retención de siete días, cierra la inferencia sin cargo.
7. Si la interacción sigue activa, el ID no coincide o el uso sigue incompleto, conserva la inferencia pendiente para una consulta posterior mientras permanezca dentro de la ventana de retención.

La conciliación es bajo demanda al consultar Billing. No existe un worker periódico independiente en este módulo.

## 6. Contratos e interfaces

### 6.1. HTTP

| Método y ruta | Autenticación | Propósito |
|---|---|---|
| GET /v1/billing | Sesión de usuario | Conciliar inferencias pendientes y devolver el resumen. |
| POST /v1/billing/checkout | Sesión de usuario | Crear una intención y una transacción de Paddle. |
| POST /v1/billing/paddle/:environment/webhook | Firma Paddle | Procesar eventos del entorno indicado. |

El endpoint de resumen utiliza Cache-Control: no-store.

El cuerpo de checkout es un objeto estricto con packageUsd, limitado a 10, 25, 50 o 100.

La respuesta de checkout contiene environment, transactionId y clientToken.

La respuesta de resumen contiene:

- environment.
- available: unidades internas serializadas como string.
- nextExpiry: fecha ISO o null.
- topups: hasta 50 lotes recientes, con identificador, paquete, transacción, saldo restante, fechas y estado.

Los estados de un lote son pending, confirmed, failed y expired.

No existe un endpoint HTTP para consultar el historial completo del ledger.

### 6.2. Webhook de Paddle

La ruta recibe el cuerpo como bytes sin descompresión, con límite de 256 KB. La firma utiliza el encabezado Paddle-Signature:

1. Se extraen ts y los valores h1.
2. El timestamp debe estar a no más de cinco segundos del reloj del servidor.
3. Se calcula HMAC-SHA256 sobre ts:rawBody.
4. Se compara el digest mediante timingSafeEqual.

Los eventos procesados son:

| Evento | Tratamiento |
|---|---|
| transaction.completed | Valida el pago y acredita el lote una sola vez. |
| transaction.payment_failed | Registra la fecha de fallo si el lote todavía no fue comprado. |
| adjustment.created | Procesa o conserva un reembolso o contracargo. |
| adjustment.updated | Procesa el ajuste cuando alcanza el estado aprobado. |

Los demás tipos de evento no producen movimientos de billing.

### 6.3. Contratos compartidos

El contrato está definido en packages/contracts/src/billing.ts:

- billingEnvironmentSchema: sandbox o live.
- billingPackages: 10, 25, 50, 100.
- billingCheckoutSchema: entorno, ID de transacción y client token.
- billingSummarySchema: saldo y lotes.

Los importes grandes se transportan como strings decimales para evitar pérdida de precisión al serializar bigint.

## 7. Modelo de datos y propiedad

El esquema está en apps/api/src/features/billing/schema.ts. La migración que crea las tablas es apps/api/database/migrations/0012_prepaid_billing.sql.

### 7.1. Tablas

| Tabla | Clave | Responsabilidad |
|---|---|---|
| billing.wallets | (account_id, environment) | Fila de propiedad y bloqueo transaccional de la billetera. No almacena un campo de saldo agregado. |
| billing.topups | id | Lotes de compra, importe nominal, saldo restante, créditos revocados y fechas. |
| billing.ledger | (account_id, environment, movement_key) | Movimientos contables e información de inferencias y eventos externos. |

### 7.2. Invariantes de los lotes

- package_usd solo admite 10, 25, 50 o 100.
- nominal = package_usd × 1_000_000_000_000.
- remaining >= 0.
- revoked >= 0.
- remaining + revoked <= nominal.
- Un lote no comprado tiene purchased_at = null, expires_at = null y remaining = 0.
- Un lote comprado tiene transaction_id, purchased_at y expires_at.
- expires_at = purchased_at + 720 hours.
- (environment, transaction_id) es único.

### 7.3. Ledger

Cada movimiento contiene cuenta, entorno, clave, tipo, importe, detalles JSON y fecha.

| Tipo | Signo permitido | Uso |
|---|---:|---|
| purchase | Positivo | Créditos acreditados por una compra confirmada. |
| usage | Cero o negativo | Créditos realmente cobrados por una inferencia. |
| expiration | Cero o negativo | Créditos restantes que vencen. |
| refund | Cero o negativo | Créditos recuperados por reembolso. |
| chargeback | Cero o negativo | Créditos recuperados por contracargo. |
| event | Cero | Evento de Paddle o registro de ID del proveedor. |
| inference_pending | Cero | Admisión de una inferencia. |
| inference_released | Cero | Inferencia cerrada sin cargo. |

La clave primaria compuesta impide repetir una misma clave dentro de una cuenta y entorno. El ledger registra el importe efectivamente cobrado; el costo no cobrado se conserva en details.uncollected, no como saldo negativo.

### 7.4. Claves de idempotencia

| Clave | Uso |
|---|---|
| purchase:<transaction_id> | Acreditación de una transacción. |
| paddle:<event_id> | Procesamiento de un evento webhook. |
| adjustment:<adjustment_id> | Aplicación de un reembolso o contracargo. |
| settled:<inference_id> | Liquidación o liberación única de una inferencia. |
| provider:<inference_id> | Asociación entre una inferencia y su ID de interacción de Google. |
| expiration:<topup_id> | Expiración única de un lote. |
| <inference_uuid> | Registro inicial inference_pending. |

Los índices relevantes son ledger_history, ledger_pending y topups_spend_order.

## 8. Estados, concurrencia y consistencia

### 8.1. Transacción de billetera

withWallet:

1. Autoriza el entorno.
2. Crea la fila de billetera si no existe.
3. Bloquea la fila con FOR NO KEY UPDATE.
4. Obtiene la hora mediante clock_timestamp().
5. Expira los lotes vencidos.
6. Ejecuta la operación solicitada.
7. Publica las notificaciones de cambio dentro de la transacción.

El bloqueo serializa las operaciones de una misma cuenta y entorno. Cuentas o entornos diferentes utilizan filas independientes.

### 8.2. Expiración y saldo

La expiración es perezosa: se ejecuta al abrir una transacción de billetera. Para cada lote vencido con saldo restante:

- Actualiza remaining a cero.
- Inserta expiration:<topup_id> con el importe negativo.
- Conserva el lote para consulta.

totals() suma los lotes cuyo expires_at es posterior a la hora de la transacción. nextExpiry es la fecha mínima entre los lotes con saldo restante.

El resumen devuelve como máximo 50 lotes, ordenados por creación descendente e ID ascendente.

### 8.3. Consumo FEFO

debit(charge) selecciona lotes comprados, no vencidos y con saldo restante. Los ordena por expires_at ascendente e id ascendente.

Para cada lote:

1. Calcula el mínimo entre el cargo pendiente y el saldo del lote.
2. Reduce remaining.
3. Registra la asignación del cargo al lote.
4. Continúa hasta cobrar el importe completo o agotar los lotes.

Devuelve collected, uncollected y las asignaciones por lote. Nunca genera un saldo negativo.

### 8.4. Admisión sin reserva y liquidación tardía

begin() comprueba que available > 0 y registra inference_pending con la operación y la tarifa capturada. No reduce remaining.

Por ello, varias inferencias concurrentes pueden ser admitidas mientras el saldo siga siendo positivo. El saldo se consume al liquidarlas, y el bloqueo de billetera serializa las liquidaciones.

settle() consulta los lotes disponibles en el momento de liquidar. No vincula la inferencia a los lotes que existían al admitirla. Una inferencia pendiente puede consumir créditos comprados después de su inicio.

Si el saldo no cubre el cargo, settle() registra:

- amount = -collected.
- details.collected.
- details.uncollected.
- details.charge.
- details.googleCost.
- details.allocations.
- Uso, operación, modelo, región, tarifa y providerId, cuando existe.

La inserción de settled:<inference_id> cierra la liquidación. Si uncollected es mayor que cero, ese importe no se vuelve a cobrar automáticamente con una recarga futura.

### 8.5. Publicación de cambios y agotamiento

Cuando una operación modifica la billetera, publishChanges() emite pg_notify('mirai_billing', payload).

El campo exhausted: true se incluye cuando la operación redujo saldo y el saldo disponible final es cero. PostgreSQL entrega la notificación al confirmar la transacción.

workspaceSocket:

1. Escucha mirai_billing.
2. Filtra por cuenta y entorno.
3. Envía billing.changed al cliente.
4. Si el evento indica agotamiento, vuelve a ejecutar ensureCredit.
5. Si el saldo continúa en cero, detiene las ejecuciones activas de la cuenta en esa instancia.

La revalidación evita que una notificación antigua detenga ejecuciones después de una recarga. La misma señal se propaga a las instancias que escuchan PostgreSQL. El frontend invalida la consulta de Billing al recibir billing.changed.

## 9. Tarifas y cálculo de inferencias

### 9.1. Unidades internas

unitsPerUsd = 1_000_000_000_000.

La interfaz utiliza 10_000_000_000 unidades por crédito. Por tanto:

- USD 1 equivale a 1 000 000 000 000 unidades internas.
- Un crédito equivale a 10 000 000 000 unidades internas.
- USD 1 equivale a 100 créditos.

Los importes se calculan con bigint; no se utiliza aritmética de punto flotante para liquidar cargos.

### 9.2. Tarifario codificado

Las tasas base se expresan en USD por millón de tokens:

| Modelo y vigencia | Entrada | Entrada en caché | Salida | Versión |
|---|---:|---:|---:|---|
| gemini-4-hydrogen | 1.50 | 0.075 | 7.50 | vertex-standard-2026-11-21 |
| gemini-3.8-flash antes de 2027-01-01T08:00:00Z | 0.75 | 0.075 | 3.75 | vertex-standard-2026-11-21 |
| gemini-3.8-flash desde 2027-01-01T08:00:00Z | 1.50 | 0.15 | 7.50 | vertex-standard-2027-01-01 |

El factor regional es 1.0 para global y 1.1 para cualquier otra región.

Cada tarifa incluye model, region, version, service: standard y las tasas internas de entrada, caché y salida.

La versión de tarifa se guarda dentro de inference_pending. La recuperación de una inferencia reutiliza esa tarifa, aunque la tabla de precios cambie después de su admisión.

### 9.3. Fórmula

El costo de Google se calcula así:

~~~text
googleCost =
  (input - cached + toolInput) * inputRate
  + cached * cachedRate
  + (output + thoughts) * outputRate
~~~

El cargo de Mirai es:

~~~text
charge = googleCost * 2
~~~

toolInput utiliza la tasa de entrada; thoughts utiliza la tasa de salida. Los tokens en caché se cobran una sola vez a la tasa de caché, descontándolos de la entrada normal.

reportedUsage() valida que los contadores sean enteros no negativos, que no excedan Number.MAX_SAFE_INTEGER y que cached <= input. Si falta la salida, acepta el uso únicamente cuando el total informado es consistente con la entrada, el razonamiento y la entrada de herramientas.

Un modelo sin tarifa definida produce BILLING_TARIFF_UNAVAILABLE (503).

### 9.4. Uso por operación

| Operación | Ruta de facturación | Liquidación |
|---|---|---|
| chat | StreamingGemini → begin → interacción Google. | Al recibir interaction.completed con uso válido. |
| compaction | Mirai Agent → billing.generate. | Al recibir usageMetadata de generateContentAsync. |
| cv_extraction | Profile Extractor → billing.generate. | Al recibir usageMetadata de generateContent. |

cv_extraction intenta primero GOOGLE_GENAI_MODEL. Si el proveedor devuelve un ApiError con estado 404, 429, 500, 502, 503 o 504, intenta GOOGLE_GENAI_FALLBACK_MODEL. Cada llamada a un modelo crea su propia admisión y liquidación.

## 10. Errores y recuperación

| Código | HTTP | Comportamiento |
|---|---:|---|
| INSUFFICIENT_CREDITS | 402 | Rechaza una nueva inferencia y activa la detención de ejecuciones cuando corresponde. |
| BILLING_USAGE_PENDING | 409 | El uso de una interacción todavía no está disponible o no puede recuperarse. |
| AI_UNAVAILABLE | 502 | Una operación de generación no devuelve uso válido. |
| BILLING_TARIFF_UNAVAILABLE | 503 | El modelo no tiene una tarifa configurada. |
| BILLING_UNAVAILABLE | 503 | La configuración o el proveedor de facturación no está disponible. |
| INVALID_WEBHOOK_SIGNATURE | 401 | La firma o su timestamp no es válido. |
| INVALID_WEBHOOK_BODY | 400 | El cuerpo raw no contiene JSON válido. |
| INVALID_BILLING_REQUEST | 400 | El payload o el evento no cumple el contrato. |
| INVALID_BILLING_PACKAGE | 422 | El artículo o paquete de Paddle no coincide con la intención. |
| INVALID_PAYMENT_ADJUSTMENT | 422 | La moneda del ajuste no coincide con la compra. |
| PAYMENT_NOT_CONFIRMED | 409, 422 o 503 | La transacción todavía no está asociada o no supera las validaciones de confirmación. |
| ACCOUNT_DELETION_PENDING | 409 | La cuenta está en proceso de eliminación. |

### 10.1. Rechazo antes de generar

rejectedBeforeGeneration() considera rechazos previos a generación los estados 400, 401, 403, 404 y 429 de ApiError. Mirai registra inference_released con el estado y no cobra.

### 10.2. Uso no verificable

Cuando una llamada de billing.generate falla con un error que no corresponde a rechazo previo, Mirai la cierra como usage_unavailable, con providerMayBeRunning cuando aplica. No se crea un cargo sin uso verificable.

Si billing.generate recibe una respuesta sin uso válido, registra una liberación y devuelve AI_UNAVAILABLE. La liberación inserta la clave settled:<inference_id>; por tanto, esa inferencia queda cerrada y no vuelve a entrar en conciliación, incluso cuando closeUnverified registra providerMayBeRunning.

En chat, si el evento terminal no contiene uso y la consulta inmediata de la interacción tampoco lo recupera, devuelve BILLING_USAGE_PENDING. El ID del proveedor queda asociado a la inferencia para que la consulta posterior de Billing intente conciliarla.

### 10.3. Reembolsos y contracargos

applyAdjustment() solo procesa ajustes con estado approved y acción refund o chargeback.

- Si el ajuste es total, revoca el nominal completo.
- Si el ajuste es parcial, calcula la proporción entre el importe del ajuste y el grand_total original.
- Limita la revocación adicional al nominal que todavía no está revocado.
- Limita la recuperación de saldo al remaining del lote.
- Registra adjustment:<id> para evitar aplicar dos veces el mismo ajuste.

El porcentaje de un ajuste parcial se calcula sobre el grand_total original, incluidos impuestos y cargos informados por Paddle. La división entera trunca fracciones de unidad. revoked conserva el importe nominal revocado; recovered y el movimiento del ledger se limitan a los créditos que todavía permanecen en remaining.

Si un ajuste llega antes del movimiento purchase:<transaction_id>, Paddle Billing registra el evento. Cuando se confirma la compra, recupera esos eventos y aplica los ajustes en orden de occurredAt.

### 10.4. Eliminación de cuenta

Antes de eliminar los datos locales, Account Deletion:

1. Busca lotes pendientes con purchased_at nulo.
2. Agrupa las intenciones por sandbox y live.
3. Busca transacciones de Paddle sin ID asociado mediante custom_data.mirai_credit_purchase.
4. Intenta cancelar las transacciones pendientes.
5. Registra una advertencia de Paddle si no puede confirmar la cancelación.
6. Elimina las filas de billing.ledger, billing.topups y billing.wallets de la cuenta.

La cancelación solo busca lotes con purchased_at nulo; la eliminación de cuenta no emite reembolsos para transacciones ya completadas. Paddle no permite cancelar transacciones automatic en estado past_due, y las transacciones paid, completed o canceled se dejan intactas. Si Paddle no confirma una cancelación, Mirai registra la advertencia y continúa con la eliminación de sus datos locales.

## 11. Seguridad

- Los endpoints de consulta y checkout verifican la identidad del usuario.
- El webhook se autentica mediante HMAC-SHA256 sobre el cuerpo raw y el timestamp.
- El webhook no acepta cuerpos mayores a 256 KB ni cuerpos comprimidos.
- Las firmas se comparan con timingSafeEqual.
- Los secretos se obtienen de variables de entorno y no se devuelven al cliente.
- paddleConfiguration() rechaza una configuración que reutiliza el mismo webhook secret para sandbox y live.
- El client token debe comenzar con test_ en sandbox y live_ en live.
- En producción, BILLING_SANDBOX_ACCOUNT_IDS restringe las cuentas que pueden usar sandbox.
- El resumen utiliza Cache-Control: no-store.
- AccountActivity coordina checkout, webhooks y eliminación para evitar operaciones incompatibles con una cuenta en proceso de borrado.

## 12. Configuración

Las variables se definen en apps/api/.env.example. Los valores secretos se configuran en el entorno de ejecución y no se documentan aquí.

| Variable | Propósito |
|---|---|
| BILLING_ENVIRONMENT | Entorno activo del servicio: sandbox o live. Por defecto, sandbox. |
| BILLING_SANDBOX_ACCOUNT_IDS | IDs separados por coma autorizados para usar sandbox en producción. |
| PADDLE_SANDBOX_API_KEY | Clave de API de Paddle Sandbox. |
| PADDLE_SANDBOX_CLIENT_TOKEN | Token de Paddle.js Sandbox; debe usar prefijo test_. |
| PADDLE_SANDBOX_WEBHOOK_SECRET | Secreto de firma de webhooks Sandbox. |
| PADDLE_SANDBOX_PRODUCT_ID | Producto de Paddle Sandbox. |
| PADDLE_SANDBOX_PRICE_10, PADDLE_SANDBOX_PRICE_25, PADDLE_SANDBOX_PRICE_50, PADDLE_SANDBOX_PRICE_100 | IDs de precio de los cuatro paquetes Sandbox. |
| PADDLE_LIVE_API_KEY | Clave de API de Paddle Live. |
| PADDLE_LIVE_CLIENT_TOKEN | Token de Paddle.js Live; debe usar prefijo live_. |
| PADDLE_LIVE_WEBHOOK_SECRET | Secreto de firma de webhooks Live. |
| PADDLE_LIVE_PRODUCT_ID | Producto de Paddle Live. |
| PADDLE_LIVE_PRICE_10, PADDLE_LIVE_PRICE_25, PADDLE_LIVE_PRICE_50, PADDLE_LIVE_PRICE_100 | IDs de precio de los cuatro paquetes Live. |
| GOOGLE_CLOUD_PROJECT | Proyecto de Google GenAI / Vertex AI. |
| GOOGLE_CLOUD_LOCATION | Región utilizada por el proveedor y por el cálculo de tarifa. |
| GOOGLE_GENAI_MODEL | Modelo principal de extracción de CV. |
| GOOGLE_GENAI_FALLBACK_MODEL | Modelo alternativo de extracción de CV. |
| MIRAI_BILLING_TEST_DATABASE_URL | Base PostgreSQL utilizada por las pruebas de integración de billing. |

BILLING_ENVIRONMENT se valida al iniciar el servicio y su valor predeterminado es sandbox. Wallet Repository, Inference Billing, Paddle Billing y Workspace Socket utilizan el mismo entorno activo. Google GenAI utiliza mirai-514723 como proyecto predeterminado y global como ubicación predeterminada; la extracción de CV utiliza gemini-4-hydrogen como modelo principal y gemini-3.8-flash como fallback predeterminado.

Paddle Client selecciona:

- https://sandbox-api.paddle.com para sandbox.
- https://api.paddle.com para live.

El checkout requiere API key, client token, producto, precio del paquete y webhook secret configurados para el entorno activo.

## 13. Rendimiento y recursos

- Las operaciones de una billetera se serializan mediante el bloqueo de su fila.
- La consulta de lotes para el resumen está limitada a 50.
- Cada ejecución de reconcilePending procesa como máximo ocho inferencias.
- La consulta de una interacción de Google utiliza un timeout de cinco segundos.
- Las solicitudes a la API de Paddle utilizan un timeout de ocho segundos.
- La cancelación de pagos pendientes durante la eliminación también limita las llamadas a Paddle a ocho segundos.
- La validación de webhooks limita el cuerpo a 256 KB.
- Los importes se mantienen en bigint para conservar precisión en cálculos y asignaciones.

## 14. Observabilidad

El ledger conserva la trazabilidad de compras, consumos, expiraciones, ajustes, eventos de Paddle e inferencias pendientes o liberadas.

Los cambios de saldo se comunican mediante pg_notify('mirai_billing', ...). Workspace Socket convierte esas notificaciones en billing.changed y coordina la detención de ejecuciones al agotarse el saldo.

Los logs disponibles incluyen:

- gemini_interaction_requested
- gemini_interaction_ended
- paddle_checkout_rejected
- billing_exhaustion_check_failed

El ledger es la fuente contable; las notificaciones solo comunican cambios y no sustituyen la lectura transaccional de la billetera.

## 15. Verificación técnica

### Pruebas unitarias

apps/api/src/features/billing/pricing.test.ts verifica:

- Aritmética exacta en unidades internas.
- Tratamiento de tokens en caché y razonamiento.
- Cambio de tarifa de Flash en su fecha efectiva.
- Rechazo de uso incompleto o inconsistente.

### Pruebas de integración

apps/api/src/features/billing/billing.integration.test.ts cubre:

- Autenticación de checkout y firma de webhooks.
- Validación de producto, precio y cantidad.
- Acreditación única de pagos y procesamiento de eventos duplicados.
- Consumo FEFO y expiración.
- Reembolsos y contracargos, incluidos eventos recibidos antes de la compra.
- Liquidación concurrente e idempotencia.
- Admisión de múltiples inferencias sin reserva de saldo.
- Conciliación de interacciones con uso tardío.
- Extracción de CV, fallback y compactación.
- Agotamiento y notificaciones entre instancias.
- Aislamiento por cuenta y entorno.
- Registro de consumo no cobrado cuando el saldo se agota.

Las pruebas PostgreSQL se omiten cuando MIRAI_BILLING_TEST_DATABASE_URL no está configurada. La existencia de estos casos describe la cobertura del repositorio; no implica que se hayan ejecutado durante esta verificación documental.

## 16. Decisiones técnicas vigentes

### Saldo derivado de lotes, no de un contador mutable

**Decisión:** el saldo se calcula sumando remaining de los lotes válidos.

**Contexto:** cada recarga tiene su propio vencimiento y puede recibir ajustes.

**Justificación:** permite aplicar FEFO y revocar créditos de una compra específica.

**Consecuencia:** wallets funciona como fila de propiedad y bloqueo; topups conserva el saldo por lote y ledger conserva los movimientos.

### Admisión sin reserva

**Decisión:** begin() verifica saldo positivo y registra una inferencia pendiente sin reservar créditos.

**Contexto:** el costo definitivo solo se conoce cuando el proveedor informa el uso.

**Justificación:** evita reservar una cantidad estimada que puede no coincidir con el consumo real.

**Consecuencia:** las liquidaciones concurrentes compiten por el saldo existente. Una liquidación tardía utiliza los lotes disponibles en ese momento.

### Liquidación única

**Decisión:** settled:<inference_id> identifica la liquidación o liberación definitiva.

**Contexto:** los eventos del proveedor pueden repetirse, llegar tarde o recuperarse desde otra instancia.

**Justificación:** evita cobrar dos veces una misma inferencia.

**Consecuencia:** el importe uncollected de una liquidación cerrada no se vuelve a cobrar automáticamente después de una recarga.

### Webhook como autoridad de pago

**Decisión:** el backend acredita créditos después de validar el webhook de Paddle.

**Contexto:** el navegador solo conoce los eventos del checkout y no es la fuente contable.

**Justificación:** el pago debe validarse con la transacción y la captura comunicadas por el proveedor.

**Consecuencia:** checkout.completed en el frontend muestra espera de acreditación; no modifica el saldo.

### Entornos aislados

**Decisión:** sandbox y live utilizan billeteras, ledger, credenciales y webhooks separados.

**Contexto:** las pruebas no deben alterar saldos de producción.

**Justificación:** aislamiento por cuenta y entorno en la clave de todas las operaciones.

**Consecuencia:** una recarga de sandbox no financia una inferencia de live ni a la inversa.

## 17. Mapa de implementación

| Responsabilidad | Ubicación |
|---|---|
| Esquema de tablas y tipos | apps/api/src/features/billing/schema.ts |
| Billetera, saldo, lotes, FEFO y ledger | apps/api/src/features/billing/walletRepository.ts |
| Admisión, liquidación y conciliación de inferencias | apps/api/src/features/billing/inferenceBilling.ts |
| Tarifas y cálculo de consumo | apps/api/src/features/billing/pricing.ts |
| Cliente y firma de Paddle | apps/api/src/features/billing/paddleClient.ts |
| Checkout, compras y ajustes | apps/api/src/features/billing/paddleBilling.ts |
| Endpoints REST y webhook | apps/api/src/features/billing/routes.ts |
| Contratos compartidos | packages/contracts/src/billing.ts |
| Facturación de chat | apps/api/src/features/agents/streamingGemini.ts |
| Facturación de compactación | apps/api/src/features/agents/miraiAgent.ts |
| Facturación de extracción de CV | apps/api/src/features/profiles/extractProfile.ts |
| Detención por saldo insuficiente | apps/api/src/features/agents/chatExecution.ts |
| Notificaciones de saldo | apps/api/src/features/sessions/workspaceSocket.ts |
| Cancelación de pagos al eliminar cuenta | apps/api/src/features/auth/accountDeletion.ts |
| Integración en bootstrap | apps/api/src/bootstrap/app.ts |
| Consulta de Billing en frontend | apps/web/src/features/billing/billingApi.ts |
| UI de saldo y recargas | apps/web/src/features/billing/BillingMenu.tsx |
| Checkout del navegador | apps/web/src/features/billing/paddleCheckout.ts |
| Migración del esquema | apps/api/database/migrations/0012_prepaid_billing.sql |
| Pruebas de tarifas | apps/api/src/features/billing/pricing.test.ts |
| Pruebas de integración | apps/api/src/features/billing/billing.integration.test.ts |
| Variables de entorno | apps/api/.env.example |

## 18. Glosario

| Término | Definición |
|---|---|
| Wallet | Billetera identificada por cuenta y entorno. |
| Top-up | Lote creado por una compra de créditos. |
| Ledger | Registro contable de movimientos y eventos. |
| FEFO | First Expire, First Out; asignación por vencimiento más próximo. |
| Inference | Ejecución facturable de un modelo. |
| Tariff | Tasas aplicables a modelo, región y fecha. |
| Settlement | Liquidación de una inferencia a partir del uso reportado. |
| Collected | Importe efectivamente descontado de los lotes. |
| Uncollected | Parte del cargo que no pudo descontarse al liquidar. |
| Provider ID | Identificador de la interacción de Google utilizado para recuperación. |
| Reconciliation | Recuperación del uso de inferencias que quedaron pendientes. |
| Sandbox / Live | Entornos de prueba y producción aislados. |

## 19. Referencias

- [Estándar de documentación](DOCUMENTATION_STANDARD.md).
- [Documento de negocio de Billing y wallet](09_billing_business.md).
- [Requisitos de Mirai](02.%20Requirements%20Engineering.md).
- [Arquitectura de Mirai](03.%20Architecture%20%26%20Design.md).
- [Google Model Garden — Pricing](https://cloud.google.com/model-garden/pricing).
- [Paddle API](https://developer.paddle.com/api-reference/overview).
