import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const toneClass = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-700",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  neutral: "border-[#d8c9b3]/70 bg-[#f7eedf]/70 text-[#5f6d66]",
};

export function StatusBadge({ tone = "neutral", className, children }) {
  return (
    <Badge variant="outline" className={cn("rounded-full px-2.5 py-0.5 text-[0.68rem] font-black uppercase tracking-[0.08em]", toneClass[tone] || toneClass.neutral, className)}>
      {children}
    </Badge>
  );
}
