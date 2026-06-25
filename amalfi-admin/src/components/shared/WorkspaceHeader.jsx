import React from "react";
import { cn } from "@/lib/utils";

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}) {
  return (
    <div className={cn("relative flex flex-wrap items-start justify-between gap-3 overflow-hidden rounded-[20px] border border-[#d8c9b3]/72 bg-[#fffdf8]/88 px-4 py-3 shadow-[0_14px_34px_rgba(19,33,31,0.055)] ring-1 ring-white/55", className)}>
      <div className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-[linear-gradient(180deg,#c6923f,#0a6b5f)]" />
      <div className="min-w-0 pl-2">
        {eyebrow && (
          <div className="mb-1.5 text-[0.56rem] font-black uppercase tracking-[0.18em] text-[#0a6b5f]">
            {eyebrow}
          </div>
        )}
        <h2 className="m-0 font-serif text-[1rem] font-black leading-tight tracking-[-0.02em] text-[#13211f]">
          {title}
        </h2>
        {description && (
          <p className="m-0 mt-1 max-w-3xl text-[0.72rem] font-semibold leading-[1.45] text-[#69776f]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 rounded-[16px] border border-[#d8c9b3]/54 bg-white/55 p-1 shadow-[0_10px_22px_rgba(19,33,31,0.04)]">{actions}</div>}
    </div>
  );
}
