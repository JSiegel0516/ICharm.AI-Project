import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset } from '@/types';

interface RasterApiResponse {
  dataset: string;
  shape: [number, number];
  lat: number[];
  lon: number[];
  values?: string;
  dataEncoding: {
    format: string;
    dtype: string;
  };
  valueRange?: {
    min?: number | null;
    max?: number | null;
  };
  actualRange?: {
    min?: number | null;
    max?: number | null;
  };
  units?: string;
  colorMap?: string | null;
  rectangle: {
    west: number;
    south: number;
    east: number;
    north: number;
    origin?: string;
  };
  supportsRaster?: boolean;
  metadata?: Record<string, unknown>;
  textures?: RasterTextureLayer[];
  textureScale?: number | null;
}

export interface RasterTextureLayer {
  imageUrl: string;
  rectangle: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
}

export interface RasterLayerData {
  datasetName: string;
  width: number;
  height: number;
  lat: number[];
  lon: number[];
  values: Float32Array;
  min: number | null;
  max: number | null;
  units: string;
  colorMap?: string | null;
  textures: RasterTextureLayer[];
  textureScale?: number;
  sampleValue: (lat: number, lon: number) => number | null;
  origin: 'prime' | 'prime_shifted';
}

interface UseRasterLayerOptions {
  dataset?: Dataset;
  date?: Date;
  level?: number | null;
}

interface RasterLayerState {
  loading: boolean;
  error: string | null;
  data?: RasterLayerData;
}

function decodeBase64ToFloat32(encoded: string): Float32Array {
  const binary = typeof atob === 'function' ? atob(encoded) : Buffer.from(encoded, 'base64').toString('binary');
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    view[i] = binary.charCodeAt(i);
  }
  return new Float32Array(buffer);
}

function findNearestIndex(values: number[], target: number): number {
  if (values.length === 0) {
    return 0;
  }
  let low = 0;
  let high = values.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (values[mid] === target) {
      return mid;
    }
    if (values[mid] < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  if (low > 0 && Math.abs(values[low - 1] - target) < Math.abs(values[low] - target)) {
    return low - 1;
  }
  return low;
}

function createSampler(
  latitudes: number[],
  longitudes: number[],
  grid: Float32Array,
  width: number,
  height: number,
): (lat: number, lon: number) => number | null {
  const lonMin = longitudes[0] ?? 0;
  const lonMax = longitudes[longitudes.length - 1] ?? 0;

  return (lat: number, lon: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    let adjustedLon = lon;
    if (lonMax > 180 && lonMin >= 0) {
      adjustedLon = ((lon % 360) + 360) % 360;
    }

    const latIdx = clampIndex(findNearestIndex(latitudes, lat), height);
    const lonIdx = clampIndex(findNearestIndex(longitudes, adjustedLon), width);
    const value = grid[latIdx * width + lonIdx];
    return Number.isFinite(value) ? value : null;
  };
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(length - 1, index));
}

