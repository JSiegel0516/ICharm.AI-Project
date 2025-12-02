import type { ColorScale, Dataset, DatasetBackendDetails } from "@/types";
import { getColorMapColors } from "@/utils/colorMaps";
import { AIR_TEMPERATURE_BASE, SHARP_BANDS } from "@/utils/colorScales";

const reducePalette = (colors: string[], count: number): string[] => {
  if (!colors.length) return [];
  if (count <= 1) return [colors[0]];

  // Resample (upsample or downsample) so every scale gets the same sharp banding.
  const result: string[] = [];
  const step = (colors.length - 1) / (count - 1);

  const hexToRgb = (hex: string) => {
    const clean = hex.replace("#", "");
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  };

  const rgbToHex = (r: number, g: number, b: number) =>
    `#${[r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;

  for (let i = 0; i < count; i += 1) {
    const position = i * step;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.min(colors.length - 1, lowerIndex + 1);
    const t = position - lowerIndex;

    if (upperIndex === lowerIndex || t === 0) {
      result.push(colors[lowerIndex]);
    } else {
      const lower = hexToRgb(colors[lowerIndex]);
      const upper = hexToRgb(colors[upperIndex]);
      const r = lower.r + (upper.r - lower.r) * t;
      const g = lower.g + (upper.g - lower.g) * t;
      const b = lower.b + (upper.b - lower.b) * t;
      result.push(rgbToHex(r, g, b));
    }
  }

  return result;
};

export interface BackendDatasetRecord {
  id?: string; // ⭐ Add database ID
  slug?: string; // ⭐ Add slug from database
  sourceName?: string;
  datasetName: string;
  layerParameter?: string;
  statistic?: string;
  datasetType?: string;
  levels?: string | null;
  levelValues?: string | null;
  levelUnits?: string | null;
  Stored?: string | null;
  stored?: string | null;
  inputFile?: string | null;
  keyVariable?: string | null;
  units?: string | null;
  spatialResolution?: string | null;
  engine?: string | null;
  kerchunkPath?: string | null;
  origLocation?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

type DataCategory = Dataset["dataType"] | "default";

const COLORMAP_NAMES = {
  temperature: "Color Brewer 2.0|Diverging|Zero Centered|11-class RdYlBu",
  seaSurface: "Matlab|Jet",
  precipitation: "Color Brewer 2.0|Sequential|Multi-hue|9-class YlGnBu",
  wind: "Color Brewer 2.0|Sequential|Single-hue|9-class Greys",
  pressure: "Matlab|Bone",
  humidity: "Color Brewer 2.0|Sequential|Single-hue|9-class Greens",
  default: "Other|Gray scale",
};

const buildColormapScale = (
  colormapName: string,
  min: number,
  max: number,
  labels: string[],
  paletteOverride?: string[],
): ColorScale => ({
  min,
  max,
  colors: reducePalette(
    paletteOverride ?? getColorMapColors(colormapName),
    SHARP_BANDS,
  ),
  labels,
});

export const DEFAULT_COLOR_SCALES: Record<DataCategory, ColorScale> = {
  temperature: buildColormapScale(
    COLORMAP_NAMES.temperature,
    -40,
    40,
    ["-40", "-20", "0", "20", "40"],
    AIR_TEMPERATURE_BASE,
  ),
  precipitation: buildColormapScale(COLORMAP_NAMES.precipitation, 0, 500, [
    "0",
    "100",
    "200",
    "300",
    "400",
    "500",
  ]),
  wind: buildColormapScale(COLORMAP_NAMES.wind, 0, 25, [
    "0",
    "5",
    "10",
    "15",
    "20",
    "25",
  ]),
  pressure: buildColormapScale(COLORMAP_NAMES.pressure, 900, 1050, [
    "900",
    "940",
    "980",
    "1020",
    "1050",
  ]),
  humidity: buildColormapScale(COLORMAP_NAMES.humidity, 0, 100, [
    "0",
    "25",
    "50",
    "75",
    "100",
  ]),
  default: buildColormapScale(COLORMAP_NAMES.default, 0, 1, [
    "Low",
    "",
    "",
    "",
    "High",
  ]),
};

export function cloneColorScale(scale: ColorScale): ColorScale {
  return {
    min: scale.min,
    max: scale.max,
    colors: [...scale.colors],
    labels: [...scale.labels],
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferDataType(record: BackendDatasetRecord): Dataset["dataType"] {
  const target = [record.datasetName, record.layerParameter, record.datasetType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (target.includes("precip")) {
    return "precipitation";
  }
  if (target.includes("wind")) {
    return "wind";
  }
  if (target.includes("pressure") || target.includes("geopotential")) {
    return "pressure";
  }
  if (target.includes("vegetation") || target.includes("ndvi")) {
    return "humidity";
  }
  return "temperature";
}

function inferTemporalResolution(
  statistic?: string,
): Dataset["temporalResolution"] {
  const value = (statistic || "").toLowerCase();
  if (value.includes("hour")) {
    return "hourly";
  }
  if (value.includes("daily")) {
    return "daily";
  }
  if (value.includes("year")) {
    return "yearly";
  }
  return "monthly";
}

function normalizeUnits(units?: string | null, dataType?: string): string {
  if (units && units.toLowerCase() !== "none") {
    return units;
  }

  if (!dataType) {
    return "units";
  }

  switch (dataType) {
    case "temperature":
      return "degC";
    case "precipitation":
      return "mm/day";
    case "wind":
      return "m/s";
    case "pressure":
      return "hPa";
    case "humidity":
      return "%";
    default:
      return "units";
  }
}

function parseLevelValues(value?: string | null): number[] {
  if (!value || value.toLowerCase() === "none") {
    return [];
  }

  return value
    .split(",")
    .map((entry) => parseFloat(entry.trim()))
    .filter((entry) => Number.isFinite(entry));
}

function toIsoDate(input?: string | null): string | null {
  if (!input) {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  const parts = trimmed.split(/[\/\-]/).map((segment) => segment.trim());
  if (parts.length === 3) {
    const [year, month, day] = parts.map((segment) => segment.padStart(2, "0"));
    const isoDate = `${year}-${month}-${day}`;
    const validation = new Date(isoDate);
    if (!Number.isNaN(validation.getTime())) {
      return isoDate;
    }
  }

  return trimmed;
}

function buildBackendDetails(
  record: BackendDatasetRecord,
): DatasetBackendDetails {
  const storedValue = (record.Stored ?? record.stored ?? "").toLowerCase();

  return {
    id: record.id ?? null,
    slug: record.slug ?? null,
    sourceName: record.sourceName ?? null,
    datasetName: record.datasetName,
    layerParameter: record.layerParameter ?? null,
    statistic: record.statistic ?? null,
    datasetType: record.datasetType ?? null,
    levels: record.levels ?? null,
    levelValues: parseLevelValues(record.levelValues),
    levelUnits: record.levelUnits ?? null,
    stored:
      storedValue === "local" || storedValue === "cloud" ? storedValue : null,
    inputFile: record.inputFile ?? null,
    keyVariable: record.keyVariable ?? null,
    units: record.units ?? null,
    spatialResolution: record.spatialResolution ?? null,
    engine:
      record.engine && record.engine.toLowerCase() !== "none"
        ? record.engine
        : null,
    kerchunkPath:
      record.kerchunkPath && record.kerchunkPath.toLowerCase() !== "none"
        ? record.kerchunkPath
        : null,
    origLocation: record.origLocation ?? null,
    startDate: toIsoDate(record.startDate),
    endDate: toIsoDate(record.endDate),
  };
}

export function normalizeDataset(record: BackendDatasetRecord): Dataset {
  const dataType = inferDataType(record);
  const colorKey: DataCategory =
    dataType in DEFAULT_COLOR_SCALES ? dataType : "default";
  const baseColorScale = DEFAULT_COLOR_SCALES[colorKey];
  const resolvedSlug = record.slug || slugify(record.datasetName);

  return {
    // ⭐ Use slug from database if available, otherwise fall back to slugified name
    id: resolvedSlug,
    slug: resolvedSlug, // ⭐ Add slug field
    backendId: record.id ?? null,
    backendSlug: record.slug ?? null,
    name: record.datasetName,
    description: [record.layerParameter, record.statistic]
      .filter(Boolean)
      .join(" • "),
    units: normalizeUnits(record.units, dataType),
    dataType,
    temporalResolution: inferTemporalResolution(record.statistic),
    colorScale: cloneColorScale(baseColorScale),
    backend: buildBackendDetails(record),
  };
}

export function normalizeDatasets(records: BackendDatasetRecord[]): Dataset[] {
  return records.map(normalizeDataset);
}
