import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset } from '@/types';
import { getColormap } from '@/lib/colormaps';

interface RasterApiResponse {
  dataset: string;
  shape: [number, number];
  lat: number[];
  lon: number[];
  values: string;
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

function buildImageData(
  width: number,
  height: number,
  data: Float32Array,
  min: number | null,
  max: number | null,
  colorMapName?: string | null,
): ImageData {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const lut = getColormap(colorMapName);
  const lutLength = lut.length / 4;

  const rangeMin = Number.isFinite(min ?? NaN) ? (min as number) : null;
  const rangeMax = Number.isFinite(max ?? NaN) ? (max as number) : null;
  const denominator =
    rangeMin !== null && rangeMax !== null && rangeMax !== rangeMin
      ? rangeMax - rangeMin
      : null;

  for (let row = 0; row < height; row += 1) {
    const sourceRow = row;
    const targetRow = height - 1 - row;
    for (let col = 0; col < width; col += 1) {
      const srcIndex = sourceRow * width + col;
      const destIndex = (targetRow * width + col) * 4;
      const value = data[srcIndex];

      if (!Number.isFinite(value) || denominator === null) {
        pixels[destIndex] = 0;
        pixels[destIndex + 1] = 0;
        pixels[destIndex + 2] = 0;
        pixels[destIndex + 3] = 0;
        continue;
      }

      const normalized = clamp((value - (rangeMin as number)) / denominator, 0, 1);
      const lutIndex = Math.min(lutLength - 1, Math.round(normalized * (lutLength - 1)));
      const base = lutIndex * 4;
      pixels[destIndex] = lut[base];
      pixels[destIndex + 1] = lut[base + 1];
      pixels[destIndex + 2] = lut[base + 2];
      pixels[destIndex + 3] = lut[base + 3];
    }
  }

  return new ImageData(pixels, width, height);
}

function createTextureSlice(
  source: ImageData,
  startColumn: number,
  endColumn: number,
): { imageUrl: string; width: number; height: number } {
  const sliceWidth = endColumn - startColumn;
  const canvas = document.createElement('canvas');
  canvas.width = sliceWidth;
  canvas.height = source.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to acquire 2D context for raster rendering.');
  }
  context.imageSmoothingEnabled = false;
  context.putImageData(source, -startColumn, 0);
  return { imageUrl: canvas.toDataURL('image/png'), width: sliceWidth, height: source.height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
    if (!dataset?.backend?.supportsRaster) {
      setState({ loading: false, error: null, data: undefined });
      return () => undefined;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const backendName = dataset.backend?.datasetName ?? dataset.name;
    const startBound = parseDatasetDate(dataset.backend?.startDate ?? null);
    const endBound = parseDatasetDate(dataset.backend?.endDate ?? null);

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

    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetch('/api/raster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || `Raster request failed with ${response.status}`);
        }
        return response.json() as Promise<RasterApiResponse>;
      })
      .then((payload) => {
        const [height, width] = payload.shape;
        const values = decodeBase64ToFloat32(payload.values);

        if (values.length !== width * height) {
          throw new Error('Raster payload size mismatch.');
        }

        const min = payload.valueRange?.min ?? payload.actualRange?.min ?? null;
        const max = payload.valueRange?.max ?? payload.actualRange?.max ?? null;

        const imageData = buildImageData(
          width,
          height,
          values,
          min,
          max,
          payload.colorMap ?? dataset.backend?.colorMap ?? null,
        );

        const sampled = createSampler(payload.lat, payload.lon, values, width, height);
        const origin = payload.rectangle?.origin === 'prime_shifted' ? 'prime_shifted' : 'prime';

        const south = payload.rectangle?.south ?? Math.min(...payload.lat);
        const north = payload.rectangle?.north ?? Math.max(...payload.lat);
        const textures: RasterTextureLayer[] = [];

        const addTexture = (startCol: number, endCol: number, west: number, east: number) => {
          const slice = createTextureSlice(imageData, startCol, endCol);
          textures.push({
            imageUrl: slice.imageUrl,
            rectangle: {
              west,
              east,
              south,
              north,
            },
          });
        };

        if (origin === 'prime_shifted') {
          const splitIndex = payload.lon.findIndex((lonValue) => lonValue >= 0);
          if (splitIndex > 0 && splitIndex < width) {
            addTexture(0, splitIndex, payload.lon[0], payload.lon[splitIndex - 1]);
            addTexture(splitIndex, width, payload.lon[splitIndex], payload.lon[payload.lon.length - 1]);
          } else {
            addTexture(0, width, payload.rectangle?.west ?? payload.lon[0], payload.rectangle?.east ?? payload.lon[payload.lon.length - 1]);
          }
        } else {
          addTexture(
            0,
            width,
            payload.rectangle?.west ?? payload.lon[0],
            payload.rectangle?.east ?? payload.lon[payload.lon.length - 1],
          );
        }

        setState({
          loading: false,
          error: null,
          data: {
            datasetName: payload.dataset,
            width,
            height,
            lat: payload.lat,
            lon: payload.lon,
            values,
            min,
            max,
            units: payload.units ?? dataset.units,
            colorMap: payload.colorMap ?? dataset.backend?.colorMap ?? null,
            textures,
            sampleValue: sampled,
            origin,
          },
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
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
