# Mirai — Decisión arquitectónica: control del navegador

**Estado:** Aprobada  
**Tecnología elegida:** [Playwright MCP de Microsoft](https://github.com/microsoft/playwright-mcp)

## 1. Decisión

Mirai utilizará **Playwright MCP de Microsoft** como motor de automatización de navegadores.

El agente de IA pertenece a Mirai y se ejecuta desde su backend. Playwright MCP proporciona las herramientas necesarias para interactuar con páginas web e interfaces gráficas, utilizando el navegador real del usuario.

No utilizaremos agentes de IA gestionados por terceros ni servicios de navegador cloud.

## 2. Propósito de la extensión

**La extensión es exclusivamente una herramienta de ejecución para el agente de Mirai.**

Su función es permitir que el agente utilice el navegador del usuario: navegar por páginas, observar interfaces, hacer clic, escribir, desplazarse, completar formularios, adjuntar archivos y gestionar pestañas.

La extensión **no es un agente independiente**. No interpreta los objetivos del usuario, no decide qué oportunidades buscar ni determina las acciones de una campaña.

Es simplemente el medio por el cual nuestro agente puede **ver y manipular páginas web e interfaces del navegador**.

## 3. Arquitectura

```text
Usuario → Mirai (Next.js)
               ↓
        Backend Express
        Agente IA de Mirai
               ↕
       Playwright MCP
       (infraestructura Mirai)
               ↕
       Puente remoto propio
               ↕
        Extensión Mirai
               ↕
       Chrome del usuario
```

- **Backend:** ejecuta el agente, mantiene su contexto y decide qué herramientas utilizar.
- **Playwright MCP:** proporciona las capacidades de automatización del navegador.
- **Puente remoto:** conecta el motor alojado en nuestra infraestructura con la extensión del usuario.
- **Extensión:** ejecuta las operaciones en Chrome y devuelve sus resultados.

La integración remota requerirá adaptar el transporte entre Playwright MCP y su extensión; no es una funcionalidad remota lista para utilizar directamente.

## 4. Motivos de elección

- **Madurez:** Playwright proporciona un motor consolidado para automatizar interfaces web.
- **Capacidades:** navegación, observación estructurada, interacción, formularios, archivos y pestañas.
- **Autonomía:** el agente decide libremente cómo utilizar las herramientas, sin flujos programados para cada portal.
- **Navegador real:** conserva las sesiones iniciadas del usuario.
- **Independencia:** código abierto, sin obligación de contratar servicios de automatización o inferencia de terceros.

Se prioriza la robustez funcional sobre la cantidad de código necesaria para integrarlo.

## 5. Experiencia del usuario

El usuario instala y vincula **Mirai Extension** una sola vez.

A partir de ese momento, puede solicitar una campaña desde Mirai y el agente utilizará las herramientas de Playwright MCP para interactuar autónomamente con páginas web.

**El usuario no instala Node.js, no configura MCP y no ejecuta servidores locales.** Todo el procesamiento del agente y el servidor MCP pertenece a la infraestructura de Mirai.

**Principio arquitectónico:** Mirai decide. Playwright MCP proporciona las herramientas. La extensión ejecuta. Chrome presenta las interfaces reales.