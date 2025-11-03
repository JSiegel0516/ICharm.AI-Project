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
}: UseRasterLayerOptions): UseRasterLayerResult => {
  const [data, setData] = useState<RasterLayerData | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const backendDatasetId = useMemo(() => {
    if (!dataset) {
      return null;
    }
    return (
      dataset.backend?.id ??
      dataset.backendId ??
      dataset.backend?.slug ??
      dataset.backendSlug ??
      dataset.id
    );
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

  const requestKey = useMemo(() => {
    const dateKey = formatDateForApi(date);
    if (!backendDatasetId || !dateKey) {
      return undefined;
    }
    const colorKey = cssColors ? cssColors.join("|") : "default";
    return `${backendDatasetId}::${dateKey}::${level ?? "surface"}::${colorKey}`;
  }, [backendDatasetId, date, level, cssColors]);

  useEffect(() => {
    if (!backendDatasetId || !date) {
      setData(undefined);
      setError(null);
      setIsLoading(false);
      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
      return;
    }

    const run = async () => {
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
      const controller = new AbortController();
      controllerRef.current = controller;
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/raster/visualize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            datasetId: backendDatasetId,
            date: formatDateForApi(date),
            level: level ?? undefined,
            cssColors,
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
        const textures: RasterLayerTexture[] = Array.isArray(payload?.textures)
          ? payload.textures
          : [];

        const rows = Number(payload?.shape?.[0]) || 0;
        const cols = Number(payload?.shape?.[1]) || 0;
        const values = decodeFloat32(payload?.values);
        const latArray = Float64Array.from(payload?.lat ?? []);
        const lonArray = Float64Array.from(payload?.lon ?? []);

        const sampler = buildSampler(latArray, lonArray, values, rows, cols);

        setData({
          textures,
          units: payload?.units ?? dataset.units,
          min: payload?.valueRange?.min ?? payload?.actualRange?.min,
          max: payload?.valueRange?.max ?? payload?.actualRange?.max,
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
      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
    };
  }, [backendDatasetId, dataset?.units, date, level]);

  return { data, isLoading, error, requestKey };
};
