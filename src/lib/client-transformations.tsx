/**
 * Client-side data transformations for time series data
 * These operations are applied in the browser to avoid unnecessary API calls
 */

import { AggregationMethod } from "@/hooks/use-timeseries";

export interface TransformOptions {
  normalize?: boolean;
  smoothingWindow?: number;
  resampleFreq?: string;
  aggregation?: AggregationMethod;
}

/**
 * Normalize data using min-max normalization (0-1 range)
 */
export function normalizeData(data: any[], datasetIds: string[]): any[] {
  if (data.length === 0) return data;

  const normalizedData = [...data];

  datasetIds.forEach((datasetId) => {
    // Find min and max for this dataset
    let min = Infinity;
    let max = -Infinity;

    data.forEach((point) => {
      const value = point[datasetId];
      if (typeof value === "number" && !isNaN(value) && value !== null) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    });

    // Normalize if we have valid min/max
    if (min !== Infinity && max !== -Infinity && max !== min) {
      normalizedData.forEach((point, idx) => {
        const value = point[datasetId];
        if (typeof value === "number" && !isNaN(value) && value !== null) {
          point[datasetId] = (value - min) / (max - min);
        }
      });
    }
  });

  return normalizedData;
}

/**
 * Apply moving average smoothing
 */
export function applySmoothingWindow(
  data: any[],
  datasetIds: string[],
  window: number,
): any[] {
  if (data.length === 0 || window <= 1) return data;

  const smoothedData = data.map((point) => ({ ...point }));

  datasetIds.forEach((datasetId) => {
    const values: number[] = [];

    // Extract values for this dataset
    data.forEach((point) => {
      const value = point[datasetId];
      if (typeof value === "number" && !isNaN(value) && value !== null) {
        values.push(value);
      } else {
        values.push(NaN);
      }
    });

    // Apply moving average
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(values.length, i + Math.ceil(window / 2));

      const windowValues = values.slice(start, end).filter((v) => !isNaN(v));

      if (windowValues.length > 0) {
        const avg =
          windowValues.reduce((sum, v) => sum + v, 0) / windowValues.length;
        smoothedData[i][datasetId] = avg;
      }
    }
  });

  return smoothedData;
}

/**
 * Resample data to a different frequency
 */
export function resampleData(
  data: any[],
  datasetIds: string[],
  frequency: string,
  aggregation: AggregationMethod = AggregationMethod.MEAN,
): any[] {
  if (data.length === 0 || !frequency || frequency === "none") return data;

  // Parse dates and group by resampling period
  const groups = new Map<string, any[]>();

  data.forEach((point) => {
    const date = new Date(point.date);
    let groupKey: string;

    switch (frequency) {
      case "D": // Daily
        groupKey = date.toISOString().split("T")[0];
        break;
      case "W": // Weekly (Monday-Sunday)
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay() + 1);
        groupKey = weekStart.toISOString().split("T")[0];
        break;
      case "M": // Monthly
        groupKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        break;
      case "Q": // Quarterly
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        groupKey = `${date.getFullYear()}-Q${quarter}`;
        break;
      case "Y": // Yearly
        groupKey = String(date.getFullYear());
        break;
      default:
        groupKey = point.date;
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(point);
  });

  // Aggregate each group
  const resampledData: any[] = [];

  groups.forEach((points, groupKey) => {
    const aggregatedPoint: any = { date: groupKey };

    datasetIds.forEach((datasetId) => {
      const values = points
        .map((p) => p[datasetId])
        .filter((v) => typeof v === "number" && !isNaN(v) && v !== null);

      if (values.length === 0) {
        aggregatedPoint[datasetId] = null;
        return;
      }

      switch (aggregation) {
        case AggregationMethod.MEAN:
          aggregatedPoint[datasetId] =
            values.reduce((sum, v) => sum + v, 0) / values.length;
          break;
        case AggregationMethod.MAX:
          aggregatedPoint[datasetId] = Math.max(...values);
          break;
        case AggregationMethod.MIN:
          aggregatedPoint[datasetId] = Math.min(...values);
          break;
        case AggregationMethod.SUM:
          aggregatedPoint[datasetId] = values.reduce((sum, v) => sum + v, 0);
          break;
        case AggregationMethod.MEDIAN:
          const sorted = [...values].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          aggregatedPoint[datasetId] =
            sorted.length % 2 === 0
              ? (sorted[mid - 1] + sorted[mid]) / 2
              : sorted[mid];
          break;
        case AggregationMethod.STD:
          const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
          const variance =
            values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
            values.length;
          aggregatedPoint[datasetId] = Math.sqrt(variance);
          break;
        default:
          aggregatedPoint[datasetId] =
            values.reduce((sum, v) => sum + v, 0) / values.length;
      }
    });

    resampledData.push(aggregatedPoint);
  });

  // Sort by date
  return resampledData.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Apply all transformations in the correct order
 */
export function applyTransformations(
  data: any[],
  datasetIds: string[],
  options: TransformOptions,
): any[] {
  let transformedData = [...data];

  // 1. Resample first (if needed)
  if (options.resampleFreq && options.resampleFreq !== "none") {
    transformedData = resampleData(
      transformedData,
      datasetIds,
      options.resampleFreq,
      options.aggregation || AggregationMethod.MEAN,
    );
  }

  // 2. Apply smoothing (if needed)
  if (options.smoothingWindow && options.smoothingWindow > 1) {
    transformedData = applySmoothingWindow(
      transformedData,
      datasetIds,
      options.smoothingWindow,
    );
  }

  // 3. Normalize last (if needed)
  if (options.normalize) {
    transformedData = normalizeData(transformedData, datasetIds);
  }

  return transformedData;
}
