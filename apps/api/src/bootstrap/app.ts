import cors from "cors";
import express from "express";
import { createDatabase } from "../infrastructure/database/client.js";
import { createIdentityVerifier } from "../features/auth/verifyIdentity.js";
import { createControllerRepository } from "../features/sessions/controllerRepository.js";
import { createWorkspaceSocket } from "../features/sessions/workspaceSocket.js";
import { createProfileRoutes } from "../features/profiles/routes.js";
import { createProfileRepository } from "../features/profiles/profileRepository.js";
import { createProfileExtractor } from "../features/profiles/extractProfile.js";
import { createDocumentStorage } from "../features/profiles/documentStorage.js";
import { createDocumentCleanup } from "../features/profiles/documentCleanup.js";
import { createImportRoutes } from "../features/profiles/importRoutes.js";
import { createCvRepository } from "../features/cvs/cvRepository.js";
import { createCvRoutes } from "../features/cvs/routes.js";
import { createResultsRepository } from "../features/applications/resultsRepository.js";
import { createResultsRoutes } from "../features/applications/routes.js";
import { createManagedChats } from "../features/agents/managedChats.js";
import { createMiraiAgent } from "../features/agents/miraiAgent.js";
import { createChatExecution } from "../features/agents/chatExecution.js";
import { createChatRoutes } from "../features/agents/chatRoutes.js";
import { openPlaywrightTools } from "../features/agents/playwrightTools.js";
import { createQueuedAttachments } from "../features/agents/chatAttachments.js";

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
    const cvs = createCvRepository(db);
    const controller = createControllerRepository();
    const results = createResultsRepository(db);
    const chats = createManagedChats();
    const attachments = createQueuedAttachments(db, storage, cleanup);
    const execution =
      chats &&
      createChatExecution(
        chats,
        createMiraiAgent(chats, results, profiles, cvs),
        results,
        attachments,
      );
    const workspace = createWorkspaceSocket(controller, execution, verifyIdentity, (browser, locale, signal) =>
      openPlaywrightTools(browser, cvs, storage, locale, signal),
    );
    app.locals.attachWorkspace = workspace.attach;
    app.locals.closeWorkspace = workspace.close;
    app.locals.closeDatabase = () => pool.end();
    app.use("/v1/chats", createChatRoutes(chats, execution, verifyIdentity, attachments));
    app.use("/v1", createResultsRoutes(results, verifyIdentity));
    app.use(
      "/v1",
      createProfileRoutes(
        profiles,
        verifyIdentity,
        createImportRoutes(profiles, extract, storage, cleanup),
        createCvRoutes(cvs, extract, storage, cleanup),
      ),
    );
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
