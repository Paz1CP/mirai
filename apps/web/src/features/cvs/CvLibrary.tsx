"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DocumentText, More, Trash } from "iconsax-reactjs";
import {
  cvMetadataSchema,
  chatStoredImageLimit,
  type storedChatFileSchema,
  type CvDetail,
  type CvSummary,
  type OriginalDocument,
  type DocumentRef,
} from "@mirai/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileError } from "@/features/profiles/profileApi";
import { chatApi, chatAttachmentKey } from "@/features/chat/chatApi";
import { ChatMessageAttachment } from "@/features/chat/ChatMessageAttachment";
import type { z } from "zod";
import { useProfile } from "@/features/profiles/ProfileProvider";
import { downloadCvPdf, renderCvPdf } from "@/features/profiles/cvPdf";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { notifySuccess } from "@/shared/notifySuccess";
import { cvApi, cvKey } from "./cvApi";
import { CvComparison } from "./CvComparison";
import { CvDraftDialog } from "./CvDraftDialog";
import { CvImportDialog } from "./CvImportDialog";
import { CvOriginalDialog } from "./CvOriginalDialog";
import { CvReplaceDialog } from "./CvReplaceDialog";
import { CvThumbnail, OriginalThumbnail } from "./CvThumbnail";
import { cvErrorText } from "./cvText";

const libraryGrid = "grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-4";
type StoredChatFile = z.infer<typeof storedChatFileSchema>;

