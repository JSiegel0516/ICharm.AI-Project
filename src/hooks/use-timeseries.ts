import { useState, useCallback, useRef, useMemo } from "react";
import axios, { AxiosInstance, CancelTokenSource } from "axios";

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export enum AnalysisModel {
  RAW = "raw",
  MOVING_AVG = "moving-avg",
  TREND = "trend",
  ANOMALY = "anomaly",
  SEASONAL = "seasonal",
  CUMULATIVE = "cumulative",
  DERIVATIVE = "derivative",
}

export enum ChartType {
  LINE = "line",
  BAR = "bar",
  AREA = "area",
  SCATTER = "scatter",
  HEATMAP = "heatmap",
}

export enum AggregationMethod {
  MEAN = "mean",
  MAX = "max",
  MIN = "min",
  SUM = "sum",
  MEDIAN = "median",
  STD = "std",
}

export interface SpatialBounds {
  lat_min?: number;
  lat_max?: number;
  lon_min?: number;
  lon_max?: number;
}

export interface TimeSeriesRequest {
  datasetIds: string[];
  startDate: string;
  endDate: string;
  analysisModel?: AnalysisModel;
  normalize?: boolean;
  chartType?: ChartType;
  spatialBounds?: SpatialBounds;
  aggregation?: AggregationMethod;
  resampleFreq?: string;
  includeStatistics?: boolean;
  includeMetadata?: boolean;
  smoothingWindow?: number;
  focusCoordinates?: string;
}

export interface DataPoint {
  date: string;
  values: Record<string, number | null>;
  timestamp?: number;
}

export interface Statistics {
  min: number;
  max: number;
  mean: number;
  median: number;
  std: number;
  trend: number;
  count: number;
  missing: number;
  percentiles: Record<string, number>;
}

export interface DatasetMetadata {
  id: string;
  slug: string;
  name: string;
  source: string;
  units: string;
  spatialResolution?: string;
  temporalResolution: string;
  startDate: string;
  endDate: string;
  isLocal: boolean;
  level?: string;
  description?: string;
}

export interface ChartConfig {
  type: string;
  datasets: Array<{
    id: string;
    label: string;
    color: string;
    units: string;
    borderWidth: number;
    fill: boolean;
  }>;
  options: Record<string, any>;
}

export interface ProcessingInfo {
  processingTime: string;
  totalPoints: number;
  datasetsProcessed: number;
  dateRange: {
    start: string | null;
    end: string | null;
  };
  analysisModel: string;
  aggregation: string;
  focusCoordinates?: number | null;
  extractionMode?: string;
}

export interface TimeSeriesResponse {
  data: DataPoint[];
  metadata?: Record<string, DatasetMetadata>;
  statistics?: Record<string, Statistics>;
  chartConfig?: ChartConfig;
  processingInfo: ProcessingInfo;
}

export interface DatasetInfo {
  id: string;
  slug: string;
  name: string;
  datasetName?: string;
  source: string;
  type: string;
  stored: "local" | "cloud";
  startDate: string;
  endDate: string;
  units: string;
  spatialResolution?: string;
  levels?: string;
}

export interface DatasetListResponse {
  total: number;
  datasets: DatasetInfo[];
}

export interface UseTimeSeriesAPI {
  // Data
  data: any[]; // Chart-ready flattened data
  rawData: DataPoint[]; // Original API response data
  metadata: Record<string, DatasetMetadata> | null;
  statistics: Record<string, Statistics> | null;
  chartConfig: ChartConfig | null;
  processingInfo: ProcessingInfo | null;
  availableDatasets: DatasetInfo[];

  // State
  isLoading: boolean;
  error: string | null;
  progress: number;

