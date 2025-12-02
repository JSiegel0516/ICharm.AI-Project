import { ConversationContextPayload } from "@/types";
import {
  DatasetProfile,
  describeProfile,
  findDatasetProfile,
} from "@/utils/datasetProfiles";

type QuestionIntent =
  | "trend"
  | "seasonal"
  | "forecast"
  | "lookup"
  | "spatial-compare"
  | "extreme"
  | "anomaly"
  | "why"
  | "generic";

type ResolvedLocation = {
  label: string;
  centroid?: { lat: number; lon: number };
  bbox?: { north: number; south: number; east: number; west: number };
};

type SeriesPoint = { date: string; value: number };

type DatasetQAResult =
  | { type: "none" }
  | {
      type: "summary";
      message: string;
      sources: Array<{
        id: string;
        title: string;
        category: string;
        score: number;
      }>;
    }
  | { type: "error"; message: string };

const DEFAULT_COMPARISON_LIMIT = 2;
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20000;
const LONG_WINDOW_YEARS = 35;
const HUGE_WINDOW_YEARS = 120;
const LARGE_BOUNDS_AREA_THRESHOLD = 10000;

const NAMED_LOCATIONS: ResolvedLocation[] = [
  {
    label: "san diego",
    centroid: { lat: 32.7157, lon: -117.1611 },
  },
  {
    label: "texas",
    bbox: { north: 36.5, south: 25.8, east: -93.5, west: -106.6 },
    centroid: { lat: 31.0, lon: -99.0 },
  },
  {
    label: "australia",
    bbox: { north: -10.0, south: -44.0, east: 154.0, west: 113.0 },
    centroid: { lat: -25.0, lon: 133.0 },
  },
  {
    label: "united states",
    bbox: { north: 49.4, south: 24.5, east: -66.9, west: -124.8 },
    centroid: { lat: 39.8, lon: -98.6 },
  },
  {
    label: "usa",
    bbox: { north: 49.4, south: 24.5, east: -66.9, west: -124.8 },
    centroid: { lat: 39.8, lon: -98.6 },
  },
  {
    label: "us",
    bbox: { north: 49.4, south: 24.5, east: -66.9, west: -124.8 },
    centroid: { lat: 39.8, lon: -98.6 },
  },
  {
    label: "united kingdom",
    bbox: { north: 59.0, south: 49.9, east: 2.0, west: -8.6 },
    centroid: { lat: 55.0, lon: -2.5 },
  },
  {
    label: "uk",
    bbox: { north: 59.0, south: 49.9, east: 2.0, west: -8.6 },
    centroid: { lat: 55.0, lon: -2.5 },
  },
  {
    label: "great britain",
    bbox: { north: 59.0, south: 49.9, east: 2.0, west: -8.6 },
    centroid: { lat: 55.0, lon: -2.5 },
  },
  {
    label: "europe",
    bbox: { north: 72.0, south: 35.0, east: 40.0, west: -25.0 },
    centroid: { lat: 54.0, lon: 15.0 },
  },
];

const EXTREME_KEYWORDS = ["max", "maximum", "highest", "peak", "spike"];
const TREND_KEYWORDS = ["trend", "change", "over time", "warming", "cooling"];
const COMPARE_KEYWORDS = ["compare", "vs", "versus", "between", "differs"];
const ANOMALY_KEYWORDS = ["anomaly", "anomalies", "departure", "baseline"];
const SEASONAL_KEYWORDS = [
  "seasonal",
  "seasonality",
  "season",
  "wet season",
  "dry season",
  "monsoon",
  "winter",
  "summer",
  "spring",
  "fall",
  "autumn",
  "monthly cycle",
  "annual cycle",
];
const FORECAST_KEYWORDS = [
  "forecast",
  "predict",
  "projection",
  "project",
  "future",
  "expected",
  "likely",
  "next year",
  "next season",
];
const ANALYSIS_KEYWORDS = [
  "temperature",
  "surface",
  "air temp",
  "sst",
  "precip",
  "precipitation",
  "rain",
  "snow",
  "climate",
  "wet",
  "dry",
  "trend",
  "anomaly",
  "compare",
  "correlate",
  "lag",
  "forecast",
  "predict",
  "drought",
  "heat wave",
  "heatwave",
  "cold snap",
  "monsoon",
  "enso",
  "itcz",
  "warming",
  "cooling",
  "seasonal",
  "hemisphere",
  "arctic",
  "antarctic",
  "variance",
  "standard deviation",
  "percentile",
  "median",
];
const VARIABLE_KEYWORD_GROUPS: Record<string, string[]> = {
  precipitation: [
    "precip",
    "precipitation",
    "rain",
    "rainfall",
    "snow",
    "wet season",
    "dry season",
    "monsoon",
    "drizzle",
    "mm/day",
  ],
  "surface-temperature": [
    "surface temperature",
    "land temperature",
    "skin temperature",
    "temperature",
    "warming",
    "cooling",
    "heat",
    "hotter",
    "colder",
  ],
  "air-temperature": [
    "air temperature",
    "air temp",
    "near-surface air",
    "2m air",
  ],
  sst: ["sea surface temperature", "sst", "ocean surface temp"],
  ocean: ["subsurface", "ocean heat", "ocean"],
};
const WHY_KEYWORDS = ["why", "cause", "reason", "drivers", "because"];
const DEFINITION_PREFIXES = [
  /^what is\b/i,
  /^what's\b/i,
  /^define\b/i,
  /^explain\b/i,
  /^tell me about\b/i,
  /^describe\b/i,
  /^what does .+ mean\b/i,
];
const DEFINITION_TOPICS = [
  "enso",
  "el nino",
  "la nina",
  "jet stream",
  "monsoon",
];

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

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

