import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { BaseTool } from "@google/adk";
import { MCPToolset, toGeminiSchema } from "@google/adk/tools/mcp";
import { renderCvAttachment } from "@mirai/cv-renderer/node";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  CallToolResultSchema,
  ListRootsRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createConnection } from "@playwright/mcp";
import { chromium, type Browser, type Page } from "playwright";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import type { DocumentRef } from "@mirai/contracts";
import type { createCvRepository } from "../cvs/cvRepository.js";
import type { createDocumentStorage } from "../profiles/documentStorage.js";
import type { BrowserModel } from "./playwright/browserModel.js";
import type { BrowserTools } from "./miraiAgent.js";

const browserActions = [
  "browser_navigate",
  "browser_navigate_back",
  "browser_snapshot",
  "browser_find",
  "browser_take_screenshot",
  "browser_mouse_move_xy",
  "browser_mouse_wheel",
  "browser_click",
  "browser_type",
  "browser_fill_form",
  "browser_press_key",
  "browser_select_option",
  "browser_hover",
  "browser_drag",
  "browser_tabs",
  "browser_wait_for",
  "browser_file_upload",
  "browser_handle_dialog",
];
const sdkServerInfo = { name: "Mirai Playwright", version: "1.0.0" };
const browserConfig = {
  capabilities: ["vision"],
  snapshot: { mode: "none" },
  timeouts: { action: 3_000, settle: 100 },
  codegen: "none",
} satisfies NonNullable<Parameters<typeof createConnection>[0]>;
const tabActionSchema = z.object({
  action: z.enum(["list", "select", "new", "close"]),
  index: z.int().nonnegative().optional(),
});
const toolsThatCanChooseInitialTab = new Set([
  "browser_navigate",
  "browser_find",
  "browser_snapshot",
  "browser_take_screenshot",
]);