function parseDatasetDate(raw?: string | null): Date | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }
  const parts = trimmed.split(/[\/\-]/).map((segment) => segment.trim());
  if (parts.length === 3) {
    const [a, b, c] = parts;
    const normalized = `${a.padStart(4, '0')}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
    const fallback = new Date(normalized);
    if (!Number.isNaN(fallback.getTime())) {
      return fallback;
    }
  }
  return null;
}

export function useRasterLayer({ dataset, date, level }: UseRasterLayerOptions): RasterLayerState {
  const [state, setState] = useState<RasterLayerState>({
    loading: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    console.log('[useRasterLayer] Effect triggered with:', {
      datasetName: dataset?.name,
      supportsRaster: dataset?.backend?.supportsRaster,
      date: date?.toISOString(),
      level,
    });

    if (!dataset?.backend?.supportsRaster) {
      console.log('[useRasterLayer] Dataset does not support raster, skipping');
      setState({ loading: false, error: null, data: undefined });
      return () => undefined;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const backendName = dataset.backend?.datasetName ?? dataset.name;
    const startBound = parseDatasetDate(dataset.backend?.startDate ?? null);
    const endBound = parseDatasetDate(dataset.backend?.endDate ?? null);

    console.log('[useRasterLayer] Date bounds:', {
      startBound: startBound?.toISOString(),
      endBound: endBound?.toISOString(),
    });

    let targetDate: Date | null = null;
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      targetDate = new Date(date.getTime());
    } else if (endBound) {
      targetDate = new Date(endBound.getTime());
    }

    if (targetDate && startBound && targetDate < startBound) {
      targetDate = startBound;
    }
    if (targetDate && endBound && targetDate > endBound) {
      targetDate = endBound;
    }

    console.log('[useRasterLayer] Target date:', targetDate?.toISOString());

    const body: Record<string, unknown> = {
      dataset_name: backendName,
    };

    if (targetDate) {
      body.year = targetDate.getUTCFullYear();
      body.month = targetDate.getUTCMonth() + 1;
      body.day = targetDate.getUTCDate();
    }

    if (typeof level === 'number' && Number.isFinite(level)) {
      body.level = level;
    }

    if (dataset.backend?.keyVariable) {
      body.variable = dataset.backend.keyVariable;
    }

    console.log('[useRasterLayer] Fetching with body:', body);

    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetch('/api/raster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (response) => {
        console.log('[useRasterLayer] Response status:', response.status);
        if (!response.ok) {
          const message = await response.text();
          console.error('[useRasterLayer] Response error:', message);
          throw new Error(message || `Raster request failed with ${response.status}`);
        }
        return response.json() as Promise<RasterApiResponse>;
      })
      .then((payload) => {
        console.log('[useRasterLayer] Received payload:', {
          dataset: payload.dataset,
          shape: payload.shape,
          hasValues: Boolean(payload.values),
          hasTextures: Boolean(payload.textures),
          textureCount: payload.textures?.length || 0,
          units: payload.units,
          valueRange: payload.valueRange,
        });

        const [height, width] = payload.shape;
        const decodedValues =
          typeof payload.values === 'string' && payload.values.length > 0
            ? decodeBase64ToFloat32(payload.values)
            : new Float32Array(0);

        if (decodedValues.length && decodedValues.length !== width * height) {
          throw new Error('Raster payload size mismatch.');
        }

        const min = payload.valueRange?.min ?? payload.actualRange?.min ?? null;
        const max = payload.valueRange?.max ?? payload.actualRange?.max ?? null;
        const origin = payload.rectangle?.origin === 'prime_shifted' ? 'prime_shifted' : 'prime';

        const south = payload.rectangle?.south ?? Math.min(...payload.lat);
        const north = payload.rectangle?.north ?? Math.max(...payload.lat);
        const westDefault = payload.rectangle?.west ?? payload.lon[0];
        const eastDefault = payload.rectangle?.east ?? payload.lon[payload.lon.length - 1];

        const textures: RasterTextureLayer[] = Array.isArray(payload.textures)
          ? payload.textures
              .filter(
                (texture): texture is RasterTextureLayer =>
                  Boolean(texture) && typeof texture.imageUrl === 'string',
              )
              .map((texture) => ({
                imageUrl: texture.imageUrl,
                rectangle: {
                  west: texture.rectangle?.west ?? westDefault,
                  east: texture.rectangle?.east ?? eastDefault,
                  south: texture.rectangle?.south ?? south,
                  north: texture.rectangle?.north ?? north,
                },
              }))
          : [];

        console.log('[useRasterLayer] Processed textures:', textures.length);
        textures.forEach((tex, i) => {
          console.log(`[useRasterLayer] Texture ${i}:`, {
            rectangle: tex.rectangle,
            imageUrlLength: tex.imageUrl.length,
            imageUrlStart: tex.imageUrl.substring(0, 30),
          });
        });

        if (textures.length === 0) {
          console.warn('[useRasterLayer] Raster payload did not include pre-rendered textures.');
        }

        const sampler =
          decodedValues.length === width * height
            ? createSampler(payload.lat, payload.lon, decodedValues, width, height)
            : () => null;

        const rasterData: RasterLayerData = {
          datasetName: payload.dataset,
          width,
          height,
          lat: payload.lat,
          lon: payload.lon,
          values: decodedValues,
          min,
          max,
          units: payload.units ?? dataset.units,
          colorMap: payload.colorMap ?? dataset.backend?.colorMap ?? null,
          textures,
          textureScale: payload.textureScale ?? undefined,
          sampleValue: sampler,
          origin,
        };

        console.log('[useRasterLayer] Setting state with data:', {
          datasetName: rasterData.datasetName,
          textureCount: rasterData.textures.length,
          units: rasterData.units,
          min: rasterData.min,
          max: rasterData.max,
        });

        setState({
          loading: false,
          error: null,
          data: rasterData,
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          console.log('[useRasterLayer] Request aborted');
          return;
        }
        console.error('[useRasterLayer] Error:', error);
        setState({
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          data: undefined,
        });
      });

    return () => {
      controller.abort();
    };
  }, [
    dataset?.id,
    dataset?.backend?.datasetName,
    dataset?.backend?.supportsRaster,
    dataset?.backend?.startDate,
    dataset?.backend?.endDate,
    date?.getTime(),
    level,
  ]);

  return useMemo(() => state, [state]);
}