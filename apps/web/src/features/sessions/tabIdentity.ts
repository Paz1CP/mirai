const storageKey = "mirai-instance-id";

// Hold a browser lock so duplicating a tab cannot duplicate its operational identity.
export async function claimTabIdentity(onClaim: (id: string) => void, signal: AbortSignal) {
  const saved = sessionStorage.getItem(storageKey);
  const candidate = saved && /^[a-f0-9-]{36}$/.test(saved) ? saved : crypto.randomUUID();
  if (!navigator.locks) {
    onClaim(crypto.randomUUID());
    return;
  }
  const hold = (id: string) => {
    if (signal.aborted) return;
    sessionStorage.setItem(storageKey, id);
    onClaim(id);
    return new Promise<void>((resolve) =>
      signal.addEventListener("abort", () => resolve(), { once: true }),
    );
  };
  await navigator.locks.request(`mirai:${candidate}`, { ifAvailable: true }, async (lock) => {
    if (lock) await hold(candidate);
    else {
      // A previous document or Strict Mode cleanup may still be releasing its lock.
      await new Promise((resolve) => setTimeout(resolve, 100));
      await navigator.locks.request(`mirai:${candidate}`, { ifAvailable: true }, async (retry) => {
        if (retry) await hold(candidate);
        else {
          const id = crypto.randomUUID();
          await navigator.locks.request(`mirai:${id}`, () => hold(id));
        }
      });
    }
  });
}
