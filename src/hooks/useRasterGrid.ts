import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset } from "@/types";
import {
  formatDateForApi,
  computeValueRange,
  buildSampler,
  resolveEffectiveColorbarRange,
} from "@/lib/mesh/rasterUtils";
import {
  fetchDatasetTimestamps,
  fetchDatasetLevels,
  fetchDatasetGridboxes,
  resolveTimestampId,
  resolveLevelId,
  fetchGridboxData,
  buildGridFromPoints,
} from "@/lib/postgresRaster";

export type RasterGridData = {
  lat: Float64Array;
  lon: Float64Array;
  values: Float32Array | Float64Array;
  mask?: Uint8Array;
  units?: string;
  min?: number;
  max?: number;
  sampleValue: (latitude: number, longitude: number) => number | null;
};

type UseRasterGridOptions = {
  dataset?: Dataset;
  date?: Date;
  level?: number | null;
  maskZeroValues?: boolean;
  enabled?: boolean;
  colorbarRange?: {
    enabled?: boolean;
    min?: number | null;
    max?: number | null;
  };
  prefetchedData?: Map<string, RasterGridData> | Record<string, RasterGridData>;
};

export type UseRasterGridResult = {
  data?: RasterGridData;
  isLoading: boolean;
  error: string | null;
  requestKey?: string;
  dataKey?: string;
};

// ============================================================================
// Request Key Builder
// ============================================================================

export const buildRasterGridRequestKey = (args: {
  dataset?: Dataset;
  backendDatasetId?: string | null;
  date?: Date;
  level?: number | null;
  maskZeroValues?: boolean;
  colorbarRange?: {
    enabled?: boolean;
    min?: number | null;
    max?: number | null;
  };
}): string | undefined => {
  const datasetId = args.backendDatasetId ?? args.dataset?.id ?? null;
  const dateKey = formatDateForApi(args.date);
  if (!datasetId || !dateKey) {
    return undefined;
  }

  const maskKey = args.maskZeroValues ? "mask" : "nomask";
  const customRangeKey = args.colorbarRange?.enabled
    ? `range-${Number.isFinite(args.colorbarRange?.min as number) ? args.colorbarRange?.min : "auto"}-${Number.isFinite(args.colorbarRange?.max as number) ? args.colorbarRange?.max : "auto"}`
    : "norange";

  return `${datasetId}::${dateKey}::${args.level ?? "surface"}::${maskKey}::${customRangeKey}`;
};

// ============================================================================
// Fetch Function
// ============================================================================

export async function fetchRasterGrid(options: {
  dataset?: Dataset;
  backendDatasetId?: string | null;
  date?: Date;
  level?: number | null;
  maskZeroValues?: boolean;
  colorbarRange?: {
    enabled?: boolean;
    min?: number | null;
    max?: number | null;
  };
  signal?: AbortSignal;
}): Promise<RasterGridData> {
  const {
    dataset,
    backendDatasetId,
    date,
    level,
    maskZeroValues,
    colorbarRange,
    signal,
  } = options;

  const targetDatasetId = backendDatasetId ?? dataset?.id ?? dataset?.slug;
  const dateKey = formatDateForApi(date);

  if (!targetDatasetId || !dateKey) {
    throw new Error("Missing dataset or date for raster grid request");
  }

  const effectiveRange = resolveEffectiveColorbarRange(
    dataset,
    level,
    colorbarRange,
  );

  const targetDate = new Date(dateKey);
  const [timestamps, levels, gridboxes] = await Promise.all([
    fetchDatasetTimestamps(targetDatasetId, signal),
    fetchDatasetLevels(targetDatasetId, signal),
    fetchDatasetGridboxes(targetDatasetId, signal),
  ]);
  const timestampId = resolveTimestampId(timestamps, targetDate);
  const levelId = resolveLevelId(levels, level);
  if (timestampId == null || levelId == null) {
    throw new Error("Missing timestamp or level mapping for dataset");
  }
  const resolvedTimestamp = timestamps.find(
    (entry) => entry.id === timestampId,
  );
  const resolvedLevel = levels.find((entry) => entry.id === levelId);
  console.debug("[RasterGrid] resolved ids", {
    datasetId: targetDatasetId,
    date: dateKey,
    timestampId,
    timestampRaw: resolvedTimestamp?.raw ?? null,
    levelId,
    levelName: resolvedLevel?.name ?? null,
  });

  const gridboxPayload = await fetchGridboxData({
    datasetId: targetDatasetId,
    timestampId,
    levelId,
    signal,
  });

  const grid = buildGridFromPoints(gridboxPayload, gridboxes);
  const rows = grid.lat.length;
  const cols = grid.lon.length;
  const sampler = buildSampler(
    grid.lat,
    grid.lon,
    grid.values,
    undefined,
    rows,
    cols,
  );
  const computedRange = computeValueRange(grid.values, undefined);
  const appliedMin =
    effectiveRange?.enabled && effectiveRange?.min != null
      ? Number(effectiveRange.min)
      : computedRange.min;
  const appliedMax =
    effectiveRange?.enabled && effectiveRange?.max != null
      ? Number(effectiveRange.max)
      : computedRange.max;
  console.debug("[RasterGrid] ranges", {
    datasetId: targetDatasetId,
    computedMin: computedRange.min,
    computedMax: computedRange.max,
    appliedMin,
    appliedMax,
  });

  return {
    lat: grid.lat,
    lon: grid.lon,
    values: grid.values,
    units: dataset?.units,
    min: appliedMin ?? undefined,
    max: appliedMax ?? undefined,
    sampleValue: sampler,
  };
}

