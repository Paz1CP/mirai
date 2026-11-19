"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { defaultChatGeneration, type ChatGeneration } from "@mirai/contracts";

const ChatGenerationContext = createContext<{
  generation: ChatGeneration;
  setGeneration: (generation: ChatGeneration) => void;
} | null>(null);

export function ChatGenerationProvider({ children }: { children: ReactNode }) {
  const [generation, setGeneration] = useState(defaultChatGeneration);
  return (
    <ChatGenerationContext.Provider value={{ generation, setGeneration }}>
      {children}
    </ChatGenerationContext.Provider>
  );
}

export function useChatGeneration() {
  const selection = useContext(ChatGenerationContext);
  if (!selection) throw new Error("ChatGenerationProvider is missing");
  return selection;
}
