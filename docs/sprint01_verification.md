# Sprint 01 — Evidencia de verificación

Fecha: 16 de noviembre de 2026. Entorno: Windows, servicios locales en `localhost:3000` y `localhost:4000`, Neon PostgreSQL 18 en la rama `production` existente.

## Recorridos ejecutados

| Comprobación | Evidencia observada |
|---|---|
| Google OAuth real | El candidato completó personalmente el acceso de Google; callback a Mirai, sesión válida y acceso a la aplicación. Un acceso posterior reutilizó la sesión de Google sin solicitar otra contraseña. |
| Cierre de sesión real | `sign-out` finalizó correctamente; una visita posterior a `/dashboard` redirigió a `/auth/sign-in`. |
| Protección independiente en API | JWT firmados EdDSA, emisor/audiencia y caducidad validados. Pruebas negativas para firma alterada, audiencia ajena, rol anónimo y token vencido. |
| Control concurrente en PostgreSQL | Dos adquisiciones compiten y solo una gana. Transferir incrementa generación; heartbeat y credencial de la instancia anterior se rechazan. Un desafío no puede canjearse dos veces. Se probó aislamiento entre cuentas sintéticas y recuperación tras liberar el lease. |
| Dos ventanas reales | La segunda mostró Cancelar / Usar aquí. Cancelar conservó la primera; transferir invalidó la anterior y mostró el aviso correspondiente. |
| Pestaña duplicada | La copia recibió un UUID distinto y no heredó control silenciosamente, aunque el navegador copiase `sessionStorage`. |
| Chromium con extensión cargada | Chromium 159, Manifest V3, service worker real y puente real: vinculación, navegación a Dashboard y regreso, mantenimiento del vínculo, transferencia y reconexión. |
| Firefox con extensión cargada | Firefox 159, Manifest V2 instalado temporalmente mediante el servidor de depuración local: vinculación real, restauración de sesión al recargar y nueva vinculación. Se usó una sesión Neon válida procedente del acceso real de Google; no se repitió el formulario de Google en Firefox. |
| Pérdida de red | La UI bloqueó el control y ofreció reintento. Tras permanecer sin red más de 15 segundos, la recuperación explícita obtuvo una generación válida y permitió volver a vincular la extensión. No se ejecutó una transferencia pendiente automáticamente al reconectar. |
| Español e inglés | Cambio real de idioma, atributos del documento y navegación en ambos idiomas. Se comprobó que el cambio no reinicia la instancia controladora. |
| Teléfono | Navegador con User-Agent de iPhone, viewport 390 × 844 y entrada táctil: modal bloqueante, sin botón de Google ni contenido de la aplicación. Escape y clic fuera no lo cerraron. |
| Errores de acceso | Callback OAuth con error y fallo de proveedor simulado mediante interceptación de red de prueba: mensaje visible y botón habilitado para reintentar. Este caso negativo no se presenta como una caída real de Google. |
| Diseño y escritorio | Inspección visual de acceso, shell y diálogo de extensión a 1366 × 768; acceso también comprobado a 1440 × 900. Sin overflow horizontal en los casos revisados; logo proporcionado y componentes shadcn/Base UI. |

Las pruebas de navegador se ejecutaron con Playwright conectado y navegadores reales. No existen rutas de login simulado, usuarios ficticios inyectados ni interruptores de autenticación de prueba en el código de producción. El material temporal de prueba y las cookies de sesión se mantuvieron fuera de Git.

## Comprobaciones reproducibles

- `pnpm check`: ESLint, TypeScript **7.0.2** y Vitest.
- Última pasada con `MIRAI_DB_TEST=1`: **4 archivos y 5 pruebas aprobados**, incluida la prueba real de PostgreSQL.
- `$env:MIRAI_DB_TEST='1'; pnpm test apps/api/src/features/sessions/controllerRepository.test.ts`: prueba optativa contra PostgreSQL real, con registros sintéticos aislados y limpieza al finalizar.
- `pnpm build`: compilación de contratos, API, Next.js y las dos versiones de WXT.
- `pnpm --filter @mirai/extension zip`: archivos de distribución de ambas familias de navegador.

## Límites

La verificación es local; no acredita un despliegue nuevo en Cloud Run ni una publicación firmada en tiendas. No se probaron macOS, Linux ni cada derivado de Chromium por separado. No se atribuye a Figma ni a estos recorridos la ejecución de campañas, acceso a Gmail, importación de CV o postulaciones: esas capacidades siguen fuera del Sprint 01.

El SDK `@neon/auth@0.8.2` instala una versión de `@better-fetch/fetch` que genera una advertencia de peer dependency en su árbol interno. El acceso real y los checks descritos funcionaron con el lockfile conservado; no se forzó una resolución de dependencias ajena al SDK.

`pnpm install --frozen-lockfile --lockfile-only --ignore-scripts` aprobó. El chequeo global de Prettier detecta formatos existentes en configuración y archivos generados de Next/Drizzle; no se reformateó todo el repositorio como parte del sprint. No se ejecutó un build Docker ni un despliegue cloud.
