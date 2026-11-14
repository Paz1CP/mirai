# Mirai — Design System

**Versión:** 1.1 · 14 de noviembre de 2026  
**Ámbito:** aplicación autenticada Mirai (MVP, desktop primero)  
**Stack visual:** React / Next.js · Tailwind CSS · shadcn/ui · Geist Sans · Iconsax Free  
**Documento asociado:** `mirai_codex_figma_e2e_prompt.md`

## 1. Dirección visual

**Identidad:** *Dark Technical Minimalism* — interfaz profesional, conversacional y operativa. Inspiración principal: **Resend** y **ChatGPT Desktop / Codex**; otras referencias proporcionadas por el fundador sirven para complementar navegación, densidad, superficies y componentes.

- **Negro absoluto `#000000`** en el lienzo principal; profundidad mediante superficies neutras, bordes y jerarquía tipográfica.
- **Azul `#0A66C2`** para acciones primarias, selección, foco y acentos de identidad. Reservarlo: aproximadamente **85 % de protagonismo visual neutro / 15 % de acentos y estados**; no medir ese reparto literalmente por píxeles.
- **Geist Sans solamente**, también para números y datos. No usar Geist Mono ni fuentes monospace como parte del producto.
- Diseño nítido, sobrio, sin gradientes o brillos ornamentales por defecto; efectos puntuales únicamente si mejoran jerarquía o comprensión.
- **Densidad equilibrada:** lectura cómoda del chat y datos suficientemente densos en tablas, sin tarjetas decorativas ni barras de estado redundantes.
- **Libertad creativa:** la implementación puede ajustar proporciones, composición y detalles ópticos, conservando las decisiones de identidad aprobadas. Si se modifica un token o una regla, actualizar el documento y dejar una justificación breve.

## 2. Colores y tokens

### 2.1. Paleta base

| Token semántico | Valor inicial | Uso |
|---|---|---|
| `background` | `#000000` | Lienzo absoluto |
| `surface-1` | `#0A0A0A` | Barra lateral / zonas estructurales |
| `surface-2` | `#141414` | Contenedores y navegación |
| `surface-3` | `#202020` | Inputs, mensajes, elementos elevados |
| `surface-4` | `#292929` | Hover y capas acentuadas |
| `border-subtle` | `#252525` | Separaciones discretas |
| `border-default` | `#363636` | Controles y paneles interactivos |
| `text-primary` | `#FFFFFF` | Texto principal de alto énfasis |
| `text-secondary` | `#B0B0B0` | Texto secundario |
| `text-muted` | `#858585` | Etiquetas y metadatos |
| `text-disabled` | `#666666` | Controles deshabilitados; no para instrucciones críticas |
| `primary` | **`#0A66C2`** | CTA, elemento activo, foco, actividad del agente |
| `primary-hover` | `#0758AB` | Hover sobre acción principal |
| `primary-subtle` | `#0A2036` | Selección, fondo de mensaje del usuario, acento tenue |
| `primary-border` | `#17466F` | Contorno de superficie seleccionada |
| `success` | `#34D399` | Operación confirmada |
| `warning` | `#F4BA55` | Atención o intervención requerida |
| `danger` | `#EF6B72` | Error, fallo o acción destructiva |
| `info` | `#62A6F5` | Información contextual |

Son **tokens de partida**, no una obligación de convertir cada fila en un componente. El gris forma una escala óptica: se emplea el escalón mínimo capaz de separar niveles; nunca colorear un panel solo porque hay espacio libre.

La vista del CV utiliza papel claro para distinguir el documento imprimible de los controles oscuros del editor. Estos colores se restringen al documento y al diff; no cambian el tema de la aplicación.

