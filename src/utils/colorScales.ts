import { getColorMapColors } from "@/utils/colorMaps";

export interface ColorScale {
  name: string;
  description: string;
  colors: string[];
  domain: [number, number];
  type: "sequential" | "diverging" | "categorical";
  quantized?: boolean;
}

const reducePalette = (colors: string[], count: number): string[] => {
  if (!colors.length) return [];
  if (count <= 1) return [colors[0]];

  // Resample the palette so every scale has consistent sharp banding.
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
  // *
  return result;
};

export const SHARP_BANDS = 101;
export const AIR_TEMPERATURE_BASE = [
  "#4c1a7f", // Deep purple
  "#3b4cc0", // Blue
  "#1fa188", // Teal/green
  "#5ac864", // Green
  "#a5e26a", // Yellow-green
  "#f1f9b5ff", // Pale yellow
  "#f5cf71", // Warm yellow
  "#f7a258", // Orange
  "#ed7953", // Coral
  "#d3504b", // Red-orange
  "#c41e3a", // Deep red
];
const CLIP_LOWER = 0.02;
const CLIP_UPPER = 0.98;
const GAMMA = 0.85;

const AIR_TEMPERATURE_COLORS = AIR_TEMPERATURE_BASE;

// Bias toward sharper mid-blues to avoid blending near the neutral range.
const SEA_SURFACE_TEMPERATURE_COLORS = getColorMapColors("Matlab|Jet", [
  "#00008F", // Deep cold
  "#0000AF",
  "#0000DF",
  "#0000FF",
  "#0028FF",
  "#0050FF",
  "#0070FF",
  "#008FFF", // Emphasized mid-blue
  "#00BFFF",
  "#00EFFF",
  "#20FFDF",
  "#60FF9F",
  "#AFFF50",
  "#FFFF00",
  "#FF9F00",
  "#FF3000",
  "#BF0000",
  "#800000", // Hottest
]);

const PRECIP_COLORS = getColorMapColors(
  "Color Brewer 2.0|Sequential|Multi-hue|9-class YlGnBu",
);

const WIND_COLORS = getColorMapColors(
  "Color Brewer 2.0|Sequential|Single-hue|9-class Greys",
);

const PRESSURE_COLORS = getColorMapColors("Matlab|Bone");

const HUMIDITY_COLORS = getColorMapColors(
  "Color Brewer 2.0|Sequential|Single-hue|9-class Greens",
);

// NOAA Global Surface Temp anomaly palette (inspired by provided swatch)
export const ANOMALY_PALETTE_BASE = [
  "#0000ff", // Deep cold
  "#003cff", // Cold blue
  "#006dff", // Bright blue
  "#00a2ff", // Cyan blue
  "#48d8ff", // Light cyan
  "#a1f6ff", // Very light cyan
  "#fbd26aff", // Pale warm neutral
  "#fe9f22ff", // Warm tan
  "#fd8856ff", // Soft orange
  "#ef4949", // Warm red
  "#b6002f", // Deep hot
];

const AIR_TEMPERATURE_BANDS = reducePalette(
  AIR_TEMPERATURE_COLORS,
  SHARP_BANDS,
);
const SEA_SURFACE_TEMPERATURE_BANDS = reducePalette(
  SEA_SURFACE_TEMPERATURE_COLORS,
  SHARP_BANDS,
);
const ANOMALY_BANDS = reducePalette(ANOMALY_PALETTE_BASE, SHARP_BANDS);
const PRECIP_BANDS = reducePalette(PRECIP_COLORS, SHARP_BANDS);
const WIND_BANDS = reducePalette(WIND_COLORS, SHARP_BANDS);
const PRESSURE_BANDS = reducePalette(PRESSURE_COLORS, SHARP_BANDS);
const HUMIDITY_BANDS = reducePalette(HUMIDITY_COLORS, SHARP_BANDS);

