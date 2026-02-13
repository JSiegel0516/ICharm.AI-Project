import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";

export type LabelKind =
  | "continent"
  | "country"
  | "state"
  | "cityLarge"
  | "cityMedium"
  | "citySmall"
  | "street";

export type LabelFeature = {
  kind: LabelKind;
  name: string;
  lon: number;
  lat: number;
};

const pickName = (props: Record<string, unknown>) => {
  const candidates = [props["name:en"], props.name, props["name_en"]];
  return candidates.find((value) => typeof value === "string") as
    | string
    | undefined;
};

const midpoint = (coords: number[][]) => {
  if (!coords.length) return null;
  const mid = coords[Math.floor(coords.length / 2)];
  if (!mid || mid.length < 2) return null;
  return { lon: mid[0], lat: mid[1] };
};

const ringCentroid = (ring: number[][]) => {
  if (ring.length < 3) return midpoint(ring);
  let area = 0;
  let cx = 0;
  let cy = 0;
  const count = ring.length;
  for (let i = 0; i < count; i += 1) {
    const [x1, y1] = ring[i] ?? [];
    const [x2, y2] = ring[(i + 1) % count] ?? [];
    if (x1 === undefined || y1 === undefined) continue;
    if (x2 === undefined || y2 === undefined) continue;
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(area) < 1e-7) return midpoint(ring);
  const scale = 1 / (3 * area);
  return { lon: cx * scale, lat: cy * scale };
};

const polygonCentroid = (coords: number[][][]) => {
  if (!coords.length) return null;
  const outer = coords[0] ?? [];
  return ringCentroid(outer);
};

const multiPolygonCentroid = (coords: number[][][][]) => {
  if (!coords.length) return null;
  let best: { area: number; point: { lon: number; lat: number } | null } = {
    area: 0,
    point: null,
  };
  coords.forEach((polygon) => {
    const outer = polygon?.[0];
    if (!outer?.length) return;
    let area = 0;
    const count = outer.length;
    for (let i = 0; i < count; i += 1) {
      const [x1, y1] = outer[i] ?? [];
      const [x2, y2] = outer[(i + 1) % count] ?? [];
      if (x1 === undefined || y1 === undefined) continue;
      if (x2 === undefined || y2 === undefined) continue;
      area += x1 * y2 - x2 * y1;
    }
    const absArea = Math.abs(area);
    if (absArea <= best.area) return;
    best = { area: absArea, point: ringCentroid(outer) };
  });
  return best.point;
};

const coordsFromGeometry = (geometry: any) => {
  if (!geometry) return null;
  if (geometry.type === "Point") {
    const [lon, lat] = geometry.coordinates as [number, number];
    return { lon, lat };
  }
  if (geometry.type === "LineString") {
    return midpoint(geometry.coordinates as number[][]);
  }
  if (geometry.type === "MultiLineString") {
    for (const line of geometry.coordinates as number[][][]) {
      const point = midpoint(line);
      if (point) return point;
    }
  }
  if (geometry.type === "Polygon") {
    return polygonCentroid(geometry.coordinates as number[][][]);
  }
  if (geometry.type === "MultiPolygon") {
    return multiPolygonCentroid(geometry.coordinates as number[][][][]);
  }
  return null;
};

export const parseOpenLayersTile = (
  buffer: ArrayBuffer,
  z: number,
  x: number,
  y: number,
) => {
  let tile: any;
  try {
    tile = new VectorTile(new Pbf(new Uint8Array(buffer)));
  } catch (error) {
    if (typeof globalThis !== "undefined") {
      (globalThis as any).__labelTileError = {
        message: (error as Error).message,
      };
    }
    return [] as LabelFeature[];
  }
  const results: LabelFeature[] = [];

  const place = tile.layers.place;
  if (place) {
    for (let i = 0; i < place.length; i += 1) {
      const feature = place.feature(i);
      const props = feature.properties as Record<string, unknown>;
      const className = props.class;
      let kind: LabelKind | null = null;
      if (className === "continent") {
        kind = "continent";
      } else if (className === "country") {
        kind = "country";
      } else if (
        className === "state" ||
        className === "province" ||
        className === "region"
      ) {
        kind = "state";
      } else if (
        className === "city" ||
        className === "town" ||
        className === "village" ||
        className === "hamlet"
      ) {
        const rank = typeof props.rank === "number" ? props.rank : null;
        if (rank !== null) {
          if (rank <= 2) kind = "cityLarge";
          else if (rank <= 4) kind = "cityMedium";
          else kind = "citySmall";
        } else if (className === "city") {
          kind = "cityLarge";
        } else if (className === "town") {
          kind = "cityMedium";
        } else {
          kind = "citySmall";
        }
      } else {
        continue;
      }
      let name = pickName(props);
      if (!name) continue;
      if (kind === "continent" && name === "America") {
        continue;
      }
      if (kind === "continent" && name === "Australia") {
        name = "Oceania";
      }
      const geojson = feature.toGeoJSON(x, y, z);
      const point = coordsFromGeometry(geojson.geometry);
      if (!point) continue;
      if (kind === "continent" && name === "Oceania") {
        const alreadyHasOceania = results.some(
          (entry) => entry.kind === "continent" && entry.name === "Oceania",
        );
        if (alreadyHasOceania) continue;
        point.lon = 150;
        point.lat = -15;
      }
      results.push({
        kind,
        name,
        lon: point.lon,
        lat: point.lat,
      });
    }
  }

  const roads = tile.layers.transportation_name ?? tile.layers.transportation;
  if (roads) {
    for (let i = 0; i < roads.length; i += 1) {
      const feature = roads.feature(i);
      const props = feature.properties as Record<string, unknown>;
      const name = pickName(props);
      if (!name) continue;
      const geojson = feature.toGeoJSON(x, y, z);
      const point = coordsFromGeometry(geojson.geometry);
      if (!point) continue;
      results.push({
        kind: "street",
        name,
        lon: point.lon,
        lat: point.lat,
      });
    }
  }

  return results;
};

export const fetchOpenLayersTile = async (
  url: string,
  z: number,
  x: number,
  y: number,
  signal?: AbortSignal,
) => {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    return [] as LabelFeature[];
  }
  const buffer = await response.arrayBuffer();
  const features = parseOpenLayersTile(buffer, z, x, y);
  if (
    typeof globalThis !== "undefined" &&
    !(globalThis as any).__labelTileSample
  ) {
    (globalThis as any).__labelTileSample = {
      url,
      count: features.length,
      sample: features.slice(0, 3),
    };
  }
  return features;
};
