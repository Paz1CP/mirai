import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function CvDocumentDialog({
  title,
  description,
  action,
  children,
  onClose,
}: {
  title: string;
  description?: ReactNode;
  action: ReactNode;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex h-[92svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,100rem)]">
        <div className="flex shrink-0 items-center gap-3 border-b border-border py-3 ps-5 pe-12">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate">{title}</DialogTitle>
            {description}
          </div>
          {action}
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}
