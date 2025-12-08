import { ConversationContextPayload } from "@/types";

const QUERY_TIMEOUT_MS = 15000;
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

const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeoutMs = QUERY_TIMEOUT_MS,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

function extractTemporalInfo(query: string): {
  year?: number;
  month?: number;
  startDate?: string;
  endDate?: string;
} {
  const yearMatch = query.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0]) : undefined;

  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const monthMatch = months.findIndex((m) => query.toLowerCase().includes(m));
  const month = monthMatch !== -1 ? monthMatch + 1 : undefined;

  let startDate: string | undefined;
  let endDate: string | undefined;

  if (year && month) {
    startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
  } else if (year) {
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
  }

  return { year, month, startDate, endDate };
}

function isGlobalQuery(query: string): boolean {
  const lower = query.toLowerCase();
  return (
    lower.includes("global") ||
    lower.includes("world") ||
    lower.includes("earth") ||
    (lower.includes("average") && !lower.includes("at "))
  );
}

export async function fetchDatasetSnippet({
  query,
  context,
  dataServiceUrl,
}: {
  query: string;
  context: ConversationContextPayload;
  dataServiceUrl: string;
}): Promise<string | null> {
  const datasetId = context.datasetId;
  const units = context.datasetUnits ?? "dataset units";
  if (!datasetId) return null;

  const temporal = extractTemporalInfo(query);
  if (!temporal.startDate || !temporal.endDate) {
    return null;
  }

  const isGlobal = isGlobalQuery(query);
  const lat = context.location?.latitude;
  const lon = context.location?.longitude;

  let bounds: any;
  let focusCoordinates: string | undefined;

  if (isGlobal) {
    bounds = {
      lat_min: -90,
      lat_max: 90,
      lon_min: -180,
      lon_max: 180,
    };
  } else if (Number.isFinite(lat ?? NaN) && Number.isFinite(lon ?? NaN)) {
    bounds = {
      lat_min: (lat as number) - 0.5,
      lat_max: (lat as number) + 0.5,
      lon_min: (lon as number) - 0.5,
      lon_max: (lon as number) + 0.5,
    };
    focusCoordinates = `${lat},${lon}`;
  } else {
    return null;
  }

  const requestUrl = `${dataServiceUrl.replace(/\/$/, "")}/api/v2/timeseries/extract`;
  const payload: Record<string, any> = {
    datasetIds: [datasetId],
    startDate: temporal.startDate,
    endDate: temporal.endDate,
    includeStatistics: true,
    includeMetadata: false,
    analysisModel: "raw",
    aggregation: "mean",
    chartType: "line",
    spatialBounds: bounds,
  };

  if (focusCoordinates) {
    payload.focusCoordinates = focusCoordinates;
  }

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
        `Dataset query failed with ${response.status}: ${detail.slice(0, 160)}`,
      );
    }
    body = await response.json();
  } catch (error) {
    console.error("Dataset fetch failed:", error);
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

  const stats = body?.statistics?.[datasetId];
  const mean =
    typeof stats?.mean === "number"
      ? stats.mean
      : series.reduce((acc, curr) => acc + curr.value, 0) / series.length;

  const timeLabel = temporal.month
    ? `${getMonthName(temporal.month)} ${temporal.year}`
    : `${temporal.year}`;

  const scopeLabel = isGlobal
    ? "global"
    : (context.location?.name ??
      `${formatNumber(lat as number, 2)}°, ${formatNumber(lon as number, 2)}°`);

  return `For ${context.datasetName ?? datasetId}, the ${scopeLabel} average for ${timeLabel} is ${formatNumber(mean)} ${units}.`;
}

function getMonthName(month: number): string {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return months[month - 1] || "";
}

export function shouldFetchDatasetSnippet(query: string): boolean {
  const lower = query.toLowerCase();

  const hasTemporalReference = /\b(19|20)\d{2}\b/.test(query);

  const hasDataQuery =
    lower.includes("what") ||
    lower.includes("calculate") ||
    lower.includes("find") ||
    lower.includes("get") ||
    lower.includes("show");

  const hasAggregation =
    lower.includes("average") ||
    lower.includes("mean") ||
    lower.includes("total") ||
    lower.includes("temperature") ||
    lower.includes("precipitation");

  return hasTemporalReference && hasDataQuery && hasAggregation;
}