// ============================================================================
// Hook
// ============================================================================

export const useRasterGrid = ({
  dataset,
  date,
  level,
  maskZeroValues = false,
  enabled = true,
  colorbarRange,
  prefetchedData,
}: UseRasterGridOptions): UseRasterGridResult => {
  const [data, setData] = useState<RasterGridData | undefined>();
  const [dataKey, setDataKey] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const lastRequestKeyRef = useRef<string | undefined>(undefined);

  const backendDatasetId = useMemo(() => {
    return dataset?.id ?? dataset?.slug ?? null;
  }, [dataset]);

  const effectiveColorbarRange = useMemo(
    () => resolveEffectiveColorbarRange(dataset, level, colorbarRange),
    [colorbarRange, dataset, level],
  );

  const requestKey = useMemo(
    () =>
      buildRasterGridRequestKey({
        dataset,
        backendDatasetId,
        date,
        level,
        maskZeroValues,
        colorbarRange: effectiveColorbarRange,
      }),
    [
      dataset,
      backendDatasetId,
      date,
      level,
      maskZeroValues,
      effectiveColorbarRange,
    ],
  );

  const requiresExplicitLevel = useMemo(() => {
    if (!dataset) return false;

    const levelValues = dataset?.levelValues;
    if (Array.isArray(levelValues) && levelValues.length > 0) {
      return true;
    }

    const levelsText = (dataset?.levels ?? "").trim().toLowerCase();
    if (!levelsText || levelsText === "none") {
      return false;
    }

    const containsNumber = /\d/.test(levelsText);
    const mentionsVerticalAxis =
      levelsText.includes("pressure") ||
      levelsText.includes("height") ||
      levelsText.includes("altitude");

    return containsNumber || mentionsVerticalAxis;
  }, [dataset]);

  const waitingForLevel =
    requiresExplicitLevel && (level === null || level === undefined);

  useEffect(() => {
    // Early return for invalid states or disabled
    if (!enabled || !dataset?.id || !backendDatasetId || !date) {
      setData(undefined);
      setDataKey(undefined);
      setIsLoading(false);
      setError(null);
      lastRequestKeyRef.current = requestKey;
      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
      return;
    }

    // Wait for level selection if required
    if (waitingForLevel) {
      setData(undefined);
      setDataKey(undefined);
      setIsLoading(true);
      setError(null);
      lastRequestKeyRef.current = requestKey;
      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
      return;
    }

    // Clear data when request key changes
    if (requestKey && requestKey !== lastRequestKeyRef.current) {
      setData(undefined);
      setDataKey(undefined);
      lastRequestKeyRef.current = requestKey;
    }

    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }

    // Check for prefetched data
    const prefetched =
      requestKey && prefetchedData
        ? prefetchedData instanceof Map
          ? prefetchedData.get(requestKey)
          : prefetchedData[requestKey]
        : undefined;

    if (prefetched) {
      setData(prefetched);
      setDataKey(requestKey);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Fetch new data
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    setError(null);

    fetchRasterGrid({
      dataset,
      backendDatasetId,
      date,
      level,
      maskZeroValues,
      colorbarRange: effectiveColorbarRange,
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setDataKey(requestKey);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;

        const message =
          err instanceof Error ? err.message : "Failed to load grid";
        setError(message);
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [
    enabled,
    backendDatasetId,
    date,
    level,
    dataset,
    maskZeroValues,
    effectiveColorbarRange,
    waitingForLevel,
    prefetchedData,
    requestKey,
  ]);

  return {
    data,
    dataKey,
    isLoading,
    error,
    requestKey,
  };
};
