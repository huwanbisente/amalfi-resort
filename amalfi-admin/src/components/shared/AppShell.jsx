import React from "react";
import { cn } from "@/lib/utils";

export function AppShell({ className, themeMode = "light", header, sidebar, children }) {
  return (
    <div
      className={cn(
        `admin-theme-${themeMode}`,
        "min-h-screen overflow-x-auto bg-[radial-gradient(circle_at_18%_0%,rgba(198,146,63,0.16),transparent_30%),linear-gradient(180deg,#fffdf8_0%,#f4efe6_46%,#efe4d3_100%)] font-resortSans text-foreground",
        className
      )}
    >
      {header}
      <div className="flex min-w-[1180px] items-stretch">
        {sidebar}
        <main className="min-w-0 flex-1 bg-[radial-gradient(circle_at_90%_0%,rgba(10,107,95,0.10),transparent_30%),linear-gradient(180deg,rgba(255,253,248,0.72),rgba(244,239,230,0.86))] px-4 py-5 sm:px-5 md:px-7 md:py-7 2xl:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
