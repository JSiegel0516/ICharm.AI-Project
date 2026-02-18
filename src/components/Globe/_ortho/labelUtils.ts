import type { LabelKind } from "@/lib/labels/openlayersVectorTiles";

export type LabelTier = {
  display: LabelKind[];
  eligible: LabelKind[];
  fadeRange?: [number, number];
};

export const getLabelTier = (tileZoom: number): LabelTier => {
  if (tileZoom <= 2.05) {
    return {
      display: [],
      eligible: [],
      fadeRange: [1.8, 2.05],
    };
  }
  if (tileZoom <= 2.38) {
    return {
      display: ["continent"],
      eligible: ["continent"],
      fadeRange: [2.2, 2.38],
    };
  }
  if (tileZoom <= 4.2) {
    return {
      display: ["continent", "country"],
      eligible: ["continent", "country"],
      fadeRange: [3.0, 3.4],
    };
  }
  if (tileZoom <= 5.2) {
    return {
      display: ["country", "state"],
      eligible: ["country", "state"],
      fadeRange: [4.8, 5.2],
    };
  }
  if (tileZoom <= 6.2) {
    return {
      display: ["state", "cityLarge"],
      eligible: ["state", "cityLarge"],
      fadeRange: [5.8, 6.2],
    };
  }
  if (tileZoom <= 7.2) {
    return {
      display: ["cityLarge", "cityMedium"],
      eligible: ["cityLarge", "cityMedium"],
      fadeRange: [6.8, 7.2],
    };
  }
  return {
    display: ["cityMedium", "citySmall"],
    eligible: ["cityMedium", "citySmall"],
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

export const cameraZoomToTileZoom = (cameraZoom: number) => {
  const minCameraZoom = 1.0;
  const maxCameraZoom = 50.0;
  const minTileZoom = 2;
  const maxTileZoom = 15;
  const clamped = Math.max(minCameraZoom, Math.min(maxCameraZoom, cameraZoom));
  const normalized =
    (clamped - minCameraZoom) / (maxCameraZoom - minCameraZoom);
  return minTileZoom + normalized * (maxTileZoom - minTileZoom);
};

export const calculateLabelOpacity = (
  kind: LabelKind,
  tileZoom: number,
  tier: LabelTier,
) => {
  const baseOpacity = 1;
  if (!tier.fadeRange) return baseOpacity;
  const [fadeStart, fadeEnd] = tier.fadeRange;
  if (tileZoom < fadeStart) return baseOpacity;
  const fadeProgress = Math.max(
    0,
    Math.min(1, (tileZoom - fadeStart) / (fadeEnd - fadeStart || 1)),
  );
  const inDisplay = tier.display.includes(kind);
  const inEligible = tier.eligible.includes(kind);
  if (inDisplay && !inEligible) {
    return baseOpacity * (1 - fadeProgress);
  }
  if (!inDisplay && inEligible) {
    return baseOpacity * fadeProgress;
  }
  return baseOpacity;
};
