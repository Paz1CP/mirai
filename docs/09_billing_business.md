# 09. Billing y wallet — Documento de negocio

> **Tipo:** Negocio  
> **Alcance:** Créditos prepagados, recargas, consumo de inferencia, saldo, expiración, insuficiencia de créditos y ajustes de pago.  
> **Responsable:** Mirai Engineering  
> **Última verificación:** 2026-11-24

## 1. Resumen

Mirai utiliza una billetera de créditos prepagados para cubrir el consumo de sus operaciones de inteligencia artificial. El usuario compra paquetes mediante Paddle; Mirai acredita los créditos después de confirmar el pago y descuenta el consumo calculado a partir del uso real informado por Google GenAI.

La billetera mantiene recargas independientes, cada una con su propio saldo y vencimiento. El sistema consume primero los créditos que vencen antes, bloquea nuevas inferencias cuando el saldo llega a cero y detiene las ejecuciones activas que dependen de nuevas inferencias.

## 2. Propósito y valor

- Permitir que el usuario compre capacidad de inferencia sin una suscripción recurrente.
- Relacionar el consumo con el uso real de los modelos, no con una tarifa fija por mensaje, agente o candidatura.
- Mostrar el saldo disponible y el estado de las recargas.
- Evitar que una ejecución continúe iniciando inferencias cuando la billetera está agotada.
- Mantener trazabilidad de compras, consumos, expiraciones, reembolsos y contracargos.

El consumo de créditos corresponde a las inferencias de IA. Las acciones de navegación del navegador no generan por sí mismas un cargo; los tokens de entrada asociados al uso de herramientas sí forman parte del consumo informado por el proveedor.

## 3. Actores y responsabilidades

| Actor | Responsabilidad | Condiciones de participación |
|---|---|---|
| Candidato | Compra paquetes y utiliza las funciones que requieren inferencia. | Cuenta autenticada y saldo disponible para iniciar una inferencia. |
| Mirai | Mantiene el saldo, acredita pagos confirmados y liquida el consumo de inferencia. | Aplica el entorno de facturación configurado para el servicio. |
| Paddle | Procesa el checkout, informa el resultado del pago y comunica reembolsos o contracargos. | Transacción asociada a una intención de compra de Mirai. |
| Google GenAI / Vertex AI | Ejecuta las inferencias y devuelve el uso de tokens. | Modelo y región admitidos por la tarifa configurada. |

## 4. Alcance funcional

**Incluye:**

- Paquetes de compra de USD 10, USD 25, USD 50 y USD 100.
- Acreditación de créditos después de confirmar el pago.
- Consulta de saldo, recargas y vencimientos.
- Consumo de inferencias de chat, compactación y extracción de CV.
- Expiración de créditos, insuficiencia de saldo y detención de ejecuciones.
- Tratamiento de pagos fallidos, reembolsos y contracargos.
- Separación de billeteras de prueba y producción.

**No incluye:**

- Suscripciones, renovaciones automáticas ni cargos recurrentes.
- Un flujo público de ajustes manuales de saldo.
- Una vista de usuario con el historial detallado de cada movimiento del ledger o el desglose de tokens por inferencia.

La interfaz actual muestra el saldo y las recargas. El detalle contable de los movimientos de inferencia permanece en el ledger técnico.

## 5. Conceptos y funcionamiento

### 5.1. Créditos y paquetes

La equivalencia comercial interna es de **100 créditos por cada USD 1** de paquete.

| Paquete | Créditos acreditados |
|---:|---:|
| USD 10 | 1 000 |
| USD 25 | 2 500 |
| USD 50 | 5 000 |
| USD 100 | 10 000 |

Los paquetes son recargas individuales. Cada compra crea un lote independiente y conserva su propio saldo restante, fecha de compra y vencimiento.

### 5.2. Billetera y saldo disponible

La billetera pertenece a una cuenta y a un entorno de facturación. El saldo disponible es la suma de los créditos restantes de los lotes comprados que todavía no vencen.

Una recarga pendiente o fallida no aumenta el saldo. Solo una transacción confirmada por Paddle acredita créditos.

### 5.3. Consumo de inferencia

Mirai factura tres operaciones:

