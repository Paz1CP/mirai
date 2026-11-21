import { createHmac, randomUUID } from "node:crypto";
import { once } from "node:events";
import { Gemini, InMemorySessionService } from "@google/adk";
import {
  workspaceServerSchema,
  workspaceSocketPath,
  type WorkspaceServerFrame,
} from "@mirai/contracts";
import express from "express";
import { expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { createDatabase } from "../../infrastructure/database/client.js";
import { createChatExecution } from "../agents/chatExecution.js";
import { createMiraiAgent } from "../agents/miraiAgent.js";
import { createControllerRepository } from "../sessions/controllerRepository.js";
import { createWorkspaceSocket } from "../sessions/workspaceSocket.js";
import { createInferenceBilling } from "./inferenceBilling.js";
import { createPaddleBilling } from "./paddleBilling.js";
import { createBillingRoutes } from "./routes.js";
import { createWalletRepository, unitsPerUsd } from "./walletRepository.js";

const connectionString = process.env.MIRAI_BILLING_TEST_DATABASE_URL;
const pgTest = connectionString ? it : it.skip;
const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 26)}`;

pgTest(
  "authenticates checkout, credits signed payments once and serializes FEFO debits",
  async () => {
    const { db, pool } = createDatabase(connectionString!);
    const wallets = createWalletRepository(db);
    const billing = createInferenceBilling(wallets, "sandbox");
    const paddle = createPaddleBilling(db, wallets);
    const account = randomUUID();
    const other = randomUUID();
    const price = id("pri");
    const product = id("pro");
    vi.stubEnv("DATABASE_URL_UNPOOLED", connectionString);
    vi.stubEnv("WEB_ORIGIN", "http://localhost:3000");
    vi.stubEnv("PADDLE_SANDBOX_API_KEY", "test_key");
    vi.stubEnv("PADDLE_SANDBOX_CLIENT_TOKEN", "test_token");
    vi.stubEnv("PADDLE_SANDBOX_PRODUCT_ID", product);
    vi.stubEnv("PADDLE_SANDBOX_PRICE_10", price);
    vi.stubEnv("PADDLE_SANDBOX_WEBHOOK_SECRET", "sandbox_test_secret");
    vi.stubEnv("PADDLE_LIVE_WEBHOOK_SECRET", "live_test_secret");
    const originalFetch = globalThis.fetch;
    let intent: string | undefined;
    let transaction = id("txn");
    vi.spyOn(globalThis, "fetch").mockImplementation((input, options) => {
      if (input === "https://sandbox-api.paddle.com/transactions") {
        const body = JSON.parse(String(options?.body));
        expect(body.items).toEqual([{ price_id: price, quantity: 1 }]);
        intent = body.custom_data.mirai_credit_purchase;
        return Promise.resolve(Response.json({ data: { id: transaction } }));
      }
      throw new Error("Unexpected upstream request in the billing integration test");
    });
    const app = express();
    const verify = async (header?: string) =>
      header?.slice(7) === account ? account : header?.slice(7) === other ? other : null;
    app.use("/billing", createBillingRoutes(verify, wallets, paddle, "sandbox"));
    const service = new InMemorySessionService();
    const appName = "mirai";
    const chat = await service.createSession({ appName, userId: account });
    const chats = {
      service,
      appName,
      project: "mirai-integration-test",
      modelName: "gemini-4-hydrogen",
      modelRegion: "global",
      capacity: async () => null,
      executionSession: () => service.getSession({ appName, userId: account, sessionId: chat.id }),
      rememberExecution: () => {},
    } as unknown as Parameters<typeof createMiraiAgent>[0];
    const results = {} as Parameters<typeof createMiraiAgent>[1];
    const profiles = {
      communicationAllowed: async () => false,
    } as unknown as Parameters<typeof createMiraiAgent>[2];
    const readLibrary = vi.fn();
    const cvs = { library: readLibrary } as unknown as Parameters<typeof createMiraiAgent>[3];
    const agent = createMiraiAgent(chats, results, profiles, cvs, billing);
    const execution = createChatExecution(chats, agent, results, undefined, billing);
    const workspace = createWorkspaceSocket(
      createControllerRepository(),
      execution,
      verify,
      async () => undefined,
      "sandbox",
    );
    let outputTokens = 20_000;
    let useTool = false;
    let terminalStatusOnly = false;
    async function* googleResponse() {
      const interactionId = randomUUID();
      yield {
        event_type: "interaction.created",
        event_id: randomUUID(),
        interaction: { id: interactionId, status: "in_progress" },
      };
      if (useTool) {
        yield {
          event_type: "step.start",
          event_id: randomUUID(),
          index: 0,
          step: { type: "function_call", id: randomUUID(), name: "listDocuments" },
        };
        yield { event_type: "step.stop", event_id: randomUUID(), index: 0 };
      } else {
        yield {
          event_type: "step.delta",
          event_id: randomUUID(),
          index: 0,
          delta: { type: "text", text: "Mirai listo." },
        };
      }
      if (terminalStatusOnly) {
        yield {
          event_type: "interaction.status_update",
          event_id: randomUUID(),
          status: "completed",
        };
        return;
      }
      yield {
        event_type: "interaction.completed",
        event_id: randomUUID(),
        interaction: {
          id: interactionId,
          status: useTool ? "requires_action" : "completed",
          usage: { total_input_tokens: 1_000, total_output_tokens: outputTokens },
        },
      };
    }
    const create = vi.fn(async () => googleResponse());
    const get = vi.fn(async (interactionId: string) => ({
      id: interactionId,
      status: "completed",
      usage: { total_input_tokens: 1_000, total_output_tokens: outputTokens },
    }));
    vi.spyOn(Gemini.prototype, "apiClient", "get").mockReturnValue({
      interactions: { create, get },
    } as unknown as Gemini["apiClient"]);
    const server = app.listen(0, "127.0.0.1");
    workspace.attach(server);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS");
    const url = `http://127.0.0.1:${address.port}/billing`;
    async function webhook(
      event: unknown,
      environment = "sandbox",
      secret = "sandbox_test_secret",
    ) {
      const raw = JSON.stringify(event);
      const ts = Math.floor(Date.now() / 1000);
      const hash = createHmac("sha256", secret).update(`${ts}:${raw}`).digest("hex");
      return originalFetch(`${url}/paddle/${environment}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Paddle-Signature": `ts=${ts};h1=${hash}` },
        body: raw,
      });
    }
    async function buy(capturedAt: Date, chargebackFirst = false) {
      transaction = id("txn");
      const result = await originalFetch(`${url}/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${account}`, "Content-Type": "application/json" },
        body: JSON.stringify({ packageUsd: 10 }),
      });
      expect(result.status).toBe(201);
      const event = {
        event_id: id("evt"),
        occurred_at: new Date().toISOString(),
        event_type: "transaction.completed",
        data: {
          id: transaction,
          status: "completed",
          currency_code: "PEN",
          collection_mode: "automatic",
          custom_data: { mirai_credit_purchase: intent },
          items: [{ price: { id: price, product_id: product, billing_cycle: null }, quantity: 1 }],
          details: {
            totals: {
              currency_code: "PEN",
              grand_total: "4531",
              discount: "0",
              tax: "691",
              fee: "231",
            },
          },
          payments: [{ status: "captured", captured_at: capturedAt.toISOString(), amount: "4531" }],
        },
      };
      if (chargebackFirst) {
        const early = {
          event_id: id("evt"),
          occurred_at: new Date().toISOString(),
          event_type: "adjustment.created",
          data: {
            id: id("adj"),
            transaction_id: transaction,
            action: "chargeback",
            status: "approved",
            type: "full",
            currency_code: "PEN",
            totals: { total: "4531" },
          },
        };
        expect((await webhook(early)).status).toBe(200);
        expect((await webhook(early)).status).toBe(200);
      }
      expect((await webhook(event, "live")).status).toBe(401);
      expect((await webhook(event, "sandbox", "bogus")).status).toBe(401);
      expect(
        (
          await webhook({
            ...event,
            data: { ...event.data, items: [{ ...event.data.items[0], quantity: 2 }] },
          })
        ).status,
      ).toBe(422);
      const copies = await Promise.all([
        webhook(event),
        webhook(event),
        webhook({ ...event, event_id: id("evt") }),
      ]);
      expect(copies.map((copy) => copy.status)).toEqual([200, 200, 200]);
      return event;
    }
    try {
      expect((await originalFetch(url)).status).toBe(401);
      await expect(billing.begin(account, "chat", "gemini-4-hydrogen", "global")).rejects.toThrow(
        "INSUFFICIENT_CREDITS",
      );
      const first = await buy(new Date(Date.now() - 86_400_000));
      await buy(new Date());
      const initial = await wallets.summary(account, "sandbox");
      expect(initial.available).toBe(String(20n * unitsPerUsd));
      expect(initial.topups).toHaveLength(2);
      expect(
        Date.parse(initial.topups[1]!.expiresAt!) - Date.parse(initial.topups[1]!.purchasedAt!),
      ).toBe(2_592_000_000);
      expect((await wallets.summary(account, "live")).available).toBe("0");
      const separate = await originalFetch(url, { headers: { Authorization: `Bearer ${other}` } });
      expect((await separate.json()).available).toBe("0");

      const starts = await Promise.allSettled([
        billing.begin(account, "chat", "gemini-4-hydrogen", "global"),
        billing.begin(account, "cv_extraction", "gemini-4-hydrogen", "global"),
      ]);
      expect(starts.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
      const invoice = starts.find((result) => result.status === "fulfilled")!.value;
      const usage = { input: 0, output: 800_000, thoughts: 0, cached: 0, toolInput: 0 };
      await Promise.all([
        billing.settle(account, invoice, usage),
        billing.settle(account, invoice, usage),
      ]);
      const consumed = await wallets.summary(account, "sandbox");
      expect(consumed.available).toBe(String(8n * unitsPerUsd));
      expect(consumed.topups.map((lot) => lot.remaining)).toEqual([String(8n * unitsPerUsd), "0"]);
      expect(consumed.movements.filter((movement) => movement.kind === "usage")).toHaveLength(1);

      const adjustment = {
        event_id: id("evt"),
        event_type: "adjustment.created",
        occurred_at: new Date().toISOString(),
        data: {
          id: id("adj"),
          transaction_id: first.data.id,
          action: "refund",
          type: "partial",
          status: "pending_approval",
          currency_code: "PEN",
          totals: { total: "2000" },
        },
      };
      expect((await webhook(adjustment)).status).toBe(200);
      const approved = {
        ...adjustment,
        event_id: id("evt"),
        event_type: "adjustment.updated",
        data: { ...adjustment.data, status: "approved" },
      };
      expect((await webhook(approved)).status).toBe(200);
      expect((await webhook({ ...approved, event_id: id("evt") })).status).toBe(200);
      const afterRefund = await wallets.summary(account, "sandbox");
      expect(afterRefund.available).toBe(consumed.available);
      expect(afterRefund.movements.filter((movement) => movement.kind === "refund")).toHaveLength(
        1,
      );

      const drain = await billing.begin(account, "compaction", "gemini-4-hydrogen", "global");
      expect((await billing.settle(account, drain, usage)).available).toBe(0n);
      await expect(billing.begin(account, "chat", "gemini-4-hydrogen", "global")).rejects.toThrow(
        "INSUFFICIENT_CREDITS",
      );
      await buy(new Date(Date.now() - 2_592_000_000));
      await buy(new Date(), true);
      const expired = await wallets.summary(account, "sandbox");
      expect(expired.available).toBe("0");
      expect(expired.movements.filter((movement) => movement.kind === "chargeback")).toHaveLength(
        1,
      );
      expect(expired.movements.filter((movement) => movement.kind === "expiration")).toHaveLength(
        1,
      );
      expect(expired.movements.reduce((sum, movement) => sum + BigInt(movement.amount), 0n)).toBe(
        0n,
      );

      const socket = new WebSocket(`ws://127.0.0.1:${address.port}${workspaceSocketPath}`, {
        origin: "http://localhost:3000",
      });
      const frames: WorkspaceServerFrame[] = [];
      socket.on("message", (message) =>
        frames.push(workspaceServerSchema.parse(JSON.parse(String(message)))),
      );
      await once(socket, "open");
      socket.send(JSON.stringify({ type: "open", token: account }));
      const ready = await vi.waitFor(() => {
        const frame = frames.find((item) => item.type === "control.ready");
        expect(frame).toBeDefined();
        return frame!;
      });
      async function send(
        text: string,
        outcome: "completed" | "rejected" | "exhausted" = "completed",
      ) {
        const requestId = randomUUID();
        const turnId = randomUUID();
        const start = frames.length;
        socket.send(
          JSON.stringify({
            type: "chat.send",
            requestId,
            chatId: chat.id,
            message: {
              id: turnId,
              text,
              instanceId: ready.instanceId,
              locale: "es",
              generation: { model: "gemini-4-hydrogen", effort: "low" },
            },
          }),
        );
        await vi.waitFor(
          () => {
            const events = frames.slice(start);
            if (outcome === "rejected") {
              expect(events).toContainEqual({
                type: "error",
                requestId,
                code: "INSUFFICIENT_CREDITS",
              });
            } else {
              if (outcome === "completed")
                expect(events).toContainEqual({
                  type: "chat.event",
                  chatId: chat.id,
                  event: { type: "completed", turnId },
                });
              expect(events).toContainEqual({
                type: "chat.event",
                chatId: chat.id,
                event: {
                  type: "status",
                  working: false,
                  error: outcome === "exhausted" ? "INSUFFICIENT_CREDITS" : null,
                },
              });
            }
          },
          { timeout: 3_000 },
        );
      }
      await send("Sin crédito", "rejected");
      expect(create).not.toHaveBeenCalled();
      await buy(new Date());
      await send("Responde Mirai listo");
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemini-4-hydrogen",
          generation_config: expect.objectContaining({ thinking_level: "low" }),
        }),
        expect.anything(),
      );
      expect((await wallets.summary(account, "sandbox")).available).toBe("9697000000000");
      outputTokens = 700_000;
      useTool = true;
      await send("Agotamiento antes de consultar documentos", "exhausted");
      expect(readLibrary).not.toHaveBeenCalled();
      expect((await wallets.summary(account, "sandbox")).available).toBe("0");
      await send("Bloqueado tras agotamiento", "rejected");
      await buy(new Date());
      expect(create).toHaveBeenCalledTimes(2);
      outputTokens = 20_000;
      useTool = false;
      terminalStatusOnly = true;
      await send("Continúa");
      const reconciled = await wallets.summary(account, "sandbox");
      expect(create).toHaveBeenCalledTimes(3);
      expect(get).toHaveBeenCalledExactlyOnceWith(
        expect.any(String),
        { stream: false },
        { signal: expect.any(AbortSignal) },
      );
      expect(reconciled.available).toBe("9697000000000");
      expect(
        reconciled.movements.reduce((sum, movement) => sum + BigInt(movement.amount), 0n),
      ).toBe(BigInt(reconciled.available));
    } finally {
      await workspace.close();
      server.close();
      await pool.end();
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    }
  },
  12_000,
);
