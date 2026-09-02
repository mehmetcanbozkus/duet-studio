"use client";

import { Bot } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStudio } from "@/lib/studio/store";

/** Human-in-the-loop approval for destructive agent actions. */
export function ConfirmDialog() {
  const pending = useStudio((s) => s.pendingConfirm);
  const resolve = useStudio((s) => s.resolveConfirmation);

  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => !open && pending && resolve(pending.id, false)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="text-agent size-5" />
            {pending?.title}
          </DialogTitle>
          <DialogDescription>{pending?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => pending && resolve(pending.id, false)}
          >
            Decline
          </Button>
          <Button onClick={() => pending && resolve(pending.id, true)}>
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
