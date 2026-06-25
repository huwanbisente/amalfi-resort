import React from "react";
import { Bell, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTimeInManila } from "@/utils/manilaDate";

const HEADER_ASSET_VERSION = "20260525a";
const versionAsset = (src) => `${src}${src.includes("?") ? "&" : "?"}v=${HEADER_ASSET_VERSION}`;

export function Header({
  brand = "Amalfi Resort",
  context = "Admin Hub Operations",
  logoSrc = versionAsset("/assets/resort-logo.jpg"),
  backgroundSrc = versionAsset("/assets/admin-header-brand-resort-left.png"),
  services = [],
  serviceSwitches = {},
  serviceBusyKey = null,
  onToggleService,
  onNotificationsClick,
  pendingCount = 0,
  currentTime = new Date(),
}) {
  return (
    <header className="sticky top-0 z-40 h-[118px] overflow-hidden border-b border-[#d8c9b3]/70 bg-[#fffdf8] shadow-[0_14px_34px_rgba(19,33,31,0.08)] backdrop-blur-xl">
      <img
        src={backgroundSrc}
        alt=""
        aria-hidden="true"
        decoding="async"
        fetchPriority="high"
        className="absolute inset-0 size-full object-cover object-[left_42%] opacity-100"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,253,248,0.62)_0%,rgba(255,253,248,0.38)_18%,rgba(255,253,248,0.12)_40%,rgba(255,253,248,0.08)_68%,rgba(255,253,248,0.22)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.10)_0%,rgba(255,253,248,0)_52%,rgba(255,253,248,0.18)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-4 bg-[linear-gradient(180deg,transparent,rgba(255,253,248,0.20))]" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(198,146,63,0.55),rgba(10,107,95,0.25),transparent)]" />

      <div className="relative flex h-full items-center justify-between gap-4 px-4 sm:px-5 md:px-7">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex size-[68px] shrink-0 items-center justify-center overflow-hidden rounded-[24px] bg-white shadow-[0_16px_34px_rgba(19,33,31,0.15)] ring-1 ring-[#c6923f]/75 sm:size-[74px]">
            <img src={logoSrc} alt="Amalfi Resort logo" className="size-full object-cover" />
          </div>
          <div className="min-w-0 leading-[0.9]">
            <div className="truncate font-serif text-[2rem] font-black tracking-[-0.045em] text-[#13211f] drop-shadow-[0_1px_0_rgba(255,253,248,0.78)] sm:text-[2.42rem] xl:text-[2.92rem]">
              {brand}
            </div>
            <div className="mt-2.5 flex items-center gap-2 font-resortMono text-[0.64rem] font-black uppercase tracking-[0.28em] text-[#08443f]">
              <span className="size-1.5 rounded-full bg-[#c6923f] shadow-[0_0_0_3px_rgba(255,253,248,0.68)]" />
              {context}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-2.5">
          <div className="hidden items-center gap-2 lg:flex">
            {services.map(({ key, label, description, Icon: ServiceIcon = Wifi }) => {
              const enabled = serviceSwitches[key] !== false;
              const busy = serviceBusyKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  className="flex h-10 items-center gap-2 rounded-2xl border border-white/75 bg-white/64 px-3 text-[0.7rem] font-extrabold text-[#13211f] shadow-[0_10px_24px_rgba(19,33,31,0.07),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-[#c6923f]/55 hover:bg-white/82"
                  onClick={() => onToggleService?.(key)}
                  disabled={Boolean(serviceBusyKey)}
                  title={`${label}: ${enabled ? "Online" : "Paused"} - ${description || ""}`}
                >
                  <span className={cn("grid size-6 place-items-center rounded-xl border", enabled ? "border-[#b9ddcf]/70 bg-[#e8f5f0]/92" : "border-[#d8c9b3]/70 bg-[#f7eedf]/80")}>
                    <ServiceIcon className={cn("size-3.5", enabled ? "text-[#0a6b5f]" : "text-[#69776f]")} />
                  </span>
                  <span className="hidden xl:inline">{label}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[0.54rem] font-black uppercase leading-none shadow-[0_8px_18px_rgba(19,33,31,0.05)] ring-1 ring-white/60",
                      enabled ? "bg-[#e8f5f0] text-[#0a6b5f]" : "bg-[#eee2cf] text-[#69776f]"
                    )}
                  >
                    {busy ? "..." : enabled ? "ON" : "OFF"}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="relative grid size-11 place-items-center rounded-2xl border border-white/80 bg-white/72 text-[#0a6b5f] shadow-[0_12px_26px_rgba(19,33,31,0.09),inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c6923f]/70"
            title={pendingCount > 0 ? `${pendingCount} payment verification${pendingCount === 1 ? "" : "s"} pending` : "No pending notifications"}
            aria-label={pendingCount > 0 ? `Open ${pendingCount} pending payment verification${pendingCount === 1 ? "" : "s"}` : "Open notifications"}
            onClick={onNotificationsClick}
          >
            <Bell size={18} />
            {pendingCount > 0 && (
              <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[0.58rem] font-black leading-none text-white shadow-[0_8px_18px_rgba(239,68,68,0.28)] ring-2 ring-white">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </button>

          <div className="relative hidden h-[82px] w-[252px] shrink-0 overflow-hidden rounded-[34px] border border-white/80 bg-[#fffaf0]/82 px-5 py-3 text-[#13211f] shadow-[0_16px_36px_rgba(96,68,31,0.16),inset_0_1px_0_rgba(255,255,255,0.9),inset_0_0_0_1px_rgba(255,255,255,0.48)] backdrop-blur-xl sm:block">
            <img
              src={versionAsset("/assets/admin-clock-motif.png")}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute left-[88px] top-[-13px] h-[112px] w-[178px] object-cover object-[50%_50%] opacity-92"
            />
            <div className="pointer-events-none absolute inset-0 rounded-[34px] bg-[linear-gradient(90deg,rgba(255,250,240,0.99)_0%,rgba(255,250,240,0.92)_33%,rgba(255,250,240,0.2)_56%,rgba(255,250,240,0)_100%)]" />
            <div className="pointer-events-none absolute left-3 top-3 h-[55px] w-[110px] rounded-[22px] bg-[#fffaf0]/74 blur-[1px]" />
            <div className="pointer-events-none absolute inset-0 rounded-[34px] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.68)]" />
            <div className="relative z-10 flex h-full w-[158px] flex-col justify-center">
              <div className="flex items-end gap-1 font-serif text-[2.55rem] font-black leading-[0.82] tracking-[-0.06em] text-[#13211f] drop-shadow-[0_1px_0_rgba(255,255,255,0.75)]">
                <span>{formatDateTimeInManila(currentTime, "en-PH", { hour12: true, hour: "2-digit", minute: "2-digit" }).replace(/\s?(AM|PM)$/i, "")}</span>
                <span className="pb-0.5 text-[1.16rem] tracking-[-0.04em]">
                  {formatDateTimeInManila(currentTime, "en-PH", { hour12: true, hour: "2-digit", minute: "2-digit" }).match(/(AM|PM)$/i)?.[0] || ""}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="font-resortMono text-[0.7rem] font-black uppercase tracking-[0.36em] text-[#8a7658]">
                  {formatDateTimeInManila(currentTime, "en-PH", { weekday: "short", month: "short", day: "numeric" }).replace(/,/g, "")}
                </div>
                <span className="h-[3px] w-9 rounded-full bg-[#b98330]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
