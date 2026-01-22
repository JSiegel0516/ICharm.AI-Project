import { useEffect, useMemo, useRef, useState } from "react";
import { Buffer } from "buffer";
import type { Dataset } from "@/types";

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
  colorbarRange?: {
    enabled?: boolean;
    min?: number | null;
    max?: number | null;
  };
};

export type UseRasterLayerResult = {
  data?: RasterLayerData;
  isLoading: boolean;
  error: string | null;
  requestKey?: string;
};

const formatDateForApi = (date?: Date) => {
  if (!date) {
    return null;
  }
  return date.toISOString().split("T")[0];
};

const decodeBase64 = (value?: string) => {
  if (!value) {
    return "";
  }
  if (typeof atob === "function") {
    return atob(value);
  }
  return Buffer.from(value, "base64").toString("binary");
};

const decodeFloat32 = (base64: string | undefined): Float32Array => {
  if (!base64) {
    return new Float32Array();
  }
  const binary = decodeBase64(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Float32Array(bytes.buffer);
};

const computeValueRange = (
  values: Float32Array,
): { min: number | null; max: number | null } => {
  // Some NetCDF rasters use huge sentinel values (e.g., 1e20) for missing data.
  // Ignore anything non-finite or beyond this threshold when computing the range.
  const FILL_VALUE_THRESHOLD = 1e20;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!Number.isFinite(value)) continue;
    if (Math.abs(value) >= FILL_VALUE_THRESHOLD) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  if (min === Number.POSITIVE_INFINITY || max === Number.NEGATIVE_INFINITY) {
    return { min: null, max: null };
  }

  return { min, max };
};

const deriveCustomRange = (range?: {
  enabled?: boolean;
  min?: number | null;
  max?: number | null;
}): { min: number; max: number } | null => {
  const enabled = Boolean(range?.enabled);
  if (!enabled) return null;

  const rawMin =
    typeof range?.min === "number" && Number.isFinite(range.min)
      ? Number(range.min)
      : 0;
  const rawMax =
    typeof range?.max === "number" && Number.isFinite(range.max)
      ? Number(range.max)
      : 0;

  const hasUserValue =
    (typeof range?.min === "number" && Number.isFinite(range.min)) ||
    (typeof range?.max === "number" && Number.isFinite(range.max));
  if (!hasUserValue) return null;

  const magnitude = Math.max(Math.abs(rawMin), Math.abs(rawMax));
  const safeMagnitude = magnitude > 0 ? magnitude : 1;
  return { min: -safeMagnitude, max: safeMagnitude };
};

const normalizeLon = (lon: number) => {
  if (!Number.isFinite(lon)) {
    return lon;
  }
  let value = lon;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
};

const nearestIndex = (values: ArrayLike<number>, target: number) => {
  if (!values || values.length === 0) {
    return 0;
  }
  let idx = 0;
  let minDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < values.length; i += 1) {
    const diff = Math.abs(values[i] - target);
    if (diff < minDiff) {
      minDiff = diff;
      idx = i;
    }
  }
  return idx;
};

const buildSampler = (
  latValues: Float64Array,
  lonValues: Float64Array,
  values: Float32Array,
  rows: number,
  cols: number,
) => {
  if (
    !rows ||
    !cols ||
    !values.length ||
    latValues.length === 0 ||
    lonValues.length === 0
  ) {
    return () => null;
  }

  return (latitude: number, longitude: number) => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    const latIdx = nearestIndex(latValues, latitude);
    const lonIdx = nearestIndex(lonValues, normalizeLon(longitude));
    const flatIdx = latIdx * cols + lonIdx;
    if (flatIdx < 0 || flatIdx >= values.length) {
      return null;
    }
    const sample = values[flatIdx];
    return Number.isFinite(sample) ? sample : null;
  };
};

