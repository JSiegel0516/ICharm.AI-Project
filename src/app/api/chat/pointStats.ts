import { ConversationContextPayload } from "@/types";

const POINT_STATS_TIMEOUT_MS = 15000;
const POINT_BUFFER_DEG = 0.5;
const DEFAULT_WINDOW_YEARS = 50;
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

type SeriesPoint = { date: string; value: number };

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return "n/a";
  return `${parseFloat(value.toFixed(digits))}`;
};

const formatDate = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().split("T")[0] ?? value;
};

const clampDate = (value: Date, min: Date, max: Date): Date => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const computeLinearTrendPerYear = (series: SeriesPoint[]): number | null => {
  if (series.length < 2) return null;
  const times = series.map((p) => new Date(p.date).getTime());
  const values = series.map((p) => p.value);
  if (times.some((t) => Number.isNaN(t))) return null;

  const n = series.length;
  const meanT = times.reduce((a, b) => a + b, 0) / n;
  const meanV = values.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dt = times[i] - meanT;
    num += dt * (values[i] - meanV);
    den += dt * dt;
  }
  if (den === 0) return null;
  const slopePerMs = num / den;
  return slopePerMs * MS_PER_YEAR;
};

const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeoutMs = POINT_STATS_TIMEOUT_MS,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export async function fetchPointStatsSnippet({
  context,
  dataServiceUrl,
  windowYears = DEFAULT_WINDOW_YEARS,
}: {
  context: ConversationContextPayload;
  dataServiceUrl: string;
  windowYears?: number;
}): Promise<string | null> {
  const datasetId = context.datasetId;
  const units = context.datasetUnits ?? "dataset units";
  if (!datasetId) return null;

  const lat = context.location?.latitude;
  const lon = context.location?.longitude;
  if (!Number.isFinite(lat ?? NaN) || !Number.isFinite(lon ?? NaN)) {
    return null;
  }

  const coverageStart = context.datasetStartDate
    ? new Date(context.datasetStartDate)
    : null;
  const coverageEnd = context.datasetEndDate
    ? new Date(context.datasetEndDate)
    : new Date();
  const now = new Date();
  const safeCoverageEnd =
    coverageEnd && !Number.isNaN(coverageEnd.getTime()) ? coverageEnd : now;
  const safeCoverageStart =
    coverageStart && !Number.isNaN(coverageStart.getTime())
      ? coverageStart
      : new Date(safeCoverageEnd.getFullYear() - 150, 0, 1);

  const endDate = safeCoverageEnd;
  const startGuess = new Date(endDate);
  startGuess.setFullYear(endDate.getFullYear() - windowYears);
  const startDate = clampDate(startGuess, safeCoverageStart, endDate);

  const startDateStr = formatDate(startDate.toISOString());
  const endDateStr = formatDate(endDate.toISOString());

  const bounds = {
    lat_min: (lat as number) - POINT_BUFFER_DEG,
    lat_max: (lat as number) + POINT_BUFFER_DEG,
    lon_min: (lon as number) - POINT_BUFFER_DEG,
    lon_max: (lon as number) + POINT_BUFFER_DEG,
  };

  const requestUrl = `${dataServiceUrl.replace(/\/$/, "")}/api/v2/timeseries/extract`;
  const payload: Record<string, any> = {
    datasetIds: [datasetId],
    startDate: startDateStr,
    endDate: endDateStr,
    includeStatistics: true,
    includeMetadata: false,
    analysisModel: "raw",
    aggregation: "mean",
    chartType: "line",
    spatialBounds: bounds,
    focusCoordinates: `${lat},${lon}`,
  };

  let body: any;
  try {
    const response = await fetchWithTimeout(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Point stats request failed with ${response.status}: ${detail.slice(0, 160)}`,
      );
    }
    body = await response.json();
  } catch (error) {
    console.error("Point stats fetch failed:", error);
    return null;
  }

  const rawSeries = Array.isArray(body?.data) ? body.data : [];
  const series: SeriesPoint[] = rawSeries
    .map((point: any) => {
      const value = point?.values?.[datasetId];
      return typeof value === "number" ? { date: point.date, value } : null;
    })
    .filter((p: SeriesPoint | null): p is SeriesPoint => Boolean(p));

  if (!series.length) return null;

  const start = series[0];
  const end = series[series.length - 1];
  const min = series.reduce((prev, curr) =>
    curr.value < prev.value ? curr : prev,
  );
  const max = series.reduce((prev, curr) =>
    curr.value > prev.value ? curr : prev,
  );
  const stats = body?.statistics?.[datasetId];
  const mean =
    typeof stats?.mean === "number"
      ? stats.mean
      : series.reduce((acc, curr) => acc + curr.value, 0) / series.length;
  const perYearTrend =
    typeof stats?.trend === "number"
      ? stats.trend
      : computeLinearTrendPerYear(series);
  const perDecadeTrend =
    perYearTrend !== null ? perYearTrend * 10 : (stats?.trend ?? null);

  const label =
    context.location?.name ??
    `${formatNumber(lat as number, 2)}°, ${formatNumber(lon as number, 2)}°`;

  const trendText =
    perDecadeTrend !== null
      ? `trend ~${formatNumber(perDecadeTrend, 2)} ${units}/decade`
      : "trend not clear";

  return `Point stats for ${context.datasetName ?? datasetId} at ${label} (window ${startDateStr}–${endDateStr}): max ${formatNumber(max.value)} on ${formatDate(max.date)}, min ${formatNumber(min.value)} on ${formatDate(min.date)}, mean ${formatNumber(mean)}, start ${formatNumber(start.value)} on ${formatDate(start.date)}, end ${formatNumber(end.value)} on ${formatDate(end.date)}, ${trendText}.`;
}
