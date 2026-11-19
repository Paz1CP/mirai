"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { Slider } from "@base-ui/react/slider";
import { Add, ArrowDown2, ArrowUp } from "iconsax-reactjs";
import {
  chatModelSchema,
  chatThinkingLevels,
  type ChatContext,
  type ChatGeneration,
} from "@mirai/contracts";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { DocumentAttachment } from "@/features/profiles/DocumentAttachment";
import { useChatGeneration } from "./ChatGenerationProvider";

const modelNames = {
  "gemini-4-hydrogen": "Gemini 4 Hydrogen",
  "gemini-3.8-flash": "Gemini 3.8 Flash",
} satisfies Record<ChatGeneration["model"], string>;

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
  const canSend = enabled && !busy && Boolean(text.trim() || files.length);
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string>();
  function selectFiles(selected: File[]) {
    const next = [...files, ...selected];
    if (
      next.some(
        (file) =>
          !["image/png", "image/jpeg", "image/webp"].includes(file.type) &&
          !/\.(pdf|docx)$/i.test(file.name),
      )
    ) {
      setFileError(label.unsupportedAttachment);
      return;
    }
    if (
      next.filter((file) => file.type.startsWith("image/")).length > 10 ||
      next.filter((file) => !file.type.startsWith("image/")).length > 10 ||
      next.some((file) => !file.size || file.size > 10 * 1024 * 1024) ||
      next.reduce((sum, file) => sum + file.size, 0) > 30 * 1024 * 1024
    ) {
      setFileError(label.attachmentLimit);
      return;
    }
    setFileError(undefined);
    onFilesChange(next);
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
        <div className="mb-2 flex gap-2 overflow-x-auto">
          {files.map((file, index) =>
            file.type.startsWith("image/") ? (
              <ImageAttachment
                key={index}
                file={file}
                disabled={busy}
                removeLabel={label.removeAttachment}
                onRemove={() => onFilesChange(files.filter((_, i) => i !== index))}
              />
            ) : (
              <DocumentAttachment
                key={index}
                file={file}
                primary={false}
                disabled={busy}
                onRemove={() => onFilesChange(files.filter((_, i) => i !== index))}
                onRetry={() => {}}
              />
            ),
          )}
        </div>
      )}
      {fileError && (
        <p role="alert" className="px-2 text-sm text-destructive">
          {fileError}
        </p>
      )}
      <Textarea
        className="field-sizing-content max-h-48 min-h-10 w-full resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
        rows={1}
        maxLength={30000}
        aria-label={t.composerPlaceholder}
        placeholder={t.composerPlaceholder}
        value={text}
        onChange={(event) => onChange(event.target.value)}
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
          accept="image/png,image/jpeg,image/webp,.pdf,.docx"
          onChange={(event) => {
            selectFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-full"
          disabled={busy}
          aria-label={label.attach}
          title={label.attach}
          onClick={() => fileInput.current?.click()}
        >
          <Add aria-hidden="true" />
        </Button>
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

function GenerationPicker({ disabled }: { disabled: boolean }) {
  const {
    t: { conversation: label },
  } = useI18n();
  const { generation, setGeneration } = useChatGeneration();
  const efforts: readonly ChatGeneration["effort"][] = chatThinkingLevels[generation.model];
  const effortLabel = label.thinkingLevels[generation.effort];

  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        render={<Button type="button" variant="secondary" className="rounded-full px-3" />}
      >
        {modelNames[generation.model]}
        <span className="hidden text-muted-foreground sm:inline">{effortLabel}</span>
        <ArrowDown2 className="size-4 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="gap-3 rounded-2xl p-3">

        <Select
          value={generation.model}
          onValueChange={(model) => {
            const result = chatModelSchema.safeParse(model);
            if (result.success && result.data !== generation.model) {
              setGeneration({
                model: result.data,
                effort: result.data === "gemini-4-hydrogen" ? "high" : "medium",
              });
            }
          }}
          disabled={disabled}
        >
          <SelectTrigger aria-label={label.model} className="w-full">
            <SelectValue>{modelNames[generation.model]}</SelectValue>
          </SelectTrigger>
          <SelectContent side="top" alignItemWithTrigger={false}>
            {chatModelSchema.options.map((model) => (
              <SelectItem key={model} value={model}>
                {modelNames[model]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-center font-bold text-primary">{effortLabel}</p>
        <Slider.Root
          value={efforts.indexOf(generation.effort)}
          min={0}
          max={efforts.length - 1}
          step={1}
          disabled={disabled}
          onValueChange={(index) => {
            const effort = efforts[index];
            if (effort) setGeneration({ model: generation.model, effort });
          }}
        >
          <Slider.Control className="flex h-8 w-full touch-none items-center px-2">
            <Slider.Track className="relative h-3 w-full rounded-full bg-muted ring-1 ring-border">
              <Slider.Indicator className="rounded-full bg-primary" />
              <Slider.Thumb
               
                aria-valuetext={effortLabel}
                className="size-5 rounded-full border-2 border-primary bg-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
              />
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>
      </PopoverContent>
    </Popover>
  );
}

function ImageAttachment({
  file,
  disabled,
  removeLabel,
  onRemove,
}: {
  file: File;
  disabled: boolean;
  removeLabel: string;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => setUrl(String(reader.result));
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);
  return (
    <div className="relative h-36 w-36 shrink-0 overflow-hidden rounded-2xl border border-input">
      {url && <Image src={url} alt={file.name} fill unoptimized className="object-cover" />}
      <Button
        type="button"
        size="icon-xs"
        variant="secondary"
        disabled={disabled}
        className="absolute end-1 top-1"
        aria-label={`${removeLabel}: ${file.name}`}
        onClick={onRemove}
      >
        ×
      </Button>
    </div>
  );
}
