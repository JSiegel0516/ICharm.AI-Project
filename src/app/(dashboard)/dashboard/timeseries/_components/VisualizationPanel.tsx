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
  BarChart,
  Bar,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import {
  ChartType,
  AggregationMethod,
  type DatasetInfo,
  type ProcessingInfo,
  formatValue,
  getDisplayUnit,
  convertUnits,
} from "@/hooks/use-timeseries";
import { applyTransformations } from "@/lib/client-transformations";
import { ChartOptionsPanel } from "./ChartOptionsPanel";
import { HistogramPanel } from "./HistogramPanel";
import { PeriodogramPanel } from "./PeriodogramPanel";
import { SpectrogramPanel } from "./SpectrogramPanel";
import { DataTable } from "./DataTable";

interface VisualizationPanelProps {
  // Chart type & date range
  chartType: ChartType;
  setChartType: (type: ChartType) => void;
  dateRange: { start: string; end: string };
  analysisModel: string;

  // Data
  chartData: any[];
  selectedDatasets: DatasetInfo[];
  visibleDatasets: Set<string>;
  processingInfo: ProcessingInfo | null;
  statistics: Record<string, any> | null;
  metadata: Record<string, any> | null;

  // Client-side transformation options
  normalize: boolean;
  setNormalize: (normalize: boolean) => void;
  smoothingWindow: number;
  setSmoothingWindow: (window: number) => void;
  resampleFreq: string | undefined;
  setResampleFreq: (freq: string | undefined) => void;
  aggregation: AggregationMethod;
  setAggregation: (method: AggregationMethod) => void;

  // Overlays
  showHistogram: boolean;
  setShowHistogram: (show: boolean) => void;
  showLinearTrend: boolean;
  setShowLinearTrend: (show: boolean) => void;
}

