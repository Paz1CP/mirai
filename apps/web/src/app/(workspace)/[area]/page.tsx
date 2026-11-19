import { notFound } from "next/navigation";
import { WorkspaceView } from "@/features/sessions/WorkspaceView";
import { workspaceAreas } from "@/features/sessions/workspaceRoutes";
export default async function AreaPage({
  params,
}: {
  params: Promise<{ area: string }>;
}) {
  const area = (await params).area;
  if (!workspaceAreas.some((item) => item === area)) notFound();
  return <WorkspaceView />;
}
