import type { ColorScale } from "@/types";
import type { ClimateDatasetRecord, Dataset } from "@/types";
import { getColorMapColors } from "@/utils/colorMaps";
import {
  AIR_TEMPERATURE_BASE,
  SHARP_BANDS,
  resolveColorMapColors,
} from "@/utils/colorScales";

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

export function parseLevelValues(value?: string | null): number[] {
  if (!value || value.trim() === "" || value.toLowerCase() === "none") {
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

function validateDataType(
  type: string | null | undefined,
): "temperature" | "precipitation" | "wind" | "pressure" | "humidity" {
  const normalized = type?.toLowerCase();

  switch (normalized) {
    case "temperature":
    case "precipitation":
    case "wind":
    case "pressure":
    case "humidity":
      return normalized;
    default:
      return "temperature";
  }
}

function deriveTemporalResolution(
  datasetName?: string,
): "hourly" | "daily" | "monthly" | "yearly" {
  const name = datasetName?.toLowerCase() || "";
  if (name.includes("hourly")) return "hourly";
  if (name.includes("monthly")) return "monthly";
  if (name.includes("yearly") || name.includes("annual")) return "yearly";
  return "daily";
}

export function generateColorScale(
  datasetName: string,
  parameter: string | null | undefined,
  units: string | null | undefined,
): ColorScale {
  const name = datasetName.toLowerCase();
  const param = (parameter || "").toLowerCase();
  const unitsLower = (units || "").toLowerCase();

  const buildScale = (
    colors: string[],
    labels: string[],
    min: number,
    max: number,
  ): ColorScale => ({
    labels,
    colors: reducePalette(colors, SHARP_BANDS),
    min,
    max,
  });

  const SST_COLORS = getColorMapColors("Matlab|Jet");
  const AIR_COLORS = AIR_TEMPERATURE_BASE;
  const ANOMALY_COLORS = resolveColorMapColors("Anomaly|Blue Yellow Red");
  const PRECIP_COLORS = getColorMapColors(
    "Color Brewer 2.0|Sequential|Multi-hue|9-class YlGnBu",
  );
  const WIND_COLORS = getColorMapColors(
    "Color Brewer 2.0|Sequential|Single-hue|9-class Greys",
  );
  const PRESSURE_COLORS = getColorMapColors("Matlab|Bone");
  const DEFAULT_COLORS = getColorMapColors("Other|Gray scale");

  // Check for Sea Surface Temperature first (more specific)
  if (
    name.includes("sst") ||
    name.includes("sea surface temperature") ||
    name.includes("amsre") ||
    name.includes("modis") ||
    param.includes("sea surface")
  ) {
    return buildScale(
      SST_COLORS,
      ["-2°C", "5°C", "12°C", "18°C", "25°C", "32°C"],
      -2,
      35,
    );
  }

  // Anomaly datasets
  if (
    name.includes("anomal") ||
    param.includes("anomaly") ||
    param.includes("t_an") ||
    unitsLower.includes("anomaly")
  ) {
    return buildScale(ANOMALY_COLORS, ["-2", "-1", "0", "1", "2"], -2, 2);
  }

  // GODAS vertical velocity
  if (
    name.includes("godas") ||
    name.includes("global ocean data assimilation system") ||
    name.includes("ncep global ocean data assimilation") ||
    param.includes("dzdt")
  ) {
    const GODAS_COLORS = resolveColorMapColors("Anomaly|Blue Yellow Red");
    return buildScale(
      GODAS_COLORS,
      ["-0.000005", "0", "0.000005"],
      -0.000005,
      0.000005,
    );
  }

  // Air Temperature scales
  if (
    name.includes("noaaglobaltemp") ||
    name.includes("noaa global surface temperature") ||
    name.includes("noaa global temp") ||
    name.includes("noaa global temperature")
  ) {
    return buildScale(ANOMALY_COLORS, ["-2", "-1", "0", "1", "2"], -2, 2);
  }

  if (
    name.includes("air") ||
    name.includes("airtemp") ||
    param.includes("air temperature") ||
    param.includes("temperature") ||
    unitsLower.includes("degc") ||
    unitsLower.includes("kelvin")
  ) {
    return buildScale(
      AIR_COLORS,
      ["-40°C", "-20°C", "0°C", "20°C", "40°C"],
      -40,
      40,
    );
  }

  // Precipitation scales
  if (
    name.includes("precip") ||
    name.includes("precipitation") ||
    name.includes("rain") ||
    param.includes("precipitation") ||
    unitsLower.includes("mm")
  ) {
    return buildScale(
      PRECIP_COLORS,
      ["0", "100", "200", "300", "400", "500"],
      0,
      500,
    );
  }

  // Wind/velocity scales
  if (
    param.includes("velocity") ||
    param.includes("wind") ||
    unitsLower.includes("m/s")
  ) {
    return buildScale(
      WIND_COLORS,
      ["0 m/s", "5 m/s", "10 m/s", "15 m/s", "20 m/s", "25 m/s"],
      0,
      25,
    );
  }

  if (param.includes("pressure")) {
    return buildScale(
      PRESSURE_COLORS,
      ["900", "940", "980", "1020", "1050"],
      900,
      1050,
    );
  }

  // Default scale
  return buildScale(
    DEFAULT_COLORS,
    ["Low", "Medium-Low", "Medium", "Medium-High", "High"],
    0,
    100,
  );
}

export function transformBackendDataset(record: ClimateDatasetRecord): Dataset {
  const storedValue = (record.Stored ?? record.stored ?? "").toLowerCase();
  const stored =
    storedValue === "local" || storedValue === "cloud" ? storedValue : null;

  return {
    // Core identifiers
    id: record.id,
    slug: record.slug ?? null,

    // Display information
    name: record.datasetName,
    description: `${record.description}`,

    // Data classification
    dataType: validateDataType(record.datasetType),
    units: record.units || "",

    // Visual representation (you'll need to implement this)
    colorScale: generateColorScale(
      record.datasetName,
      record.layerParameter,
      record.units,
    ),

    // Temporal information
    temporalResolution: deriveTemporalResolution(record.datasetName),
    startDate: record.startDate ? new Date(record.startDate) : new Date(),
    endDate: record.endDate ? new Date(record.endDate) : new Date(),

    // Backend/source details (flattened)
    sourceName: record.sourceName ?? null,
    layerParameter: record.layerParameter ?? null,
    statistic: record.statistic ?? null,

    // Level information (parsed)
    levels: record.levels ?? null,
    levelValues: parseLevelValues(record.levelValues),
    levelUnits: record.levelUnits ?? null,

    // Storage and processing
    stored,
    inputFile: record.inputFile ?? null,
    keyVariable: record.keyVariable ?? null,
    spatialResolution: record.spatialResolution ?? null,
    engine: record.engine ?? null,
    kerchunkPath: record.kerchunkPath ?? null,
    origLocation: record.origLocation ?? null,

    // Timestamps
    createdAt: record.createdAt ?? null,
    updatedAt: record.updatedAt ?? null,
  };
}
