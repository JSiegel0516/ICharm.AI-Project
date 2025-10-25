// hooks/use-timeseries-api.ts
/**
 * React hook for interacting with the Enhanced Climate Time Series API
 * Provides functions to fetch, process, and manage time series data
 */

import { useState, useCallback, useRef } from 'react';
import axios, { AxiosInstance, CancelTokenSource } from 'axios';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export enum AnalysisModel {
  RAW = 'raw',
  MOVING_AVG = 'moving-avg',
  TREND = 'trend',
  ANOMALY = 'anomaly',
  SEASONAL = 'seasonal',
  CUMULATIVE = 'cumulative',
  DERIVATIVE = 'derivative'
}

export enum ChartType {
  LINE = 'line',
  BAR = 'bar',
  AREA = 'area',
  SCATTER = 'scatter',
  HEATMAP = 'heatmap'
}

export enum AggregationMethod {
  MEAN = 'mean',
  MAX = 'max',
  MIN = 'min',
  SUM = 'sum',
  MEDIAN = 'median',
  STD = 'std'
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

export interface TimeSeriesResponse {
  data: DataPoint[];
  metadata?: Record<string, DatasetMetadata>;
  statistics?: Record<string, Statistics>;
  chartConfig?: ChartConfig;
  processingInfo: {
    processingTime: string;
    totalPoints: number;
    datasetsProcessed: number;
    dateRange: {
      start: string | null;
      end: string | null;
    };
    analysisModel: string;
    aggregation: string;
  };
}

export interface DatasetInfo {
  id: string;
  name: string;
  source: string;
  type: string;
  stored: 'local' | 'cloud';
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
  data: DataPoint[];
  metadata: Record<string, DatasetMetadata> | null;
  statistics: Record<string, Statistics> | null;
  chartConfig: ChartConfig | null;
  processingInfo: TimeSeriesResponse['processingInfo'] | null;
  availableDatasets: DatasetInfo[];
  
  // State
  isLoading: boolean;
  error: string | null;
  progress: number;
  
  // Methods
  extractTimeSeries: (request: TimeSeriesRequest) => Promise<void>;
  listDatasets: (filters?: {
    stored?: 'local' | 'cloud' | 'all';
    source?: string;
    search?: string;
  }) => Promise<void>;
  exportData: (format: 'csv' | 'json' | 'netcdf' | 'parquet') => Promise<Blob>;
  cancelRequest: () => void;
  clearCache: () => Promise<void>;
  reset: () => void;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useTimeSeriesAPI(
  baseURL: string = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'
): UseTimeSeriesAPI {
  // State
  const [data, setData] = useState<DataPoint[]>([]);
  const [metadata, setMetadata] = useState<Record<string, DatasetMetadata> | null>(null);
  const [statistics, setStatistics] = useState<Record<string, Statistics> | null>(null);
  const [chartConfig, setChartConfig] = useState<ChartConfig | null>(null);
  const [processingInfo, setProcessingInfo] = useState<TimeSeriesResponse['processingInfo'] | null>(null);
  const [availableDatasets, setAvailableDatasets] = useState<DatasetInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  
  // Refs
  const cancelTokenRef = useRef<CancelTokenSource | null>(null);
  const apiClientRef = useRef<AxiosInstance | null>(null);
  
  // Initialize API client
  if (!apiClientRef.current) {
    apiClientRef.current = axios.create({
      baseURL,
      timeout: 60000, // 60 second timeout for large datasets
      headers: {
        'Content-Type': 'application/json',
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
      }
    );
  }
  
  // Extract time series data
  const extractTimeSeries = useCallback(async (request: TimeSeriesRequest) => {
    setIsLoading(true);
    setError(null);
    setProgress(0);
    
    // Cancel any pending request
    if (cancelTokenRef.current) {
      cancelTokenRef.current.cancel('New request initiated');
    }
    
    // Create new cancel token
    cancelTokenRef.current = axios.CancelToken.source();
    
    try {
      setProgress(20);
      
      const response = await apiClientRef.current!.post<TimeSeriesResponse>(
        '/api/v2/timeseries/extract',
        request,
        {
          cancelToken: cancelTokenRef.current.token,
          onDownloadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percentCompleted = Math.round(
                (progressEvent.loaded * 80) / progressEvent.total
              ) + 20;
              setProgress(percentCompleted);
            }
          },
        }
      );
      
      // Update state with response data
      setData(response.data.data);
      setMetadata(response.data.metadata || null);
      setStatistics(response.data.statistics || null);
      setChartConfig(response.data.chartConfig || null);
      setProcessingInfo(response.data.processingInfo);
      
      setProgress(100);
    } catch (err) {
      if (axios.isCancel(err)) {
        console.log('Request cancelled:', err.message);
      } else if (axios.isAxiosError(err)) {
        const errorMessage = err.response?.data?.detail || err.message;
        setError(`Failed to extract time series: ${errorMessage}`);
        console.error('API Error:', err.response?.data);
      } else {
        setError('An unexpected error occurred');
        console.error('Unexpected error:', err);
      }
    } finally {
      setIsLoading(false);
      setTimeout(() => setProgress(0), 1000);
    }
  }, []);
  
