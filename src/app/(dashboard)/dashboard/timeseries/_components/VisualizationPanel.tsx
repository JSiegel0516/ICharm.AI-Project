'use client';
import React from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
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
  ReferenceLine,
  Brush,
} from 'recharts';
import {
  ChartType,
  AnalysisModel,
  AggregationMethod,
  type DatasetInfo,
  type ProcessingInfo,
} from '@/hooks/use-timeseries';

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
  chartData,
  selectedDatasets,
  visibleDatasets,
  processingInfo,
  statistics,
  metadata,
}: VisualizationPanelProps) {
  const renderChart = () => {
    const visibleLines = selectedDatasets.filter((d) =>
      visibleDatasets.has(d.id)
    );

    const colors = [
      '#8884d8',
      '#82ca9d',
      '#ffc658',
      '#ff7c7c',
      '#8dd1e1',
      '#d084d0',
      '#ffb347',
      '#67b7dc',
      '#a4de6c',
      '#ffd93d',
    ];

    const visibleDatasetIds = Array.from(visibleDatasets);

    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 30, left: 20, bottom: 5 },
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
            <YAxis tick={{ fontSize: 12 }} />
            <RechartsTooltip />
            <Legend />
            <Brush dataKey="date" height={30} stroke="#8884d8" />
            {selectedDatasets.map(
              (dataset, idx) =>
                visibleDatasetIds.includes(dataset.id) && (
                  <Line
                    key={dataset.id}
                    type="monotone"
                    dataKey={dataset.id}
                    name={dataset.name}
                    stroke={colors[idx % colors.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                )
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
            <YAxis tick={{ fontSize: 12 }} />
            <RechartsTooltip />
            <Legend />
            {selectedDatasets.map(
              (dataset, idx) =>
                visibleDatasetIds.includes(dataset.id) && (
                  <Bar
                    key={dataset.id}
                    dataKey={dataset.id}
                    name={dataset.name}
                    fill={colors[idx % colors.length]}
                  />
                )
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
            <YAxis tick={{ fontSize: 12 }} />
            <RechartsTooltip />
            <Legend />
            <Brush dataKey="date" height={30} stroke="#8884d8" />
            {selectedDatasets.map(
              (dataset, idx) =>
                visibleDatasetIds.includes(dataset.id) && (
                  <Area
                    key={dataset.id}
                    type="monotone"
                    dataKey={dataset.id}
                    name={dataset.name}
                    stroke={colors[idx % colors.length]}
                    fill={colors[idx % colors.length]}
                    fillOpacity={0.6}
                  />
                )
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
            <YAxis tick={{ fontSize: 12 }} />
            <RechartsTooltip />
            <Legend />
            {selectedDatasets.map(
              (dataset, idx) =>
                visibleDatasetIds.includes(dataset.id) && (
                  <Scatter
                    key={dataset.id}
                    dataKey={dataset.id}
                    name={dataset.name}
                    fill={colors[idx % colors.length]}
                  />
                )
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

            <div className="flex flex-row justify-between">
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

              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Resample Frequency
                </label>
                <Select
                  value={resampleFreq || 'none'}
                  onValueChange={(v) =>
                    setResampleFreq(v === 'none' ? undefined : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No resampling" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No resampling</SelectItem>
                    {['D', 'W', 'M', 'Q', 'Y'].map((freq) => (
                      <SelectItem key={freq} value={freq}>
                        {freq}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Chart */}
      {chartData.length > 0 && (
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Time Series Visualization</CardTitle>
            {processingInfo && (
              <CardDescription>
                {processingInfo.totalPoints} data points •{' '}
                {processingInfo.datasetsProcessed} datasets • Processed in{' '}
                {processingInfo.processingTime}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="h-[400px]">
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
                            stats.trend >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {stats.trend >= 0 ? '+' : ''}
                          {stats.trend.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  </Card>
                )
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
