"use client";

import { memo, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { ChatEvent, ChatTurn } from "@mirai/contracts";
import { ArrowRight2, Briefcase, DocumentText, Global, Setting2, User } from "iconsax-reactjs";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { CampaignSummary } from "./CampaignSummary";
import { recordFirstChatContent } from "./chatTiming";

const MessageMarkdown = memo(function MessageMarkdown({ text }: { text: string }) {
  return <Markdown remarkPlugins={[remarkGfm]} skipHtml>{text}</Markdown>;
});

export function ChatTranscript({
  events,
  pendingMessageId,
  activeTurn,
  streamDisconnected,
  loading,
  older,
  nextCursor,
  fetchOlder,
  children,
}: {
  events: ChatEvent[];
  pendingMessageId?: string;
  activeTurn?: ChatTurn;
  streamDisconnected?: boolean;
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
  const newestContent = events.findLast((event) => event.role === "assistant" && event.turnId && event.parts.length);
  useLayoutEffect(() => {
    if (newestContent?.turnId) recordFirstChatContent(newestContent.turnId);
  }, [newestContent]);
  const turns = new Map<string, { user?: ChatEvent; replies: ChatEvent[] }>();
  let turnId = "previous";
  for (const event of events) {
    if (event.role === "user") {
      turnId = event.id;
      const replies = turns.get(turnId)?.replies ?? [];
      turns.set(turnId, { user: event, replies });
    } else {
      const id = event.turnId ?? turnId;
      const turn = turns.get(id) ?? { replies: [] };
      turn.replies.push(event);
      turns.set(id, turn);
    }
  }
  if (activeTurn && !turns.has(activeTurn.id)) turns.set(activeTurn.id, { replies: [] });
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
    if (pendingMessageId) {
      anchor.current = null;
      scroll.scrollTop = scroll.scrollHeight;
    } else if (anchor.current && anchor.current.first !== first) {
      scroll.scrollTop = anchor.current.top + scroll.scrollHeight - anchor.current.height;
      anchor.current = null;
    } else if (!anchor.current && atEnd.current) {
      scroll.scrollTop = scroll.scrollHeight;
    }
  }, [first, last, activeTurn?.id, pendingMessageId]);

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
          [...turns].map(([id, { user, replies }]) => {
            // Text emitted before a tool call belongs to the activity, not the final answer.
            const lastActivity = replies.findLastIndex(
              (event) =>
                event.parts.some((part) => part.type === "tool"),
            );
            const activity: ReactNode[] = [];
            const answer: ReactNode[] = [];
            const cards: ReactNode[] = [];
            let thinkingMs: number | undefined;
            replies.forEach((event, eventIndex) => {
              event.parts.forEach((part, index) => {
                const key = `${event.id}:${index}`;
                if (part.type === "campaign") {
                  cards.push(<CampaignSummary key={key} id={part.id} />);
                } else if (part.type === "reasoning" || part.type === "text") {
                  const isAnswer = part.type === "text" && eventIndex > lastActivity;
                  if (isAnswer) thinkingMs ??= event.thinkingMs;
                  (isAnswer ? answer : activity).push(
                    <div
                      key={key}
                      className="space-y-3 wrap-break-word leading-relaxed [&_a]:text-primary [&_a]:underline [&_blockquote]:border-s-2 [&_blockquote]:border-border [&_blockquote]:ps-3 [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:ps-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-secondary [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2 [&_ul]:list-disc [&_ul]:ps-5"
                    >
                      <MessageMarkdown text={part.text} />
                    </div>,
                  );
                } else if (part.direction !== "result" || !part.id || !callIds.has(part.id)) {
                  const result = part.id ? replyById.get(part.id) : undefined;
                  const name = part.name as keyof typeof label.tools;
                  const title = Object.hasOwn(label.tools, name)
                    ? label.tools[name]
                    : `${label.toolUnknown}: ${part.name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ")}`;
                  const Icon = part.name.startsWith("browser_") ? Global
                    : part.name.includes("Document") || part.name === "prepareAttachment" ? DocumentText
                      : part.name.includes("Campaign") || part.name.includes("Application") ? Briefcase
                        : part.name === "getCandidateContext" ? User : Setting2;
                  const visible = [part, ...(result && result !== part ? [result] : [])].filter(
                    (item) =>
                      item.data !== undefined &&
                      !(item.direction === "call" && item.data && typeof item.data === "object" &&
                        Object.keys(item.data).length === 0),
                  );
                  const titleContent = (
                    <>
                      <Icon className="mx-2 inline-block size-4 align-[-0.125em]" variant="Linear" aria-hidden="true" />
                      {title}
                    </>
                  );
                  const card = "rounded-lg border border-border bg-card px-3 py-2";
                  activity.push(visible.length ? (
                    <details key={key} className={card}>
                      <summary className="cursor-pointer text-muted-foreground">
                        {titleContent}
                      </summary>
                      <dl className="mt-2 space-y-2">
                        {visible.map((item) => (
                          <div key={item.direction}>
                            <dt className="text-xs text-muted-foreground">
                              {item.direction === "call" ? label.toolCall : label.toolResult}
                            </dt>
                            <dd>
                              <pre className="mt-1 max-h-52 overflow-auto whitespace-pre-wrap wrap-break-word text-xs">
                                {JSON.stringify(item.data, null, 2)}
                              </pre>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  ) : (
                    <div key={key} className={`${card} text-muted-foreground`}>{titleContent}</div>
                  ));
                }
              });
            });
            const startedAt =
              activeTurn?.id === id ? activeTurn.startedAt : undefined;
            const phase = activeTurn?.id === id
              ? (streamDisconnected ? "disconnected" : activeTurn.phase)
              : undefined;
            return (
              <div key={id} className="flex flex-col gap-4">
                {user && (
                  <article className="max-w-[90%] self-end rounded-2xl bg-secondary px-4 py-3 text-sm">
                    {user.parts.map(
                      (part, index) =>
                        part.type === "text" && (
                          <p
                            key={index}
                            className="whitespace-pre-wrap wrap-break-word leading-relaxed"
                          >
                            {part.text}
                          </p>
                        ),
                    )}
                    {user.id === pendingMessageId && (
                      <p className="mt-1 text-xs text-muted-foreground" role="status">
                        {label.sending}
                      </p>
                    )}
                  </article>
                )}
                {(activity.length > 0 ||
                  startedAt !== undefined ||
                  answer.length > 0 ||
                  cards.length > 0) && (
                  <article className="space-y-3 text-sm">
                    {(activity.length > 0 || startedAt !== undefined) && (
                      <TurnActivity startedAt={startedAt} thinkingMs={thinkingMs} phase={phase}>
                        {activity}
                      </TurnActivity>
                    )}
                    {answer}
                    {cards}
                  </article>
                )}
              </div>
            );
          })
        )}
        {children}
      </div>
    </div>
  );
}

