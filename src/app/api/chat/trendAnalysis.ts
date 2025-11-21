import { ConversationContextPayload } from "@/types";

const TREND_KEYWORDS = [
  "trend",
  "trends",
  "change",
  "changes",
  "changing",
  "over time",
  "past",
  "history",
  "historical",
  "increase",
  "increasing",
  "decrease",
  "decreasing",
  "warming",
  "cooling",
  "evolution",
  "pattern",
  "patterns",
  "long term",
  "long-term",
  "decade",
  "year over year",
  "dataset",
  "analysis",
  "analyze",
  "summarize",
  "summary",
  "insight",
  "pattern",
  "behavior",
  "overview",
];

const LOCATION_SCOPE_KEYWORDS: Array<string | RegExp> = [
  "current marker",
  "my marker",
  "this marker",
  "selected marker",
  "marker position",
  "current position",
  "my position",
  "current location",
  "my location",
  "this location",
  "selected location",
  "selected spot",
  "selected point",
  "this point",
  "this spot",
  "these coordinates",
  "my coordinates",
  "current coordinates",
  "at my marker",
  "at this marker",
  "at my location",
  "at this location",
  "at my position",
  "around my marker",
  "around this marker",
  /at\s+my\s+(?:marker|location|position|coordinates)/,
  /at\s+this\s+(?:marker|location|position|spot|point)/,
  /near\s+(?:my|this)\s+(?:marker|location|spot|point)/,
];

const DATASET_SCOPE_KEYWORDS: Array<string | RegExp> = [
  "entire dataset",
  "whole dataset",
  "overall dataset",
  "dataset overview",
  "dataset summary",
  "summary of this dataset",
  "summarize this dataset",
  "global summary",
  "global overview",
  "whole thing",
  "entire data set",
  "all data",
  "full dataset",
];

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const FALLBACK_WINDOW_YEARS = 30;
const GLOBAL_BOUNDS = {
  north: 90,
  south: -90,
  east: 180,
  west: -180,
};

type TrendInsightOptions = {
  query: string;
  context: ConversationContextPayload;
  dataServiceUrl: string;
  windowYears?: number;
};

type TimeSeriesPoint = {
  date: string;
  values?: Record<string, number | null>;
};

type TimeSeriesResponsePayload = {
  data?: TimeSeriesPoint[];
  metadata?: Record<
    string,
    {
      name?: string;
      units?: string | null;
      temporalResolution?: string | null;
      description?: string | null;
    }
  >;
  statistics?: Record<
    string,
    {
      min?: number | null;
      max?: number | null;
      mean?: number | null;
      median?: number | null;
      trend?: number | null;
    }
  >;
};

const formatNumber = (value: number, fractionDigits = 2): string => {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  const fixed = value.toFixed(fractionDigits);
  const normalized = parseFloat(fixed);
  if (Number.isNaN(normalized)) {
    return "n/a";
  }
  return `${normalized}`;
};

const formatDateOnly = (value: Date): string =>
  value.toISOString().split("T")[0] ?? "";

const parseDateSafe = (value?: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const estimateStepMs = (series: Array<{ date: string }>): number | null => {
  for (let i = 1; i < series.length; i++) {
    const prev = new Date(series[i - 1].date);
    const current = new Date(series[i].date);
    if (Number.isNaN(prev.getTime()) || Number.isNaN(current.getTime())) {
      continue;
    }
    const diff = Math.abs(current.getTime() - prev.getTime());
    if (diff > 0) {
      return diff;
    }
  }
  return null;
};

const normalizeString = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
};

const clampWindowYear = (years?: number): number =>
  typeof years === "number" && years > 1 && years < 150
    ? years
    : FALLBACK_WINDOW_YEARS;

const YEAR_WINDOW_REGEX = /(?:last|past)\s+(\d{1,3})\s*(?:years|yrs|year)/i;

