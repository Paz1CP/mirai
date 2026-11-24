# Mirai — Design System

> **Tipo:** Técnico  
> **Alcance:** Tokens visuales, tipografía, componentes base, patrones de interfaz y composición del workspace web.  
> **Responsable:** Ingeniería de producto  
> **Última verificación:** 2026-11-24

## 1. Resumen

Mirai utiliza una interfaz oscura, compacta y orientada al trabajo. El sistema visual se construye con Tailwind CSS v4, variables CSS, componentes locales sobre Base UI y la tipografía Geist.

Este documento describe los valores y componentes que gobiernan la interfaz web. El código de la aplicación es la fuente de verdad de los tokens y comportamientos visuales. El archivo Figma funciona como referencia visual, no como prueba de que una pantalla o interacción exista en runtime.

## Documentación funcional relacionada

[Campañas](../campaigns/business.md) · [Browser](../browser/business.md) · [Postulaciones](../applications/business.md)

## 2. Fuentes de verdad

| Ámbito | Fuente |
|---|---|
| Tipografía y tema global | apps/web/src/app/layout.tsx |
| Colores, radios y estilos globales | apps/web/src/styles/globals.css |
| Configuración del generador de componentes | apps/web/components.json |
| Variantes de botones | apps/web/src/components/ui/button.tsx |
| Inputs | apps/web/src/components/ui/input.tsx |
| Sidebar | apps/web/src/components/ui/sidebar.tsx |
| Composición de navegación y workspace | apps/web/src/features/sessions/WorkspaceShell.tsx |
| Diseño de conversación | apps/web/src/features/chat/ChatWorkspace.tsx, ChatComposer.tsx y ChatTranscript.tsx |
| Superficie de documentos | apps/web/src/features/profiles/DocumentWorkspace.tsx y MiraiCv.tsx |

El documento funcional de estados, interacciones y recorridos es [Mirai UI/UX E2E](mirai_ui_ux_e2e.md). La arquitectura del control del navegador se describe en [Browser Control Architecture](../05_browser_control_architecture.md).

## 3. Identidad visual

Los rasgos visuales presentes en la aplicación son:

- Tema oscuro aplicado en el documento raíz.
- Fondo negro y superficies cercanas al negro.
- Texto principal blanco y texto secundario gris.
- Azul como color primario e indicador de foco.
- Bordes discretos y separación por superficies, no por sombras intensas.
- Esquinas redondeadas con radios derivados de un único token.
- Componentes densos, con controles compactos y jerarquía tipográfica clara.
- Superficies de documento con paleta clara independiente del workspace oscuro.

## 4. Tokens de color

El documento raíz aplica la clase dark. Por ello, los valores de la tabla corresponden al tema que utiliza la aplicación.

| Token | Valor | Uso |
|---|---|---|
| background | #000000 | Fondo general |
| foreground | #ffffff | Texto principal |
| card | #0a0a0a | Tarjetas y superficies elevadas |
| card-foreground | #ffffff | Texto de tarjetas |
| popover | oklch(0.205 0 0) | Menús y popovers |
| popover-foreground | oklch(0.985 0 0) | Texto de popovers |
| primary | #0a66c2 | Acción primaria, enlaces y foco |
| primary-foreground | #ffffff | Texto sobre primario |
| secondary | #141414 | Superficie secundaria |
| secondary-foreground | oklch(0.985 0 0) | Texto secundario |
| muted | #202020 | Superficie atenuada |
| muted-foreground | #b0b0b0 | Texto secundario |
| accent | oklch(0.269 0 0) | Realce de interacción |
| accent-foreground | oklch(0.985 0 0) | Texto sobre realce |
| destructive | #ef6b72 | Error y acción destructiva |
| success | #4ade80 | Estado positivo |
| warning | #f4ba55 | Advertencia y permiso sensible |
| border | #252525 | Bordes |
| input | #363636 | Borde y superficie de campos |
| ring | #0a66c2 | Anillo de foco |

### 4.1. Sidebar

| Token | Valor |
|---|---|
| sidebar | #000000 |
| sidebar-foreground | oklch(0.985 0 0) |
| sidebar-primary | var(--primary) |
| sidebar-primary-foreground | oklch(0.985 0 0) |
| sidebar-accent | oklch(0.269 0 0) |
| sidebar-accent-foreground | oklch(0.985 0 0) |
| sidebar-border | oklch(1 0 0 / 10%) |
| sidebar-ring | oklch(0.556 0 0) |

### 4.2. Superficie de documentos

La vista de documentos utiliza tokens independientes del workspace oscuro:

| Token | Valor | Uso |
|---|---|---|
| document-paper | #f6f6f3 | Papel de CV |
| document-ink | #202322 | Texto del documento |
| document-rule | #dcddda | Líneas y divisores del documento |

