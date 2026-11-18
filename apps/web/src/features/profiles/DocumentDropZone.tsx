"use client";

import { useRef, useState, type RefObject } from "react";
import { Add } from "iconsax-reactjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function DocumentDropZone({
  label,
  disabled,
  count = 0,
  limit = 1,
  inputRef,
  onFiles,
}: {
  label: string;
  disabled: boolean;
  count?: number;
  limit?: number;
  inputRef?: RefObject<HTMLInputElement | null>;
  onFiles: (files: File[]) => void;
}) {
  const localInput = useRef<HTMLInputElement>(null);
  const input = inputRef ?? localInput;
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className="relative"
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
        if (!disabled) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
        if (!disabled && event.dataTransfer.files.length) {
          onFiles(Array.from(event.dataTransfer.files));
        }
      }}
    >
      <Button
        type="button"
        variant="secondary"
        className={cn(
          "cv-drop-zone relative size-36 flex-col gap-2 rounded-3xl border border-border text-foreground transition-colors xl:size-40",
          dragging && !disabled
            ? "border-primary bg-primary/15 ring-2 ring-primary"
            : "hover:border-input",
        )}
        disabled={disabled}
        aria-label={label}
        onClick={() => input.current?.click()}
      >
        {count ? (
          <span className="text-2xl leading-none text-primary" aria-hidden="true">
            ✓
          </span>
        ) : (
          <Add className="size-7" aria-hidden="true" />
        )}
        {count > 0 && (
          <span className="absolute end-3 top-3 text-xs text-muted-foreground">
            {count} / {limit}
          </span>
        )}
      </Button>
      <Input
        ref={input}
        type="file"
        accept=".pdf,.docx"
        multiple={limit > 1}
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
