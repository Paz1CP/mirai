# Sprint 03 — Biblioteca y gestión de CV

La Biblioteca de CV en `/documents` muestra el CV principal y las variantes de la cuenta. El editor comparte los campos y el visor del Perfil profesional. El usuario puede duplicar documentos, importar y revisar un PDF o DOCX, exportar el PDF generado, comparar hasta tres CV y elegir una variante predeterminada.

El CV principal obtiene su contenido de `users.candidate_profiles.profile`. Su registro en `users.cv_documents` controla si aparece en la biblioteca. Eliminarlo conserva el perfil, las preferencias y los permisos. Cada variante guarda su propio `ProfessionalProfile`. Una revisión por documento protege el guardado frente a cambios concurrentes.

Las importaciones se guardan tras confirmar la revisión. La extracción utiliza el mismo servicio de Vertex AI del Sprint 02. El archivo fuente se guarda en Neon Object Storage y las descargas de CV se generan en el navegador. Al eliminar o reemplazar una fuente, PostgreSQL registra la limpieza pendiente y el servidor elimina el objeto cuando ya no tiene referencias. La Biblioteca permite reintentar la limpieza si falla el almacenamiento.

## Migración y pruebas

La migración `0005_cv_library.sql` creó la biblioteca y el registro de limpieza de archivos en Neon de desarrollo. El backfill inicial creó un CV principal para el perfil existente. Se comprobó el acceso al perfil y al CV principal en Chrome desde localhost.

En Chrome se duplicaron el CV principal y una variante. Se editaron el titular, el resumen, la experiencia y las habilidades, y se eliminó una entrada de educación. El titular y la eliminación persistieron al reabrir el documento. También se descargó el PDF y se descartó un borrador desde la confirmación de cierre.

Los flujos de importación PDF y DOCX pasaron por Vertex AI y guardaron variantes independientes después de revisar el contenido. El extractor rechazó un PDF corrupto y permitió reintentar con otro archivo. Se comprobó el desplazamiento sincronizado en dos y tres columnas de distinta longitud y el zoom compartido con una ventana de 1366 px. Al eliminar la variante predeterminada, la Biblioteca volvió a señalar el CV principal.

Un bloqueo temporal en PostgreSQL sobre una variante de prueba activó el aviso y el botón de reintento. El borrador se guardó después de liberar el bloqueo. Una revisión concurrente activó la comparación con la versión actual antes de aplicar el borrador. La cuenta existente conservó el contenido de su perfil y su archivo original.

Las pruebas de integración con Neon de desarrollo cubren el acceso entre cuentas, la revisión concurrente, el reemplazo seguro, la eliminación y recreación del CV principal y la limpieza física de objetos. Usan identificadores de cuenta efímeros y archivos de prueba. Se ejecutan en PowerShell con `$env:MIRAI_CV_TEST_NEON='1'; pnpm exec vitest run apps/api/src/features/cvs/cvLibrary.test.ts --testTimeout 90000 --hookTimeout 45000`.

Pasaron la compilación, el chequeo de tipos, ESLint y 15 pruebas, incluidas las suites de regresión de acceso y perfil. Prettier aceptó los archivos modificados del sprint. El chequeo global de formato indica diferencias en otros archivos del repositorio.
