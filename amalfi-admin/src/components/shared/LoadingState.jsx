import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingState({ label = "Loading workspace...", className }) {
  return (
    <div className={cn("grid gap-4 rounded-2xl border border-transparent bg-[#fffdf8]/88 shadow-[0_16px_36px_rgba(19,33,31,0.06)] p-6 shadow-[0_16px_36px_rgba(19,33,31,0.06)]", className)}>
      <div className="text-sm font-black uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="grid gap-3">
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    </div>
  );
}
