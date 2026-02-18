import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset } from "@/types";
import {
  formatDateForApi,
  resolveEffectiveColorbarRange,
} from "@/lib/mesh/rasterUtils";
import { buildRasterImageFromMesh } from "@/lib/mesh/rasterImage";
import { fetchRasterGrid, type RasterGridData } from "@/hooks/useRasterGrid";
import { prepareRasterMeshGrid, buildRasterMesh } from "@/lib/mesh/rasterMesh";
import { VERTEX_COLOR_GAIN } from "@/components/Globe/_cesium/constants";
import { isOceanOnlyDataset as isOceanOnlyDatasetGuard } from "@/utils/datasetGuards";

export type RasterLayerTexture = {
  imageUrl: string;
  width?: number;
  height?: number;
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

const LAND_MASK_URL = "/_land/earth_specularmap_flat_8192x4096.jpg";
const LAND_MASK_THRESHOLD = 60;
let landMaskImagePromise: Promise<HTMLImageElement> | null = null;

const loadLandMaskImage = () => {
  if (landMaskImagePromise) return landMaskImagePromise;
  landMaskImagePromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = LAND_MASK_URL;
  });
  return landMaskImagePromise;
};

export const applyLandMask = async (args: {
  imageUrl: string;
  width?: number;
  height?: number;
  rectangle?: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
}): Promise<string> => {
  const [maskImg, rasterImg] = await Promise.all([
    loadLandMaskImage(),
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = args.imageUrl;
    }),
  ]);

  const rasterWidth = args.width ?? rasterImg.naturalWidth ?? rasterImg.width;
  const rasterHeight =
    args.height ?? rasterImg.naturalHeight ?? rasterImg.height;
  if (!rasterWidth || !rasterHeight) {
    return args.imageUrl;
  }

  const canvas = document.createElement("canvas");
  canvas.width = rasterWidth;
  canvas.height = rasterHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return args.imageUrl;
  }

  ctx.drawImage(rasterImg, 0, 0, rasterWidth, rasterHeight);
  const rasterData = ctx.getImageData(0, 0, rasterWidth, rasterHeight);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = maskImg.naturalWidth || maskImg.width;
  maskCanvas.height = maskImg.naturalHeight || maskImg.height;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) {
    return args.imageUrl;
  }
  maskCtx.drawImage(maskImg, 0, 0);
  const maskWidth = maskCanvas.width;
  const maskHeight = maskCanvas.height;
  const maskData = maskCtx.getImageData(0, 0, maskWidth, maskHeight).data;

  const out = rasterData.data;
  let masked = 0;
  let total = 0;
  const rect = args.rectangle;
  const hasRect =
    rect &&
    Number.isFinite(rect.west) &&
    Number.isFinite(rect.south) &&
    Number.isFinite(rect.east) &&
    Number.isFinite(rect.north);
  const lonSpan = hasRect ? rect.east - rect.west : 0;
  const latSpan = hasRect ? rect.north - rect.south : 0;

  for (let i = 0; i < out.length; i += 4) {
    const pixelIndex = i / 4;
    const x = pixelIndex % rasterWidth;
    const y = Math.floor(pixelIndex / rasterWidth);

    let maskX = x;
    let maskY = y;
    if (hasRect && lonSpan !== 0 && latSpan !== 0) {
      const lon = rect.west + ((x + 0.5) / rasterWidth) * lonSpan;
      const lat = rect.north - ((y + 0.5) / rasterHeight) * latSpan;
      const u = (lon + 180) / 360;
      const v = (90 - lat) / 180;
      maskX = Math.min(Math.max(Math.floor(u * maskWidth), 0), maskWidth - 1);
      maskY = Math.min(Math.max(Math.floor(v * maskHeight), 0), maskHeight - 1);
    } else {
      maskX = Math.min(Math.max(x, 0), maskWidth - 1);
      maskY = Math.min(Math.max(y, 0), maskHeight - 1);
    }

    const maskIdx = (maskY * maskWidth + maskX) * 4;
    const r = maskData[maskIdx];
    const g = maskData[maskIdx + 1];
    const b = maskData[maskIdx + 2];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    total += 1;
    if (luminance < LAND_MASK_THRESHOLD) {
      out[i + 3] = 0;
      masked += 1;
    }
  }

  ctx.putImageData(rasterData, 0, 0);
  return canvas.toDataURL("image/png");
};