const yearsBetween = (startDate: string, endDate: string): number | null => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  return Math.abs(end.getTime() - start.getTime()) / MS_PER_YEAR;
};

const computeBoundsArea = (location: ResolvedLocation): number | null => {
  if (!location.bbox) return null;
  const { north, south, east, west } = location.bbox;
  const latSpan = Math.abs(north - south);
  const lonSpan = Math.abs(east - west);
  return latSpan * lonSpan;
};

const chooseResampleFrequency = (
  startDate: string,
  endDate: string,
  location: ResolvedLocation,
): string | null => {
  const years = yearsBetween(startDate, endDate);
  const area = computeBoundsArea(location);
  const needsAggressiveArea =
    typeof area === "number" && area >= LARGE_BOUNDS_AREA_THRESHOLD;

  if (years === null) return null;
  if (needsAggressiveArea || years > HUGE_WINDOW_YEARS) return "Y"; // annual
  if (years > LONG_WINDOW_YEARS) return "Q"; // quarterly
  return null;
};

const describeResample = (freq?: string | null): string => {
  if (!freq) return "";
  if (freq === "Y") return "yearly mean";
  if (freq === "Q") return "quarterly mean";
  if (freq === "M") return "monthly mean";
  return `${freq} resample`;
};

const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const parseYearsFromQuery = (
  query: string,
): { start?: number; end?: number } => {
  const matches = query.match(/\b(18|19|20|21)\d{2}\b/g);
  if (!matches || !matches.length) {
    return {};
  }
  const years = matches.map((y) => parseInt(y, 10)).sort((a, b) => a - b);
  if (years.length === 1) {
    return { start: years[0] };
  }
  return { start: years[0], end: years[years.length - 1] };
};