const parseRequestedWindow = (query: string | undefined): number | null => {
  if (!query) return null;
  const match = query.match(YEAR_WINDOW_REGEX);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

const containsKeyword = (
  text: string,
  keywords: Array<string | RegExp>,
): boolean => {
  return keywords.some((keyword) =>
    typeof keyword === "string" ? text.includes(keyword) : keyword.test(text),
  );
};

type LocationSourceType = "marker" | "search" | "region" | "unknown";

const normalizeLocationSource = (
  value?: string | null,
): LocationSourceType | null => {
  if (!value || typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "marker" ||
    normalized === "search" ||
    normalized === "region" ||
    normalized === "unknown"
  ) {
    return normalized as LocationSourceType;
  }
  if (normalized === "manual" || normalized === "click") {
    return "marker";
  }
  return null;
};

type AnalysisScope = "global" | "marker" | "marker-missing";

const determineAnalysisScope = (
  query: string | undefined,
  {
    hasValidLocation,
    hasManualMarker,
  }: { hasValidLocation: boolean; hasManualMarker: boolean },
): AnalysisScope => {
  const normalized = (query ?? "").toLowerCase();
  if (!normalized.trim()) {
    return hasValidLocation ? "global" : "global";
  }

  const mentionsMarker =
    containsKeyword(normalized, LOCATION_SCOPE_KEYWORDS) ||
    (hasManualMarker && /\bhere\b/.test(normalized));

  if (mentionsMarker) {
    return hasValidLocation ? "marker" : "marker-missing";
  }

  if (containsKeyword(normalized, DATASET_SCOPE_KEYWORDS)) {
    return "global";
  }

  return "global";
};

const buildMissingMarkerMessage = (datasetLabel: string): string =>
  `It sounds like you want a marker-specific summary for ${datasetLabel}, but I don’t see a marker or search location selected. Click a point on the globe or pick a location from search, then ask again and I’ll analyze that spot for you.`;

export const sanitizeConversationContext = (
  raw: unknown,
): ConversationContextPayload | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const ctx = raw as Record<string, any>;
  const locationRaw = ctx.location;
  let location: ConversationContextPayload["location"];

  if (locationRaw && typeof locationRaw === "object") {
    location = {
      latitude: normalizeNumber(locationRaw.latitude),
      longitude: normalizeNumber(locationRaw.longitude),
      name: normalizeString(locationRaw.name ?? locationRaw.label),
      source: normalizeLocationSource(
        locationRaw.source ?? locationRaw.origin ?? locationRaw.type,
      ),
    };
  }

  return {
    datasetId: normalizeString(ctx.datasetId),
    datasetName: normalizeString(ctx.datasetName) ?? undefined,
    datasetUnits: normalizeString(ctx.datasetUnits) ?? undefined,
    datasetStartDate: normalizeString(ctx.datasetStartDate) ?? undefined,
    datasetEndDate: normalizeString(ctx.datasetEndDate) ?? undefined,
    selectedDate: normalizeString(ctx.selectedDate) ?? undefined,
    location,
  };
};