function TurnActivity({
  startedAt,
  thinkingMs,
  phase,
  children,
}: {
  startedAt?: number;
  thinkingMs?: number;
  phase?: ChatTurn["phase"] | "disconnected";
  children: ReactNode;
}) {
  const { t, locale } = useI18n();
  const label = t.conversation;
  const panelId = useId();
  const [now, setNow] = useState(Date.now);
  const working = startedAt !== undefined;
  const [override, setOverride] = useState<{ working: boolean; open: boolean }>();
  const open = override?.working === working ? override.open : working;
  useEffect(() => {
    if (startedAt === undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const elapsed = startedAt === undefined ? thinkingMs : Math.max(0, now - startedAt);
  const seconds = Math.floor((elapsed ?? 0) / 1000);
  const number = new Intl.NumberFormat(locale);
  const duration =
    seconds >= 60
      ? `${number.format(Math.floor(seconds / 60))}m ${number.format(seconds % 60)}s`
      : `${number.format(seconds)}s`;
  return (
    <div className="text-muted-foreground">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex items-center gap-1.5 rounded-sm py-1 text-sm hover:text-foreground focus-visible:outline-ring"
        onClick={() => setOverride({ working, open: !open })}
      >
        {working
          ? phase ? `${label.generationPhase[phase]} · ${duration}` : label.thinkingNow(duration)
          : elapsed === undefined
            ? label.thought
            : label.thoughtFor(duration)}
        <ArrowRight2 aria-hidden="true" className={open ? "size-3 rotate-90" : "size-3"} />
      </button>
      <div id={panelId} hidden={!open} className="mt-2 space-y-3 border-s border-border ps-3">
        {children}
      </div>
    </div>
  );
}
