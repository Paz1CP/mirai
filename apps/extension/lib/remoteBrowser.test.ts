import { afterEach, expect, it, vi } from "vitest";
import { connectRemoteBrowser } from "./remoteBrowser";

type Port = Parameters<typeof connectRemoteBrowser>[0];

function event() {
  return {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(),
    hasListeners: vi.fn(),
    addRules: vi.fn(),
    getRules: vi.fn(),
    removeRules: vi.fn(),
  };
}

function openPort(controllerTabId: number) {
  const onMessage = event();
  const onDisconnect = event();
  let respond: (message: unknown) => void = () => {};
  const port: Port = {
    onMessage,
    onDisconnect,
    postMessage(message: string) {
      const frame = JSON.parse(message);
      if (frame.id === 1) respond(frame);
    },
    disconnect: vi.fn(),
  };
  connectRemoteBrowser(port, controllerTabId);
  return {
    attach(tabId: number) {
      return new Promise((resolve) => {
        respond = resolve;
        onMessage.addListener.mock.calls[0]![0](
          JSON.stringify({ id: 1, method: "chrome.debugger.attach", params: [{ tabId }] }),
        );
      });
    },
    close: () => onDisconnect.addListener.mock.calls[0]![0](),
  };
}

afterEach(() => vi.unstubAllGlobals());

it("reclaims an orphan debugger and lets a live port finish detaching before another takes over", async () => {
  let finishDetach = () => {};
  const attach = vi
    .fn()
    .mockRejectedValueOnce(new Error("Another debugger is already attached to the tab with id: 9."))
    .mockResolvedValue(undefined);
  const detach = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishDetach = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  vi.stubGlobal("chrome", {
    debugger: { attach, detach, onEvent: event(), onDetach: event() },
    tabs: { onCreated: event(), onUpdated: event(), onRemoved: event(), onReplaced: event() },
  });
  const first = openPort(3);
  const next = openPort(4);
  await expect(first.attach(9)).resolves.toEqual({ id: 1 });
  expect(detach).toHaveBeenCalledExactlyOnceWith({ tabId: 9 });
  await expect(next.attach(9)).resolves.toMatchObject({ error: /Another Mirai connection/ });
  expect(detach).toHaveBeenCalledTimes(1);

  first.close();
  const handoff = next.attach(9);
  await vi.waitFor(() => expect(detach).toHaveBeenCalledTimes(2));
  expect(attach).toHaveBeenCalledTimes(2);
  finishDetach();
  await expect(handoff).resolves.toEqual({ id: 1 });
  expect(attach).toHaveBeenCalledTimes(3);
  next.close();
  await vi.waitFor(() => expect(detach).toHaveBeenCalledTimes(3));
});

it("drops a cancelled selection before it can overwrite the current tab", async () => {
  const lookup = Promise.withResolvers<object>();
  vi.stubGlobal("chrome", {
    debugger: { onEvent: event(), onDetach: event() },
    tabs: {
      get: vi.fn(() => lookup.promise),
      query: vi.fn().mockResolvedValue([]),
      onCreated: event(),
      onUpdated: event(),
      onRemoved: event(),
      onReplaced: event(),
    },
  });
  const port = {
    onMessage: event(),
    onDisconnect: event(),
    postMessage: vi.fn(),
    disconnect: vi.fn(),
  };
  connectRemoteBrowser(port, 1);
  const receive = port.onMessage.addListener.mock.calls[0]![0];
  receive(JSON.stringify({ id: 3, method: "extension.selectTab", params: [9] }));
  receive(JSON.stringify({ method: "extension.cancel", params: [3] }));
  lookup.resolve({ id: 9 });
  await lookup.promise;
  receive(JSON.stringify({ id: 4, method: "extension.workspaceTabs", params: [] }));
  await vi.waitFor(() =>
    expect(port.postMessage).toHaveBeenLastCalledWith('{"id":4,"result":{"tabs":[]}}'),
  );
  expect(port.postMessage).toHaveBeenCalledTimes(2);
  port.onDisconnect.addListener.mock.calls[0]![0]();
});
