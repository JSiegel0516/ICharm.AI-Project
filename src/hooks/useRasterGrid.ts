import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset } from "@/types";
import {
  formatDateForApi,
  computeValueRange,
  buildSampler,
  resolveEffectiveColorbarRange,
  normalizeLon,
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
import { isOceanOnlyDataset as isOceanOnlyDatasetGuard } from "@/utils/datasetGuards";

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

const LAND_MASK_URL = "/_land/earth_specularmap_flat_8192x4096.jpg";
const LAND_MASK_THRESHOLD = 60;
let landMaskImagePromise: Promise<HTMLImageElement> | null = null;

const loadLandMaskImage = () => {
  if (landMaskImagePromise) return landMaskImagePromise;
  landMaskImagePromise = new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(new Error("Land mask image not available"));
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = LAND_MASK_URL;
  });
  return landMaskImagePromise;
};

const buildLandMaskForGrid = async (
  latValues: Float64Array,
  lonValues: Float64Array,
): Promise<Uint8Array | undefined> => {
  if (typeof document === "undefined") return undefined;
  const rows = latValues.length;
  const cols = lonValues.length;
  if (!rows || !cols) return undefined;
  const maskImg = await loadLandMaskImage();
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = maskImg.naturalWidth || maskImg.width;
  maskCanvas.height = maskImg.naturalHeight || maskImg.height;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return undefined;
  maskCtx.drawImage(maskImg, 0, 0);
  const maskWidth = maskCanvas.width;
  const maskHeight = maskCanvas.height;
  const maskData = maskCtx.getImageData(0, 0, maskWidth, maskHeight).data;

  const out = new Uint8Array(rows * cols);
  for (let row = 0; row < rows; row += 1) {
    const lat = latValues[row];
    const v = (90 - lat) / 180;
    const maskY = Math.min(
      Math.max(Math.floor(v * maskHeight), 0),
      maskHeight - 1,
    );
    for (let col = 0; col < cols; col += 1) {
      const lon = normalizeLon(lonValues[col]);
      const u = (lon + 180) / 360;
      const maskX = Math.min(
        Math.max(Math.floor(u * maskWidth), 0),
        maskWidth - 1,
      );
      const maskIdx = (maskY * maskWidth + maskX) * 4;
      const r = maskData[maskIdx];
      const g = maskData[maskIdx + 1];
      const b = maskData[maskIdx + 2];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      out[row * cols + col] = luminance < LAND_MASK_THRESHOLD ? 0 : 1;
    }
  }

  return out;
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
  let mask: Uint8Array | undefined;
  if (isOceanOnlyDatasetGuard(dataset)) {
    try {
      mask = await buildLandMaskForGrid(grid.lat, grid.lon);
    } catch (error) {
      console.debug("[RasterGrid] land mask unavailable", error);
    }
  }
  const sampler = buildSampler(
    grid.lat,
    grid.lon,
    grid.values,
    mask,
    rows,
    cols,
  );
  const computedRange = computeValueRange(grid.values, mask);
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
    mask,
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
