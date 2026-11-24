import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Pool } from "pg";
import { hasActiveSession } from "./accountActivity.js";

export function createIdentityVerifier(baseUrl: string, pool: Pick<Pool, "query">) {
  const issuer = new URL(baseUrl).origin;
  const keys = createRemoteJWKSet(new URL(`${baseUrl.replace(/\/$/, "")}/.well-known/jwks.json`));
  return async (authorization?: string) => {
    if (!authorization?.startsWith("Bearer ")) return null;
    const verified = await jwtVerify(authorization.slice(7), keys, {
      issuer,
      audience: issuer,
      algorithms: ["EdDSA"],
      requiredClaims: ["sub", "exp", "iat"],
    }).catch(() => null);
    const payload = verified?.payload;
    if (!payload?.sub || payload.role !== "authenticated" || payload.banned === true) return null;
    return (await hasActiveSession(pool, payload.sub, payload.iat)) ? payload.sub : null;
  };
}
