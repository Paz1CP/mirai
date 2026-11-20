"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { navigateWorkspace } from "@/features/sessions/workspaceRoutes";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { ProfileError } from "./profileApi";

export function isDocumentLimit(error: unknown) {
  return error instanceof ProfileError && error.code === "ORIGINAL_UPLOAD_LIMIT";
}

export function DocumentLimitDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="text-center">
        <DialogTitle>{t.cvs.fileLimitTitle}</DialogTitle>
        <DialogDescription>{t.cvs.fileLimitDescription}</DialogDescription>
        <DialogFooter className="sm:justify-center">
          <Button
            onClick={() => {
              onClose();
              navigateWorkspace("/documents");
            }}
          >
            {t.cvs.manageFiles}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
