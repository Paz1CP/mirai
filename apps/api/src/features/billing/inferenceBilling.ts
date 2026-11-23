import { randomUUID } from "node:crypto";
import { and, asc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ApiError, GoogleGenAI, type GenerateContentResponseUsageMetadata } from "@google/genai";
import { ledger, type BillingEnvironment } from "./schema.js";
import {
  inferenceTariff,
  priceInference,
  reportedUsage,
  type InferenceTariff,
  type InferenceUsage,
} from "./pricing.js";
import { BillingError, type createWalletRepository } from "./walletRepository.js";

type WalletRepository = ReturnType<typeof createWalletRepository>;
export type InferenceOperation = "chat" | "compaction" | "cv_extraction";
export function rejectedBeforeGeneration(error: unknown): error is ApiError {
  return error instanceof ApiError && [400, 401, 403, 404, 429].includes(error.status);
}
type Inference = { id: string; tariff: InferenceTariff; operation: InferenceOperation };
const interactionRetentionMs = 7 * 24 * 60 * 60 * 1_000;
const settled = alias(ledger, "settled");
const settlementForInference = and(
  eq(settled.accountId, ledger.accountId),
  eq(settled.environment, ledger.environment),
  eq(settled.key, sql`'settled:' || ${ledger.key}`),
);

