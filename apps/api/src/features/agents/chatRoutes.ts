import { Router, type NextFunction, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import {
  chatIdSchema,
  createChatSchema,
} from "@mirai/contracts";
import type { createChatExecution } from "./chatExecution.js";
import { ChatError, type ManagedChats } from "./managedChats.js";
import { ExtractionError } from "../profiles/extractProfile.js";
import { type createQueuedAttachments } from "./chatAttachments.js";

export function createChatRoutes(
  chats: ManagedChats | undefined,
  execution: ReturnType<typeof createChatExecution> | undefined,
  verifyIdentity: (header?: string) => Promise<string | null>,
  attachments: ReturnType<typeof createQueuedAttachments>,
) {
  const router = Router();
  router.use(async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const accountId = await verifyIdentity(req.headers.authorization);
    if (!accountId) return res.status(401).json({ error: { code: "AUTH_REQUIRED" } });
    res.locals.accountId = accountId;
    return next();
  });
  router.get("/attachments", async (_req, res) => {
    res.json(await attachments.list(res.locals.accountId));
  });
  router.delete("/:id/attachments/:messageId/:position", async (req, res) => {
    await attachments.remove(
      res.locals.accountId,
      chatIdSchema.parse(req.params.id),
      z.uuid().parse(req.params.messageId),
      z.coerce.number().int().min(0).max(19).parse(req.params.position),
    );
    res.status(204).end();
  });
  if (!chats || !execution) {
    router.use((_req, res) => {
      res.status(503).json({ error: { code: "AGENT_NOT_CONFIGURED" } });
    });
    return router;
  }
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
  router.get("/:id/attachments/:messageId/:position", async (req, res) => {
    const accountId: string = res.locals.accountId;
    const chatId = chatIdSchema.parse(req.params.id);
    const messageId = z.uuid().parse(req.params.messageId);
    const position = z.coerce.number().int().min(0).max(19).parse(req.params.position);
    const data = await attachments.read(accountId, chatId, messageId, position);
    if (!data) throw new ChatError("ATTACHMENT_NOT_FOUND", 404);
    res.set("X-Content-Type-Options", "nosniff");
    res.type("application/octet-stream").send(data);
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
    if (await execution.isWorking(res.locals.accountId, id))
      throw new ChatError("EXECUTION_ALREADY_ACTIVE", 409);
    await chats.remove(res.locals.accountId, id);
    res.status(204).end();
  });
  router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof ZodError)
      return res.status(400).json({ error: { code: "INVALID_REQUEST" } });
    if (error instanceof ChatError)
      return res.status(error.status).json({ error: { code: error.code } });
    if (error instanceof ExtractionError && error.code === "ORIGINAL_UPLOAD_LIMIT")
      return res.status(409).json({ error: { code: error.code } });
    return next(error);
  });
  return router;
}
