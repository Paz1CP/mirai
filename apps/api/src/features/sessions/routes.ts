import { Router } from "express";
import { Client } from "pg";
import { z, ZodError } from "zod";
import {
  controlSchema,
  instanceSchema,
  transferSchema,
  controlEventSchema,
  connectSchema,
  type ControlEvent,
} from "@mirai/contracts";
import { ControlConflict, type createControllerRepository } from "./controllerRepository.js";
type Repository = ReturnType<typeof createControllerRepository>;
const authorizationInterval = 8 * 60 * 60 * 1000;

function startEventStream(res: import("express").Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const keepalive = setInterval(() => res.write(": keepalive\n\n"), 25000);
  res.once("close", () => clearInterval(keepalive));
}

export function createSessionRoutes(
  repository: Repository,
  verifyIdentity: (header?: string) => Promise<string | null>,
  onDisconnect?: (accountId: string, instanceId: string) => void,
) {
  const router = Router();
  router.use(async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const accountId = await verifyIdentity(req.headers.authorization);
    if (!accountId) {
      res.status(401).json({ error: { code: "AUTH_REQUIRED" } });
      return;
    }
    res.locals.accountId = accountId;
    next();
  });
  router.post("/session/acquire", async (req, res) => {
    res.json(
      await repository.acquire(res.locals.accountId, instanceSchema.parse(req.body).instanceId),
    );
  });
  router.post("/session/transfer", async (req, res) => {
    res.json(
      await repository.transfer(
        res.locals.accountId,
        transferSchema.parse(req.body).expectedInstanceId,
      ),
    );
  });
  router.post("/session/validate", async (req, res) => {
    res.json(await repository.validate(res.locals.accountId, controlSchema.parse(req.body)));
  });
  router.post("/session/release", async (req, res) => {
    await repository.release(res.locals.accountId, controlSchema.parse(req.body));
    res.status(204).end();
  });
  router.post("/session/events", async (req, res) => {
    const input = connectSchema.parse(req.body);
    // LISTEN requires a direct connection; transaction-pooled connections cannot carry subscriptions.
    const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL_DIRECT;
    if (!connectionString) {
      res.status(503).json({ error: { code: "EVENTS_NOT_CONFIGURED" } });
      return;
    }
    const listener = new Client({
      connectionString,
      connectionTimeoutMillis: 5000,
      keepAlive: true,
    });
    let closed = false;
    const close = () => {
      closed = true;
      void listener.end().catch(() => {});
    };
    res.on("close", close);
    listener.on("error", () => res.end());
    try {
      await listener.connect();
      const sendResults = () => res.write('data: {"type":"results.changed"}\n\n');
      if ("readResultsOnly" in input) {
        const resultsPayload = JSON.stringify({ accountId: res.locals.accountId });
        listener.on("notification", (message) => {
          if (
            res.headersSent &&
            message.channel === "mirai_results" &&
            message.payload === resultsPayload
          )
            sendResults();
        });
        await listener.query("LISTEN mirai_results");
        if (closed) return;
        startEventStream(res);
        sendResults();
        const lifetime = setTimeout(() => res.end(), authorizationInterval);
        res.once("close", () => clearTimeout(lifetime));
        return;
      }
      const pending: ControlEvent[] = [];
      let refreshAfter: ReturnType<typeof setTimeout>;
      let refreshDeadline: ReturnType<typeof setTimeout> | undefined;
      const send = (event: ControlEvent) => {
        if (!res.headersSent) {
          pending.push(event);
          return;
        }
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.instanceId !== control?.instanceId) res.end();
      };
      listener.on("notification", (message) => {
        try {
          const payload = z
            .object({ accountId: z.string() })
            .passthrough()
            .parse(JSON.parse(message.payload ?? ""));
          if (payload.accountId !== res.locals.accountId) return;
          if (message.channel === "mirai_results") {
            if (res.headersSent) sendResults();
            return;
          }
          if (payload.type === "control.refreshed") {
            if (refreshDeadline && payload.instanceId === control.instanceId) {
              clearTimeout(refreshDeadline);
              refreshDeadline = undefined;
              scheduleRefresh();
            }
            return;
          }
          const event = controlEventSchema.parse({
            type: payload.type,
            instanceId: payload.instanceId,
          });
          send(event);
        } catch {
          res.end();
        }
      });
      await listener.query("LISTEN mirai_control");
      await listener.query("LISTEN mirai_results");
      const control = await repository.connect(listener, res.locals.accountId, input);
      if (closed) return;
      res.once("close", () => onDisconnect?.(res.locals.accountId, control.instanceId));
      startEventStream(res);
      send({ type: "control.ready", instanceId: control.instanceId });
      for (const event of pending) send(event);
      function scheduleRefresh() {
        refreshAfter = setTimeout(() => {
          send({ type: "control.refresh", instanceId: control.instanceId });
          refreshDeadline = setTimeout(() => res.end(), 30000);
        }, authorizationInterval);
      }
      scheduleRefresh();
      res.once("close", () => {
        clearTimeout(refreshAfter);
        clearTimeout(refreshDeadline);
      });
    } catch (error) {
      close();
      throw error;
    }
  });
  router.use(
    (
      error: unknown,
      _req: import("express").Request,
      res: import("express").Response,
      next: import("express").NextFunction,
    ) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof ZodError) {
        res.status(400).json({ error: { code: "INVALID_REQUEST" } });
        return;
      }
      if (error instanceof ControlConflict) {
        res.status(409).json({ error: { code: "CONTROL_CONFLICT", instanceId: error.instanceId } });
        return;
      }
      next(error);
    },
  );
  return router;
}
