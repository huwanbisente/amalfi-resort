import React from "react";
import { 
  LayoutDashboard, 
  Calendar, 
  ClipboardList,
  Home, 
  Settings, 
  Waves,
  BarChart3,
  Wallet,
  TrendingUp,
  MessageSquareText,
  Bot,
  ChevronRight,
  UserRoundCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function Sidebar({ activeTab, setActiveTab, pendingCount, specialCount }) {
  const navGroups = [
    {
      label: "Hub Overview",
      items: [
        { id: 'summary', title: "Admin Summary", icon: LayoutDashboard },
      ]
    },
    {
      label: "Booking Desk",
      items: [
        { id: 'pending', title: "Verifications", icon: ClipboardList, badge: pendingCount },
        { id: 'ledger', title: "Central Ledger", icon: Wallet },
      ]
    },
    {
      label: "Units",
      items: [
        { id: 'map', title: "Sanctuary Map", icon: Calendar },
        { id: 'special', title: "Special Bookings", icon: Waves, badge: specialCount },
        { id: 'units', title: "Units Hub", icon: Home },
      ]
    },
    {
      label: "Analytics",
      items: [
        { id: 'analytics', title: "Performance", icon: TrendingUp },
        { id: 'reports', title: "Financial Reports", icon: BarChart3 },
      ]
    },
    {
      label: "Management Hub",
      items: [
        { id: 'knowledge', title: "Knowledge Monitor", icon: Settings },
        { id: 'responses', title: "Response Helper", icon: MessageSquareText },
        { id: 'concierge', title: "Chatbot Monitor", icon: Bot },
      ]
    }
  ];

  const activeItem = navGroups.flatMap((group) => group.items).find((item) => item.id === activeTab);
  return (
    <aside className="flex min-h-[calc(100vh-118px)] w-72 shrink-0 self-stretch border-r border-[#d8c9b3]/20 bg-[linear-gradient(180deg,#082f2d_0%,#092a28_54%,#111827_100%)] px-4 py-5 shadow-[18px_0_44px_rgba(9,42,40,0.20)]">
      <div className="flex min-h-full w-full flex-col">
      <div className="relative mb-10 overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,248,232,0.12),rgba(255,255,255,0.035)_48%,rgba(10,107,95,0.10))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_16px_34px_rgba(0,0,0,0.10)]">
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(198,146,63,0.70),transparent)]" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="block text-[0.58rem] font-black uppercase tracking-[0.25em] text-[#d7b66f]">Amalfi Control</span>
            <span className="mt-1 block truncate font-serif text-[1.18rem] font-black leading-none tracking-[-0.03em] text-[#fff8e8]">Admin Desk</span>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#b9ddcf]/18 bg-[#e8f5f0]/10 px-2 py-1 text-[0.58rem] font-black uppercase tracking-[0.12em] text-[#b9f2dd]">
              <span className="size-1.5 rounded-full bg-[#6ee7b7] shadow-[0_0_10px_rgba(110,231,183,0.65)]" />
              Live Shift
            </span>
          </div>
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[#c6923f]/35 bg-[#fff8e8]/10 text-[#d7b66f] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
            <UserRoundCheck className="size-5" />
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-7">
        {navGroups.map((group) => (
          <div key={group.label} className="grid gap-3">
            <div className="mx-3 text-[0.68rem] font-extrabold tracking-normal text-[#d7b66f]">
              {group.label}
            </div>
            <div className="grid gap-2">
            {group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={item.title}
                className={cn(
                  "group relative grid min-h-11 w-full grid-cols-[20px_minmax(0,1fr)_44px] items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-[0.82rem] font-bold normal-case tracking-normal transition",
                  activeTab === item.id
                    ? "border-[#c6923f] bg-[#173f3a] text-[#fff8e8] shadow-[0_14px_28px_rgba(0,0,0,0.14)]"
                    : "border-transparent bg-transparent text-[#d7ccbd] hover:border-[#ffffff1a] hover:bg-[#123b37] hover:text-[#fff8e8]"
                )}
              >
                {activeTab === item.id && <span className="absolute left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-[#c6923f]" />}
                <item.icon className={cn("size-4 justify-self-start", activeTab === item.id ? "text-[#d7b66f]" : "text-[#fff8e8]/52 group-hover:text-[#d7b66f]")} />
                <span className="truncate [word-spacing:0.14em]">{item.title}</span>
                <span className="flex min-w-0 items-center justify-end gap-1">
                  {item.badge > 0 && (
                    <Badge className="min-w-6 shrink-0 rounded-full bg-[#d7b66f] px-2 py-0.5 text-center text-[0.65rem] font-black text-[#092a28] hover:bg-[#d7b66f]">
                      {item.badge}
                    </Badge>
                  )}
                  {activeTab === item.id && <ChevronRight className="size-3.5 shrink-0 text-[#d7b66f]/80" />}
                </span>
              </button>
            ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-7 rounded-[20px] border border-white/10 bg-black/10 p-3">
        <div className="text-[0.62rem] font-black uppercase tracking-[0.2em] text-[#c6923f]">Current View</div>
        <div className="mt-1 truncate text-sm font-extrabold text-[#fff8e8]">{activeItem?.title || 'Admin Summary'}</div>
      </div>
      </div>
    </aside>
  );
}
