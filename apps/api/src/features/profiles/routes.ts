import { Router } from "express";
import { ZodError } from "zod";
import {
  professionalProfileSchema,
  preferencesSchema,
  permissionPatchSchema,
  preferenceOptions,
} from "@mirai/contracts";
import type { createProfileRepository } from "./profileRepository.js";
import { createImportRoutes } from "./importRoutes.js";

export function createProfileRoutes(
  repository: ReturnType<typeof createProfileRepository>,
  verifyIdentity: (header?: string) => Promise<string | null>,
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
  router.get("/profile", async (_req, res) =>
    res.json(await repository.readProfile(res.locals.accountId)),
  );
  router.put("/profile", async (req, res) =>
    res.json(
      await repository.saveProfile(res.locals.accountId, professionalProfileSchema.parse(req.body)),
    ),
  );
  router.post("/profile/confirm", async (_req, res) => {
    if (!(await repository.confirm(res.locals.accountId))) {
      res.status(409).json({ error: { code: "PROFILE_REQUIRED" } });
      return;
    }
    res.json(await repository.readProfile(res.locals.accountId));
  });
  router.get("/preferences", async (_req, res) =>
    res.json(await repository.readPreferences(res.locals.accountId)),
  );
  router.post("/profile/complete", async (_req, res) => {
    if (!(await repository.completeOnboarding(res.locals.accountId))) {
      res.status(409).json({ error: { code: "ONBOARDING_INCOMPLETE" } });
      return;
    }
    res.json(await repository.readProfile(res.locals.accountId));
  });
  router.put("/preferences", async (req, res) => {
    const result = await repository.savePreferences(
      res.locals.accountId,
      preferencesSchema.parse(req.body),
    );
    if (!result) {
      res.status(400).json({ error: { code: "INVALID_LOCATION_OR_CURRENCY" } });
      return;
    }
    res.json(result);
  });
  router.patch("/preferences/permissions", async (req, res) =>
    res.json(
      await repository.savePermissions(res.locals.accountId, permissionPatchSchema.parse(req.body)),
    ),
  );
  router.get("/catalog/countries", async (_req, res) => res.json(await repository.countries()));
  router.get("/catalog/options", (_req, res) => res.json(preferenceOptions));
  router.use(createImportRoutes(repository));
  router.use(
    (
      error: unknown,
      _req: import("express").Request,
      res: import("express").Response,
      next: import("express").NextFunction,
    ) => {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: {
            code: "INVALID_REQUEST",
            fields: error.issues.map((issue) => issue.path.join(".")),
          },
        });
        return;
      }
      next(error);
    },
  );
  return router;
}
