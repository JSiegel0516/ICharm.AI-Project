import { ConversationContextPayload } from "@/types";

const LLM_SERVICE_URL = (
  process.env.LLM_SERVICE_URL ?? "http://localhost:8001"
).replace(/\/$/, "");

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
  "enso",
  "el nino",
  "la nina",
  "nino",
  "nina",
  "enso-neutral",
  "teleconnection",
  "pdo",
  "nao",
  "amo",
  "mjo",
  "qbo",
  "indian ocean dipole",
  "iod",
  "enso event",
  "enso phase",
  "monsoon onset",
  "monsoon retreat",
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
const NAMED_REGION_BOUNDS: Record<
  string,
  {
    label: string;
    bbox: { north: number; south: number; east: number; west: number };
  }
> = {
  africa: {
    label: "Africa",
    bbox: { north: 38, south: -35, east: 55, west: -20 },
  },
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

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const buildBufferedBounds = (
  lat: number,
  lon: number,
  bufferDeg = 1,
): { lat_min: number; lat_max: number; lon_min: number; lon_max: number } => {
  const half = Math.max(0.05, bufferDeg / 2);
  const latMin = clamp(lat - half, -90, 90);
  const latMax = clamp(lat + half, -90, 90);
  const lonMin = clamp(lon - half, -180, 180);
  const lonMax = clamp(lon + half, -180, 180);
  return { lat_min: latMin, lat_max: latMax, lon_min: lonMin, lon_max: lonMax };
};

const clampWindowYear = (years?: number): number =>
  typeof years === "number" && years > 1 && years < 150
    ? years
    : FALLBACK_WINDOW_YEARS;

const YEAR_WINDOW_REGEX = /(?:last|past)\s+(\d{1,3})\s*(?:years|yrs|year)/i;
const DECADE_REGEX = /(?:last|past)\s+(?:a\s+)?decade/i;
const CENTURY_REGEX = /(?:last|past)\s+(?:a\s+)?century/i;
const MONTHS = [
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
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
];

const parseRequestedWindow = (query: string | undefined): number | null => {
  if (!query) return null;

  if (DECADE_REGEX.test(query)) {
    return 10;
  }
  if (CENTURY_REGEX.test(query)) {
    return 100;
  }

  const match = query.match(YEAR_WINDOW_REGEX);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

const resolveNamedRegion = (
  phrase: string | null | undefined,
): {
  label: string;
  bbox: { north: number; south: number; east: number; west: number };
  centroid: { lat: number; lon: number };
} | null => {
  if (!phrase) return null;
  const lower = phrase.trim().toLowerCase();
  const matchedKey = Object.keys(NAMED_REGION_BOUNDS).find((key) =>
    lower.includes(key),
  );
  if (!matchedKey) return null;
  const region = NAMED_REGION_BOUNDS[matchedKey];
  const { north, south, east, west } = region.bbox;
  return {
    label: region.label,
    bbox: region.bbox,
    centroid: { lat: (north + south) / 2, lon: (east + west) / 2 },
  };
};

const containsKeyword = (
  text: string,
  keywords: Array<string | RegExp>,
): boolean => {
  return keywords.some((keyword) =>
    typeof keyword === "string" ? text.includes(keyword) : keyword.test(text),
  );
};

type GeocodedLocation = {
  latitude: number;
  longitude: number;
  label: string;
  bbox?: {
    north: number;
    south: number;
    east: number;
    west: number;
  } | null;
};

type ParsedCoordinates = {
  latitude: number;
  longitude: number;
  label?: string;
};

const parseCoordinatesFromQuery = (
  query: string | undefined,
): ParsedCoordinates | null => {
  if (!query) return null;
  const coordRegex =
    /(-?\d{1,2}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)(?:\s*°)?/;
  const match = query.match(coordRegex);
  if (!match) return null;
  const lat = Number.parseFloat(match[1]);
  const lon = Number.parseFloat(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return {
    latitude: lat,
    longitude: lon,
    label: `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
  };
};

const geocodeFromQuery = async (
  query: string | undefined,
): Promise<GeocodedLocation | null> => {
  const trimmed = (query ?? "").trim();
  if (!trimmed) return null;

  try {
    const response = await fetch(`${LLM_SERVICE_URL}/v1/geocode/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: trimmed, limit: 1 }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      results?: Array<{
        latitude?: number;
        longitude?: number;
        label?: string;
        raw?: {
          boundingbox?: [string, string, string, string];
        };
      }>;
    };

    const first = data?.results?.[0];
    if (
      first &&
      typeof first.latitude === "number" &&
      Number.isFinite(first.latitude) &&
      typeof first.longitude === "number" &&
      Number.isFinite(first.longitude)
    ) {
      const bboxRaw = first.raw?.boundingbox;
      let bbox: GeocodedLocation["bbox"] = null;
      if (
        Array.isArray(bboxRaw) &&
        bboxRaw.length === 4 &&
        bboxRaw.every((v) => typeof v === "string")
      ) {
        const south = Number.parseFloat(bboxRaw[0]);
        const north = Number.parseFloat(bboxRaw[1]);
        const west = Number.parseFloat(bboxRaw[2]);
        const east = Number.parseFloat(bboxRaw[3]);
        if (
          Number.isFinite(north) &&
          Number.isFinite(south) &&
          Number.isFinite(east) &&
          Number.isFinite(west)
        ) {
          bbox = { north, south, east, west };
        }
      }

      return {
        latitude: first.latitude,
        longitude: first.longitude,
        label:
          typeof first.label === "string" && first.label.trim().length
            ? first.label.trim()
            : `${first.latitude.toFixed(2)}, ${first.longitude.toFixed(2)}`,
        bbox,
      };
    }
  } catch {
    return null;
  }

  return null;
};

const extractLocationPhrase = (query: string | undefined): string | null => {
  if (!query) return null;

  const isTemporalPhrase = (text: string): boolean => {
    const lower = text.toLowerCase();
    if (!lower.trim()) return false;
    const temporalKeywords = [
      "past",
      "last",
      "next",
      "years",
      "year",
      "decade",
      "century",
      "months",
      "month",
      "weeks",
      "days",
      "seasons",
      "season",
      "winter",
      "spring",
      "summer",
      "fall",
      "autumn",
      "monsoon",
    ];
    const temporalRegex =
      /(?:past|last|next)\s+\d{1,3}\s*(?:years?|months?|weeks?|days?)/i;
    if (temporalRegex.test(lower)) return true;
    if (temporalKeywords.some((kw) => lower.includes(kw))) {
      return true;
    }
    return MONTHS.some((month) => lower.includes(month));
  };
  const isDatasetReference = (text: string): boolean =>
    /\bdata\s*set\b|\bdataset\b/i.test(text);
  // Try to grab a location-like phrase after common prepositions
  const prepositionRegex =
    /\b(?:in|for|at|near|around|over|within|of)\s+(?:the\s+)?([A-Za-z][\w\s\-\.,']{2,}?)(?:\?|\.|,| over| during| for| in| at| near| around| of|$)/i;
  const match = query.match(prepositionRegex);
  if (match && match[1]) {
    const candidate = match[1].trim();
    if (
      candidate &&
      !isTemporalPhrase(candidate) &&
      !isDatasetReference(candidate)
    ) {
      return candidate;
    }
  }

  // Fallback: use trailing words as a location guess
  const tokens = query.replace(/[?.,]/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const tail = tokens.slice(-6).join(" ").trim();
    if (tail.length >= 3) {
      if (!isTemporalPhrase(tail) && !isDatasetReference(tail)) {
        return tail;
      }
    }
  }

  // Final fallback: strip leading question words and return the remaining chunk
  const cleaned = query
    .replace(
      /^(what|how|where|show|tell me about|can you|could you|please)\s+/i,
      "",
    )
    .trim();
  return cleaned.length >= 3 &&
    !isTemporalPhrase(cleaned) &&
    !isDatasetReference(cleaned)
    ? cleaned
    : null;
};

const extractMonthFilter = (query: string | undefined): number | null => {
  if (!query) return null;
  const lower = query.toLowerCase();
  for (let i = 0; i < MONTHS.length; i++) {
    if (lower.includes(MONTHS[i])) {
      return i % 12; // short forms follow long names
    }
  }
  return null;
};

const extractNumericThreshold = (query: string | undefined): number | null => {
  if (!query) return null;
  const thresholdMatch =
    query.match(
      /(?:above|over|greater than|>=|>|exceed(?:ed|ing)?)\s*(-?\d+(?:\.\d+)?)/i,
    ) ||
    query.match(
      /(-?\d+(?:\.\d+)?)\s*(?:degc|deg c|celsius|c|kelvin|k)?\s*(?:threshold)?/i,
    );
  if (!thresholdMatch) return null;
  const value = Number.parseFloat(thresholdMatch[1]);
  return Number.isFinite(value) ? value : null;
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

const buildMissingMarkerMessage = (
  datasetLabel: string,
  hasManualMarker: boolean,
): string =>
  hasManualMarker
    ? `Looks like you want a marker-specific summary for ${datasetLabel}, but I can’t read your marker. Click the spot again or pick a place from search, then ask again and I’ll analyze that location.`
    : `To summarize ${datasetLabel} for a specific place, tell me a location name (e.g., “Bangkok, Thailand”) or drop a marker on the globe. I’ll analyze that spot as soon as you provide it.`;

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
  const wantsPercentageOrThreshold =
    /\b(percent|percentage|fraction|share|portion|%|how much)\b/.test(
      normalized,
    ) ||
    /\b(?:exceed|exceeded|exceeding|above|over|greater than)\s*\d+/.test(
      normalized,
    );
  return (
    TREND_KEYWORDS.some((keyword) => normalized.includes(keyword)) ||
    wantsPercentageOrThreshold
  );
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
  const normalizedQuery = (query ?? "").toLowerCase();

  if (!isTrendQuery(query)) {
    return { type: "none" };
  }

  const datasetId = normalizeString(context.datasetId ?? undefined);
  const datasetLabel =
    normalizeString(context.datasetName) ?? datasetId ?? "current dataset";

  if (!datasetId) {
    return {
      type: "error",
      message: `I couldn’t determine which dataset is loaded to run a trend summary for ${datasetLabel}. Try reselecting the dataset and ask again.`,
    };
  }

  const thresholdValue = extractNumericThreshold(normalizedQuery);
  const wantsCount =
    /\b(how many times?|number of times|count|how often|frequency)\b/.test(
      normalizedQuery,
    );
  const wantsShare =
    /\b(percent|percentage|fraction|share|portion|%)\b/.test(normalizedQuery) ||
    /\bhow much\b/.test(normalizedQuery);
  const wantsThresholdCount = thresholdValue !== null && wantsCount;
  const wantsPercentage = wantsShare && !wantsThresholdCount;
  const monthFilter = extractMonthFilter(normalizedQuery);

  if (wantsPercentage) {
    return {
      type: "summary",
      message: `I can’t compute the percentage of area above the requested threshold from the current time-series endpoint for ${datasetLabel}. Use a gridded map or histogram/threshold query for the month in question (e.g., July) to calculate the share of cells above that temperature.`,
      metadata: {
        datasetId,
        datasetLabel,
        analysisScope: "global",
        windowStart: "",
        windowEnd: "",
        locationLabel: null,
      },
    };
  }

  const extractedLocation = extractLocationPhrase(query);
  const parsedCoords = parseCoordinatesFromQuery(query);
  const locationPhrase =
    extractedLocation &&
    !/\breach|times?\b/.test(extractedLocation.toLowerCase()) &&
    !/\bover\s+-?\d/.test(extractedLocation.toLowerCase())
      ? extractedLocation
      : null;
  const userSpecifiedLocation = Boolean(parsedCoords || locationPhrase);

  let lat: number | null = null;
  let lon: number | null = null;
  let locationSource = normalizeLocationSource(context.location?.source);
  const hasManualMarker = locationSource === "marker";
  let geocodedLocation: GeocodedLocation | null = null;
  const namedRegion = resolveNamedRegion(locationPhrase ?? normalizedQuery);

  // 1) If the user explicitly provided coordinates in the query, use them and ignore prior marker.
  if (parsedCoords) {
    lat = parsedCoords.latitude;
    lon = parsedCoords.longitude;
    locationSource = "marker";
    geocodedLocation = {
      latitude: lat,
      longitude: lon,
      label: parsedCoords.label ?? parsedCoords.latitude.toString(),
      bbox: null,
    };
  } else if (namedRegion) {
    lat = namedRegion.centroid.lat;
    lon = namedRegion.centroid.lon;
    locationSource = "region";
    geocodedLocation = {
      latitude: lat,
      longitude: lon,
      label: namedRegion.label,
      bbox: namedRegion.bbox,
    };
  } else if (locationPhrase) {
    // 2) If they named a place, geocode it (do not rely on prior marker).
    geocodedLocation = await geocodeFromQuery(locationPhrase);
    if (geocodedLocation) {
      lat = geocodedLocation.latitude;
      lon = geocodedLocation.longitude;
      locationSource = "search";
    }
  }

  // 3) If no explicit location was provided, fall back to current context marker/search.
  if (lat === null || lon === null) {
    const ctxLat = normalizeNumber(context.location?.latitude);
    const ctxLon = normalizeNumber(context.location?.longitude);
    if (ctxLat !== null && ctxLon !== null) {
      lat = ctxLat;
      lon = ctxLon;
      locationSource = normalizeLocationSource(context.location?.source);
    }
  }

  const hasLocation = lat !== null && lon !== null;

  let analysisScope = determineAnalysisScope(query, {
    hasValidLocation: hasLocation,
    hasManualMarker,
  });

  if (
    analysisScope === "global" &&
    hasLocation &&
    (geocodedLocation || userSpecifiedLocation)
  ) {
    analysisScope = "marker";
  }

  if (!hasLocation && userSpecifiedLocation) {
    const prompt =
      `I couldn’t locate “${locationPhrase ?? "that place"}” for ${datasetLabel}. ` +
      `Tell me a nearby city name or coordinates (lat, lon), or drop a marker, and I’ll run a location-specific summary.`;
    return { type: "needs-marker", message: prompt };
  }

  if (
    analysisScope === "marker-missing" ||
    (analysisScope === "marker" && !hasLocation)
  ) {
    return {
      type: "needs-marker",
      message: buildMissingMarkerMessage(datasetLabel, hasManualMarker),
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

  const normalizedWindowYears = clampWindowYear(
    requestedWindowYears ?? windowYears ?? undefined,
  );

  const desiredStart = new Date(referenceEnd);
  desiredStart.setFullYear(referenceEnd.getFullYear() - normalizedWindowYears);

  let safeStart =
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
    const bounds = geocodedLocation?.bbox
      ? {
          lat_min: geocodedLocation.bbox.south,
          lat_max: geocodedLocation.bbox.north,
          lon_min: geocodedLocation.bbox.west,
          lon_max: geocodedLocation.bbox.east,
        }
      : buildBufferedBounds(lat, lon, geocodedLocation ? 4 : 1);
    payload.spatialBounds = bounds;
    // Also include centroid as a fallback point extraction hint
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
  let locationLabel =
    hasLocation && formattedLatLon
      ? (normalizeString(geocodedLocation?.label) ??
        normalizeString(context.location?.name) ??
        formattedLatLon)
      : null;

  // Avoid using dataset names or empty labels as the "location"
  if (
    locationLabel &&
    datasetLabel &&
    locationLabel.toLowerCase().includes(datasetLabel.toLowerCase())
  ) {
    locationLabel = formattedLatLon;
  }

  // Avoid using dataset-like strings as the "location" (e.g., GPCP, precip dataset names)
  if (locationLabel) {
    const labelLower = locationLabel.toLowerCase();
    const datasetIdLower = (datasetId ?? "").toLowerCase();
    const datasetNameLower = (datasetLabel ?? "").toLowerCase();
    const datasetishKeywords = [
      "gpcp",
      "precip",
      "reanalysis",
      "dataset",
      "temp",
    ];
    const looksDatasetLike =
      (datasetIdLower && labelLower.includes(datasetIdLower)) ||
      (datasetNameLower && labelLower.includes(datasetNameLower)) ||
      datasetishKeywords.some((kw) => labelLower.includes(kw));
    if (looksDatasetLike) {
      locationLabel = formattedLatLon;
    }
  }

  // Ensure we always surface a location descriptor when we have one
  const locationDescriptor =
    locationLabel ||
    formattedLatLon ||
    (hasLocation ? "selected location" : null);
  const analysisScopeMode: "marker" | "global" = usingMarkerExtraction
    ? "marker"
    : "global";
  const windowStart = formatDateOnly(safeStart);
  const windowEnd = formatDateOnly(safeEnd);

  const seriesForThreshold =
    monthFilter !== null
      ? series.filter((point) => {
          const parsed = new Date(point.date);
          return (
            !Number.isNaN(parsed.getTime()) && parsed.getMonth() === monthFilter
          );
        })
      : series;

  if (wantsThresholdCount && thresholdValue !== null) {
    const monthLabel =
      monthFilter !== null
        ? new Date(2000, monthFilter, 1).toLocaleString("en-US", {
            month: "long",
          })
        : null;
    const totalPoints = seriesForThreshold.length;
    if (totalPoints === 0) {
      return {
        type: "error",
        message: `I didn’t find any ${monthLabel ?? "requested"} data points for ${datasetLabel} in this window. Try expanding the date range or selecting a different dataset.`,
      };
    }

    const exceedances = seriesForThreshold.filter(
      (point) => point.value > thresholdValue,
    );
    const exceedCount = exceedances.length;
    const exceedPercent = (exceedCount / totalPoints) * 100;
    const mostRecentExceed = exceedances[exceedances.length - 1] ?? null;
    const monthPhrase = monthLabel
      ? `${monthLabel.toLowerCase()} values`
      : "values";
    const locationText =
      namedRegion?.label ??
      (locationPhrase && locationPhrase.length < 40 ? locationPhrase : null);

    const thresholdSummary =
      exceedCount > 0
        ? `The most recent exceedance was ${formatNumber(mostRecentExceed!.value, 2)} ${units} on ${mostRecentExceed!.date}.`
        : "No exceedances occurred in this period.";

    const message = [
      locationText
        ? `From ${windowStart} to ${windowEnd}, ${exceedCount} of ${totalPoints} ${monthPhrase} for ${datasetLabel} at ${locationText} were above ${formatNumber(thresholdValue, 2)} ${units} (${formatNumber(exceedPercent, 1)}%).`
        : `From ${windowStart} to ${windowEnd}, ${exceedCount} of ${totalPoints} ${monthPhrase} for ${datasetLabel} were above ${formatNumber(thresholdValue, 2)} ${units} (${formatNumber(exceedPercent, 1)}%).`,
      thresholdSummary,
    ]
      .filter(Boolean)
      .join(" ");

    return {
      type: "summary",
      message,
      metadata: {
        datasetId,
        datasetLabel,
        analysisScope: analysisScopeMode,
        windowStart,
        windowEnd,
        locationLabel:
          analysisScopeMode === "marker"
            ? (locationText ?? formattedLatLon ?? null)
            : (locationText ?? formattedLatLon ?? null),
      },
    };
  }

  const intro = usingMarkerExtraction
    ? `Here’s what ${datasetLabel} looks like at ${locationDescriptor ?? "the selected marker"} from ${windowStart} through ${windowEnd}.`
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