const COLOR_MAP_NAMES = [
  "dataset-default",
  "Anomaly|NOAA Diverging",
  "Anomaly|Blue White Brown",
  "Anomaly|Blue Yellow Red",
  "Anomaly|Blue White Red",
  "Matlab|Seasons|Autumn",
  "Matlab|Seasons|Winter",
  "Matlab|Seasons|Summer",
  "Matlab|Seasons|Spring",
  "Matlab|Jet",
  "Matlab|Hsv",
  "Matlab|Hot",
  "Matlab|Cool",
  "Matlab|Bone",
  "Matlab|Copper",
  "Color Brewer 2.0|Diverging|Zero Centered|11-class BrBG",
  "Color Brewer 2.0|Diverging|Zero Centered|11-class PiYG",
  "Color Brewer 2.0|Diverging|Zero Centered|11-class PRGn",
  "Color Brewer 2.0|Diverging|Zero Centered|11-class PuOr",
  "Color Brewer 2.0|Diverging|Zero Centered|11-class RdBu",
  "Color Brewer 2.0|Diverging|Zero Centered|11-class RdGy",
  "Color Brewer 2.0|Diverging|Zero Centered|11-class RdYlBu",
  "Color Brewer 2.0|Diverging|Zero Centered|11-class RdYlGn",
  "Color Brewer 2.0|Diverging|Zero Centered|11-class Spectral",
  "Color Brewer 2.0|Diverging|Non Centered|11-class BrBG",
  "Color Brewer 2.0|Diverging|Non Centered|11-class PiYG",
  "Color Brewer 2.0|Diverging|Non Centered|11-class PRGn",
  "Color Brewer 2.0|Diverging|Non Centered|11-class PuOr",
  "Color Brewer 2.0|Diverging|Non Centered|11-class RdBu",
  "Color Brewer 2.0|Diverging|Non Centered|11-class RdGy",
  "Color Brewer 2.0|Diverging|Non Centered|11-class RdYlBu",
  "Color Brewer 2.0|Diverging|Non Centered|11-class RdYlGn",
  "Color Brewer 2.0|Diverging|Non Centered|11-class Spectral",
  "Color Brewer 2.0|Sequential|Multi-hue|9-class BuGn",
  "Color Brewer 2.0|Sequential|Multi-hue|9-class BuPu",
  "Color Brewer 2.0|Sequential|Multi-hue|9-class GnBu",
  "Color Brewer 2.0|Sequential|Multi-hue|9-class OrRd",
  "Color Brewer 2.0|Sequential|Multi-hue|9-class PuBu",
  "Color Brewer 2.0|Sequential|Multi-hue|9-class PuBuGn",
  "Color Brewer 2.0|Sequential|Multi-hue|9-class PuRd",
  "Color Brewer 2.0|Sequential|Multi-hue|9-class RdPu",
  "Color Brewer 2.0|Sequential|Multi-hue|9-class YlGn",
  "Color Brewer 2.0|Sequential|Multi-hue|9-class YlGnBu",
  "Color Brewer 2.0|Sequential|Multi-hue|9-class YlOrBr",
  "Color Brewer 2.0|Sequential|Multi-hue|9-class YlOrRd",
  "Color Brewer 2.0|Sequential|Single-hue|9-class Blues",
  "Color Brewer 2.0|Sequential|Single-hue|9-class Greens",
  "Color Brewer 2.0|Sequential|Single-hue|9-class Greys",
  "Color Brewer 2.0|Sequential|Single-hue|9-class Oranges",
  "Color Brewer 2.0|Sequential|Single-hue|9-class Purples",
  "Color Brewer 2.0|Sequential|Single-hue|9-class Reds",
  "Other|Blackbody Radiation",
  "Other|Cool to Warm",
  "Other|Rainbow",
  "Other|Gray scale",
  "Other|Spatial Contrast Mesh 3 scale",
];

