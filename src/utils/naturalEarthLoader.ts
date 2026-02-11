export type NEResolution = "low" | "medium" | "high" | "none";
export type NEDataType = "coastlines" | "rivers" | "lakes" | "geographic";

export interface NELineData {
  Lon: Array<number | null>;
  Lat: Array<number | null>;
}

const RESOLUTION_MAP: Record<Exclude<NEResolution, "none">, string> = {
  low: "110m",
  medium: "50m",
  high: "10m",
};

const buildPath = (type: NEDataType, resolution: NEResolution) => {
  if (resolution === "none") return null;
  if (type === "geographic") {
    return "/assets/naturalearth/geographic/ne_110m_geographic_lines.json";
  }
  const res = RESOLUTION_MAP[resolution];
  if (type === "coastlines") {
    return `/assets/naturalearth/coastlines/ne_${res}_coastline.json`;
  }
  if (type === "rivers") {
    return `/assets/naturalearth/rivers/ne_${res}_rivers_lake_centerlines.json`;
  }
  if (type === "lakes") {
    return `/assets/naturalearth/lakes/ne_${res}_lakes.json`;
  }
  return null;
};

export class NaturalEarthLoader {
  static async load(
    type: NEDataType,
    resolution: NEResolution,
  ): Promise<NELineData | null> {
    const path = buildPath(type, resolution);
    if (!path) return null;

    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to load ${path}: ${response.status}`);
      }
      const data = (await response.json()) as NELineData;
      if (!data?.Lon || !data?.Lat) return null;
      return data;
    } catch (error) {
      console.warn("NaturalEarthLoader: failed to load", path, error);
      return null;
    }
  }
}
