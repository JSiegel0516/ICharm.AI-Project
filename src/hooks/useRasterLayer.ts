import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset } from "@/types";
import {
  formatDateForApi,
  resolveEffectiveColorbarRange,
} from "@/lib/mesh/rasterUtils";
import { buildRasterImageFromMesh } from "@/lib/mesh/rasterImage";
import { fetchRasterGrid } from "@/hooks/useRasterGrid";
import { prepareRasterMeshGrid, buildRasterMesh } from "@/lib/mesh/rasterMesh";
import { VERTEX_COLOR_GAIN } from "@/components/Globe/_cesium/constants";

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
  clientRasterize?: boolean;
  opacity?: number;
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
  opacity?: number;
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
  const opacityKey =
    typeof args.opacity === "number" && Number.isFinite(args.opacity)
      ? `op-${args.opacity.toFixed(3)}`
      : "op-auto";
  const customRangeKey = args.colorbarRange?.enabled
    ? `range-${Number.isFinite(args.colorbarRange?.min as number) ? args.colorbarRange?.min : "auto"}-${Number.isFinite(args.colorbarRange?.max as number) ? args.colorbarRange?.max : "auto"}`
    : "norange";

  return `${datasetId}::${dateKey}::${args.level ?? "surface"}::${colorKey}::${maskKey}::${smoothKey}::${rasterizeKey}::${opacityKey}::${customRangeKey}`;
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
  opacity?: number;
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
    opacity = 1,
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

  const mesh = buildRasterMesh({
    lat: prepared.lat,
    lon: prepared.lon,
    values: preparedValues,
    mask: prepared.mask,
    min,
    max,
    colors,
    opacity: 1,
    smoothValues: false,
    flatShading: smoothGridBoxValues === false,
    sampleStep: 1,
    wrapSeam: false,
    useTiling: false,
  });

  const applyGain = (colorsOut: Uint8Array) => {
    if (VERTEX_COLOR_GAIN === 1) return;
    for (let i = 0; i < colorsOut.length; i += 4) {
      colorsOut[i] = Math.min(
        255,
        Math.round(colorsOut[i] * VERTEX_COLOR_GAIN),
      );
      colorsOut[i + 1] = Math.min(
        255,
        Math.round(colorsOut[i + 1] * VERTEX_COLOR_GAIN),
      );
      colorsOut[i + 2] = Math.min(
        255,
        Math.round(colorsOut[i + 2] * VERTEX_COLOR_GAIN),
      );
    }
  };

  if (mesh.colors.length) {
    applyGain(mesh.colors);
  }

  const meshMidIdx = Math.floor(mesh.colors.length / 2);
  const meshMid = mesh.colors.slice(meshMidIdx, meshMidIdx + 4);
  console.debug("[RasterLayer] mesh colors", {
    datasetId: targetDatasetId,
    meshColors: mesh.colors.length,
    meshMid: Array.from(meshMid),
    flatShading: smoothGridBoxValues === false,
  });

  const image = buildRasterImageFromMesh({
    lat: prepared.lat,
    lon: prepared.lon,
    rows: prepared.rows,
    cols: prepared.cols,
    colors: mesh.colors,
    flatShading: smoothGridBoxValues === false,
  });
  console.debug("[RasterLayer] image built", {
    datasetId: targetDatasetId,
    hasImage: Boolean(image),
    urlSize: image?.dataUrl?.length ?? 0,
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
  opacity = 1,
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
        opacity,
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
      opacity,
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
          opacity,
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
    opacity,
    waitingForLevel,
    effectiveColorbarRange,
    requestKey,
  ]);

  return { data, isLoading, error, requestKey };
};
