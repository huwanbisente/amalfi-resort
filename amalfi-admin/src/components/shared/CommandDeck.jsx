import React from "react";
import { cn } from "@/lib/utils";

export function CommandDeck({
  eyebrow,
  title,
  description,
  primary,
  secondary,
  children,
  className,
}) {
  return (
    <section className={cn("border border-[#bda982] bg-[#fffdf8]/[0.96] shadow-[inset_0_0_0_1px_rgba(189,169,130,0.34),0_16px_36px_rgba(19,33,31,0.06)] overflow-hidden rounded-[24px]", className)}>
      <div className="grid gap-4 border-b border-[#092a28]/25 bg-[linear-gradient(135deg,#092a28_0%,#0a4f48_58%,#0a6b5f_100%)] px-5 py-4 xl:grid-cols-[minmax(250px,1fr)_auto] xl:items-start">
        <div className="flex min-w-[250px] flex-col gap-1.5">
          {eyebrow && <span className="text-[0.58rem] font-black uppercase tracking-[0.22em] text-[#f4d89a]">{eyebrow}</span>}
          {title && <p className="m-0 text-[0.78rem] font-black tracking-[0.01em] text-[#fffdf8]/95">{title}</p>}
          {description && <p className="m-0 max-w-2xl text-[0.62rem] font-bold leading-snug text-[rgba(255,253,248,0.76)]">{description}</p>}
        </div>
        <div className="flex max-w-[920px] flex-wrap items-center justify-start gap-2 xl:justify-end">
          {primary}
          {secondary}
        </div>
      </div>
      {children}
    </section>
  );
}

export function DeckMetricRail({ intro, children, className }) {
  return (
    <div className={cn("grid items-stretch gap-3.5 border-b border-[#20342c1f] bg-gradient-to-b from-[#fffdf8] via-[#fffaf1] to-[#f8f1e4] px-5 py-3 lg:grid-cols-[minmax(150px,0.42fr)_minmax(0,1.58fr)]", className)}>
      {intro}
      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(168px,1fr))] gap-2.5">
        {children}
      </div>
    </div>
  );
}

export function DeckIntro({ eyebrow = "Today", title, description }) {
  return (
    <div className="grid content-center gap-1 rounded-[18px] border border-white/15 bg-gradient-to-br from-[#092a28] to-[#0a6b5f] px-3.5 py-2.5 shadow-sm">
      <div className="text-[0.55rem] font-black uppercase tracking-[1.4px] text-[#f7f6f0]/70">{eyebrow}</div>
      <div className="text-[0.92rem] font-black leading-tight text-[#fffdf8]">{title}</div>
      {description && <div className="text-[0.62rem] font-bold leading-snug text-[#f7f6f0]/70">{description}</div>}
    </div>
  );
}

export function DeckMetric({ label, caption, value, tone = "teal" }) {
  const tones = {
    teal: {
      card: "border-[#d9eee8] bg-[linear-gradient(135deg,#fbfffd_0%,#f1faf7_58%,#eaf7f3_100%)] text-[#0a6b5f]",
      rail: "from-[#d7fbef] via-[#8ee5cd] to-[#20a889]",
      glow: "bg-[#0a6b5f]/6",
    },
    gold: {
      card: "border-[#f2e6ce] bg-[linear-gradient(135deg,#fffdf8_0%,#fff9ef_58%,#fbf1df_100%)] text-[#a46b13]",
      rail: "from-[#fff3d5] via-[#e8c77f] to-[#c6923f]",
      glow: "bg-[#c6923f]/7",
    },
    blue: {
      card: "border-[#dbeaf3] bg-[linear-gradient(135deg,#fbfdff_0%,#f2f8fe_58%,#edf5fb_100%)] text-[#266c83]",
      rail: "from-[#dff1ff] via-[#9fd0e6] to-[#4b97b2]",
      glow: "bg-[#266c83]/6",
    },
    red: {
      card: "border-[#f2dada] bg-[linear-gradient(135deg,#fffdfd_0%,#fff6f6_58%,#fceeee_100%)] text-[#c84a4a]",
      rail: "from-[#ffe4e4] via-[#efa1a1] to-[#d75a5a]",
      glow: "bg-[#c84a4a]/6",
    },
    violet: {
      card: "border-[#e5ddfa] bg-[linear-gradient(135deg,#fffdfd_0%,#f8f4ff_58%,#f2ecff_100%)] text-[#5b35b1]",
      rail: "from-[#eee4ff] via-[#c6adff] to-[#7f5fd5]",
      glow: "bg-[#5b35b1]/6",
    },
  };
  const toneClasses = tones[tone] || tones.teal;
  return (
    <div className={cn("group relative grid min-h-[68px] min-w-0 grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-[18px] border px-2.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_28px_rgba(19,33,31,0.045)] transition hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_38px_rgba(19,33,31,0.07)]", toneClasses.card)}>
      <span aria-hidden="true" className={cn("absolute -right-7 -top-7 size-20 rounded-full blur-2xl transition group-hover:scale-110", toneClasses.glow)} />
      <span aria-hidden="true" className={cn("relative h-[42px] w-3 rounded-full bg-gradient-to-b shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_16px_rgba(19,33,31,0.08)]", toneClasses.rail)} />
      <span className="relative grid min-w-0 gap-0.5">
        <span className="text-[0.63rem] font-black uppercase leading-tight tracking-[0.12em]">{label}</span>
        {caption && <span className="text-[0.62rem] font-bold leading-tight text-[#4f5d58]">{caption}</span>}
      </span>
      <span className="relative max-w-[96px] truncate text-right font-resortMono text-[1.18rem] font-black leading-none tracking-normal">{value}</span>
    </div>
  );
}

export function DeckWorkspace({ label = "Workspace", title, description, actions, children, className }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 bg-[#fffdf8] px-5 py-3", className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <div className="text-[0.58rem] font-black uppercase tracking-[0.18em] text-[#5f6d66]">{label}</div>
        <div className="min-w-0">
          <div className="text-[0.92rem] font-black leading-tight text-[#13211f]">{title}</div>
          {description && <div className="mt-0.5 max-w-3xl text-[0.68rem] font-semibold leading-snug text-[#69776f]">{description}</div>}
        </div>
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
