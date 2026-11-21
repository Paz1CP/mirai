import express, { type NextFunction, type Request, type Response } from "express";
import {
  billingEnvironmentSchema,
  billingPackageSchema,
  billingSummarySchema,
} from "@mirai/contracts";
import { z } from "zod";
import { paddleConfiguration, paddleEventSchema, verifyPaddleSignature } from "./paddleClient.js";
import type { createPaddleBilling } from "./paddleBilling.js";
import { BillingError, type createWalletRepository } from "./walletRepository.js";

export function createBillingRoutes(
  verifyIdentity: (header?: string) => Promise<string | null>,
  wallets: ReturnType<typeof createWalletRepository>,
  paddle: ReturnType<typeof createPaddleBilling>,
  environment: z.infer<typeof billingEnvironmentSchema>,
) {
  const router = express.Router();
  router.post(
    "/paddle/:environment/webhook",
    express.raw({ type: "application/json", limit: "256kb", inflate: false }),
    async (req, res) => {
      const mode = billingEnvironmentSchema.parse(req.params.environment);
      const secret = paddleConfiguration(mode).webhookSecret;
      if (!secret) throw new BillingError("BILLING_UNAVAILABLE", 503);
      const signature = req.get("Paddle-Signature");
      if (
        !Buffer.isBuffer(req.body) ||
        !signature ||
        !verifyPaddleSignature(req.body, signature, secret)
      )
        throw new BillingError("INVALID_WEBHOOK_SIGNATURE", 401);
      let body: unknown;
      try {
        body = JSON.parse(req.body.toString("utf8"));
      } catch {
        throw new BillingError("INVALID_WEBHOOK_BODY", 400);
      }
      await paddle.webhook(mode, paddleEventSchema.parse(body));
      res.status(200).end();
    },
  );
  router.use(async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const accountId = await verifyIdentity(req.headers.authorization);
    if (!accountId) return res.status(401).json({ error: { code: "AUTH_REQUIRED" } });
    res.locals.accountId = accountId;
    return next();
  });
  router.get("/", async (_req, res) => {
    res.json(billingSummarySchema.parse(await wallets.summary(res.locals.accountId, environment)));
  });
  router.post("/checkout", express.json({ limit: "1kb" }), async (req, res) => {
    const { packageUsd } = z.object({ packageUsd: billingPackageSchema }).strict().parse(req.body);
    res.status(201).json(await paddle.checkout(res.locals.accountId, environment, packageUsd));
  });
  router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof BillingError)
      return res.status(error.status).json({ error: { code: error.code } });
    if (error instanceof z.ZodError)
      return res.status(400).json({ error: { code: "INVALID_BILLING_REQUEST" } });
    return next(error);
  });
  return router;
}
