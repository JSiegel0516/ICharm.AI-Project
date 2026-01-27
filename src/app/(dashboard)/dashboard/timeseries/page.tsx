"use client";
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  Suspense,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { XCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Banner,
  BannerAction,
  BannerClose,
  BannerIcon,
  BannerTitle,
} from "@/components/ui/shadcn-io/banner";
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
import { DatasetFilter } from "@/app/(dashboard)/dashboard/timeseries/_components/OptionsPanel";
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

// ============================================================================
// MAIN CONTENT COMPONENT
// ============================================================================
function TimeSeriesContent() {
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

  // Dynamically expand selectedDatasets to include point-based series (e.g., uuid_point_1, uuid_point_2)
  const expandedSelectedDatasets = useMemo(() => {
    if (!metadata || !data || data.length === 0) return selectedDatasets;

    const metadataKeys = Object.keys(metadata);
    const expanded: DatasetInfo[] = [];

    selectedDatasets.forEach((dataset) => {
      // Check if this dataset has point-based variants in metadata
      const pointVariants = metadataKeys.filter((key) =>
        key.startsWith(`${dataset.id}_point_`),
      );

      if (pointVariants.length > 0) {
        // Dataset has multiple points - add each as separate series
        pointVariants.forEach((pointKey) => {
          const pointMetadata = metadata[pointKey];
          expanded.push({
            ...dataset,
            id: pointKey,
            name: pointMetadata?.name || dataset.name,
            datasetName: pointMetadata?.name || dataset.name,
          });
        });
      } else {
        // No point variants - use original dataset
        expanded.push(dataset);
      }
    });

    return expanded;
  }, [selectedDatasets, metadata, data]);

  // Auto-update visibleDatasets when expanded datasets change
  useEffect(() => {
    if (expandedSelectedDatasets.length > 0 && data && data.length > 0) {
      const expandedIds = new Set(expandedSelectedDatasets.map((d) => d.id));
      setVisibleDatasets(expandedIds);
    }
  }, [expandedSelectedDatasets, data]);

  const [dateRange, setDateRange] = useState({
    start: "2020-01-01",
    end: "2023-12-31",
  });

  // Client-side chart options (moved to VisualizationPanel)
  const [chartType, setChartType] = useState<ChartType>(ChartType.LINE);
  const [normalize, setNormalize] = useState(false);
  const [smoothingWindow, setSmoothingWindow] = useState(1);
  const [resampleFreq, setResampleFreq] = useState<string | undefined>(
    undefined,
  );
  const [aggregation, setAggregation] = useState<AggregationMethod>(
    AggregationMethod.MEAN,
  );
  const [showHistogram, setShowHistogram] = useState(false);
  const [showLinearTrend, setShowLinearTrend] = useState(false);

  // Server-side options (stay in OptionsPanel)
  const [analysisModel, setAnalysisModel] = useState<AnalysisModel>(
    AnalysisModel.RAW,
  );
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

    console.log("Extracting datasets:");
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
      // NOTE: We request RAW data - client-side transformations applied in VisualizationPanel
      await extractTimeSeries({
        datasetIds,
        startDate: dateRange.start,
        endDate: dateRange.end,
        analysisModel, // Server-side analysis only
        normalize: false, // Done client-side
        chartType,
        aggregation: AggregationMethod.MEAN,
        resampleFreq: undefined, // Done client-side
        includeStatistics: true,
        includeMetadata: true,
        smoothingWindow: undefined, // Done client-side
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

  // Handle reset - clear all state and URL params
  const handleReset = useCallback(() => {
    reset(); // Call the hook's reset function

    // Clear URL parameters
    router.replace(window.location.pathname, { scroll: false });

    // Reset local state
    setSelectedDatasets([]);
    setVisibleDatasets(new Set());
    setChartType(ChartType.LINE);
    setNormalize(false);
    setSmoothingWindow(1);
    setResampleFreq(undefined);
    setAggregation(AggregationMethod.MEAN);
    setShowHistogram(false);
    setShowLinearTrend(false);
    setAnalysisModel(AnalysisModel.RAW);
    setFocusCoordinates("");

    // Reset the initialization flag so URL params can work again
    initializedFromUrl.current = false;
  }, [reset, router]);

  // Show error toast when API error occurs
  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Sticky Banner Container - Processing Info & Errors */}
      <div className="sticky top-2 z-50">
        {/* Processing Info Banner */}
        {processingInfo && !isLoading && (
          <Banner className="rounded-lg bg-green-200 dark:bg-green-800">
            <BannerIcon icon={CheckCircle} className="text-green-600" />
            <BannerTitle>
              <span className="text-foreground">
                Processed: {processingInfo.datasetsProcessed} dataset(s) •{" "}
                {processingInfo.totalPoints} points •{" "}
                {processingInfo.processingTime}
              </span>
            </BannerTitle>
            <BannerAction>
              <div className="flex flex-col gap-3 text-sm">
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
            </BannerAction>
            <BannerClose className="text-primary hover:bg-card-foreground/30 dark:hover:bg-card-foreground/30" />
          </Banner>
        )}

        {/* Error Banner */}
        {error && (
          <div className="">
            <Banner className="rounded-lg bg-red-200 dark:bg-red-800">
              <BannerIcon icon={XCircle} />
              <BannerTitle className="text-primary">Error: {error}</BannerTitle>
              <BannerClose className="text-primary hover:bg-card-foreground/30 dark:hover:bg-card-foreground/30" />
            </Banner>
          </div>
        )}
      </div>

      {/* Dataset Filter - Server-side Controls Only */}
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
        dateRange={dateRange}
        setDateRange={setDateRange}
        analysisModel={analysisModel}
        setAnalysisModel={setAnalysisModel}
        focusCoordinates={focusCoordinates}
        setFocusCoordinates={setFocusCoordinates}
        onExtract={handleExtract}
        onExport={handleExport}
        onReset={handleReset}
        isLoading={isLoading}
        hasData={data && data.length > 0}
        progress={progress}
        processingInfo={processingInfo}
        coordinateValidation={coordinateValidation}
      />

      {/* Visualization Panel - Includes ChartOptionsPanel now */}
      <div data-chart-container>
        <VisualizationPanel
          chartType={chartType}
          setChartType={setChartType}
          dateRange={dateRange}
          analysisModel={analysisModel}
          chartData={data}
          selectedDatasets={expandedSelectedDatasets}
          visibleDatasets={visibleDatasets}
          processingInfo={processingInfo}
          statistics={statistics}
          metadata={metadata}
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
      </div>
    </div>
  );
}

// ============================================================================
// LOADING COMPONENT
// ============================================================================
function TimeSeriesLoading() {
  return (
    <div className="container mx-auto flex min-h-[400px] items-center justify-center p-6">
      <div className="text-center">
        <div className="border-primary mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
        <p className="text-muted-foreground">Loading time series...</p>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE EXPORT WITH SUSPENSE
// ============================================================================
export default function TimeSeriesPage() {
  return (
    <Suspense fallback={<TimeSeriesLoading />}>
      <TimeSeriesContent />
    </Suspense>
  );
}
