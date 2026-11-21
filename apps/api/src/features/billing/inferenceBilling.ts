import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
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
    const open = () =>
      wallets.withWallet(accountId, environment, async (wallet) => {
        if ((await wallet.totals()).available <= 0n) return "INSUFFICIENT_CREDITS";
        const [pending] = await wallet.tx
          .select({ key: ledger.key })
          .from(ledger)
          .where(
            and(
              wallet.ledgerScope,
              eq(ledger.kind, "inference_pending"),
              sql`not exists (
          select 1 from billing.ledger settled
          where settled.account_id = ${ledger.accountId} and settled.environment = ${ledger.environment}
          and settled.movement_key = 'settled:' || ${ledger.key}
        )`,
            ),
          )
          .limit(1);
        if (pending) {
          const entry = await wallet.findMovement(`provider:${pending.key}`);
          return { pendingId: pending.key, providerId: entry?.details.providerId };
        }
        const id = randomUUID();
        const tariff = inferenceTariff(model, region, wallet.now);
        await wallet.movement(id, "inference_pending", 0n, { operation, tariff });
        return { id, tariff, operation };
      });
    let result = await open();
    if (
      typeof result === "object" &&
      "pendingId" in result &&
      typeof result.providerId === "string"
    ) {
      if (await reconcile(accountId, result.pendingId, result.providerId)) result = await open();
    }
    if (typeof result === "string")
      throw new BillingError(result, result === "INSUFFICIENT_CREDITS" ? 402 : 409);
    if ("pendingId" in result) throw new BillingError("BILLING_USAGE_PENDING", 409);
    return result;
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
      !interaction ||
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

  async function rememberProviderId(accountId: string, id: string, providerId: string) {
    await wallets.withWallet(accountId, environment, async (wallet) => {
      if (!(await wallet.findMovement(id))) throw new BillingError("BILLING_USAGE_PENDING", 409);
      const key = `provider:${id}`;
      if (!(await wallet.findMovement(key)))
        await wallet.movement(key, "event", 0n, { providerId });
    });
  }

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
        const { collected, allocations } = await wallet.debit(charge);
        await wallet.movement(key, "usage", -collected, {
          ...inference,
          usage,
          providerId,
          allocations,
          googleCost: googleCost.toString(),
          charge: charge.toString(),
        });
        await wallet.publish();
      }
      return { ...(await wallet.totals()), environment };
    });
  }

  async function releaseRejected(accountId: string, inference: Inference, status: number) {
    await wallets.withWallet(accountId, environment, async (wallet) => {
      const key = `settled:${inference.id}`;
      if (!(await wallet.findMovement(key)))
        await wallet.movement(key, "inference_released", 0n, { status });
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
    if (!usage) throw new BillingError("BILLING_USAGE_PENDING", 409);
    await settle(accountId, inference, usage);
    return response;
  }

  return { begin, ensureCredit, rememberProviderId, recover, settle, releaseRejected, generate };
}