export const isTrendQuery = (query: string | undefined): boolean => {
  if (!query) {
    return false;
  }
  const normalized = query.toLowerCase();
  return TREND_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

type TrendInsightSummaryMetadata = {
  datasetId: string;
  datasetLabel: string;
  analysisScope: "marker" | "global";
  windowStart: string;
  windowEnd: string;
  locationLabel?: string | null;
};

type TrendInsightResult =
  | { type: "none" }
  | { type: "needs-marker"; message: string }
  | { type: "summary"; message: string; metadata: TrendInsightSummaryMetadata }
  | { type: "error"; message: string };

const describeChange = (value: number, units: string): string => {
  const magnitude = Math.abs(value);
  if (magnitude < 0.01) {
    return `Values were essentially stable, changing by less than 0.01 ${units}.`;
  }
  const direction = value > 0 ? "increased" : "decreased";
  return `Values ${direction} by ${formatNumber(magnitude, 2)} ${units} over the window.`;
};

export const buildTrendInsightResponse = async ({
  query,
  context,
  dataServiceUrl,
  windowYears,
}: TrendInsightOptions): Promise<TrendInsightResult> => {
  if (!isTrendQuery(query)) {
    return { type: "none" };
  }

  const datasetId = normalizeString(context.datasetId ?? undefined);
  if (!datasetId) {
    return { type: "none" };
  }

  const lat = normalizeNumber(context.location?.latitude);
  const lon = normalizeNumber(context.location?.longitude);
  const hasLocation = lat !== null && lon !== null;
  const locationSource = normalizeLocationSource(context.location?.source);
  const hasManualMarker = locationSource === "marker";

  const analysisScope = determineAnalysisScope(query, {
    hasValidLocation: hasLocation,
    hasManualMarker,
  });

  const datasetLabel =
    normalizeString(context.datasetName) ?? datasetId ?? "current dataset";

  if (
    analysisScope === "marker-missing" ||
    (analysisScope === "marker" && !hasLocation)
  ) {
    return {
      type: "needs-marker",
      message: buildMissingMarkerMessage(datasetLabel),
    };
  }

  const requestedWindowYears =
    typeof windowYears === "number" ? windowYears : parseRequestedWindow(query);
  const now = new Date();

  const datasetStart = parseDateSafe(context.datasetStartDate);
  const datasetEnd = parseDateSafe(context.datasetEndDate);

  const referenceEnd = (() => {
    if (context.selectedDate) {
      const parsed = new Date(context.selectedDate);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    if (datasetEnd && !Number.isNaN(datasetEnd.getTime())) {
      return datasetEnd;
    }
    return now;
  })();

  const targetWindowYears = clampWindowYear(requestedWindowYears ?? undefined);

  const fallbackStart = new Date(referenceEnd);
  fallbackStart.setFullYear(referenceEnd.getFullYear() - FALLBACK_WINDOW_YEARS);

  const requestedStart = new Date(referenceEnd);
  requestedStart.setFullYear(referenceEnd.getFullYear() - targetWindowYears);

  const desiredStart = requestedWindowYears
    ? requestedStart
    : (datasetStart ?? fallbackStart);
  const safeStart =
    datasetStart && datasetStart > desiredStart ? datasetStart : desiredStart;
  const safeEnd = referenceEnd;

  if (safeStart >= safeEnd || safeStart > safeEnd) {
    return {
      type: "error",
      message: `I couldn’t determine a valid time window to summarize ${datasetLabel}. Try picking a different date range and ask again.`,
    };
  }

  const payload: Record<string, any> = {
    datasetIds: [datasetId],
    startDate: formatDateOnly(safeStart),
    endDate: formatDateOnly(safeEnd),
    includeStatistics: true,
    includeMetadata: true,
    analysisModel: "raw",
    aggregation: "mean",
    chartType: "line",
  };

  const usingMarkerExtraction =
    analysisScope === "marker" && hasLocation && lat !== null && lon !== null;

  if (usingMarkerExtraction && lat !== null && lon !== null) {
    payload.focusCoordinates = `${lat},${lon}`;
  } else {
    payload.spatialBounds = GLOBAL_BOUNDS;
  }

  let response: Response;
  try {
    response = await fetch(
      `${dataServiceUrl.replace(/\/$/, "")}/api/v2/timeseries/extract`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
  } catch (error) {
    return {
      type: "error",
      message: `I tried to retrieve ${datasetLabel} from the analysis service but the request failed (${(error as Error).message}). Please try again in a moment.`,
    };
  }

  if (!response.ok) {
    const detail = await response.text();
    return {
      type: "error",
      message: `The analysis service rejected the request for ${datasetLabel} (status ${response.status}). Details: ${detail.slice(0, 200)}`,
    };
  }

  const body = (await response.json()) as TimeSeriesResponsePayload;
  const series =
    Array.isArray(body.data) && body.data.length
      ? body.data
          .map((point) => {
            if (!point || typeof point !== "object") {
              return null;
            }
            const value = point.values?.[datasetId];
            return typeof value === "number"
              ? { date: point.date, value }
              : null;
          })
          .filter((point): point is { date: string; value: number } =>
            Boolean(point && Number.isFinite(point.value)),
          )
      : [];

  if (!series.length) {
    return {
      type: "error",
      message: `I couldn’t extract any data points for ${datasetLabel} during the requested window. Try choosing another date or dataset and ask again.`,
    };
  }

  const stats = body.statistics?.[datasetId];
  const metadata = body.metadata?.[datasetId];

  const firstPoint = series[0];
  const lastPoint = series[series.length - 1];
  const minPoint = series.reduce((prev, curr) =>
    curr.value < prev.value ? curr : prev,
  );
  const maxPoint = series.reduce((prev, curr) =>
    curr.value > prev.value ? curr : prev,
  );
  const sum = series.reduce((acc, curr) => acc + curr.value, 0);
  const mean = stats?.mean ?? sum / series.length;

  const stepMs = estimateStepMs(series);
  const perYearTrend =
    stats?.trend && stepMs ? stats.trend * (MS_PER_YEAR / stepMs) : null;
  const perDecadeTrend = perYearTrend !== null ? perYearTrend * 10 : null;
  const observedChange = lastPoint.value - firstPoint.value;

  const units =
    normalizeString(context.datasetUnits) ??
    normalizeString(metadata?.units) ??
    "units";
  const formattedLatLon =
    hasLocation && lat !== null && lon !== null
      ? `${formatNumber(lat, 2)}°, ${formatNumber(lon, 2)}°`
      : null;
  const locationLabel =
    hasLocation && formattedLatLon
      ? (normalizeString(context.location?.name) ?? formattedLatLon)
      : null;
  const analysisScopeMode: "marker" | "global" = usingMarkerExtraction
    ? "marker"
    : "global";
  const windowStart = formatDateOnly(safeStart);
  const windowEnd = formatDateOnly(safeEnd);

  const intro = usingMarkerExtraction
    ? `Here’s what ${datasetLabel} looks like at ${
        locationLabel ?? formattedLatLon ?? "the selected marker"
      } from ${windowStart} through ${windowEnd}.`
    : `Here’s a dataset-wide look at ${datasetLabel} from ${windowStart} through ${windowEnd}.`;

  const changeStatement = describeChange(observedChange, units);
  const startEndStatement = `The period starts at ${formatNumber(firstPoint.value, 2)} ${units} on ${firstPoint.date} and ends at ${formatNumber(lastPoint.value, 2)} ${units} on ${lastPoint.date}, with an average of ${formatNumber(mean, 2)} ${units}.`;

  const extremesStatement = `Extremes ranged from ${formatNumber(minPoint.value, 2)} ${units} on ${minPoint.date} to ${formatNumber(maxPoint.value, 2)} ${units} on ${maxPoint.date}.`;

  const trendStatement =
    perDecadeTrend !== null
      ? `That works out to roughly ${formatNumber(perDecadeTrend, 2)} ${units} per decade (${formatNumber(
          perYearTrend ?? 0,
          3,
        )} ${units} per year) under a linear trend assumption.`
      : null;

  const closing =
    analysisScopeMode === "marker"
      ? "Let me know if you’d like the global average for comparison or want to inspect a different location."
      : hasLocation && (locationLabel || formattedLatLon)
        ? `If you’d like a localized view at ${
            locationLabel ?? formattedLatLon
          }, drop me another note and I’ll focus on that spot.`
        : "Ask anytime if you want me to drill into a particular region or dataset.";

  const summaryParagraphs = [
    intro,
    `${changeStatement} ${startEndStatement}`,
    `${extremesStatement}${trendStatement ? ` ${trendStatement}` : ""}`,
    closing,
  ].filter((paragraph) => paragraph && paragraph.trim().length > 0);

  return {
    type: "summary",
    message: summaryParagraphs.join("\n\n"),
    metadata: {
      datasetId,
      datasetLabel,
      analysisScope: analysisScopeMode,
      windowStart,
      windowEnd,
      locationLabel:
        analysisScopeMode === "marker"
          ? (locationLabel ?? formattedLatLon ?? null)
          : (locationLabel ?? formattedLatLon ?? null),
    },
  };
};
