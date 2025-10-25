import { ChartAreaInteractive } from '@/components/chart-area-interactive';
import { DataTable } from '@/components/data-table';
import { SectionCards } from '@/components/section-cards';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import data from './data.json';

export default function Page() {
  return (
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
  );
}
