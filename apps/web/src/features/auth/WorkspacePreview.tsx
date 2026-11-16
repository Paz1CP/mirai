import Image from "next/image";
import {
  Add,
  ArrowRight2,
  Briefcase,
  Category,
  DocumentText,
  Global,
  Message,
  SearchNormal1,
  Send2,
  User,
} from "iconsax-reactjs";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/shared/i18n/I18nProvider";

export function WorkspacePreview() {
  const { t } = useI18n();
  const navigation = [
    [Message, t.chat],
    [Category, t.dashboard],
    [Briefcase, t.applications],
    [DocumentText, t.documents],
    [User, t.profile],
  ] as const;
  const suggestions = [
    [SearchNormal1, t.suggestionSearch],
    [DocumentText, t.suggestionCV],
    [Briefcase, t.suggestionRemote],
  ] as const;
  return (
    <div
      inert
      aria-hidden="true"
      className="flex h-svh overflow-hidden bg-background p-2 text-foreground"
    >
      <aside className="flex w-52 shrink-0 flex-col gap-7 px-3 py-4">
        <div className="flex items-center gap-3 text-2xl font-semibold">
          <Image src="/images/mirai_logo.svg" width={28} height={17} alt="" />
          mirai
        </div>
        <Button variant="outline" className="h-11 justify-start">
          <Add />
          {t.newChat}
        </Button>
        <nav className="space-y-1">
          {navigation.map(([Icon, label], index) => (
            <div
              key={label}
              className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm ${index === 0 ? "bg-muted" : "text-muted-foreground"}`}
            >
              <Icon size={20} />
              {label}
            </div>
          ))}
        </nav>
      </aside>
      <div className="grid min-w-0 flex-1 gap-2 lg:grid-cols-[1.2fr_1fr]">
        <section className="flex min-w-0 flex-col rounded-3xl border border-border">
          <header className="border-b border-border px-6 py-5 text-sm font-semibold">
            {t.chatTitle}
          </header>
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-input bg-card">
              <Image src="/images/mirai_logo.svg" width={34} height={20} alt="" />
            </div>
            <h2 className="text-[28px] font-semibold">{t.welcome}</h2>
            <p className="max-w-md text-sm text-muted-foreground">{t.welcomeDescription}</p>
            <div className="w-full max-w-xl space-y-2">
              {suggestions.map(([Icon, label]) => (
                <div
                  key={label}
                  className="flex h-11 items-center gap-3 rounded-xl border border-border bg-card px-3 text-left text-sm"
                >
                  <Icon size={18} />
                  <span className="flex-1">{label}</span>
                  <ArrowRight2 size={16} />
                </div>
              ))}
            </div>
          </div>
          <div className="m-6 rounded-3xl border border-input bg-muted p-4 text-sm text-muted-foreground">
            <p>{t.composerPlaceholder}</p>
            <div className="mt-3 flex items-center justify-between">
              <Add size={20} />
              <span className="rounded-xl bg-primary p-2 text-primary-foreground">
                <Send2 size={18} />
              </span>
            </div>
          </div>
        </section>
        <section className="hidden flex-col rounded-3xl border border-border bg-card lg:flex">
          <div className="flex h-12 items-center gap-2 border-b border-border bg-secondary px-4 text-xs">
            <Global size={16} />
            {t.browserTab}
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            <Global size={42} />
            <h2 className="text-xl font-semibold">{t.browserTitle}</h2>
            <p className="max-w-sm text-sm text-muted-foreground">{t.browserDescription}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
