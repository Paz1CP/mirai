import "dotenv/config";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

const server = app.listen(port, "0.0.0.0", () => {
  console.info(`Mirai API listening on port ${port}`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    server.close(() => {
      const closeDatabase: (() => Promise<void>) | undefined = app.locals.closeDatabase;
      void (closeDatabase?.() ?? Promise.resolve()).then(() => process.exit(0));
    });
  });
}
