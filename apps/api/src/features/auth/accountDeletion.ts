import { accountDeletionResultSchema, type AccountDeletionResource } from "@mirai/contracts";
import { GoogleGenAI } from "@google/genai";
import { Router } from "express";
import { Client, type Pool } from "pg";
import { z } from "zod";
import type { ManagedChats } from "../agents/managedChats.js";
import { paddleConfiguration } from "../billing/paddleClient.js";
import type { createDocumentStorage } from "../profiles/documentStorage.js";
import { executionHandoffKey } from "../sessions/controllerRepository.js";
import { accountActivityKey } from "./accountActivity.js";

const confirmation = z
  .object({
    confirmation: z.enum(["ELIMINAR", "DELETE"]),
    confirmed: z.literal(true),
    sessionToken: z.string().min(1).max(1024),
  })
  .strict();

async function attempt<T>(action: () => Promise<T>, onFailure: () => void) {
  try {
    return await action();
  } catch {
    onFailure();
  }
}

function providerStatus(error: unknown) {
  return z.object({ status: z.number() }).safeParse(error).data?.status;
}

// VertexAiSessionService does not expose abort signals. A stalled provider
// request must not keep the account transaction open indefinitely.
async function untilDeadline<T>(signal: AbortSignal, action: () => Promise<T>) {
  signal.throwIfAborted();
  let abort!: () => void;
  const deadline = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([action(), deadline]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

export function createAccountDeletion(
  pool: Pool,
  connectionString: string,
  verify: (authorization?: string) => Promise<string | null>,
  storage: Pick<ReturnType<typeof createDocumentStorage>, "removeAccount">,
  chats: ManagedChats | undefined,
) {
  const router = Router();

  async function removeGoogle(
    id: string,
    signal: AbortSignal,
    warnings: Set<AccountDeletionResource>,
  ) {
    const ids = new Set<string>();
    const reportInteractions = () => warnings.add("interactions");
    const reportSessions = () => warnings.add("sessions");
    const [sessions, history] = await Promise.all([
      chats
        ? attempt(() => untilDeadline(signal, () => chats.list(id)), reportSessions)
        : undefined,
      attempt(
        () =>
          pool.query<{ id: string | null }>(
            `select distinct details->>'providerId' as id from billing.ledger
         where account_id = $1 and jsonb_typeof(details->'providerId') = 'string'
         union all
         select null where exists (
           select from billing.ledger pending
           left join billing.ledger provider on provider.account_id = pending.account_id
             and provider.environment = pending.environment
             and provider.movement_key = 'provider:' || pending.movement_key
           left join billing.ledger settled on settled.account_id = pending.account_id
             and settled.environment = pending.environment
             and settled.movement_key = 'settled:' || pending.movement_key
           where pending.account_id = $1 and pending.kind = 'inference_pending'
             and pending.details->>'operation' = 'chat'
             and provider.movement_key is null and settled.details->>'providerId' is null
             and (settled.movement_key is null or settled.details @> '{"providerMayBeRunning":true}')
         )`,
            [id],
          ),
        reportInteractions,
      ),
    ]);
    for (const row of history?.rows ?? []) {
      if (row.id) ids.add(row.id);
      else reportInteractions();
    }
    if (!sessions) {
      reportSessions();
      reportInteractions();
    }
    if (chats && sessions) {
      for (const { id: chatId } of sessions) {
        if (signal.aborted) {
          reportInteractions();
          break;
        }
        const session = await attempt(
          () => untilDeadline(signal, () => chats.owned(id, chatId, true)),
          reportInteractions,
        );
        for (const event of session?.events ?? [])
          if (event.interactionId) ids.add(event.interactionId);
      }
    }
    const google = new GoogleGenAI({
      enterprise: true,
      project: chats?.project ?? process.env.GOOGLE_CLOUD_PROJECT,
      location: chats?.modelRegion ?? process.env.GOOGLE_CLOUD_LOCATION ?? "global",
    });
    await Promise.all([
      (async () => {
        for (const interactionId of ids) {
          if (signal.aborted) {
            reportInteractions();
            break;
          }
          await attempt(async () => {
            const options = () => ({
              signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
            });
            try {
              await google.interactions.delete(interactionId, undefined, options());
            } catch (error) {
              const status = providerStatus(error);
              if (status === 404) return;
              if (status !== 400 && status !== 409) throw error;
              try {
                const interaction = await google.interactions.get(
                  interactionId,
                  { stream: false },
                  options(),
                );
                if (["in_progress", "requires_action"].includes(interaction.status))
                  await google.interactions.cancel(interactionId, undefined, options());
                await google.interactions.delete(interactionId, undefined, options());
              } catch (retryError) {
                if (providerStatus(retryError) !== 404) throw retryError;
              }
            }
          }, reportInteractions);
        }
      })(),
      (async () => {
        if (!chats || !sessions?.length) return;
        for (const { id: chatId } of sessions) {
          if (signal.aborted) {
            reportSessions();
            return;
          }
          await attempt(async () => {
            try {
              await untilDeadline(signal, () =>
                chats.service.deleteSession({
                  appName: chats.appName,
                  userId: id,
                  sessionId: chatId,
                }),
              );
              chats.forgetExecution(id, chatId);
            } catch (error) {
              if (providerStatus(error) !== 404) throw error;
            }
          }, reportSessions);
        }
        // Google can return a long-running delete operation. Verify once without polling.
        const remaining = await attempt(
          () => untilDeadline(signal, () => chats.list(id)),
          reportSessions,
        );
        if (remaining?.length) reportSessions();
      })(),
    ]);
  }

  async function cancelPayments(
    id: string,
    signal: AbortSignal,
    warnings: Set<AccountDeletionResource>,
  ) {
    const { rows: payments } = await pool.query<{
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
      const unconfirmed = () => warnings.add("paddle");
      const unlinked = await attempt(
        () =>
          paddle.findUnlinkedTransactions(
            pending.filter((payment) => !payment.transaction_id),
            signal,
          ),
        unconfirmed,
      );
      const transactions = new Set([
        ...(unlinked ?? []),
        ...pending.flatMap(({ transaction_id }) => (transaction_id ? [transaction_id] : [])),
      ]);
      for (const transaction of transactions)
        await attempt(() => paddle.cancelPending(transaction, signal), unconfirmed);
    }
  }

  router.post("/", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const id = await verify(req.get("authorization"));
    if (!id) return res.status(401).json({ error: { code: "AUTH_REQUIRED" } });
    const input = confirmation.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: { code: "INVALID_REQUEST" } });

    const connection = new Client({ connectionString, connectionTimeoutMillis: 5000 });
    try {
      await connection.connect();
      await connection.query("BEGIN");
      // Lock only this account and only for deletion. Neon Auth can revoke child sessions
      // independently, and normal authorization skips this locked account.
      const proof = await connection.query(
        `select 1 from neon_auth."user" account
         join neon_auth.session session on session."userId" = account.id
         where account.id = $1 and session.token = $2 and session."impersonatedBy" is null
           and session."createdAt" >= now() - interval '10 minutes' and session."expiresAt" > now()
         for update of account skip locked`,
        [id, input.data.sessionToken],
      );
      if (!proof.rowCount) {
        await connection.query("ROLLBACK");
        return res.status(403).json({ error: { code: "RECENT_AUTH_REQUIRED" } });
      }
      await pool.query(
        `with revoked as (delete from neon_auth.session where "userId" = $1)
         select pg_notify('mirai_account_deletion', json_build_object('accountId', $1::text)::text)`,
        [id],
      );
      const warnings = new Set<AccountDeletionResource>();
      const { rows } = await connection.query<{ instance_id: string }>(
        "select instance_id from users.account_controllers where account_id = $1",
        [id],
      );
      await connection.query("SAVEPOINT drain_activity");
      try {
        await connection.query("SET LOCAL statement_timeout = '45s'");
        await connection.query(
          "select pg_advisory_xact_lock(hashtextextended(key, 0)) from unnest($1::text[]) as key",
          [[rows[0]?.instance_id, executionHandoffKey(id), accountActivityKey(id)].filter(Boolean)],
        );
        await connection.query("SET LOCAL statement_timeout = '0'");
      } catch {
        await connection.query("ROLLBACK TO SAVEPOINT drain_activity");
        warnings.add("activity");
      }
      await connection.query("RELEASE SAVEPOINT drain_activity");

      // Provider failures must never prevent the erasure of Mirai's own data.
      const deadline = AbortSignal.timeout(45_000);
      const [google, paddle] = await Promise.allSettled([
        removeGoogle(id, deadline, warnings),
        cancelPayments(id, deadline, warnings),
        attempt(
          () => storage.removeAccount(id, deadline),
          () => warnings.add("storage"),
        ),
      ]);
      if (google.status === "rejected") {
        warnings.add("sessions");
        warnings.add("interactions");
      }
      if (paddle.status === "rejected") warnings.add("paddle");

      await connection.query(
        "select 1 from billing.wallets where account_id = $1 order by environment for update",
        [id],
      );
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
      await connection.query('delete from neon_auth."user" where id = $1', [id]);
      await connection.query("COMMIT");
      return res.json(
        accountDeletionResultSchema.parse({ status: "complete", unconfirmed: [...warnings] }),
      );
    } catch (error) {
      await connection.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      await connection.end().catch(() => {});
    }
  });
  return router;
}
