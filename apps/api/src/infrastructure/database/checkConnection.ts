import "dotenv/config";
import { sql } from "drizzle-orm";
import { createDatabase } from "./client.js";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const { db, pool } = createDatabase(connectionString);
  try {
    await db.execute(sql`SELECT 1 AS ok`);
    console.info("Neon PostgreSQL: connected (Drizzle)");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
