import { redirect } from "next/navigation";
import { getAuth } from "@/shared/auth/server";
import { WorkspaceShell } from "@/features/sessions/WorkspaceShell";
import type { ReactNode } from "react";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { data } = await getAuth().getSession();
  if (!data?.user) redirect("/auth/sign-in");
  return (
    <WorkspaceShell key={data.user.id} accountId={data.user.id} name={data.user.name}>
      {children}
    </WorkspaceShell>
  );
}
