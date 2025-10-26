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
import {
  Download,
  BarChart3,
  Activity,
  TrendingUp,
  Zap,
  Loader2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
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
// Import new components
import { DatasetFilter } from '@/app/(dashboard)/dashboard/timeseries/_components/Datasets';
import { VisualizationPanel } from '@/app/(dashboard)/dashboard/timeseries/_components/VisualizationPanel';
import { DataTable } from '@/app/(dashboard)/dashboard/timeseries/_components/DataTable';

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
        datasetIds.includes((d as any).slug || d.id)
      );
      setSelectedDatasets(selected);
      setVisibleDatasets(new Set(selected.map((d) => d.id)));
    }

    initializedFromUrl.current = true;
  }, [searchParams, availableDatasets]);

  // Create stable serialized values for URL update dependencies
  const selectedDatasetIds = useMemo(
    () => selectedDatasets.map((d) => (d as any).slug || d.id).join(','),
    [selectedDatasets]
  );

  // Debounce the URL update values
  const debouncedDatasetIds = useDebounce(selectedDatasetIds, 500);
  const debouncedStartDate = useDebounce(dateRange.start, 500);
  const debouncedEndDate = useDebounce(dateRange.end, 500);
  const debouncedChartType = useDebounce(chartType, 500);
  const debouncedAnalysisModel = useDebounce(analysisModel, 500);

  // Update URL when selections change (with debouncing)
  useEffect(() => {
    if (!initializedFromUrl.current) return;

    const params = new URLSearchParams();
    if (debouncedDatasetIds) params.set('datasets', debouncedDatasetIds);
    if (debouncedStartDate) params.set('start', debouncedStartDate);
    if (debouncedEndDate) params.set('end', debouncedEndDate);
    if (debouncedChartType) params.set('chart', debouncedChartType);
    if (debouncedAnalysisModel) params.set('model', debouncedAnalysisModel);

    router.replace(`?${params.toString()}`, { scroll: false });
  }, [
    debouncedDatasetIds,
    debouncedStartDate,
    debouncedEndDate,
    debouncedChartType,
    debouncedAnalysisModel,
    router,
  ]);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((point) => ({
      date: point.date,
      timestamp: point.timestamp,
      ...point.values,
    }));
  }, [data]);

  // Handle Extract button click
  const handleExtract = useCallback(async () => {
    if (selectedDatasets.length === 0) {
      return;
    }

    // Send UUIDs directly - Python looks them up in the database
    const datasetIds = selectedDatasets.map((d) => d.id);
    console.log('Extracting datasets with UUIDs:', datasetIds);
    console.log('Selected datasets:', selectedDatasets);

    await extractTimeSeries({
      datasetIds,
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
  }, [
    selectedDatasets,
    dateRange.start,
    dateRange.end,
    analysisModel,
    aggregation,
    normalize,
    smoothingWindow,
    resampleFreq,
    showSpatialFilter,
    spatialBounds,
    chartType,
    extractTimeSeries,
  ]);

  // Handle export
  const handleExport = useCallback(
    async (format: 'csv' | 'json' | 'png') => {
      if (!data || data.length === 0) return;

      const blob = await exportData(format);
      if (blob) {
        const filename = generateFilename(
          selectedDatasets.map((d) => d.name),
          dateRange.start,
          dateRange.end,
          format
        );
        downloadBlob(blob, filename);
      }
    },
    [data, exportData, selectedDatasets, dateRange]
  );

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="bg-background border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="text-primary h-6 w-6" />
            <div>
              <h1 className="text-2xl font-bold">Time Series Analysis</h1>
              <p className="text-muted-foreground text-sm">
                Extract and visualize climate data patterns
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Action Buttons */}
            <Button
              onClick={handleExtract}
              disabled={selectedDatasets.length === 0 || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Activity className="mr-2 h-4 w-4" />
                  Extract Data
                </>
              )}
            </Button>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={!data || data.length === 0}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Export Data</DialogTitle>
                  <DialogDescription>
                    Choose a format to download your time series data
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <Button
                    onClick={() => handleExport('csv')}
                    className="w-full"
                  >
                    Export as CSV
                  </Button>
                  <Button
                    onClick={() => handleExport('json')}
                    className="w-full"
                  >
                    Export as JSON
                  </Button>
                  <Button
                    onClick={() => handleExport('png')}
                    className="w-full"
                  >
                    Export Chart as PNG
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Button variant="ghost" onClick={() => reset()}>
              Reset
            </Button>
          </div>
        </div>

        {/* Progress Bar */}
        {isLoading && progress !== null && (
          <div className="mt-4">
            <Progress value={progress} className="h-2" />
            <p className="text-muted-foreground mt-1 text-xs">
              Processing: {progress.toFixed(0)}%
            </p>
          </div>
        )}
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Left Panel - Controls */}
          <ResizablePanel defaultSize={35} minSize={25}>
            <div className="h-full space-y-4 overflow-y-auto p-4">
              {/* Dataset Filter Component */}
              <DatasetFilter
                selectedDatasets={selectedDatasets}
                setSelectedDatasets={setSelectedDatasets}
                availableDatasets={availableDatasets}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
                visibleDatasets={visibleDatasets}
                setVisibleDatasets={setVisibleDatasets}
                dataSourceFilter={dataSourceFilter}
                setDataSourceFilter={setDataSourceFilter}
              />
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

              {/* Visualization Panel Component */}
              <VisualizationPanel
                chartType={chartType}
                setChartType={setChartType}
                dateRange={dateRange}
                setDateRange={setDateRange}
                analysisModel={analysisModel}
                setAnalysisModel={setAnalysisModel}
                aggregation={aggregation}
                setAggregation={setAggregation}
                normalize={normalize}
                setNormalize={setNormalize}
                smoothingWindow={smoothingWindow}
                setSmoothingWindow={setSmoothingWindow}
                resampleFreq={resampleFreq}
                setResampleFreq={setResampleFreq}
                chartData={chartData}
                selectedDatasets={selectedDatasets}
                visibleDatasets={visibleDatasets}
                processingInfo={processingInfo}
                statistics={statistics}
                metadata={metadata}
              />

              {/* Data Table Component */}
              <DataTable data={data} selectedDatasets={selectedDatasets} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
