import { Router } from "express";
import { z, ZodError } from "zod";
import { applicationListQuerySchema, campaignListQuerySchema } from "@mirai/contracts";
import type { createResultsRepository } from "./resultsRepository.js";

export function createResultsRoutes(
  repository: ReturnType<typeof createResultsRepository>,
  verifyIdentity: (header?: string) => Promise<string | null>,
) {
  const router = Router();
  router.use(["/dashboard", "/applications", "/campaigns"], async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const accountId = await verifyIdentity(req.headers.authorization);
    if (!accountId) {
      res.status(401).json({ error: { code: "AUTH_REQUIRED" } });
      return;
    }
    res.locals.accountId = accountId;
    next();
  });
  router.get("/dashboard", async (_req, res) => {
    await repository.stopInterruptedCampaigns(res.locals.accountId);
    return res.json(await repository.getDashboardSummary(res.locals.accountId));
  });
  router.get("/applications", async (req, res) =>
    res.json(
      await repository.listApplications(
        res.locals.accountId,
        applicationListQuerySchema.parse(req.query),
      ),
    ),
  );
  router.get("/applications/:id", async (req, res) => {
    const result = await repository.getApplication(
      res.locals.accountId,
      z.uuid().parse(req.params.id),
    );
    if (!result) return res.status(404).json({ error: { code: "APPLICATION_NOT_FOUND" } });
    return res.json(result);
  });
  router.get("/campaigns", async (req, res) =>
    res.json(
      await repository.listCampaigns(
        res.locals.accountId,
        campaignListQuerySchema.parse(req.query),
      ),
    ),
  );
  router.get("/campaigns/:id", async (req, res) => {
    const result = await repository.getCampaign(
      res.locals.accountId,
      z.uuid().parse(req.params.id),
    );
    if (!result) return res.status(404).json({ error: { code: "CAMPAIGN_NOT_FOUND" } });
    return res.json(result);
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
      next(error);
    },
  );
  return router;
}