Los colores chart-1 a chart-5 también existen en globals.css como tokens neutrales. No constituyen una paleta de estado para campañas o postulaciones.

## 5. Tipografía

La aplicación carga **Geist** mediante next/font/google y la expone como variable --font-geist. Tailwind asigna esa variable a font-sans y font-heading.

| Nivel o uso | Tratamiento presente |
|---|---|
| Encabezados de página | text-2xl, font-semibold, tracking-tight |
| Bienvenida del chat | text-3xl, font-semibold, tracking-tight |
| Texto general | text-sm |
| Metadatos y etiquetas | text-xs |
| Valores numéricos | tabular-nums cuando la alineación lo requiere |
| Markdown del chat | Jerarquía de encabezados, listas, tablas, citas y bloques de código |

No existe una familia tipográfica monoespaciada global definida en el tema. Los bloques de código del chat usan las reglas de Markdown y estilos locales.

## 6. Forma, radios y espaciado

El radio base es **0.625rem (10 px)**. Los radios derivados se calculan desde ese valor:

| Token | Fórmula | Valor aproximado |
|---|---:|---:|
| radius-sm | 0.6 × base | 6 px |
| radius-md | 0.8 × base | 8 px |
| radius-lg | 1 × base | 10 px |
| radius-xl | 1.4 × base | 14 px |
| radius-2xl | 1.8 × base | 18 px |
| radius-3xl | 2.2 × base | 22 px |
| radius-4xl | 2.6 × base | 26 px |

Los componentes utilizan utilidades Tailwind para padding, gap y dimensiones. No hay una escala de espaciado personalizada adicional en globals.css.

Patrones frecuentes:

- rounded-lg en botones, inputs y elementos de actividad.
- rounded-xl en tarjetas, tablas y paneles.
- rounded-2xl en diálogos y superficies de conversación.
- rounded-3xl en el contenedor principal del workspace.
- rounded-4xl en el composer y las superficies de importación de CV.

## 7. Layout del workspace

### 7.1. Navegación principal

El workspace tiene una sidebar izquierda con cinco destinos:

| Destino | Ruta |
|---|---|
| Chat | / |
| Dashboard | /dashboard |
| Applications | /applications |
| Documents | /documents |
| Profile | /profile |

La sidebar utiliza 13.5rem (216 px) de ancho expandido y 3.5rem (56 px) en modo icono. Los elementos principales de navegación tienen 44 px de altura. La sidebar contiene además el historial de conversaciones, el menú de facturación, el selector de idioma y el cierre de sesión.

### 7.2. Área de contenido

El contenido se representa dentro de SidebarInset con margen de 8 px, borde y radio rounded-3xl. Las páginas utilizan padding y anchos máximos propios del contexto:

- Chat: transcript y composer centrados en un ancho máximo de 48rem.
- Dashboard: resumen de estados, campañas, actividad reciente y explorador de postulaciones.
- Applications: tabla de resultados y panel lateral de detalle.
- Documents: biblioteca de CV y documentos originales.
- Profile: importación, revisión profesional, preferencias y ajustes.

### 7.3. Vistas de documentos

DocumentWorkspace divide el espacio en dos columnas: una vista previa de documento con proporción 3fr y un panel de edición con proporción 2fr, con un mínimo de 22rem para el panel derecho. La vista previa de CV se renderiza como componente cliente.

### 7.4. Dispositivos

El layout raíz detecta agentes de usuario móviles y presenta la pantalla DesktopOnly en lugar del workspace. La experiencia de producto descrita por este sistema es de escritorio. La implementación de Sidebar contiene un modo Sheet para pantallas pequeñas, pero la comprobación de DesktopOnly ocurre antes de renderizar el workspace en agentes móviles.

## 8. Componentes base

Los componentes locales se encuentran en apps/web/src/components/ui. Utilizan primitivas de **@base-ui/react** y estilos Tailwind; shadcn aporta la configuración y el flujo de generación de componentes.

| Componente | Responsabilidad |
|---|---|
| Accordion | Contenido plegable |
| Button | Acciones y variantes |
| Calendar | Selección de fechas |
| Checkbox | Selección booleana |
| Combobox | Selección con búsqueda |
| Dialog | Diálogos modales |
| Input / InputGroup | Entrada de texto |
| Popover | Contenido flotante |
| Progress | Progreso |
| Select | Selección de opciones |
| Separator | Separación visual |
| Sheet | Panel lateral modal |
| Sidebar | Navegación |
| Skeleton | Estado de carga |
| Sonner | Toasts |
| Switch | Activación booleana |
| Textarea | Texto multilínea |
| Tooltip | Ayuda contextual |

### 8.1. Botones

Button define estas variantes:

| Variante | Uso |
|---|---|
| default | Acción principal |
| outline | Acción secundaria con borde |
| secondary | Acción de énfasis secundario |
| ghost | Acción de baja prominencia |
| destructive | Acción destructiva |
| link | Acción presentada como enlace |

