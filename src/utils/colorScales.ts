export interface ColorScale {
  name: string;
  description: string;
  colors: string[];
  domain: [number, number];
  type: "sequential" | "diverging" | "categorical";
}

// Predefined color scales for different data types
export const colorScales: Record<string, ColorScale> = {
  temperature: {
    name: "Air Temperature",
    description: "Blue to red air temperature scale",
    colors: [
      "#313695", // Deep blue (coldest)
      "#4575b4", // Blue
      "#74add1", // Light blue
      "#abd9e9", // Pale blue
      "#e0f3f8", // Very pale blue
      "#ffffbf", // Pale yellow (neutral)
      "#fee090", // Light orange
      "#fdae61", // Orange
      "#f46d43", // Red-orange
      "#d73027", // Red
      "#a50026", // Deep red (hottest)
    ],
    domain: [-40, 40],
    type: "diverging",
  },

  precipitation: {
    name: "Precipitation",
    description: "Dry to wet precipitation scale",
    colors: [
      "#8B4513", // Saddle brown (very dry)
      "#CD853F", // Peru/tan (dry)
      "#DEB887", // Burlywood (dry-ish)
      "#F0E68C", // Khaki (slightly dry)
      "#90EE90", // Light green (moderate)
      "#98FB98", // Pale green (moderate-wet)
      "#00FA9A", // Medium spring green (wet)
      "#48D1CC", // Medium turquoise (wetter)
      "#4682B4", // Steel blue (very wet)
      "#4169E1", // Royal blue (extremely wet)
      "#0000CD", // Medium blue (wettest)
    ],
    domain: [0, 500],
    type: "sequential",
  },

  seaSurfaceTemp: {
    name: "Sea Surface Temperature",
    description: "Ocean temperature color scale",
    colors: [
      "#08306b", // Very dark blue (coldest)
      "#08519c", // Dark blue
      "#2171b5", // Medium blue
      "#4292c6", // Blue
      "#6baed6", // Light blue
      "#9ecae1", // Pale blue
      "#c6dbef", // Very pale blue
      "#deebf7", // Almost white blue
      "#fee5d9", // Very pale pink
      "#fcbba1", // Pale pink
      "#fc9272", // Light red-pink
      "#fb6a4a", // Pink-red
      "#ef3b2c", // Red
      "#cb181d", // Dark red
      "#99000d", // Very dark red (warmest)
    ],
    domain: [-2, 35],
    type: "sequential",
  },

  windSpeed: {
    name: "Wind Speed",
    description: "Wind speed visualization",
    colors: [
      "#f8f9fa", // Calm
      "#e9ecef",
      "#adb5bd",
      "#6c757d",
      "#495057",
      "#343a40",
      "#212529", // Strong wind
    ],
    domain: [0, 25],
    type: "sequential",
  },

  pressure: {
    name: "Atmospheric Pressure",
    description: "Pressure visualization",
    colors: [
      "#8e44ad", // Low pressure
      "#3498db",
      "#2ecc71",
      "#f1c40f",
      "#e67e22",
      "#e74c3c", // High pressure
    ],
    domain: [980, 1040],
    type: "diverging",
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
  const normalizedValue = (clampedValue - min) / (max - min);

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
    id.includes("airtemp")
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
    id.includes("airtemp")
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
