import type { Dataset } from "@/types";
import { normalizeLon } from "@/lib/mesh/rasterUtils";

type TimestampEntry = {
  id: number;
  value: Date;
  raw: string;
};

type LevelEntry = {
  id: number;
  name: string;
};

type GridboxEntry = {
  gridboxId: number;
  latId?: number;
  lonId?: number;
  lat: number;
  lon: number;
};

type TimeseriesEntry = {
  timestampId: number;
  date: Date;
  raw: string;
  value: number | null;
};

type GridboxDataResponse = {
  gridbox_id: number[];
  lat: number[];
  lon: number[];
  value: number[];
};

const timestampCache = new Map<string, TimestampEntry[]>();
const levelCache = new Map<string, LevelEntry[]>();
const gridboxCache = new Map<string, GridboxEntry[]>();

export const isPostgresDataset = (dataset?: Dataset): boolean => {
  if (!dataset) return false;
  if (dataset.stored === "postgres") return true;
  const storageType = dataset.storageType?.toLowerCase() ?? "";
  return storageType.includes("postgres");
};

const parseTimestamp = (raw: string | number | Date): Date | null => {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  if (typeof raw === "number") {
    const numeric = new Date(raw);
    if (!Number.isNaN(numeric.getTime())) return numeric;
  }
  const rawStr = String(raw);
  const direct = new Date(rawStr);
  if (!Number.isNaN(direct.getTime())) return direct;
  const normalized = rawStr.replace(" ", "T");
  const fallback = new Date(normalized);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return null;
};

