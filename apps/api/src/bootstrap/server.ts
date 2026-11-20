import "dotenv/config";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

const server = app.listen(port, "0.0.0.0", () => {
  console.info(`Mirai API listening on port ${port}`);
});
const attachWorkspace: ((httpServer: typeof server) => void) | undefined =
  app.locals.attachWorkspace;
attachWorkspace?.(server);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    const closeWorkspace: (() => Promise<void>) | undefined = app.locals.closeWorkspace;
    const closed = closeWorkspace?.();
    server.close(() => {
      const closeDatabase: (() => Promise<void>) | undefined = app.locals.closeDatabase;
      void Promise.resolve(closed).then(() => closeDatabase?.()).then(() => process.exit(0));
    });
  });
}
