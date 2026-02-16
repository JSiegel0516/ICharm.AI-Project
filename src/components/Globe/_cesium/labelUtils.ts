import type { LabelKind } from "@/lib/labels/openlayersVectorTiles";

export const heightToTileZoom = (height: number) => {
  if (height > 20_000_000) return 2;
  if (height > 15_000_000) return 4;
  if (height > 8_000_000) return 5;
  if (height > 3_000_000) return 7;
  if (height > 1_500_000) return 8;
  if (height > 800_000) return 9;
  if (height > 400_000) return 10;
  return 11;
};

export const heightToTileZoomFloat = (height: number) => {
  const levels = [
    { zoom: 2, height: 20_000_000 },
    { zoom: 4, height: 15_000_000 },
    { zoom: 5.5, height: 8_000_000 },
    { zoom: 7, height: 3_000_000 },
    { zoom: 8, height: 1_500_000 },
    { zoom: 9.5, height: 800_000 },
    { zoom: 10.5, height: 400_000 },
    { zoom: 12, height: 0 },
  ];
  if (height >= levels[0].height) return levels[0].zoom;
  for (let i = 0; i < levels.length - 1; i += 1) {
    const current = levels[i];
    const next = levels[i + 1];
    if (height <= current.height && height >= next.height) {
      const t = (height - next.height) / (current.height - next.height || 1);
      return current.zoom + (1 - t) * (next.zoom - current.zoom);
    }
  }
  return levels[levels.length - 1].zoom;
};

export const getLabelTier = (zoom: number) => {
  if (zoom <= 4) {
    return {
      display: ["continent"] as LabelKind[],
      eligible: ["continent"] as LabelKind[],
    };
  }
  if (zoom <= 5.5) {
    return {
      display: ["continent", "country"] as LabelKind[],
      eligible: ["continent", "country"] as LabelKind[],
    };
  }
  if (zoom <= 7) {
    return {
      display: ["country", "state"] as LabelKind[],
      eligible: ["country", "state"] as LabelKind[],
    };
  }
  if (zoom <= 8) {
    return {
      display: ["state", "cityLarge"] as LabelKind[],
      eligible: ["state", "cityLarge"] as LabelKind[],
    };
  }
  if (zoom <= 9.5) {
    return {
      display: ["cityLarge", "cityMedium"] as LabelKind[],
      eligible: ["cityLarge", "cityMedium"] as LabelKind[],
    };
  }
  return {
    display: ["cityMedium", "citySmall"] as LabelKind[],
    eligible: ["cityMedium", "citySmall"] as LabelKind[],
  };
};

export const getLabelSpec = (kind: LabelKind) => {
  if (kind === "continent") {
    return {
      font: "20px Inter, sans-serif",
      color: "#f8fafc",
      outline: "#0f172a",
    };
  }
  if (kind === "country") {
    return {
      font: "16px Inter, sans-serif",
      color: "#e2e8f0",
      outline: "#0f172a",
    };
  }
  if (kind === "state") {
    return {
      font: "14px Inter, sans-serif",
      color: "#e2e8f0",
      outline: "#0f172a",
    };
  }
  if (kind === "cityLarge") {
    return {
      font: "14px Inter, sans-serif",
      color: "#e2e8f0",
      outline: "#0f172a",
    };
  }
  if (kind === "cityMedium") {
    return {
      font: "12px Inter, sans-serif",
      color: "#dbeafe",
      outline: "#0f172a",
    };
  }
  if (kind === "citySmall") {
    return {
      font: "11px Inter, sans-serif",
      color: "#bfdbfe",
      outline: "#0f172a",
    };
  }
  return {
    font: "12px Inter, sans-serif",
    color: "#cbd5f5",
    outline: "#0f172a",
  };
};

export const lonToTileX = (lon: number, zoom: number) => {
  const tileCount = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * tileCount);
  return Math.min(tileCount - 1, Math.max(0, x));
};

export const latToTileY = (lat: number, zoom: number) => {
  const maxLat = 85.05112878;
  const clamped = Math.max(-maxLat, Math.min(maxLat, lat));
  const latRad = (clamped * Math.PI) / 180;
  const tileCount = 2 ** zoom;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      tileCount,
  );
  return Math.min(tileCount - 1, Math.max(0, y));
};

export const tileCenter = (x: number, y: number, zoom: number) => {
  const tileCount = 2 ** zoom;
  const lon = ((x + 0.5) / tileCount) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * (y + 0.5)) / tileCount;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lon, lat };
};

export const estimateLabelSize = (entity: any) => {
  const rawFont = entity?.label?.font;
  const fontText =
    typeof rawFont === "string" ? rawFont : rawFont?.getValue?.();
  const fontSize = fontText
    ? Number.parseFloat(String(fontText).split("px")[0] ?? "12")
    : 12;
  const rawText = entity?.label?.text;
  const text = typeof rawText === "string" ? rawText : rawText?.getValue?.();
  const length = text ? String(text).length : 0;
  const width = Math.max(10, Math.round(fontSize * 0.6 * length));
  const height = Math.max(10, Math.round(fontSize * 1.2));
  return { width, height, fontSize };
};
