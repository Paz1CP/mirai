import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import type { ManagedChats } from "../agents/managedChats.js";
import { paddleConfiguration } from "../billing/paddleClient.js";
import { acquireErasureLock } from "./accountFence.js";
import type { createDocumentStorage } from "../profiles/documentStorage.js";

const confirmation = z
  .object({
    confirmation: z.enum(["ELIMINAR", "DELETE"]),
    confirmed: z.literal(true),
    sessionToken: z.string().min(1).max(1024),
  })
  .strict();

export function createAccountDeletion(
  pool: Pool,
  verify: (authorization?: string) => Promise<string | null>,
  storage: ReturnType<typeof createDocumentStorage>,
  chats: ManagedChats | undefined,
  workerToken: string,
) {
  const router = Router();
  const expectedToken = createHash("sha256").update(`Bearer ${workerToken}`).digest();
  function signReceipt(payload: string) {
    return createHmac("sha256", workerToken)
      .update(`account-deletion:${payload}`)
      .digest("base64url");
  }

  function issueReceipt(id: string) {
    const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const payload = Buffer.from(JSON.stringify([id, expires])).toString("base64url");
    return `${payload}.${signReceipt(payload)}`;
  }

  function readReceipt(authorization?: string) {
    const match = authorization?.match(/^DeletionReceipt ([\w-]{1,1024})\.([\w-]{43})$/);
    if (!match) return;
    const [, payload, signature] = match;
    if (
      !payload ||
      !signature ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(signReceipt(payload)))
    )
      return;
    const [id, expires] = z
      .tuple([z.string(), z.number()])
      .parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (expires > Date.now()) return id;
  }

  async function processAccount(id: string) {
    const connection = await pool.connect();
    try {
      if (!(await acquireErasureLock(connection, id))) return;
      const { rows } = await connection.query(
        "update users.account_deletions set next_attempt_at = now() + interval '30 seconds' where account_id = $1 and next_attempt_at <= now() returning account_id",
        [id],
      );
      if (!rows.length) return;
      if (!chats) throw new Error("AGENT_ENGINE_NOT_CONFIGURED");

      const { rows: payments } = await connection.query<{
        environment: "sandbox" | "live";
        transaction_id: string | null;
        id: string;
        created_at: Date;
      }>(
        "select environment, transaction_id, id, created_at from billing.topups where account_id = $1 and purchased_at is null",
        [id],
      );
      for (const environment of ["sandbox", "live"] as const) {
        const pending = payments.filter((payment) => payment.environment === environment);
        if (!pending.length) continue;
        const paddle = paddleConfiguration(environment);
        const unlinked = await paddle.findUnlinkedTransactions(
          pending.filter((payment) => !payment.transaction_id),
        );
        const transactions = new Set([
          ...unlinked,
          ...pending.flatMap(({ transaction_id }) => (transaction_id ? [transaction_id] : [])),
        ]);
        for (const transaction of transactions) await paddle.cancelPending(transaction);
      }

      const sessions = await chats.list(id);
      const { rows: interactions } = await connection.query<{ id: string }>(
        "select distinct details->>'providerId' as id from billing.ledger where account_id = $1 and jsonb_typeof(details->'providerId') = 'string'",
        [id],
      );
      const ids = new Set(interactions.map((row) => row.id));
      for (const { id: chatId } of sessions) {
        const session = await chats.owned(id, chatId, true);
        for (const event of session.events) {
          if (event.interactionId) ids.add(event.interactionId);
        }
      }
      const google = new GoogleGenAI({
        enterprise: true,
        project: chats.project,
        location: chats.modelRegion,
      });
      for (const interactionId of ids) {
        try {
          await google.interactions.delete(interactionId, undefined, {
            signal: AbortSignal.timeout(8_000),
          });
        } catch (error) {
          const status = z.object({ status: z.number() }).safeParse(error).data?.status;
          if (status === 404) continue;
          if (status !== 400 && status !== 409) throw error;
          const interaction = await google.interactions.get(
            interactionId,
            { stream: false },
            { signal: AbortSignal.timeout(8_000) },
          );
          if (["in_progress", "requires_action"].includes(interaction.status))
            await google.interactions.cancel(interactionId, undefined, {
              signal: AbortSignal.timeout(8_000),
            });
          // Leave the job queued until deletion succeeds.
          throw error;
        }
      }
      for (const { id: chatId } of sessions) await chats.remove(id, chatId);
      if ((await chats.list(id)).length) throw new Error("SESSIONS_STILL_PRESENT");
      await storage.removeAccount(id);
      const { rows: unknownInteractions } = await connection.query<{ retry_at: Date }>(
        `select max(pending.at) + interval '8 days' as retry_at
         from billing.ledger pending
         left join billing.ledger provider on provider.account_id = pending.account_id
           and provider.environment = pending.environment and provider.movement_key = 'provider:' || pending.movement_key
         left join billing.ledger settled on settled.account_id = pending.account_id
           and settled.environment = pending.environment and settled.movement_key = 'settled:' || pending.movement_key
         where pending.account_id = $1 and pending.kind = 'inference_pending'
           and pending.details->>'operation' in ('chat', 'compaction')
           and pending.at > now() - interval '8 days'
           and provider.movement_key is null and settled.details->>'providerId' is null
           and (settled.movement_key is null or settled.details @> '{"providerMayBeRunning":true}')`,
        [id],
      );
      if (unknownInteractions[0]?.retry_at) {
        // Google expires anonymous interactions after seven days. Without the returned
        // ID we cannot target the resource, and must keep deletion pending.
        await connection.query(
          "update users.account_deletions set next_attempt_at = $2 where account_id = $1",
          [id, unknownInteractions[0].retry_at],
        );
        return;
      }

      await connection.query("BEGIN");
      // Only fixed, application-owned table names are interpolated.
      for (const table of [
        "users.applications",
        "users.campaigns",
        "users.queued_chat_attachments",
        "users.cv_documents",
        "users.original_documents",
        "users.document_cleanup",
        "users.job_preferences",
        "users.candidate_profiles",
        "users.account_controllers",
        "billing.ledger",
        "billing.topups",
        "billing.wallets",
      ]) {
        await connection.query(`delete from ${table} where account_id = $1`, [id]);
      }
      await connection.query(
        'delete from neon_auth.verification where identifier in (select email from neon_auth."user" where id = $1)',
        [id],
      );
      // Neon Auth cascades this deletion to sessions, linked accounts, and memberships.
      await connection.query('delete from neon_auth."user" where id = $1', [id]);
      await connection.query("delete from users.account_deletions where account_id = $1", [id]);
      await connection.query("COMMIT");
    } catch (error) {
      await connection.query("ROLLBACK").catch(() => {});
      console.error({
        event: "account_deletion_retry",
        errorType: error instanceof Error ? error.name : "Unknown",
      });
    } finally {
      connection.release(true);
    }
  }

  router.post("/worker", async (req, res) => {
    const actual = createHash("sha256")
      .update(req.get("authorization") ?? "")
      .digest();
    if (!timingSafeEqual(actual, expectedToken)) return res.sendStatus(401);
    const { rows } = await pool.query<{ account_id: string }>(
      "select account_id from users.account_deletions where next_attempt_at <= now() order by next_attempt_at limit 5",
    );
    for (const row of rows) await processAccount(row.account_id);
    return res.sendStatus(204);
  });
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.post("/", async (req, res) => {
    const id = await verify(req.get("authorization"));
    if (!id) return res.status(401).json({ error: { code: "AUTH_REQUIRED" } });
    const input = confirmation.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: { code: "INVALID_REQUEST" } });
    if (!chats) return res.status(503).json({ error: { code: "ACCOUNT_DELETION_UNAVAILABLE" } });
    const { rowCount } = await pool.query(
      `with added as (
         insert into users.account_deletions (account_id)
         select "userId" from neon_auth.session
         where "userId" = $1 and token = $2 and "impersonatedBy" is null
           and "createdAt" >= now() - interval '10 minutes' and "expiresAt" > now()
         on conflict do nothing returning account_id
       )
       select pg_notify('mirai_account_deletion', json_build_object('accountId', account_id)::text) from added`,
      [id, input.data.sessionToken],
    );
    if (!rowCount) {
      const pending = await pool.query(
        "select 1 from users.account_deletions where account_id = $1",
        [id],
      );
      if (!pending.rowCount)
        return res.status(403).json({ error: { code: "RECENT_AUTH_REQUIRED" } });
    }
    return res.status(202).json({ status: "pending", receipt: issueReceipt(id) });
  });
  router.get("/", async (req, res) => {
    const authorization = req.get("authorization");
    const receiptId = readReceipt(authorization);
    const id = receiptId ?? (await verify(authorization));
    if (!id) return res.status(401).json({ error: { code: "AUTH_REQUIRED" } });
    const { rows } = await pool.query<{ status: string }>(
      `select case when exists(select from users.account_deletions where account_id=$1) then 'pending'
        when exists(select from neon_auth."user" where id=$1) then 'ready' else 'complete' end as status`,
      [id],
    );
    const status = rows[0]!.status;
    if (status === "ready" && !chats)
      return res.status(503).json({ error: { code: "ACCOUNT_DELETION_UNAVAILABLE" } });
    if (status === "complete" && !receiptId)
      return res.status(401).json({ error: { code: "AUTH_REQUIRED" } });
    if (status === "pending" && !receiptId) return res.json({ status, receipt: issueReceipt(id) });
    return res.json({ status });
  });
  return router;
}
