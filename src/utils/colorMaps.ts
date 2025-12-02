import rawColorMaps from "@/data/tutorial/colorMaps.json";

type RawColorMapEntry = {
  FullName?: string;
  Values?: Array<string | { Hex?: string; hex?: string; Color?: string }>;
};

const DEFAULT_PALETTE = ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"];

// Use a dense sample so quantized scales retain sharp banding without losing detail.
const SAMPLE_SIZE = 64;

let primaryLookup: Map<string, string[]> | null = null;
let lowerLookup: Map<string, string[]> | null = null;

const toHex = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
};

const sampleColors = (colors: string[], count: number): string[] => {
  if (colors.length <= count) {
    return colors.map(toHex);
  }
  const result: string[] = [];
  const step = (colors.length - 1) / (count - 1);
  for (let index = 0; index < count; index += 1) {
    const colorIndex = Math.round(index * step);
    result.push(toHex(colors[colorIndex]));
  }
  return result;
};

const buildAliases = (name: string): string[] => {
  const aliases = new Set<string>();
  aliases.add(name);
  aliases.add(name.replace(/\|/g, " ").trim());
  name.split("|").forEach((segment) => {
    const trimmed = segment.trim();
    if (trimmed.length > 0) {
      aliases.add(trimmed);
    }
  });
  return Array.from(aliases);
};

const normaliseHexValue = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) {
    const cleaned = value.trim();
    if (/^#?[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(cleaned)) {
      return toHex(cleaned);
    }
  }
  if (
    value &&
    typeof value === "object" &&
    ("Hex" in (value as Record<string, unknown>) ||
      "hex" in (value as Record<string, unknown>) ||
      "Color" in (value as Record<string, unknown>))
  ) {
    const map = value as Record<string, unknown>;
    const candidate =
      (map.Hex as string) || (map.hex as string) || (map.Color as string);
    if (typeof candidate === "string") {
      return normaliseHexValue(candidate);
    }
  }
  return null;
};

const ensureLookup = () => {
  if (primaryLookup && lowerLookup) {
    return;
  }

  primaryLookup = new Map<string, string[]>();
  lowerLookup = new Map<string, string[]>();

  const entries = rawColorMaps as RawColorMapEntry[];

  entries.forEach((entry) => {
    const name = entry.FullName?.trim();
    if (!name) {
      return;
    }

    const values = entry.Values ?? [];
    const colours: string[] = [];

    values.forEach((value) => {
      const hex = normaliseHexValue(value);
      if (hex) {
        colours.push(hex);
      }
    });

    if (!colours.length) {
      return;
    }

    const palette = sampleColors(colours, SAMPLE_SIZE);
    const aliases = buildAliases(name);

    aliases.forEach((alias) => {
      primaryLookup!.set(alias, palette);
      lowerLookup!.set(alias.toLowerCase(), palette);
    });
  });

  if (!primaryLookup.has("viridis")) {
    primaryLookup.set("viridis", DEFAULT_PALETTE);
    lowerLookup!.set("viridis", DEFAULT_PALETTE);
  }
};

export const getColorMapColors = (
  name?: string | null,
  fallback: string[] = DEFAULT_PALETTE,
): string[] => {
  ensureLookup();

  if (!primaryLookup || !lowerLookup) {
    return [...fallback];
  }

  if (!name) {
    return [...fallback];
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return [...fallback];
  }

  const candidates = [
    trimmed,
    trimmed.toLowerCase(),
    trimmed.replace(/\|/g, " ").trim(),
    trimmed.split("|").pop()?.trim() ?? "",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const direct = primaryLookup.get(candidate);
    if (direct) {
      return [...direct];
    }
    const lower = lowerLookup.get(candidate.toLowerCase());
    if (lower) {
      return [...lower];
    }
  }

  return [...fallback];
};

export const DEFAULT_COLOR_PALETTE = [...DEFAULT_PALETTE];
