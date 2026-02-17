import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset } from "@/types";
import {
  formatDateForApi,
  resolveEffectiveColorbarRange,
} from "@/lib/mesh/rasterUtils";
import { buildRasterImage } from "@/lib/mesh/rasterImage";
import { fetchRasterGrid } from "@/hooks/useRasterGrid";
import { prepareRasterMeshGrid } from "@/lib/mesh/rasterMesh";

export type RasterLayerTexture = {
  imageUrl: string;
  rectangle: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
};

export type RasterLayerData = {
  textures: RasterLayerTexture[];
  units?: string;
  min?: number;
  max?: number;
  sampleValue: (latitude: number, longitude: number) => number | null;
};

const downsampleGridForTexture = (args: {
  lat: Float64Array;
  lon: Float64Array;
  values: Float32Array;
  mask?: Uint8Array;
  maxSize?: number;
}): {
  lat: Float64Array;
  lon: Float64Array;
  values: Float32Array;
  mask?: Uint8Array;
} => {
  const { lat, lon, values, mask, maxSize = 2048 } = args;
  const rows = lat.length;
  const cols = lon.length;
  if (!rows || !cols || !values.length) {
    return { lat, lon, values, mask };
  }
  if (rows <= maxSize && cols <= maxSize) {
    return { lat, lon, values, mask };
  }

  const rowStep = Math.ceil(rows / maxSize);
  const colStep = Math.ceil(cols / maxSize);
  const outRows = Math.max(1, Math.ceil(rows / rowStep));
  const outCols = Math.max(1, Math.ceil(cols / colStep));

  const outLat = new Float64Array(outRows);
  const outLon = new Float64Array(outCols);
  const outValues = new Float32Array(outRows * outCols);
  const outMask = mask ? new Uint8Array(outRows * outCols) : undefined;

  for (let r = 0; r < outRows; r += 1) {
    const srcRow = Math.min(rows - 1, r * rowStep);
    outLat[r] = lat[srcRow];
  }
  for (let c = 0; c < outCols; c += 1) {
    const srcCol = Math.min(cols - 1, c * colStep);
    outLon[c] = lon[srcCol];
  }

  for (let r = 0; r < outRows; r += 1) {
    const srcRow = Math.min(rows - 1, r * rowStep);
    for (let c = 0; c < outCols; c += 1) {
      const srcCol = Math.min(cols - 1, c * colStep);
      const srcIdx = srcRow * cols + srcCol;
      const dstIdx = r * outCols + c;
      outValues[dstIdx] = values[srcIdx];
      if (outMask && mask) {
        outMask[dstIdx] = mask[srcIdx];
      }
    }
  }

  return {
    lat: outLat,
    lon: outLon,
    values: outValues,
    mask: outMask,
  };
};

const buildCellAveragedGrid = (args: {
  lat: Float64Array;
  lon: Float64Array;
  values: Float32Array;
  mask?: Uint8Array;
}): {
  lat: Float64Array;
  lon: Float64Array;
  values: Float32Array;
  mask?: Uint8Array;
} => {
  const { lat, lon, values, mask } = args;
  const rows = lat.length;
  const cols = lon.length;
  if (rows < 2 || cols < 2 || values.length < rows * cols) {
    return { lat, lon, values, mask };
  }

  const outRows = rows - 1;
  const outCols = cols - 1;
  const outLat = new Float64Array(outRows);
  const outLon = new Float64Array(outCols);
  const outValues = new Float32Array(outRows * outCols);
  const outMask = mask ? new Uint8Array(outRows * outCols) : undefined;

  for (let r = 0; r < outRows; r += 1) {
    outLat[r] = (lat[r] + lat[r + 1]) / 2;
  }
  for (let c = 0; c < outCols; c += 1) {
    outLon[c] = (lon[c] + lon[c + 1]) / 2;
  }

  for (let r = 0; r < outRows; r += 1) {
    for (let c = 0; c < outCols; c += 1) {
      const i0 = r * cols + c;
      const i1 = i0 + 1;
      const i2 = i0 + cols;
      const i3 = i2 + 1;
      let sum = 0;
      let count = 0;
      const idxs = [i0, i1, i2, i3];
      for (const idx of idxs) {
        if (mask && mask[idx] === 0) continue;
        const value = values[idx];
        if (!Number.isFinite(value)) continue;
        sum += value;
        count += 1;
      }
      const outIdx = r * outCols + c;
      if (count > 0) {
        outValues[outIdx] = sum / count;
        if (outMask) outMask[outIdx] = 1;
      } else {
        outValues[outIdx] = Number.NaN;
        if (outMask) outMask[outIdx] = 0;
      }
    }
  }

  return { lat: outLat, lon: outLon, values: outValues, mask: outMask };
};