| Operación | Qué representa |
|---|---|
| `chat` | Inferencias del agente durante una conversación o ejecución. Una misma conversación puede producir varias inferencias. |
| `compaction` | Inferencia que resume el contexto de una conversación cuando se alcanza el umbral de compactación. |
| `cv_extraction` | Inferencia que extrae información profesional de los documentos del candidato. |

El cargo se calcula con el uso de tokens informado por el proveedor, considerando tokens de entrada, entrada en caché, salida, razonamiento y entrada asociada a herramientas. La tarifa depende del modelo y de la región. Mirai aplica un multiplicador de 2 sobre el costo calculado del proveedor.

### 5.4. Expiración

Cada lote vence **720 horas (30 días exactos)** después de la captura del pago. El vencimiento no se calcula desde la creación del checkout.

Los lotes mantienen vencimientos independientes. Cuando se consume saldo, Mirai utiliza primero el lote cuyo vencimiento está más próximo. Si dos lotes tienen el mismo vencimiento, utiliza primero el identificador menor.

### 5.5. Insuficiencia de créditos

Una inferencia nueva solo puede comenzar cuando el saldo disponible es mayor que cero. La admisión no reserva créditos ni garantiza que el saldo alcance para cubrir el costo final.

Al liquidar una inferencia, Mirai cobra hasta el saldo disponible. Si el costo supera ese saldo:

- Descuenta todos los créditos que todavía están disponibles.
- Registra la parte no cobrada como consumo no recuperado.
- Mantiene el saldo en cero; nunca crea un saldo negativo.

Cuando el saldo llega a cero por consumo, expiración o un ajuste de pago, Mirai detiene las ejecuciones activas de la cuenta en ese entorno y bloquea nuevas inferencias. Una recarga permite iniciar nuevas inferencias, pero no reanuda automáticamente las campañas detenidas.

### 5.6. Inferencias pendientes y recargas posteriores

El consumo se descuenta cuando Mirai recibe y liquida el uso de la inferencia, no cuando la admite.

Por tanto, una inferencia que comenzó antes del agotamiento y sigue pendiente de liquidación puede descontar créditos de una recarga posterior si esa recarga ya está disponible cuando llega el uso del proveedor.

Si Mirai ya liquidó la inferencia y registró una parte no cobrada por falta de saldo, esa parte no se convierte en una deuda que se descuente automáticamente de futuras recargas. La liquidación de cada inferencia se registra una sola vez.

### 5.7. Reembolsos y contracargos

Paddle comunica los ajustes aprobados. Mirai admite:

- **Reembolso parcial:** revoca una proporción del lote correspondiente al importe del ajuste respecto del importe original.
- **Reembolso total:** revoca el lote completo.
- **Contracargo parcial o total:** aplica la misma regla de revocación.

Mirai retira primero los créditos que todavía permanecen en el lote. Los créditos ya consumidos no se convierten en un saldo negativo ni generan un débito adicional. Los ajustes pendientes de aprobación o rechazados no modifican el saldo.

Si el ajuste llega antes de la confirmación de la compra, Mirai lo conserva y lo aplica cuando acredita el pago.

## 6. Flujos de negocio

### 6.1. Compra y acreditación

1. El usuario selecciona uno de los cuatro paquetes.
2. Mirai inicia un checkout de pago único con Paddle.
3. Paddle procesa el pago.
4. Paddle notifica a Mirai el resultado mediante un webhook firmado.
5. Mirai valida la transacción y confirma que corresponde al paquete solicitado.
6. Si el pago está capturado y cumple las validaciones, Mirai acredita el lote y calcula su vencimiento.
7. La interfaz actualiza el saldo y muestra la recarga confirmada.

El evento visual de checkout completado no acredita créditos por sí mismo. La acreditación depende de la confirmación procesada por el backend.

~~~mermaid
flowchart TD
    A[Seleccionar paquete] --> B[Checkout de Paddle]
    B --> C{Pago confirmado y validado}
    C -->|No| D[Pendiente o fallido]
    C -->|Sí| E[Acreditar lote]
    E --> F[Actualizar saldo y vencimiento]
~~~

### 6.2. Consumo y agotamiento

