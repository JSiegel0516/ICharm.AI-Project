import colorMaps from '@/data/colorMaps.json';

export interface PaletteSample {
  name: string;
  rgba: Uint8ClampedArray;
}

type RawColorMap = {
  FullName: string;
  BuildFunction: 'HEX' | 'xorgb';
  Function: string;
  Values: Array<string | { x: number; o?: number; r: number; g: number; b: number }>;
};

const DEFAULT_RESOLUTION = 256;
const registry = new Map<string, Uint8ClampedArray>();

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hexToRgba(hex: string): [number, number, number, number] {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized, 16);
  if (normalized.length === 8) {
    return [
      (bigint >> 24) & 255,
      (bigint >> 16) & 255,
      (bigint >> 8) & 255,
      bigint & 255,
    ];
  }
  if (normalized.length === 6) {
    return [
      (bigint >> 16) & 255,
      (bigint >> 8) & 255,
      bigint & 255,
      255,
    ];
  }
  throw new Error(`Unsupported hex colour: ${hex}`);
}

function interpolateChannels(
  start: [number, number, number, number],
  end: [number, number, number, number],
  t: number,
): [number, number, number, number] {
  return [
    Math.round(start[0] + (end[0] - start[0]) * t),
    Math.round(start[1] + (end[1] - start[1]) * t),
    Math.round(start[2] + (end[2] - start[2]) * t),
    Math.round(start[3] + (end[3] - start[3]) * t),
  ];
}

function buildGradient(
  stops: Array<{ position: number; color: [number, number, number, number] }>,
  resolution: number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(resolution * 4);

  for (let i = 0; i < resolution; i += 1) {
    const t = i / (resolution - 1);
    let idx = 0;

    for (let j = 0; j < stops.length - 1; j += 1) {
      if (t >= stops[j].position && t <= stops[j + 1].position) {
        idx = j;
        break;
      }
    }

    const start = stops[idx];
    const end = stops[idx + 1];
    const span = end.position - start.position || 1;
    const localT = clamp((t - start.position) / span, 0, 1);
    const [r, g, b, a] = interpolateChannels(start.color, end.color, localT);
    const offset = i * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = a;
  }

  return data;
}

function buildFromHex(values: string[], resolution: number): Uint8ClampedArray {
  const step = 1 / Math.max(values.length - 1, 1);
  const stops = values.map((hex, index) => ({
    position: clamp(index * step, 0, 1),
    color: hexToRgba(hex),
  }));
  return buildGradient(stops, resolution);
}

function buildFromXorgb(
  values: Array<{ x: number; o?: number; r: number; g: number; b: number }>,
  resolution: number,
): Uint8ClampedArray {
  const stops = values
    .map((entry) => ({
      position: clamp(entry.x, 0, 1),
      color: [
        Math.round(clamp(entry.r, 0, 1) * 255),
        Math.round(clamp(entry.g, 0, 1) * 255),
        Math.round(clamp(entry.b, 0, 1) * 255),
        Math.round(clamp(entry.o ?? 1, 0, 1) * 255),
      ] as [number, number, number, number],
    }))
    .sort((a, b) => a.position - b.position);
  return buildGradient(stops, resolution);
}

function buildPalette(def: RawColorMap, resolution: number): Uint8ClampedArray {
  if (def.BuildFunction === 'HEX') {
    return buildFromHex(def.Values as string[], resolution);
  }
  if (def.BuildFunction === 'xorgb') {
    return buildFromXorgb(
      def.Values as Array<{ x: number; o?: number; r: number; g: number; b: number }>,
      resolution,
    );
  }
  throw new Error(`Unsupported BuildFunction: ${def.BuildFunction}`);
}

function initialiseRegistry() {
  const raw = colorMaps as RawColorMap[];
  raw.forEach((entry) => {
    const palette = buildPalette(entry, DEFAULT_RESOLUTION);
    registry.set(entry.FullName, palette);
  });
}

initialiseRegistry();

export function getColormap(name?: string | null): Uint8ClampedArray {
  if (name && registry.has(name)) {
    return registry.get(name)!;
  }
  const [first] = registry.values();
  return first;
}

export function listColormaps(): string[] {
  return Array.from(registry.keys());
}

export function samplePaletteHex(
  name: string | null | undefined,
  samples = 6,
): string[] {
  const palette = getColormap(name);
  const result: string[] = [];
  const interval = samples <= 1 ? 0 : DEFAULT_RESOLUTION - 1;

  for (let i = 0; i < samples; i += 1) {
    const idx = Math.round((i / Math.max(samples - 1, 1)) * interval) * 4;
    const r = palette[idx];
    const g = palette[idx + 1];
    const b = palette[idx + 2];
    result.push(`#${r.toString(16).padStart(2, '0')}${g
      .toString(16)
      .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);
  }

  return result;
}

export function generateColorScaleLabels(
  min: number,
  max: number,
  steps: number,
): string[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return Array.from({ length: steps }, () => '');
  }
  const labels: string[] = [];
  for (let i = 0; i < steps; i += 1) {
    const value = min + ((max - min) * i) / Math.max(steps - 1, 1);
    labels.push(Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2));
  }
  return labels;
}
