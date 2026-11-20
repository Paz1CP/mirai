import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { Client } from "pg";
import type { createDatabase } from "../../infrastructure/database/client.js";
import { agentRelayMessages } from "./schema.js";

type Listener = (key: string, value: unknown) => void;
const channel = "mirai_agent_relay";

export function createAgentRelay(db: ReturnType<typeof createDatabase>["db"]) {
  const nodeId = randomUUID();
  const listeners = new Map<string, Set<Listener>>();
  const inbound = new Map<string, Promise<unknown>>();
  let connection: Client | undefined;
  let opening: Promise<void> | undefined;
  let closed = false;

  function ready() {
    opening ??= (async () => {
      const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL_DIRECT;
      if (!connectionString || closed) throw new Error("AGENT_RELAY_UNAVAILABLE");
      const client = new Client({
        connectionString,
        connectionTimeoutMillis: 5000,
        keepAlive: true,
      });
      const lost = () => {
        if (connection !== client) return;
        connection = undefined;
        opening = undefined;
        for (const listener of listeners.get("transport-lost") ?? []) listener("", null);
        void client.end().catch(() => {});
        if (!closed) setTimeout(() => void ready().catch(() => {}), 1000).unref();
      };
      client.on("error", lost);
      client.on("end", lost);
      client.on("notification", ({ payload }) => {
        if (!payload) return;
        let decoded: unknown;
        try {
          decoded = JSON.parse(payload);
        } catch {
          return;
        }
        if (
          typeof decoded !== "object" ||
          decoded === null ||
          !("topic" in decoded) ||
          !("key" in decoded) ||
          !("sender" in decoded) ||
          typeof decoded.topic !== "string" ||
          typeof decoded.key !== "string"
        )
          return;
        const { topic, key, id, sender } = decoded as {
          topic: string;
          key: string;
          id?: string;
          sender: string;
        };
        const subscribers = listeners.get(topic);
        if (sender === nodeId || !subscribers?.size || !id) return;
        const route = JSON.stringify([topic, key]);
        const next = (inbound.get(route) ?? Promise.resolve())
          .then(async () => {
            const data = (
              await db
                .select({ value: agentRelayMessages.payload })
                .from(agentRelayMessages)
                .where(eq(agentRelayMessages.id, id))
            )[0]?.value;
            if (data !== undefined) for (const listener of subscribers) listener(key, data);
          })
          .catch(() => console.warn({ event: "agent_relay_receive_failed", topic }))
          .finally(() => {
            if (inbound.get(route) === next) inbound.delete(route);
          });
        inbound.set(route, next);
      });
      try {
        await client.connect();
        await client.query(`LISTEN ${channel}`);
        if (closed) throw new Error("AGENT_RELAY_UNAVAILABLE");
        connection = client;
      } catch (error) {
        opening = undefined;
        await client.end().catch(() => {});
        if (!closed) setTimeout(() => void ready().catch(() => {}), 1000).unref();
        throw error;
      }
    })();
    return opening;
  }

  async function send(topic: string, key: string, value: unknown) {
    for (const listener of listeners.get(topic) ?? []) listener(key, value);
    // LISTEN channels are visible to other database roles. Publish routing data only.
    await db.transaction(async (tx) => {
      const id = randomUUID();
      await tx.insert(agentRelayMessages).values({
        id,
        payload: value,
        expiresAt: new Date(Date.now() + 60_000),
      });
      await tx.execute(
        sql`select pg_notify(${channel}, ${JSON.stringify({ topic, key, sender: nodeId, id })})`,
      );
    });
  }

  function listen(topic: string, listener: Listener) {
    const subscribers = listeners.get(topic) ?? new Set();
    listeners.set(topic, subscribers);
    subscribers.add(listener);
    return () => {
      subscribers.delete(listener);
    };
  }

  async function request<T>(
    topic: string,
    key: string,
    value: unknown,
    signal = AbortSignal.timeout(15_000),
  ) {
    await ready();
    signal.throwIfAborted();
    const id = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const abort = () => finish(signal.reason);
      const forget = listen("response", (key, data) => {
        if (key === id) finish(undefined, data as T);
      });
      function finish(error?: unknown, result?: T) {
        forget();
        signal.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve(result as T);
      }
      signal.addEventListener("abort", abort, { once: true });
      void send(topic, key, { id, value }).catch(finish);
    });
  }

  function handle(topic: string, handler: (key: string, value: unknown) => Promise<unknown>) {
    return listen(topic, (key, data) => {
      const { id, value } = data as { id: string; value: unknown };
      void handler(key, value)
        .then((result) => {
          if (result !== undefined) return send("response", id, result);
        })
        .catch(() => console.warn({ event: "agent_relay_request_failed", topic }));
    });
  }
  const sweep = setInterval(() => {
    void db
      .delete(agentRelayMessages)
      .where(sql`${agentRelayMessages.expiresAt} < now()`)
      .catch(() => console.warn({ event: "agent_relay_cleanup_failed" }));
  }, 60_000).unref();
  return {
    ready,
    send,
    listen,
    handle,
    request,
    async close() {
      closed = true;
      clearInterval(sweep);
      await connection?.end().catch(() => {});
    },
  };
}

export type AgentRelay = ReturnType<typeof createAgentRelay>;