| Token de documento | Valor | Uso |
|---|---|---|
| `document-paper` | `#F6F6F3` | Papel de la vista previa |
| `document-ink` | `#202322` | Texto del CV |
| `document-secondary` | `#626862` | Fechas y etiquetas del documento |
| `document-rule` | `#DCDDDA` | Separadores del CV |
| `diff-added-bg` | `#E3F3E8` | Fragmentos añadidos |
| `diff-added-ink` | `#1D693C` | Texto añadido |
| `diff-removed-bg` | `#FBE7E9` | Fragmentos eliminados |
| `diff-removed-ink` | `#9C3440` | Texto eliminado, también tachado |

### 2.2. Reglas de aplicación

- El estado seleccionado puede combinar `surface-3`, `primary-subtle` y texto blanco; evitar saturar toda la navegación de azul.
- Las burbujas del usuario pueden utilizar `primary-subtle` o una mezcla azul-neutra, con texto de contraste suficiente. **No usar violeta como color secundario de marca.**
- Los colores de estado solo aparecen cuando existe una condición real. Estado + icono + texto; nunca depender exclusivamente del color.
- Fondos de tablas, barras laterales y paneles siguen siendo neutros; los acentos muestran foco, acción o resultados.
- En elementos de terceros representados visualmente (p. ej., un portal de empleo) respetar la legibilidad de ese contexto, diferenciándolo de la interfaz propia de Mirai.

### 2.3. Vinculación orientativa con shadcn/ui

| Token shadcn/ui | Fuente Mirai |
|---|---|
| `--background`, `--foreground` | `background`, `text-primary` |
| `--card`, `--card-foreground` | `surface-2`, `text-primary` |
| `--popover` | `surface-3` |
| `--primary`, `--primary-foreground` | `primary`, `#FFFFFF` |
| `--secondary`, `--secondary-foreground` | `surface-3`, `text-primary` |
| `--muted`, `--muted-foreground` | `surface-2`, `text-secondary` |
| `--accent`, `--accent-foreground` | `surface-4`, `text-primary` |
| `--destructive` | `danger` |
| `--border`, `--input`, `--ring` | `border-subtle`, `border-default`, `primary` |

Usar nombres semánticos y variables reutilizables en Figma y CSS. No pintar manualmente decenas de instancias con valores dispersos.

## 3. Tipografía

- **Familia:** Geist Sans en todos los textos y números; en Figma la familia disponible se llama `Geist`.
- **Pesos habituales:** 400 (lectura), 500 (interacción y etiquetas), 600 (títulos y énfasis). Otros pesos solo por necesidad óptica.
- **Escala de trabajo:** 12 / 13 / 14 / 16 / 20 / 24 / 28 / 32 / 36 px; microetiquetas de 11–12 px solo si son legibles. Ajustes finos, como 26 px, admitidos cuando mejoran el resultado.
- **Ritmo:** espaciado basado en múltiplos de **4 y 8 px**; no forzar que *toda* medida tipográfica sea múltiplo exacto de 8.
- **Interlineado de referencia:** 1.45–1.6 para texto y 1.1–1.3 para titulares; ajustar según ancho y contexto.
- **Jerarquía:** mensaje y acción primaria > estado activo > información secundaria > metadatos.
- Usar mayúsculas con moderación; evitar párrafos extensos en los registros de actividad.
- Numerales tabulares de **Geist Sans** cuando el soporte de la fuente lo permita para columnas, contadores y montos. No introducir otra familia tipográfica.

En desktop, los títulos de área usan 28 px; los controles, 13/20; los mensajes y pasos principales, 14/20; los metadatos, 11–12/20. El CV tiene su propia jerarquía de nombre, secciones y cuerpo (26, 10 y 11–12 px en la página nativa de 520 px de ancho). Las miniaturas escalan esa página, sin convertirse en un segundo sistema tipográfico. Los textos de componentes y pantallas se vinculan a estilos locales `Mirai / UI` y `Mirai / Document`.

## 4. Espaciado, geometría y superficies

