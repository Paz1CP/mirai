"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { Slider } from "@base-ui/react/slider";
import { Add, ArrowDown2, ArrowUp, Messages2, MessageTick } from "iconsax-reactjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  chatImageMaxBytes,
  chatModelSchema,
  chatThinkingLevels,
  documentLimits,
  type ChatContext,
  type ChatGeneration,
} from "@mirai/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { DocumentAttachment } from "@/features/profiles/DocumentAttachment";
import { useProfile } from "@/features/profiles/ProfileProvider";
import { profileApi } from "@/features/profiles/profileApi";
import { useChatGeneration } from "./ChatGenerationProvider";
import { ChatImageAttachment } from "./ChatImageAttachment";

const modelNames = {
  "gemini-4-hydrogen": "Gemini 4 Hydrogen",
  "gemini-3.8-flash": "Gemini 3.8 Flash",
} satisfies Record<ChatGeneration["model"], string>;

const imageTypes = ["image/png", "image/jpeg", "image/webp"];

function exceedsAttachmentLimits(files: File[]) {
  const images = files.filter((file) => file.type.startsWith("image/")).length;
  return (
    images > 10 ||
    files.length - images > 10 ||
    files.some(
      (file) => !file.size || (!file.type.startsWith("image/") && file.size > documentLimits.fileBytes),
    ) ||
    files.reduce((sum, file) => sum + file.size, 0) > documentLimits.totalBytes
  );
}