  // List available datasets
  const listDatasets = useCallback(async (filters?: {
    stored?: 'local' | 'cloud' | 'all';
    source?: string;
    search?: string;
  }) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (filters?.stored) params.append('stored', filters.stored);
      if (filters?.source) params.append('source', filters.source);
      if (filters?.search) params.append('search', filters.search);
      
      const response = await apiClientRef.current!.get<DatasetListResponse>(
        `/api/v2/timeseries/datasets?${params.toString()}`
      );
      
      setAvailableDatasets(response.data.datasets);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(`Failed to list datasets: ${err.response?.data?.detail || err.message}`);
      } else {
        setError('Failed to list datasets');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Export data in various formats
  const exportData = useCallback(async (
    format: 'csv' | 'json' | 'netcdf' | 'parquet'
  ): Promise<Blob> => {
    if (!data.length) {
      throw new Error('No data to export');
    }
    
    try {
      // For now, implement client-side CSV and JSON export
      // NetCDF and Parquet would require server-side implementation
      
      if (format === 'csv') {
        // Convert data to CSV
        const headers = ['Date', ...Object.keys(data[0].values)];
        const rows = data.map(point => [
          point.date,
          ...Object.values(point.values).map(v => v?.toString() || '')
        ]);
        
        const csvContent = [
          headers.join(','),
          ...rows.map(row => row.join(','))
        ].join('\n');
        
        return new Blob([csvContent], { type: 'text/csv' });
        
      } else if (format === 'json') {
        // Export as JSON
        const exportData = {
          data,
          metadata,
          statistics,
          processingInfo
        };
        
        return new Blob([JSON.stringify(exportData, null, 2)], { 
          type: 'application/json' 
        });
        
      } else {
        // For netcdf and parquet, call server endpoint
        const params = new URLSearchParams({
          dataset_ids: (metadata ? Object.keys(metadata) : []).join(','),
          start_date: data[0].date,
          end_date: data[data.length - 1].date
        });
        
        const response = await apiClientRef.current!.get(
          `/api/v2/timeseries/export/${format}?${params.toString()}`,
          { responseType: 'blob' }
        );
        
        return response.data;
      }
    } catch (err) {
      console.error('Export error:', err);
      throw new Error(`Failed to export data as ${format}`);
    }
  }, [data, metadata, statistics, processingInfo]);
  
  // Cancel pending request
  const cancelRequest = useCallback(() => {
    if (cancelTokenRef.current) {
      cancelTokenRef.current.cancel('Request cancelled by user');
      cancelTokenRef.current = null;
    }
    setIsLoading(false);
    setProgress(0);
  }, []);
  
  // Clear server cache
  const clearCache = useCallback(async () => {
    try {
      await apiClientRef.current!.post('/api/v2/cache/clear');
    } catch (err) {
      console.error('Failed to clear cache:', err);
    }
  }, []);
  
  // Reset all state
  const reset = useCallback(() => {
    setData([]);
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
    data,
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

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format date for API request
 */
export function formatDateForAPI(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Parse API date string
 */
export function parseAPIDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

/**
 * Generate download filename with timestamp
 */
export function generateFilename(prefix: string, extension: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}_${timestamp}.${extension}`;
}

/**
 * Download blob as file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
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
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}