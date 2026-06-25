import React from "react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export function EmptyState({ title = "Nothing here yet", description, action, className }) {
  return (
    <Empty className={cn("rounded-2xl border border-transparent bg-[#f7eedf]/42 p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]", className)}>
      <EmptyHeader>
        <EmptyTitle className="font-resortDisplay text-amalfi-ink">{title}</EmptyTitle>
        {description && <EmptyDescription className="text-amalfi-muted">{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
