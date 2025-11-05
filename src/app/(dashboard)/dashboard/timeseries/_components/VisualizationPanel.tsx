"use client";
import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
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
} from "recharts";
import {
  ChartType,
  AnalysisModel,
  AggregationMethod,
  type DatasetInfo,
  type ProcessingInfo,
  formatValue,
  getDisplayUnit,
  convertUnits,
} from "@/hooks/use-timeseries";
import { DataTable } from "./DataTable";

type NormalizationMode = "all" | "selected";

interface CoordinateSelection {
  lat?: number;
  lon?: number;
}

interface VisualizationPanelProps {
  chartType: ChartType;
  setChartType: (type: ChartType) => void;
  dateRange: { start: string; end: string };
  setDateRange: React.Dispatch<
    React.SetStateAction<{ start: string; end: string }>
  >;
  analysisModel: AnalysisModel;
  setAnalysisModel: (model: AnalysisModel) => void;
  aggregation: AggregationMethod;
  setAggregation: (method: AggregationMethod) => void;
  normalize: boolean;
  setNormalize: (normalize: boolean) => void;
  smoothingWindow: number;
  setSmoothingWindow: (window: number) => void;
  resampleFreq: string | undefined;
  setResampleFreq: (freq: string | undefined) => void;
  focusCoordinates: string;
  setFocusCoordinates: (coords: string) => void;
  chartData: any[];
  selectedDatasets: DatasetInfo[];
  visibleDatasets: Set<string>;
  processingInfo: ProcessingInfo | null;
  statistics: Record<string, any> | null;
  metadata: Record<string, any> | null;
}

