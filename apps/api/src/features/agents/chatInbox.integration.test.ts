import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createEvent, type Event } from "@google/adk";
import type { SendChat } from "@mirai/contracts";
import { expect, it, vi } from "vitest";
import { createDatabase } from "../../infrastructure/database/client.js";
import { BillingError } from "../billing/walletRepository.js";
import { createChatExecution, type ChatOwner } from "./chatExecution.js";
import { createChatInbox } from "./chatInbox.js";
import { ChatTiming } from "./chatTiming.js";

const connectionString = process.env.MIRAI_BILLING_TEST_DATABASE_URL;
const uuid = () => randomUUID();
const message = (text: string): SendChat => ({ id: uuid(), instanceId: uuid(), locale: "en", text });

it.skipIf(!connectionString)(
  "commits admission independently of provider setup and recovers only undispatched messages",
  async () => {
    const first = createDatabase(connectionString!);
    const second = createDatabase(connectionString!);
    const inbox = createChatInbox(first.db);
    const replicaInbox = createChatInbox(second.db);
    const accountId = uuid();
    const control = new AbortController();
    const owner: ChatOwner = {
      accountId,
      signal: control.signal,
      send: vi.fn(),
      browser: async () => undefined,
    };
    const successor = { ...owner, signal: new AbortController().signal };
    const opened = new Map<string, { events: Event[] }>();
    const ensureCredit = vi.fn(async () => { await delay(25); });
    const timings = new Map<string, { sessionReady?: number; runnerReady?: number; firstContent?: number }>();
    const submissions = new Map<string, number>();
    const dispatched: string[] = [];
    const loadSession = vi.fn(async (_account: string, chatId: string) => {
      await delay(30);
      if (!opened.has(chatId)) opened.set(chatId, { events: [] });
      return opened.get(chatId)!;
    });
    const sessions = {
      executionSession: loadSession,
      rememberExecution() {},
      service: {
        async appendEvent({ session, event }: { session: { events: Event[] }; event: Event }) {
          await delay(20);
          session.events.push(event);
          return event;
        },
      },
    } as unknown as Parameters<typeof createChatExecution>[0];
    const run = vi.fn<Parameters<typeof createChatExecution>[1]["run"]>(
      async (scope, _text, _locale, _browser, signal, _boundary, _restart, onEvent) => {
        signal.throwIfAborted();
        const relative = () => performance.now() - submissions.get(scope.commandId)!;
        const started = relative();
        if (scope.chatId === "empty-wallet") throw new BillingError("INSUFFICIENT_CREDITS", 402);
        dispatched.push(scope.commandId);
        await delay(15, undefined, { signal });
        onEvent(createEvent({ author: "mirai", content: { role: "model", parts: [{ text: "Fixture" }] } }));
        timings.set(scope.commandId, {
          runnerReady: started,
          firstContent: relative(),
        });
      },
    );
    const agent = { run, compact: vi.fn(), cancelInteraction: vi.fn() };
    const results = {
      executionActive: async () => false,
      listCampaigns: vi.fn(),
      campaignForChat: vi.fn(),
      transitionCampaign: vi.fn(),
      campaignBudget: vi.fn(),
    };
    vi.stubEnv("DATABASE_URL_UNPOOLED", connectionString!);
    const legacy = createChatExecution(sessions, agent, results, undefined, { ensureCredit });
    const current = createChatExecution(sessions, agent, results, undefined, { ensureCredit }, inbox);
    const replica = createChatExecution(sessions, agent, results, undefined, { ensureCredit }, replicaInbox);
    async function accept(chatId: string, input: SendChat) {
      const started = performance.now();
      submissions.set(input.id, started);
      const receipt = await current.persistMessage(owner, chatId, input, new ChatTiming(input.id));
      return { ...receipt, ackMs: performance.now() - started };
    }
    try {
      await inbox.rememberChats(accountId, ["current", "recovery", "empty-wallet", "stop", "files"]);
      await expect(current.persistMessage({ ...owner, accountId: uuid() }, "current", message("Unauthorized"), new ChatTiming(uuid())))
        .rejects.toThrow("CHAT_NOT_FOUND");
      const previous = message("Old path");
      submissions.set(previous.id, performance.now());
      await legacy.enqueue(owner, "baseline", { kind: "message", message: previous, parts: [] });
      const previousAck = performance.now() - submissions.get(previous.id)!;
      await vi.waitFor(() => expect(timings.has(previous.id)).toBe(true));
      ensureCredit.mockClear();
      loadSession.mockClear();
      const next = message("Current path");
      const accepted = await accept("current", next);
      expect(accepted.inserted).toBe(true);
      expect(ensureCredit).not.toHaveBeenCalled();
      expect(loadSession).not.toHaveBeenCalled();
      expect(await replicaInbox.load(accountId, "current", next.id)).toEqual(next);
      await current.kick(owner, "current");
      await vi.waitFor(() => expect(timings.has(next.id)).toBe(true));
      console.info({
        event: "chat_latency_local_fixture",
        previous: { ackMs: previousAck, ...timings.get(previous.id) },
        current: { ackMs: accepted.ackMs, ...timings.get(next.id) },
      });

      const firstPending = message("First");
      const secondPending = message("Second");
      expect((await accept("recovery", firstPending)).inserted).toBe(true);
      expect((await accept("recovery", secondPending)).inserted).toBe(true);
      expect((await accept("recovery", { ...firstPending, text: "Duplicate" })).inserted).toBe(false);
      expect(await replicaInbox.load(accountId, "recovery", firstPending.id)).toEqual(firstPending);
      expect(await replicaInbox.pendingIds(accountId, "recovery")).toEqual([
        { id: firstPending.id }, { id: secondPending.id },
      ]);

      const invalid = { ...message("Bad file"), attachments: [
        { name: "invalid.png", mimeType: "image/png" as const, data: "AAAA" },
      ] };
      await accept("files", invalid);
      const stopped = message("Canceled before dispatch");
      await accept("stop", stopped);
      await current.stop(owner, "stop");
      const emptyWallet = message("No credits");
      await accept("empty-wallet", emptyWallet);
      control.abort();
      await current.disconnect(owner);
      await replica.recoverMessages(successor);
      await vi.waitFor(() => {
        expect(dispatched).toContain(secondPending.id);
        expect(owner.send).toHaveBeenCalledWith("empty-wallet",
          expect.objectContaining({ working: false, error: "INSUFFICIENT_CREDITS" }));
        expect(owner.send).toHaveBeenCalledWith("files",
          expect.objectContaining({ working: false, error: "INVALID_ATTACHMENT" }));
      });
      expect(dispatched.filter((id) => id === firstPending.id || id === secondPending.id))
        .toEqual([firstPending.id, secondPending.id]);
      expect(dispatched).not.toContain(stopped.id);
      expect(dispatched).not.toContain(invalid.id);
      expect(await replicaInbox.pendingChats(accountId)).toEqual([]);
      expect((await replicaInbox.accept(accountId, "recovery", firstPending))?.inserted).toBe(false);
      await replica.recoverMessages(successor);
      expect(dispatched.filter((id) => id === firstPending.id)).toHaveLength(1);
    } finally {
      await Promise.all([legacy.disconnect(owner), current.disconnect(owner), replica.disconnect(successor)]);
      await Promise.all(["current", "recovery", "empty-wallet", "stop", "files"].map((id) =>
        inbox.removeChat(accountId, id),
      ));
      await Promise.all([first.pool.end(), second.pool.end()]);
      vi.unstubAllEnvs();
    }
  },
  10_000,
);
