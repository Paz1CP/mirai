import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ token: vi.fn(), listen: vi.fn() }));
vi.mock("@neon/auth/next", () => ({
  createAuthClient: () => ({ token: mocks.token, $store: { listen: mocks.listen } }),
}));
import { accessToken, clearAccessToken } from "./client";

function jwt(expires: number) {
  return `header.${btoa(JSON.stringify({ exp: expires })).replace(/=/g, "")}.signature`;
}

describe("accessToken", () => {
  beforeEach(() => {
    clearAccessToken();
    mocks.token.mockReset();
  });

  it("shares concurrent requests, reuses a valid token and refreshes near expiry", async () => {
    const current = Math.floor(Date.now() / 1000);
    const first = jwt(current + 120);
    const next = jwt(current + 20);
    mocks.token.mockResolvedValueOnce({ data: { token: first } });
    expect(await Promise.all([accessToken(), accessToken()])).toEqual([first, first]);
    expect(await accessToken()).toBe(first);
    expect(mocks.token).toHaveBeenCalledTimes(1);
    clearAccessToken();
    mocks.token.mockResolvedValueOnce({ data: { token: next } });
    mocks.token.mockResolvedValueOnce({ data: { token: first } });
    expect(await accessToken()).toBe(next);
    expect(await accessToken()).toBe(first);
    expect(mocks.token).toHaveBeenCalledTimes(3);
  });

  it("does not cache a request completed after the session changes", async () => {
    let finish!: (result: unknown) => void;
    mocks.token.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const old = accessToken();
    clearAccessToken();
    finish({ data: { token: jwt(Math.floor(Date.now() / 1000) + 120) } });
    expect(await old).toBeNull();
    mocks.token.mockResolvedValueOnce({ data: null, error: {} });
    expect(await accessToken()).toBeNull();
    expect(mocks.token).toHaveBeenCalledTimes(2);
  });
});
