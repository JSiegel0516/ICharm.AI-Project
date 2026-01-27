import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset } from "@/types";
import {
  formatDateForApi,
  decodeNumericValues,
  decodeUint8,
  computeValueRange,
  deriveCustomRange,
  buildSampler,
  resolveEffectiveColorbarRange,
  getDatasetIdentifierText,
} from "@/lib/mesh/rasterUtils";

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
  const customRange = deriveCustomRange(effectiveRange);

  const response = await fetch("/api/raster/grid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      datasetId: targetDatasetId,
      date: dateKey,
      level: level ?? undefined,
      maskZeroValues: maskZeroValues || undefined,
      minValue: customRange?.min ?? null,
      maxValue: customRange?.max ?? null,
      min: customRange?.min ?? null,
      max: customRange?.max ?? null,
    }),
    signal,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      message || `Failed to generate raster grid (status ${response.status})`,
    );
  }

  const payload = await response.json();
  const rows = Number(payload?.shape?.[0]) || 0;
  const cols = Number(payload?.shape?.[1]) || 0;
  const values = decodeNumericValues(payload?.values, rows, cols);
  let mask =
    typeof payload?.mask === "string" ? decodeUint8(payload.mask) : undefined;
  const latArray = Float64Array.from(payload?.lat ?? []);
  const lonArray = Float64Array.from(payload?.lon ?? []);

  // Drop overly aggressive masks for non-ocean datasets
  const datasetText = getDatasetIdentifierText(dataset);
  const isOceanDataset =
    datasetText.includes("ocean") ||
    datasetText.includes("sea surface") ||
    datasetText.includes("sst") ||
    datasetText.includes("godas");

  if (mask && rows * cols === mask.length) {
    const validCount = mask.reduce((acc, value) => acc + (value ? 1 : 0), 0);
    const validFraction = mask.length ? validCount / mask.length : 1;
    if (!isOceanDataset && validFraction < 0.6) {
      mask = undefined;
    }
  }

  const sampler = buildSampler(latArray, lonArray, values, mask, rows, cols);
  const computedRange = computeValueRange(values, mask);
  const serverRangeMin = payload?.valueRange?.min ?? null;
  const serverRangeMax = payload?.valueRange?.max ?? null;
  const fallbackMin = payload?.actualRange?.min ?? null;
  const fallbackMax = payload?.actualRange?.max ?? null;

  const appliedMin =
    effectiveRange?.enabled && effectiveRange?.min != null
      ? Number(effectiveRange.min)
      : (serverRangeMin ?? computedRange.min ?? fallbackMin);
  const appliedMax =
    effectiveRange?.enabled && effectiveRange?.max != null
      ? Number(effectiveRange.max)
      : (serverRangeMax ?? computedRange.max ?? fallbackMax);

  return {
    lat: latArray,
    lon: lonArray,
    values,
    mask,
    units: payload?.units ?? dataset?.units,
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