const parseCoordinates = (query: string): ResolvedLocation[] => {
  const regex =
    /(-?\d{1,2}(?:\.\d+)?)\s*[°,]?\s*(?:lat|latitude)?\s*,?\s*(-?\d{1,3}(?:\.\d+)?)/gi;
  const results: ResolvedLocation[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(query)) !== null) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      results.push({
        label: `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
        centroid: { lat, lon },
      });
    }
  }
  return results;
};

const findNamedLocations = (query: string): ResolvedLocation[] => {
  const normalized = query.toLowerCase();
  return NAMED_LOCATIONS.filter((loc) => normalized.includes(loc.label)).map(
    (loc) => ({
      ...loc,
      label: loc.label.charAt(0).toUpperCase() + loc.label.slice(1),
    }),
  );
};

const chooseLocations = (
  query: string,
  context: ConversationContextPayload,
): ResolvedLocation[] => {
  const coordHits = parseCoordinates(query);
  const namedHits = findNamedLocations(query);
  const combined = [...coordHits, ...namedHits];

  if (combined.length > 0) {
    return combined.slice(0, DEFAULT_COMPARISON_LIMIT);
  }

  const ctxLat = context.location?.latitude;
  const ctxLon = context.location?.longitude;
  if (Number.isFinite(ctxLat ?? NaN) && Number.isFinite(ctxLon ?? NaN)) {
    return [
      {
        label: context.location?.name ?? "Selected location",
        centroid: { lat: ctxLat as number, lon: ctxLon as number },
      },
    ];
  }

  return [];
};

const inferIntent = (query: string): QuestionIntent => {
  const normalized = query.toLowerCase();
  if (SEASONAL_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return "seasonal";
  }
  if (FORECAST_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return "forecast";
  }
  if (WHY_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return "why";
  }
  if (EXTREME_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return "extreme";
  }
  if (COMPARE_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return "spatial-compare";
  }
  if (ANOMALY_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return "anomaly";
  }
  if (TREND_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return "trend";
  }
  return "lookup";
};

export const isDefinitionQuery = (query: string): boolean => {
  if (DEFINITION_PREFIXES.some((rx) => rx.test(query))) return true;
  const normalized = query.toLowerCase();
  return DEFINITION_TOPICS.some((kw) => normalized.includes(kw));
};

const buildBoundsFromLocation = (location: ResolvedLocation) => {
  if (location.bbox) {
    return {
      lat_min: location.bbox.south,
      lat_max: location.bbox.north,
      lon_min: location.bbox.west,
      lon_max: location.bbox.east,
    };
  }
  if (location.centroid) {
    const buffer = 1;
    return {
      lat_min: location.centroid.lat - buffer,
      lat_max: location.centroid.lat + buffer,
      lon_min: location.centroid.lon - buffer,
      lon_max: location.centroid.lon + buffer,
    };
  }
  return null;
};

const looksLikeClimateAnalysis = (query: string): boolean => {
  const normalized = query.toLowerCase();
  let hits = 0;
  ANALYSIS_KEYWORDS.forEach((kw) => {
    if (normalized.includes(kw)) {
      hits += kw.includes(" ") ? 2 : 1;
    }
  });
  const hasYear = /\b(18|19|20|21)\d{2}\b/.test(normalized);
  const hasCoords = parseCoordinates(query).length > 0;
  return hits >= 2 || (hits >= 1 && (hasYear || hasCoords));
};

const inferVariablesFromQuery = (query: string): Set<string> => {
  const normalized = query.toLowerCase();
  const hits = new Set<string>();
  Object.entries(VARIABLE_KEYWORD_GROUPS).forEach(([variable, keywords]) => {
    if (keywords.some((kw) => normalized.includes(kw))) {
      hits.add(variable);
    }
  });
  return hits;
};

const isVariableAlignedWithProfile = (
  profile: DatasetProfile,
  queryVariables: Set<string>,
): boolean => {
  if (!queryVariables.size) return true;
  return profile.variables.some((v) => queryVariables.has(v));
};

const fetchSeries = async ({
  datasetId,
  profile,
  location,
  startDate,
  endDate,
  dataServiceUrl,
}: {
  datasetId: string;
  profile: DatasetProfile;
  location: ResolvedLocation;
  startDate: string;
  endDate: string;
  dataServiceUrl: string;
}): Promise<{
  series: SeriesPoint[];
  stats?: any;
  metadata?: any;
  resampleApplied?: string;
  usedFallback?: boolean;
  error?: string;
}> => {
  const payload: Record<string, any> = {
    datasetIds: [datasetId],
    startDate,
    endDate,
    includeStatistics: true,
    includeMetadata: true,
    analysisModel: "raw",
    aggregation: "mean",
    chartType: "line",
  };

  const bounds = buildBoundsFromLocation(location);
  if (bounds) {
    payload.spatialBounds = bounds;
    payload.focusCoordinates = location.centroid
      ? `${location.centroid.lat},${location.centroid.lon}`
      : undefined;
  }

  const requestUrl = `${dataServiceUrl.replace(/\/$/, "")}/api/v2/timeseries/extract`;
  const resampleFreq = chooseResampleFrequency(startDate, endDate, location);
  if (resampleFreq) {
    payload.resampleFreq = resampleFreq;
  }

  const postRequest = async (bodyPayload: Record<string, any>) => {
    const response = await fetchWithTimeout(
      requestUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      },
      FETCH_TIMEOUT_MS,
    );

    if (!response.ok) {
      const detail = await response.text();
      const error = new Error(
        `Request failed with ${response.status}: ${detail.slice(0, 200)}`,
      );
      (error as any).status = response.status;
      throw error;
    }

    return (await response.json()) as any;
  };

  let body: any;
  let resampleApplied = resampleFreq;
  let usedFallback = false;

  try {
    body = await postRequest(payload);
  } catch (error) {
    const message = (error as Error).message || "Unknown error";
    const status = (error as any)?.status as number | undefined;
    const isTimeout =
      (error as Error).name === "AbortError" ||
      /timeout|abort/i.test(message) ||
      status === 504;

    if (isTimeout && resampleFreq !== "Y") {
      const fallbackPayload = { ...payload, resampleFreq: "Y" };
      resampleApplied = "Y";
      usedFallback = true;
      try {
        body = await postRequest(fallbackPayload);
      } catch (retryError) {
        return {
          series: [],
          error: `Request timed out even after downsampling: ${(retryError as Error).message}`,
        };
      }
    } else {
      return { series: [], error: message };
    }
  }

  const rawSeries = Array.isArray(body.data) ? body.data : [];
  const parsedSeries: SeriesPoint[] = rawSeries
    .map((point) => {
      const value = point?.values?.[datasetId];
      return typeof value === "number" ? { date: point.date, value } : null;
    })
    .filter((p): p is SeriesPoint => Boolean(p));

  return {
    series: parsedSeries,
    stats: body.statistics?.[datasetId],
    metadata: body.metadata?.[datasetId],
    resampleApplied,
    usedFallback,
  };
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

const summarizeSeries = (
  series: SeriesPoint[],
  stats: any,
  locationLabel: string,
): {
  start: SeriesPoint;
  end: SeriesPoint;
  min: SeriesPoint;
  max: SeriesPoint;
  mean: number;
  perDecadeTrend: number | null;
  locationLabel: string;
} => {
  const start = series[0];
  const end = series[series.length - 1];
  const min = series.reduce((prev, curr) =>
    curr.value < prev.value ? curr : prev,
  );
  const max = series.reduce((prev, curr) =>
    curr.value > prev.value ? curr : prev,
  );
  const mean =
    stats?.mean ??
    series.reduce((acc, curr) => acc + curr.value, 0) / series.length;
  const perYearTrend =
    (stats?.trend ?? null) !== null
      ? (stats?.trend as number)
      : computeLinearTrendPerYear(series);
  const perDecadeTrend = perYearTrend !== null ? perYearTrend * 10 : null;

  return { start, end, min, max, mean, perDecadeTrend, locationLabel };
};

const computeMonthlyClimatology = (series: SeriesPoint[]): number[] => {
  const sums = Array(12).fill(0);
  const counts = Array(12).fill(0);
  series.forEach((point) => {
    const month = new Date(point.date).getUTCMonth();
    if (Number.isFinite(month)) {
      sums[month] += point.value;
      counts[month] += 1;
    }
  });
  return sums.map((sum, idx) => (counts[idx] > 0 ? sum / counts[idx] : NaN));
};

const describeMonthList = (indexes: number[]): string => {
  if (!indexes.length) return "n/a";
  return indexes.map((i) => MONTH_NAMES[i] ?? `${i + 1}`).join("/");
};

const buildSeasonalitySummary = (
  monthlyMeans: number[],
  units: string,
  locationLabel: string,
) => {
  const validMeans = monthlyMeans.filter((v) => Number.isFinite(v));
  if (validMeans.length < 2) return null;

  const maxMean = Math.max(...validMeans);
  const minMean = Math.min(...validMeans);
  const amplitude = maxMean - minMean;

  const wetMonths = monthlyMeans
    .map((v, idx) => ({ v, idx }))
    .filter(
      ({ v }) =>
        Number.isFinite(v) && maxMean - (v as number) < amplitude * 0.15,
    )
    .map(({ idx }) => idx);
  const dryMonths = monthlyMeans
    .map((v, idx) => ({ v, idx }))
    .filter(
      ({ v }) =>
        Number.isFinite(v) && (v as number) - minMean < amplitude * 0.15,
    )
    .map(({ idx }) => idx);

  const seasonStrength =
    amplitude < 0.1
      ? "weak seasonality"
      : amplitude < 1
        ? "moderate seasonality"
        : "pronounced seasonality";

  const narrative = `For ${locationLabel}, the wettest months cluster in ${describeMonthList(wetMonths)} (peaking around ${formatNumber(maxMean)} ${units}) while the driest fall in ${describeMonthList(dryMonths)} (~${formatNumber(minMean)} ${units}). The seasonal range is about ${formatNumber(amplitude)} ${units}, indicating ${seasonStrength}.`;

  return {
    locationLabel,
    amplitude,
    narrative,
  };
};

const buildStatsLine = (
  summary: ReturnType<typeof summarizeSeries>,
  units: string,
) => {
  const rangeText = `Values ranged from ${formatNumber(summary.min.value)} to ${formatNumber(summary.max.value)} ${units}`;
  const startEndText = `started at ${formatNumber(summary.start.value)} ${units} (${formatDate(summary.start.date)}) and ended at ${formatNumber(summary.end.value)} ${units} (${formatDate(summary.end.date)})`;
  const meanText = `average ${formatNumber(summary.mean)} ${units}`;
  const trendText =
    summary.perDecadeTrend !== null
      ? `linear trend ~${formatNumber(summary.perDecadeTrend, 2)} ${units}/decade`
      : "no clear linear trend";
  return `${summary.locationLabel}: ${rangeText}; ${startEndText}; ${meanText}; ${trendText}.`;
};

const buildInterpretationLine = (
  summary: ReturnType<typeof summarizeSeries>,
  units: string,
): string => {
  const change = summary.end.value - summary.start.value;
  const changeMagnitude = Math.abs(change);
  const direction =
    changeMagnitude < 0.01
      ? "has been nearly flat"
      : change > 0
        ? `has risen by roughly ${formatNumber(changeMagnitude, 2)} ${units}`
        : `has dropped by roughly ${formatNumber(changeMagnitude, 2)} ${units}`;
  const trend =
    summary.perDecadeTrend !== null
      ? `${change >= 0 ? "rising" : "falling"} about ${formatNumber(Math.abs(summary.perDecadeTrend), 2)} ${units}/decade`
      : "not clear enough to quote a per-decade trend";
  const range = summary.max.value - summary.min.value;
  const volatility =
    range > changeMagnitude * 2
      ? "variability is large compared to that drift"
      : "changes mostly follow the long-term drift";
  const timing = `peaks near ${formatDate(summary.max.date)} and lows near ${formatDate(summary.min.date)}`;

  return `For ${summary.locationLabel}, the series ${direction}. The trend is ${trend}, and ${volatility}; ${timing}.`;
};

const buildAnomalyNarrative = (
  summary: ReturnType<typeof summarizeSeries>,
  units: string,
): string => {
  const posAnomaly = summary.max.value - summary.mean;
  const negAnomaly = summary.mean - summary.min.value;
  const dominant = posAnomaly >= negAnomaly ? "positive" : "negative";
  const dominantSize = Math.max(posAnomaly, negAnomaly);
  const swing = summary.max.value - summary.min.value;
  return `For ${summary.locationLabel}, the largest ${dominant} anomaly is about ${formatNumber(dominantSize)} ${units}, with a swing of ${formatNumber(swing)} ${units} between ${formatDate(summary.min.date)} and ${formatDate(summary.max.date)}.`;
};

const buildForecastLine = (
  summary: ReturnType<typeof summarizeSeries>,
  units: string,
  horizonYears = 10,
): string => {
  if (summary.perDecadeTrend === null) {
    return `For ${summary.locationLabel}, there's no clear trend to extrapolate.`;
  }
  const perYear = summary.perDecadeTrend / 10;
  const projectedChange = perYear * horizonYears;
  const targetYear = new Date(summary.end.date).getUTCFullYear() + horizonYears;
  return `For ${summary.locationLabel}, if the recent trend holds (~${formatNumber(summary.perDecadeTrend)} ${units}/decade), expect roughly ${formatNumber(projectedChange)} ${units} change by about ${targetYear} (rough extrapolation, not a forecast).`;
};

