import { chatIdSchema } from "@mirai/contracts";
import { notFound } from "next/navigation";
import { WorkspaceView } from "@/features/sessions/WorkspaceView";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const id = chatIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  return <WorkspaceView />;
}