// Palette overrides to match legacy/screenshot expectations.
const COLOR_MAP_OVERRIDES: Record<string, string[]> = {
  "Anomaly|NOAA Diverging": [
    "#2633cc",
    "#3a55db",
    "#5f79ea",
    "#8da0f3",
    "#c0c9f9",
    "#f2f2f2",
    "#f1c5bd",
    "#e9958d",
    "#de5f58",
    "#cc2f2b",
    "#9f0f1a",
  ],
  "Anomaly|Blue White Brown": [
    "#0b2a6b",
    "#2b5aa3",
    "#5f88bf",
    "#9fb6d7",
    "#e7edf4",
    "#f2f2f2",
    "#d8b39a",
    "#b07c57",
    "#7b4a2f",
    "#4b2416",
  ],
  "Anomaly|Blue Yellow Red": [
    "#1b2a7a",
    "#2f5bb0",
    "#5a89d6",
    "#8bb7f0",
    "#c6e6ff",
    "#f5f3b3",
    "#f8d257",
    "#f3a12f",
    "#e45e23",
    "#b3201d",
  ],
  "Anomaly|Blue White Red": [
    "#2d00ff",
    "#2c5bff",
    "#45b2ff",
    "#8be9ff",
    "#f3f3f3",
    "#ffd0a1",
    "#ff9a5f",
    "#ff5b4f",
    "#c3002b",
  ],
  "Other|Blackbody Radiation": ["#ffff00", "#ff8000", "#b00000", "#000000"],
  "Other|Cool to Warm": ["#b40426", "#f6f6f6", "#3b4cc0"],
  "Other|Rainbow": [
    "#ff0000",
    "#ff7f00",
    "#ffff00",
    "#00ff00",
    "#00ffff",
    "#0000ff",
    "#8b00ff",
  ],
  "Other|Gray scale": ["#000000", "#555555", "#aaaaaa", "#ffffff"],
  "Other|Spatial Contrast Mesh 3 scale": [
    "#3b82f6",
    "#80d4ff",
    "#ffffff",
    "#ffb374",
    "#ff4c2e",
  ],
};

export const resolveColorMapColors = (name: string): string[] => {
  if (name === "dataset-default") {
    return ["#1d4ed8", "#10b981", "#facc15", "#f97316", "#ef4444"];
  }
  if (COLOR_MAP_OVERRIDES[name]) {
    return COLOR_MAP_OVERRIDES[name];
  }
  return getColorMapColors(name);
};

export const COLOR_MAP_PRESETS = COLOR_MAP_NAMES.map((name) => {
  const isDefault = name === "dataset-default";
  const baseColors = resolveColorMapColors(name);
  const colors = reducePalette(baseColors, Math.min(21, baseColors.length));

  const gradient = colors
    .map((color, index) => {
      const position =
        colors.length === 1
          ? 0
          : Math.round((index / (colors.length - 1)) * 100);
      return `${color} ${position}%`;
    })
    .join(", ");

  return {
    id: name,
    label: isDefault ? "Dataset Default" : name.replace(/\|/g, " | "),
    colors,
    gradient,
  };
});

