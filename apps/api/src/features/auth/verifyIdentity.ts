import { createRemoteJWKSet, jwtVerify } from "jose";

export function createIdentityVerifier(baseUrl: string) {
  const issuer = new URL(baseUrl).origin;
  const keys = createRemoteJWKSet(new URL(`${baseUrl.replace(/\/$/, "")}/.well-known/jwks.json`));
  return async (authorization?: string) => {
    if (!authorization?.startsWith("Bearer ")) return null;
    try {
      const { payload } = await jwtVerify(authorization.slice(7), keys, {
        issuer,
        audience: issuer,
        algorithms: ["EdDSA"],
        requiredClaims: ["sub", "exp", "iat"],
      });
      if (!payload.sub || payload.role !== "authenticated" || payload.banned === true) return null;
      return payload.sub;
    } catch {
      return null;
    }
  };
}
