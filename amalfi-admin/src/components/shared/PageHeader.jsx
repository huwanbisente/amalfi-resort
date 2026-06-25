import React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
  className,
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-end justify-between gap-4 px-0.5 py-2.5 md:py-3.5", className)}>
      <div className="min-w-0">
        <h1 className="m-0 max-w-4xl font-serif text-[clamp(1.5rem,2.15vw,2.35rem)] font-black leading-[1] tracking-[-0.035em] text-[#13211f]">
          {title}
        </h1>
        {description && (
          <p className="m-0 mt-2.5 max-w-5xl text-[0.84rem] font-semibold leading-[1.55] text-[#4f5d58]">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
