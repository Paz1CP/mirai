"use client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function notifySuccess(message: string) {
  const id = crypto.randomUUID();
  toast.success(
    <Button
      variant="ghost"
      className="h-auto whitespace-normal p-0 text-start font-normal hover:bg-transparent after:absolute after:inset-0 after:content-['']"
      onClick={() => toast.dismiss(id)}
    >
      {message}
    </Button>,
    { id },
  );
}
