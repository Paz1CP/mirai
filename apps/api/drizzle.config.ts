import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const databaseUrl =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.DATABASE_URL_DIRECT ??
  process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/features/**/schema.ts",
  out: "./database/migrations",
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
});
