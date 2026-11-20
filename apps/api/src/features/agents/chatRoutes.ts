import { Router, type NextFunction, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import {
  chatIdSchema,
  controlSchema,
  createChatSchema,
  sendChatSchema,
  type ChatStream,
} from "@mirai/contracts";
import type { createChatExecution } from "./chatExecution.js";
import { ChatError, type ManagedChats } from "./managedChats.js";
import { prepareChatAttachments } from "./chatAttachments.js";
import { ChatTiming } from "./chatTiming.js";

export function createChatRoutes(
  chats: ManagedChats | undefined,
  execution: ReturnType<typeof createChatExecution> | undefined,
  verifyIdentity: (header?: string) => Promise<string | null>,
) {
  const router = Router();
  if (!chats || !execution) {
    router.use((_req, res) => {
      res.status(503).json({ error: { code: "AGENT_NOT_CONFIGURED" } });
    });
    return router;
  }
  router.use(async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const accountId = await verifyIdentity(req.headers.authorization);
    if (!accountId) return res.status(401).json({ error: { code: "AUTH_REQUIRED" } });
    res.locals.accountId = accountId;
    return next();
  });
  router.get("/", async (_req, res) => res.json(await chats.list(res.locals.accountId)));
  router.post("/", async (req, res) => {
    const input = createChatSchema.parse(req.body);
    res.status(201).json(await chats.create(res.locals.accountId, input.title));
  });
  router.get("/:id/history", async (req, res) => {
    const id = chatIdSchema.parse(req.params.id);
    const cursor = z.string().max(4096).optional().parse(req.query.cursor);
    res.json(await chats.history(res.locals.accountId, id, cursor));
  });
  router.get("/:id/status", async (req, res) => {
    const id = chatIdSchema.parse(req.params.id);
    const accountId: string = res.locals.accountId;
    await chats.authorizeRead(accountId, id);
    res.json(await execution.status(accountId, id));
  });
  router.patch("/:id", async (req, res) => {
    const id = chatIdSchema.parse(req.params.id);
    const { title } = createChatSchema.parse(req.body);
    await chats.rename(res.locals.accountId, id, title);
    res.status(204).end();
  });
  router.delete("/:id", async (req, res) => {
    const id = chatIdSchema.parse(req.params.id);
    if (execution.isWorking(res.locals.accountId, id))
      throw new ChatError("EXECUTION_ALREADY_ACTIVE", 409);
    await chats.remove(res.locals.accountId, id);
    res.status(204).end();
  });
  router.post("/:id/messages", async (req, res) => {
    const id = chatIdSchema.parse(req.params.id);
    const message = sendChatSchema.parse(req.body);
    const timing = new ChatTiming(message.id);
    timing.mark("expressReceived");
    const parts = message.attachments?.length ? await prepareChatAttachments(message.attachments) : [];
    await execution.enqueue(res.locals.accountId, id, message.instanceId, {
      kind: "message",
      message,
      parts,
      timing,
    });
    timing.mark("expressAccepted");
    res.status(202).json({ id: message.id });
  });
  router.post("/:id/stop", async (req, res) => {
    const id = chatIdSchema.parse(req.params.id);
    const { instanceId } = controlSchema.parse(req.body);
    await execution.stop(res.locals.accountId, id, instanceId);
    res.status(204).end();
  });
  router.post("/:id/:command", async (req, res) => {
    const id = chatIdSchema.parse(req.params.id);
    const kind = z.enum(["resume", "compact"]).parse(req.params.command);
    const { instanceId, locale } = controlSchema
      .extend({ locale: z.enum(["es", "en"]) })
      .parse(req.body);
    await execution.enqueue(res.locals.accountId, id, instanceId, { kind, locale });
    res.status(202).json({ accepted: true });
  });
  router.get("/:id/stream", async (req, res) => {
    const id = chatIdSchema.parse(req.params.id);
    const accountId: string = res.locals.accountId;
    await chats.authorizeRead(accountId, id);
    if (res.destroyed) return;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const send = (event: ChatStream) => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.type === "event") execution.wroteContent(accountId, id, event.event.turnId);
      if (event.type === "snapshot" && event.events.length) execution.wroteContent(accountId, id, event.turnId);
    };
    const unsubscribe = execution.subscribe(accountId, id, send);
    const keepalive = setInterval(() => res.write(": keepalive\n\n"), 25000);
    const lifetime = setTimeout(() => res.end(), 8 * 60 * 60 * 1000);
    res.once("close", () => {
      unsubscribe();
      clearInterval(keepalive);
      clearTimeout(lifetime);
    });
    send({ type: "sync" });
  });
  router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof ZodError)
      return res.status(400).json({ error: { code: "INVALID_REQUEST" } });
    if (error instanceof ChatError)
      return res.status(error.status).json({ error: { code: error.code } });
    return next(error);
  });
  return router;
}
