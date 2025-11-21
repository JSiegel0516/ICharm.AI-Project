"use client";
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  useTimeSeries,
  AnalysisModel,
  ChartType,
  AggregationMethod,
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

  // Chart overlay state
  const [showHistogram, setShowHistogram] = useState(false);
  const [showLinearTrend, setShowLinearTrend] = useState(false);

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
    <div className="container mx-auto space-y-6 p-6">
      {/* Dataset Filter - All Controls */}
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
        showHistogram={showHistogram}
        setShowHistogram={setShowHistogram}
        showLinearTrend={showLinearTrend}
        setShowLinearTrend={setShowLinearTrend}
        onExtract={handleExtract}
        onExport={handleExport}
        onReset={reset}
        isLoading={isLoading}
        hasData={data && data.length > 0}
        progress={progress}
        processingInfo={processingInfo}
        coordinateValidation={coordinateValidation}
      />

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

      {/* Visualization Panel - Chart, Table, Stats */}
      <div data-chart-container>
        <VisualizationPanel
          chartType={chartType}
          dateRange={dateRange}
          analysisModel={analysisModel}
          chartData={chartData}
          selectedDatasets={selectedDatasets}
          visibleDatasets={visibleDatasets}
          processingInfo={processingInfo}
          statistics={statistics}
          metadata={metadata}
          showHistogram={showHistogram}
          showLinearTrend={showLinearTrend}
        />
      </div>
    </div>
  );
}