async function discoverBrowserTools() {
  // Playwright serves its tool schemas without requesting a browser context.
  const server = await createConnection(browserConfig, async () => {
    throw new Error("Playwright discovery does not execute tools.");
  });
  const client = new Client(sdkServerInfo);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    return tools
      .filter(({ name }) => browserActions.includes(name))
      .map((tool) =>
        tool.name === "browser_tabs"
          ? {
              ...tool,
              description:
                "List, create, close, or select a Chrome tab. Use the workspace index from the list response for select and close.",
            }
          : tool,
      );
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

let browserToolDefinitions: ReturnType<typeof discoverBrowserTools> | undefined;

export async function createLazyPlaywrightTools(connect: () => Promise<BrowserTools | undefined>) {
  return (await browserDefinitions()).map((definition) => {
    return new (class extends BaseTool {
      override _getDeclaration() {
        return {
          name: this.name,
          description: this.description,
          parameters: toGeminiSchema(definition.inputSchema),
          response: toGeminiSchema(definition.outputSchema),
        };
      }

      async runAsync(request: Parameters<BaseTool["runAsync"]>[0]) {
        const connection = await connect();
        if (!connection) return { error: "BROWSER_NOT_CONNECTED" };
        const tool = connection.tools.find(({ name }) => name === this.name);
        if (!tool) return { error: "BROWSER_TOOL_UNAVAILABLE", tool: this.name };
        return tool.runAsync(request);
      }
    })({ name: definition.name, description: definition.description ?? "" });
  });
}

function browserDefinitions() {
  browserToolDefinitions ??= discoverBrowserTools().catch((error: unknown) => {
    browserToolDefinitions = undefined;
    throw error;
  });

  return browserToolDefinitions;
}

const cdpCommandSchema = z.object({
  id: z.number().int(),
  method: z.string(),
  sessionId: z.string().optional(),
  params: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((value) => value ?? undefined),
});

export type WorkspaceBrowser = {
  accountId: string;
  model: BrowserModel;
  ready: boolean;
  cdp?: WebSocket;
};

export async function openPlaywrightTools(
  binding: WorkspaceBrowser,
  cvs: ReturnType<typeof createCvRepository>,
  storage: ReturnType<typeof createDocumentStorage>,
  locale: "es" | "en",
  signal: AbortSignal,
): Promise<BrowserTools> {
  signal.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), "mirai-attach-"));
  const cdpPath = `/cdp/${randomUUID()}`;
  const mcpPath = `/mcp/${randomUUID()}`;
  const files = new Map<string, { path: string; name: string }>();
  const cdp = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 });
  let canCreateTab = false;
  function authorizeUpload(args: Record<string, unknown>) {
    const paths = z.string().array().min(1).max(10).safeParse(args.paths);
    return (
      paths.success &&
      paths.data.every((path) => [...files.values()].some((file) => file.path === path))
    );
  }
  const server = createServer((req, res) => {
    if (req.url !== mcpPath || signal.aborted) {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" }).end();
      return;
    }
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: undefined,
    });
    const proxy = new Server(sdkServerInfo, { capabilities: { tools: {} } });
    proxy.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: await browserDefinitions(),
    }));
    proxy.setRequestHandler(
      CallToolRequestSchema,
      async ({ params }, { signal: requestSignal }) => {
        const callSignal = AbortSignal.any([signal, requestSignal]);
        callSignal.throwIfAborted();
        if (
          !browserActions.includes(params.name) ||
          (params.name === "browser_file_upload" && !authorizeUpload(params.arguments ?? {}))
        ) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: "This browser operation is unavailable." }],
          };
        }
        const tabAction =
          params.name === "browser_tabs" ? tabActionSchema.parse(params.arguments) : undefined;
        if (tabAction && tabAction.action !== "new") {
          const { tabs, selectedTabId } = await binding.model.workspaceTabs();
          callSignal.throwIfAborted();
          const tabId =
            tabAction.index ?? (tabAction.action === "close" ? selectedTabId : undefined);
          if (tabAction.action !== "list") {
            if (tabId === undefined || !tabs.some(({ id }) => id === tabId))
              return {
                isError: true,
                content: [
                  {
                    type: "text" as const,
                    text: "Chrome tab not found. List tabs and use a reported index.",
                  },
                ],
              };
            if (tabAction.action === "select") {
              callSignal.throwIfAborted();
              await binding.model.selectTab(tabId);
              if (browser?.isConnected()) await connectMcp(binding.model.selectedSessionId);
            } else await binding.model.closeTab(tabId);
          }
          const current = tabAction.action === "select" ? tabId : selectedTabId;
          const listing = tabs
            .filter(({ id }) => tabAction.action !== "close" || id !== tabId)
            .map(({ id, windowId, title, url }) => ({
              index: id,
              windowId,
              title,
              url,
              current: id === current,
            }));
          return { content: [{ type: "text" as const, text: JSON.stringify(listing) }] };
        }
        const tabId =
          tabAction?.action === "new"
            ? binding.model.selectedTabId
            : await binding.model.ensureTab(toolsThatCanChooseInitialTab.has(params.name));
        callSignal.throwIfAborted();
        if (
          tabId === undefined &&
          params.name !== "browser_navigate" &&
          tabAction?.action !== "new"
        )
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "No usable Chrome tab. List tabs and select one, or explicitly navigate to a URL.",
              },
            ],
          };
        const connection = await connectMcp(binding.model.selectedSessionId);
        canCreateTab =
          tabAction?.action === "new" ||
          (tabId === undefined && params.name === "browser_navigate");
        try {
          const result = await connection.callTool(params, CallToolResultSchema, {
            signal: callSignal,
          });
          mcpSessionId = binding.model.selectedSessionId;
          mcpPage = browser?.contexts()[0]?.pages()[0];
          if (
            tabAction?.action === "new" &&
            !result.isError &&
            binding.model.selectedTabId !== undefined
          )
            return {
              ...result,
              content: [
                ...CallToolResultSchema.parse(result).content,
                {
                  type: "text" as const,
                  text: `Workspace tab index: ${binding.model.selectedTabId}`,
                },
              ],
            };
          return result;
        } finally {
          canCreateTab = false;
        }
      },
    );
    res.once("close", () => void proxy.close().catch(() => {}));
    void proxy
      .connect(transport)
      .then(() => transport.handleRequest(req, res))
      .catch(() => {
        if (!res.headersSent) res.writeHead(500).end();
        else res.destroy();
      });
  });
  server.on("upgrade", (request, socket, head) => {
    if (request.url !== cdpPath || signal.aborted || binding.cdp?.readyState === WebSocket.OPEN) {
      socket.destroy();
      return;
    }
    cdp.handleUpgrade(request, socket, head, (ws) => {
      binding.cdp = ws;
      ws.on("error", () => ws.terminate());
      ws.on("message", (data) => {
        void (async () => {
          const command = cdpCommandSchema.parse(JSON.parse(data.toString()));
          const { id, method, params, sessionId } = command;
          try {
            signal.throwIfAborted();
            if (method === "Target.createTarget" && !canCreateTab)
              throw new Error("The selected Chrome tab is unavailable. List tabs and select one.");
            const result: unknown = await binding.model.handleCDPCommand(method, params, sessionId);
            if (ws.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ id, sessionId, result }));
          } catch (error) {
            if (ws.readyState === WebSocket.OPEN)
              ws.send(
                JSON.stringify({
                  id,
                  sessionId,
                  error: {
                    code: -32000,
                    message: error instanceof Error ? error.message : "Chrome command failed",
                  },
                }),
              );
          }
        })().catch(() => ws.terminate());
      });
      ws.once("close", () => {
        if (binding.cdp === ws) {
          binding.cdp = undefined;
          binding.model.disconnectCdpClient();
        }
      });
    });
  });
  let microsoft: Awaited<ReturnType<typeof createConnection>> | undefined;
  let client: Client | undefined;
  let browser: Browser | undefined;
  let mcpPage: Page | undefined;
  let mcpSessionId: string | undefined;
  const cdpTimeout = 30_000;
  let cdpEndpoint: string;
  let toolset: MCPToolset | undefined;
  let closing: Promise<void> | undefined;
  async function disconnectMcp() {
    const previousClient = client;
    const previousServer = microsoft;
    const previousBrowser = browser;
    client = undefined;
    microsoft = undefined;
    browser = undefined;
    mcpPage = undefined;
    mcpSessionId = undefined;
    if (binding.cdp && cdp.clients.has(binding.cdp)) binding.model.disconnectCdpClient();
    for (const connection of cdp.clients) connection.terminate();
    await Promise.allSettled([
      previousClient?.close(),
      previousServer?.close(),
      previousBrowser?.close(),
    ]);
  }
  async function connectMcp(sessionId: string | undefined) {
    if (client && browser?.isConnected() && binding.cdp?.readyState === WebSocket.OPEN) {
      if (sessionId !== mcpSessionId) {
        const context = browser.contexts()[0]!;
        // The relay detaches the old target, making the next initialized page MCP's current tab.
        if (mcpPage && !mcpPage.isClosed())
          await mcpPage.waitForEvent("close", { timeout: cdpTimeout });
        mcpPage =
          sessionId === undefined
            ? undefined
            : (context.pages()[0] ?? (await context.waitForEvent("page", { timeout: cdpTimeout })));
        mcpSessionId = sessionId;
      }
      return client;
    }
    await disconnectMcp();
    signal.throwIfAborted();
    const upstream = await createConnection(
      { ...browserConfig, outputDir: directory },
      async () => {
        const connected = await chromium.connectOverCDP(cdpEndpoint, {
          timeout: cdpTimeout,
          noDefaults: true,
          artifactsDir: directory,
        });
        if (signal.aborted) {
          await connected.close();
          signal.throwIfAborted();
        }
        browser = connected;
        const context = connected.contexts()[0]!;
        mcpPage = context.pages()[0];
        return context;
      },
    );
    if (signal.aborted) {
      await upstream.close();
      signal.throwIfAborted();
    }
    microsoft = upstream;
    const connection = new Client(sdkServerInfo, { capabilities: { roots: {} } });
    client = connection;
    connection.setRequestHandler(ListRootsRequestSchema, () => ({
      roots: [{ name: "Mirai attachments", uri: pathToFileURL(directory).href }],
    }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await upstream.connect(serverTransport);
      await connection.connect(clientTransport);
      signal.throwIfAborted();
      mcpSessionId = sessionId;
      return connection;
    } catch (error) {
      await disconnectMcp();
      throw error;
    }
  }
  function close() {
    closing ??= (async () => {
      signal.removeEventListener("abort", stop);
      const disconnecting = disconnectMcp();
      cdp.close();
      server.closeAllConnections();
      server.close();
      await Promise.allSettled([toolset?.close(), disconnecting, binding.model.releaseDebugger()]);
      // The only files removed are inside the directory created for this invocation.
      await rm(directory, { recursive: true, force: true });
    })();
    return closing;
  }
  function stop() {
    void close().catch(() => {});
  }
  signal.addEventListener("abort", stop, { once: true });
  try {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    signal.throwIfAborted();
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Playwright bridge unavailable.");
    const local = `127.0.0.1:${address.port}`;
    cdpEndpoint = `ws://${local}${cdpPath}`;
    let discoverySignal: AbortSignal | undefined = AbortSignal.timeout(5000);
    toolset = new MCPToolset(
      {
        type: "StreamableHTTPConnectionParams",
        url: `http://${local}${mcpPath}`,
        transportOptions: {
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              signal: AbortSignal.any([
                signal,
                ...(discoverySignal ? [discoverySignal] : []),
                ...(init?.signal ? [init.signal] : []),
              ]),
            }),
        },
      },
      browserActions,
    );
    const tools = await toolset.getTools();
    discoverySignal = undefined;
    signal.throwIfAborted();
    return {
      tools,
      close,
      authorizeUpload,
      isConnected: () => binding.ready,
      async prepare({ kind, id }: DocumentRef) {
        signal.throwIfAborted();
        const identity = `${kind}:${id}`;
        const existing = files.get(identity);
        if (existing) return existing;
        let name: string;
        let buffer: Buffer;
        if (kind === "cv") {
          const cv = await cvs.read(binding.accountId, id);
          name = `${cv.name.replace(/\.pdf$/i, "")}.pdf`;
          buffer = await renderCvAttachment(cv.profile, locale);
        } else {
          const document = await cvs.original(binding.accountId, id);
          name = document.name;
          buffer = await storage.read(binding.accountId, document.key);
        }
        signal.throwIfAborted();
        const sanitized = name.replace(/[^\p{L}\p{N} ._-]/gu, "_").slice(-140) || "document.pdf";
        const destination = join(directory, `${kind}-${id}`);
        await mkdir(destination, { recursive: true });
        const path = join(destination, sanitized);
        await writeFile(path, buffer, { signal, mode: 0o600 });
        const file = { path, name };
        files.set(identity, file);
        return file;
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
