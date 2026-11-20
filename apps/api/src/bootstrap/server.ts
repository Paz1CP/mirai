import "dotenv/config";
import { Client } from "pg";
import { createApp } from "./app.js";

// Cloud Run may overlap instances during a rollout. Only the owner may serve Mirai.
if (process.env.K_SERVICE) {
  const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL_DIRECT;
  if (!connectionString) throw new Error("MIRAI_OWNER_REQUIRES_DIRECT_DATABASE_URL");
  const owner = new Client({ connectionString, connectionTimeoutMillis: 5000, keepAlive: true });
  await owner.connect();
  const { rows } = await owner.query<{ acquired: boolean }>(
    "select pg_try_advisory_lock(hashtextextended('mirai-api-owner', 0)) as acquired",
  );
  if (!rows[0]?.acquired) {
    await owner.end();
    throw new Error("MIRAI_API_OWNER_ALREADY_RUNNING");
  }
  owner.on("error", () => process.exit(1));
  owner.on("end", () => process.exit(1));
}

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

const server = app.listen(port, "0.0.0.0", () => {
  console.info(`Mirai API listening on port ${port}`);
});
const attachBrowserRelay: ((httpServer: typeof server) => void) | undefined =
  app.locals.attachBrowserRelay;
attachBrowserRelay?.(server);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    app.locals.closeBrowserRelay?.();
    server.close(() => {
      const closeDatabase: (() => Promise<void>) | undefined = app.locals.closeDatabase;
      void (closeDatabase?.() ?? Promise.resolve()).then(() => process.exit(0));
    });
  });
}
