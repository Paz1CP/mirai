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
import { createResultsRepository } from "../features/applications/resultsRepository.js";
import { createResultsRoutes } from "../features/applications/routes.js";
import { createManagedChats } from "../features/agents/managedChats.js";
import { createMiraiAgent } from "../features/agents/miraiAgent.js";
import { createChatExecution } from "../features/agents/chatExecution.js";
import { createChatRoutes } from "../features/agents/chatRoutes.js";
import { createBrowserRelay } from "../features/agents/browserRelay.js";
import { createBrowserRoutes } from "../features/agents/browserRoutes.js";
import { openPlaywrightTools } from "../features/agents/playwrightTools.js";
import { createQueuedAttachments } from "../features/agents/chatAttachments.js";
import { createAgentRelay } from "../features/agents/agentRelay.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000" }));
  app.use("/v1/chats", express.json({ limit: "41mb" }));
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
    const controller = createControllerRepository(db);
    const results = createResultsRepository(db);
    const chats = createManagedChats();
    const relay = createAgentRelay(db);
    const browsers = createBrowserRelay(controller, db, relay);
    const execution =
      chats &&
      createChatExecution(
        chats,
        createMiraiAgent(chats, results, profiles, cvs),
        results,
        controller,
        async (scope, instanceId, locale, signal) => {
          try {
            const binding = await browsers.bindingFor(scope.accountId, instanceId, signal);
            if (!binding) return undefined;
            try {
              const tools = await openPlaywrightTools(binding, cvs, storage, locale, signal);
              return { ...tools, close: async () => {
                try { await tools.close(); } finally { binding.dispose(); }
              } };
            } catch (error) {
              binding.dispose();
              throw error;
            }
          } catch (error) {
            signal.throwIfAborted();
            console.warn({
              event: "agent_browser_unavailable",
              errorType: error instanceof Error ? error.name : "Unknown",
            });
            return undefined;
          }
        },
        createQueuedAttachments(db),
        relay,
      );
    relay.listen("browser-disconnected", (key) => {
      const [accountId, instanceId] = JSON.parse(key) as [string, string];
      execution?.disconnectBrowser(accountId, instanceId);
    });
    app.locals.attachBrowserRelay = (server: Parameters<typeof browsers.attach>[0]) => {
      browsers.attach(server);
      void relay.ready().catch(() => {});
    };
    app.locals.closeDatabase = async () => { await relay.close(); await pool.end(); };
    app.use("/v1/chats", createChatRoutes(chats, execution, verifyIdentity));
    app.use("/v1/browser", createBrowserRoutes(browsers, controller, verifyIdentity));
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
    app.use(
      "/v1",
      createSessionRoutes(
        controller,
        verifyIdentity,
        undefined,
        results.stopInterruptedCampaigns,
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
