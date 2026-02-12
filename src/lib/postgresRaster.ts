import type { Dataset } from "@/types";

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
  lat: number;
  lon: number;
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

const parseTimestamp = (raw: string): Date | null => {
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;
  const normalized = raw.replace(" ", "T");
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

  const entries: GridboxEntry[] = ids.map((id, idx) => ({
    gridboxId: Number(id),
    lat: Number(lats[idx]),
    lon: Number(lons[idx]),
  }));

  gridboxCache.set(datasetId, entries);
  return entries;
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

export const buildGridFromPoints = (
  payload: GridboxDataResponse,
  gridboxes?: GridboxEntry[],
) => {
  const lats = gridboxes?.length
    ? gridboxes.map((entry) => entry.lat)
    : (payload.lat ?? []).map((v) => Number(v));
  const lons = gridboxes?.length
    ? gridboxes.map((entry) => entry.lon)
    : (payload.lon ?? []).map((v) => Number(v));
  const values = (payload.value ?? []).map((v) => Number(v));

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
  uniqueLat.forEach((lat, idx) => latIndex.set(lat, idx));
  uniqueLon.forEach((lon, idx) => lonIndex.set(lon, idx));

  for (let i = 0; i < values.length; i += 1) {
    const lat = lats[i];
    const lon = lons[i];
    const row = latIndex.get(lat);
    const col = lonIndex.get(lon);
    if (row == null || col == null) continue;
    gridValues[row * cols + col] = values[i];
  }

  return {
    lat: Float64Array.from(uniqueLat),
    lon: Float64Array.from(uniqueLon),
    values: gridValues,
  };
};
