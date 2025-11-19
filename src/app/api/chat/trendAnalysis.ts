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
];

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

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
  typeof years === "number" && years > 1 && years < 100 ? years : 15;

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

export const buildTrendInsightPrompt = async ({
  query,
  context,
  dataServiceUrl,
  windowYears,
}: TrendInsightOptions): Promise<string | null> => {
  if (!isTrendQuery(query)) {
    return null;
  }

  const datasetId = normalizeString(context.datasetId ?? undefined);
  const lat = normalizeNumber(context.location?.latitude);
  const lon = normalizeNumber(context.location?.longitude);

  if (!datasetId || lat === null || lon === null) {
    return null;
  }

  const targetWindowYears = clampWindowYear(windowYears);
  const now = new Date();

  const selectedDate = context.selectedDate
    ? new Date(context.selectedDate)
    : now;
  const safeSelectedDate = Number.isNaN(selectedDate.getTime())
    ? now
    : selectedDate;

  const startCandidate = new Date(safeSelectedDate);
  startCandidate.setFullYear(
    safeSelectedDate.getFullYear() - targetWindowYears,
  );

  const datasetStart = context.datasetStartDate
    ? new Date(context.datasetStartDate)
    : null;
  const datasetEnd = context.datasetEndDate
    ? new Date(context.datasetEndDate)
    : null;

  const safeStart =
    datasetStart && datasetStart > startCandidate
      ? datasetStart
      : startCandidate;
  const safeEnd =
    datasetEnd && datasetEnd < safeSelectedDate ? datasetEnd : safeSelectedDate;

  if (safeStart > safeEnd) {
    return null;
  }

  const payload = {
    datasetIds: [datasetId],
    startDate: formatDateOnly(safeStart),
    endDate: formatDateOnly(safeEnd),
    includeStatistics: true,
    includeMetadata: true,
    analysisModel: "raw",
    aggregation: "mean",
    chartType: "line",
    focusCoordinates: `${lat},${lon}`,
  };

  const response = await fetch(
    `${dataServiceUrl.replace(/\/$/, "")}/api/v2/timeseries/extract`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Timeseries request failed (${response.status}): ${detail.slice(0, 240)}`,
    );
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
    return null;
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
  const datasetLabel =
    normalizeString(context.datasetName) ??
    normalizeString(metadata?.name) ??
    datasetId;
  const locationLabel =
    normalizeString(context.location?.name) ??
    `${formatNumber(lat, 2)}°, ${formatNumber(lon, 2)}°`;

  const lines = [
    `Dataset: ${datasetLabel}`,
    `Location: ${locationLabel} (lat ${formatNumber(lat, 2)}°, lon ${formatNumber(lon, 2)}°)`,
    `Period analyzed: ${formatDateOnly(safeStart)} to ${formatDateOnly(safeEnd)} (${series.length} records, ~${targetWindowYears} years)`,
    `Average value: ${formatNumber(mean, 2)} ${units}`,
    `Starting value: ${formatNumber(firstPoint.value, 2)} ${units} on ${firstPoint.date}`,
    `Latest value: ${formatNumber(lastPoint.value, 2)} ${units} on ${lastPoint.date}`,
    `Observed change over window: ${formatNumber(observedChange, 2)} ${units}`,
    `Minimum: ${formatNumber(minPoint.value, 2)} ${units} on ${minPoint.date}`,
    `Maximum: ${formatNumber(maxPoint.value, 2)} ${units} on ${maxPoint.date}`,
  ];

  if (perDecadeTrend !== null) {
    lines.push(
      `Estimated linear trend: ${formatNumber(perDecadeTrend, 2)} ${units} per decade (${formatNumber(
        perYearTrend ?? 0,
        3,
      )} ${units}/year).`,
    );
  }

  const instructions = [
    "You are the iCharm climate assistant.",
    "Explain the long-term behavior of the dataset using the quantitative summary below.",
    "Reference the dataset name, time window, and whether values are increasing, decreasing, or stable.",
    "Highlight notable extremes and relate them to well-known climate drivers when possible.",
    "Do not invent numbers beyond what is provided and keep units consistent.",
    `User question: "${query}"`,
  ];

  return `${instructions.join(
    " ",
  )}\n\nQuantitative summary:\n${lines.join("\n")}`;
};
