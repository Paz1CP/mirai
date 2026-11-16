import {
  apiErrorSchema,
  controllerSchema,
  challengeResponseSchema,
  type Control,
} from "@mirai/contracts";
import { authClient } from "@/shared/auth/client";

export class SessionError extends Error {
  constructor(
    public readonly code: string,
    public readonly epoch?: string,
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
      parsed.success ? parsed.data.error.epoch : undefined,
    );
  }
  return result;
}

export const sessionApi = {
  acquire: async (instanceId: string) =>
    controllerSchema.parse(await sessionCommand("session/acquire", { instanceId })),
  transfer: async (instanceId: string, expectedEpoch: string) =>
    controllerSchema.parse(await sessionCommand("session/transfer", { instanceId, expectedEpoch })),
  heartbeat: async ({ instanceId, epoch }: Control, signal?: AbortSignal) =>
    controllerSchema.parse(
      await sessionCommand("session/heartbeat", { instanceId, epoch }, signal),
    ),
  release: ({ instanceId, epoch }: Control) =>
    sessionCommand("session/release", { instanceId, epoch }),
  challenge: async ({ instanceId, epoch }: Control) =>
    challengeResponseSchema.parse(
      await sessionCommand("devices/link-challenge", { instanceId, epoch }),
    ),
};
