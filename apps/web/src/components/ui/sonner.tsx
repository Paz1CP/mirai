"use client";

import { useI18n } from "@/shared/i18n/I18nProvider";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { Warning2 as TriangleAlertIcon, Refresh as Loader2Icon } from "iconsax-reactjs";

const Toaster = ({ ...props }: ToasterProps) => {
  const { t } = useI18n();

  return (
    <Sonner
      theme="dark"
      position="top-right"
      duration={4500}
      containerAriaLabel={t.notifications}
      customAriaLabel={t.notifications}
      className="toaster group"
      icons={{
        success: (
          <span className="text-success" aria-hidden="true">
            ✓
          </span>
        ),
        info: <span aria-hidden="true">i</span>,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: (
          <span className="text-destructive" aria-hidden="true">
            ×
          </span>
        ),
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
