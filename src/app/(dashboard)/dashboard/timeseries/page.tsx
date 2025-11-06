"use client";
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Download,
  BarChart3,
  Activity,
  TrendingUp,
  Zap,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  useTimeSeries,
  AnalysisModel,
  ChartType,
  AggregationMethod,
  formatDateForAPI,
  downloadBlob,
  generateFilename,
  validateFocusCoordinates,
  type DatasetInfo,
  type SpatialBounds,
} from "@/hooks/use-timeseries";
import { DatasetFilter } from "@/app/(dashboard)/dashboard/timeseries/_components/DatasetPanel";
import { VisualizationPanel } from "@/app/(dashboard)/dashboard/timeseries/_components/VisualizationPanel";

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

export default function TimeSeriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

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
  } = useTimeSeries(process.env.DATA_BACKEND_URL ?? "http://localhost:8000");

  // Local state
  const [selectedDatasets, setSelectedDatasets] = useState<DatasetInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [visibleDatasets, setVisibleDatasets] = useState<Set<string>>(
    new Set(),
  );
  const [dateRange, setDateRange] = useState({
    start: "2020-01-01",
    end: "2023-12-31",
  });
  const [chartType, setChartType] = useState<ChartType>(ChartType.LINE);
  const [analysisModel, setAnalysisModel] = useState<AnalysisModel>(
    AnalysisModel.RAW,
  );
  const [aggregation, setAggregation] = useState<AggregationMethod>(
    AggregationMethod.MEAN,
  );
  const [normalize, setNormalize] = useState(false);
  const [smoothingWindow, setSmoothingWindow] = useState(12);
  const [resampleFreq, setResampleFreq] = useState<string | undefined>(
    undefined,
  );
  const [showSpatialFilter, setShowSpatialFilter] = useState(false);
  const [spatialBounds, setSpatialBounds] = useState<SpatialBounds>({
    lat_min: -90,
    lat_max: 90,
    lon_min: -180,
    lon_max: 180,
  });
  const [dataSourceFilter, setDataSourceFilter] = useState<
    "all" | "local" | "cloud"
  >("all");

  // Focus coordinates state
  const [focusCoordinates, setFocusCoordinates] = useState("");
  const [coordinateValidation, setCoordinateValidation] = useState<{
    isValid: boolean;
    errors: string[];
  }>({ isValid: true, errors: [] });

  // Track if we've initialized from URL params
  const initializedFromUrl = useRef(false);

  // Load available datasets on mount
  useEffect(() => {
    listDatasets({ stored: dataSourceFilter });
  }, [listDatasets, dataSourceFilter]);

  // Initialize from URL parameters (only once)
  useEffect(() => {
    if (initializedFromUrl.current || availableDatasets.length === 0) return;

    const datasetSlugs = searchParams.get("datasets")?.split(",") || [];
    const startDate = searchParams.get("start");
    const endDate = searchParams.get("end");
    const chart = searchParams.get("chart") as ChartType;
    const model = searchParams.get("model") as AnalysisModel;

    if (startDate) setDateRange((prev) => ({ ...prev, start: startDate }));
    if (endDate) setDateRange((prev) => ({ ...prev, end: endDate }));
    if (chart && Object.values(ChartType).includes(chart)) setChartType(chart);
    if (model && Object.values(AnalysisModel).includes(model))
      setAnalysisModel(model);

    // Select datasets based on slugs from URL, map to UUIDs internally
    if (datasetSlugs.length > 0) {
      const selected = availableDatasets.filter((d) =>
        datasetSlugs.includes(d.slug || d.id),
      );
      if (selected.length > 0) {
        setSelectedDatasets(selected);
        setVisibleDatasets(new Set(selected.map((d) => d.id)));

        // Auto-extract if datasets are in URL
        console.log("Auto-extracting from URL parameters");
        setTimeout(() => {
          handleExtract();
        }, 100);
      }
    }

    initializedFromUrl.current = true;
  }, [searchParams, availableDatasets]);

  // Create stable serialized values for URL update dependencies
  const selectedDatasetSlugs = useMemo(
    () => selectedDatasets.map((d) => d.slug || d.id).join(","),
    [selectedDatasets],
  );

  // Debounce the URL update values
  const debouncedDatasetSlugs = useDebounce(selectedDatasetSlugs, 800);
  const debouncedStartDate = useDebounce(dateRange.start, 800);
  const debouncedEndDate = useDebounce(dateRange.end, 800);
  const debouncedChartType = useDebounce(chartType, 500);
  const debouncedAnalysisModel = useDebounce(analysisModel, 500);

  // Update URL when selections change (with debouncing)
  useEffect(() => {
    if (!initializedFromUrl.current) return;

    const params = new URLSearchParams();
    if (debouncedDatasetSlugs) params.set("datasets", debouncedDatasetSlugs);
    if (debouncedStartDate) params.set("start", debouncedStartDate);
    if (debouncedEndDate) params.set("end", debouncedEndDate);
    if (debouncedChartType) params.set("chart", debouncedChartType);
    if (debouncedAnalysisModel) params.set("model", debouncedAnalysisModel);

    const newUrl = params.toString() ? `?${params.toString()}` : "";
    if (window.location.search !== `?${params.toString()}`) {
      router.replace(newUrl, { scroll: false });
    }
  }, [
    debouncedDatasetSlugs,
    debouncedStartDate,
    debouncedEndDate,
    debouncedChartType,
    debouncedAnalysisModel,
    router,
  ]);

  // Validate focus coordinates in real-time
  useEffect(() => {
    if (focusCoordinates.trim() === "") {
      setCoordinateValidation({ isValid: true, errors: [] });
      return;
    }

    const validation = validateFocusCoordinates(focusCoordinates);
    setCoordinateValidation({
      isValid: validation.isValid,
      errors: validation.errors,
    });
  }, [focusCoordinates]);

  // Memoized chart data (already transformed in hook)
  const chartData = useMemo(() => {
    return data; // Data is already in chart-ready format from the hook
  }, [data]);

  // Handle Extract button click with validation
  const handleExtract = useCallback(async () => {
    if (selectedDatasets.length === 0) {
      toast.error("Please select at least one dataset");
      return;
    }

    // Validate focus coordinates
    if (focusCoordinates.trim() && !coordinateValidation.isValid) {
      toast.error(
        `Invalid coordinates: ${coordinateValidation.errors.join(", ")}`,
      );
      return;
    }

    // Send UUIDs to API (backend uses them for database lookup)
    const datasetIds = selectedDatasets.map((d) => d.id);
    setVisibleDatasets(new Set(datasetIds));

    console.log("🚀 Extracting datasets:");
    console.log("  - UUIDs for API:", datasetIds);
    console.log(
      "  - Slugs for display:",
      selectedDatasets.map((d) => d.slug),
    );
    console.log("  - Date range:", dateRange);

    if (focusCoordinates) {
      const validation = validateFocusCoordinates(focusCoordinates);
      console.log("  - Focus coordinates:", validation.parsed);
    }

    try {
      await extractTimeSeries({
        datasetIds, // UUIDs for API
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
        focusCoordinates: focusCoordinates.trim() || undefined,
      });

      toast.success("Data extracted successfully!");
    } catch (err) {
      toast.error("Failed to extract data");
    }
  }, [
    selectedDatasets,
    dateRange,
    analysisModel,
    aggregation,
    normalize,
    smoothingWindow,
    resampleFreq,
    showSpatialFilter,
    spatialBounds,
    chartType,
    focusCoordinates,
    coordinateValidation,
    extractTimeSeries,
  ]);

  // Handle export with better error handling
  const handleExport = useCallback(
    async (format: "csv" | "json" | "png") => {
      if (!data || data.length === 0) {
        toast.error("No data to export");
        return;
      }

      try {
        toast.loading(`Exporting as ${format.toUpperCase()}...`);

        const blob = await exportData(format);
        const filename = generateFilename(
          selectedDatasets.map((d) => d.name || d.slug),
          dateRange.start,
          dateRange.end,
          format,
        );

        downloadBlob(blob, filename);
        toast.success(`Exported successfully as ${filename}`);
      } catch (err) {
        console.error("Export error:", err);
        toast.error(`Failed to export as ${format.toUpperCase()}`);
      }
    },
    [data, exportData, selectedDatasets, dateRange],
  );

  // Show error toast when API error occurs
  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  return (
    <div className="flex flex-col">
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
              size="lg"
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
                <Button
                  variant="outline"
                  disabled={!data || data.length === 0}
                  size="lg"
                >
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
                    onClick={() => handleExport("csv")}
                    className="w-full justify-start"
                    variant="outline"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export as CSV (Spreadsheet)
                  </Button>
                  <Button
                    onClick={() => handleExport("json")}
                    className="w-full justify-start"
                    variant="outline"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export as JSON (Raw Data)
                  </Button>
                  <Button
                    onClick={() => handleExport("png")}
                    className="w-full justify-start"
                    variant="outline"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export Chart as PNG (Image)
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Button variant="ghost" onClick={() => reset()} size="lg">
              Reset
            </Button>
          </div>
        </div>

        {/* Progress Bar */}
        {isLoading && progress > 0 && (
          <div className="mt-4">
            <Progress value={progress} className="h-2" />
            <p className="text-muted-foreground mt-1 text-xs">
              Processing: {progress.toFixed(0)}%
            </p>
          </div>
        )}

        {/* Processing Info Display */}
        {processingInfo && !isLoading && (
          <div className="mt-3 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-muted-foreground">
                {processingInfo.datasetsProcessed} dataset(s) •{" "}
                {processingInfo.totalPoints} points •{" "}
                {processingInfo.processingTime}
              </span>
            </div>
            {processingInfo.extractionMode && (
              <div className="flex items-center gap-2">
                <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  {processingInfo.extractionMode === "point-based"
                    ? `Point-based (${processingInfo.focusCoordinates} coord${processingInfo.focusCoordinates !== 1 ? "s" : ""})`
                    : "Spatial aggregation"}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Coordinate Validation Warning */}
        {focusCoordinates.trim() && !coordinateValidation.isValid && (
          <Alert variant="destructive" className="mt-3">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Invalid Coordinates</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {coordinateValidation.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
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
            <div
              className="h-full space-y-4 overflow-y-auto p-4"
              data-chart-container
            >
              {/* Error Alert */}
              {error && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reset()}
                    className="mt-2"
                  >
                    Dismiss
                  </Button>
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
                focusCoordinates={focusCoordinates}
                setFocusCoordinates={setFocusCoordinates}
                chartData={chartData}
                selectedDatasets={selectedDatasets}
                visibleDatasets={visibleDatasets}
                processingInfo={processingInfo}
                statistics={statistics}
                metadata={metadata}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
