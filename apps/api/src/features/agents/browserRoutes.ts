import { Router } from "express";
import { controlSchema } from "@mirai/contracts";
import { z } from "zod";
import type { createControllerRepository } from "../sessions/controllerRepository.js";
import type { createBrowserRelay } from "./browserRelay.js";

export function createBrowserRoutes(
  relay: ReturnType<typeof createBrowserRelay>,
  controller: ReturnType<typeof createControllerRepository>,
  verifyIdentity: (header?: string) => Promise<string | null>,
) {
  const router = Router();
  router.post("/connect", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const accountId = await verifyIdentity(req.headers.authorization);
    if (!accountId) return res.status(401).json({ error: { code: "AUTH_REQUIRED" } });
    const parsed = controlSchema.extend({ renew: z.boolean().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_REQUEST" } });
    if (!(await controller.validatePresence(accountId, parsed.data.instanceId)))
      return res.status(409).json({ error: { code: "CONTROL_REQUIRED" } });
    return res.json(await relay.issue(accountId, parsed.data.instanceId, parsed.data.renew));
  });
  return router;
}