| Propiedad | Regla |
|---|---|
| Espaciado | Retícula de 4 px; ritmo visual predominante de 8 px |
| Escala práctica | 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px |
| Bordes | 1 px, contraste bajo; reforzarlos solo en foco/selección |
| Radio pequeño | 8 px: botones, campos, celdas, chips y microcontroles |
| Radio mediano | 12–16 px: tarjetas, menús, avisos y diálogos |
| Radio grande | **24 px**: tarjetas y mensajes amplios |
| Radio extra grande | **32–36 px**: superficies grandes, overlays y compositores cuando favorezca la composición |
| Pill / icon button | Redondeo completo cuando el patrón lo justifique |
| Sombra | Muy tenue; preferir diferencia de superficie y borde |
| Animación | Breve, funcional y desactivable mediante `prefers-reduced-motion` |

**Jerarquía de tamaño:** los radios de 24–36 px no deben aplicarse indiscriminadamente a cada chip; las superficies grandes admiten curvatura elevada y los controles pequeños mantienen precisión. Evitar bloques excesivamente elevados que fragmenten el chat.

| Patrón desktop | Geometría de referencia |
|---|---|
| Sidebar | 216 px; filas de navegación de 44 px |
| Botón convencional | 36 px de alto, radio 8 px, icono de 16 px |
| Campo | 40 px de alto, radio 8 px; una línea y truncado cuando corresponda |
| Foco | Contorno visible de 2 px; `primary`, o `danger` en la acción destructiva |
| Fila del Dashboard | 56 px; título y metadato alineados en dos líneas |
| Resumen de campaña del chat | 80 px; identidad, restricciones y progreso pertinente |
| Compositor | 104 px, radio 24 px; adjunto, texto y una acción contextual |
| Documento | Página editable de 520 × 736 px; scroll dentro del workspace |

Los cuatro tratamientos de botón (primary, secondary, ghost y danger) tienen Default, Hover, Focus y Disabled. El campo tiene Default, Focus, Error y Disabled. El espacio se asigna al contenido: las tarjetas de candidaturas se sustituyen por lista y detalle; los pasos del agente se anidan bajo su operación actual.

## 5. Iconografía

**Iconsax Free** como repertorio principal: estilos **Linear / Outline** para navegación y acciones; **Bold / Filled** para selección, énfasis o estados pertinentes. Tamaños de referencia 16, 20 y 24 px; trazo y alineación consistentes.

- Solo usar activos incluidos legalmente en el nivel gratuito y consultar su licencia antes de distribuir un kit público de diseño.
- Si falta un pictograma específico: icono nativo del sistema o SVG propio sencillo. No comprar packs para completar la biblioteca.
- No mezclar simultáneamente iconos lineales, multicolor y volumétricos como si fueran un mismo set.
- Todas las acciones icon-only necesitan texto accesible/tooltip en la futura implementación.

Referencia de licencia: https://docs.iconsax.io/license-and-terms/license

## 6. Política de componentes: shadcn/ui primero

**Regla operativa:** si shadcn/ui ofrece un componente que resuelve la necesidad, **reutilizarlo y personalizarlo**. La expectativa es construir aproximadamente **90 % de los controles convencionales** con ese repertorio, no alcanzar una cuota artificial. Crear componentes propios solo para experiencias distintivas de Mirai o necesidades no cubiertas.

| Necesidad | Punto de partida |
|---|---|
| Navegación lateral | `Sidebar`, `Button`, `Tooltip`, `Separator`, `ScrollArea` |
| Chat y compositor | `Textarea`, `Button`, `Dropdown Menu`, `Popover`, `Tooltip`; composición Mirai propia |
| Avisos y permisos | `Dialog`, `Alert Dialog`, `Alert`, `Toast/Sonner` según implementación |
| Formularios breves | `Input`, `Select`, `Checkbox`, `Radio Group`, `Label`, `Progress` |
| Tablas de trazabilidad | `Data Table` + TanStack Table, filtros, menús, paginación |
| Documentos y revisiones | `Tabs`, `Card`, `Sheet`, `Accordion`, `Command`, `ScrollArea` + editor/diff específico |
| Resultados y controles del agente | `Badge`, `Progress`, `Collapsible`, `Skeleton` + componentes de actividad propios |

