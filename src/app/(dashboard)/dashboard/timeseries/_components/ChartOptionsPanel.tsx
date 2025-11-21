"use client";
import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ChartType, AggregationMethod } from "@/hooks/use-timeseries";
import { Settings2 } from "lucide-react";

interface ChartOptionsPanelProps {
  // Chart display options
  chartType: ChartType;
  setChartType: (type: ChartType) => void;

  // Client-side transformations
  normalize: boolean;
  setNormalize: (normalize: boolean) => void;
  smoothingWindow: number;
  setSmoothingWindow: (window: number) => void;
  resampleFreq: string | undefined;
  setResampleFreq: (freq: string | undefined) => void;
  aggregation: AggregationMethod;
  setAggregation: (method: AggregationMethod) => void;

  // Chart overlays
  showHistogram: boolean;
  setShowHistogram: (show: boolean) => void;
  showLinearTrend: boolean;
  setShowLinearTrend: (show: boolean) => void;
}

export function ChartOptionsPanel({
  chartType,
  setChartType,
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
}: ChartOptionsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          <CardTitle className="text-sm">Chart Options</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Adjust visualization settings (applied instantly)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Chart Type */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Chart Type</Label>
          <Select
            value={chartType}
            onValueChange={(v) => setChartType(v as ChartType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ChartType.LINE}>Line Chart</SelectItem>
              <SelectItem value={ChartType.BAR}>Bar Chart</SelectItem>
              <SelectItem value={ChartType.AREA}>Area Chart</SelectItem>
              <SelectItem value={ChartType.SCATTER}>Scatter Plot</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Overlays (only for line charts) */}
        {chartType === ChartType.LINE && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Chart Overlays</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-histogram"
                  checked={showHistogram}
                  onCheckedChange={(checked) =>
                    setShowHistogram(checked as boolean)
                  }
                />
                <label
                  htmlFor="show-histogram"
                  className="cursor-pointer text-sm font-normal"
                >
                  Show Histogram Bars
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-trend"
                  checked={showLinearTrend}
                  onCheckedChange={(checked) =>
                    setShowLinearTrend(checked as boolean)
                  }
                />
                <label
                  htmlFor="show-trend"
                  className="cursor-pointer text-sm font-normal"
                >
                  Show Linear Trend
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Data Transformations */}
        <div className="space-y-4 border-t pt-4">
          <Label className="text-sm font-medium">Data Transformations</Label>

          {/* Normalize */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="normalize"
              checked={normalize}
              onCheckedChange={(checked) => setNormalize(checked as boolean)}
            />
            <label
              htmlFor="normalize"
              className="cursor-pointer text-sm font-normal"
            >
              Normalize (0-1 scale)
            </label>
          </div>

          {/* Smoothing Window */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="smoothing" className="text-sm">
                Smoothing Window
              </Label>
              <span className="text-muted-foreground text-xs">
                {smoothingWindow === 1 ? "Off" : `${smoothingWindow} points`}
              </span>
            </div>
            <Slider
              id="smoothing"
              value={[smoothingWindow]}
              onValueChange={(value) => setSmoothingWindow(value[0])}
              min={1}
              max={24}
              step={1}
              className="w-full"
            />
          </div>

          {/* Resample Frequency */}
          <div className="space-y-2">
            <Label className="text-sm">Resample Frequency</Label>
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

          {/* Aggregation Method (for resampling) */}
          {resampleFreq && resampleFreq !== "none" && (
            <div className="space-y-2">
              <Label className="text-sm">Aggregation Method</Label>
              <Select
                value={aggregation}
                onValueChange={(v) => setAggregation(v as AggregationMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AggregationMethod.MEAN}>Mean</SelectItem>
                  <SelectItem value={AggregationMethod.MAX}>Max</SelectItem>
                  <SelectItem value={AggregationMethod.MIN}>Min</SelectItem>
                  <SelectItem value={AggregationMethod.SUM}>Sum</SelectItem>
                  <SelectItem value={AggregationMethod.MEDIAN}>
                    Median
                  </SelectItem>
                  <SelectItem value={AggregationMethod.STD}>Std Dev</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