export const fetchDatasetTimestamps = async (
  datasetId: string,
  signal?: AbortSignal,
): Promise<TimestampEntry[]> => {
  const cached = timestampCache.get(datasetId);
  if (cached) return cached;

  const response = await fetch(
    `/api/datasets/timestamps?datasetId=${encodeURIComponent(datasetId)}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const payload = await response.json();
  const ids: number[] = payload?.timestamp_id ?? [];
  const values: string[] =
    payload?.timestamp_value ?? payload?.timestamp_val ?? [];

  const parsed: TimestampEntry[] = ids
    .map((id, idx) => {
      const raw = String(values[idx] ?? "");
      const date = parseTimestamp(raw);
      if (!date) return null;
      return { id: Number(id), value: date, raw };
    })
    .filter((entry): entry is TimestampEntry => Boolean(entry));

  timestampCache.set(datasetId, parsed);
  return parsed;
};

export const fetchDatasetLevels = async (
  datasetId: string,
  signal?: AbortSignal,
): Promise<LevelEntry[]> => {
  const cached = levelCache.get(datasetId);
  if (cached) return cached;

  const response = await fetch(
    `/api/datasets/levels?datasetId=${encodeURIComponent(datasetId)}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const payload = await response.json();
  const ids: number[] = payload?.level_id ?? [];
  const names: string[] = payload?.name ?? [];

  const parsed: LevelEntry[] = ids.map((id, idx) => ({
    id: Number(id),
    name: String(names[idx] ?? id),
  }));

  levelCache.set(datasetId, parsed);
  return parsed;
};

export const fetchDatasetGridboxes = async (
  datasetId: string,
  signal?: AbortSignal,
): Promise<GridboxEntry[]> => {
  const cached = gridboxCache.get(datasetId);
  if (cached) return cached;

  const response = await fetch(
    `/api/datasets/gridboxes?datasetId=${encodeURIComponent(datasetId)}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const payload = await response.json();
  const ids: number[] = payload?.gridbox_id ?? [];
  const lats: number[] = payload?.lat ?? [];
  const lons: number[] = payload?.lon ?? [];
  const latIds: number[] = payload?.lat_id ?? [];
  const lonIds: number[] = payload?.lon_id ?? [];

  const entries: GridboxEntry[] = ids.map((id, idx) => ({
    gridboxId: Number(id),
    latId: Number(latIds[idx] ?? NaN),
    lonId: Number(lonIds[idx] ?? NaN),
    lat: Number(lats[idx]),
    lon: Number(lons[idx]),
  }));

  gridboxCache.set(datasetId, entries);
  return entries;
};

export const resolveGridboxId = (
  gridboxes: GridboxEntry[],
  latitude: number,
  longitude: number,
): number | null => {
  if (!gridboxes.length) return null;

  const targetLat = Number(latitude);
  const targetLon = normalizeLon(Number(longitude));
  if (!Number.isFinite(targetLat) || !Number.isFinite(targetLon)) return null;

  let best = gridboxes[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const entry of gridboxes) {
    const lat = Number(entry.lat);
    const lon = normalizeLon(Number(entry.lon));
    const latDiff = lat - targetLat;
    let lonDiff = Math.abs(lon - targetLon);
    if (lonDiff > 180) lonDiff = 360 - lonDiff;
    const score = latDiff * latDiff + lonDiff * lonDiff;
    if (score < bestScore) {
      best = entry;
      bestScore = score;
    }
  }

  return best.gridboxId;
};

export const resolveTimestampId = (
  timestamps: TimestampEntry[],
  targetDate: Date,
): number | null => {
  if (!timestamps.length) return null;
  const targetMs = targetDate.getTime();
  let best = timestamps[0];
  let bestDiff = Math.abs(best.value.getTime() - targetMs);
  for (let i = 1; i < timestamps.length; i += 1) {
    const current = timestamps[i];
    const diff = Math.abs(current.value.getTime() - targetMs);
    if (diff < bestDiff) {
      best = current;
      bestDiff = diff;
    }
  }
  return best.id;
};

export const resolveLevelId = (
  levels: LevelEntry[],
  levelValue?: number | null,
): number | null => {
  if (!levels.length) return null;
  if (levelValue == null) return levels[0].id;

  const numericLevels = levels
    .map((level) => ({
      ...level,
      numeric: Number.parseFloat(level.name),
    }))
    .filter((entry) => Number.isFinite(entry.numeric));

  if (!numericLevels.length) return levels[0].id;

  let best = numericLevels[0];
  let bestDiff = Math.abs(best.numeric - levelValue);
  for (let i = 1; i < numericLevels.length; i += 1) {
    const current = numericLevels[i];
    const diff = Math.abs(current.numeric - levelValue);
    if (diff < bestDiff) {
      best = current;
      bestDiff = diff;
    }
  }
  return best.id;
};

export const fetchGridboxData = async (args: {
  datasetId: string;
  timestampId: number;
  levelId: number;
  signal?: AbortSignal;
}): Promise<GridboxDataResponse> => {
  const { datasetId, timestampId, levelId, signal } = args;
  const response = await fetch(
    `/api/datasets/gridbox-data?datasetId=${encodeURIComponent(
      datasetId,
    )}&timestampId=${encodeURIComponent(
      String(timestampId),
    )}&levelId=${encodeURIComponent(String(levelId))}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
};

export const fetchGridboxTimeseries = async (args: {
  datasetId: string;
  gridboxId: number;
  levelId: number;
  signal?: AbortSignal;
}): Promise<TimeseriesEntry[]> => {
  const { datasetId, gridboxId, levelId, signal } = args;
  const response = await fetch(
    `/api/datasets/timeseries?datasetId=${encodeURIComponent(
      datasetId,
    )}&gridboxId=${encodeURIComponent(
      String(gridboxId),
    )}&levelId=${encodeURIComponent(String(levelId))}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const payload = await response.json();
  const ids: number[] = payload?.timestamp_id ?? [];
  const values: string[] =
    payload?.timestamp_value ?? payload?.timestamp_val ?? [];
  const dataValues: Array<number | null> = payload?.value ?? [];

  return ids
    .map((id, idx) => {
      const raw = String(values[idx] ?? "");
      const parsed = parseTimestamp(raw);
      if (!parsed) return null;
      const rawValue = dataValues[idx];
      const value =
        rawValue == null || Number.isNaN(Number(rawValue))
          ? null
          : Number(rawValue);
      return {
        timestampId: Number(id),
        date: parsed,
        raw,
        value,
      };
    })
    .filter((entry): entry is TimeseriesEntry => Boolean(entry));
};

export const buildGridFromPoints = (
  payload: GridboxDataResponse,
  gridboxes?: GridboxEntry[],
) => {
  const values = (payload.value ?? []).map((v) => Number(v));

  if (gridboxes?.length) {
    const valid = gridboxes.filter(
      (entry) =>
        Number.isFinite(entry.latId) &&
        Number.isFinite(entry.lonId) &&
        Number.isFinite(entry.lat) &&
        Number.isFinite(entry.lon),
    );

    const maxLatId = valid.reduce(
      (acc, entry) => Math.max(acc, entry.latId ?? 0),
      0,
    );
    const maxLonId = valid.reduce(
      (acc, entry) => Math.max(acc, entry.lonId ?? 0),
      0,
    );

    if (maxLatId > 0 && maxLonId > 0) {
      const rows = maxLatId;
      const cols = maxLonId;
      const gridValues = new Float32Array(rows * cols);
      for (let i = 0; i < gridValues.length; i += 1) {
        gridValues[i] = Number.NaN;
      }

      const lat = new Float64Array(rows);
      const lon = new Float64Array(cols);
      valid.forEach((entry) => {
        const row = (entry.latId ?? 1) - 1;
        const col = (entry.lonId ?? 1) - 1;
        if (row >= 0 && row < rows) lat[row] = entry.lat;
        if (col >= 0 && col < cols) lon[col] = entry.lon;
      });

      const valueCount = Math.min(values.length, valid.length);
      for (let i = 0; i < valueCount; i += 1) {
        const entry = valid[i];
        const row = (entry.latId ?? 1) - 1;
        const col = (entry.lonId ?? 1) - 1;
        if (row < 0 || row >= rows || col < 0 || col >= cols) continue;
        gridValues[row * cols + col] = values[i];
      }

      return { lat, lon, values: gridValues };
    }
  }

  const lats = (payload.lat ?? []).map((v) => Number(v));
  const lons = (payload.lon ?? []).map((v) => Number(v));
  const uniqueLat = Array.from(new Set(lats)).sort((a, b) => a - b);
  const uniqueLon = Array.from(new Set(lons)).sort((a, b) => a - b);

  const rows = uniqueLat.length;
  const cols = uniqueLon.length;
  const gridValues = new Float32Array(rows * cols);
  for (let i = 0; i < gridValues.length; i += 1) {
    gridValues[i] = Number.NaN;
  }

  const latIndex = new Map<number, number>();
  const lonIndex = new Map<number, number>();
  uniqueLat.forEach((latValue, idx) => latIndex.set(latValue, idx));
  uniqueLon.forEach((lonValue, idx) => lonIndex.set(lonValue, idx));

  for (let i = 0; i < values.length; i += 1) {
    const latValue = lats[i];
    const lonValue = lons[i];
    const row = latIndex.get(latValue);
    const col = lonIndex.get(lonValue);
    if (row == null || col == null) continue;
    gridValues[row * cols + col] = values[i];
  }

  return {
    lat: Float64Array.from(uniqueLat),
    lon: Float64Array.from(uniqueLon),
    values: gridValues,
  };
};
