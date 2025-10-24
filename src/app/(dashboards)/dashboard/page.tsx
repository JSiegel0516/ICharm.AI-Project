import { AppSidebar } from '@/app/(dashboards)/dashboard/_components/app-sidebar';
import { ChartAreaInteractive } from '@/components/chart-area-interactive';
import { DataTable } from '@/components/data-table';
import { SectionCards } from '@/components/section-cards';
import { SiteHeader } from '@/app/(dashboards)/dashboard/_components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';

import data from './data.json';

export default function Page() {
  return (
    <SidebarProvider>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <ResizablePanelGroup direction="horizontal">
                <ResizablePanel>
                  <SectionCards />
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel>
                  <ChartAreaInteractive />
                </ResizablePanel>
              </ResizablePanelGroup>

              <DataTable data={data} />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
