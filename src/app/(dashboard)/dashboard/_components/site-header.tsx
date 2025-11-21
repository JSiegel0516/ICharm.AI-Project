"use client";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { usePathname } from "next/navigation";

// Define your page titles
const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/documents": "Documents",
  "/dashboard/timeseries": "Time Series Analysis",
  "/analysis": "Analysis",
  "/settings": "Settings",
};

export function SiteHeader() {
  const pathname = usePathname();

  // Get the title for the current page, with fallback
  const pageTitle = PAGE_TITLES[pathname] || "iCharm Dashboard";

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{pageTitle}</h1>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
