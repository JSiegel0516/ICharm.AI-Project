type Rgba = [number, number, number, number];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const hexToRgba = (value: string): Rgba => {
  const hex = value.trim().replace("#", "");
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return [r, g, b, 255];
  }
  if (hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = parseInt(hex.slice(6, 8), 16);
    return [r, g, b, a];
  }
  return [0, 0, 0, 255];
};

export const buildColorStops = (colors: string[]): Rgba[] => {
  if (!colors.length) {
    return [[0, 0, 0, 255]];
  }
  return colors.map(hexToRgba);
};

export const interpolateColor = (stops: Rgba[], t: number): Rgba => {
  if (!stops.length) return [0, 0, 0, 255];
  if (stops.length === 1) return stops[0];

  const clamped = clamp01(t);
  const scaled = clamped * (stops.length - 1);
  const lower = Math.floor(scaled);
  const upper = Math.min(stops.length - 1, lower + 1);
  const localT = scaled - lower;

  const a = stops[lower];
  const b = stops[upper];
  return [
    Math.round(a[0] + (b[0] - a[0]) * localT),
    Math.round(a[1] + (b[1] - a[1]) * localT),
    Math.round(a[2] + (b[2] - a[2]) * localT),
    Math.round(a[3] + (b[3] - a[3]) * localT),
  ];
};

export const normalizeValue = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return null;
  const range = max - min;
  if (range <= 0) return 0;
  return clamp01((value - min) / range);
};

export const mapValueToRgba = (
  value: number,
  min: number,
  max: number,
  stops: Rgba[],
): Rgba => {
  const t = normalizeValue(value, min, max);
  if (t === null) return [0, 0, 0, 0];
  return interpolateColor(stops, t);
};
