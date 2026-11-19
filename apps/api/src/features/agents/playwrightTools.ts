import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { MCPToolset } from "@google/adk/tools/mcp";
import { renderCvAttachment } from "@mirai/cv-renderer/node";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListRootsRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createConnection } from "@playwright/mcp";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import type { DocumentRef } from "@mirai/contracts";
import type { createCvRepository } from "../cvs/cvRepository.js";
import type { createDocumentStorage } from "../profiles/documentStorage.js";
import type { BrowserBinding } from "./browserRelay.js";
import type { BrowserTools } from "./miraiAgent.js";

const browserActions = [
  "browser_navigate",
  "browser_navigate_back",
  "browser_snapshot",
  "browser_take_screenshot",
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
const cdpCommandSchema = z.object({
  id: z.number().int(),
  method: z.string(),
  sessionId: z.string().optional(),
  params: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((value) => value ?? undefined),
});

export async function openPlaywrightTools(
  binding: BrowserBinding,
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
  const sdkServerInfo = { name: "Mirai Playwright", version: "1.0.0" };
  const cdp = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 });
  const client = new Client(sdkServerInfo, { capabilities: { roots: {} } });
  function authorizeUpload(args: Record<string, unknown>) {
    const paths = z.string().array().min(1).max(10).safeParse(args.paths);
    return (
      paths.success &&
      paths.data.every((path) => [...files.values()].some((file) => file.path === path))
    );
  }
  client.setRequestHandler(ListRootsRequestSchema, () => ({
    roots: [{ name: "Mirai attachments", uri: pathToFileURL(directory).href }],
  }));
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
    proxy.setRequestHandler(ListToolsRequestSchema, ({ params }) => client.listTools(params));
    proxy.setRequestHandler(CallToolRequestSchema, ({ params }, { signal: requestSignal }) => {
      if (
        !browserActions.includes(params.name) ||
        (params.name === "browser_file_upload" && !authorizeUpload(params.arguments ?? {}))
      ) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: "This browser operation is unavailable." }],
        };
      }
      return client.callTool(params, undefined, {
        signal: AbortSignal.any([signal, requestSignal]),
      });
    });
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
  let toolset: MCPToolset | undefined;
  let closing: Promise<void> | undefined;
  function close() {
    closing ??= (async () => {
      signal.removeEventListener("abort", stop);
      for (const connection of cdp.clients) connection.terminate();
      cdp.close();
      server.closeAllConnections();
      server.close();
      await Promise.allSettled([toolset?.close(), client.close(), microsoft?.close()]);
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
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Playwright bridge unavailable.");
    const local = `127.0.0.1:${address.port}`;
    microsoft = await createConnection({
      browser: { cdpEndpoint: `ws://${local}${cdpPath}`, cdpTimeout: 12000 },
      outputDir: directory,
      timeouts: { action: 10000 },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await microsoft.connect(serverTransport);
    await client.connect(clientTransport);
    signal.throwIfAborted();
    if (microsoft === undefined) throw new Error("Playwright MCP unavailable.");
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
