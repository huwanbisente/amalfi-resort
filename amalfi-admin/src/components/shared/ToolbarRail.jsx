import React from "react";
import { cn } from "@/lib/utils";

export function ToolbarRail({ label, icon, children, actions, className }) {
  return (
    <div className={cn("border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] flex min-h-12 flex-wrap items-center justify-between gap-3 rounded-[18px] px-3 py-2", className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
        {(label || icon) && (
          <div className="flex shrink-0 items-center gap-2 text-[0.58rem] font-black uppercase tracking-[0.13em] text-[#5f6d66]">
            {icon}
            {label && <span>{label}</span>}
          </div>
        )}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
