import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";

type Listener = (key: string, value: unknown) => void;
type Envelope = { topic: string; key: string; value: unknown; expires: number };
type Packet = { chunk: string; done?: () => void; fail: (reason: unknown) => void };
const channel = "mirai_relay_frames";
const chunkSize = 6000;
const maxChunks = 8000;
const lifetime = 15_000;

export function createAgentRelay() {
  const node = randomUUID();
  const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL_DIRECT;
  const secret = process.env.MIRAI_RELAY_KEY ?? connectionString ?? "";
  const key = createHash("sha256").update("mirai-relay-v1\0").update(secret).digest();
  const listeners = new Map<string, Set<Listener>>();
  const fragments = new Map<
    string,
    { parts: string[]; next: number; total: number; expires: number; size: number }
  >();
  const delivered = new Map<string, number>();
  let stagedBytes = 0;
  let pruneAfter = 0;
  let client: Client | undefined;
  let opening: Promise<void> | undefined;
  let closed = false;
  const pending: Packet[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let sending = false;

  function deliver(topic: string, route: string, value: unknown) {
    for (const listener of listeners.get(topic) ?? []) listener(route, value);
  }
  function forgetFragment(route: string) {
    stagedBytes -= fragments.get(route)?.size ?? 0;
    fragments.delete(route);
  }
  function receive(payload: string) {
    const [sender, id, index, total, chunk] = payload.split(":", 5);
    if (!id || !chunk || chunk.length > chunkSize || sender === node) return;
    const part = Number(index);
    const length = Number(total);
    if (
      !Number.isInteger(part) ||
      !Number.isInteger(length) ||
      part < 0 ||
      part >= length ||
      length > maxChunks
    )
      return;
    const route = sender + id;
    const now = Date.now();
    if (now > pruneAfter) {
      for (const [id, packet] of fragments) if (packet.expires < now) forgetFragment(id);
      for (const [id, expires] of delivered) if (expires < now) delivered.delete(id);
      pruneAfter = now + 1000;
    }
    if (part === 0) {
      if (fragments.size >= 64 || delivered.has(route) || fragments.has(route)) return;
      fragments.set(route, { parts: [], total: length, next: 0, expires: now + lifetime, size: 0 });
    }
    const packet = fragments.get(route);
    if (
      !packet ||
      packet.next !== part ||
      packet.total !== length ||
      packet.expires < now ||
      stagedBytes + chunk.length > 64 * 1024 * 1024
    ) {
      forgetFragment(route);
      return;
    }
    packet.parts.push(chunk);
    packet.size += chunk.length;
    stagedBytes += chunk.length;
    if (++packet.next !== length) return;
    forgetFragment(route);
    const bytes = Buffer.from(packet.parts.join(""), "base64");
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
      decipher.setAAD(Buffer.from(route));
      decipher.setAuthTag(bytes.subarray(12, 28));
      const plaintext = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
      const envelope = JSON.parse(plaintext.toString()) as Envelope;
      if (envelope.expires >= Date.now()) {
        delivered.set(route, envelope.expires);
        deliver(envelope.topic, envelope.key, envelope.value);
      }
    } catch {
      console.warn({ event: "agent_relay_invalid_frame" });
    }
  }

  function ready() {
    if (closed) return Promise.reject(new Error("AGENT_RELAY_UNAVAILABLE"));
    opening ??= (async () => {
      if (!connectionString) throw new Error("AGENT_RELAY_UNAVAILABLE");
      const candidate = new Client({
        connectionString,
        connectionTimeoutMillis: 5000,
        keepAlive: true,
      });
      const lost = () => {
        if (client !== candidate) return;
        client = undefined;
        opening = undefined;
        fragments.clear();
        stagedBytes = 0;
        deliver("transport-lost", "", null);
        void candidate.end().catch(() => {});
        if (!closed) setTimeout(() => void ready().catch(() => {}), 1000).unref();
      };
      candidate.on("error", lost);
      candidate.on("end", lost);
      candidate.on("notification", ({ payload }) => {
        if (payload) receive(payload);
      });
      try {
        await candidate.connect();
        await candidate.query(`LISTEN ${channel}`);
        if (closed) throw new Error("AGENT_RELAY_UNAVAILABLE");
        client = candidate;
      } catch (error) {
        opening = undefined;
        await candidate.end().catch(() => {});
        if (!closed) setTimeout(() => void ready().catch(() => {}), 1000).unref();
        throw error;
      }
    })();
    return opening;
  }

  function schedule() {
    if (flushTimer || sending || closed) return;
    flushTimer = setTimeout(() => {
      flushTimer = undefined;
      sending = true;
      void flush();
    }, 8);
  }
  async function flush() {
    try {
      await ready();
      while (pending.length && client) {
        const group = pending.splice(0, 192);
        try {
          await client.query("select pg_notify($1, frame) from unnest($2::text[]) as frame", [
            channel,
            group.map(({ chunk }) => chunk),
          ]);
          for (const packet of group) packet.done?.();
        } catch (error) {
          for (const packet of group) packet.fail(error);
          throw error;
        }
      }
      if (pending.length) throw new Error("AGENT_RELAY_UNAVAILABLE");
    } catch (error) {
      for (const packet of pending.splice(0)) packet.fail(error);
    } finally {
      sending = false;
      if (pending.length) schedule();
    }
  }

  async function send(topic: string, route: string, value: unknown, localOnly = false) {
    deliver(topic, route, value);
    if (localOnly) return;
    if (closed) throw new Error("AGENT_RELAY_UNAVAILABLE");
    const id = randomUUID();
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(Buffer.from(node + id));
    const ciphertext = Buffer.concat([
      cipher.update(
        JSON.stringify({
          topic,
          key: route,
          value,
          expires: Date.now() + lifetime,
        }),
      ),
      cipher.final(),
    ]);
    const encoded = Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64");
    const count = Math.ceil(encoded.length / chunkSize);
    if (count > maxChunks || pending.length + count > maxChunks * 2)
      throw new Error("AGENT_RELAY_CAPACITY");
    return new Promise<void>((resolve, reject) => {
      for (let i = 0; i < count; i++)
        pending.push({
          chunk: `${node}:${id}:${i}:${count}:${encoded.slice(i * chunkSize, (i + 1) * chunkSize)}`,
          done: i === count - 1 ? resolve : undefined,
          fail: reject,
        });
      schedule();
    });
  }
  function listen(topic: string, listener: Listener) {
    const subscribers = listeners.get(topic) ?? new Set<Listener>();
    listeners.set(topic, subscribers);
    subscribers.add(listener);
    return () => {
      subscribers.delete(listener);
    };
  }
  async function request<T>(
    topic: string,
    route: string,
    value: unknown,
    signal = AbortSignal.timeout(lifetime),
  ) {
    await ready();
    signal.throwIfAborted();
    const id = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const forget = listen("response", (route, data) => {
        if (route === id) {
          cleanup();
          resolve(data as T);
        }
      });
      const abort = () => {
        cleanup();
        reject(signal.reason);
      };
      function cleanup() {
        forget();
        signal.removeEventListener("abort", abort);
      }
      signal.addEventListener("abort", abort, { once: true });
      void send(topic, route, { id, value }).catch((error) => {
        cleanup();
        reject(error);
      });
    });
  }
  function handle(topic: string, handler: (route: string, value: unknown) => Promise<unknown>) {
    return listen(topic, (route, data) => {
      const { id, value } = data as { id: string; value: unknown };
      void handler(route, value)
        .then((result) => {
          if (result !== undefined) return send("response", id, result);
        })
        .catch(() => console.warn({ event: "agent_relay_request_failed", topic }));
    });
  }
  return {
    ready,
    send,
    listen,
    request,
    handle,
    async close() {
      closed = true;
      clearTimeout(flushTimer);
      for (const packet of pending.splice(0)) packet.fail(new Error("AGENT_RELAY_UNAVAILABLE"));
      await client?.end().catch(() => {});
    },
  };
}

export type AgentRelay = ReturnType<typeof createAgentRelay>;