1. Una función solicita una inferencia.
2. Mirai comprueba que el saldo sea mayor que cero.
3. El proveedor ejecuta la inferencia.
4. Mirai obtiene el uso de tokens y calcula el cargo.
5. Descuenta el cargo de los lotes disponibles, empezando por el que vence antes.
6. Si el saldo llega a cero, Mirai detiene las ejecuciones activas de la cuenta y rechaza nuevas inferencias.
7. Una recarga posterior restablece la capacidad de iniciar inferencias.

### 6.3. Ajuste de pago

1. Paddle envía un evento de reembolso o contracargo.
2. Mirai identifica la compra original y valida el estado del ajuste.
3. Si el ajuste está aprobado, calcula los créditos que deben revocarse.
4. Retira los créditos que todavía quedan en el lote.
5. Registra el ajuste y actualiza el saldo.

## 7. Reglas de negocio

| ID | Regla | Condición | Resultado |
|---|---|---|---|
| BR-01 | La billetera está aislada por cuenta y entorno. | Toda operación de saldo. | Los créditos de sandbox y live no se mezclan. |
| BR-02 | Los paquetes disponibles son USD 10, 25, 50 y 100. | Inicio de checkout. | Cada USD 1 equivale a 100 créditos. |
| BR-03 | Solo un pago validado acredita créditos. | Confirmación de Paddle. | El checkout completado sin webhook confirmado permanece pendiente de acreditación. |
| BR-04 | Cada lote vence 720 horas después de la captura. | Compra confirmada. | El saldo restante del lote expira al alcanzar esa fecha. |
| BR-05 | El consumo utiliza primero los créditos que vencen antes. | Liquidación de una inferencia. | Se aplica el orden FEFO. |
| BR-06 | El consumo se calcula con el uso real informado por el proveedor. | Inferencia liquidada. | El cargo depende de modelo, región y tokens reportados. |
| BR-07 | La admisión no reserva saldo. | Inicio de inferencia. | Varias inferencias pueden quedar pendientes con el mismo saldo disponible. |
| BR-08 | Una liquidación pendiente utiliza los lotes disponibles al momento de liquidar. | La inferencia se inició antes de una recarga. | Puede consumir créditos de esa recarga posterior. |
| BR-09 | Una parte no cobrada queda cerrada con su liquidación. | El costo supera el saldo disponible. | No se descuenta automáticamente de recargas posteriores. |
| BR-10 | El saldo nunca es negativo. | Consumo o ajuste superior al saldo. | Se descuenta como máximo lo disponible. |
| BR-11 | El saldo cero bloquea nuevas inferencias y detiene ejecuciones activas. | Una reducción deja el saldo en cero. | Las campañas detenidas requieren reanudación explícita. |
| BR-12 | Solo los ajustes aprobados modifican créditos. | Evento de Paddle. | Los ajustes pendientes o rechazados no alteran el saldo. |
| BR-13 | Los créditos ya consumidos no se recuperan mediante un ajuste de pago. | Reembolso o contracargo. | La revocación se limita al saldo restante del lote. |
| BR-14 | No existe renovación automática de paquetes. | Compra de créditos. | Cada recarga requiere un checkout independiente. |

## 8. Estados y transiciones

### 8.1. Estados de una recarga

| Estado | Significado | Cómo se alcanza |
|---|---|---|
| Pendiente | Existe una intención de compra sin acreditación. | Se crea el checkout. |
| Confirmada | El pago se valida y los créditos se acreditan. | Paddle informa una transacción completada y capturada. |
| Fallida | Paddle informa que el pago no se completó. | Llega un evento de pago fallido antes de la compra confirmada. |
| Vencida | El lote alcanzó su fecha de expiración. | Han transcurrido 720 horas desde la captura. |

La interfaz no muestra los lotes pendientes en la lista de recargas. Durante la espera del webhook, puede mostrar que el pago fue recibido y que los créditos siguen pendientes de acreditación.

### 8.2. Estados de una inferencia

| Estado funcional | Significado |
|---|---|
| Pendiente de liquidación | La inferencia fue admitida y todavía no existe un resultado de uso liquidado. |
| Liquidada | El uso está disponible y Mirai registra el importe cobrado y, si corresponde, el importe no cobrado. |
| Liberada sin cargo | La solicitud fue rechazada antes de generar uso o se cerró sin uso verificable. |