const buildWhyExplanation = (
  summary: ReturnType<typeof summarizeSeries>,
  profile: DatasetProfile,
  windowText: string,
): string => {
  const change = summary.end.value - summary.start.value;
  const warming =
    Math.abs(change) < 0.01
      ? "little net change"
      : change > 0
        ? "net warming"
        : "net cooling";
  const volatility =
    Math.abs(summary.max.value - summary.min.value) >
    Math.abs(summary.perDecadeTrend ?? 0) * 15
      ? "big year-to-year swings"
      : "steadier year-to-year shifts";
  const anomalyNote =
    profile.valueType === "anomaly"
      ? "These are anomalies, so swings reflect departures from the 20th-century baseline."
      : "Values are absolute, so swings reflect real temperature shifts rather than baseline changes.";

  return [
    `In ${windowText} the series shows ${warming} with ${volatility}.`,
    "Rapid swings are typical when the long-term trend is modest compared to seasonal and interannual drivers like ENSO, North Atlantic variability, and regional drought/heat waves.",
    "The 1930s specifically coincide with strong land–ocean contrasts and dust-storm drought years (e.g., Dust Bowl in North America) that amplify surface temperature variability on land grids.",
    anomalyNote,
    "Measurement density was lower historically, so grid-box interpolation can exaggerate noise versus later decades.",
  ].join(" ");
};