async function normalizeClipboardImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image conversion unavailable");
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
    if (!blob) throw new Error("Image conversion failed");
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "image"}.png`, {
      type: blob.type,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ChatComposer({
  text,
  onChange,
  working,
  busy,
  enabled,
  context,
  onSend,
  onStop,
  onCompact,
  compacting,
  stopping,
  files,
  onFilesChange,
}: {
  text: string;
  onChange: (text: string) => void;
  working: boolean;
  busy: boolean;
  enabled: boolean;
  context?: ChatContext;
  onSend: () => void;
  onStop: () => void;
  onCompact?: () => void;
  compacting: boolean;
  stopping: boolean;
  files: File[];
  onFilesChange: (files: File[]) => void;
}) {
  const { t, locale } = useI18n();
  const label = t.conversation;
  const { preferences, preferencesKey } = useProfile();
  const client = useQueryClient();
  const communicationChip = useRef<HTMLButtonElement>(null);
  const [confirmCommunication, setConfirmCommunication] = useState(false);
  const communicationAllowed = preferences.data?.permissions.allow_communication ?? false;
  const communication = useMutation({
    mutationFn: (allowed: boolean) => profileApi.permission({ allow_communication: allowed }),
    onMutate: () => client.cancelQueries({ queryKey: preferencesKey }),
    onSuccess: (result) => {
      client.setQueryData<typeof result>(preferencesKey, (current) =>
        current ? { ...current, permissions: result.permissions } : result,
      );
      setConfirmCommunication(false);
    },
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const attachmentsBusy = busy || pasting;
  const canSend =
    enabled && !attachmentsBusy && !communication.isPending && Boolean(text.trim() || files.length);

  function rejectOversizedImage(selected: File[]) {
    if (!selected.some((file) => file.type.startsWith("image/") && file.size > chatImageMaxBytes))
      return false;
    toast.error(label.imageTooLarge);
    return true;
  }

  function selectFiles(selected: File[]) {
    if (rejectOversizedImage(selected)) return;
    const next = [...files, ...selected];
    if (
      next.some(
        (file) =>
          !imageTypes.includes(file.type) &&
          !/\.(pdf|docx)$/i.test(file.name),
      )
    ) {
      toast.error(label.unsupportedAttachment);
      return;
    }
    if (exceedsAttachmentLimits(next)) {
      toast.error(label.attachmentLimit);
      return;
    }
    onFilesChange(next);
  }

  async function pasteImages(event: ClipboardEvent<HTMLTextAreaElement>) {
    const { files: clipboardFiles, items } = event.clipboardData;
    const images = Array.from(clipboardFiles).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (!images.length) {
      for (const item of Array.from(items)) {
        if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
        const image = item.getAsFile();
        if (image) images.push(image);
      }
    }
    if (!images.length) return;
    event.preventDefault();
    if (attachmentsBusy) return;
    if (images.every((file) => imageTypes.includes(file.type))) {
      selectFiles(images);
      return;
    }
    if (rejectOversizedImage(images)) return;
    if (exceedsAttachmentLimits([...files, ...images])) {
      toast.error(label.attachmentLimit);
      return;
    }
    setPasting(true);
    try {
      const normalized: File[] = [];
      for (const file of images) {
        normalized.push(imageTypes.includes(file.type) ? file : await normalizeClipboardImage(file));
      }
      selectFiles(normalized);
    } catch {
      toast.error(label.unsupportedAttachment);
    } finally {
      setPasting(false);
    }
  }
  const used = context?.used ?? null;
  const capacity = context?.capacity ?? null;
  const ratio = used === null || capacity === null ? null : used / capacity;
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  function send(event: FormEvent) {
    event.preventDefault();
    if (canSend) onSend();
  }
  return (
    <form onSubmit={send} className="rounded-4xl border border-border bg-card p-2.5">
      {files.length > 0 && (
        <AttachmentRail label={t.professional.attachments}>
          {files.map((file, index) =>
            file.type.startsWith("image/") ? (
              <ChatImageAttachment
                key={index}
                file={file}
                disabled={attachmentsBusy}
                removeLabel={label.removeAttachment}
                onRemove={() => onFilesChange(files.filter((_, i) => i !== index))}
              />
            ) : (
              <DocumentAttachment
                key={index}
                file={file}
                primary={false}
                disabled={attachmentsBusy}
                onRemove={() => onFilesChange(files.filter((_, i) => i !== index))}
                onRetry={() => {}}
              />
            ),
          )}
        </AttachmentRail>
      )}
      {communication.isError && !confirmCommunication && (
        <p role="alert" className="px-2 text-sm text-destructive">
          {label.communicationSaveFailed}
        </p>
      )}
      <Textarea
        className="field-sizing-content max-h-48 min-h-10 w-full resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
        rows={1}
        maxLength={30000}
        aria-label={t.composerPlaceholder}
        placeholder={t.composerPlaceholder}
        value={text}
        readOnly={busy}
        onChange={(event) => onChange(event.target.value)}
        onPaste={pasteImages}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (canSend) onSend();
          }
        }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          multiple
          accept={[...imageTypes, ".pdf", ".docx"].join(",")}
          onChange={(event) => {
            if (!attachmentsBusy) selectFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-full"
          disabled={attachmentsBusy}
          aria-label={label.attach}
          title={label.attach}
          onClick={() => fileInput.current?.click()}
        >
          <Add aria-hidden="true" />
        </Button>
        <Button
          ref={communicationChip}
          type="button"
          size="sm"
          variant={communicationAllowed ? "secondary" : "ghost"}
          className={
            communicationAllowed
              ? "rounded-full text-warning"
              : "rounded-full text-muted-foreground"
          }
          aria-pressed={communicationAllowed}
          aria-haspopup={communicationAllowed ? undefined : "dialog"}
          aria-busy={communication.isPending}
          disabled={
            !enabled || preferences.isPending || preferences.isFetching || communication.isPending
          }
          onClick={() => {
            communication.reset();
            if (preferences.isError) void preferences.refetch();
            else if (communicationAllowed) communication.mutate(false);
            else setConfirmCommunication(true);
          }}
        >
          {communicationAllowed ? <MessageTick aria-hidden="true" /> : <Messages2 aria-hidden="true" />}
          {label.communication}
        </Button>
        <Dialog
          open={confirmCommunication}
          onOpenChange={(open) => {
            if (!communication.isPending) setConfirmCommunication(open);
          }}
        >
          <DialogContent
            showCloseButton={false}
            finalFocus={communicationChip}
            className="rounded-2xl p-6 sm:max-w-lg"
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Messages2 className="size-5 shrink-0 text-warning" aria-hidden="true" />
                {label.communicationTitle}
              </DialogTitle>
              <DialogDescription className="leading-relaxed">
                {label.communicationDescription}
              </DialogDescription>
            </DialogHeader>
            <p className="text-muted-foreground">{label.communicationScope}</p>
            {communication.isError && (
              <p role="alert" className="text-destructive">
                {label.communicationSaveFailed}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                disabled={communication.isPending}
                onClick={() => setConfirmCommunication(false)}
              >
                {t.cancel}
              </Button>
              <Button
                type="button"
                disabled={!enabled || communication.isPending}
                onClick={() => communication.mutate(true)}
              >
                {communication.isPending ? label.communicationSaving : label.communicationConfirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="ms-auto flex flex-wrap items-center justify-end gap-2">
          <Popover>
            <PopoverTrigger
              openOnHover
              delay={120}
              closeDelay={200}
              render={
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="rounded-full text-muted-foreground"
                  aria-label={label.context}
                />
              }
            >
              <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden="true">
                <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" opacity=".35" />
                {ratio !== null && ratio > 0 && (
                  <circle
                    cx="10"
                    cy="10"
                    r="7"
                    pathLength="100"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={`${Math.min(100, ratio * 100)} 100`}
                    transform="rotate(-90 10 10)"
                    className="text-foreground"
                  />
                )}
              </svg>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" className="w-56 rounded-2xl p-3">
              <PopoverTitle className="text-center text-muted-foreground">
                {label.context}
              </PopoverTitle>
              {ratio !== null && (
                <p className="text-center text-lg font-medium tabular-nums">
                  {percent.format(ratio)}
                </p>
              )}
              <dl className="grid grid-cols-[1fr_auto] gap-1.5 text-xs tabular-nums">
                <dt className="text-muted-foreground">{label.capacity}</dt>
                <dd>{capacity === null ? "—" : number.format(capacity)}</dd>
                <dt className="text-muted-foreground">{label.used}</dt>
                <dd>{used === null ? "—" : number.format(used)}</dd>
                <dt className="text-muted-foreground">{label.remaining}</dt>
                <dd>{ratio === null ? "—" : percent.format(Math.max(0, 1 - ratio))}</dd>
              </dl>
              {used === null && capacity === null && (
                <p className="text-xs text-muted-foreground">{label.unknown}</p>
              )}
              {onCompact && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={!enabled || compacting}
                  onClick={onCompact}
                >
                  {compacting ? label.compacting : label.compact}
                </Button>
              )}
            </PopoverContent>
          </Popover>
          <GenerationPicker disabled={busy} />
          {working && (text.trim() || files.length > 0) && (
            <Button type="submit" variant="secondary" className="rounded-full" disabled={!canSend}>
              {label.addInstruction}
            </Button>
          )}
          {working ? (
            <Button
              type="button"
              size="icon"
              className="rounded-full"
              aria-label={label.stop}
              title={label.stop}
              disabled={!enabled || stopping}
              onClick={onStop}
            >
              <span className="size-3 rounded-[2px] bg-current" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="rounded-full"
              aria-label={label.send}
              title={label.send}
              disabled={!canSend}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function AttachmentRail({ label, children }: { label: string; children: ReactNode }) {
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; startScroll: number } | null>(null);

  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const scrollWithWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey || event.deltaX || !event.deltaY) return;
      const maxScroll = element.scrollWidth - element.clientWidth;
      if (maxScroll <= 0) return;
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? element.clientWidth
            : 1;
      const next = Math.min(maxScroll, Math.max(0, element.scrollLeft + event.deltaY * unit));
      if (next === element.scrollLeft) return;
      event.preventDefault();
      element.scrollLeft = next;
    };
    element.addEventListener("wheel", scrollWithWheel, { passive: false });
    return () => element.removeEventListener("wheel", scrollWithWheel);
  }, []);

  return (
    <div
      ref={rail}
      role="region"
      aria-label={label}
      tabIndex={0}
      className="mb-2 flex min-w-0 max-w-full cursor-grab select-none gap-2 overflow-x-auto [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
      onDragStart={(event) => {
        if (event.currentTarget.contains(event.target as Node)) event.preventDefault();
      }}
      onPointerDown={(event) => {
        const element = event.currentTarget;
        if (
          event.pointerType !== "mouse" ||
          event.button !== 0 ||
          !element.contains(event.target as Node) ||
          element.scrollWidth <= element.clientWidth ||
          event.clientY >= element.getBoundingClientRect().top + element.clientHeight
        ) {
          return;
        }
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startScroll: element.scrollLeft,
        };
      }}
      onPointerMove={(event) => {
        const pending = drag.current;
        if (pending?.pointerId !== event.pointerId || !(event.buttons & 1)) return;
        const element = event.currentTarget;
        const distance = event.clientX - pending.startX;
        if (!element.hasPointerCapture(event.pointerId)) {
          if (Math.abs(distance) < 5) return;
          element.setPointerCapture(event.pointerId);
        }
        element.scrollLeft = pending.startScroll - distance;
      }}
      onPointerLeave={() => { drag.current = null; }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
    >
      {children}
    </div>
  );
}

function GenerationPicker({ disabled }: { disabled: boolean }) {
  const {
    t: { conversation: label },
  } = useI18n();
  const { generation, setGeneration } = useChatGeneration();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"effort" | "models">("effort");
  const [previewValue, setPreviewValue] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const efforts: readonly ChatGeneration["effort"][] = chatThinkingLevels[generation.model];
  const currentIndex = efforts.indexOf(generation.effort);
  const position = previewValue ?? currentIndex;
  const previewIndex = Math.max(0, Math.min(efforts.length - 1, Math.round(position)));
  const effortLabel = label.thinkingLevels[efforts[previewIndex] ?? generation.effort];

  function chooseModel(model: ChatGeneration["model"]) {
    if (model !== generation.model) {
      setGeneration({
        model,
        effort: model === "gemini-4-hydrogen" ? "high" : "medium",
      });
    }
    setOpen(false);
    setView("effort");
    setPreviewValue(null);
  }

  function commitEffort(value: number) {
    const index = Math.max(0, Math.min(efforts.length - 1, Math.round(value)));
    const effort = efforts[index];
    setPreviewValue(null);
    if (effort && effort !== generation.effort) {
      setGeneration({ model: generation.model, effort });
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setView("effort");
          setPreviewValue(null);
          setDragging(false);
        }
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            type="button"
            variant="secondary"
            className="h-9 max-w-[min(18rem,65vw)] gap-2 rounded-full bg-secondary/80 px-3.5 text-sm font-medium transition-colors duration-150 hover:bg-secondary"
            aria-label={label.model}
          />
        }
      >
        <span className="truncate">{modelNames[generation.model]}</span>
        <span className="hidden shrink-0 text-muted-foreground sm:inline">
          {label.thinkingLevels[generation.effort]}
        </span>
        <ArrowDown2
          className={
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200 " +
            (open ? "rotate-180" : "")
          }
          aria-hidden="true"
        />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={10}
        className="w-[min(19.25rem,calc(100vw-1.5rem))] gap-0 rounded-[22px] border border-border/70 bg-popover p-3 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.55)]"
      >
        {view === "models" ? (
          <div className="animate-in fade-in-0 duration-150">
            <PopoverTitle className="px-2 pb-1.5 pt-0.5 text-[13px] font-medium text-muted-foreground">
              {label.model}
            </PopoverTitle>
            <div className="flex flex-col gap-0.5">
              {chatModelSchema.options.map((model) => {
                const selected = model === generation.model;
                return (
                  <button
                    key={model}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() => chooseModel(model)}
                    className={
                      "flex min-h-10 w-full items-center rounded-xl px-3 py-2 text-left text-[14px] font-medium leading-5 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 " +
                      (selected ? "bg-accent/65 text-accent-foreground" : "hover:bg-accent/45")
                    }
                  >
                    {modelNames[model]}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in-0 duration-150">
            <div className="mb-1 flex min-h-[47px] flex-col items-center justify-center gap-0.5 text-center">
              <PopoverTitle className="text-[18px] font-semibold leading-6 tracking-tight text-primary">
                {effortLabel}
              </PopoverTitle>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setView("models")}
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px] leading-5 text-muted-foreground transition-colors duration-150 hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                aria-label={label.model}
              >
                {modelNames[generation.model]}
                <ArrowDown2 className="size-3 -rotate-90" aria-hidden="true" />
              </button>
            </div>

            <div className="px-2 pb-0.5">
              <Slider.Root
                value={position}
                min={0}
                max={efforts.length - 1}
                step={0.01}
                disabled={disabled}
                onValueChange={(value) => {
                  if (typeof value === "number") setPreviewValue(value);
                }}
                onValueCommitted={(value) => {
                  if (typeof value === "number") commitEffort(value);
                }}
              >
                <Slider.Control
                  className="flex h-9 w-full touch-none items-center px-2"
                  onPointerDownCapture={() => setDragging(true)}
                  onPointerUpCapture={() => setDragging(false)}
                  onPointerCancelCapture={() => setDragging(false)}
                >
                  <Slider.Track className="relative h-[21px] w-full rounded-full bg-muted/80 ring-1 ring-border/60">
                    <Slider.Indicator
                      className={
                        "rounded-full bg-primary " +
                        (dragging ? "" : "transition-[width,left,right] duration-200 ease-out")
                      }
                    />
                    {efforts.map((effort, index) => {
                      const fraction = index / (efforts.length - 1);
                      const inset = (1 - 2 * fraction) * 12;
                      return (
                        <span
                          key={effort}
                          aria-hidden="true"
                          style={{
                            left:
                              "calc(" +
                              fraction * 100 +
                              "% " +
                              (inset < 0 ? "- " : "+ ") +
                              Math.abs(inset) +
                              "px)",
                          }}
                          className={
                            "pointer-events-none absolute top-1/2 z-10 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full " +
                            (index <= previewIndex
                              ? "bg-primary-foreground/65"
                              : "bg-muted-foreground/45")
                          }
                        />
                      );
                    })}
                    <Slider.Thumb
                      aria-label={label.thinkingLevels[generation.effort]}
                      aria-valuetext={effortLabel}
                      onKeyDown={(event) => {
                        const delta =
                          event.key === "ArrowRight" || event.key === "ArrowUp"
                            ? 1
                            : event.key === "ArrowLeft" || event.key === "ArrowDown"
                              ? -1
                              : 0;
                        if (delta) {
                          event.preventDefault();
                          commitEffort(currentIndex + delta);
                        } else if (event.key === "Home" || event.key === "End") {
                          event.preventDefault();
                          commitEffort(event.key === "Home" ? 0 : efforts.length - 1);
                        }
                      }}
                      className={
                        "z-20 size-7 cursor-grab rounded-full border-[3px] border-primary bg-foreground shadow-[0_2px_10px_rgba(0,0,0,0.25)] outline-none active:cursor-grabbing focus-visible:ring-4 focus-visible:ring-primary/25 " +
                        (dragging
                          ? ""
                          : "transition-[left,right,transform,box-shadow] duration-200 ease-out")
                      }
                    />
                  </Slider.Track>
                </Slider.Control>
              </Slider.Root>
              <div className="flex items-center justify-between px-1 pb-0.5 pt-0.5 text-[12px] font-medium text-muted-foreground">
                <span>{label.thinkingLevels[efforts[0]!]}</span>
                <span>{label.thinkingLevels[efforts[efforts.length - 1]!]}</span>
              </div>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