// Predefined color scales for different data types
export const colorScales: Record<string, ColorScale> = {
  temperature: {
    name: "Air Temperature",
    description: "Blue to red air temperature scale",
    colors: AIR_TEMPERATURE_BANDS,
    domain: [-40, 40],
    type: "diverging",
    quantized: true,
  },

  precipitation: {
    name: "Precipitation",
    description: "Dry to wet precipitation scale",
    colors: PRECIP_BANDS,
    domain: [0, 500],
    type: "sequential",
    quantized: true,
  },

  seaSurfaceTemp: {
    name: "Sea Surface Temperature",
    description: "Ocean temperature color scale",
    colors: SEA_SURFACE_TEMPERATURE_BANDS,
    domain: [-2, 35],
    type: "sequential",
    quantized: true,
  },

  windSpeed: {
    name: "Wind Speed",
    description: "Wind speed visualization",
    colors: WIND_BANDS,
    domain: [0, 25],
    type: "sequential",
    quantized: true,
  },

  pressure: {
    name: "Atmospheric Pressure",
    description: "Pressure visualization",
    colors: PRESSURE_BANDS,
    domain: [980, 1040],
    type: "diverging",
    quantized: true,
  },

  humidity: {
    name: "Humidity",
    description: "Relative humidity visualization",
    colors: HUMIDITY_BANDS,
    domain: [0, 100],
    type: "sequential",
    quantized: true,
  },

  anomaly: {
    name: "NOAA Global Temp Anomaly",
    description: "Symmetric anomaly palette (NOAAGlobalTemp-inspired)",
    colors: ANOMALY_BANDS,
    domain: [-2, 2],
    type: "diverging",
    quantized: true,
  },
};

// Utility functions for color interpolation
export function interpolateColor(
  color1: string,
  color2: string,
  factor: number,
): string {
  // Convert hex to RGB
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  };

  // Convert RGB to hex
  const rgbToHex = (r: number, g: number, b: number) => {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };

  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);

  const r = Math.round(c1.r + factor * (c2.r - c1.r));
  const g = Math.round(c1.g + factor * (c2.g - c1.g));
  const b = Math.round(c1.b + factor * (c2.b - c1.b));

  return rgbToHex(r, g, b);
}

export function getColorFromScale(value: number, scale: ColorScale): string {
  const { colors, domain } = scale;
  const [min, max] = domain;

  // Clamp value to domain
  const clampedValue = Math.max(min, Math.min(max, value));

  // Normalize to 0-1
  const normalizedRaw = (clampedValue - min) / (max - min);
  const normalizedClipped = Math.min(
    1,
    Math.max(0, (normalizedRaw - CLIP_LOWER) / (CLIP_UPPER - CLIP_LOWER)),
  );
  const normalizedValue = Math.pow(normalizedClipped, GAMMA);

  // For quantized scales, snap to the nearest band for sharper separation.
  if (scale.quantized) {
    const idx = Math.round(normalizedValue * (colors.length - 1));
    return colors[Math.min(colors.length - 1, Math.max(0, idx))];
  }

  // Map to color array index
  const colorIndex = normalizedValue * (colors.length - 1);
  const lowerIndex = Math.floor(colorIndex);
  const upperIndex = Math.ceil(colorIndex);

  if (lowerIndex === upperIndex) {
    return colors[lowerIndex];
  }

  // Interpolate between adjacent colors
  const factor = colorIndex - lowerIndex;
  return interpolateColor(colors[lowerIndex], colors[upperIndex], factor);
}

// Get appropriate color scale for dataset - enhanced with better matching
export function getColorScale(datasetId: string): (value: number) => string {
  let scale: ColorScale;

  const id = datasetId.toLowerCase();

  // Check for sea surface temperature first (more specific)
  if (id.includes("sst") || id.includes("sea") || id.includes("ocean")) {
    scale = colorScales.seaSurfaceTemp;
  }
  // Then check for general temperature
  else if (
    id.includes("temperature") ||
    id.includes("temp") ||
    id.includes("airtemp") ||
    id.includes("air")
  ) {
    scale = colorScales.temperature;
  }
  // Check for precipitation
  else if (
    id.includes("precipitation") ||
    id.includes("precip") ||
    id.includes("rain")
  ) {
    scale = colorScales.precipitation;
  }
  // Check for wind
  else if (id.includes("wind")) {
    scale = colorScales.windSpeed;
  }
  // Check for humidity
  else if (id.includes("humidity") || id.includes("moisture")) {
    scale = colorScales.humidity;
  }
  // Check for pressure
  else if (id.includes("pressure")) {
    scale = colorScales.pressure;
  }
  // Default to temperature scale
  else {
    scale = colorScales.temperature;
  }

  return (value: number) => getColorFromScale(value, scale);
}