export function VisualizationPanel({
  chartType,
  setChartType,
  dateRange,
  analysisModel,
  chartData: rawChartData,
  selectedDatasets,
  visibleDatasets,
  processingInfo,
  statistics,
  metadata,
  normalize,
  setNormalize,
  smoothingWindow,
  setSmoothingWindow,
  resampleFreq,
  setResampleFreq,
  aggregation,
  setAggregation,
  showHistogram,
  setShowHistogram,
  showLinearTrend,
  setShowLinearTrend,
}: VisualizationPanelProps) {
  // Apply client-side transformations
  const chartData = useMemo(() => {
    if (rawChartData.length === 0) return rawChartData;

    const datasetIds = selectedDatasets.map((d) => d.id);

    return applyTransformations(rawChartData, datasetIds, {
      normalize,
      smoothingWindow: smoothingWindow > 1 ? smoothingWindow : undefined,
      resampleFreq,
      aggregation,
    });
  }, [
    rawChartData,
    selectedDatasets,
    normalize,
    smoothingWindow,
    resampleFreq,
    aggregation,
  ]);

  // Calculate linear trend line data for each visible dataset
  const chartDataWithTrends = useMemo(() => {
    if (!showLinearTrend || chartData.length === 0)
      return { data: chartData, equations: {} };

    const visibleDatasetIds = Array.from(visibleDatasets);
    const dataWithTrends = chartData.map((point) => ({ ...point }));
    const equations: Record<
      string,
      { slope: number; intercept: number; r2: number }
    > = {};

    visibleDatasetIds.forEach((datasetId) => {
      const points: { x: number; y: number }[] = [];
      chartData.forEach((point, index) => {
        const value = point[datasetId];
        if (typeof value === "number" && !isNaN(value) && value !== null) {
          points.push({ x: index, y: value });
        }
      });

      if (points.length < 2) return;

      const n = points.length;
      const sumX = points.reduce((sum, p) => sum + p.x, 0);
      const sumY = points.reduce((sum, p) => sum + p.y, 0);
      const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
      const sumX2 = points.reduce((sum, p) => sum + p.x * p.x, 0);
      const sumY2 = points.reduce((sum, p) => sum + p.y * p.y, 0);

      const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const b = (sumY - m * sumX) / n;

      // Calculate R² (coefficient of determination)
      const meanY = sumY / n;
      const ssTotal = points.reduce(
        (sum, p) => sum + Math.pow(p.y - meanY, 2),
        0,
      );
      const ssResidual = points.reduce((sum, p) => {
        const predicted = m * p.x + b;
        return sum + Math.pow(p.y - predicted, 2);
      }, 0);
      const r2 = 1 - ssResidual / ssTotal;

      // Store equation
      equations[datasetId] = { slope: m, intercept: b, r2 };

      // Add trend values to the main data
      dataWithTrends.forEach((point, index) => {
        point[`${datasetId}_trend`] = m * index + b;
      });
    });

    return { data: dataWithTrends, equations };
  }, [chartData, visibleDatasets, showLinearTrend]);

  // Calculate Y-axis domain
  const yDomain = useMemo(() => {
    const dataToUse = showLinearTrend ? chartDataWithTrends.data : chartData;
    if (dataToUse.length === 0) return undefined;

    const visibleDatasetIds = Array.from(visibleDatasets);
    let minY = Infinity;
    let maxY = -Infinity;

    dataToUse.forEach((point) => {
      visibleDatasetIds.forEach((datasetId) => {
        const value = point[datasetId];
        if (typeof value === "number" && !isNaN(value) && value !== null) {
          minY = Math.min(minY, value);
          maxY = Math.max(maxY, value);
        }
      });
    });

    if (minY === Infinity || maxY === -Infinity) {
      return undefined;
    }

    const padding = (maxY - minY) * 0.05;
    return [minY - padding, maxY + padding];
  }, [chartData, chartDataWithTrends, visibleDatasets, showLinearTrend]);

  // Get display unit for Y-axis
  const yAxisUnit = useMemo(() => {
    if (normalize) return "normalized";
    if (!metadata || selectedDatasets.length === 0) return "";
    const firstDataset = selectedDatasets[0];
    const originalUnit = metadata[firstDataset.id]?.units || "";
    return getDisplayUnit(originalUnit);
  }, [metadata, selectedDatasets, normalize]);

  // Generate chart title
  const chartTitle = useMemo(() => {
    if (selectedDatasets.length === 0 || !metadata) {
      return "Time Series Visualization";
    }

    const datasetNames = selectedDatasets
      .map((dataset) => {
        const meta = metadata[dataset.id];
        const varName = meta?.variable || dataset.name;
        const source = meta?.source || "Unknown Source";
        return `${varName} (${source})`;
      })
      .join(" vs. ");

    const startDate = dateRange.start || "Start";
    const endDate = dateRange.end || "End";
    const temporalRange = `${startDate} to ${endDate}`;

    return `${datasetNames}: ${temporalRange}`;
  }, [selectedDatasets, metadata, dateRange]);

  const renderChart = () => {
    const colors = [
      "#8884d8",
      "#82ca9d",
      "#ffc658",
      "#ff7c7c",
      "#8dd1e1",
      "#d084d0",
      "#ffb347",
      "#67b7dc",
      "#a4de6c",
      "#ffd93d",
    ];

    const visibleDatasetIds = Array.from(visibleDatasets);
    const dataToRender = showLinearTrend ? chartDataWithTrends.data : chartData;
    const trendEquations = showLinearTrend ? chartDataWithTrends.equations : {};
    const commonProps = {
      data: dataToRender,
      margin: { top: 5, right: 30, left: 60, bottom: 5 },
    };

    const formatYAxis = (value: number) => {
      if (normalize) return value.toFixed(2);
      if (Math.abs(value) < 0.01) return value.toFixed(4);
      if (Math.abs(value) < 1) return value.toFixed(3);
      if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
      return value.toFixed(2);
    };

    const formatTooltipValue = (value: any, name: string, props: any) => {
      if (typeof value !== "number" || isNaN(value) || value === null) {
        return "-";
      }

      // Check if this is a trend line
      if (name.includes("(Trend)")) {
        // Extract the original dataset name
        const datasetName = name.replace(" (Trend)", "");
        const dataset = selectedDatasets.find(
          (d) => ((d as any).datasetName || d.name) === datasetName,
        );
        if (dataset && metadata?.[dataset.id]) {
          const originalUnit = metadata[dataset.id].units || "";
          const displayUnit = normalize
            ? "normalized"
            : getDisplayUnit(originalUnit);
          return normalize
            ? value.toFixed(4)
            : formatValue(value, displayUnit, true);
        }
      }

      // Find the dataset for this series
      const dataset = selectedDatasets.find(
        (d) => ((d as any).datasetName || d.name) === name || d.id === name,
      );

      if (dataset && metadata?.[dataset.id]) {
        const originalUnit = metadata[dataset.id].units || "";
        const displayUnit = normalize
          ? "normalized"
          : getDisplayUnit(originalUnit);
        return normalize
          ? value.toFixed(4)
          : formatValue(value, displayUnit, true);
      }

      // Fallback
      if (normalize) return value.toFixed(4);
      return formatValue(value, yAxisUnit, true);
    };

    if (chartType === ChartType.LINE && showLinearTrend) {
      return (
        <ComposedChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            domain={yDomain}
            tickFormatter={formatYAxis}
            width={80}
            label={{
              value: yAxisUnit,
              angle: -90,
              position: "insideLeft",
              style: { textAnchor: "middle", fontSize: 12 },
            }}
          />
          <RechartsTooltip
            formatter={formatTooltipValue}
            labelStyle={{ fontWeight: "bold" }}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend />

          {selectedDatasets.map(
            (dataset, idx) =>
              visibleDatasetIds.includes(dataset.id) && (
                <Line
                  key={`line-${dataset.id}`}
                  type="monotone"
                  dataKey={dataset.id}
                  name={(dataset as any).datasetName || dataset.name}
                  stroke={colors[idx % colors.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ),
          )}

          {showLinearTrend &&
            selectedDatasets.map(
              (dataset, idx) =>
                visibleDatasetIds.includes(dataset.id) &&
                trendEquations[dataset.id] && (
                  <Line
                    key={`trend-${dataset.id}`}
                    type="monotone"
                    dataKey={`${dataset.id}_trend`}
                    name={`${(dataset as any).datasetName || dataset.name} (Trend: y=${trendEquations[dataset.id].slope >= 0 ? "" : "-"}${Math.abs(trendEquations[dataset.id].slope).toFixed(4)}x${trendEquations[dataset.id].intercept >= 0 ? "+" : ""}${trendEquations[dataset.id].intercept.toFixed(2)}, R²=${trendEquations[dataset.id].r2.toFixed(3)})`}
                    stroke={colors[idx % colors.length]}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    connectNulls
                  />
                ),
            )}
        </ComposedChart>
      );
    }

    switch (chartType) {
      case ChartType.LINE:
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              domain={yDomain}
              tickFormatter={formatYAxis}
              width={80}
              label={{
                value: yAxisUnit,
                angle: -90,
                position: "insideLeft",
                style: { textAnchor: "middle", fontSize: 12 },
              }}
            />
            <RechartsTooltip
              formatter={formatTooltipValue}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend />
            {selectedDatasets.map(
              (dataset, idx) =>
                visibleDatasetIds.includes(dataset.id) && (
                  <Line
                    key={dataset.id}
                    type="monotone"
                    dataKey={dataset.id}
                    name={(dataset as any).datasetName || dataset.name}
                    stroke={colors[idx % colors.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ),
            )}
          </LineChart>
        );

      case ChartType.BAR:
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              domain={yDomain}
              tickFormatter={formatYAxis}
              width={80}
              label={{
                value: yAxisUnit,
                angle: -90,
                position: "insideLeft",
                style: { textAnchor: "middle", fontSize: 12 },
              }}
            />
            <RechartsTooltip
              formatter={formatTooltipValue}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend />
            {selectedDatasets.map(
              (dataset, idx) =>
                visibleDatasetIds.includes(dataset.id) && (
                  <Bar
                    key={dataset.id}
                    dataKey={dataset.id}
                    name={(dataset as any).datasetName || dataset.name}
                    fill={colors[idx % colors.length]}
                  />
                ),
            )}
          </BarChart>
        );

      case ChartType.AREA:
        return (
          <AreaChart {...commonProps}>
            <defs>
              {selectedDatasets.map((dataset, idx) => (
                <linearGradient
                  key={`gradient-${dataset.id}`}
                  id={`gradient-${dataset.id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={colors[idx % colors.length]}
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor={colors[idx % colors.length]}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              domain={yDomain}
              tickFormatter={formatYAxis}
              width={80}
              label={{
                value: yAxisUnit,
                angle: -90,
                position: "insideLeft",
                style: { textAnchor: "middle", fontSize: 12 },
              }}
            />
            <RechartsTooltip
              formatter={formatTooltipValue}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend />
            {selectedDatasets.map(
              (dataset, idx) =>
                visibleDatasetIds.includes(dataset.id) && (
                  <Area
                    key={dataset.id}
                    type="monotone"
                    dataKey={dataset.id}
                    name={(dataset as any).datasetName || dataset.name}
                    stroke={colors[idx % colors.length]}
                    fillOpacity={1}
                    fill={`url(#gradient-${dataset.id})`}
                  />
                ),
            )}
          </AreaChart>
        );

      case ChartType.SCATTER:
        return (
          <ScatterChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              domain={yDomain}
              tickFormatter={formatYAxis}
              width={80}
              label={{
                value: yAxisUnit,
                angle: -90,
                position: "insideLeft",
                style: { textAnchor: "middle", fontSize: 12 },
              }}
            />
            <RechartsTooltip
              formatter={formatTooltipValue}
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend />
            {selectedDatasets.map(
              (dataset, idx) =>
                visibleDatasetIds.includes(dataset.id) && (
                  <Scatter
                    key={dataset.id}
                    dataKey={dataset.id}
                    name={(dataset as any).datasetName || dataset.name}
                    fill={colors[idx % colors.length]}
                  />
                ),
            )}
          </ScatterChart>
        );

      default:
        return <div>Chart type not supported</div>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Chart Options Panel - Appears above the chart */}
      <ChartOptionsPanel
        chartType={chartType}
        setChartType={setChartType}
        normalize={normalize}
        setNormalize={setNormalize}
        smoothingWindow={smoothingWindow}
        setSmoothingWindow={setSmoothingWindow}
        resampleFreq={resampleFreq}
        setResampleFreq={setResampleFreq}
        aggregation={aggregation}
        setAggregation={setAggregation}
        showHistogram={showHistogram}
        setShowHistogram={setShowHistogram}
        showLinearTrend={showLinearTrend}
        setShowLinearTrend={setShowLinearTrend}
      />

      {/* Histogram - Distribution Analysis */}
      {chartData.length > 0 && showHistogram && (
        <HistogramPanel
          chartData={chartData}
          selectedDatasets={selectedDatasets}
          visibleDatasets={visibleDatasets}
          metadata={metadata}
          yAxisUnit={yAxisUnit}
        />
      )}

      {/* Main Chart */}
      <Card className="flex-1">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base leading-relaxed">
              {chartTitle}
            </CardTitle>
            {processingInfo && (
              <CardDescription>
                {processingInfo.totalPoints} data points •{" "}
                {processingInfo.datasetsProcessed} datasets • Processed in{" "}
                {processingInfo.processingTime}
                {yDomain && yAxisUnit && !normalize && (
                  <>
                    {" "}
                    • Y-axis range: {yDomain[0].toFixed(2)} to{" "}
                    {yDomain[1].toFixed(2)} {yAxisUnit}
                  </>
                )}
              </CardDescription>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[500px]" data-chart-container>
            <ResponsiveContainer width="100%" height="100%">
              {renderChart()}
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      {chartData.length > 0 && (
        <DataTable
          data={chartData}
          selectedDatasets={selectedDatasets}
          metadata={metadata}
          yAxisUnit={yAxisUnit}
        />
      )}

      {/* Periodogram - Frequency Domain Analysis */}
      {chartData.length > 0 && (
        <PeriodogramPanel
          chartData={chartData}
          selectedDatasets={selectedDatasets}
          visibleDatasets={visibleDatasets}
          metadata={metadata}
        />
      )}

      {/* Spectrogram - Time-Frequency Analysis */}
      {chartData.length > 0 && (
        <SpectrogramPanel
          chartData={chartData}
          selectedDatasets={selectedDatasets}
          visibleDatasets={visibleDatasets}
          metadata={metadata}
        />
      )}

      {/* Statistics */}
      {statistics && Object.keys(statistics).length > 0 && !normalize && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Statistical Summary</CardTitle>
            <CardDescription>
              Statistics shown in {yAxisUnit || "original units"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(statistics).map(
                ([datasetId, stats]: [string, any]) => {
                  const originalUnit = metadata?.[datasetId]?.units || "";
                  const convertedStats = {
                    min: convertUnits(stats.min || 0, originalUnit).value,
                    max: convertUnits(stats.max || 0, originalUnit).value,
                    mean: convertUnits(stats.mean || 0, originalUnit).value,
                    std: convertUnits(stats.std || 0, originalUnit).value,
                    trend: convertUnits(stats.trend || 0, originalUnit).value,
                  };

                  return (
                    <Card key={datasetId} className="p-3">
                      <h4 className="mb-2 text-sm font-medium">
                        {metadata?.[datasetId]?.name || datasetId}
                      </h4>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Min:</span>
                          <span className="font-mono">
                            {formatValue(convertedStats.min, yAxisUnit)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Max:</span>
                          <span className="font-mono">
                            {formatValue(convertedStats.max, yAxisUnit)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Mean:</span>
                          <span className="font-mono">
                            {formatValue(convertedStats.mean, yAxisUnit)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Std:</span>
                          <span className="font-mono">
                            {formatValue(convertedStats.std, yAxisUnit)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Trend:</span>
                          <span
                            className={`font-mono ${
                              convertedStats.trend >= 0
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {convertedStats.trend >= 0 ? "+" : ""}
                            {formatValue(convertedStats.trend, yAxisUnit)}
                          </span>
                        </div>
                      </div>
                    </Card>
                  );
                },
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