export function VisualizationPanel({
  chartType,
  setChartType,
  dateRange,
  setDateRange,
  analysisModel,
  setAnalysisModel,
  aggregation,
  setAggregation,
  normalize,
  setNormalize,
  smoothingWindow,
  setSmoothingWindow,
  resampleFreq,
  setResampleFreq,
  focusCoordinates,
  setFocusCoordinates,
  chartData,
  selectedDatasets,
  visibleDatasets,
  processingInfo,
  statistics,
  metadata,
}: VisualizationPanelProps) {
  const [normalizationMode, setNormalizationMode] =
    useState<NormalizationMode>("all");
  const [selectedCoordinates, setSelectedCoordinates] = useState<
    CoordinateSelection[]
  >([]);
  const [tempLat, setTempLat] = useState("");
  const [tempLon, setTempLon] = useState("");

  const addCoordinate = () => {
    const lat = parseFloat(tempLat);
    const lon = parseFloat(tempLon);

    if (!isNaN(lat) && !isNaN(lon)) {
      setSelectedCoordinates([...selectedCoordinates, { lat, lon }]);
      setTempLat("");
      setTempLon("");
    }
  };

  const removeCoordinate = (index: number) => {
    setSelectedCoordinates(selectedCoordinates.filter((_, i) => i !== index));
  };

  // Calculate Y-axis domain dynamically based on visible datasets
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

    // Add 5% padding to top and bottom
    const padding = (maxY - minY) * 0.05;
    return [minY - padding, maxY + padding];
  }, [chartData, visibleDatasets]);

  // Get display unit for Y-axis label
  const yAxisUnit = useMemo(() => {
    if (!metadata || selectedDatasets.length === 0) return "";
    const firstDataset = selectedDatasets[0];
    const originalUnit = metadata[firstDataset.id]?.units || "";
    return getDisplayUnit(originalUnit);
  }, [metadata, selectedDatasets]);

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

    // Enhanced Y-axis tick formatter
    const formatYAxis = (value: number) => {
      // For very small numbers, use more precision
      if (Math.abs(value) < 0.01) {
        return value.toFixed(4);
      }
      // For moderate numbers
      if (Math.abs(value) < 1) {
        return value.toFixed(3);
      }
      // For large numbers, use k notation
      if (Math.abs(value) >= 1000) {
        return (value / 1000).toFixed(1) + "k";
      }
      return value.toFixed(2);
    };

    // Enhanced tooltip formatter with unit display
    const formatTooltipValue = (value: any, name: string) => {
      if (typeof value !== "number" || isNaN(value) || value === null) {
        return "-";
      }

      // Find the dataset to get the original unit
      const dataset = selectedDatasets.find(
        (d) => d.id === name || d.name === name,
      );
      const originalUnit = dataset ? metadata?.[dataset.id]?.units : "";

      return formatValue(value, yAxisUnit, true);
    };

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
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Visualization Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date Range & Chart Type */}
          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-sm font-medium">Start Date</label>
              <Input
                type="date"
                value={dateRange.start}
                onChange={(e) =>
                  setDateRange((prev) => ({
                    ...prev,
                    start: e.target.value,
                  }))
                }
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-sm font-medium">End Date</label>
              <Input
                type="date"
                value={dateRange.end}
                onChange={(e) =>
                  setDateRange((prev) => ({
                    ...prev,
                    end: e.target.value,
                  }))
                }
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-sm font-medium">Chart Type</label>
              <Select
                value={chartType}
                onValueChange={(v) => setChartType(v as ChartType)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ChartType).map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Processing Options */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-md font-medium">Processing Options</h4>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Analysis Model</label>
                <Select
                  value={analysisModel}
                  onValueChange={(v) => setAnalysisModel(v as AnalysisModel)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(AnalysisModel).map(([key, value]) => (
                      <SelectItem key={value} value={value}>
                        {key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Aggregation Method
                </label>
                <Select
                  value={aggregation}
                  onValueChange={(v) => setAggregation(v as AggregationMethod)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(AggregationMethod).map(([key, value]) => (
                      <SelectItem key={value} value={value}>
                        {key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Resample Frequency
                </label>
                <Select
                  value={resampleFreq || "none"}
                  onValueChange={(v) =>
                    setResampleFreq(v === "none" ? undefined : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No resampling" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No resampling</SelectItem>
                    <SelectItem value="D">Daily</SelectItem>
                    <SelectItem value="W">Weekly</SelectItem>
                    <SelectItem value="M">Monthly</SelectItem>
                    <SelectItem value="Q">Quarterly</SelectItem>
                    <SelectItem value="Y">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Normalization Options */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Normalization</label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="normalize"
                    checked={normalize}
                    onCheckedChange={(checked) =>
                      setNormalize(checked as boolean)
                    }
                  />
                  <label htmlFor="normalize" className="text-sm">
                    Normalize (0-1)
                  </label>
                </div>
              </div>

              {analysisModel === AnalysisModel.MOVING_AVG && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">
                      Smoothing Window: {smoothingWindow} months
                    </label>
                  </div>
                  <Slider
                    value={[smoothingWindow]}
                    onValueChange={(value) => setSmoothingWindow(value[0])}
                    min={1}
                    max={24}
                    step={1}
                    className="w-full"
                  />
                </div>
              )}
            </div>

            {/* Focus Coordinates */}
            <div className="space-y-2 pt-2">
              <label className="text-sm font-medium">
                Focus Coordinates (Optional)
              </label>
              <Input
                type="text"
                placeholder="e.g., 40.7128,-74.0060 or multiple: 40.7128,-74.0060; 34.0522,-118.2437"
                value={focusCoordinates}
                onChange={(e) => setFocusCoordinates(e.target.value)}
                className="w-full"
              />
              <p className="text-muted-foreground text-xs">
                Enter coordinates as latitude,longitude pairs. Separate multiple
                coordinates with semicolons (;)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Chart */}
      {chartData.length > 0 && (
        <Card className="flex-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Time Series Visualization</CardTitle>
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

                  // Debug logging
                  console.log("Statistics for", datasetId, {
                    originalStats: stats,
                    originalUnit,
                    yAxisUnit,
                  });

                  // Convert statistics to display units
                  const convertedStats = {
                    min: convertUnits(stats.min || 0, originalUnit).value,
                    max: convertUnits(stats.max || 0, originalUnit).value,
                    mean: convertUnits(stats.mean || 0, originalUnit).value,
                    std: convertUnits(stats.std || 0, originalUnit).value,
                    trend: convertUnits(stats.trend || 0, originalUnit).value,
                  };

                  console.log("Converted stats:", convertedStats);

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
