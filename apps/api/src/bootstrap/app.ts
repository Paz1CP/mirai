import cors from "cors";
import express from "express";
import { createDatabase } from "../infrastructure/database/client.js";
import { createIdentityVerifier } from "../features/auth/verifyIdentity.js";
import { createControllerRepository } from "../features/sessions/controllerRepository.js";
import { createSessionRoutes } from "../features/sessions/routes.js";
import { createProfileRoutes } from "../features/profiles/routes.js";
import { createProfileRepository } from "../features/profiles/profileRepository.js";
import { createProfileExtractor } from "../features/profiles/extractProfile.js";
import { createDocumentStorage } from "../features/profiles/documentStorage.js";
import { createDocumentCleanup } from "../features/profiles/documentCleanup.js";
import { createImportRoutes } from "../features/profiles/importRoutes.js";
import { createCvRepository } from "../features/cvs/cvRepository.js";
import { createCvRoutes } from "../features/cvs/routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000" }));
  app.use(express.json({ limit: "10mb" }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  if (process.env.DATABASE_URL && process.env.NEON_AUTH_BASE_URL) {
    const { db, pool } = createDatabase(process.env.DATABASE_URL);
    const verifyIdentity = createIdentityVerifier(process.env.NEON_AUTH_BASE_URL);
    const profiles = createProfileRepository(db);
    const extract = createProfileExtractor();
    const storage = createDocumentStorage();
    const cleanup = createDocumentCleanup(db, storage);
    app.locals.closeDatabase = () => pool.end();
    app.use(
      "/v1",
      createProfileRoutes(
        profiles,
        verifyIdentity,
        createImportRoutes(profiles, extract, storage, cleanup),
        createCvRoutes(createCvRepository(db), extract, storage, cleanup),
      ),
    );
    app.use("/v1", createSessionRoutes(createControllerRepository(db), verifyIdentity));
  } else {
    app.use("/v1", (_req, res) => {
      res.status(503).json({ error: { code: "SERVICE_NOT_CONFIGURED" } });
    });
  }
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      void _next;
      console.error({
        event: "request_failed",
        errorType: error instanceof Error ? error.name : "Unknown",
      });
      res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
    },
  );

  return app;
}