// Generate color bar data for UI components
export interface ColorBarData {
  scale: ColorScale;
  ticks: Array<{
    value: number;
    color: string;
    label: string;
  }>;
  gradient: string;
}

export function generateColorBarData(
  datasetId: string,
  numTicks: number = 7,
): ColorBarData {
  let scale: ColorScale;

  const id = datasetId.toLowerCase();

  // Check for sea surface temperature first (more specific)
  if (id.includes("sst") || id.includes("sea") || id.includes("ocean")) {
    scale = colorScales.seaSurfaceTemp;
  }
  // Then check for general temperature
  else if (
    id.includes("temperature") ||
    id.includes("temp") ||
    id.includes("airtemp") ||
    id.includes("air")
  ) {
    scale = colorScales.temperature;
  }
  // Check for precipitation
  else if (
    id.includes("precipitation") ||
    id.includes("precip") ||
    id.includes("rain")
  ) {
    scale = colorScales.precipitation;
  }
  // Check for wind
  else if (id.includes("wind")) {
    scale = colorScales.windSpeed;
  }
  // Check for humidity
  else if (id.includes("humidity") || id.includes("moisture")) {
    scale = colorScales.humidity;
  }
  // Check for pressure
  else if (id.includes("pressure")) {
    scale = colorScales.pressure;
  }
  // Default
  else {
    scale = colorScales.temperature;
  }

  const [min, max] = scale.domain;
  const ticks = [];

  // Generate evenly spaced ticks
  for (let i = 0; i < numTicks; i++) {
    const value = min + (i / (numTicks - 1)) * (max - min);
    const color = getColorFromScale(value, scale);
    const label = formatTickLabel(value, scale);

    ticks.push({ value, color, label });
  }

  // Create CSS gradient string
  const gradientStops = scale.colors
    .map((color, index) => {
      if (scale.quantized) {
        // Duplicate stops to create hard bands instead of smooth gradients.
        const start = (index / scale.colors.length) * 100;
        const end = ((index + 1) / scale.colors.length) * 100;
        return `${color} ${start}%, ${color} ${end}%`;
      }
      const position = (index / (scale.colors.length - 1)) * 100;
      return `${color} ${position}%`;
    })
    .join(", ");

  const gradient = `linear-gradient(to top, ${gradientStops})`;

  return {
    scale,
    ticks,
    gradient,
  };
}

function formatTickLabel(value: number, scale: ColorScale): string {
  // Format based on the typical range of values
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  } else if (Math.abs(value) >= 100) {
    return value.toFixed(0);
  } else if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  } else {
    return value.toFixed(2);
  }
}

// Color scale presets for different visualization needs
export const colorScalePresets = {
  viridis: [
    "#440154",
    "#482777",
    "#3f4a8a",
    "#31678e",
    "#26838f",
    "#1f9d8a",
    "#6cce5a",
    "#b6de2b",
    "#fee825",
  ],
  plasma: [
    "#0d0887",
    "#4b0c6b",
    "#781c6d",
    "#a52c60",
    "#cf4446",
    "#ed6925",
    "#fb9b06",
    "#f7d03c",
    "#f0f921",
  ],
  magma: [
    "#000004",
    "#1c1044",
    "#4f127b",
    "#812581",
    "#b5367a",
    "#e55c30",
    "#fba40a",
    "#f2f013",
  ],
  inferno: [
    "#000004",
    "#1f0c48",
    "#550f6d",
    "#88226a",
    "#a83655",
    "#cc4778",
    "#dc7176",
    "#f8a07e",
    "#fbd7a4",
  ],
};

export function createCustomColorScale(
  name: string,
  colors: string[],
  domain: [number, number],
  type: ColorScale["type"] = "sequential",
): ColorScale {
  return {
    name,
    description: `Custom ${type} color scale`,
    colors,
    domain,
    type,
  };
}
