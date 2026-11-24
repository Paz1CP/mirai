import type { Response } from "express";
import { Client, type Pool } from "pg";

type Database = Pick<Pool, "query">;

export async function hasActiveSession(db: Database, id: string, issuedAt?: number) {
  const { rowCount } = await db.query(
    `select 1 from neon_auth."user" account
     where account.id = $1 and exists (
       select from neon_auth.session session where session."userId" = account.id
         and session."expiresAt" > now()
         and ($2::double precision is null or session."createdAt" < to_timestamp($2 + 1))
     ) for key share of account skip locked`,
    [id, issuedAt ?? null],
  );
  return Boolean(rowCount);
}

export const accountActivityKey = (id: string) => `mirai-erasure:${id}`;

export type AccountActivity = <T>(
  id: string,
  action: (signal: AbortSignal) => Promise<T>,
  options?: { requireSession: false },
) => Promise<T | undefined>;

// Only for operations that can outlive SQL and leave remote resources or late writes.
export function createAccountActivity(connectionString: string): AccountActivity {
  return async (id, action, options) => {
    const connection = new Client({ connectionString, connectionTimeoutMillis: 5000 });
    const abort = new AbortController();
    connection.on("error", () => abort.abort());
    connection.on("end", () => abort.abort());
    connection.on("notification", ({ payload }) => {
      try {
        if (JSON.parse(payload ?? "{}")?.accountId === id) abort.abort();
      } catch {
        // Ignore malformed notifications.
      }
    });
    try {
      await connection.connect();
      await connection.query("LISTEN mirai_account_deletion");
      const { rows } = await connection.query<{ locked: boolean }>(
        "select pg_try_advisory_lock_shared(hashtextextended($1, 0)) as locked",
        [accountActivityKey(id)],
      );
      if (!rows[0]?.locked) return;
      const allowed =
        options?.requireSession === false
          ? Boolean(
              (
                await connection.query(
                  'select 1 from neon_auth."user" where id = $1 for key share skip locked',
                  [id],
                )
              ).rowCount,
            )
          : await hasActiveSession(connection, id);
      if (!allowed) return;
      abort.signal.throwIfAborted();
      return await action(abort.signal);
    } finally {
      await connection.end().catch(() => {});
    }
  };
}

export function requestSignal(res: Response) {
  const controller = new AbortController();
  if (res.destroyed) controller.abort();
  else
    res.once("close", () => {
      if (!res.writableEnded) controller.abort();
    });
  return controller.signal;
}
