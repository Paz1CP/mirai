# Sprint 01 — Acceso, extensión y control de cuenta

Implementación local de web, API y extensión. Los módulos de CV, perfil, campañas y agentes pertenecen a los siguientes sprints; sus destinos de navegación están disponibles sin simular datos ni operaciones.

## Ejecutar

Desde la raíz, en PowerShell: `pnpm dev`.

La web usa `apps/web/.env.local`: `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (secreto aleatorio de al menos 32 caracteres), `NEXT_PUBLIC_API_ORIGIN`. La API usa `apps/api/.env`: `DATABASE_URL` pooled y el mismo `NEON_AUTH_BASE_URL`. `DATABASE_URL_UNPOOLED` directo se reserva para migraciones. Los ejemplos no contienen secretos.

La configuración privada local quedó preparada. `pnpm dev` compila los contratos antes de iniciar web/API y mantiene su compilación en modo watch. Las claves, cookies y tokens no deben copiarse a Git.

## Cargar la extensión

Construir desde la raíz: `pnpm --filter @mirai/extension build`.

- Chromium: abrir `chrome://extensions`, habilitar el modo desarrollador y cargar la carpeta descomprimida `apps/extension/.output/chrome-mv3`.
- Firefox: abrir `about:debugging#/runtime/this-firefox`, cargar un complemento temporal y seleccionar `apps/extension/.output/firefox-mv2/manifest.json`.
- Volver a Mirai y pulsar **Conectar extensión**. No se conceden permisos sobre portales de empleo en este sprint.

`pnpm --filter @mirai/extension zip` genera los archivos distribuibles locales en `.output`. Todavía no son publicaciones firmadas en Chrome Web Store o Firefox Add-ons; la carga temporal de Firefox se repite al reiniciar el navegador.

Para otro entorno, configurar `WXT_WEB_ORIGIN` y `WXT_API_ORIGIN` en `apps/extension/.env` y reconstruir. Los patrones de permisos no contienen puertos por compatibilidad con Firefox; el puente y el background verifican el origen completo, incluido el puerto, y solo usan la URL de API configurada.

## Control y seguridad

- Neon Auth administra Google OAuth y cookies de sesión. Express verifica firma EdDSA, emisor, audiencia, caducidad y rol del JWT con JWKS del proyecto.
- La autoridad vive en PostgreSQL: un controlador por cuenta, generación monotónica y lease de 15 segundos, renovado cada 3 segundos.
- La transferencia es atómica y compara la generación observada. Una instancia anterior o una credencial de extensión antigua no puede renovar ni validar su control.
- Cada pestaña conserva únicamente su UUID local; Web Locks evita que una pestaña duplicada herede la misma identidad operativa. El backend sigue siendo la autoridad.
- La vinculación consume una sola vez un desafío de 60 segundos. PostgreSQL conserva hashes de las credenciales, y la extensión conserva su credencial privada, ligada a cuenta, pestaña y generación. No se entrega esa credencial a la página.
- La extensión elimina la asociación local al cerrar o recargar la pestaña; cualquier verificación posterior comprueba también el lease en el servidor. Recuperar control tras una caída puede requerir esperar su vencimiento.
- La pérdida de red bloquea el control. Las mutaciones no se reintentan ni quedan en espera para ejecutarse al volver la red. Se ofrece recuperación explícita.
- Los JWT emitidos por Neon tienen su propia caducidad: cerrar sesión termina la sesión web y libera el control, pero no debe interpretarse como revocación criptográfica instantánea de cualquier JWT ya emitido.

## Diseño y acceso

Se reutilizan componentes oficiales shadcn/ui con Base UI: Button, Dialog, Sidebar, Sheet, Tooltip y sus dependencias. El shell y los diálogos siguen las referencias X-01, X-02 y X-03; utilizan Geist Sans, los tokens de Mirai, Iconsax y el logo proporcionado en `apps/web/public/images/mirai_logo.svg`.

Todos los textos nuevos y nombres accesibles tienen catálogo español/inglés. La preferencia de idioma se conserva mediante cookie y el servidor la utiliza al renderizar.

**Decisión del fundador, 16 de noviembre de 2026:** Mirai es solo para escritorio. Un teléfono muestra un diálogo bloqueante sin controles de acceso a la aplicación y sin posibilidad de cerrarlo. La detección utiliza el User-Agent del dispositivo; no bloquea una ventana de escritorio simplemente por ser estrecha. Como cualquier detección web de dispositivo, un User-Agent manipulado puede imitar un escritorio.

## Datos y despliegue

Migración `apps/api/database/migrations/0000_cold_yellow_claw.sql`, revisada y aplicada sobre Neon `mirai`, base `mirai`, única rama `production`. Crea `account_controllers`, `extension_challenges` y `linked_extensions`; no modifica el esquema gestionado `neon_auth` ni crea ramas nuevas.

Neon ya tiene deshabilitado email/contraseña y conserva Google OAuth. Para producción deben registrarse los orígenes HTTPS reales en Neon. Construir la imagen web con `--build-arg NEXT_PUBLIC_API_ORIGIN=<origen-api>` y proporcionar las variables privadas de Auth en runtime. Estos cambios no despliegan Cloud Run ni publican extensiones.

## Verificación

`pnpm check`: lint, TypeScript 7 y pruebas enfocadas de autenticación y contratos. La prueba con PostgreSQL real es optativa y se ejecuta en PowerShell desde la raíz con `$env:MIRAI_DB_TEST='1'; pnpm test apps/api/src/features/sessions/controllerRepository.test.ts`. Solo crea y elimina registros sintéticos con identificadores únicos; no utiliza datos del candidato.

La evidencia de navegador y los límites concretos de la revisión están en [sprint01_verification.md](sprint01_verification.md).