const buildCompareNarrative = (
  a: ReturnType<typeof summarizeSeries>,
  b: ReturnType<typeof summarizeSeries>,
  units: string,
): string => {
  const meanDiff = a.mean - b.mean;
  const warmer = meanDiff > 0 ? a.locationLabel : b.locationLabel;
  const cooler = meanDiff > 0 ? b.locationLabel : a.locationLabel;
  const diffText = `${warmer} is warmer than ${cooler} by ~${formatNumber(Math.abs(meanDiff), 2)} ${units} on average in this window.`;

  const trendDiff =
    a.perDecadeTrend !== null && b.perDecadeTrend !== null
      ? a.perDecadeTrend - b.perDecadeTrend
      : null;
  const trendText =
    trendDiff !== null && Math.abs(trendDiff) > 0.01
      ? `${trendDiff > 0 ? a.locationLabel : b.locationLabel} is changing faster by ~${formatNumber(Math.abs(trendDiff), 2)} ${units}/decade.`
      : "Both show similar trend magnitudes.";

  return `${diffText}. ${trendText}`;
};

const buildLimitsLine = (
  profile: DatasetProfile,
  clipped: boolean,
  requested: { start: string; end: string },
) => {
  const coverageEnd = profile.coverage.end ?? "present";
  const coverageText = `coverage ${profile.coverage.start}–${coverageEnd}`;
  const clipText = clipped
    ? ` window clipped to dataset coverage (${requested.start}–${requested.end})`
    : "";
  const caveatText = profile.caveats.length
    ? `; caveats: ${profile.caveats.join("; ")}`
    : "";
  return `${coverageText}${clipText}${caveatText}`;
};