  // Methods
  extractTimeSeries: (request: TimeSeriesRequest) => Promise<void>;
  listDatasets: (filters?: {
    stored?: "local" | "cloud" | "all";
    source?: string;
    search?: string;
  }) => Promise<void>;
  exportData: (format: "csv" | "json" | "png") => Promise<Blob>;
  cancelRequest: () => void;
  clearCache: () => Promise<void>;
  reset: () => void;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format date for API request
 */
export function formatDateForAPI(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Parse API date string
 */
export function parseAPIDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

/**
 * Generate download filename with timestamp
 */
export function generateFilename(
  datasetNames: string | string[],
  startDate: string,
  endDate: string,
  extension: string,
): string {
  const names = Array.isArray(datasetNames) ? datasetNames : [datasetNames];
  const sanitizedNames = names
    .map((name) => name.replace(/[^a-z0-9]/gi, "_").toLowerCase())
    .join("_")
    .substring(0, 50); // Limit length

  const dateStr = `${startDate}_to_${endDate}`;
  const timestamp = new Date().toISOString().split("T")[0];

  return `${sanitizedNames}_${dateStr}_${timestamp}.${extension}`;
}

/**
 * Download blob as file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format bytes to human readable size
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Validate focus coordinates format (fast validation)
 */
export function validateFocusCoordinates(coordString: string): {
  isValid: boolean;
  errors: string[];
  parsed?: Array<{ lat: number; lon: number }>;
} {
  if (!coordString || !coordString.trim()) {
    return { isValid: true, errors: [], parsed: [] };
  }

  const errors: string[] = [];
  const parsed: Array<{ lat: number; lon: number }> = [];

  try {
    const pairs = coordString
      .split(";")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    for (const pair of pairs) {
      const parts = pair.split(",").map((p) => p.trim());

      if (parts.length !== 2) {
        errors.push(`Invalid format: "${pair}" (expected "lat,lon")`);
        continue;
      }

      const lat = parseFloat(parts[0]);
      const lon = parseFloat(parts[1]);

      if (isNaN(lat) || isNaN(lon)) {
        errors.push(`Non-numeric values in: "${pair}"`);
        continue;
      }

      if (lat < -90 || lat > 90) {
        errors.push(`Latitude out of range (-90 to 90): ${lat}`);
        continue;
      }

      if (lon < -180 || lon > 180) {
        errors.push(`Longitude out of range (-180 to 180): ${lon}`);
        continue;
      }

      parsed.push({ lat, lon });
    }

    return {
      isValid: errors.length === 0,
      errors,
      parsed: parsed.length > 0 ? parsed : undefined,
    };
  } catch (err) {
    return {
      isValid: false,
      errors: ["Failed to parse coordinates"],
    };
  }
}

/**
 * Format coordinates for display
 */
export function formatCoordinates(
  coords: Array<{ lat: number; lon: number }>,
): string {
  return coords
    .map((c) => `(${c.lat.toFixed(4)}, ${c.lon.toFixed(4)})`)
    .join(", ");
}

/**
 * Export chart as PNG image
 */
export async function exportChartAsPNG(
  chartElement: HTMLElement,
): Promise<Blob> {
  // Dynamically import html2canvas to avoid SSR issues
  const html2canvas = (await import("html2canvas")).default;

  const canvas = await html2canvas(chartElement, {
    backgroundColor: "#ffffff",
    scale: 2, // Higher quality
  });

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob!);
    }, "image/png");
  });
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useTimeSeriesAPI(
  baseURL: string = process.env.NEXT_PUBLIC_FASTAPI_URL ||
    "http://localhost:8000",
): UseTimeSeriesAPI {
  // State
  const [rawData, setRawData] = useState<DataPoint[]>([]);
  const [metadata, setMetadata] = useState<Record<
    string,
    DatasetMetadata
  > | null>(null);
  const [statistics, setStatistics] = useState<Record<
    string,
    Statistics
  > | null>(null);
  const [chartConfig, setChartConfig] = useState<ChartConfig | null>(null);
  const [processingInfo, setProcessingInfo] = useState<ProcessingInfo | null>(
    null,
  );
  const [availableDatasets, setAvailableDatasets] = useState<DatasetInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Refs
  const cancelTokenRef = useRef<CancelTokenSource | null>(null);
  const apiClientRef = useRef<AxiosInstance | null>(null);
  const lastRequestRef = useRef<string>("");

  // Initialize API client
  if (!apiClientRef.current) {
    apiClientRef.current = axios.create({
      baseURL,
      timeout: 120000, // 120 second timeout for large datasets
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Add request interceptor for progress tracking
    apiClientRef.current.interceptors.request.use((config) => {
      setProgress(10);
      return config;
    });

    // Add response interceptor for progress tracking
    apiClientRef.current.interceptors.response.use(
      (response) => {
        setProgress(100);
        return response;
      },
      (error) => {
        setProgress(0);
        throw error;
      },
    );
  }

  // FIXED: Memoized chart-ready data with proper transformation
  const data = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];

    // Transform API response format to chart format
    return rawData.map((point) => ({
      date: point.date,
      timestamp: point.timestamp,
      ...point.values, // Spread values to make dataset IDs top-level keys
    }));
  }, [rawData]);

  // Extract time series data with validation and debouncing
  const extractTimeSeries = useCallback(
    async (request: TimeSeriesRequest) => {
      // Validate focus coordinates if provided
      if (request.focusCoordinates) {
        const validation = validateFocusCoordinates(request.focusCoordinates);
        if (!validation.isValid) {
          setError(`Invalid coordinates: ${validation.errors.join(", ")}`);
          return;
        }
      }

      // Create request signature for duplicate detection
      const requestSignature = JSON.stringify({
        datasetIds: request.datasetIds.sort(),
        startDate: request.startDate,
        endDate: request.endDate,
        analysisModel: request.analysisModel,
        focusCoordinates: request.focusCoordinates,
      });

      // Prevent duplicate simultaneous requests
      if (requestSignature === lastRequestRef.current && isLoading) {
        console.log("🚫 Duplicate request detected, ignoring");
        return;
      }

      lastRequestRef.current = requestSignature;
      setIsLoading(true);
      setError(null);
      setProgress(0);

      // Cancel any pending request
      if (cancelTokenRef.current) {
        cancelTokenRef.current.cancel("New request initiated");
      }

      // Create new cancel token
      cancelTokenRef.current = axios.CancelToken.source();

      try {
        setProgress(20);

        // Log request for debugging
        console.log("📡 Sending time series request:", {
          datasetIds: request.datasetIds,
          dateRange: `${request.startDate} to ${request.endDate}`,
          focusCoordinates:
            request.focusCoordinates || "None (spatial aggregation)",
          analysisModel: request.analysisModel,
          aggregation: request.aggregation,
        });

        const response = await apiClientRef.current!.post<TimeSeriesResponse>(
          "/api/v2/timeseries/extract",
          request,
          {
            cancelToken: cancelTokenRef.current.token,
            onDownloadProgress: (progressEvent) => {
              if (progressEvent.total) {
                const percentCompleted =
                  Math.round(
                    (progressEvent.loaded * 80) / progressEvent.total,
                  ) + 20;
                setProgress(percentCompleted);
              }
            },
          },
        );

        // Log response for debugging
        console.log("✅ Received time series response:", {
          dataPoints: response.data.data.length,
          datasets: response.data.processingInfo.datasetsProcessed,
          extractionMode: response.data.processingInfo.extractionMode,
          focusCoordinates: response.data.processingInfo.focusCoordinates,
          processingTime: response.data.processingInfo.processingTime,
        });

        // FIXED: Store raw data - transformation happens in useMemo
        setRawData(response.data.data);
        setMetadata(response.data.metadata || null);
        setStatistics(response.data.statistics || null);
        setChartConfig(response.data.chartConfig || null);
        setProcessingInfo(response.data.processingInfo);

        setProgress(100);
      } catch (err) {
        if (axios.isCancel(err)) {
          console.log("Request cancelled:", err.message);
        } else if (axios.isAxiosError(err)) {
          const errorMessage = err.response?.data?.detail || err.message;
          setError(`Failed to extract time series: ${errorMessage}`);
          console.error("API Error:", err.response?.data);
        } else {
          setError("An unexpected error occurred");
          console.error("Unexpected error:", err);
        }
      } finally {
        setIsLoading(false);
        setTimeout(() => setProgress(0), 1000);
        lastRequestRef.current = "";
      }
    },
    [isLoading],
  );

  // List available datasets
  const listDatasets = useCallback(
    async (filters?: {
      stored?: "local" | "cloud" | "all";
      source?: string;
      search?: string;
    }) => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (filters?.stored) params.append("stored", filters.stored);
        if (filters?.source) params.append("source", filters.source);
        if (filters?.search) params.append("search", filters.search);

        const response = await axios.get<{ datasets: DatasetInfo[] }>(
          `${baseURL}/api/v2/timeseries/datasets?${params.toString()}`,
        );

        setAvailableDatasets(response.data.datasets);
      } catch (err) {
        if (axios.isAxiosError(err)) {
          setError(
            `Failed to list datasets: ${err.response?.data?.detail || err.message}`,
          );
        } else {
          setError("Failed to list datasets");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [baseURL],
  );

  // Export data in various formats
  const exportData = useCallback(
    async (format: "csv" | "json" | "png"): Promise<Blob> => {
      if (!data.length && format !== "png") {
        throw new Error("No data to export");
      }

      try {
        if (format === "csv") {
          // Convert data to CSV
          const headers = [
            "date",
            ...Object.keys(data[0]).filter(
              (k) => k !== "date" && k !== "timestamp",
            ),
          ];
          const rows = data.map((point) => {
            return headers.map((h) => {
              const value = point[h];
              return value != null ? value.toString() : "";
            });
          });

          const csvContent = [
            headers.join(","),
            ...rows.map((row) => row.join(",")),
          ].join("\n");

          return new Blob([csvContent], { type: "text/csv" });
        } else if (format === "json") {
          // Export as JSON
          const exportData = {
            data: rawData,
            metadata,
            statistics,
            processingInfo,
          };

          return new Blob([JSON.stringify(exportData, null, 2)], {
            type: "application/json",
          });
        } else if (format === "png") {
          // Export chart as PNG
          const chartElement = document.querySelector(
            "[data-chart-container]",
          ) as HTMLElement;
          if (!chartElement) {
            throw new Error("Chart element not found");
          }

          return await exportChartAsPNG(chartElement);
        }

        throw new Error(`Unsupported format: ${format}`);
      } catch (err) {
        console.error("Export error:", err);
        throw new Error(`Failed to export data as ${format}`);
      }
    },
    [data, rawData, metadata, statistics, processingInfo],
  );

  // Cancel pending request
  const cancelRequest = useCallback(() => {
    if (cancelTokenRef.current) {
      cancelTokenRef.current.cancel("Request cancelled by user");
      cancelTokenRef.current = null;
    }
    setIsLoading(false);
    setProgress(0);
    lastRequestRef.current = "";
  }, []);

  // Clear server cache
  const clearCache = useCallback(async () => {
    try {
      await apiClientRef.current!.post("/api/v2/cache/clear");
    } catch (err) {
      console.error("Failed to clear cache:", err);
    }
  }, []);

  // Reset all state
  const reset = useCallback(() => {
    setRawData([]);
    setMetadata(null);
    setStatistics(null);
    setChartConfig(null);
    setProcessingInfo(null);
    setError(null);
    setProgress(0);
    cancelRequest();
  }, [cancelRequest]);

  return {
    // Data
    data, // Chart-ready flattened data
    rawData, // Original API response
    metadata,
    statistics,
    chartConfig,
    processingInfo,
    availableDatasets,

    // State
    isLoading,
    error,
    progress,

    // Methods
    extractTimeSeries,
    listDatasets,
    exportData,
    cancelRequest,
    clearCache,
    reset,
  };
}
