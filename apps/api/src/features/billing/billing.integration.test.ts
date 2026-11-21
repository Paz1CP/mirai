import { createHmac, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createEvent, Gemini, InMemorySessionService, isCompactedEvent } from "@google/adk";
import { ApiError } from "@google/genai";
import { and, eq, sql } from "drizzle-orm";
import {
  workspaceServerSchema,
  workspaceSocketPath,
  type WorkspaceServerFrame,
} from "@mirai/contracts";
import express from "express";
import { PDFDocument } from "pdf-lib";
import { expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { createDatabase } from "../../infrastructure/database/client.js";
import { createChatExecution } from "../agents/chatExecution.js";
import { createMiraiAgent } from "../agents/miraiAgent.js";
import { createCvRoutes } from "../cvs/routes.js";
import { documentErrors } from "../profiles/documentHttp.js";
import { createProfileExtractor } from "../profiles/extractProfile.js";
import { createControllerRepository } from "../sessions/controllerRepository.js";
import { createWorkspaceSocket } from "../sessions/workspaceSocket.js";
import { createInferenceBilling } from "./inferenceBilling.js";
import { createPaddleBilling } from "./paddleBilling.js";
import { createBillingRoutes } from "./routes.js";
import { ledger, topups } from "./schema.js";
import { BillingError, createWalletRepository, unitsPerUsd } from "./walletRepository.js";

const generateDocument = vi.hoisted(() => vi.fn());
const recoverInteraction = vi.hoisted(() => vi.fn());
vi.mock(import("@google/genai"), async (load) => {
  const sdk = await load();
  return {
    ...sdk,
    GoogleGenAI: class extends sdk.GoogleGenAI {
      constructor(options: ConstructorParameters<typeof sdk.GoogleGenAI>[0]) {
        super(options);
        this.models.generateContent = generateDocument;
        this.interactions.get = recoverInteraction;
      }
    },
  };
});

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
    vi.stubEnv("GOOGLE_CLOUD_LOCATION", "global");
    vi.stubEnv("GOOGLE_GENAI_MODEL", "gemini-4-hydrogen");
    vi.stubEnv("GOOGLE_GENAI_FALLBACK_MODEL", "gemini-4-hydrogen");
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
    app.use("/billing", createBillingRoutes(verify, wallets, paddle, "sandbox", billing));
    const extract = createProfileExtractor(billing);
    app.use(
      "/cvs",
      async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const verified = await verify(req.get("Authorization"));
        if (!verified) {
          res.sendStatus(401);
          return;
        }
        res.locals.accountId = verified;
        next();
      },
      createCvRoutes(
        {} as Parameters<typeof createCvRoutes>[0],
        extract,
        {} as Parameters<typeof createCvRoutes>[2],
        {} as Parameters<typeof createCvRoutes>[3],
      ),
      documentErrors,
    );
    app.use(
      (
        error: unknown,
        _req: express.Request,
        res: express.Response,
        next: express.NextFunction,
      ) => {
        if (!(error instanceof BillingError)) return next(error);
        res.status(error.status).json({ error: { code: error.code } });
      },
    );
    const service = new InMemorySessionService();
    const appName = "mirai";
    const chat = await service.createSession({ appName, userId: account });
    const loadChat = () => service.getSession({ appName, userId: account, sessionId: chat.id });
    let contextCapacity: number | null = null;
    const chats = {
      service,
      appName,
      project: "mirai-integration-test",
      modelName: "gemini-4-hydrogen",
      modelRegion: "global",
      capacity: async () => contextCapacity,
      executionSession: loadChat,
      owned: loadChat,
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
      expect(
        (
          await webhook({
            ...event,
            data: {
              ...event.data,
              items: [
                { ...event.data.items[0], price: { ...event.data.items[0]!.price, id: id("pri") } },
              ],
            },
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
      await expect(
        wallets.withWallet(account, "sandbox", async (wallet) => {
          await wallet.debit(1n);
          throw new Error("interrupted before recording the debit");
        }),
      ).rejects.toThrow("interrupted before recording the debit");
      expect((await wallets.summary(account, "sandbox")).available).toBe(initial.available);
      expect(
        Date.parse(initial.topups[1]!.expiresAt!) - Date.parse(initial.topups[1]!.purchasedAt!),
      ).toBe(2_592_000_000);
      expect((await wallets.summary(account, "live")).available).toBe("0");
      const separate = await originalFetch(url, { headers: { Authorization: `Bearer ${other}` } });
      expect((await separate.json()).available).toBe("0");

      const [invoice, extractionInvoice] = await Promise.all([
        billing.begin(account, "chat", "gemini-4-hydrogen", "global"),
        billing.begin(account, "cv_extraction", "gemini-4-hydrogen", "global"),
      ]);
      const usage = { input: 0, output: 750_000, thoughts: 0, cached: 0, toolInput: 0 };
      await Promise.all([
        billing.settle(account, invoice, usage),
        billing.settle(account, invoice, usage),
        billing.settle(account, extractionInvoice, { ...usage, output: 50_000 }),
      ]);
      const consumed = await wallets.summary(account, "sandbox");
      expect(consumed.available).toBe(String(8n * unitsPerUsd));
      expect(consumed.topups.map((lot) => lot.remaining)).toEqual([String(8n * unitsPerUsd), "0"]);
      expect(consumed.movements.filter((movement) => movement.kind === "usage")).toHaveLength(2);

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
      const rejected = {
        ...adjustment,
        event_id: id("evt"),
        event_type: "adjustment.updated",
        data: { ...adjustment.data, id: id("adj"), status: "rejected" },
      };
      expect((await webhook(rejected)).status).toBe(200);
      expect((await wallets.summary(account, "sandbox")).available).toBe(consumed.available);
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

      const firstDrain = await billing.begin(account, "compaction", "gemini-4-hydrogen", "global");
      const secondDrain = await billing.begin(account, "chat", "gemini-4-hydrogen", "global");
      const drained = await Promise.all([
        billing.settle(account, firstDrain, usage),
        billing.settle(account, secondDrain, usage),
      ]);
      expect(drained.map(({ available }) => available)).toEqual([0n, 0n]);
      const drainKeys = [`settled:${firstDrain.id}`, `settled:${secondDrain.id}`];
      expect(
        (await wallets.summary(account, "sandbox")).movements
          .filter(({ id }) => drainKeys.includes(id))
          .map(({ amount }) => BigInt(amount))
          .sort(),
      ).toEqual([-8n * unitsPerUsd, 0n]);
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
      expect((await wallets.summary(account, "sandbox")).movements).toEqual(expired.movements);
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

      const pdf = await PDFDocument.create();
      pdf.addPage().drawText("Ana Ejemplo. Ingeniera de software.");
      const document = await pdf.save();
      const extractUrl = `http://127.0.0.1:${address.port}/cvs/import/extract`;
      function scanFile(
        bytes: Uint8Array<ArrayBuffer> = new Uint8Array(document),
        signal?: AbortSignal,
      ) {
        const form = new FormData();
        form.set("language", "ES");
        form.set("document", new Blob([bytes], { type: "application/pdf" }), "cv-prueba.pdf");
        return originalFetch(extractUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${account}` },
          body: form,
          signal,
        });
      }
      const documentUsage = { promptTokenCount: 1000, candidatesTokenCount: 20 };
      const validExtraction = {
        text: JSON.stringify({ profile: { personal: { full_name: "Ana Ejemplo" } } }),
        usageMetadata: documentUsage,
      };
      const generationCost = 3_300_000_000n;
      let balance = BigInt(reconciled.available);
      const expectBalance = async () =>
        expect(BigInt((await wallets.summary(account, "sandbox")).available)).toBe(balance);

      expect((await scanFile(new TextEncoder().encode("%PDF-corrupto"))).status).toBe(422);
      expect(generateDocument).not.toHaveBeenCalled();
      await expectBalance();

      generateDocument.mockResolvedValueOnce(validExtraction);
      const extraction = await scanFile();
      expect(extraction.status).toBe(200);
      expect(await extraction.json()).toMatchObject({
        profile: { personal: { full_name: "Ana Ejemplo" } },
      });
      balance -= generationCost;
      await expectBalance();

      generateDocument.mockRejectedValueOnce(
        new ApiError({ status: 429, message: "rate limited" }),
      );
      generateDocument.mockResolvedValueOnce(validExtraction);
      expect((await scanFile()).status).toBe(200);
      expect(generateDocument).toHaveBeenCalledTimes(3);
      balance -= generationCost;
      await expectBalance();

      generateDocument.mockResolvedValueOnce({ ...validExtraction, text: "respuesta inválida" });
      const invalidExtraction = await scanFile();
      expect(invalidExtraction.status).toBe(422);
      expect(await invalidExtraction.json()).toEqual({ error: { code: "INVALID_EXTRACTION" } });
      balance -= generationCost;
      await expectBalance();

      await expect(extract(account, [], AbortSignal.abort())).rejects.toMatchObject({
        name: "AbortError",
      });
      expect(generateDocument).toHaveBeenCalledTimes(4);
      expect(generateDocument.mock.calls.map(([params]) => params.model)).toEqual(
        Array(4).fill("gemini-4-hydrogen"),
      );
      await expectBalance();

      const beforeDispatch = new AbortController();
      const realAuthorize = wallets.withWallet;
      const authorize = vi.spyOn(wallets, "withWallet");
      authorize.mockImplementationOnce((...args) => {
        beforeDispatch.abort();
        return realAuthorize.apply(wallets, args);
      });
      const canceledGenerate = vi.fn();
      await expect(
        billing.generate(
          account,
          "cv_extraction",
          "gemini-4-hydrogen",
          "global",
          canceledGenerate,
          () => undefined,
          beforeDispatch.signal,
        ),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(canceledGenerate).not.toHaveBeenCalled();
      authorize.mockRestore();
      await expectBalance();

      const clientAbort = new AbortController();
      let finishCanceledExtraction!: (response: typeof validExtraction) => void;
      generateDocument.mockReturnValueOnce(
        new Promise<typeof validExtraction>((resolve) => {
          finishCanceledExtraction = resolve;
        }),
      );
      const canceledRequest = scanFile(undefined, clientAbort.signal);
      const clientError = expect(canceledRequest).rejects.toMatchObject({ name: "AbortError" });
      await vi.waitFor(() => expect(generateDocument).toHaveBeenCalledTimes(5));
      const providerSignal = generateDocument.mock.lastCall![0].config.abortSignal as AbortSignal;
      clientAbort.abort();
      await clientError;
      await vi.waitFor(() => expect(providerSignal.aborted).toBe(true));
      finishCanceledExtraction(validExtraction);
      balance -= generationCost;
      await vi.waitFor(expectBalance);

      async function addHistory() {
        const loaded = (await loadChat())!;
        for (let index = 0; index < 4; index++) {
          for (const author of ["user", "mirai"]) {
            await service.appendEvent({
              session: loaded,
              event: createEvent({
                author,
                content: {
                  role: author === "user" ? "user" : "model",
                  parts: [{ text: `Historial ${index}` }],
                },
                usageMetadata: documentUsage,
              }),
            });
          }
        }
      }
      await addHistory();
      const summarize = vi.fn(async function* () {
        yield {
          content: { role: "model", parts: [{ text: "Resumen de prueba" }] },
          usageMetadata: documentUsage,
        };
      });
      const baseGenerate = Gemini.prototype.generateContentAsync;
      vi.spyOn(Gemini.prototype, "generateContentAsync").mockImplementation(function (
        this: Gemini,
        request,
        stream,
        signal,
      ) {
        return stream ? baseGenerate.call(this, request, stream, signal) : summarize();
      });
      const start = frames.length;
      socket.send(
        JSON.stringify({
          type: "chat.action",
          requestId: randomUUID(),
          chatId: chat.id,
          action: "compact",
          locale: "es",
        }),
      );
      await vi.waitFor(() => {
        expect(frames.slice(start)).toContainEqual({
          type: "chat.event",
          chatId: chat.id,
          event: { type: "status", working: false, error: null },
        });
      });
      expect(summarize).toHaveBeenCalledTimes(1);
      expect((await loadChat())!.events.some(isCompactedEvent)).toBe(true);
      balance -= generationCost;
      await expectBalance();

      contextCapacity = 300;
      await addHistory();
      await send("Mantén la conversación");
      balance -= 303_000_000_000n + generationCost;
      expect(summarize).toHaveBeenCalledTimes(2);
      await expectBalance();

      const incomplete = await billing.begin(account, "chat", "gemini-4-hydrogen", "global");
      const providerId = randomUUID();
      await billing.rememberProviderId(account, incomplete.id, providerId);
      const readBalance = () =>
        originalFetch(url, { headers: { Authorization: `Bearer ${account}` } });
      recoverInteraction.mockResolvedValueOnce({ id: providerId, status: "failed" });
      expect((await (await readBalance()).json()).available).toBe(String(balance));
      const reconciliationCalls = recoverInteraction.mock.calls.length;
      const next = await billing.begin(account, "chat", "gemini-4-hydrogen", "global");
      expect(next.id).not.toBe(incomplete.id);
      expect(recoverInteraction).toHaveBeenCalledTimes(reconciliationCalls);
      await billing.releaseRejected(account, next, 429);

      const closedWithoutUsage = () =>
        wallets.withWallet(account, "sandbox", (wallet) =>
          wallet.tx
            .select({ key: ledger.key })
            .from(ledger)
            .where(
              and(
                wallet.ledgerScope,
                eq(ledger.kind, "inference_released"),
                eq(sql`${ledger.details}->>'reason'`, "usage_unavailable"),
              ),
            ),
        );
      const previousClosures = (await closedWithoutUsage()).length;
      generateDocument.mockRejectedValueOnce(new ApiError({ status: 503, message: "Unavailable" }));
      generateDocument.mockResolvedValueOnce(validExtraction);
      expect((await scanFile()).status).toBe(200);
      balance -= generationCost;
      await expectBalance();
      const canceled = new AbortController();
      const failedCompactions = [
        { call: async () => undefined, error: { code: "AI_UNAVAILABLE", status: 502 } },
        {
          call: () => Promise.reject(new TypeError("connection lost")),
          error: { name: "TypeError" },
        },
        {
          call: async () => {
            canceled.abort();
            canceled.signal.throwIfAborted();
          },
          error: { name: "AbortError" },
          signal: canceled.signal,
        },
      ];
      for (const { call, error, signal } of failedCompactions) {
        await expect(
          billing.generate(
            account,
            "compaction",
            "gemini-4-hydrogen",
            "global",
            call,
            () => undefined,
            signal,
          ),
        ).rejects.toMatchObject(error);
        await expectBalance();
      }
      expect(await closedWithoutUsage()).toHaveLength(previousClosures + 4);
      await expect(
        billing.begin(account, "cv_extraction", "gemini-4-hydrogen", "global"),
      ).rejects.toMatchObject({ code: "BILLING_INFERENCES_BUSY" });
      await db
        .update(ledger)
        .set({ at: new Date(Date.now() - 6 * 60_000) })
        .where(
          and(
            eq(ledger.accountId, account),
            eq(ledger.environment, "sandbox"),
            eq(ledger.kind, "inference_released"),
            eq(sql`${ledger.details}->>'providerMayBeRunning'`, "true"),
          ),
        );

      const orphan = await billing.begin(account, "cv_extraction", "gemini-4-hydrogen", "global");
      await db
        .update(ledger)
        .set({ at: new Date(Date.now() - 8 * 86_400_000) })
        .where(
          and(
            eq(ledger.accountId, account),
            eq(ledger.environment, "sandbox"),
            eq(ledger.key, orphan.id),
          ),
        );

      recoverInteraction.mockResolvedValueOnce({
        id: "wrong-interaction",
        status: "failed",
        usage: { total_input_tokens: 1000, total_output_tokens: 20 },
      });
      expect((await (await readBalance()).json()).available).toBe(String(balance));
      expect(await closedWithoutUsage()).toContainEqual({ key: `settled:${orphan.id}` });

      const recovered = {
        id: providerId,
        status: "failed",
        usage: { total_input_tokens: 1000, total_output_tokens: 20 },
      };
      recoverInteraction.mockResolvedValueOnce(recovered).mockResolvedValueOnce(recovered);
      const reads = await Promise.all([readBalance(), readBalance()]);
      balance -= generationCost;
      for (const result of reads) expect((await result.json()).available).toBe(String(balance));
      await billing.settle(
        account,
        incomplete,
        {
          input: 1000,
          output: 20,
          cached: 0,
          thoughts: 0,
          toolInput: 0,
        },
        providerId,
      );
      await expectBalance();
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

pgTest(
  "caps concurrent inference admission across connections and respects low balances",
  async () => {
    const first = createDatabase(connectionString!);
    const second = createDatabase(connectionString!);
    const wallets = createWalletRepository(first.db);
    const primary = createInferenceBilling(wallets, "sandbox");
    const replica = createInferenceBilling(createWalletRepository(second.db), "sandbox");
    const funded = randomUUID();
    const low = randomUUID();
    const credit = unitsPerUsd / 100n;
    const busy = { code: "BILLING_INFERENCES_BUSY", status: 409 };
    const model = "gemini-4-hydrogen";
    const region = "global";
    async function seed(accountId: string, remaining: bigint) {
      await wallets.withWallet(accountId, "sandbox", async (wallet) => {
        await wallet.tx.insert(topups).values({
          accountId,
          environment: "sandbox",
          packageUsd: 10,
          nominal: 10n * unitsPerUsd,
          remaining,
          transactionId: id("txn"),
          priceId: id("pri"),
          productId: id("pro"),
          purchasedAt: wallet.now,
          expiresAt: new Date(wallet.now.getTime() + 30 * 86_400_000),
        });
      });
    }
    try {
      await seed(funded, 10n * unitsPerUsd);
      await seed(low, credit);
      const operations = ["chat", "compaction", "cv_extraction"] as const;
      const start = (accountId: string) =>
        Promise.allSettled(
          Array.from({ length: 50 }, (_, index) =>
            (index % 2 ? replica : primary).begin(
              accountId,
              operations[index % operations.length]!,
              model,
              region,
            ),
          ),
        );
      for (const [accountId, limit] of [
        [funded, 3],
        [low, 1],
      ] as const) {
        const attempts = await start(accountId);
        const admitted = attempts.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        expect(admitted).toHaveLength(limit);
        expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(50 - limit);
        for (const result of attempts)
          if (result.status === "rejected") expect(result.reason).toMatchObject(busy);
        const provider = vi.fn();
        await expect(
          replica.generate(accountId, "cv_extraction", model, region, provider, () => undefined),
        ).rejects.toMatchObject(busy);
        expect(provider).not.toHaveBeenCalled();
        expect((await wallets.summary(accountId, "sandbox")).available).toBe(
          String(accountId === low ? credit : 10n * unitsPerUsd),
        );
        await primary.releaseRejected(accountId, admitted[0]!, 429);
        const next = await replica.begin(accountId, "chat", model, region);
        await primary.closeUnverified(accountId, next.id, true);
        await expect(replica.begin(accountId, "compaction", model, region)).rejects.toMatchObject(
          busy,
        );
      }
    } finally {
      await Promise.all([first.pool.end(), second.pool.end()]);
    }
  },
  12_000,
);
