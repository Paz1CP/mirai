import { createServer } from "node:http";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { expect, it } from "vitest";
import { createIdentityVerifier } from "./verifyIdentity.js";

it("accepts a signed authenticated identity and rejects altered, expired and foreign tokens", async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(publicKey);
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ keys: [{ ...jwk, kid: "test" }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server");
  const origin = `http://127.0.0.1:${address.port}`;
  const verify = createIdentityVerifier(`${origin}/auth`);
  const token = (role = "authenticated", audience = origin, expiration = "1m") =>
    new SignJWT({ role })
      .setProtectedHeader({ alg: "EdDSA", kid: "test" })
      .setSubject("candidate-test")
      .setIssuer(origin)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(expiration)
      .sign(privateKey);
  try {
    const valid = await token();
    expect(await verify(`Bearer ${valid}`)).toBe("candidate-test");
    expect(await verify()).toBeNull();
    expect(await verify(`Bearer ${valid.slice(0, -8)}abcdefgh`)).toBeNull();
    expect(await verify(`Bearer ${await token("anonymous")}`)).toBeNull();
    expect(
      await verify(`Bearer ${await token("authenticated", "https://other.example")}`),
    ).toBeNull();
    expect(await verify(`Bearer ${await token("authenticated", origin, "-1s")}`)).toBeNull();
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