type UseRasterLayerOptions = {
  dataset?: Dataset;
  date?: Date;
  level?: number | null;
  maskZeroValues?: boolean;
  smoothGridBoxValues?: boolean;
  clientRasterize?: boolean;
  colorbarRange?: {
    enabled?: boolean;
    min?: number | null;
    max?: number | null;
  };
  prefetchedData?:
    | Map<string, RasterLayerData>
    | Record<string, RasterLayerData>;
};

export type UseRasterLayerResult = {
  data?: RasterLayerData;
  isLoading: boolean;
  error: string | null;
  requestKey?: string;
};

// ============================================================================
// Request Key Builder
// ============================================================================

export const buildRasterRequestKey = (args: {
  dataset?: Dataset;
  backendDatasetId?: string | null;
  date?: Date;
  level?: number | null;
  cssColors?: string[];
  maskZeroValues?: boolean;
  smoothGridBoxValues?: boolean;
  clientRasterize?: boolean;
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

  const colorKey =
    args.cssColors && args.cssColors.length
      ? args.cssColors.join("|")
      : "default";
  const maskKey = args.maskZeroValues ? "mask" : "nomask";
  const smoothKey = args.smoothGridBoxValues === false ? "blocky" : "smooth";
  const rasterizeKey = args.clientRasterize ? "client" : "server";
  const customRangeKey = args.colorbarRange?.enabled
    ? `range-${Number.isFinite(args.colorbarRange?.min as number) ? args.colorbarRange?.min : "auto"}-${Number.isFinite(args.colorbarRange?.max as number) ? args.colorbarRange?.max : "auto"}`
    : "norange";

  return `${datasetId}::${dateKey}::${args.level ?? "surface"}::${colorKey}::${maskKey}::${smoothKey}::${rasterizeKey}::${customRangeKey}`;
};

// ============================================================================
// Fetch Function
// ============================================================================

export async function fetchRasterVisualization(options: {
  dataset?: Dataset;
  backendDatasetId?: string | null;
  date?: Date;
  level?: number | null;
  cssColors?: string[];
  maskZeroValues?: boolean;
  smoothGridBoxValues?: boolean;
  clientRasterize?: boolean;
  colorbarRange?: {
    enabled?: boolean;
    min?: number | null;
    max?: number | null;
  };
  signal?: AbortSignal;
}): Promise<RasterLayerData> {
  const {
    dataset,
    backendDatasetId,
    date,
    level,
    cssColors,
    maskZeroValues,
    smoothGridBoxValues,
    colorbarRange,
    signal,
  } = options;

  const targetDatasetId = backendDatasetId ?? dataset?.id ?? dataset?.slug;
  const dateKey = formatDateForApi(date);

  if (!targetDatasetId || !dateKey) {
    throw new Error("Missing dataset or date for raster request");
  }

  const grid = await fetchRasterGrid({
    dataset,
    backendDatasetId: targetDatasetId,
    date,
    level,
    maskZeroValues,
    colorbarRange,
    signal,
  });
  const colors = cssColors?.length
    ? cssColors
    : (dataset?.colorScale?.colors ?? []);
  const min = grid.min ?? 0;
  const max = grid.max ?? 1;
  const gridValues =
    grid.values instanceof Float32Array
      ? grid.values
      : Float32Array.from(grid.values as Float64Array);
  const midIdx = Math.floor(gridValues.length / 2);
  const midSample = Number.isFinite(gridValues[midIdx])
    ? gridValues[midIdx]
    : null;
  console.debug("[RasterLayer] ranges", {
    datasetId: targetDatasetId,
    min,
    max,
    colors: colors.length,
    midSample,
  });
  const prepared = prepareRasterMeshGrid({
    lat: grid.lat,
    lon: grid.lon,
    values: gridValues,
    mask: grid.mask,
    smoothValues: false,
    flatShading: smoothGridBoxValues === false,
    sampleStep: 1,
    wrapSeam: true,
  });

  const preparedValues =
    prepared.values instanceof Float32Array
      ? prepared.values
      : Float32Array.from(prepared.values as Float64Array);

  const baseGrid =
    smoothGridBoxValues === false
      ? buildCellAveragedGrid({
          lat: prepared.lat,
          lon: prepared.lon,
          values: preparedValues,
          mask: prepared.mask,
        })
      : {
          lat: prepared.lat,
          lon: prepared.lon,
          values: preparedValues,
          mask: prepared.mask,
        };

  const textureGrid = downsampleGridForTexture({
    lat: baseGrid.lat,
    lon: baseGrid.lon,
    values: baseGrid.values,
    mask: baseGrid.mask,
    maxSize: 2048,
  });
  const image = buildRasterImage({
    lat: textureGrid.lat,
    lon: textureGrid.lon,
    values: textureGrid.values,
    mask: textureGrid.mask,
    min,
    max,
    colors,
    opacity: 1,
  });

  return {
    textures: image
      ? [
          {
            imageUrl: image.dataUrl,
            rectangle: image.rectangle,
          },
        ]
      : [],
    units: grid.units ?? dataset?.units,
    min,
    max,
    sampleValue: grid.sampleValue,
  };
}

// ============================================================================
// Hook
// ============================================================================

export const useRasterLayer = ({
  dataset,
  date,
  level,
  maskZeroValues = false,
  smoothGridBoxValues,
  clientRasterize = true,
  colorbarRange,
  prefetchedData,
}: UseRasterLayerOptions): UseRasterLayerResult => {
  const [data, setData] = useState<RasterLayerData | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const backendDatasetId = useMemo(() => {
    return dataset?.id ?? dataset?.slug ?? null;
  }, [dataset]);

  const cssColors = useMemo(() => {
    const colors = dataset?.colorScale?.colors;
    if (!Array.isArray(colors)) return undefined;

    const sanitized = colors
      .map((color) => (typeof color === "string" ? color.trim() : ""))
      .filter((color) => color.length > 0);
    return sanitized.length ? sanitized : undefined;
  }, [dataset]);

  const effectiveColorbarRange = useMemo(
    () => resolveEffectiveColorbarRange(dataset, level, colorbarRange),
    [colorbarRange, dataset, level],
  );

  const requestKey = useMemo(
    () =>
      buildRasterRequestKey({
        dataset,
        backendDatasetId,
        date,
        level,
        cssColors,
        maskZeroValues,
        smoothGridBoxValues,
        clientRasterize,
        colorbarRange: effectiveColorbarRange,
      }),
    [
      dataset,
      backendDatasetId,
      date,
      level,
      cssColors,
      maskZeroValues,
      smoothGridBoxValues,
      clientRasterize,
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
    const abortOngoingRequest = () => {
      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
    };

    // Early return for invalid states
    if (!dataset?.id || !backendDatasetId || !date) {
      abortOngoingRequest();
      setData(undefined);
      setError(null);
      setIsLoading(false);
      return;
    }

    // Wait for level selection if required
    if (waitingForLevel) {
      abortOngoingRequest();
      setData(undefined);
      setError(null);
      setIsLoading(true);
      return;
    }

    // Check for prefetched data
    const prefetched =
      requestKey && prefetchedData
        ? prefetchedData instanceof Map
          ? prefetchedData.get(requestKey)
          : prefetchedData[requestKey]
        : undefined;

    if (prefetched) {
      abortOngoingRequest();
      setData(prefetched);
      setError(null);
      setIsLoading(false);
      return;
    }

    // Fetch new data
    const run = async () => {
      abortOngoingRequest();
      const controller = new AbortController();
      controllerRef.current = controller;
      setIsLoading(true);
      setError(null);

      try {
        const raster = await fetchRasterVisualization({
          dataset,
          backendDatasetId,
          date,
          level,
          cssColors,
          maskZeroValues,
          smoothGridBoxValues,
          clientRasterize,
          colorbarRange: effectiveColorbarRange,
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setData(raster);
          setIsLoading(false);
        }
      } catch (err) {
        if (controller.signal.aborted) return;

        console.error("Raster visualization error", err);
        setError(
          err instanceof Error ? err.message : "Failed to load raster layer",
        );
        setData(undefined);
        setIsLoading(false);
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      }
    };

    void run();

    return () => {
      abortOngoingRequest();
    };
  }, [
    prefetchedData,
    backendDatasetId,
    dataset,
    date,
    level,
    cssColors,
    maskZeroValues,
    smoothGridBoxValues,
    clientRasterize,
    waitingForLevel,
    effectiveColorbarRange,
    requestKey,
  ]);

  return { data, isLoading, error, requestKey };
};
