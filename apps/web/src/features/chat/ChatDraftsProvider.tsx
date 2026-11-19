"use client";

import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

type Drafts = Map<string | undefined, string>;
const ChatDrafts = createContext<[Drafts, Dispatch<SetStateAction<Drafts>>] | null>(null);

export function ChatDraftsProvider({ children }: { children: ReactNode }) {
  const drafts = useState<Drafts>(() => new Map());
  return <ChatDrafts.Provider value={drafts}>{children}</ChatDrafts.Provider>;
}

export function useChatDraft(chatId?: string) {
  const context = useContext(ChatDrafts);
  if (!context) throw new Error("ChatDraftsProvider is missing");
  const [drafts, setDrafts] = context;
  const setText: Dispatch<SetStateAction<string>> = (update) => {
    setDrafts((current) => {
      const previous = current.get(chatId) ?? "";
      const next = typeof update === "function" ? update(previous) : update;
      if (previous === next) return current;
      const changed = new Map(current);
      if (next) changed.set(chatId, next);
      else changed.delete(chatId);
      return changed;
    });
  };
  return [drafts.get(chatId) ?? "", setText] as const;
}
