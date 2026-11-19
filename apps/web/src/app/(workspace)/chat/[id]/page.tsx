import { chatIdSchema } from "@mirai/contracts";
import { notFound } from "next/navigation";
import { ChatWorkspace } from "@/features/chat/ChatWorkspace";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const id = chatIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  return <ChatWorkspace key={id.data} chatId={id.data} />;
}
