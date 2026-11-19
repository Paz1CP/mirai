"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import type { ChatEvent } from "@mirai/contracts";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { CampaignSummary } from "./CampaignSummary";

export function ChatTranscript({
  events,
  loading,
  older,
  nextCursor,
  fetchOlder,
  children,
}: {
  events: ChatEvent[];
  loading: boolean;
  older: boolean;
  nextCursor?: string | null;
  fetchOlder: () => Promise<unknown>;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const label = t.conversation;
  const viewport = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLButtonElement>(null);
  const atEnd = useRef(true);
  const fetching = useRef(false);
  const anchor = useRef<{ height: number; top: number; first: string } | null>(null);
  const first = events[0]?.id;
  const last = events.at(-1);
  const replyById = new Map(
    events.flatMap((event) =>
      event.parts.flatMap((part) =>
        part.type === "tool" && part.direction === "result" && part.id ? [[part.id, part]] : [],
      ),
    ),
  );
  const callIds = new Set(
    events.flatMap((event) =>
      event.parts.flatMap((part) =>
        part.type === "tool" && part.direction === "call" && part.id ? [part.id] : [],
      ),
    ),
  );

  useLayoutEffect(() => {
    const scroll = viewport.current;
    if (!scroll) return;
    if (anchor.current && anchor.current.first !== first) {
      scroll.scrollTop = anchor.current.top + scroll.scrollHeight - anchor.current.height;
      anchor.current = null;
    } else if (!anchor.current && atEnd.current) {
      scroll.scrollTop = scroll.scrollHeight;
    }
  }, [first, last]);

  useEffect(() => {
    const element = sentinel.current;
    const root = viewport.current;
    if (!element || !root || !older) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) element.click();
      },
      { root, rootMargin: "96px 0px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [nextCursor, older]);
  async function readOlder() {
    const scroll = viewport.current;
    if (!scroll || fetching.current || !older) return;
    const position = first ? { height: scroll.scrollHeight, top: scroll.scrollTop, first } : null;
    if (position && scroll.scrollHeight > scroll.clientHeight) anchor.current = position;
    fetching.current = true;
    try {
      await fetchOlder();
    } finally {
      fetching.current = false;
      requestAnimationFrame(() => {
        if (anchor.current === position) anchor.current = null;
      });
    }
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]"
      ref={viewport}
      onScroll={(event) => {
        const node = event.currentTarget;
        atEnd.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
      }}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-5 sm:px-8">
        {older && (
          <button
            type="button"
            className="self-center rounded text-xs text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-ring"
            ref={sentinel}
            onClick={() => void readOlder()}
          >
            {label.older}
          </button>
        )}
        {loading ? (
          <Skeleton className="h-16 w-2/3" aria-label={label.loading} />
        ) : (
          events.map((event) => (
            <article
              key={event.id}
              className={
                event.role === "user"
                  ? "max-w-[90%] self-end rounded-2xl bg-secondary px-4 py-3 text-sm [content-visibility:auto] [contain-intrinsic-size:auto_3rem]"
                  : "space-y-3 text-sm [content-visibility:auto] [contain-intrinsic-size:auto_2.5rem]"
              }
            >
              {event.parts.map((part, index) => {
                if (part.type === "text")
                  return (
                    <p key={index} className="whitespace-pre-wrap wrap-break-word leading-relaxed">
                      {part.text}
                    </p>
                  );
                if (part.type === "campaign") return <CampaignSummary key={index} id={part.id} />;
                if (part.type === "reasoning")
                  return (
                    <details key={index} className="rounded-lg border border-border px-3 py-2">
                      <summary className="cursor-pointer text-muted-foreground">
                        {label.reasoning}
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap wrap-break-word">{part.text}</p>
                    </details>
                  );
                if (part.direction === "result" && part.id && callIds.has(part.id)) return null;
                const result = part.id ? replyById.get(part.id) : undefined;
                return (
                  <details
                    key={part.id ?? index}
                    className="rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <summary className="cursor-pointer text-muted-foreground">{part.name}</summary>
                    <dl className="mt-2 space-y-2">
                      {[part, ...(result && result !== part ? [result] : [])].map((item) => (
                        <div key={item.direction}>
                          <dt className="text-xs text-muted-foreground">
                            {item.direction === "call" ? label.toolCall : label.toolResult}
                          </dt>
                          {item.data !== undefined && (
                            <dd>
                              <pre className="mt-1 max-h-52 overflow-auto whitespace-pre-wrap wrap-break-word text-xs">
                                {JSON.stringify(item.data, null, 2)}
                              </pre>
                            </dd>
                          )}
                        </div>
                      ))}
                    </dl>
                  </details>
                );
              })}
            </article>
          ))
        )}
        {children}
      </div>
    </div>
  );
}
