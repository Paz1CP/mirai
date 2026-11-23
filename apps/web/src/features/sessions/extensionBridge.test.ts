import { EventEmitter } from "node:events";
import {
  extensionReadyFrame,
  extensionRestoreFrame,
  type bridgeRequestSchema,
} from "@mirai/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { openExtensionBridge } from "./extensionBridge";
import type { z } from "zod";

const origin = "https://mirai.example";

function setup() {
  const events = new EventEmitter();
  const sent: z.infer<typeof bridgeRequestSchema>[] = [];
  const page = {
    location: { origin },
    addEventListener: events.on.bind(events),
    removeEventListener: events.off.bind(events),
    postMessage: (message: string) => sent.push(JSON.parse(message)),
  };
  vi.stubGlobal("window", page);
  const onFrame = vi.fn();
  const onReady = vi.fn();
  const onClose = vi.fn();
  const bridge = openExtensionBridge(onFrame, onReady, onClose);
  const id = sent[0]!.bridgeId;
  const reply = (frame: string, bridgeId = id) =>
    events.emit("message", {
      source: page,
      origin,
      data: JSON.stringify({ channel: "mirai:extension", bridgeId, type: "frame", frame }),
    });
  const initialize = () => {
    reply(extensionReadyFrame);
    const probe = sent.at(-1);
    expect(probe).toMatchObject({ type: "frame" });
    if (probe?.type !== "frame") throw new Error("Missing capability probe");
    const command = JSON.parse(probe.frame);
    expect(command).toMatchObject({ method: "extension.workspaceTabs" });
    return command.id;
  };
  return { bridge, initialize, reply, sent, onFrame, onReady, onClose };
}

afterEach(() => vi.unstubAllGlobals());

it("reports an old extension that answers the handshake but cannot list tabs", () => {
  const { bridge, initialize, reply, onFrame, onReady, onClose } = setup();
  const id = initialize();
  reply(JSON.stringify({ id, error: "Unknown Playwright relay command." }));
  expect(onClose).toHaveBeenCalledExactlyOnceWith("incompatible");
  expect(onFrame).not.toHaveBeenCalled();
  expect(onReady).not.toHaveBeenCalled();
  bridge.close();
});

it("validates the bridge at startup and renewal without forwarding probe or stale frames", () => {
  const { bridge, initialize, reply, sent, onFrame, onReady } = setup();
  const mockResponse = (id: number) => JSON.stringify({ id, result: { tabs: [] } });
  const probeId = initialize();
  reply(mockResponse(probeId), crypto.randomUUID());
  expect(onReady).not.toHaveBeenCalled();
  reply(mockResponse(probeId));
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(onFrame).toHaveBeenCalledExactlyOnceWith(extensionReadyFrame);

  bridge.restore();
  expect(sent.at(-1)).toMatchObject({ frame: extensionRestoreFrame });
  bridge.send('{"id":42,"method":"chrome.tabs.create"}');
  expect(sent.at(-1)).toMatchObject({ frame: extensionRestoreFrame });
  reply(mockResponse(42));
  reply(mockResponse(initialize()));
  expect(onReady).toHaveBeenCalledTimes(2);
  expect(onFrame.mock.calls).toEqual([[extensionReadyFrame], [extensionReadyFrame]]);
  bridge.close();
});
