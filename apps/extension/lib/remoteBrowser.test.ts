import { afterEach, expect, it, vi } from "vitest";
import { createRemoteBrowser } from "./remoteBrowser";

class TestSocket {
  static readonly OPEN = 1;
  static sockets: TestSocket[] = [];
  readyState = TestSocket.OPEN;
  sent: Array<{ id?: number; method?: string; result?: unknown }> = [];
  onclose?: (event: { code: number }) => void;
  onmessage?: (event: { data: string }) => void;
  constructor() {
    TestSocket.sockets.push(this);
  }
  send(message: string) {
    this.sent.push(JSON.parse(message));
  }
  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

afterEach(() => {
  TestSocket.sockets = [];
  vi.unstubAllGlobals();
});

it("renews a live connection without replay and drops replies after a disconnect", async () => {
  const event = { addListener: vi.fn() };
  const detach = vi.fn();
  let complete!: (value: object) => void;
  const sendCommand = vi.fn(
    () =>
      new Promise<object>((resolve) => {
        complete = resolve;
      }),
  );
  vi.stubGlobal("WebSocket", TestSocket);
  vi.stubGlobal("chrome", {
    debugger: { attach: vi.fn(), detach, sendCommand, onEvent: event, onDetach: event },
    tabs: { create: async () => ({ id: 2 }), onCreated: event, onRemoved: event },
  });
  const lost = vi.fn();
  const remote = createRemoteBrowser(lost);
  const connect = async (renew = false) => {
    const count = TestSocket.sockets.length;
    const opening = remote.connect(1, "owner", "ticket", renew);
    await vi.waitFor(() => expect(TestSocket.sockets.length).toBe(count + 1));
    const socket = TestSocket.sockets.at(-1)!;
    socket.receive({ method: "mirai.connectionReady" });
    await expect(opening).resolves.toBe(true);
    return socket;
  };
  try {
    const first = await connect();
    first.receive({ id: 1, method: "chrome.tabs.create", params: [{}] });
    await vi.waitFor(() => expect(first.sent.some(({ id }) => id === 1)).toBe(true));
    first.receive({ id: 2, method: "chrome.debugger.attach", params: [{ tabId: 2 }] });
    await vi.waitFor(() => expect(first.sent.some(({ id }) => id === 2)).toBe(true));
    first.receive({
      id: 3,
      method: "chrome.debugger.sendCommand",
      params: [{ tabId: 2 }, "Page.getLayoutMetrics"],
    });
    expect(sendCommand).toHaveBeenCalledOnce();
    const replacement = await connect(true);
    complete({ renewed: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(replacement.sent.filter(({ id }) => id === 3)).toEqual([
      { id: 3, result: { renewed: true } },
    ]);
    expect(sendCommand).toHaveBeenCalledOnce();
    expect(detach).not.toHaveBeenCalled();
    replacement.receive({
      id: 4,
      method: "chrome.debugger.sendCommand",
      params: [{ tabId: 2 }, "Page.getLayoutMetrics"],
    });
    replacement.close();
    expect(lost).toHaveBeenCalledWith(1, "owner");
    complete({ late: true });
    const recovered = await connect();
    expect(recovered.sent.some(({ id }) => id === 4)).toBe(false);
    expect(sendCommand).toHaveBeenCalledTimes(2);
  } finally {
    remote.disconnect(1, "owner");
  }
  await vi.waitFor(() => expect(detach).toHaveBeenCalledWith({ tabId: 2 }));
});
