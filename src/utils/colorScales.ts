export interface ColorScale {
  name: string;
  description: string;
  colors: string[];
  domain: [number, number];
  type: 'sequential' | 'diverging' | 'categorical';
}

// Predefined color scales for different data types
export const colorScales: Record<string, ColorScale> = {
  temperature: {
    name: 'Temperature',
    description: 'Blue to red temperature scale',
    colors: [
      '#2563eb', // Cold blue
      '#06b6d4', // Cyan
      '#10b981', // Green
      '#fbbf24', // Yellow
      '#f59e0b', // Orange
      '#ef4444', // Hot red
    ],
    domain: [-30, 30],
    type: 'diverging',
  },

  precipitation: {
    name: 'Precipitation',
    description: 'White to blue precipitation scale',
    colors: [
      '#ffffff', // No precipitation
      '#e0f2fe',
      '#b3e5fc',
      '#81d4fa',
      '#4fc3f7',
      '#29b6f6',
      '#0288d1',
      '#0277bd',
      '#01579b', // Heavy precipitation
    ],
    domain: [0, 300],
    type: 'sequential',
  },

  seaSurfaceTemp: {
    name: 'Sea Surface Temperature',
    description: 'Ocean temperature color scale',
    colors: [
      '#0d1b2a', // Very cold
      '#1b263b',
      '#415a77',
      '#778da9',
      '#e0e1dd',
      '#ffd166',
      '#f77f00',
      '#d62828',
      '#8b0000', // Very warm
    ],
    domain: [-2, 35],
    type: 'sequential',
  },

  windSpeed: {
    name: 'Wind Speed',
    description: 'Wind speed visualization',
    colors: [
      '#f8f9fa', // Calm
      '#e9ecef',
      '#adb5bd',
      '#6c757d',
      '#495057',
      '#343a40',
      '#212529', // Strong wind
    ],
    domain: [0, 25],
    type: 'sequential',
  },

  pressure: {
    name: 'Atmospheric Pressure',
    description: 'Pressure visualization',
    colors: [
      '#8e44ad', // Low pressure
      '#3498db',
      '#2ecc71',
      '#f1c40f',
      '#e67e22',
      '#e74c3c', // High pressure
    ],
    domain: [980, 1040],
    type: 'diverging',
  },
};

// Utility functions for color interpolation
export function interpolateColor(
  color1: string,
  color2: string,
  factor: number
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
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
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

// Get appropriate color scale for dataset
export function getColorScale(datasetId: string): (value: number) => string {
  let scale: ColorScale;

  if (datasetId.includes('temperature') || datasetId.includes('temp')) {
    scale = datasetId.includes('sea')
      ? colorScales.seaSurfaceTemp
      : colorScales.temperature;
  } else if (
    datasetId.includes('precipitation') ||
    datasetId.includes('rain')
  ) {
    scale = colorScales.precipitation;
  } else if (datasetId.includes('wind')) {
    scale = colorScales.windSpeed;
  } else if (datasetId.includes('pressure')) {
    scale = colorScales.pressure;
  } else {
    // Default to temperature scale
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
  numTicks: number = 7
): ColorBarData {
  let scale: ColorScale;

  if (datasetId.includes('temperature') || datasetId.includes('temp')) {
    scale = datasetId.includes('sea')
      ? colorScales.seaSurfaceTemp
      : colorScales.temperature;
  } else if (
    datasetId.includes('precipitation') ||
    datasetId.includes('rain')
  ) {
    scale = colorScales.precipitation;
  } else if (datasetId.includes('wind')) {
    scale = colorScales.windSpeed;
  } else if (datasetId.includes('pressure')) {
    scale = colorScales.pressure;
  } else {
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
    .join(', ');

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
    '#440154',
    '#482777',
    '#3f4a8a',
    '#31678e',
    '#26838f',
    '#1f9d8a',
    '#6cce5a',
    '#b6de2b',
    '#fee825',
  ],
  plasma: [
    '#0d0887',
    '#4b0c6b',
    '#781c6d',
    '#a52c60',
    '#cf4446',
    '#ed6925',
    '#fb9b06',
    '#f7d03c',
    '#f0f921',
  ],
  magma: [
    '#000004',
    '#1c1044',
    '#4f127b',
    '#812581',
    '#b5367a',
    '#e55c30',
    '#fba40a',
    '#f2f013',
  ],
  inferno: [
    '#000004',
    '#1f0c48',
    '#550f6d',
    '#88226a',
    '#a83655',
    '#cc4778',
    '#dc7176',
    '#f8a07e',
    '#fbd7a4',
  ],
};

export function createCustomColorScale(
  name: string,
  colors: string[],
  domain: [number, number],
  type: ColorScale['type'] = 'sequential'
): ColorScale {
  return {
    name,
    description: `Custom ${type} color scale`,
    colors,
    domain,
    type,
  };
}