type UseRasterLayerOptions = {
  dataset?: Dataset;
  date?: Date;
  level?: number | null;
  maskZeroValues?: boolean;
  smoothGridBoxValues?: boolean;
  clientRasterize?: boolean;
  opacity?: number;
  keepPreviousData?: boolean;
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
  opacity?: number;
  gridData?: RasterGridData;
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

  const isOceanOnlyDataset = isOceanOnlyDatasetGuard(dataset);

  const grid =
    options.gridData ??
    (await fetchRasterGrid({
      dataset,
      backendDatasetId: targetDatasetId,
      date,
      level,
      maskZeroValues,
      colorbarRange,
      signal,
    }));
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
  const effectiveMask = isOceanOnlyDataset ? grid.mask : undefined;

  const prepared = prepareRasterMeshGrid({
    lat: grid.lat,
    lon: grid.lon,
    values: gridValues,
    mask: effectiveMask,
    smoothValues: false,
    flatShading: smoothGridBoxValues === false,
    sampleStep: 1,
    wrapSeam: true,
  });

  const preparedValues =
    prepared.values instanceof Float32Array
      ? prepared.values
      : Float32Array.from(prepared.values as Float64Array);
  const preparedGrid = { ...prepared, values: preparedValues };

  const mesh = buildRasterMesh({
    lat: prepared.lat,
    lon: prepared.lon,
    values: preparedValues,
    mask: effectiveMask ? prepared.mask : undefined,
    preparedGrid,
    min,
    max,
    colors,
    opacity: 1,
    smoothValues: false,
    flatShading: smoothGridBoxValues === false,
    sampleStep: 1,
    wrapSeam: false,
    useTiling: false,
    maskZeroValues: maskZeroValues ?? false,
  });

  const meshMidIdx = Math.floor(mesh.colors.length / 2);
  const meshMid = mesh.colors.slice(meshMidIdx, meshMidIdx + 4);

  const image = buildRasterImageFromMesh({
    lat: prepared.lat,
    lon: prepared.lon,
    rows: prepared.rows,
    cols: prepared.cols,
    colors: mesh.colors,
    flatShading: smoothGridBoxValues === false,
    colorGain: VERTEX_COLOR_GAIN,
  });
  const maskedImage =
    image && isOceanOnlyDataset && image.width && image.height
      ? await applyLandMask({
          imageUrl: image.dataUrl,
          width: image.width,
          height: image.height,
          rectangle: image.rectangle,
        })
      : image?.dataUrl;

  return {
    textures: image
      ? [
          {
            imageUrl: maskedImage ?? image.dataUrl,
            width: image.width,
            height: image.height,
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
  keepPreviousData = false,
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

  const isOceanOnlyDataset = useMemo(
    () => isOceanOnlyDatasetGuard(dataset),
    [dataset],
  );

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
      if (!keepPreviousData) {
        setData(undefined);
      }
      setError(null);
      setIsLoading(false);
      return;
    }

    // Wait for level selection if required
    if (waitingForLevel) {
      abortOngoingRequest();
      if (!keepPreviousData) {
        setData(undefined);
      }
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
      if (isOceanOnlyDataset && prefetched.textures?.length) {
        setIsLoading(true);
        setError(null);
        Promise.all(
          prefetched.textures.map(async (texture) => {
            if (!texture?.imageUrl || !texture.rectangle) {
              return texture;
            }
            const maskedUrl = await applyLandMask({
              imageUrl: texture.imageUrl,
              width: texture.width,
              height: texture.height,
              rectangle: texture.rectangle,
            });
            return { ...texture, imageUrl: maskedUrl };
          }),
        )
          .then((textures) => {
            setData({ ...prefetched, textures });
            setIsLoading(false);
          })
          .catch(() => {
            setData(prefetched);
            setIsLoading(false);
          });
        return;
      }
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
      // Clear old imagery only when requested; otherwise keep to allow fading.
      if (!keepPreviousData) {
        setData(undefined);
      }
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
        if (!keepPreviousData) {
          setData(undefined);
        }
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
    keepPreviousData,
    waitingForLevel,
    effectiveColorbarRange,
    isOceanOnlyDataset,
    requestKey,
  ]);

  return { data, isLoading, error, requestKey };
};
