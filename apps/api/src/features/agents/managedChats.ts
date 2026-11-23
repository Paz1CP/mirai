import { createEvent, VertexAiSessionService, type Session } from "@google/adk";
import { GoogleAuth } from "google-auth-library";
import { GoogleGenAI } from "@google/genai";
import { chatModelSchema } from "@mirai/contracts";
import { z } from "zod";
import { fromProviderEvent, providerEventSchema } from "./chatEvents.js";
import type { createChatInbox } from "./chatInbox.js";

export class ChatError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message = code,
  ) {
    super(message);
  }
}

const pageSchema = z.object({
  sessionEvents: providerEventSchema.array().default([]),
  nextPageToken: z.string().optional(),
});
const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

export function createManagedChats(inbox?: ReturnType<typeof createChatInbox>) {
  const resource = process.env.GOOGLE_ADK_AGENT_ENGINE?.match(
    /^projects\/([a-zA-Z0-9_-]+)\/locations\/([a-zA-Z0-9-]+)\/reasoningEngines\/(\d+)$/,
  );
  if (!resource?.[1] || !resource[2] || !resource[3]) return;
  const [, project, region, engine] = resource;
  const modelName =
    process.env.GOOGLE_ADK_MODEL ?? process.env.GOOGLE_GENAI_MODEL ?? "gemini-4-hydrogen";
  const modelRegion = process.env.GOOGLE_CLOUD_LOCATION ?? "global";
  const service = new VertexAiSessionService({
    projectId: project,
    location: region,
    agentEngineId: engine,
  });
  const client = new GoogleGenAI({ enterprise: true, project, location: modelRegion });
  const appName = resource[0];
  const retention = process.env.GOOGLE_ADK_SESSION_TTL ?? "7776000s";
  // Both chat models have a documented 1,048,576 token context window.
  let knownCapacity = chatModelSchema.safeParse(modelName).success ? 1_048_576 : null;
  let capacityRequest: Promise<number | null> | undefined;
  function capacity(model = modelName) {
    if (model !== modelName && chatModelSchema.safeParse(model).success)
      return Promise.resolve(1_048_576);
    if (knownCapacity !== null) return Promise.resolve(knownCapacity);
    capacityRequest ??= client.models.get({ model: modelName }).then(
      ({ inputTokenLimit }) => (knownCapacity = inputTokenLimit ?? null),
      () => {
        capacityRequest = undefined;
        return null;
      },
    );
    return capacityRequest;
  }
  function summary(session: {
    id: string;
    state: Record<string, unknown>;
    lastUpdateTime: number;
  }) {
    return {
      id: session.id,
      title: typeof session.state.title === "string" ? session.state.title : session.id,
      updatedAt: new Date(session.lastUpdateTime).toISOString(),
    };
  }
  async function owned(userId: string, sessionId: string, withEvents = false, afterTimestamp?: number) {
    const session = await service
      .getSession({
        appName,
        userId,
        sessionId,
        config: withEvents ? (afterTimestamp ? { afterTimestamp } : undefined) : { numRecentEvents: 0 },
      })
      .catch((error: unknown) => {
        if (
          error instanceof Error &&
          error.message.startsWith(`Session ${sessionId} does not belong to user `)
        )
          return undefined;
        throw error;
      });
    if (!session || session.userId !== userId) throw new ChatError("CHAT_NOT_FOUND", 404);
    for (const event of session.events) {
      const link = event.customMetadata?.miraiInteractionId;
      if (!event.interactionId && typeof link === "string") event.interactionId = link;
    }
    return session;
  }

  const executionSessions = new Map<string, Session>();
  // Called after the execution lock is acquired. Overlap the newest timestamps so Google
  // replaces local IDs and events appended at the same instant are not lost.
  async function executionSession(userId: string, id: string) {
    const key = JSON.stringify([userId, id]);
    const cached = executionSessions.get(key);
    executionSessions.delete(key);
    const newest = cached?.events.at(-1)?.timestamp;
    if (!cached || !newest) return owned(userId, id, true);
    const from = newest - 2000;
    const fresh = await owned(userId, id, true, from);
    if (!fresh.events.some((event) => event.timestamp === newest)) return owned(userId, id, true);
    fresh.events = [...cached.events.filter((event) => event.timestamp < from), ...fresh.events];
    return fresh;
  }

  function rememberExecution(session?: Session) {
    if (!session || session.events.length > 240) return;
    let size = 0;
    for (const event of session.events) {
      size += JSON.stringify(event).length;
      if (size > 1_000_000) return;
    }
    executionSessions.set(JSON.stringify([session.userId, session.id]), session);
    if (executionSessions.size > 12) executionSessions.delete(executionSessions.keys().next().value!);
  }

  const pendingOwnership = new Map<string, Promise<void>>();
  function authorizeRead(userId: string, id: string) {
    const key = JSON.stringify([userId, id]);
    const pending = pendingOwnership.get(key);
    if (pending) return pending;
    const check = owned(userId, id)
      .then(async () => inbox?.rememberChats(userId, [id]))
      .finally(() => pendingOwnership.delete(key));
    pendingOwnership.set(key, check);
    return check;
  }

  async function history(userId: string, id: string, cursor?: string) {
    const [, access, queued] = await Promise.all([
      authorizeRead(userId, id),
      auth.getClient(),
      cursor ? undefined : inbox?.visible(userId, id),
    ]);
    const url = new URL(
      `https://${region}-aiplatform.googleapis.com/v1/${appName}/sessions/${id}/events`,
    );
    url.searchParams.set("pageSize", "24");
    url.searchParams.set("orderBy", "timestamp desc");
    if (cursor) url.searchParams.set("pageToken", cursor);
    const response = await access.request<unknown>({ url: url.href, timeout: 12000 });
    const page = pageSchema.parse(response.data);
    const events = page.sessionEvents.map(fromProviderEvent);
    const used = events.find((event) => event.used !== null || event.compacted)?.used ?? null;
    const error = queued?.at(-1)?.error ?? events.find((event) => event.history || event.error)?.error;
    const items = events.reverse().flatMap(({ history: event }) => (event ? [event] : []));
    const persisted = new Set(items.map(({ id }) => id));
    return {
      items: [...items, ...(queued?.flatMap(({ event }) =>
        event && !persisted.has(event.id) ? [event] : [],
      ) ?? [])],
      next: page.nextPageToken ?? null,
      context: { used, capacity: knownCapacity },
      error,
    };
  }
  return {
    appName,
    service,
    modelName,
    modelRegion,
    project,
    capacity,
    owned,
    executionSession,
    rememberExecution,
    authorizeRead,
    history,
    async list(userId: string) {
      const { sessions } = await service.listSessions({ appName, userId });
      const owned = sessions.filter((session) => session.userId === userId).map(summary);
      await inbox?.rememberChats(userId, owned.map(({ id }) => id));
      return owned;
    },
    async create(userId: string, title: string) {
      const chat = summary(
        await service.createSession({ appName, userId, state: { title }, ttl: retention }),
      );
      await inbox?.rememberChats(userId, [chat.id]);
      return chat;
    },
    async rename(userId: string, sessionId: string, title: string) {
      const session = await owned(userId, sessionId);
      await service.appendEvent({
        session,
        event: createEvent({ author: "mirai_control", actions: { stateDelta: { title } } }),
      });
    },
    async remove(userId: string, sessionId: string) {
      await owned(userId, sessionId);
      await service.deleteSession({ appName, userId, sessionId });
      await inbox?.removeChat(userId, sessionId);
      executionSessions.delete(JSON.stringify([userId, sessionId]));
    },
  };
}

export type ManagedChats = NonNullable<ReturnType<typeof createManagedChats>>;
