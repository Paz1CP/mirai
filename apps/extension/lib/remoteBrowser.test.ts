import { extensionReadyFrame, extensionRestoreFrame } from "@mirai/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { connectRemoteBrowser } from "./remoteBrowser";

afterEach(() => vi.unstubAllGlobals());

it("correlates commands on the local port and drops pending replies on disconnect", async () => {
  const event = { addListener: vi.fn(), removeListener: vi.fn() };
  const detach = vi.fn();
  const { promise, resolve } = Promise.withResolvers<object>();
  const sendCommand = vi.fn(() => promise);
  const port = {
    onMessage: { addListener: vi.fn() },
    onDisconnect: { addListener: vi.fn() },
    postMessage: vi.fn(),
    disconnect: vi.fn(),
  };
  vi.stubGlobal("chrome", {
    debugger: { attach: vi.fn(), detach, sendCommand, onEvent: event, onDetach: event },
    tabs: { create: async () => ({ id: 2 }), onCreated: event, onRemoved: event },
  });
  connectRemoteBrowser(port as unknown as chrome.runtime.Port, 1);
  expect(port.postMessage).toHaveBeenCalledWith(extensionReadyFrame);
  const receive = port.onMessage.addListener.mock.calls[0]![0];
  receive(JSON.stringify({ id: 10, method: "chrome.tabs.create", params: [{}] }));
  await vi.waitFor(() =>
    expect(port.postMessage).toHaveBeenCalledWith('{"id":10,"result":{"id":2}}'),
  );
  receive(JSON.stringify({ id: 11, method: "chrome.debugger.attach", params: [{ tabId: 2 }] }));
  await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledWith('{"id":11}'));
  receive(extensionRestoreFrame);
  expect(port.postMessage).toHaveBeenLastCalledWith(
    '{"method":"extension.initialized","params":[2]}',
  );
  const pending = {
    id: 12,
    method: "chrome.debugger.sendCommand",
    params: [{ tabId: 2 }, "Page.getLayoutMetrics"],
  };
  receive(JSON.stringify(pending));
  expect(sendCommand).toHaveBeenCalledOnce();
  port.onDisconnect.addListener.mock.calls[0]![0]();
  expect(detach).toHaveBeenCalledWith({ tabId: 2 });
  resolve({ late: true });
  receive(JSON.stringify({ ...pending, id: 13 }));
  await promise;
  expect(port.postMessage).toHaveBeenCalledTimes(4);
  expect(sendCommand).toHaveBeenCalledOnce();
});
