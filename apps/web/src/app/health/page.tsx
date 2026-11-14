import { healthResponseSchema } from "@mirai/contracts";

export default async function HealthPage() {
  const apiUrl = process.env.API_URL ?? "http://localhost:4000";
  let connected = false;

  try {
    const response = await fetch(`${apiUrl}/health`, { cache: "no-store" });
    if (response.ok) {
      const body: unknown = await response.json();
      connected = healthResponseSchema.safeParse(body).success;
    }
  } catch {
    connected = false;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-black text-white">
      <h1 className="text-2xl font-semibold">Mirai connectivity</h1>
      <p>API: {connected ? "connected" : "unavailable"}</p>
    </main>
  );
}
