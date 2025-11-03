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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
} from "@/hooks/use-timeseries";
import { X } from "lucide-react";

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
      margin: { top: 5, right: 30, left: 20, bottom: 5 },
    };

    // Custom Y-axis tick formatter for better readability
    const formatYAxis = (value: number) => {
      if (Math.abs(value) >= 1000) {
        return (value / 1000).toFixed(1) + "k";
      }
      if (Math.abs(value) < 0.01) {
        return value.toExponential(2);
      }
      return value.toFixed(2);
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
            />
            <RechartsTooltip
              formatter={(value: any) =>
                typeof value === "number" ? value.toFixed(4) : value
              }
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
            />
            <RechartsTooltip
              formatter={(value: any) =>
                typeof value === "number" ? value.toFixed(4) : value
              }
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
            />
            <RechartsTooltip
              formatter={(value: any) =>
                typeof value === "number" ? value.toFixed(4) : value
              }
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
                    fill={colors[idx % colors.length]}
                    fillOpacity={0.6}
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
            />
            <RechartsTooltip
              formatter={(value: any) =>
                typeof value === "number" ? value.toFixed(4) : value
              }
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
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Visualization Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">Visualization Controls</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date Range */}
          <div className="flex items-center gap-4">
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
            <div className="flex items-center gap-2">
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

          {/* Normalization Options */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-md font-medium">Normalization Options</h4>

            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="normalize"
                  checked={normalize}
                  onCheckedChange={(checked) =>
                    setNormalize(checked as boolean)
                  }
                />
                <label htmlFor="normalize" className="text-sm">
                  Normalize values (0-1)
                </label>
              </div>

              {normalize && (
                <div className="space-y-4 pl-6">
                  <RadioGroup
                    value={normalizationMode}
                    onValueChange={(value) =>
                      setNormalizationMode(value as NormalizationMode)
                    }
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="all" id="normalize-all" />
                      <Label htmlFor="normalize-all" className="font-normal">
                        Normalize all data
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="selected"
                        id="normalize-selected"
                      />
                      <Label
                        htmlFor="normalize-selected"
                        className="font-normal"
                      >
                        Normalize specific coordinates only
                      </Label>
                    </div>
                  </RadioGroup>

                  {normalizationMode === "selected" && (
                    <div className="border-muted space-y-3 border-l-2 pl-6">
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <Label htmlFor="temp-lat" className="text-xs">
                            Latitude
                          </Label>
                          <Input
                            id="temp-lat"
                            type="number"
                            step="0.0001"
                            placeholder="e.g., 40.7128"
                            value={tempLat}
                            onChange={(e) => setTempLat(e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <div className="flex-1">
                          <Label htmlFor="temp-lon" className="text-xs">
                            Longitude
                          </Label>
                          <Input
                            id="temp-lon"
                            type="number"
                            step="0.0001"
                            placeholder="e.g., -74.0060"
                            value={tempLon}
                            onChange={(e) => setTempLon(e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <Button
                          onClick={addCoordinate}
                          size="sm"
                          className="h-8"
                        >
                          Add
                        </Button>
                      </div>

                      {selectedCoordinates.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">
                            Selected Coordinates:
                          </Label>
                          <div className="space-y-1">
                            {selectedCoordinates.map((coord, index) => (
                              <div
                                key={index}
                                className="bg-muted/50 flex items-center justify-between rounded px-2 py-1 text-xs"
                              >
                                <span className="font-mono">
                                  {coord.lat?.toFixed(4)},{" "}
                                  {coord.lon?.toFixed(4)}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeCoordinate(index)}
                                  className="h-5 w-5 p-0"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedCoordinates.length === 0 && (
                        <p className="text-muted-foreground text-xs italic">
                          No coordinates selected. Add coordinates above to
                          normalize specific locations.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="text-muted-foreground rounded bg-blue-50 p-2 text-xs dark:bg-blue-950/20">
                    {normalizationMode === "all" ? (
                      <p>
                        All data points will be normalized to a 0-1 scale based
                        on the min/max values across all datasets.
                      </p>
                    ) : (
                      <p>
                        Only data from the selected coordinates will be
                        normalized. Other data points will retain their original
                        values.
                      </p>
                    )}
                  </div>
                </div>
              )}
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
                    {yDomain && (
                      <>
                        {" "}
                        • Y-axis range: {yDomain[0].toFixed(2)} to{" "}
                        {yDomain[1].toFixed(2)}
                      </>
                    )}
                  </CardDescription>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                {renderChart()}
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistics */}
      {statistics && Object.keys(statistics).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Statistical Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(statistics).map(
                ([datasetId, stats]: [string, any]) => (
                  <Card key={datasetId} className="p-3">
                    <h4 className="mb-2 text-sm font-medium">
                      {metadata?.[datasetId]?.name || datasetId}
                    </h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Min:</span>
                        <span className="font-mono">
                          {stats.min.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Max:</span>
                        <span className="font-mono">
                          {stats.max.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Mean:</span>
                        <span className="font-mono">
                          {stats.mean.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Std:</span>
                        <span className="font-mono">
                          {stats.std.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Trend:</span>
                        <span
                          className={`font-mono ${
                            stats.trend >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {stats.trend >= 0 ? "+" : ""}
                          {stats.trend.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  </Card>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
