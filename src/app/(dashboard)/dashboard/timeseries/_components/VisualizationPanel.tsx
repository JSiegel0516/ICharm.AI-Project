"use client";
import React, { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  AnalysisModel,
  type DatasetInfo,
  type ProcessingInfo,
  formatValue,
  getDisplayUnit,
  convertUnits,
} from "@/hooks/use-timeseries";
import { DataTable } from "./DataTable";

interface VisualizationPanelProps {
  chartType: ChartType;
  dateRange: { start: string; end: string };
  analysisModel: AnalysisModel;
  chartData: any[];
  selectedDatasets: DatasetInfo[];
  visibleDatasets: Set<string>;
  processingInfo: ProcessingInfo | null;
  statistics: Record<string, any> | null;
  metadata: Record<string, any> | null;
  showHistogram: boolean;
  showLinearTrend: boolean;
}

export function VisualizationPanel({
  chartType,
  dateRange,
  analysisModel,
  chartData,
  selectedDatasets,
  visibleDatasets,
  processingInfo,
  statistics,
  metadata,
  showHistogram,
  showLinearTrend,
}: VisualizationPanelProps) {
  // Calculate linear trend line data for each visible dataset
  const trendLineData = useMemo(() => {
    if (!showLinearTrend || chartData.length === 0) return {};

    const trends: Record<string, any[]> = {};
    const visibleDatasetIds = Array.from(visibleDatasets);

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

      const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const b = (sumY - m * sumX) / n;

      const trendPoints = chartData.map((point, index) => ({
        date: point.date,
        [`${datasetId}_trend`]: m * index + b,
      }));

      trends[datasetId] = trendPoints;
    });

    return trends;
  }, [chartData, visibleDatasets, showLinearTrend]);

  // Calculate Y-axis domain
  const yDomain = useMemo(() => {
    if (chartData.length === 0) return undefined;

    const visibleDatasetIds = Array.from(visibleDatasets);
    let minY = Infinity;
    let maxY = -Infinity;

    chartData.forEach((point) => {
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
  }, [chartData, visibleDatasets]);

  // Get display unit for Y-axis
  const yAxisUnit = useMemo(() => {
    if (!metadata || selectedDatasets.length === 0) return "";
    const firstDataset = selectedDatasets[0];
    const originalUnit = metadata[firstDataset.id]?.units || "";
    return getDisplayUnit(originalUnit);
  }, [metadata, selectedDatasets]);

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
    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 30, left: 60, bottom: 5 },
    };

    const formatYAxis = (value: number) => {
      if (Math.abs(value) < 0.01) return value.toFixed(4);
      if (Math.abs(value) < 1) return value.toFixed(3);
      if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
      return value.toFixed(2);
    };

    const formatTooltipValue = (value: any, name: string) => {
      if (typeof value !== "number" || isNaN(value) || value === null) {
        return "-";
      }
      return formatValue(value, yAxisUnit, true);
    };

    if (chartType === ChartType.LINE && (showHistogram || showLinearTrend)) {
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

          {showHistogram &&
            selectedDatasets.map(
              (dataset, idx) =>
                visibleDatasetIds.includes(dataset.id) && (
                  <Bar
                    key={`bar-${dataset.id}`}
                    dataKey={dataset.id}
                    name={`${(dataset as any).datasetName || dataset.name} (Histogram)`}
                    fill={colors[idx % colors.length]}
                    fillOpacity={0.3}
                  />
                ),
            )}

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
                  connectNulls={false}
                />
              ),
          )}

          {showLinearTrend &&
            selectedDatasets.map(
              (dataset, idx) =>
                visibleDatasetIds.includes(dataset.id) &&
                trendLineData[dataset.id] && (
                  <Line
                    key={`trend-${dataset.id}`}
                    type="monotone"
                    data={trendLineData[dataset.id]}
                    dataKey={`${dataset.id}_trend`}
                    name={`${(dataset as any).datasetName || dataset.name} (Trend)`}
                    stroke={colors[idx % colors.length]}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    connectNulls={true}
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
              labelStyle={{ fontWeight: "bold" }}
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
                    connectNulls={false}
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
      {/* Main Chart */}
      {chartData.length > 0 && (
        <Card className="flex-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base leading-relaxed">
                  {chartTitle}
                </CardTitle>
                {processingInfo && (
                  <CardDescription>
                    {processingInfo.totalPoints} data points •{" "}
                    {processingInfo.datasetsProcessed} datasets • Processed in{" "}
                    {processingInfo.processingTime}
                    {yDomain && yAxisUnit && (
                      <>
                        {" "}
                        • Y-axis range: {yDomain[0].toFixed(2)} to{" "}
                        {yDomain[1].toFixed(2)} {yAxisUnit}
                      </>
                    )}
                  </CardDescription>
                )}
              </div>
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
      )}

      {/* Data Table */}
      {chartData.length > 0 && (
        <DataTable
          data={chartData}
          selectedDatasets={selectedDatasets}
          metadata={metadata}
          yAxisUnit={yAxisUnit}
        />
      )}

      {/* Statistics */}
      {statistics && Object.keys(statistics).length > 0 && (
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
