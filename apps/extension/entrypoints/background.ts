import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";
import {
  bridgeRequestSchema,
  controllerSchema,
  extensionCredentialSchema,
  type BridgeResponse,
  type Control,
} from "@mirai/contracts";
import { z } from "zod";

const sessionSchema = z.object({
  control: controllerSchema,
  credential: extensionCredentialSchema,
});
const webOrigin = import.meta.env.WXT_WEB_ORIGIN ?? "http://localhost:3000";
const apiOrigin = import.meta.env.WXT_API_ORIGIN ?? "http://localhost:4000";
const key = (tabId: number) => `controller:${tabId}`;
const sameControl = (a: Control, b: Control) =>
  a.instanceId === b.instanceId && a.epoch === b.epoch;

async function api(path: string, body: unknown, token?: string) {
  const response = await fetch(`${apiOrigin}/v1/devices/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("DEVICE_AUTHORIZATION_FAILED");
  return response.json() as Promise<unknown>;
}

export default defineBackground(() => {
  browser.tabs.onRemoved.addListener((tabId) => {
    void browser.storage.local.remove(key(tabId));
  });
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === "loading") void browser.storage.local.remove(key(tabId));
  });
  browser.runtime.onMessage.addListener(async (data: unknown, sender) => {
    const parsed = bridgeRequestSchema.safeParse(data);
    const tabId = sender.tab?.id;
    if (
      !parsed.success ||
      tabId === undefined ||
      sender.frameId !== 0 ||
      !sender.url ||
      new URL(sender.url).origin !== webOrigin
    )
      return;
    const request = parsed.data;
    const reply = (status: BridgeResponse["status"]): BridgeResponse => ({
      channel: "mirai:extension",
      version: 1,
      requestId: request.requestId,
      status,
    });
    try {
      if (request.type === "link") {
        const saved = await browser.storage.local.get("installationId");
        const installationId = z.uuid().safeParse(saved.installationId).data ?? crypto.randomUUID();
        await browser.storage.local.set({ installationId });
        const credential = extensionCredentialSchema.parse(
          await api("link", { challenge: request.challenge, installationId }),
        );
        const control = controllerSchema.parse(
          await api("verify", { deviceId: credential.deviceId }, credential.token),
        );
        if (!sameControl(control, request.control)) throw new Error("WRONG_CONTROLLER");
        await browser.storage.local.set({ [key(tabId)]: { control, credential } });
        return reply("connected");
      }
      const saved = await browser.storage.local.get(key(tabId));
      const session = sessionSchema.safeParse(saved[key(tabId)]);
      if (!session.success || !sameControl(session.data.control, request.control))
        return reply("disconnected");
      if (request.type === "disconnect") {
        await browser.storage.local.remove(key(tabId));
        return reply("disconnected");
      }
      const control = controllerSchema.parse(
        await api(
          "verify",
          { deviceId: session.data.credential.deviceId },
          session.data.credential.token,
        ),
      );
      if (!sameControl(control, request.control)) throw new Error("STALE_CONTROLLER");
      return reply("connected");
    } catch {
      await browser.storage.local.remove(key(tabId));
      return reply("error");
    }
  });
});
