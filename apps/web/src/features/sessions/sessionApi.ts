import {
  apiErrorSchema,
  controllerSchema,
  controlEventSchema,
  resultsEventSchema,
  browserLinkSchema,
  type Control,
  type ControlEvent,
  type ConnectRequest,
} from "@mirai/contracts";
import { authClient } from "@/shared/auth/client";

export class SessionError extends Error {
  constructor(
    public readonly code: string,
    public readonly instanceId?: string,
  ) {
    super(code);
  }
}

export async function sessionCommand(path: string, body: unknown, signal?: AbortSignal) {
  const { data, error } = await authClient.token();
  if (error || !data?.token) throw new SessionError("AUTH_REQUIRED");
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:4000"}/v1/${path}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.token}` },
      body: JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(6000)])
        : AbortSignal.timeout(6000),
      cache: "no-store",
    },
  );
  if (response.status === 204) return null;
  const result: unknown = await response.json();
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(result);
    throw new SessionError(
      parsed.success ? parsed.data.error.code : "REQUEST_FAILED",
      parsed.success ? parsed.data.error.instanceId : undefined,
    );
  }
  return result;
}

export const sessionApi = {
  acquire: async (instanceId?: string) =>
    controllerSchema.parse(await sessionCommand("session/acquire", { instanceId })),
  transfer: async (expectedInstanceId: string) =>
    controllerSchema.parse(await sessionCommand("session/transfer", { expectedInstanceId })),
  validate: async (control: Control, signal?: AbortSignal) =>
    controllerSchema.parse(await sessionCommand("session/validate", control, signal)),
  release: (control: Control) => sessionCommand("session/release", control),
  linkBrowser: async (control: Control) =>
    browserLinkSchema.parse(await sessionCommand("browser/connect", control)),
};

export async function watchControl(
  control: ConnectRequest,
  signal: AbortSignal,
  onEvent: (event: ControlEvent | { type: "results.changed" }) => void,
) {
  const { data, error } = await authClient.token();
  if (error || !data?.token) throw new SessionError("AUTH_REQUIRED");
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:4000"}/v1/session/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.token}` },
      body: JSON.stringify(control),
      signal,
      cache: "no-store",
    },
  );
  if (!response.ok || !response.body) {
    const parsed = apiErrorSchema.safeParse(await response.json());
    throw new SessionError(
      parsed.success ? parsed.data.error.code : "REQUEST_FAILED",
      parsed.success ? parsed.data.error.instanceId : undefined,
    );
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += value;
      let boundary;
      while ((boundary = pending.indexOf("\n\n")) >= 0) {
        const frame = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);
        if (frame.startsWith("data: ")) {
          const payload: unknown = JSON.parse(frame.slice(6));
          const results = resultsEventSchema.safeParse(payload);
          onEvent(results.success ? results.data : controlEventSchema.parse(payload));
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
