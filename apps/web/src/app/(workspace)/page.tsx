import { ChatWorkspace } from "@/features/chat/ChatWorkspace";
import { OnboardingGate } from "@/features/profiles/OnboardingGate";

export default function HomePage() {
  return (
    <OnboardingGate>
      <ChatWorkspace />
    </OnboardingGate>
  );
}
