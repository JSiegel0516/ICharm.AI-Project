import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset } from "@/types";
import {
  formatDateForApi,
  decodeNumericValues,
  computeValueRange,
  deriveCustomRange,
  buildSampler,
  resolveEffectiveColorbarRange,
} from "@/lib/mesh/rasterUtils";
import { buildRasterImage } from "@/lib/mesh/rasterImage";
import { fetchRasterGrid } from "@/hooks/useRasterGrid";
import { isPostgresDataset } from "@/lib/postgresRaster";

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

type UseRasterLayerOptions = {
  dataset?: Dataset;
  date?: Date;
  level?: number | null;
  maskZeroValues?: boolean;
  smoothGridBoxValues?: boolean;
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
  const customRangeKey = args.colorbarRange?.enabled
    ? `range-${Number.isFinite(args.colorbarRange?.min as number) ? args.colorbarRange?.min : "auto"}-${Number.isFinite(args.colorbarRange?.max as number) ? args.colorbarRange?.max : "auto"}`
    : "norange";

  return `${datasetId}::${dateKey}::${args.level ?? "surface"}::${colorKey}::${maskKey}::${smoothKey}::${customRangeKey}`;
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

  if (isPostgresDataset(dataset)) {
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
    const image = buildRasterImage({
      lat: grid.lat,
      lon: grid.lon,
      values: gridValues,
      mask: grid.mask,
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

  const effectiveRange = resolveEffectiveColorbarRange(
    dataset,
    level,
    colorbarRange,
  );
  const customRange = deriveCustomRange(effectiveRange);

  const response = await fetch("/api/raster/visualize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      datasetId: targetDatasetId,
      date: dateKey,
      level: level ?? undefined,
      cssColors,
      maskZeroValues: maskZeroValues || undefined,
      smoothGridBoxValues: smoothGridBoxValues ?? undefined,
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
      message || `Failed to generate raster (status ${response.status})`,
    );
  }

  const payload = await response.json();
  const textures: RasterLayerTexture[] = Array.isArray(payload?.textures)
    ? payload.textures
    : [];

  const rows = Number(payload?.shape?.[0]) || 0;
  const cols = Number(payload?.shape?.[1]) || 0;
  const values = decodeNumericValues(payload?.values, rows, cols);
  const latArray = Float64Array.from(payload?.lat ?? []);
  const lonArray = Float64Array.from(payload?.lon ?? []);

  const sampler = buildSampler(
    latArray,
    lonArray,
    values,
    undefined,
    rows,
    cols,
  );
  const computedRange = computeValueRange(values);
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
    textures,
    units: payload?.units ?? dataset?.units,
    min: appliedMin ?? undefined,
    max: appliedMax ?? undefined,
    sampleValue: sampler,
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
    waitingForLevel,
    effectiveColorbarRange,
    requestKey,
  ]);

  return { data, isLoading, error, requestKey };
};
