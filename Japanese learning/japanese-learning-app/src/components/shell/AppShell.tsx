import * as React from "react";
import { LeftRail } from "./LeftRail";
import { BottomNav } from "./BottomNav";
import { NavKey } from "./nav";

interface Props {
  active?: NavKey;
  topbar?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ active, topbar, children }: Props) {
  return (
    <div className="flex min-h-screen bg-paper text-ink">
      <LeftRail active={active} />
      <div className="flex min-h-screen flex-1 flex-col">
        {topbar}
        <main className="flex-1 overflow-x-hidden pb-16 md:pb-0">
          {children}
        </main>
      </div>
      <BottomNav active={active} />
    </div>
  );
}
