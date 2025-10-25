// app/timeseries/page.tsx
'use client';
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Download,
  Plus,
  Trash2,
  BarChart3,
  Eye,
  EyeOff,
  Activity,
  TrendingUp,
  Zap,
  Globe,
  Loader2,
  AlertCircle,
  CheckCircle,
  Filter,
  Sliders,
  Database,
  Cloud,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// Import the new API hook
import {
  useTimeSeriesAPI,
  AnalysisModel,
  ChartType,
  AggregationMethod,
  formatDateForAPI,
  downloadBlob,
  generateFilename,
  type DatasetInfo,
  type SpatialBounds,
} from '@/hooks/use-timeseries';
// Import Recharts components
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

// ============================================================================
// HELPER: Debounce function
// ============================================================================
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// ============================================================================
// ENHANCED TIME SERIES PAGE COMPONENT
// ============================================================================
export default function EnhancedTimeSeriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Use the new API hook
  const {
    data,
    metadata,
    statistics,
    chartConfig,
    processingInfo,
    availableDatasets,
    isLoading,
    error,
    progress,
    extractTimeSeries,
    listDatasets,
    exportData,
    cancelRequest,
    clearCache,
    reset,
  } = useTimeSeriesAPI();

  // Local state
  const [selectedDatasets, setSelectedDatasets] = useState<DatasetInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [visibleDatasets, setVisibleDatasets] = useState<Set<string>>(
    new Set()
  );
  const [dateRange, setDateRange] = useState({
    start: '2020-01-01',
    end: '2023-12-31',
  });
  const [chartType, setChartType] = useState<ChartType>(ChartType.LINE);
  const [analysisModel, setAnalysisModel] = useState<AnalysisModel>(
    AnalysisModel.RAW
  );
  const [aggregation, setAggregation] = useState<AggregationMethod>(
    AggregationMethod.MEAN
  );
  const [normalize, setNormalize] = useState(false);
  const [smoothingWindow, setSmoothingWindow] = useState(12);
  const [resampleFreq, setResampleFreq] = useState<string | undefined>(
    undefined
  );
  const [showSpatialFilter, setShowSpatialFilter] = useState(false);
  const [spatialBounds, setSpatialBounds] = useState<SpatialBounds>({
    lat_min: -90,
    lat_max: 90,
    lon_min: -180,
    lon_max: 180,
  });
  const [dataSourceFilter, setDataSourceFilter] = useState<
    'all' | 'local' | 'cloud'
  >('all');

  // Track if we've initialized from URL params
  const initializedFromUrl = useRef(false);

  // Load available datasets on mount
  useEffect(() => {
    listDatasets({ stored: dataSourceFilter });
  }, [listDatasets, dataSourceFilter]);

  // Initialize from URL parameters (only once)
  useEffect(() => {
    if (initializedFromUrl.current || availableDatasets.length === 0) return;

    const datasetIds = searchParams.get('datasets')?.split(',') || [];
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');
    const chart = searchParams.get('chart') as ChartType;
    const model = searchParams.get('model') as AnalysisModel;

    if (startDate) setDateRange((prev) => ({ ...prev, start: startDate }));
    if (endDate) setDateRange((prev) => ({ ...prev, end: endDate }));
    if (chart) setChartType(chart);
    if (model) setAnalysisModel(model);

    // Select datasets based on IDs from URL
    if (datasetIds.length > 0) {
      const selected = availableDatasets.filter((d) =>
        datasetIds.includes(d.id)
      );
      setSelectedDatasets(selected);
      setVisibleDatasets(new Set(selected.map((d) => d.id)));
    }

    initializedFromUrl.current = true;
  }, [searchParams, availableDatasets]);

  // Create stable serialized values for URL update dependencies
  const selectedDatasetIds = useMemo(
    () => selectedDatasets.map((d) => d.id).join(','),
    [selectedDatasets]
  );

  // Debounce the URL update values
  const debouncedDatasetIds = useDebounce(selectedDatasetIds, 500);
  const debouncedStartDate = useDebounce(dateRange.start, 500);
  const debouncedEndDate = useDebounce(dateRange.end, 500);
  const debouncedChartType = useDebounce(chartType, 500);
  const debouncedAnalysisModel = useDebounce(analysisModel, 500);

  // Update URL with debounced values (only after initial load)
  useEffect(() => {
    if (!initializedFromUrl.current) return;

    const params = new URLSearchParams();
    if (debouncedDatasetIds) {
      params.set('datasets', debouncedDatasetIds);
    }
    params.set('start', debouncedStartDate);
    params.set('end', debouncedEndDate);
    params.set('chart', debouncedChartType);
    params.set('model', debouncedAnalysisModel);

    const newUrl = `${window.location.pathname}?${params.toString()}`;

    // Only update if the URL actually changed
    if (window.location.search !== `?${params.toString()}`) {
      window.history.replaceState({}, '', newUrl);
    }
  }, [
    debouncedDatasetIds,
    debouncedStartDate,
    debouncedEndDate,
    debouncedChartType,
    debouncedAnalysisModel,
  ]);

  // Handle dataset selection
  const handleDatasetSelect = useCallback((dataset: DatasetInfo) => {
    setSelectedDatasets((prev) => {
      const exists = prev.find((d) => d.id === dataset.id);
      if (exists) {
        return prev.filter((d) => d.id !== dataset.id);
      } else {
        return [...prev, dataset];
      }
    });

    setVisibleDatasets((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(dataset.id)) {
        newSet.delete(dataset.id);
      } else {
        newSet.add(dataset.id);
      }
      return newSet;
    });
  }, []);

  // Fetch time series data
  const handleFetchData = async () => {
    if (selectedDatasets.length === 0) {
      return;
    }

    await extractTimeSeries({
      datasetIds: selectedDatasets.map((d) => d.id),
      startDate: dateRange.start,
      endDate: dateRange.end,
      analysisModel,
      normalize,
      chartType,
      spatialBounds: showSpatialFilter ? spatialBounds : undefined,
      aggregation,
      resampleFreq,
      includeStatistics: true,
      includeMetadata: true,
      smoothingWindow:
        analysisModel === AnalysisModel.MOVING_AVG
          ? smoothingWindow
          : undefined,
    });
  };

  // Handle data export
  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const blob = await exportData(format);
      const filename = generateFilename('climate_timeseries', format);
      downloadBlob(blob, filename);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  // Filter datasets based on search and category
  const filteredDatasets = useMemo(() => {
    return availableDatasets.filter((dataset) => {
      const matchesSearch =
        searchTerm === '' ||
        dataset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dataset.id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory =
        selectedCategory === 'All' || dataset.source === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [availableDatasets, searchTerm, selectedCategory]);

  // Get unique sources for category filter
  const uniqueSources = useMemo(() => {
    const sources = new Set(availableDatasets.map((d) => d.source));
    return ['All', ...Array.from(sources)];
  }, [availableDatasets]);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((point) => ({
      date: point.date,
      timestamp: point.timestamp,
      ...point.values,
    }));
  }, [data]);

  // Render chart based on type
  const renderChart = () => {
    if (!chartData || chartData.length === 0) return null;

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

    switch (chartType) {
      case ChartType.LINE:
        return (
          <LineChart data={chartData}>
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
                    stroke={colors[idx % colors.length]}
                    strokeWidth={2}
                    dot={false}
                    name={dataset.name}
                    connectNulls
                  />
                )
            )}
          </LineChart>
        );

      case ChartType.BAR:
        return (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" />
            <YAxis />
            <RechartsTooltip />
            <Legend />
            {selectedDatasets.map(
              (dataset, idx) =>
                visibleDatasetIds.includes(dataset.id) && (
                  <Bar
                    key={dataset.id}
                    dataKey={dataset.id}
                    fill={colors[idx % colors.length]}
                    name={dataset.name}
                  />
                )
            )}
          </BarChart>
        );

      case ChartType.AREA:
        return (
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" />
            <YAxis />
            <RechartsTooltip />
            <Legend />
            {selectedDatasets.map(
              (dataset, idx) =>
                visibleDatasetIds.includes(dataset.id) && (
                  <Area
                    key={dataset.id}
                    type="monotone"
                    dataKey={dataset.id}
                    stroke={colors[idx % colors.length]}
                    fill={colors[idx % colors.length]}
                    fillOpacity={0.6}
                    name={dataset.name}
                  />
                )
            )}
          </AreaChart>
        );

      case ChartType.SCATTER:
        if (selectedDatasets.length >= 2) {
          return (
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey={selectedDatasets[0].id}
                name={selectedDatasets[0].name}
              />
              <YAxis
                dataKey={selectedDatasets[1].id}
                name={selectedDatasets[1].name}
              />
              <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} />
              <Scatter name="Data Points" data={chartData} fill="#8884d8" />
            </ScatterChart>
          );
        }
        return <Alert>Select at least 2 datasets for scatter plot</Alert>;

      default:
        return null;
    }
  };

  return (
    <div className="from-background to-muted/20 flex h-screen flex-col bg-gradient-to-br">
      {/* Header */}
      <header className="bg-background/80 border-b backdrop-blur-sm">
        <div className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-2xl font-bold">
              Enhanced Climate Time Series Analysis
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Explore and analyze climate data from local and cloud sources
            </p>
          </div>
          <div className="flex items-center gap-4">
            {isLoading && (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <Progress value={progress} className="w-32" />
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearCache()}
              disabled={isLoading}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear Cache
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('csv')}
              disabled={!data || data.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              onClick={handleFetchData}
              disabled={selectedDatasets.length === 0 || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Activity className="mr-2 h-4 w-4" />
                  Fetch Data
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Left Panel - Dataset Selection */}
          <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
            <div className="h-full space-y-4 overflow-y-auto p-4">
              {/* Search and Filters */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Dataset Filters</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative">
                    <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
                    <Input
                      placeholder="Search datasets..."
                      className="pl-8"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  <Select
                    value={selectedCategory}
                    onValueChange={setSelectedCategory}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueSources.map((source) => (
                        <SelectItem key={source} value={source}>
                          {source}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Tabs
                    value={dataSourceFilter}
                    onValueChange={(v) => setDataSourceFilter(v as any)}
                  >
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="all">All</TabsTrigger>
                      <TabsTrigger value="local">
                        <Database className="mr-1 h-3 w-3" />
                        Local
                      </TabsTrigger>
                      <TabsTrigger value="cloud">
                        <Cloud className="mr-1 h-3 w-3" />
                        Cloud
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </CardContent>
              </Card>

              {/* Dataset List */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">
                    Available Datasets ({filteredDatasets.length})
                  </CardTitle>
                  <CardDescription>
                    {selectedDatasets.length} selected
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {filteredDatasets.map((dataset) => {
                        const isSelected = selectedDatasets.find(
                          (d) => d.id === dataset.id
                        );
                        return (
                          <motion.div
                            key={dataset.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={`cursor-pointer rounded-lg border p-3 transition-all ${
                              isSelected
                                ? 'bg-primary/10 border-primary'
                                : 'hover:bg-muted/50 border-border'
                            } `}
                            onClick={() => handleDatasetSelect(dataset)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-medium">
                                    {dataset.name}
                                  </h4>
                                  {dataset.stored === 'cloud' ? (
                                    <Cloud className="h-3 w-3 text-blue-500" />
                                  ) : (
                                    <Database className="h-3 w-3 text-green-500" />
                                  )}
                                </div>
                                <p className="text-muted-foreground text-xs">
                                  {dataset.source} • {dataset.units}
                                </p>
                                <p className="text-muted-foreground text-xs">
                                  {dataset.startDate} to {dataset.endDate}
                                </p>
                              </div>
                              <Checkbox checked={!!isSelected} />
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Processing Options */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Processing Options</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Analysis Model
                    </label>
                    <Select
                      value={analysisModel}
                      onValueChange={(v) =>
                        setAnalysisModel(v as AnalysisModel)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(AnalysisModel).map((model) => (
                          <SelectItem key={model} value={model}>
                            {model.replace('-', ' ').toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {analysisModel === AnalysisModel.MOVING_AVG && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Smoothing Window: {smoothingWindow}
                      </label>
                      <Slider
                        value={[smoothingWindow]}
                        onValueChange={(v) => setSmoothingWindow(v[0])}
                        min={3}
                        max={24}
                        step={1}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Aggregation</label>
                    <Select
                      value={aggregation}
                      onValueChange={(v) =>
                        setAggregation(v as AggregationMethod)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(AggregationMethod).map((method) => (
                          <SelectItem key={method} value={method}>
                            {method.toUpperCase()}
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
                </CardContent>
              </Card>
            </div>
          </ResizablePanel>

          <ResizableHandle />

          {/* Right Panel - Visualization */}
          <ResizablePanel defaultSize={65}>
            <div className="h-full space-y-4 overflow-y-auto p-4">
              {/* Error Alert */}
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Chart Controls */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      Visualization Controls
                    </CardTitle>
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
                </CardHeader>
                <CardContent>
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
                        {processingInfo.totalPoints} data points •
                        {processingInfo.datasetsProcessed} datasets • Processed
                        in {processingInfo.processingTime}
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
                    <CardTitle className="text-sm">
                      Statistical Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {Object.entries(statistics).map(([datasetId, stats]) => (
                        <Card key={datasetId} className="p-3">
                          <h4 className="mb-2 text-sm font-medium">
                            {metadata?.[datasetId]?.name || datasetId}
                          </h4>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Min:
                              </span>
                              <span className="font-mono">
                                {stats.min.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Max:
                              </span>
                              <span className="font-mono">
                                {stats.max.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Mean:
                              </span>
                              <span className="font-mono">
                                {stats.mean.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Std:
                              </span>
                              <span className="font-mono">
                                {stats.std.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Trend:
                              </span>
                              <span
                                className={`font-mono ${stats.trend >= 0 ? 'text-green-600' : 'text-red-600'}`}
                              >
                                {stats.trend >= 0 ? '+' : ''}
                                {stats.trend.toFixed(4)}
                              </span>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Data Table */}
              {data && data.length > 0 && (
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
                              <TableHead key={dataset.id}>
                                {dataset.name}
                              </TableHead>
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
                                <TableCell
                                  key={dataset.id}
                                  className="font-mono text-xs"
                                >
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
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