export const useRasterLayer = ({
  dataset,
  date,
  level,
  maskZeroValues = false,
  colorbarRange,
}: UseRasterLayerOptions): UseRasterLayerResult => {
  const [data, setData] = useState<RasterLayerData | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const backendDatasetId = useMemo(() => {
    if (!dataset) {
      return null;
    }

    const candidate =
      dataset.backend?.id ??
      dataset.backendId ??
      dataset.backend?.slug ??
      dataset.backendSlug ??
      (typeof dataset.id === "string" ? dataset.id : null);

    if (!candidate) {
      return null;
    }

    const looksLikeUuid =
      candidate.length === 36 && candidate.split("-").length === 5;

    if (dataset.backend || dataset.backendId || dataset.backendSlug) {
      return candidate;
    }

    return looksLikeUuid ? candidate : null;
  }, [dataset]);

  const cssColors = useMemo(() => {
    const colors = dataset?.colorScale?.colors;
    if (!Array.isArray(colors)) {
      return undefined;
    }
    const sanitized = colors
      .map((color) => (typeof color === "string" ? color.trim() : ""))
      .filter((color) => color.length > 0);
    return sanitized.length ? sanitized : undefined;
  }, [dataset]);

  const effectiveColorbarRange = useMemo(() => {
    // Respect explicit user overrides first.
    if (colorbarRange?.enabled) {
      return colorbarRange;
    }

    const GODAS_DEFAULT_RANGE = {
      enabled: true,
      min: -0.0000005,
      max: 0.0000005,
    };

    const datasetText = [
      dataset?.id,
      dataset?.slug,
      dataset?.name,
      dataset?.description,
      dataset?.backend?.datasetName,
      dataset?.backend?.slug,
      dataset?.backend?.id,
    ]
      .filter((v) => typeof v === "string")
      .map((v) => v.toLowerCase())
      .join(" ");

    const isNoaaGlobalTemp =
      datasetText.includes("noaaglobaltemp") ||
      datasetText.includes("noaa global temp") ||
      datasetText.includes("noaa global surface temperature") ||
      datasetText.includes("noaa global surface temp") ||
      datasetText.includes("noaa global temperature");
    const isGodas =
      datasetText.includes("godas") ||
      datasetText.includes("global ocean data assimilation system") ||
      datasetText.includes("ncep global ocean data assimilation");

    if (isNoaaGlobalTemp) {
      // Force NOAA Global Surface Temperature to tight anomaly window.
      return { enabled: true, min: -2, max: 2 };
    }

    if (isGodas) {
      // Keep GODAS centered around zero with a tight default range.
      return GODAS_DEFAULT_RANGE;
    }

    return colorbarRange;
  }, [colorbarRange, dataset]);

  const requestKey = useMemo(() => {
    const dateKey = formatDateForApi(date);
    if (!backendDatasetId || !dateKey) {
      return undefined;
    }
    const colorKey = cssColors ? cssColors.join("|") : "default";
    const maskKey = maskZeroValues ? "mask" : "nomask";
    const customRangeKey = effectiveColorbarRange?.enabled
      ? `range-${Number.isFinite(effectiveColorbarRange?.min as number) ? effectiveColorbarRange?.min : "auto"}-${Number.isFinite(effectiveColorbarRange?.max as number) ? effectiveColorbarRange?.max : "auto"}`
      : "norange";
    return `${backendDatasetId}::${dateKey}::${level ?? "surface"}::${colorKey}::${maskKey}::${customRangeKey}`;
  }, [
    backendDatasetId,
    date,
    level,
    cssColors,
    maskZeroValues,
    effectiveColorbarRange,
  ]);

  const requiresExplicitLevel = useMemo(() => {
    if (!dataset?.backend) {
      return false;
    }

    const levelValues = dataset.backend.levelValues;
    if (Array.isArray(levelValues) && levelValues.length > 0) {
      return true;
    }

    const levelsText = (dataset.backend.levels ?? "").trim().toLowerCase();
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

    // Skip raster visualization for station datasets
    if (
      (dataset?.backend?.datasetType ?? dataset?.dataType ?? "")
        .toString()
        .toLowerCase() === "station"
    ) {
      setData(undefined);
      setError(null);
      setIsLoading(false);
      abortOngoingRequest();
      return () => abortOngoingRequest();
    }

    if (!backendDatasetId || !date) {
      setData(undefined);
      setError(null);
      setIsLoading(false);
      abortOngoingRequest();
      return () => abortOngoingRequest();
    }

    if (waitingForLevel) {
      abortOngoingRequest();
      setData(undefined);
      setError(null);
      setIsLoading(true);
      return () => abortOngoingRequest();
    }

    const run = async () => {
      abortOngoingRequest();
      const controller = new AbortController();
      controllerRef.current = controller;
      setIsLoading(true);
      setError(null);

      try {
        // Extract custom range values
        const customMin =
          effectiveColorbarRange?.enabled && effectiveColorbarRange?.min != null
            ? Number(effectiveColorbarRange.min)
            : null;

        const customMax =
          effectiveColorbarRange?.enabled && effectiveColorbarRange?.max != null
            ? Number(effectiveColorbarRange.max)
            : null;

        console.log("[useRasterLayer] Sending request with custom range:", {
          enabled: colorbarRange?.enabled,
          min: customMin,
          max: customMax,
        });

        const response = await fetch("/api/raster/visualize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            datasetId: backendDatasetId,
            date: formatDateForApi(date),
            level: level ?? undefined,
            cssColors,
            maskZeroValues: maskZeroValues || undefined,
            // Send custom range - use both field names for compatibility
            minValue: customMin,
            maxValue: customMax,
            min: customMin,
            max: customMax,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(
            message || `Failed to generate raster (status ${response.status})`,
          );
        }

        const payload = await response.json();

        console.log("[useRasterLayer] Response received:", {
          valueRange: payload.valueRange,
          actualRange: payload.actualRange,
          customRangeApplied: payload.processingInfo?.customRangeApplied,
        });
        const textures: RasterLayerTexture[] = Array.isArray(payload?.textures)
          ? payload.textures
          : [];

        const rows = Number(payload?.shape?.[0]) || 0;
        const cols = Number(payload?.shape?.[1]) || 0;
        const values = decodeFloat32(payload?.values);
        const latArray = Float64Array.from(payload?.lat ?? []);
        const lonArray = Float64Array.from(payload?.lon ?? []);

        const sampler = buildSampler(latArray, lonArray, values, rows, cols);
        const computedRange = computeValueRange(values);
        const fallbackMin =
          payload?.valueRange?.min ?? payload?.actualRange?.min ?? null;
        const fallbackMax =
          payload?.valueRange?.max ?? payload?.actualRange?.max ?? null;
        const appliedMin =
          effectiveColorbarRange?.enabled && effectiveColorbarRange?.min != null
            ? Number(effectiveColorbarRange.min)
            : (computedRange.min ?? fallbackMin);
        const appliedMax =
          effectiveColorbarRange?.enabled && effectiveColorbarRange?.max != null
            ? Number(effectiveColorbarRange.max)
            : (computedRange.max ?? fallbackMax);

        setData({
          textures,
          units: payload?.units ?? dataset?.units,
          // Expose the range actually used for rendering so the ColorBar stays in sync.
          min: appliedMin ?? undefined,
          max: appliedMax ?? undefined,
          sampleValue: sampler,
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return;
        }
        console.error("Raster visualization error", err);
        setError(
          err instanceof Error ? err.message : "Failed to load raster layer",
        );
        setData(undefined);
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
        setIsLoading(false);
      }
    };

    void run();

    return () => {
      abortOngoingRequest();
    };
  }, [
    backendDatasetId,
    dataset,
    date,
    level,
    cssColors,
    maskZeroValues,
    waitingForLevel,
    effectiveColorbarRange,
  ]);

  return { data, isLoading, error, requestKey };
};