## 9. Permisos y condiciones de acceso

- La consulta de saldo y el inicio de checkout requieren una cuenta autenticada.
- Los webhooks de Paddle no utilizan una sesión de usuario; requieren una firma válida del proveedor.
- El entorno de facturación se configura para el servicio. La billetera del usuario queda aislada dentro de ese entorno.
- En producción, el uso de sandbox se restringe a las cuentas incluidas en la lista de autorización configurada.

## 10. Información del usuario

La interfaz de Billing presenta:

- Créditos disponibles.
- Paquetes de recarga y su precio.
- Recargas confirmadas, fallidas o vencidas.
- Fecha de vencimiento de cada lote confirmado.
- Una indicación de saldo bajo cuando quedan menos de 200 créditos y el saldo no es cero.
- La etiqueta de modo de prueba cuando la billetera utiliza sandbox.

La interfaz no presenta el detalle de tokens, el costo individual de cada inferencia ni el historial completo de movimientos del ledger.

## 11. Decisiones de producto

### Compra prepagada

**Decisión:** utilizar paquetes de compra individuales en lugar de suscripciones.

**Contexto y justificación:** el usuario controla cuándo recarga y cuánto compra. No se generan renovaciones automáticas.

**Consecuencia:** cada compra se acredita como un lote independiente y tiene su propio vencimiento.

### Liquidación por uso real

**Decisión:** calcular el cargo a partir del uso reportado por el proveedor y liquidarlo cuando ese uso está disponible.

**Contexto y justificación:** una inferencia puede finalizar después de que el saldo inicial se agote o el usuario realice otra recarga.

**Consecuencia:** una inferencia pendiente puede consumir una recarga posterior. Una liquidación que ya registró consumo no cobrado no se vuelve a cobrar.

### Expiración por lote

**Decisión:** cada recarga conserva su propio vencimiento y el consumo prioriza los lotes más próximos a expirar.

**Contexto y justificación:** evita que una recarga reciente se consuma antes que otra que vence primero.

**Consecuencia:** el saldo agregado puede reducirse aunque el usuario no inicie una inferencia, cuando vencen créditos restantes.

## 12. Resultados y garantías funcionales

- Un pago no confirmado no aumenta el saldo.
- Una compra confirmada acredita exactamente el paquete asociado a la intención de compra.
- Las billeteras de cuentas y entornos diferentes permanecen aisladas.
- El saldo disponible no incluye créditos vencidos.
- El saldo no puede ser negativo.
- Una misma inferencia no se cobra dos veces.
- La recarga de saldo no reanuda automáticamente las campañas detenidas por insuficiencia.
- Los movimientos de consumo y ajuste se conservan en el registro contable técnico.

## 13. Glosario

| Término | Definición |
|---|---|
| Crédito | Unidad interna utilizada para pagar inferencias de IA. |
| Billetera | Saldo de créditos de una cuenta dentro de un entorno. |
| Recarga / top-up | Compra individual que crea un lote de créditos. |
| Lote | Conjunto de créditos de una recarga con saldo y vencimiento propios. |
| Inferencia | Ejecución de un modelo de IA que genera consumo de tokens. |
| Liquidación | Registro del costo calculado a partir del uso reportado. |
| Consumo no cobrado | Parte del costo de una inferencia que excede el saldo disponible al liquidarse. |
| FEFO | First Expire, First Out: consumir primero los créditos que vencen antes. |
| Reembolso | Devolución total o parcial de una compra. |
| Contracargo | Reversión de un pago iniciada mediante el proveedor o el medio de pago. |
| Sandbox | Entorno de pruebas de facturación, separado de live. |
| Live | Entorno de facturación de producción. |

## 14. Referencias

- [Estándar de documentación](DOCUMENTATION_STANDARD.md).
- [Requisitos de Mirai](02.%20Requirements%20Engineering.md).
- [Arquitectura de Mirai](03.%20Architecture%20%26%20Design.md).
- [Documentación técnica de Billing y wallet](09_billing_technical.md).