function ChatGalleryPreview({ accountId, file }: { accountId: string; file: StoredChatFile }) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const { t } = useI18n();
  useEffect(() => {
    if (!container.current || !file.imageMimeType) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: "160px" });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [file.imageMimeType]);
  const thumbnail = "relative aspect-[4/3] w-full overflow-hidden";
  return (
    <div ref={container} className={thumbnail}>
      {visible && file.imageMimeType ? (
        <ChatMessageAttachment
          accountId={accountId}
          chatId={file.chatId}
          messageId={file.messageId}
          attachment={{
            position: file.position,
            name: file.name ?? t.cvs.storedChatFile,
            mimeType: file.imageMimeType === "image/jpg" ? "image/jpeg" : file.imageMimeType,
          }}
          thumbnailClassName={thumbnail}
        />
      ) : file.imageMimeType ? (
        <Skeleton className="size-full rounded-none" />
      ) : (
        <div className="grid size-full place-items-center bg-secondary text-muted-foreground">
          <DocumentText className="size-8" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

type Action =
  | { kind: "import" | "compare" }
  | { kind: "original"; original: OriginalDocument }
  | { kind: "removeOriginal"; original: OriginalDocument }
  | { kind: "removeChatFile"; file: StoredChatFile }
  | { kind: "view" | "edit" | "duplicate" | "rename" | "remove" | "replace"; document: CvSummary };
type LibraryCommand =
  | { kind: "createPrimary" | "cleanup" }
  | { kind: "default"; id?: string }
  | { kind: "download" | "original"; document: CvSummary };

export function CvLibrary({ reference }: { reference?: DocumentRef }) {
  const { t, locale } = useI18n();
  const c = t.cvs;
  const state = useProfile();
  const client = useQueryClient();
  const [selection, setAction] = useState<Action | null>();
  const [openMenu, setOpenMenu] = useState<string>();
  const library = useQuery({
    queryKey: cvKey(state.accountId),
    queryFn: ({ signal }) => cvApi.list(signal),
    enabled: state.available,
    staleTime: 30_000,
    retry: false,
  });
  const originalsKey = ["cv-originals", state.accountId];
  const originals = useQuery({
    queryKey: originalsKey,
    queryFn: ({ signal }) => cvApi.originals(signal),
    enabled: state.available,
    staleTime: 30_000,
    retry: false,
  });
  const chatFilesKey = ["chat-files", state.accountId];
  const chatFiles = useQuery({
    queryKey: chatFilesKey,
    queryFn: ({ signal }) => chatApi.files(signal),
    enabled: state.available,
    retry: false,
  });
  const removeChatFile = useMutation({
    mutationFn: chatApi.removeFile,
    onSuccess: async (_, file) => {
      client.removeQueries({
        queryKey: chatAttachmentKey(state.accountId, file.chatId, file.messageId, file.position),
        exact: true,
      });
      await client.invalidateQueries({ queryKey: chatFilesKey });
      setAction(null);
      notifySuccess(c.chatFileRemoved);
    },
  });
  const data = library.data;
  const documents = data?.documents.toSorted(
    (left, right) => Number(right.kind === "primary") - Number(left.kind === "primary"),
  );
  const referencedCv = reference?.kind === "cv" && documents?.find(({ id }) => id === reference.id);
  const referencedOriginal =
    reference?.kind === "original" && originals.data?.find(({ id }) => id === reference.id);
  const action: Action | null =
    selection !== undefined
      ? selection
      : referencedCv
        ? { kind: "view", document: referencedCv }
        : referencedOriginal
          ? { kind: "original", original: referencedOriginal }
          : null;
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const refresh = (primary = false) => {
    void client.invalidateQueries({ queryKey: cvKey(state.accountId) });
    if (primary) void state.refresh();
  };
  function saveDocument(document: CvDetail, message: string) {
    client.setQueryData(cvKey(state.accountId, document.id), document);
    refresh(document.kind === "primary");
    notifySuccess(message);
  }
  const removeOriginal = useMutation({
    mutationFn: cvApi.removeOriginal,
    onSuccess: async ({ cleanupPending }, id) => {
      await client.cancelQueries({ queryKey: originalsKey });
      client.setQueryData<OriginalDocument[]>(originalsKey, (current) =>
        current?.filter((original) => original.id !== id),
      );
      for (const key of ["original-content", "original-thumbnail"]) {
        client.removeQueries({ queryKey: [key, state.accountId, id], exact: true });
      }
      void client.invalidateQueries({ queryKey: originalsKey });
      refresh(true);
      setAction(null);
      if (cleanupPending) toast.warning(c.pendingCleanup);
      else notifySuccess(c.originalRemoved);
    },
  });
  const command = useMutation({
    mutationFn: async (command: LibraryCommand) => {
      switch (command.kind) {
        case "createPrimary": {
          const document = await cvApi.createPrimary();
          saveDocument(document, c.primaryCreated);
          break;
        }
        case "default":
          await cvApi.defaultVariant(command.id);
          refresh();
          notifySuccess(c.defaultSaved);
          break;
        case "download": {
          const document = await client.fetchQuery({
            queryKey: cvKey(state.accountId, command.document.id),
            queryFn: ({ signal }) => cvApi.detail(command.document.id, signal),
          });
          downloadCvPdf(await renderCvPdf(document.profile, locale), document.name);
          notifySuccess(t.professional.downloadStarted);
          break;
        }
        case "original": {
          const { url } = await cvApi.access(command.document.id);
          const link = document.createElement("a");
          link.href = url;
          link.rel = "noopener noreferrer";
          link.click();
          break;
        }
        case "cleanup": {
          const result = await cvApi.cleanup();
          if (!result.cleanupPending) notifySuccess(c.cleanupDone);
          refresh();
          break;
        }
      }
    },
  });
  const close = () => setAction(null);
  function show(next: Action) {
    setOpenMenu(undefined);
    setAction(next);
  }
  function run(next: LibraryCommand) {
    setOpenMenu(undefined);
    command.mutate(next);
  }
  return (
    <div className="w-full space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">{""}</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!state.available || (data?.documents.length ?? 0) < 2}
            onClick={() => show({ kind: "compare" })}
          >
            {c.compare}
          </Button>
          <Button disabled={!state.available} onClick={() => show({ kind: "import" })}>
            {c.import}
          </Button>
        </div>
      </div>
      {command.error && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-destructive">
            {cvErrorText(command.error, locale)}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (command.variables) command.mutate(command.variables);
            }}
          >
            {t.retry}
          </Button>
        </div>
      )}
      {data?.cleanupPending && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
          <p role="status" className="text-sm text-warning">
            {c.pendingCleanup}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={command.isPending}
            onClick={() => run({ kind: "cleanup" })}
          >
            {c.retryCleanup}
          </Button>
        </div>
      )}
      {!data && library.error ? (
        <div className="space-y-3 rounded-xl border border-border p-5">
          <p role="alert" className="text-destructive">
            {cvErrorText(library.error, locale)}
          </p>
          <Button onClick={() => void library.refetch()}>{t.retry}</Button>
        </div>
      ) : !data ? (
        <div className={libraryGrid} aria-busy="true" aria-label={c.loading}>
          <Skeleton className="aspect-[4/5] rounded-xl" />
          <Skeleton className="aspect-[4/5] rounded-xl" />
        </div>
      ) : (
        <>
          {!documents?.length ? (
            <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
              <DocumentText
                className="mx-auto mb-4 size-7 text-muted-foreground"
                aria-hidden="true"
              />
              <h2 className="font-medium">{c.noDocuments}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{c.emptyDescription}</p>
            </div>
          ) : (
            <ul className={libraryGrid}>
              {documents.map((cv) => {
                const primary = cv.kind === "primary";
                const isDefault = data.defaultId === cv.id;
                return (
                  <li
                    key={cv.id}
                    className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3"
                  >
                    <CvThumbnail
                      accountId={state.accountId}
                      cv={cv}
                      onOpen={() => show({ kind: "view", document: cv })}
                    />
                    <div className="flex min-w-0 items-start justify-between gap-2 px-1">
                      <div className="min-w-0 space-y-1">
                        <h3 className="font-medium wrap-break-word">
                          {cv.name}
                          {cv.specialization && (
                            <span className="text-muted-foreground"> · {cv.specialization}</span>
                          )}
                        </h3>
                        {primary && <p className="text-sm text-muted-foreground">{c.primary}</p>}
                      </div>
                      <Popover
                        open={openMenu === cv.id}
                        onOpenChange={(open) => setOpenMenu(open ? cv.id : undefined)}
                      >
                        <PopoverTrigger
                          render={
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`${c.actions} · ${cv.name}`}
                            />
                          }
                        >
                          <More aria-hidden="true" />
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-52 gap-1 p-1">
                          <Button
                            variant="ghost"
                            className="justify-start"
                            onClick={() => show({ kind: "view", document: cv })}
                          >
                            {c.view}
                          </Button>
                          <Button
                            variant="ghost"
                            className="justify-start"
                            onClick={() => show({ kind: "edit", document: cv })}
                          >
                            {c.edit}
                          </Button>
                          <Button
                            variant="ghost"
                            className="justify-start"
                            onClick={() => show({ kind: "duplicate", document: cv })}
                          >
                            {c.duplicate}
                          </Button>
                          <Button
                            variant="ghost"
                            className="justify-start"
                            onClick={() => show({ kind: "rename", document: cv })}
                          >
                            {c.rename}
                          </Button>
                          <Button
                            variant="ghost"
                            className="justify-start"
                            disabled={command.isPending}
                            onClick={() => run({ kind: "download", document: cv })}
                          >
                            {c.download}
                          </Button>
                          {cv.hasSource && (
                            <Button
                              variant="ghost"
                              className="justify-start"
                              disabled={command.isPending}
                              onClick={() => run({ kind: "original", document: cv })}
                            >
                              {c.original}
                            </Button>
                          )}
                          {primary ? (
                            <Button
                              variant="ghost"
                              className="justify-start"
                              onClick={() => show({ kind: "replace", document: cv })}
                            >
                              {c.replace}
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              className="justify-start"
                              disabled={command.isPending}
                              onClick={() =>
                                run({ kind: "default", id: isDefault ? undefined : cv.id })
                              }
                            >
                              {isDefault ? c.unsetDefault : c.setDefault}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            className="justify-start text-destructive hover:text-destructive"
                            onClick={() => show({ kind: "remove", document: cv })}
                          >
                            {c.remove}
                          </Button>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <p className="mt-auto px-1 pb-1 text-xs text-muted-foreground">
                      {c.updated} ·{" "}
                      <time dateTime={cv.updatedAt}>
                        {dateFormat.format(new Date(cv.updatedAt))}
                      </time>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          {data.canCreatePrimary && (
            <Button
              variant="outline"
              disabled={command.isPending}
              onClick={() => run({ kind: "createPrimary" })}
            >
              {c.createPrimary}
            </Button>
          )}
        </>
      )}
      {action?.kind === "compare" && data && (
        <CvComparison documents={data.documents} accountId={state.accountId} onClose={close} />
      )}
      {(Boolean(originals.data?.length) || originals.isError) && (
        <section
          className="space-y-4 border-t border-border pt-6"
          aria-labelledby="cv-originals-heading"
        >
          <h2 id="cv-originals-heading" className="text-lg font-semibold">
            {c.originals}
          </h2>
          {originals.isError && (
            <div className="flex flex-wrap items-center gap-3">
              <p role="alert" className="text-sm text-destructive">
                {cvErrorText(originals.error, locale)}
              </p>
              <Button variant="outline" size="sm" onClick={() => void originals.refetch()}>
                {t.retry}
              </Button>
            </div>
          )}
          <ul className={libraryGrid}>
            {originals.data?.map((original) => (
              <li
                key={original.id}
                className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3"
              >
                <div className="relative">
                  <OriginalThumbnail
                    accountId={state.accountId}
                    original={original}
                    onOpen={() => show({ kind: "original", original })}
                  />
                  <Popover
                    open={openMenu === `original:${original.id}`}
                    onOpenChange={(open) =>
                      setOpenMenu(open ? `original:${original.id}` : undefined)
                    }
                  >
                    <PopoverTrigger
                      render={
                        <Button
                          size="icon"
                          variant="secondary"
                          className="absolute top-2 right-2 z-10 border-border bg-card text-card-foreground shadow-sm"
                          aria-label={`${c.actions} · ${original.name}`}
                        />
                      }
                    >
                      <More aria-hidden="true" />
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-max max-w-xs p-1">
                      <Button
                        variant="ghost"
                        className="justify-start text-destructive hover:text-destructive"
                        onClick={() => {
                          removeOriginal.reset();
                          show({ kind: "removeOriginal", original });
                        }}
                      >
                        {c.removeOriginal}
                      </Button>
                    </PopoverContent>
                  </Popover>
                </div>
                <h3 className="px-1 font-medium wrap-break-word">{original.name}</h3>
                <time
                  className="mt-auto px-1 pb-1 text-xs text-muted-foreground"
                  dateTime={original.createdAt}
                >
                  {dateFormat.format(new Date(original.createdAt))}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}
      {(Boolean(chatFiles.data?.length) || chatFiles.isError) && (
        <section className="space-y-4 border-t border-border pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{c.storedChatFiles}</h2>
            {chatFiles.data && <p className="text-sm tabular-nums text-muted-foreground">
              {c.chatImageUsage(chatFiles.data.filter((file) => file.imageMimeType).length, chatStoredImageLimit)}
            </p>}
          </div>
          {chatFiles.isError && (
            <div className="flex items-center gap-3">
              <p role="alert" className="text-sm text-destructive">{cvErrorText(chatFiles.error, locale)}</p>
              <Button variant="outline" size="sm" onClick={() => void chatFiles.refetch()}>{t.retry}</Button>
            </div>
          )}
          <ul className={libraryGrid}>
            {chatFiles.data?.map((file) => (
              <li key={`${file.chatId}:${file.messageId}:${file.position}`} className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
                <ChatGalleryPreview accountId={state.accountId} file={file} />
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate text-sm font-medium" title={file.name ?? undefined}>
                    {file.name ?? c.storedChatFile}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`${c.removeOriginal}: ${file.name ?? c.storedChatFile}`}
                    title={c.removeOriginal}
                    onClick={() => {
                      removeChatFile.reset();
                      show({ kind: "removeChatFile", file });
                    }}
                  >
                    <Trash aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {action?.kind === "removeChatFile" && (
        <Dialog open onOpenChange={(open) => { if (!open && !removeChatFile.isPending) close(); }}>
          <DialogContent className="text-center" showCloseButton={!removeChatFile.isPending}>
            <DialogTitle>{c.removeOriginal}</DialogTitle>
            <DialogDescription>{c.removeChatFileDescription}</DialogDescription>
            <p className="wrap-break-word">{action.file.name ?? c.storedChatFile}</p>
            {removeChatFile.error && <p role="alert" className="text-sm text-destructive">{cvErrorText(removeChatFile.error, locale)}</p>}
            <DialogFooter className="sm:justify-center">
              <Button variant="outline" onClick={close} disabled={removeChatFile.isPending}>{t.cancel}</Button>
              <Button variant="destructive" disabled={removeChatFile.isPending} onClick={() => removeChatFile.mutate(action.file)}>
                {removeChatFile.isPending ? c.removingOriginal : c.removeOriginal}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {action?.kind === "removeOriginal" && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !removeOriginal.isPending) close();
          }}
        >
          <DialogContent className="text-center" showCloseButton={!removeOriginal.isPending}>
            <DialogTitle className="px-6">{c.removeOriginal}</DialogTitle>
            <DialogDescription>{c.removeOriginalDescription}</DialogDescription>
            <p className="text-sm font-medium wrap-break-word">{action.original.name}</p>
            {removeOriginal.error && (
              <p role="alert" className="text-sm text-destructive">
                {cvErrorText(removeOriginal.error, locale)}
              </p>
            )}
            <DialogFooter className="flex-row flex-wrap justify-center sm:justify-center">
              <Button variant="outline" disabled={removeOriginal.isPending} onClick={close}>
                {t.cancel}
              </Button>
              <Button
                variant="destructive"
                disabled={removeOriginal.isPending}
                onClick={() => removeOriginal.mutate(action.original.id)}
              >
                {removeOriginal.isPending ? c.removingOriginal : c.removeOriginal}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {action?.kind === "import" && (
        <CvImportDialog
          onImported={(uploaded) => {
            client.setQueryData<OriginalDocument[]>(originalsKey, (current) => [
              ...uploaded,
              ...(current ?? []).filter((item) => !uploaded.some(({ id }) => id === item.id)),
            ]);
            void client.invalidateQueries({ queryKey: originalsKey });
            notifySuccess(c.originalsImported);
            const original = uploaded[0];
            if (uploaded.length === 1 && original) show({ kind: "original", original });
            else close();
          }}
          onClose={close}
        />
      )}
      {action?.kind === "replace" && (
        <CvReplaceDialog
          primary={action.document}
          onSaved={(document) => {
            saveDocument(document, c.replaced);
            void client.invalidateQueries({ queryKey: originalsKey });
          }}
          onClose={close}
        />
      )}
      {action?.kind === "original" && (
        <CvOriginalDialog
          accountId={state.accountId}
          original={action.original}
          onEdit={(document) => {
            client.setQueryData(cvKey(state.accountId, document.id), document);
            void client.invalidateQueries({ queryKey: cvKey(state.accountId), exact: true });
            show({ kind: "edit", document });
          }}
          onClose={close}
        />
      )}
      {(action?.kind === "view" || action?.kind === "edit") && (
        <OpenCv
          accountId={state.accountId}
          summary={action.document}
          mode={action.kind}
          onClose={close}
          onSave={(document) => saveDocument(document, c.saved)}
        />
      )}
      {action &&
        "document" in action &&
        (action.kind === "duplicate" || action.kind === "rename" || action.kind === "remove") && (
          <CvActionDialog
            document={action.document}
            kind={action.kind}
            onClose={close}
            onSave={(document) => {
              if (document)
                saveDocument(document, action.kind === "duplicate" ? c.duplicated : c.saved);
              else {
                refresh(action.document.kind === "primary");
                client.removeQueries({
                  queryKey: cvKey(state.accountId, action.document.id),
                  exact: true,
                });
                notifySuccess(c.removed);
              }
              if (document && action.kind === "duplicate") show({ kind: "edit", document });
              else close();
            }}
          />
        )}
    </div>
  );
}

function OpenCv({
  accountId,
  summary,
  mode,
  onClose,
  onSave,
}: {
  accountId: string;
  summary: CvSummary;
  mode: "view" | "edit";
  onClose: () => void;
  onSave: (document: CvDetail) => void;
}) {
  const { t, locale } = useI18n();
  const query = useQuery({
    queryKey: cvKey(accountId, summary.id),
    queryFn: ({ signal }) => cvApi.detail(summary.id, signal),
    retry: false,
  });
  return query.data ? (
    <CvDraftDialog
      id={summary.id}
      initial={query.data}
      title={summary.name}
      submitLabel={t.cvs.save}
      mode={mode}
      onClose={onClose}
      onSave={async (draft) => {
        const document = await cvApi.save(summary.id, draft);
        onSave(document);
        return document;
      }}
    />
  ) : (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>{summary.name}</DialogTitle>
        {query.error ? (
          <>
            <DialogDescription role="alert" className="text-destructive">
              {cvErrorText(query.error, locale)}
            </DialogDescription>
            <Button onClick={() => void query.refetch()}>{t.retry}</Button>
          </>
        ) : (
          <p role="status">{t.cvs.loading}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CvActionDialog({
  document,
  kind,
  onClose,
  onSave,
}: {
  document: CvSummary;
  kind: "duplicate" | "rename" | "remove";
  onClose: () => void;
  onSave: (document?: CvDetail) => void;
}) {
  const { t, locale } = useI18n();
  const c = t.cvs;
  const [name, setName] = useState(kind === "duplicate" ? "" : document.name);
  const [specialization, setSpecialization] = useState(document.specialization);
  const [id] = useState(() => crypto.randomUUID());
  const [revision, setRevision] = useState(document.revision);
  const [latest, setLatest] = useState<CvDetail>();
  const save = useMutation({
    mutationFn: async () => {
      if (kind === "remove") {
        await cvApi.remove(document.id);
        return;
      }
      const metadata = cvMetadataSchema.safeParse({ name, specialization });
      if (!metadata.success) throw new ProfileError("INVALID_REQUEST");
      if (kind === "duplicate")
        return cvApi.duplicate({ ...metadata.data, id, sourceId: document.id });
      return cvApi.save(document.id, { ...metadata.data, revision });
    },
    onSuccess: onSave,
  });
  const refresh = useMutation({
    mutationFn: () => cvApi.detail(document.id),
    onSuccess: setLatest,
  });
  const conflict = save.error instanceof ProfileError && save.error.code === "CV_CONFLICT";
  const title =
    kind === "remove" ? c.removeTitle : kind === "duplicate" ? c.duplicateTitle : c.rename;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        {kind === "remove" && (
          <DialogDescription>
            {document.kind === "primary" ? c.removePrimary : c.removeVariant}
          </DialogDescription>
        )}
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!save.isPending && !conflict) save.mutate();
          }}
        >
          {kind !== "remove" && (
            <fieldset className="grid gap-3" disabled={save.isPending}>
              <label className="grid gap-1.5">
                {c.name}
                <Input
                  required
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="grid gap-1.5">
                {c.specialization}
                <Input
                  maxLength={120}
                  value={specialization}
                  onChange={(event) => setSpecialization(event.target.value)}
                />
              </label>
            </fieldset>
          )}
          {(save.error || refresh.error) && (
            <p role="alert" className={conflict ? "text-warning" : "text-destructive"}>
              {cvErrorText(refresh.error ?? save.error, locale)}
            </p>
          )}
          {conflict &&
            (latest ? (
              <div className="space-y-2 border-t border-border pt-3">
                <p>
                  {latest.name}
                  {latest.specialization && ` · ${latest.specialization}`}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setRevision(latest.revision);
                    save.reset();
                    setLatest(undefined);
                  }}
                >
                  {c.confirmOverwrite}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={refresh.isPending}
                onClick={() => refresh.mutate()}
              >
                {c.reviewLatest}
              </Button>
            ))}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
              {t.cancel}
            </Button>
            <Button
              type="submit"
              variant={kind === "remove" ? "destructive" : "default"}
              disabled={save.isPending || conflict}
            >
              {save.isPending
                ? c.saving
                : save.error
                  ? t.retry
                  : kind === "rename"
                    ? c.save
                    : kind === "remove"
                      ? c.remove
                      : c.duplicate}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
