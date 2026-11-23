import { afterEach, expect, it, vi } from "vitest";
import { createManagedChats } from "./managedChats.js";

const { getSession, request, getModel } = vi.hoisted(() => ({
  getSession: vi.fn(),
  request: vi.fn(),
  getModel: vi.fn(),
}));

vi.mock("@google/adk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@google/adk")>()),
  VertexAiSessionService: class {
    getSession = getSession;
  },
}));
vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() {
      return { request };
    }
  },
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { get: getModel };
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

it("loads the transcript independently of model metadata and shares only ongoing reads for the same account", async () => {
  vi.stubEnv("GOOGLE_ADK_AGENT_ENGINE", "projects/test/locations/us-central1/reasoningEngines/1");
  vi.stubEnv("GOOGLE_ADK_MODEL", "test-model");
  const chats = createManagedChats()!;
  getSession.mockResolvedValue({ userId: "owner", events: [] });
  getModel.mockReturnValue(new Promise(() => {}));
  request.mockResolvedValue({
    data: {
      sessionEvents: [
        {
          name: "2",
          timestamp: "2026-11-19T10:01:00Z",
          author: "model",
          content: { parts: [{ text: "Hi" }] },
        },
        {
          name: "1",
          timestamp: "2026-11-19T10:00:00Z",
          author: "user",
          content: { parts: [{ text: "Hello" }] },
        },
      ],
      nextPageToken: "older",
    },
  });

  void chats.capacity();
  const [history] = await Promise.all([
    chats.history("owner", "chat"),
    chats.authorizeRead("owner", "chat"),
    chats.authorizeRead("owner", "chat"),
    expect(chats.history("other-account", "chat")).rejects.toMatchObject({ status: 404 }),
  ]);
  expect(history.items.map(({ id }) => id)).toEqual(["1", "2"]);
  expect(history.next).toBe("older");
  expect(history.context.capacity).toBeNull();
  expect(getSession).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenCalledTimes(1);

  await chats.authorizeRead("owner", "chat");
  expect(getSession).toHaveBeenCalledTimes(3);
});

it("reuses a session only while its workspace still owns the execution", async () => {
  vi.stubEnv(
    "GOOGLE_ADK_AGENT_ENGINE",
    "projects/test-project/locations/us-central1/reasoningEngines/123",
  );
  const initial = {
    id: "chat",
    appName: process.env.GOOGLE_ADK_AGENT_ENGINE!,
    userId: "account",
    lastUpdateTime: Date.now(),
    state: {},
    events: [],
  };
  getSession.mockImplementation(async () => ({ ...initial, state: {}, events: [] }));
  const chats = createManagedChats()!;
  const firstWorkspace = new AbortController();
  const first = await chats.executionSession("account", "chat", firstWorkspace.signal);
  first.state.test = "latest task state";
  chats.rememberExecution(first, firstWorkspace.signal);
  await chats.authorizeRead("account", "chat");
  expect(await chats.executionSession("account", "chat", firstWorkspace.signal)).toBe(first);
  expect(getSession).toHaveBeenCalledOnce();

  chats.rememberExecution(first, firstWorkspace.signal);
  const nextWorkspace = new AbortController();
  const next = await chats.executionSession("account", "chat", nextWorkspace.signal);
  expect(next).not.toBe(first);
  expect(getSession).toHaveBeenCalledTimes(2);

  chats.rememberExecution(next, nextWorkspace.signal);
  chats.forgetExecution("account", "chat");
  await expect(chats.executionSession("account", "chat", nextWorkspace.signal)).resolves.not.toBe(
    next,
  );
  expect(getSession).toHaveBeenCalledTimes(3);
});
