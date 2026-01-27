"use client";
import React, { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  computePeriodogram,
  extractTimeSeriesValues,
  estimateSamplingRate,
} from "@/lib/spectral-analysis";
import type { DatasetInfo } from "@/hooks/use-timeseries";

interface PeriodogramPanelProps {
  chartData: any[];
  selectedDatasets: DatasetInfo[];
  visibleDatasets: Set<string>;
  metadata: Record<string, any> | null;
}

export function PeriodogramPanel({
  chartData,
  selectedDatasets,
  visibleDatasets,
  metadata,
}: PeriodogramPanelProps) {
  // Compute periodograms for all visible datasets
  const periodogramData = useMemo(() => {
    if (chartData.length === 0) return null;

    const visibleDatasetIds = Array.from(visibleDatasets);
    const colors = [
      "#8884d8",
      "#82ca9d",
      "#ffc658",
      "#ff7c7c",
      "#8dd1e1",
      "#d084d0",
    ];

    // Combine data from all datasets
    const combinedData: any[] = [];
    let maxFreqIndex = 0;

    visibleDatasetIds.forEach((datasetId, idx) => {
      const { dates, values } = extractTimeSeriesValues(chartData, datasetId);

      if (values.length < 4) return; // Need at least 4 points for meaningful FFT

      // Estimate sampling rate from dates
      const samplingRate = estimateSamplingRate(dates);

      // Compute periodogram
      const periodogram = computePeriodogram(values, samplingRate);

      maxFreqIndex = Math.max(maxFreqIndex, periodogram.frequencies.length);

      // Add to combined data with index-based X-axis
      periodogram.frequencies.forEach((freq, i) => {
        if (!combinedData[i]) {
          combinedData[i] = {
            index: i, // Index for X-axis (0, 1, 2, 3...)
            frequency: freq, // Actual frequency for tooltip
          };
        }
        // Convert power to dB scale
        const powerDB =
          periodogram.power[i] > 0
            ? 10 * Math.log10(periodogram.power[i])
            : -100; // Floor for zero/negative values
        combinedData[i][datasetId] = powerDB;
      });
    });

    // Limit to meaningful frequency range (remove very high frequencies)
    const meaningfulData = combinedData.slice(0, Math.floor(maxFreqIndex / 4));

    return {
      data: meaningfulData,
      datasetIds: visibleDatasetIds,
      colors,
    };
  }, [chartData, visibleDatasets]);

  if (!periodogramData || periodogramData.data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Periodogram</CardTitle>
          <CardDescription>
            Frequency domain analysis (Power Spectral Density)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex h-[300px] items-center justify-center text-sm">
            Not enough data points for frequency analysis
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatPower = (value: number) => {
    return value.toFixed(1);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Periodogram</CardTitle>
        <CardDescription>
          Power Spectral Density - Frequency domain analysis showing dominant
          frequencies in the time series
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={periodogramData.data}
              margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="index"
                label={{
                  value: "Frequency Index",
                  position: "insideBottom",
                  offset: -5,
                  style: { fontSize: 12 },
                }}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickFormatter={formatPower}
                label={{
                  value: "Power (dB)",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 12 },
                }}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value: any) => `${value.toFixed(2)} dB`}
                labelFormatter={(index) => {
                  // Access frequency from the data array
                  const freq = periodogramData.data[index]?.frequency;
                  return `Index: ${index}${freq ? ` (${freq.toFixed(4)} cycles/day)` : ""}`;
                }}
              />
              <Legend />
              {periodogramData.datasetIds.map((datasetId, idx) => {
                const dataset = selectedDatasets.find(
                  (d) => d.id === datasetId,
                );
                return (
                  <Line
                    key={datasetId}
                    type="monotone"
                    dataKey={datasetId}
                    name={
                      (dataset as any)?.datasetName ||
                      dataset?.name ||
                      datasetId
                    }
                    stroke={
                      periodogramData.colors[
                        idx % periodogramData.colors.length
                      ]
                    }
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="text-muted-foreground mt-4 text-xs">
          <p>
            <strong>Interpretation:</strong> Peaks in the periodogram indicate
            dominant periodic components in the data. Higher peaks represent
            stronger periodic signals at those frequencies. The power is shown
            in decibels (dB) for better visualization of the dynamic range.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
