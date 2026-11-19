"use client";

import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { z } from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { OnboardingGate } from "@/features/profiles/OnboardingGate";
import { ProfessionalPage } from "@/features/profiles/ProfessionalPage";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { workspaceRoute } from "./workspaceRoutes";

function LoadingView() {
  const { t } = useI18n();
  return (
    <div className="space-y-4 p-5 lg:p-8" aria-busy="true" aria-label={t.loadingView}>
      <Skeleton className="h-8 w-44" />
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  );
}

const Chat = dynamic(
  () => import("@/features/chat/ChatWorkspace").then((mod) => mod.ChatWorkspace),
  {
    loading: LoadingView,
  },
);
const Dashboard = dynamic(
  () => import("@/features/dashboard/DashboardPage").then((mod) => mod.DashboardPage),
  {
    loading: LoadingView,
  },
);
const Applications = dynamic(
  () => import("@/features/applications/ApplicationsPage").then((mod) => mod.ApplicationsPage),
  {
    loading: LoadingView,
  },
);
const Library = dynamic(() => import("@/features/cvs/CvLibrary").then((mod) => mod.CvLibrary), {
  loading: LoadingView,
});
const documentReference = z.object({ kind: z.enum(["cv", "original"]), id: z.uuid() });

export function WorkspaceView() {
  const route = workspaceRoute(usePathname());
  const query = useSearchParams();
  if (!route) return null;
  switch (route.area) {
    case "chat":
      return "chatId" in route ? (
        <Chat key={route.chatId} chatId={route.chatId} />
      ) : (
        <OnboardingGate>
          <Chat />
        </OnboardingGate>
      );
    case "dashboard":
      return <Dashboard />;
    case "applications":
      return <Applications />;
    case "documents": {
      const kinds = query.getAll("kind");
      const ids = query.getAll("id");
      const reference = documentReference.safeParse({
        kind: kinds.length === 1 ? kinds[0] : undefined,
        id: ids.length === 1 ? ids[0] : undefined,
      });
      return (
        <OnboardingGate>
          <Library key={reference.data?.id ?? "library"} reference={reference.data} />
        </OnboardingGate>
      );
    }
    case "profile":
      return <ProfessionalPage />;
  }
}