Tamaños disponibles: default, xs, sm, lg, icon, icon-xs, icon-sm e icon-lg. El componente incluye estados disabled, focus-visible, aria-invalid y transiciones de interacción.

### 8.2. Inputs

Input utiliza altura de 32 px, borde input, radio lg y anillo de foco. El estado inválido se expresa mediante aria-invalid y los tokens destructive. Los campos de texto y áreas multilínea comparten los tokens globales y pueden definir dimensiones específicas por contexto.

### 8.3. Iconografía

Los componentes existentes importan iconos de **iconsax-reactjs**, habitualmente en variante Linear. La configuración de shadcn en apps/web/components.json declara iconLibrary: lucide, pero el código de los componentes utiliza Iconsax y el manifiesto de dependencias de la aplicación declara iconsax-reactjs. Para mantener la consistencia de los componentes existentes, el código fuente determina la biblioteca efectiva de iconos.

## 9. Patrones de interfaz

### 9.1. Chat

- Mensajes del usuario alineados a la derecha sobre una superficie secondary.
- Respuestas del agente con Markdown y ancho de lectura controlado.
- Actividad del turno separada de la respuesta final.
- Llamadas a herramientas representadas en tarjetas de actividad. Las herramientas de dominio pueden mostrar datos expandidos cuando el evento los incluye; las herramientas browser_*, openBrowser y prepareAttachment muestran el nombre, sin argumentos ni resultados.
- Resumen de campaña como tarjeta estructurada.
- Composer con editor Markdown, adjuntos y controles de generación.

### 9.2. Datos y resultados

- Las tablas usan borde exterior, encabezado sobre superficie card y divisores horizontales.
- Las columnas que permiten orden muestran dirección ascendente o descendente.
- Los estados utilizan los tokens success, warning, destructive o muted-foreground según su significado.
- Los números y fechas usan formatos localizados.

### 9.3. Documentos

- Los CV se presentan mediante thumbnails y vistas previas.
- La edición mantiene una vista del documento junto al formulario.
- Comparaciones de CV muestran varias vistas sincronizadas y controles de zoom.
- Los originales se distinguen de las variantes de CV.

### 9.4. Feedback

- Dialog para confirmaciones y operaciones que requieren decisión.
- Sheet para detalles que conservan el contexto de la página.
- Popover para controles compactos y acciones contextuales.
- Tooltip para etiquetas auxiliares.
- Sonner para notificaciones breves.
- Skeleton para carga de datos.
- Progress para procesos de extracción.

## 10. Accesibilidad y movimiento

Los componentes usan etiquetas accesibles, estados aria, roles de alerta o status y focus-visible. Los controles icon-only requieren aria-label. Las acciones principales deben conservar un nombre comprensible aunque su icono sea el elemento visual dominante.

Los estados no dependen exclusivamente del color: los resultados y los formularios muestran etiquetas textuales. Los controles interactivos mantienen foco visible y los diálogos y sheets proporcionan semántica de modal.

Las animaciones del flujo de importación y revisión de CV respetan prefers-reduced-motion. El resto de transiciones se define mediante utilidades Tailwind y estilos de cada componente.

## 11. Referencia visual

El archivo [Mirai en Figma](https://www.figma.com/design/oOnS2qNlWKwyTO9rqhoGEM/Mirai) sirve como referencia visual para composición y exploración de interfaz. Los tokens, variantes y estados descritos aquí corresponden al código fuente de la aplicación.

Los diseños de navegador integrado y modo Normal/Operator que aparecen en Figma no forman parte del layout web actual. La diferencia entre referencia visual y runtime se detalla en [Mirai UI/UX E2E](mirai_ui_ux_e2e.md).

## 12. Mapa de implementación

| Área | Ubicación |
|---|---|
| Tema global y tokens | apps/web/src/styles/globals.css |
| Tipografía y clase dark | apps/web/src/app/layout.tsx |
| Configuración shadcn | apps/web/components.json |
| Componentes base | apps/web/src/components/ui |
| Shell y navegación | apps/web/src/features/sessions/WorkspaceShell.tsx |
| Rutas del workspace | apps/web/src/features/sessions/workspaceRoutes.ts |
| Chat | apps/web/src/features/chat |
| Dashboard | apps/web/src/features/dashboard |
| Applications | apps/web/src/features/applications |
| Documents y CV | apps/web/src/features/cvs |
| Perfil y onboarding | apps/web/src/features/profiles |

## 13. Glosario

| Término | Definición |
|---|---|
| Token | Variable de diseño reutilizable para color, radio o estilo |
| Primitive | Componente base que proporciona semántica e interacción |
| Sidebar | Navegación principal del workspace |
| Sheet | Panel lateral modal |
| Surface | Superficie visual que agrupa contenido relacionado |
| Runtime | Interfaz que la aplicación web presenta realmente |
