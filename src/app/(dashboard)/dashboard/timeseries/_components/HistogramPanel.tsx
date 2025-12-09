"use client";
import React, { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DatasetInfo } from "@/hooks/use-timeseries";

interface HistogramPanelProps {
  chartData: any[];
  selectedDatasets: DatasetInfo[];
  visibleDatasets: Set<string>;
  metadata: Record<string, any> | null;
  yAxisUnit: string;
}

/**
 * Calculate histogram bins for a dataset
 */
function calculateHistogram(
  values: number[],
  numBins: number = 20,
): { bin: string; count: number; range: { min: number; max: number } }[] {
  if (values.length === 0) return [];

  // Find min and max
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const binWidth = range / numBins;

  // Initialize bins
  const bins: {
    bin: string;
    count: number;
    range: { min: number; max: number };
  }[] = [];
  for (let i = 0; i < numBins; i++) {
    const binMin = min + i * binWidth;
    const binMax = min + (i + 1) * binWidth;
    bins.push({
      bin: `${binMin.toFixed(2)}-${binMax.toFixed(2)}`,
      count: 0,
      range: { min: binMin, max: binMax },
    });
  }

  // Count values in each bin
  values.forEach((value) => {
    const binIndex = Math.min(
      Math.floor((value - min) / binWidth),
      numBins - 1,
    );
    if (binIndex >= 0 && binIndex < numBins) {
      bins[binIndex].count++;
    }
  });

  return bins;
}

export function HistogramPanel({
  chartData,
  selectedDatasets,
  visibleDatasets,
  metadata,
  yAxisUnit,
}: HistogramPanelProps) {
  const visibleDatasetIds = Array.from(visibleDatasets);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(
    visibleDatasetIds[0] || "",
  );
  const [numBins, setNumBins] = useState<number>(20);
  const [binsInput, setBinsInput] = useState<string>("20"); // Local state for input

  // Calculate histogram for selected dataset (only if numBins > 0)
  const histogramData = useMemo(() => {
    if (chartData.length === 0 || !selectedDatasetId || numBins <= 0)
      return null;

    // Extract values for the selected dataset
    const values: number[] = [];
    chartData.forEach((point) => {
      const value = point[selectedDatasetId];
      if (typeof value === "number" && !isNaN(value) && value !== null) {
        values.push(value);
      }
    });

    if (values.length === 0) return null;

    return calculateHistogram(values, numBins);
  }, [chartData, selectedDatasetId, numBins]);

  // Calculate statistics (regardless of numBins)
  const stats = useMemo(() => {
    if (chartData.length === 0 || !selectedDatasetId) return null;

    const values: number[] = [];
    chartData.forEach((point) => {
      const value = point[selectedDatasetId];
      if (typeof value === "number" && !isNaN(value) && value !== null) {
        values.push(value);
      }
    });

    if (values.length === 0) return null;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);

    return {
      mean,
      std,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    };
  }, [chartData, selectedDatasetId]);

  const selectedDataset = selectedDatasets.find(
    (d) => d.id === selectedDatasetId,
  );

  // Color scale based on frequency
  const maxCount =
    histogramData && histogramData.length > 0
      ? Math.max(...histogramData.map((d) => d.count))
      : 0;
  const getBarColor = (count: number) => {
    if (maxCount === 0) return "rgb(136, 132, 216)";
    const intensity = count / maxCount;
    // Blue gradient: light to dark
    const r = Math.floor(136 + (255 - 136) * (1 - intensity));
    const g = Math.floor(132 + (255 - 132) * (1 - intensity));
    const b = 216;
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">Histogram</CardTitle>
            <CardDescription>
              Distribution of values showing frequency in bins
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            {/* Dataset selector */}
            {visibleDatasetIds.length > 1 && (
              <div className="flex items-center gap-2">
                <Label className="text-xs">Dataset:</Label>
                <Select
                  value={selectedDatasetId}
                  onValueChange={setSelectedDatasetId}
                >
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleDatasetIds.map((id) => {
                      const dataset = selectedDatasets.find((d) => d.id === id);
                      return (
                        <SelectItem key={id} value={id}>
                          {(dataset as any)?.datasetName || dataset?.name || id}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Number of bins input */}
            <div className="flex items-center gap-2">
              <Label className="text-xs">Bins:</Label>
              <Input
                type="number"
                min="5"
                max="100"
                step="1"
                value={binsInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setBinsInput(value); // Always update the display

                  // Only update numBins if it's a valid number
                  const numValue = parseInt(value);
                  if (!isNaN(numValue) && numValue >= 5 && numValue <= 100) {
                    setNumBins(numValue);
                  }
                }}
                onBlur={() => {
                  // On blur, sync with numBins or reset to default
                  const numValue = parseInt(binsInput);
                  if (isNaN(numValue) || numValue < 5 || numValue > 100) {
                    setNumBins(20);
                    setBinsInput("20");
                  } else {
                    setBinsInput(numValue.toString());
                  }
                }}
                className="h-8 w-[80px] text-xs"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {histogramData && histogramData.length > 0 ? (
          <>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={histogramData}
                  margin={{ top: 5, right: 30, left: 60, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="bin"
                    tick={{ fontSize: 10 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    label={{
                      value: `Value Range (${yAxisUnit})`,
                      position: "insideBottom",
                      offset: -50,
                      style: { fontSize: 12 },
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    label={{
                      value: "Frequency (Count)",
                      angle: -90,
                      position: "insideLeft",
                      style: { fontSize: 12 },
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-background rounded border p-2 text-xs shadow-lg">
                            <p className="font-semibold">
                              Range: {data.range.min.toFixed(2)} -{" "}
                              {data.range.max.toFixed(2)} {yAxisUnit}
                            </p>
                            <p className="text-muted-foreground">
                              Count: {data.count} values
                            </p>
                            <p className="text-muted-foreground">
                              Percentage:{" "}
                              {stats
                                ? ((data.count / stats.count) * 100).toFixed(1)
                                : "0"}
                              %
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="count" name="Frequency">
                    {histogramData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={getBarColor(entry.count)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="text-muted-foreground flex h-[300px] items-center justify-center text-sm">
            {numBins <= 0 || binsInput === ""
              ? "Enter number of bins (5-100) to display histogram"
              : "No data available for selected dataset"}
          </div>
        )}

        {/* Statistics Summary */}
        {stats && (
          <div className="mt-4 grid grid-cols-2 gap-4 border-t pt-4 text-xs md:grid-cols-5">
            <div>
              <p className="text-muted-foreground">Count</p>
              <p className="font-mono font-semibold">{stats.count}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Mean</p>
              <p className="font-mono font-semibold">
                {stats.mean.toFixed(2)} {yAxisUnit}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Std Dev</p>
              <p className="font-mono font-semibold">
                {stats.std.toFixed(2)} {yAxisUnit}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Min</p>
              <p className="font-mono font-semibold">
                {stats.min.toFixed(2)} {yAxisUnit}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Max</p>
              <p className="font-mono font-semibold">
                {stats.max.toFixed(2)} {yAxisUnit}
              </p>
            </div>
          </div>
        )}

        <div className="text-muted-foreground mt-4 text-xs">
          <p>
            <strong>Interpretation:</strong> This histogram shows the
            distribution of values. Taller bars indicate value ranges that occur
            more frequently in the dataset. A normal distribution appears
            bell-shaped, while skewed distributions lean left or right.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
