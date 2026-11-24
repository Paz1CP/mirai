import type { Client, Notification, Pool, PoolClient } from "pg";
import type { RequestHandler, Response } from "express";
import { BillingError } from "../billing/walletRepository.js";

// Session locks require a direct connection, including when used by the workspace listener.
type Connection = Pick<Client, "query">;

const quiescent = `select pg_try_advisory_lock(hashtextextended('mirai-erasure:' || $1, 0)) as locked`;
const enter = `select pg_try_advisory_lock_shared(hashtextextended('mirai-erasure:' || $1, 0)) as locked`;
const leave = `select pg_advisory_unlock_shared(hashtextextended('mirai-erasure:' || $1, 0))`;
const watchDeletion = new WeakMap<Response, () => Promise<AbortSignal>>();

export async function accountRequestSignal(res: Response) {
  const request = new AbortController();
  if (res.destroyed) request.abort();
  else
    res.once("close", () => {
      if (!res.writableEnded) request.abort();
    });
  const deletion = await watchDeletion.get(res)?.();
  return deletion ? AbortSignal.any([request.signal, deletion]) : request.signal;
}

export async function accountOpen(connection: Connection | Pool, id: string) {
  const { rows } = await connection.query<{ allowed: boolean }>(
    `select exists(select from neon_auth."user" where id = $1)
      and not exists(select from users.account_deletions where account_id = $1) as allowed`,
    [id],
  );
  return !!rows[0]?.allowed;
}

export async function enterAccount(connection: Connection, id: string) {
  const { rows } = await connection.query<{ locked: boolean }>(enter, [id]);
  if (!rows[0]?.locked) return false;
  if (await accountOpen(connection, id)) return true;
  await connection.query(leave, [id]);
  return false;
}

export async function withAccountOperation<T>(pool: Pool, id: string, action: () => Promise<T>) {
  const connection = await pool.connect();
  let held = false;
  try {
    held = await enterAccount(connection, id);
    if (!held) return;
    return await action();
  } finally {
    if (held) await releaseAccount(connection, id);
    else connection.release(true);
  }
}

async function releaseAccount(connection: PoolClient, id: string) {
  try {
    await connection.query(leave, [id]);
    connection.release();
  } catch {
    connection.release(true);
  }
}

export async function acquireErasureLock(connection: Connection, id: string) {
  const { rows } = await connection.query<{ locked: boolean }>(quiescent, [id]);
  return !!rows[0]?.locked;
}

export function fenceAccountRequests(
  pool: Pool,
  verify: (authorization?: string) => Promise<string | null>,
): RequestHandler {
  return async (req, res, next) => {
    // Paddle webhooks are authenticated independently and fenced after resolving their owner.
    if (req.method === "POST" && /^\/billing\/paddle\/(live|sandbox)\/webhook\/?$/.test(req.path))
      return next();
    const accountId = await verify(req.get("authorization"));
    if (!accountId) return res.status(401).json({ error: { code: "AUTH_REQUIRED" } });
    const connection = await pool.connect();
    let held = false;
    try {
      held = await enterAccount(connection, accountId);
      if (!held) return res.status(409).json({ error: { code: "ACCOUNT_DELETION_PENDING" } });
      let watching = false;
      watchDeletion.set(res, async () => {
        watching = true;
        const deletion = new AbortController();
        const cancel = () => deletion.abort(new BillingError("ACCOUNT_DELETION_PENDING", 409));
        connection.on("notification", ({ payload }: Notification) => {
          try {
            if (JSON.parse(payload ?? "{}")?.accountId === accountId) cancel();
          } catch {
            // Ignore malformed notifications from other database clients.
          }
        });
        connection.on("error", cancel);
        await connection.query("LISTEN mirai_account_deletion");
        // Cover requests admitted before the deletion notification was registered.
        if (!(await accountOpen(connection, accountId))) cancel();
        return deletion.signal;
      });
      // A client can disconnect while the handler is still writing to a provider.
      // Release when the handler ends the response, even on a closed socket.
      const end = res.end;
      res.end = (...args: unknown[]) => {
        res.end = end;
        watchDeletion.delete(res);
        try {
          return Reflect.apply(end, res, args) as typeof res;
        } finally {
          if (watching) connection.release(true);
          else void releaseAccount(connection, accountId);
        }
      };
      next();
    } finally {
      if (!held) connection.release(true);
    }
  };
}
