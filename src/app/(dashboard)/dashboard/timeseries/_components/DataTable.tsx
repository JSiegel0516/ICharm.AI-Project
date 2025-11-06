"use client";
import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type DatasetInfo, formatValue } from "@/hooks/use-timeseries";

interface DataTableProps {
  data: any[];
  selectedDatasets: DatasetInfo[];
  metadata?: Record<string, any> | null;
  yAxisUnit?: string;
}

export function DataTable({
  data,
  selectedDatasets,
  metadata,
  yAxisUnit = "",
}: DataTableProps) {
  if (!data || data.length === 0) {
    return null;
  }

  // Helper function to format value with unit
  const formatCellValue = (value: any, unit: string): string => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "number") {
      return formatValue(value, unit, false); // Don't include unit in table
    }
    return String(value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Data Table</CardTitle>
        <CardDescription>
          Showing first 100 of {data.length} rows{" "}
          {yAxisUnit && `• Values in ${yAxisUnit}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="bg-background sticky top-0 left-0 z-20">
                  Date
                </TableHead>
                {selectedDatasets.map((dataset) => (
                  <TableHead
                    key={dataset.id}
                    className="bg-background sticky top-0 z-10"
                  >
                    <div className="flex flex-col">
                      <span>{dataset.name || dataset.slug}</span>
                      {yAxisUnit && (
                        <span className="text-muted-foreground text-xs font-normal">
                          ({yAxisUnit})
                        </span>
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.slice(0, 100).map((point, idx) => (
                <TableRow key={idx}>
                  <TableCell className="bg-background sticky left-0 z-10 font-mono text-xs">
                    {point.date}
                  </TableCell>
                  {selectedDatasets.map((dataset) => (
                    <TableCell key={dataset.id} className="font-mono text-xs">
                      {/* Access value directly from point[dataset.id] since data is already flattened */}
                      {formatCellValue(point[dataset.id], yAxisUnit)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
        {data.length > 100 && (
          <p className="text-muted-foreground mt-2 text-xs">
            Showing 100 of {data.length} total rows. Export to CSV for full
            dataset.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
