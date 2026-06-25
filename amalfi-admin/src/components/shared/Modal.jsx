import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function Modal({ open, onOpenChange, title, description, footer, className, children }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("rounded-2xl bg-[#fffdf8]/96 text-card-foreground sm:max-w-2xl", className)}>
        <DialogHeader className="flex flex-col gap-1.5 text-left">
          <DialogTitle className="font-resortDisplay text-xl text-amalfi-ink">{title}</DialogTitle>
          {description && <DialogDescription className="sr-only">{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {footer && <DialogFooter className="gap-2">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
