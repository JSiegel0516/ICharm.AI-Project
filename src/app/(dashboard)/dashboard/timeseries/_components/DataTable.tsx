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
import { type DatasetInfo } from "@/hooks/use-timeseries";

interface DataTableProps {
  data: any[];
  selectedDatasets: DatasetInfo[];
}

export function DataTable({ data, selectedDatasets }: DataTableProps) {
  if (!data || data.length === 0) {
    return null;
  }

  // Helper function to format value
  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "number") {
      return value.toFixed(2);
    }
    return String(value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Data Table</CardTitle>
        <CardDescription>
          Showing first 50 of {data.length} rows
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="bg-background sticky left-0">
                  Date
                </TableHead>
                {selectedDatasets.map((dataset) => (
                  <TableHead key={dataset.id}>
                    {dataset.name || dataset.slug}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.slice(0, 50).map((point, idx) => (
                <TableRow key={idx}>
                  <TableCell className="bg-background sticky left-0 font-mono text-xs">
                    {point.date}
                  </TableCell>
                  {selectedDatasets.map((dataset) => (
                    <TableCell key={dataset.id} className="font-mono text-xs">
                      {/* FIXED: Access dataset.id directly, not point.values[dataset.id] */}
                      {formatValue(point[dataset.id])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