export function createInferenceBilling(wallets: WalletRepository, environment: BillingEnvironment) {
  const google = new GoogleGenAI({
    enterprise: true,
    project: process.env.GOOGLE_CLOUD_PROJECT ?? "mirai-514723",
    location: process.env.GOOGLE_CLOUD_LOCATION ?? "global",
  });

  async function ensureCredit(accountId: string) {
    const available = await wallets.withWallet(
      accountId,
      environment,
      async (wallet) => (await wallet.totals()).available,
    );
    if (available <= 0n) throw new BillingError("INSUFFICIENT_CREDITS", 402);
  }

  async function begin(
    accountId: string,
    operation: InferenceOperation,
    model: string,
    region: string,
  ): Promise<Inference> {
    const result = await wallets.withWallet(accountId, environment, async (wallet) => {
      const { available } = await wallet.totals();
      if (available <= 0n) return "INSUFFICIENT_CREDITS";
      const id = randomUUID();
      const tariff = inferenceTariff(model, region, wallet.now);
      await wallet.movement(id, "inference_pending", 0n, { operation, tariff });
      return { id, tariff, operation };
    });
    if (result === "INSUFFICIENT_CREDITS") throw new BillingError(result, 402);
    return result;
  }

  async function reconcilePending(accountId: string) {
    const provider = alias(ledger, "provider");
    const pending = await wallets.withWallet(accountId, environment, async (wallet) => {
      const cutoff = new Date(wallet.now.getTime() - interactionRetentionMs);
      const candidates = await wallet.tx
        .select({
          id: ledger.key,
          at: ledger.at,
          providerAt: provider.at,
          provider: provider.details,
        })
        .from(ledger)
        .leftJoin(
          provider,
          and(
            eq(provider.accountId, ledger.accountId),
            eq(provider.environment, ledger.environment),
            eq(provider.key, sql`'provider:' || ${ledger.key}`),
          ),
        )
        .leftJoin(settled, settlementForInference)
        .where(
          and(
            wallet.ledgerScope,
            eq(ledger.kind, "inference_pending"),
            isNull(settled.key),
            or(isNotNull(provider.key), lte(ledger.at, cutoff)),
          ),
        )
        .orderBy(asc(ledger.at), asc(ledger.key))
        .limit(8);
      return candidates.map(({ id, at, providerAt, provider }) => ({
        id,
        expired: (providerAt ?? at) <= cutoff,
        providerId: provider?.providerId,
      }));
    });
    await Promise.all(
      pending.map(async ({ id, expired, providerId }) => {
        if (typeof providerId === "string" && (await reconcile(accountId, id, providerId))) return;
        if (expired) await closeUnverified(accountId, id);
      }),
    );
  }

  async function reconcile(accountId: string, pendingId: string, providerId: string) {
    const interaction = await google.interactions
      .get(
        providerId,
        { stream: false },
        {
          signal: AbortSignal.timeout(5_000),
        },
      )
      .catch(() => undefined);
    if (
      interaction?.id !== providerId ||
      ![
        "completed",
        "requires_action",
        "failed",
        "cancelled",
        "incomplete",
        "budget_exceeded",
      ].includes(interaction.status)
    )
      return false;
    const data = interaction.usage;
    const usage = reportedUsage(
      data?.total_input_tokens,
      data?.total_cached_tokens,
      data?.total_output_tokens,
      data?.total_thought_tokens,
      data?.total_tool_use_tokens,
      data?.total_tokens,
    );
    if (!usage) return false;
    const inference = await recover(accountId, pendingId);
    await settle(accountId, inference, usage, interaction.id);
    return true;
  }

  const rememberProviderId = (accountId: string, id: string, providerId: string) =>
    wallets.rememberProviderId(accountId, environment, id, providerId);

  function recover(accountId: string, id: string) {
    return wallets.withWallet(accountId, environment, async (wallet) => {
      const entry = await wallet.findMovement(id);
      if (!entry || entry.kind !== "inference_pending")
        throw new BillingError("BILLING_USAGE_PENDING", 409);
      return {
        id,
        tariff: entry.details.tariff as InferenceTariff,
        operation: entry.details.operation as InferenceOperation,
      };
    });
  }

  async function settle(
    accountId: string,
    inference: Inference,
    usage: InferenceUsage,
    providerId?: string,
  ) {
    return wallets.withWallet(accountId, environment, async (wallet) => {
      const key = `settled:${inference.id}`;
      if (!(await wallet.findMovement(key))) {
        const { googleCost, charge } = priceInference(inference.tariff, usage);
        const { collected, uncollected, allocations } = await wallet.debit(charge);
        await wallet.movement(key, "usage", -collected, {
          ...inference,
          usage,
          providerId,
          allocations,
          googleCost: googleCost.toString(),
          charge: charge.toString(),
          collected: collected.toString(),
          uncollected: uncollected.toString(),
        });
        wallet.markChanged(collected > 0n);
      }
      return { ...(await wallet.totals()), environment };
    });
  }

  async function release(accountId: string, id: string, details: Record<string, unknown>) {
    await wallets.withWallet(accountId, environment, async (wallet) => {
      const key = `settled:${id}`;
      if (!(await wallet.findMovement(key)))
        await wallet.movement(key, "inference_released", 0n, details);
    });
  }

  function releaseRejected(accountId: string, inference: Inference, status: number) {
    return release(accountId, inference.id, { status });
  }

  function closeUnverified(accountId: string, id: string, providerMayBeRunning = false) {
    return release(accountId, id, {
      reason: "usage_unavailable",
      ...(providerMayBeRunning && { providerMayBeRunning }),
    });
  }

  async function generate<T>(
    accountId: string,
    operation: InferenceOperation,
    model: string,
    region: string,
    call: () => Promise<T>,
    metadata: (response: T) => GenerateContentResponseUsageMetadata | undefined,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    const inference = await begin(accountId, operation, model, region);
    if (signal?.aborted) {
      // The request has not reached Google.
      await releaseRejected(accountId, inference, 499);
      signal.throwIfAborted();
    }
    let response: T;
    try {
      response = await call();
    } catch (error) {
      if (rejectedBeforeGeneration(error))
        await releaseRejected(accountId, inference, error.status);
      else await closeUnverified(accountId, inference.id, true);
      throw error;
    }
    const data = metadata(response);
    const usage = reportedUsage(
      data?.promptTokenCount,
      data?.cachedContentTokenCount,
      data?.candidatesTokenCount,
      data?.thoughtsTokenCount,
      data?.toolUsePromptTokenCount,
      data?.totalTokenCount,
    );
    if (!usage) {
      await closeUnverified(accountId, inference.id);
      throw new BillingError("AI_UNAVAILABLE", 502);
    }
    await settle(accountId, inference, usage);
    return response;
  }

  return {
    begin,
    ensureCredit,
    rememberProviderId,
    recover,
    settle,
    releaseRejected,
    closeUnverified,
    reconcilePending,
    generate,
  };
}
