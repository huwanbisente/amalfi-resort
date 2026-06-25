import React from "react";
import { cn } from "@/lib/utils";

export function TableWrapper({ className, children }) {
  return (
    <div className={cn("overflow-hidden rounded-[24px] border border-[#d8c9b3]/70 bg-[#fffdf8]/92 shadow-[0_16px_36px_rgba(19,33,31,0.06)]", className)}>
      <div className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
