import { getLocale } from "@/shared/i18n/server";
import { messages } from "@/shared/i18n/catalog";
import { OnboardingGate } from "@/features/profiles/OnboardingGate";
export default async function HomePage() {
  const t = messages[await getLocale()];
  return (
    <OnboardingGate><div className="grid min-h-[70svh] flex-1 lg:grid-cols-[1.2fr_1fr]">
      <section className="flex flex-col items-center justify-center gap-6 px-8 text-center">
        <h2 className="text-3xl font-semibold tracking-tight">{t.welcome}</h2>
        <p className="text-sm text-muted-foreground">{t.welcomeDescription}</p>
      </section>
      <section className="flex flex-col items-center justify-center gap-4 border-t border-border px-8 py-12 text-center lg:border-s lg:border-t-0">
        <h2 className="text-xl font-semibold">{t.browserTitle}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{t.browserDescription}</p>
      </section>
    </div></OnboardingGate>
  );
}
