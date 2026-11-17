import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist } from "next/font/google";
import "../styles/globals.css";
import { getLocale } from "@/shared/i18n/server";
import { headers } from "next/headers";
import { I18nProvider } from "@/shared/i18n/I18nProvider";
import { DesktopOnly } from "@/shared/DesktopOnly";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({ subsets: ["latin"], display: "swap", variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Mirai",
  description: "Mirai",
  icons: { icon: "/images/mirai_logo.svg" },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const agent = (await headers()).get("user-agent") ?? "";
  const mobile = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(agent);
  return (
    <html lang={locale} className="dark">
      <body className={`${geist.className} ${geist.variable}`}>
        <I18nProvider locale={locale}>
          {mobile ? <DesktopOnly /> : children}
          <Toaster />
        </I18nProvider>
      </body>
    </html>
  );
}
