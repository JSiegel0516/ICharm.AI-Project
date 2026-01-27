import { Buffer } from "buffer";
import type { Dataset } from "@/types";

// ============================================================================
// Base64 Decoding
// ============================================================================

export const decodeBase64 = (value?: string): string => {
  if (!value) return "";
  if (typeof atob === "function") return atob(value);
  return Buffer.from(value, "base64").toString("binary");
};

export const decodeNumericValues = (
  base64: string | undefined,
  rows: number,
  cols: number,
): Float32Array | Float64Array => {
  if (!base64) return new Float32Array();

  const binary = decodeBase64(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const expected = rows > 0 && cols > 0 ? rows * cols : null;
  if (expected && len === expected * 8) {
    return new Float64Array(bytes.buffer);
  }
  if (expected && len === expected * 4) {
    return new Float32Array(bytes.buffer);
  }
  return new Float32Array(bytes.buffer);
};

export const decodeUint8 = (base64: string | undefined): Uint8Array => {
  if (!base64) return new Uint8Array();

  const binary = decodeBase64(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

// ============================================================================
// Date Formatting
// ============================================================================

export const formatDateForApi = (date?: Date): string | null => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().split("T")[0];
};

// ============================================================================
// Coordinate Utilities
// ============================================================================

export const normalizeLon = (lon: number): number => {
  if (!Number.isFinite(lon)) return lon;
  let value = lon;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
};

export const nearestIndex = (
  values: ArrayLike<number>,
  target: number,
): number => {
  if (!values || values.length === 0) return 0;

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

// ============================================================================
// Value Range Computation
// ============================================================================

export const computeValueRange = (
  values: Float32Array | Float64Array,
  mask?: Uint8Array,
): { min: number | null; max: number | null } => {
  const FILL_VALUE_THRESHOLD = 1e20;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < values.length; i += 1) {
    if (mask && mask[i] === 0) continue;
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

export const deriveCustomRange = (range?: {
  enabled?: boolean;
  min?: number | null;
  max?: number | null;
}): { min: number; max: number } | null => {
  const enabled = Boolean(range?.enabled);
  if (!enabled) return null;

  const hasMin = typeof range?.min === "number" && Number.isFinite(range.min);
  const hasMax = typeof range?.max === "number" && Number.isFinite(range.max);
  if (!hasMin && !hasMax) return null;

  let min = hasMin ? Number(range.min) : Number(range.max);
  let max = hasMax ? Number(range.max) : Number(range.min);

  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = min;
  if (min > max) [min, max] = [max, min];

  return { min, max };
};

// ============================================================================
// Sampling Function Builder
// ============================================================================

export const buildSampler = (
  latValues: Float64Array,
  lonValues: Float64Array,
  values: Float32Array | Float64Array,
  mask: Uint8Array | undefined,
  rows: number,
  cols: number,
): ((latitude: number, longitude: number) => number | null) => {
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
    if (mask && mask[flatIdx] === 0) {
      return null;
    }
    const sample = values[flatIdx];
    return Number.isFinite(sample) ? sample : null;
  };
};

// ============================================================================
// Dataset-Specific Utilities
// ============================================================================

export const getDatasetIdentifierText = (dataset?: Dataset): string => {
  return [dataset?.id, dataset?.slug, dataset?.name, dataset?.description]
    .filter((v) => typeof v === "string")
    .map((v) => v.toLowerCase())
    .join(" ");
};

export const resolveEffectiveColorbarRange = (
  dataset?: Dataset,
  level?: number | null,
  colorbarRange?: {
    enabled?: boolean;
    min?: number | null;
    max?: number | null;
  },
) => {
  if (colorbarRange?.enabled) {
    return colorbarRange;
  }

  const GODAS_DEFAULT_RANGE = {
    enabled: true,
    min: -0.0000005,
    max: 0.0000005,
  };
  const GODAS_DEEP_RANGE = {
    enabled: true,
    min: -0.0000005,
    max: 0.0000005,
  };

  const datasetText = getDatasetIdentifierText(dataset);

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
    return { enabled: true, min: -2, max: 2 };
  }

  if (isGodas) {
    const isDeepLevel =
      typeof level === "number" &&
      Number.isFinite(level) &&
      Math.abs(level - 4736) < 0.5;
    return isDeepLevel ? GODAS_DEEP_RANGE : GODAS_DEFAULT_RANGE;
  }

  return colorbarRange;
};
