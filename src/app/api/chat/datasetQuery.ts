import { ConversationContextPayload } from "@/types";

const QUERY_TIMEOUT_MS = 20000;

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

function extractTemporalInfo(
  query: string,
  context?: ConversationContextPayload,
): {
  year?: number;
  month?: number;
  startDate?: string;
  endDate?: string;
  isRelative?: boolean;
  isComparative?: boolean;
} {
  const lower = query.toLowerCase();

  // Detect comparative queries (need full dataset range)
  const isComparative =
    lower.includes("highest") ||
    lower.includes("lowest") ||
    lower.includes("warmest") ||
    lower.includes("coldest") ||
    lower.includes("which year") ||
    lower.includes("what year") ||
    lower.includes("most") ||
    lower.includes("least") ||
    lower.includes("extreme");

  // Detect relative time periods
  const relativeMatch = lower.match(
    /(?:past|last|recent|previous|over\s+the\s+(?:past|last)?)\s+(\d+)\s+(year|decade|month)s?/,
  );

  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2];

    // Use dataset end date or current date as reference
    const endDateStr =
      context?.datasetEndDate || new Date().toISOString().split("T")[0];
    const endDate = new Date(endDateStr!);

    let startDate = new Date(endDate);
    if (unit === "year") {
      startDate.setFullYear(startDate.getFullYear() - amount);
    } else if (unit === "decade") {
      startDate.setFullYear(startDate.getFullYear() - amount * 10);
    } else if (unit === "month") {
      startDate.setMonth(startDate.getMonth() - amount);
    }

    return {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDateStr!,
      isRelative: true,
      isComparative,
    };
  }

  // Detect specific year
  const yearMatch = query.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0]) : undefined;

  // Detect month
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
  const monthMatch = months.findIndex((m) => lower.includes(m));
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
  } else if (isComparative && context) {
    // For comparative queries without specific dates, use full dataset range
    startDate = context.datasetStartDate || undefined;
    endDate = context.datasetEndDate || undefined;
  }

  return { year, month, startDate, endDate, isComparative };
}

function isGlobalQuery(query: string): boolean {
  const lower = query.toLowerCase();
  return (
    lower.includes("global") ||
    lower.includes("world") ||
    lower.includes("earth") ||
    lower.includes("worldwide") ||
    (lower.includes("average") &&
      !lower.includes("at ") &&
      !lower.includes("in "))
  );
}

