import type { ReactNode } from "react";

import { CommandMenuProvider } from "@/components/command-menu";
import { NavigationBar } from "@/components/layout/navigation-bar";
import { PageTransition } from "@/components/layout/page-transition";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <CommandMenuProvider>
      <div className="dark bg-background text-foreground relative h-dvh overflow-x-hidden">
        <NavigationBar stars={null} />
        <div className="absolute inset-0 overflow-x-hidden overflow-y-auto">
          <PageTransition>{children}</PageTransition>
        </div>
      </div>
    </CommandMenuProvider>
  );
}
