'use client';
import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type DatasetInfo } from '@/hooks/use-timeseries';

interface DataTableProps {
  data: any[];
  selectedDatasets: DatasetInfo[];
}

export function DataTable({ data, selectedDatasets }: DataTableProps) {
  if (!data || data.length === 0) {
    return null;
  }

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
                <TableHead>Date</TableHead>
                {selectedDatasets.map((dataset) => (
                  <TableHead key={dataset.id}>{dataset.name}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.slice(0, 50).map((point, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-xs">
                    {point.date}
                  </TableCell>
                  {selectedDatasets.map((dataset) => (
                    <TableCell key={dataset.id} className="font-mono text-xs">
                      {point.values[dataset.id]?.toFixed(2) || '-'}
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