export async function buildDatasetQAResponse({
  query,
  context,
  dataServiceUrl,
}: {
  query: string;
  context: ConversationContextPayload;
  dataServiceUrl: string;
}): Promise<DatasetQAResult> {
  // Allow purely definitional or general-knowledge questions to fall through to the LLM pipeline
  if (isDefinitionQuery(query)) {
    return { type: "none" };
  }

  if (!looksLikeClimateAnalysis(query)) {
    return { type: "none" };
  }

  const profile = findDatasetProfile(query, context);
  const datasetId = context.datasetId ?? null;

  if (!profile) {
    return { type: "none" };
  }

  if (!datasetId) {
    return {
      type: "error",
      message:
        "I couldn’t determine which dataset ID to query. Select a dataset first, then ask your question again.",
    };
  }

  const variableHints = inferVariablesFromQuery(query);
  if (!isVariableAlignedWithProfile(profile, variableHints)) {
    const askedAbout = Array.from(variableHints).join(" / ") || "that topic";
    const offered = profile.variables.join(", ");
    return {
      type: "error",
      message: `This question is about ${askedAbout}, but the loaded dataset (${profile.name}) covers ${offered}. I’ll skip dataset analysis and rely on general knowledge instead.`,
    };
  }

  const intent = inferIntent(query);
  const wantsDetails =
    /\b(detail|details|stats|statistics|show work|full|explain|breakdown)\b/i.test(
      query,
    );
  const locations = chooseLocations(query, context);
  if (locations.length === 0) {
    return {
      type: "error",
      message:
        "I need a location (marker, place name, or bounding box) to run this dataset analysis. Drop a marker or mention a region and ask again.",
    };
  }

  const { start: startYear, end: endYear } = parseYearsFromQuery(query);
  const coverageStart = new Date(profile.coverage.start);
  const coverageEnd = profile.coverage.end
    ? new Date(profile.coverage.end)
    : new Date();
  const requestedEnd = context.selectedDate
    ? new Date(context.selectedDate)
    : coverageEnd;

  const desiredStart = startYear
    ? new Date(`${startYear}-01-01`)
    : coverageStart;
  const desiredEnd = endYear ? new Date(`${endYear}-12-31`) : requestedEnd;

  const startDate = clampDate(desiredStart, coverageStart, coverageEnd);
  const endDate = clampDate(desiredEnd, startDate, coverageEnd);
  const clipped =
    startDate.getTime() !== desiredStart.getTime() ||
    endDate.getTime() !== desiredEnd.getTime();

  const startDateStr = formatDate(startDate.toISOString());
  const endDateStr = formatDate(endDate.toISOString());

  const summaries: Array<ReturnType<typeof summarizeSeries>> = [];
  const performanceNotes: string[] = [];
  const interpretationLines: string[] = [];
  const seasonalitySummaries: Array<
    NonNullable<ReturnType<typeof buildSeasonalitySummary>>
  > = [];
  const anomalyLines: string[] = [];
  const forecastLines: string[] = [];
  for (const loc of locations.slice(0, DEFAULT_COMPARISON_LIMIT)) {
    const { series, stats, resampleApplied, usedFallback, error } =
      await fetchSeries({
        datasetId,
        profile,
        location: loc,
        startDate: startDateStr,
        endDate: endDateStr,
        dataServiceUrl,
      });

    if (error) {
      return { type: "error", message: `Data retrieval failed: ${error}` };
    }

    if (!series.length) {
      return {
        type: "error",
        message: `No data returned for ${loc.label} in the requested window (${startDateStr}–${endDateStr}).`,
      };
    }

    const summary = summarizeSeries(series, stats, loc.label);
    summaries.push(summary);
    interpretationLines.push(buildInterpretationLine(summary, profile.units));

    const monthlyMeans = computeMonthlyClimatology(series);
    const seasonality = buildSeasonalitySummary(
      monthlyMeans,
      profile.units,
      loc.label,
    );
    if (seasonality) {
      seasonalitySummaries.push(seasonality);
    }
    anomalyLines.push(buildAnomalyNarrative(summary, profile.units));
    forecastLines.push(buildForecastLine(summary, profile.units));

    if (resampleApplied) {
      const fallbackNote = usedFallback ? " (fallback to avoid timeout)" : "";
      performanceNotes.push(
        `${loc.label}: ${describeResample(resampleApplied)}${fallbackNote}`,
      );
    }
  }

  const statsLines = summaries.map(
    (summary) => `${buildStatsLine(summary, profile.units)}`,
  );

  const performanceLine = performanceNotes.length
    ? `Performance note: ${performanceNotes.join(" | ")}.`
    : "";

  let answerLine = "";
  if (intent === "extreme") {
    const maxPoints = summaries.map((s) => ({
      label: s.locationLabel,
      date: s.max.date,
      value: s.max.value,
    }));
    const top = maxPoints.reduce((prev, curr) =>
      curr.value > prev.value ? curr : prev,
    );
    answerLine = `Answer: Highest spike at ${formatDate(top.date)} with ${formatNumber(top.value)} ${profile.units} (${top.label}).`;
  } else if (intent === "why") {
    const main = summaries[0];
    const windowText = `${formatDate(startDateStr)}–${formatDate(endDateStr)}`;
    const why = buildWhyExplanation(main, profile, windowText);
    answerLine = `Why it varies: ${why}`;
  } else if (intent === "anomaly") {
    answerLine = anomalyLines.join(" | ");
  } else if (intent === "seasonal" && seasonalitySummaries.length) {
    answerLine = seasonalitySummaries
      .map((s) => s?.narrative ?? "")
      .filter(Boolean)
      .join(" | ");
  } else if (intent === "forecast") {
    answerLine = `Projection (simple extrapolation): ${forecastLines.join(" | ")}`;
  } else if (intent === "spatial-compare" && summaries.length === 2) {
    const [a, b] = summaries;
    const faster =
      a.perDecadeTrend !== null &&
      b.perDecadeTrend !== null &&
      Math.abs(a.perDecadeTrend) !== Math.abs(b.perDecadeTrend)
        ? Math.abs(a.perDecadeTrend) > Math.abs(b.perDecadeTrend)
          ? a.locationLabel
          : b.locationLabel
        : null;
    answerLine = faster
      ? `Answer: ${faster} shows the larger magnitude trend between the two locations.`
      : "Answer: Both locations show similar trend magnitudes in this window.";
    const compareNarrative = buildCompareNarrative(a, b, profile.units);
    answerLine = `${compareNarrative} ${answerLine}`;
  } else {
    const main = summaries[0];
    answerLine = `Answer: ${intent === "trend" ? "Trend focus" : "Summary"} for ${main.locationLabel} over ${startDateStr}–${endDateStr}.`;
  }

  const detailedMessage = [
    `Dataset: ${describeProfile(profile)}`,
    `Window: ${startDateStr} to ${endDateStr}`,
    `Locations: ${summaries.map((s) => s.locationLabel).join(" | ")}`,
    `Stats: ${statsLines.join(" | ")}`,
    interpretationLines.length
      ? `Interpretation: ${interpretationLines.join(" | ")}`
      : null,
    answerLine,
    `Limits: ${buildLimitsLine(profile, clipped, { start: startDateStr, end: endDateStr })}`,
    performanceLine || null,
  ]
    .filter(Boolean)
    .join("\n");

  let conciseMessage = "";
  if (intent === "extreme") {
    const stripped = answerLine.replace(/^Answer:\s*/i, "");
    const perf = performanceLine ? ` ${performanceLine}` : "";
    conciseMessage = `${stripped}${perf} Want to check another location or window?`;
  } else if (intent === "why") {
    const perf = performanceLine ? ` ${performanceLine}` : "";
    const interpretation = interpretationLines[0] ?? "";
    conciseMessage = `${answerLine}. ${interpretation}${perf}`;
  } else if (intent === "anomaly") {
    const perf = performanceLine ? ` ${performanceLine}` : "";
    conciseMessage = `${answerLine}${perf ? `. ${perf}` : ""} Want to inspect another window or location?`;
  } else if (intent === "seasonal" && seasonalitySummaries.length) {
    const perf = performanceLine ? ` ${performanceLine}` : "";
    const main = seasonalitySummaries[0];
    const rangeText =
      main && Number.isFinite(main.amplitude)
        ? ` Seasonal range ~${formatNumber(main.amplitude)} ${profile.units}.`
        : "";
    conciseMessage = `${answerLine}${rangeText}${perf ? ` ${perf}` : ""} Anything else you want to explore?`;
  } else if (intent === "forecast") {
    const perf = performanceLine ? ` ${performanceLine}` : "";
    conciseMessage = `${answerLine}${perf ? `. ${perf}` : ""} Want a different horizon or location?`;
  } else if (intent === "spatial-compare" && summaries.length === 2) {
    const [a, b] = summaries;
    const trendA =
      a.perDecadeTrend !== null
        ? `${formatNumber(a.perDecadeTrend)} ${profile.units}/decade`
        : "n/a";
    const trendB =
      b.perDecadeTrend !== null
        ? `${formatNumber(b.perDecadeTrend)} ${profile.units}/decade`
        : "n/a";
    const perf = performanceLine ? ` ${performanceLine}` : "";
    const compareNarrative = buildCompareNarrative(a, b, profile.units);
    conciseMessage = `${compareNarrative} Trends: ${a.locationLabel} ${trendA}, ${b.locationLabel} ${trendB}.${perf ? ` ${perf}` : ""} Anything else you want to compare?`;
  } else {
    const main = summaries[0];
    const trend =
      main.perDecadeTrend !== null
        ? `${formatNumber(main.perDecadeTrend)} ${profile.units}/decade`
        : "n/a";
    const minMax = `${formatNumber(main.min.value)}–${formatNumber(main.max.value)} ${profile.units}`;
    const interpretation = interpretationLines[0] ?? "";
    const perf = performanceLine ? ` ${performanceLine}` : "";
    const trendSentence =
      main.perDecadeTrend !== null
        ? `Trend is about ${formatNumber(main.perDecadeTrend)} ${profile.units}/decade.`
        : "No clear linear trend to quote.";
    const sentence = `${interpretation} Over ${startDateStr}–${endDateStr}, values ranged ${minMax}. They started at ${formatNumber(main.start.value)} and ended at ${formatNumber(main.end.value)} ${profile.units}. ${trendSentence}`;
    conciseMessage = `${sentence}${perf ? ` ${perf}` : ""} Anything else you want to explore?`;
  }

  const message = wantsDetails ? detailedMessage : conciseMessage;

  return {
    type: "summary",
    message,
    sources: [
      {
        id: profile.id,
        title: profile.name,
        category: "dataset-profile",
        score: 1,
      },
    ],
  };
}