En Figma, aprovechar el **archivo gratuito de componentes shadcn/ui ya abierto por el usuario**: inspeccionar variantes, duplicar/copiar los componentes reutilizables permitidos y adaptarlos dentro del archivo Mirai. En Starter puede no haber publicación de bibliotecas compartidas; los componentes locales al mismo archivo son suficientes. No sustituir componentes editables por imágenes cuando se dispone de piezas nativas.

En código, emplear la rama/variante de shadcn/ui vigente en el repositorio y sus dependencias reales (Base UI o Radix según selección). No instalar ambas bases por inercia. Referencia: https://ui.shadcn.com/docs/figma

## 7. Patrones propios de Mirai

### 7.1. Chat como eje principal

- Sidebar + conversación + navegador/área de trabajo cuando corresponda.
- Estado vacío: bienvenida sobria, compositor inmediatamente visible, sugerencias discretas opcionales.
- Estado de trabajo: instrucciones del usuario, **actividad observable del agente** (acciones, resultados y excepciones), y controles pertinentes; sin exponer razonamientos internos privados.
- **El botón Enviar cambia a Pausar mientras el agente trabaja**; tras la pausa pasa a Reanudar o a la acción adecuada. No añadir controles redundantes que compitan.
- La actividad se visualiza con `AgentStep`, `ExecutionLog`, resúmenes y elementos desplegables; evitar mensajes separados para cada incremento numérico.
- **UI generativa estructurada**: Mirai puede mostrar, dentro del chat, tablas, resúmenes, revisiones, confirmaciones, resultados, pendientes y acciones contextualizadas. Componentes con estados y datos tipados; no tratar HTML libre del modelo como especificación del sistema.

### 7.2. Vista Normal / Operator

- Un **toggle situado en el divisor entre paneles** intercambia la posición y el protagonismo visual del **chat** y el **navegador**.
- Normal: chat principal, navegador secundario. Operator: navegador principal, chat secundario. La barra lateral permanece estable.
- **Es la misma pantalla**; no crea una ruta, sesión, campaña o instancia de agente nueva.
- Preserva conversación, posición razonable del scroll, datos y ejecución. El control debe ser descubrible con teclado/tooltip, sin indicador decorativo permanente.
- El diseño del navegador adjunto es una representación del entorno controlado por la extensión. El diseño implementable puede emplear vista vinculada, observación o ventana/pestaña real; **no asumir que los portales permiten `iframe`**.

### 7.3. Trazabilidad y datos densos

- Dashboard: **tabla tipo hoja de cálculo** de actividad y postulaciones, estructurada y filtrable. Campos candidatos: fecha, empresa, puesto, plataforma, CV/versión, estado, enlaces y registro resumido de acciones/mensajes profesionales relevantes.
- El agente **registra resultados automáticamente**, sin interrumpir su trabajo para navegar al dashboard ni requerir una llamada especial del modelo para actualizar un contador.
- Postulaciones: exploración más detallada del registro individual. Evitar duplicar la misma tabla sin una diferencia funcional real.
- Estados confirmados, no confirmados, pendientes y fallidos poseen distinciones textuales explícitas.

### 7.4. Biblioteca de CV

- Original **inmutable**. Para editarlo, crear una variante o copia derivada.
- Variantes persistentes por especialización profesional (backend, frontend, datos, etc.), **sin TTL**.
- Edición in situ de una variante, historial de versiones, comparación tipo diff (agregado/eliminado/modificado), restauración, vista previa, descarga y borrado.
- La edición manual tiene Guardar/Cancelar y cambios sin guardar explícitos. Restaurar conserva el historial y genera una nueva versión. El documento utilizado en una candidatura se consulta por su versión conservada; editar la variante después no cambia el archivo utilizado.
- La IA puede reutilizar y mejorar variantes existentes sin multiplicar documentos con sufijos de copias.

