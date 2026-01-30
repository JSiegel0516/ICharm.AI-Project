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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  convertFrequencyScale,
  getFrequencyLabel,
  type FrequencyScale,
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
  const [frequencyScale, setFrequencyScale] =
    useState<FrequencyScale>("cycles-per-year");

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

    // Store all periodogram data
    const datasetPeriodograms: Array<{
      datasetId: string;
      spectralData: ReturnType<typeof computePeriodogram>;
    }> = [];

    let maxFreqIndex = 0;

    visibleDatasetIds.forEach((datasetId) => {
      const { dates, values } = extractTimeSeriesValues(chartData, datasetId);

      if (values.length < 4) return; // Need at least 4 points for meaningful FFT

      // Estimate sampling rate and determine if daily/monthly
      const samplingInfo = estimateSamplingRate(dates);

      // Compute periodogram
      const spectralData = computePeriodogram(values, samplingInfo);

      maxFreqIndex = Math.max(maxFreqIndex, spectralData.k.length);
      datasetPeriodograms.push({ datasetId, spectralData });
    });

    if (datasetPeriodograms.length === 0) return null;

    // Use the first dataset's sampling info for scale conversions
    const referenceSamplingInfo =
      datasetPeriodograms[0].spectralData.samplingInfo;

    // Combine data from all datasets
    const combinedData: any[] = [];

    // Limit to meaningful frequency range (remove very high frequencies and DC component)
    const meaningfulRange = Math.floor(maxFreqIndex / 4);

    for (let i = 1; i < meaningfulRange; i++) {
      // Start from 1 to skip DC component
      const dataPoint: any = { index: i };

      datasetPeriodograms.forEach(({ datasetId, spectralData }) => {
        if (i < spectralData.power.length) {
          // Use linear power (variance units) directly - no dB conversion
          dataPoint[datasetId] = spectralData.power[i];

          // Store base frequency for this index
          if (!dataPoint.baseFrequency) {
            dataPoint.baseFrequency = spectralData.frequencies[i];
          }
        }
      });

      combinedData.push(dataPoint);
    }

    return {
      data: combinedData,
      datasetIds: visibleDatasetIds,
      colors,
      samplingInfo: referenceSamplingInfo,
    };
  }, [chartData, visibleDatasets]);

  // Convert X-axis values based on selected scale
  const transformedData = useMemo(() => {
    if (!periodogramData) return null;

    return periodogramData.data
      .map((point) => {
        const baseFrequencies = [point.baseFrequency];
        const convertedValues = convertFrequencyScale(
          baseFrequencies,
          frequencyScale,
          periodogramData.samplingInfo.isDaily,
          periodogramData.samplingInfo.isMonthly,
        );

        return {
          ...point,
          xValue: convertedValues[0],
        };
      })
      .filter((point) => {
        // Filter out invalid values (Infinity, NaN) for period scale
        return isFinite(point.xValue) && point.xValue > 0;
      });
  }, [periodogramData, frequencyScale]);

  if (!transformedData || transformedData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <CardTitle className="text-sm">Periodogram</CardTitle>
              <CardDescription>
                Power Spectral Density - Frequency domain analysis showing
                dominant frequencies in the time series
              </CardDescription>
            </div>
            <Select
              value={frequencyScale}
              onValueChange={(value) =>
                setFrequencyScale(value as FrequencyScale)
              }
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="k">Frequency Index (k)</SelectItem>
                <SelectItem value="cycles-per-year">Cycles per Year</SelectItem>
                <SelectItem value="cycles-per-month">
                  Cycles per Month
                </SelectItem>
                <SelectItem value="period-months">
                  Period (Months, Log)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
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
    // Format in scientific notation for small values
    if (Math.abs(value) < 0.01) {
      return value.toExponential(2);
    }
    return value.toFixed(3);
  };

  const formatXAxis = (value: number) => {
    if (frequencyScale === "period-months") {
      return value.toFixed(1);
    }
    return value.toFixed(2);
  };

  const xAxisLabel = getFrequencyLabel(frequencyScale);
  const useLogScale = frequencyScale === "period-months";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-sm">Periodogram</CardTitle>
            <CardDescription>
              Power Spectral Density - Frequency domain analysis showing
              dominant frequencies in the time series
            </CardDescription>
          </div>
          <Select
            value={frequencyScale}
            onValueChange={(value) =>
              setFrequencyScale(value as FrequencyScale)
            }
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="k">Frequency Index (k)</SelectItem>
              <SelectItem value="cycles-per-year">Cycles per Year</SelectItem>
              <SelectItem value="cycles-per-month">Cycles per Month</SelectItem>
              <SelectItem value="period-months">
                Period (Months, Log)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={transformedData}
              margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="xValue"
                scale={useLogScale ? "log" : "auto"}
                domain={useLogScale ? ["auto", "auto"] : undefined}
                type="number"
                tickFormatter={formatXAxis}
                ticks={
                  frequencyScale === "cycles-per-year" ? [0, 1, 2] : undefined
                }
                label={{
                  value: xAxisLabel,
                  position: "insideBottom",
                  offset: -5,
                  style: { fontSize: 12 },
                }}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickFormatter={formatPower}
                label={{
                  value: "Power (variance units)",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 12 },
                }}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value: any) => {
                  const num = Number(value);
                  if (Math.abs(num) < 0.01) {
                    return num.toExponential(3);
                  }
                  return num.toFixed(4);
                }}
                labelFormatter={(xValue) => {
                  return `${xAxisLabel}: ${Number(xValue).toFixed(4)}`;
                }}
              />
              <Legend />
              {periodogramData?.datasetIds.map((datasetId, idx) => {
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
        <div className="text-muted-foreground mt-4 space-y-2 text-xs">
          <p>
            <strong>Data Type:</strong>{" "}
            {periodogramData?.samplingInfo.isDaily
              ? "Daily"
              : periodogramData?.samplingInfo.isMonthly
                ? "Monthly"
                : "Custom"}{" "}
            sampling detected
          </p>
          <p>
            <strong>Interpretation:</strong> Peaks in the periodogram indicate
            dominant periodic components in the data. The Y-axis shows power in
            variance units (the contribution of each frequency to the total
            variance). For climate data, look for:
          </p>
          <ul className="ml-2 list-inside list-disc space-y-1">
            <li>Annual cycle: ~1 cycle/year (12 month period)</li>
            <li>Semi-annual: ~2 cycles/year (6 month period)</li>
            <li>Seasonal: ~4 cycles/year (3 month period)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