function detectRegionalQuery(query: string): string | null {
  const lower = query.toLowerCase();

  // Named regions/oceans
  const regions: Record<string, string> = {
    pacific: "Pacific Ocean",
    atlantic: "Atlantic Ocean",
    indian: "Indian Ocean",
    arctic: "Arctic Ocean",
    southern: "Southern Ocean",
    mediterranean: "Mediterranean Sea",
    caribbean: "Caribbean Sea",
    "south china": "South China Sea",
  };

  for (const [key, value] of Object.entries(regions)) {
    if (lower.includes(key)) {
      return value;
    }
  }

  return null;
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
  const datasetName = context.datasetName ?? datasetId;
  const units = context.datasetUnits ?? "dataset units";

  if (!datasetId) {
    return null;
  }

  const temporal = extractTemporalInfo(query, context);
  if (!temporal.startDate || !temporal.endDate) {
    return null;
  }

  const isGlobal = isGlobalQuery(query);
  const regionName = detectRegionalQuery(query);

  const requestUrl = `${dataServiceUrl.replace(/\/$/, "")}/api/v2/timeseries/extract`;

  let payload: Record<string, any>;

  if (isGlobal) {
    payload = {
      datasetIds: [datasetId],
      startDate: temporal.startDate,
      endDate: temporal.endDate,
      includeStatistics: true,
      includeMetadata: false,
      analysisModel: "raw",
      aggregation: "mean",
      chartType: "line",
      spatialBounds: {
        lat_min: -90,
        lat_max: 90,
        lon_min: -180,
        lon_max: 180,
      },
    };
  } else {
    // We no longer use current location/geojson for snippets; skip non-global queries.
    return null;
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
      return null;
    }

    body = await response.json();
  } catch (error) {
    return null;
  }

  const rawSeries = Array.isArray(body?.data) ? body.data : [];
  const series: SeriesPoint[] = rawSeries
    .map((point: any) => {
      const value = point?.values?.[datasetId];
      return typeof value === "number" ? { date: point.date, value } : null;
    })
    .filter((p: SeriesPoint | null): p is SeriesPoint => Boolean(p));

  if (!series.length) {
    return null;
  }

  const stats = body?.statistics?.[datasetId];
  const mean =
    typeof stats?.mean === "number"
      ? stats.mean
      : series.reduce((acc, curr) => acc + curr.value, 0) / series.length;

  // For comparative queries, find extremes
  if (temporal.isComparative) {
    const sorted = [...series].sort((a, b) => a.value - b.value);
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];

    const lower = query.toLowerCase();
    const askingLowest =
      lower.includes("lowest") ||
      lower.includes("coldest") ||
      lower.includes("minimum") ||
      lower.includes("least");
    const askingHighest =
      lower.includes("highest") ||
      lower.includes("warmest") ||
      lower.includes("maximum") ||
      lower.includes("most");

    let result = `For ${datasetName}`;

    if (temporal.isRelative) {
      const years = Math.round(
        (new Date(temporal.endDate).getTime() -
          new Date(temporal.startDate).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000),
      );
      result += ` over the past ${years} years`;
    } else {
      result += ` from ${formatDate(series[0].date)} to ${formatDate(series[series.length - 1].date)}`;
    }

    result += ":\n";

    if (askingLowest) {
      const lowestYear = new Date(lowest.date).getFullYear();
      result += `- Lowest: ${formatNumber(lowest.value)} ${units} in ${lowestYear}`;
    } else if (askingHighest) {
      const highestYear = new Date(highest.date).getFullYear();
      result += `- Highest: ${formatNumber(highest.value)} ${units} in ${highestYear}`;
    } else {
      // Asking "which year" - provide both
      const lowestYear = new Date(lowest.date).getFullYear();
      const highestYear = new Date(highest.date).getFullYear();
      result += `- Lowest: ${formatNumber(lowest.value)} ${units} in ${lowestYear}\n`;
      result += `- Highest: ${formatNumber(highest.value)} ${units} in ${highestYear}`;
    }

    result += `\n- Average: ${formatNumber(mean)} ${units}`;

    console.log("✅ Comparative result:", result);
    return result;
  }

  // For trend queries over multiple years
  if (temporal.isRelative && series.length > 12) {
    const startValue =
      series.slice(0, 12).reduce((acc, p) => acc + p.value, 0) / 12;
    const endValue =
      series.slice(-12).reduce((acc, p) => acc + p.value, 0) / 12;
    const change = endValue - startValue;
    const years = Math.round(
      (new Date(temporal.endDate).getTime() -
        new Date(temporal.startDate).getTime()) /
        (365.25 * 24 * 60 * 60 * 1000),
    );

    const scopeLabel = isGlobal
      ? "globally"
      : usesFocusCoordinates && context.location?.name
        ? `in ${context.location.name}`
        : usesFocusCoordinates
          ? `at ${formatNumber(context.location!.latitude!, 2)}°, ${formatNumber(context.location!.longitude!, 2)}°`
          : (context.location?.name ??
            `at ${formatNumber(context.location!.latitude!, 2)}°, ${formatNumber(context.location!.longitude!, 2)}°`);

    let result = `For ${datasetName}, ${scopeLabel} over the past ${years} years:\n`;
    result += `- Starting average (${new Date(series[0].date).getFullYear()}): ${formatNumber(startValue)} ${units}\n`;
    result += `- Recent average (${new Date(series[series.length - 1].date).getFullYear()}): ${formatNumber(endValue)} ${units}\n`;
    result += `- Total change: ${change >= 0 ? "+" : ""}${formatNumber(change)} ${units}`;

    // Calculate trend per decade if we have enough data
    if (stats?.trend !== undefined && years >= 10) {
      const trendPerDecade = (change / years) * 10;
      result += `\n- Trend: ${trendPerDecade >= 0 ? "+" : ""}${formatNumber(trendPerDecade)} ${units} per decade`;
    }

    console.log("✅ Trend result:", result);
    return result;
  }

  // For single year/month queries
  const timeLabel = temporal.month
    ? `${getMonthName(temporal.month)} ${temporal.year}`
    : temporal.year
      ? `${temporal.year}`
      : `${formatDate(temporal.startDate)} to ${formatDate(temporal.endDate)}`;

  const scopeLabel = isGlobal
    ? "global"
    : regionName
      ? regionName
      : usesFocusCoordinates && context.location?.name
        ? `in ${context.location.name}`
        : usesFocusCoordinates
          ? `at ${formatNumber(context.location?.latitude ?? 0, 2)}°, ${formatNumber(context.location?.longitude ?? 0, 2)}°`
          : (context.location?.name ??
            `at ${formatNumber(context.location?.latitude ?? 0, 2)}°, ${formatNumber(context.location?.longitude ?? 0, 2)}°`);

  const result = `For ${datasetName}, the average ${scopeLabel} for ${timeLabel} is ${formatNumber(mean)} ${units}.`;
  console.log("✅ Single period result:", result);

  return result;
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

  // Detect specific year
  const hasSpecificYear = /\b(19|20)\d{2}\b/.test(query);

  // Detect relative time periods
  const hasRelativeTime =
    /\b(past|last|recent|previous|over\s+the\s+(?:past|last)?)\s+\d+\s+(year|decade|month)s?/i.test(
      query,
    ) ||
    lower.includes("over time") ||
    lower.includes("changed over") ||
    lower.includes("trend");

  // Detect comparative queries
  const hasComparison =
    lower.includes("highest") ||
    lower.includes("lowest") ||
    lower.includes("warmest") ||
    lower.includes("coldest") ||
    lower.includes("which year") ||
    lower.includes("what year") ||
    lower.includes("compare") ||
    lower.includes("most") ||
    lower.includes("least") ||
    lower.includes("extreme") ||
    lower.includes("maximum") ||
    lower.includes("minimum");

  // Detect data queries
  const hasDataQuery =
    lower.includes("what") ||
    lower.includes("calculate") ||
    lower.includes("find") ||
    lower.includes("get") ||
    lower.includes("show") ||
    lower.includes("provide") ||
    lower.includes("how has") ||
    lower.includes("how did") ||
    lower.includes("identify") ||
    lower.includes("detect");

  // Detect aggregation/measurement terms
  const hasAggregation =
    lower.includes("average") ||
    lower.includes("mean") ||
    lower.includes("total") ||
    lower.includes("temperature") ||
    lower.includes("precipitation") ||
    lower.includes("temp") ||
    lower.includes("changed") ||
    lower.includes("change") ||
    lower.includes("trend") ||
    lower.includes("warming") ||
    lower.includes("cooling");

  const shouldFetch =
    (hasSpecificYear || hasRelativeTime || hasComparison) &&
    hasDataQuery &&
    hasAggregation;

  console.log("shouldFetchDatasetSnippet:", {
    query: query.slice(0, 60),
    hasSpecificYear,
    hasRelativeTime,
    hasComparison,
    hasDataQuery,
    hasAggregation,
    shouldFetch,
  });

  return shouldFetch;
}