En pantallas amplias, el diff muestra dos documentos y un índice de secciones modificadas. A 1366 × 768 se utiliza una vista unificada que mantiene el tamaño legible del documento. La eliminación combina fondo rojo y tachado; las adiciones usan fondo verde y texto, sin depender solo del color.

### 7.5. Permisos y ejecución

- Una **única instancia controladora por cuenta** entre pestañas, navegadores, incógnito y dispositivos; intento de abrir otra instancia muestra **Cancelar / Usar aquí** y transfiere el control de forma exclusiva.
- Cerrar la pestaña de Mirai **pausa** las nuevas acciones del agente; al regresar se muestra el estado y opción de reanudar.
- Mirai puede comunicarse con reclutadores solo **en los portales de empleo o por correo**, bajo autorización reutilizable del usuario. **No** diseñar bandeja de entrada propia.
- Estado técnico normal oculto. Mostrar extensión/permisos/conectividad únicamente si condicionan una tarea o requieren intervención.

## 8. Accesibilidad, contenido y calidad

- Objetivo WCAG 2.2 AA en UI propia: contraste suficiente, foco visible, navegación por teclado, estados legibles sin color y tamaño de objetivos interactivos adecuado.
- Los iconos son apoyo, no sustituyen el texto de acciones críticas.
- Errores: explicar qué ocurrió, qué se sabe y qué puede hacer el usuario. No declarar postulación exitosa sin evidencia.
- Mensajes breves y precisos, preferentemente en español para los diseños de referencia; preparados para contenido variable y portugués de Brasil.
- Datos de ejemplo claramente ficticios; no sugerir que una candidatura ficticia fue realmente enviada.
- Diseñar estados vacío, carga, activo, pausado, completado, pendiente, error, permiso insuficiente y reconexión solo donde correspondan.
- Mantener la claridad de una sola acción primaria contextual; no saturar con CTA de adorno.

## 9. Estructura de archivo Figma

Para funcionar cómodamente en un archivo Starter, proponer **un solo archivo** llamado `Mirai — Product UI E2E`, con tres páginas de trabajo (adaptar si el plan permite otra organización):

1. `00 Foundations & Components`: variables/tokens, tipografía, iconografía y componentes/variantes locales.
2. `01 Desktop Screens`: frames desktop organizados por secciones funcionales y estados.
3. `02 Flows & QA`: recorridos/prototipos, anotaciones, estados excepcionales y cobertura.

Auto Layout, nombres semánticos, componentes realmente editables y variantes consistentes. Los artefactos que provengan de Code to Canvas **se deben revisar**: capas editables importadas no equivalen automáticamente a instancias vinculadas a una biblioteca de componentes.

## 10. Criterio de calidad del sistema

**Se acepta cuando:** los tokens son consistentes, cada control convencional reutiliza shadcn/ui o justifica excepción, los componentes son editables en Figma, los estados críticos son reconocibles, el toggle Normal/Operator conserva estructura, el diseño funciona a resoluciones desktop habituales y los archivos/documentación permiten implementarlo sin adivinar dimensiones, comportamientos o semántica.

**Fuentes técnicas para el ejecutor:**

- shadcn/ui: https://ui.shadcn.com/ · https://ui.shadcn.com/docs/figma
- Geist: https://vercel.com/font · https://vercel.com/geist/typography
- Figma Code to Canvas: https://developers.figma.com/docs/figma-mcp-server/code-to-canvas/
- Componentes y archivos en Starter: https://help.figma.com/hc/en-us/articles/13838684089751-Starter-plan-overview
