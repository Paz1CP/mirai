"use client";
import type { Dispatch, SetStateAction } from "react";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/shared/i18n/I18nProvider";
import type { ProfilePermissions } from "./profileApi";

export function PermissionsEditor({
  permissions,
  setPermissions,
}: {
  permissions: ProfilePermissions;
  setPermissions: Dispatch<SetStateAction<ProfilePermissions>>;
}) {
  const { t } = useI18n();
  const p = t.professional;
  const items = [
    ["allow_job_portals", p.jobPortals, p.jobPortalsHelp],
    ["allow_portal_messages", p.portalMessages, p.portalMessagesHelp],
    ["allow_email", p.emailPermission, p.emailHelp],
  ] as const;
  return (
    <section className="mx-auto w-full max-w-3xl space-y-6" aria-label={p.permissions}>
      <div className="divide-y divide-border rounded-2xl border border-border bg-card px-6">
        {items.map(([key, title, description]) => (
          <label key={key} className="flex cursor-pointer items-center justify-between gap-6 py-6">
            <span className="space-y-2">
              <span className="block font-medium">{title}</span>
              <span className="block text-sm text-muted-foreground">{description}</span>
            </span>
            <Switch
              checked={permissions[key]}
              onCheckedChange={(checked) =>
                setPermissions((current) => ({ ...current, [key]: checked }))
              }
              aria-label={title}
            />
          </label>
        ))}
      </div>
      <p className="text-center text-sm text-muted-foreground">{p.permissionHelp}</p>
    </section>
  );
}
