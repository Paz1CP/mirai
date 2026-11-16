import { Router } from "express";
import { z, ZodError } from "zod";
import {
  controlSchema,
  instanceSchema,
  transferSchema,
  linkChallengeSchema,
} from "@mirai/contracts";
import {
  ControlConflict,
  ControlExpired,
  type createControllerRepository,
} from "./controllerRepository.js";

type Repository = ReturnType<typeof createControllerRepository>;
export function createSessionRoutes(
  repository: Repository,
  verifyIdentity: (header?: string) => Promise<string | null>,
) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.post("/devices/link", async (req, res) => {
    const input = linkChallengeSchema.parse(req.body);
    res.json(await repository.link(input.challenge, input.installationId));
  });
  router.post("/devices/verify", async (req, res) => {
    const input = z.strictObject({ deviceId: z.uuid() }).parse(req.body);
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      res.status(401).json({ error: { code: "AUTH_REQUIRED" } });
      return;
    }
    res.json(await repository.verifyDevice(input.deviceId, token));
  });
  router.use(async (req, res, next) => {
    const accountId = await verifyIdentity(req.headers.authorization);
    if (!accountId) {
      res.status(401).json({ error: { code: "AUTH_REQUIRED" } });
      return;
    }
    res.locals.accountId = accountId;
    next();
  });
  router.post("/session/acquire", async (req, res) => {
    const input = instanceSchema.parse(req.body);
    res.json(await repository.acquire(res.locals.accountId, input.instanceId));
  });
  router.post("/session/transfer", async (req, res) => {
    const input = transferSchema.parse(req.body);
    res.json(await repository.acquire(res.locals.accountId, input.instanceId, input.expectedEpoch));
  });
  router.post("/session/heartbeat", async (req, res) => {
    res.json(await repository.heartbeat(res.locals.accountId, controlSchema.parse(req.body)));
  });
  router.post("/session/release", async (req, res) => {
    await repository.release(res.locals.accountId, controlSchema.parse(req.body));
    res.status(204).end();
  });
  router.post("/devices/link-challenge", async (req, res) => {
    res.json(await repository.challenge(res.locals.accountId, controlSchema.parse(req.body)));
  });
  router.use(
    (
      error: unknown,
      _req: import("express").Request,
      res: import("express").Response,
      next: import("express").NextFunction,
    ) => {
      if (error instanceof ZodError) {
        res.status(400).json({ error: { code: "INVALID_REQUEST" } });
        return;
      }
      if (error instanceof ControlConflict) {
        res.status(409).json({ error: { code: "CONTROL_CONFLICT", epoch: error.epoch } });
        return;
      }
      if (error instanceof ControlExpired) {
        res.status(409).json({ error: { code: "CONTROL_EXPIRED" } });
        return;
      }
      next(error);
    },
  );
  return router;
}
