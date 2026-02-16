import * as THREE from "three";
import type { NEDataType, NELineData } from "./naturalEarthLoader";

export interface LineSegment {
  positions: THREE.Vector3[];
  color: THREE.Color;
}

const DEFAULT_COLORS: Record<NEDataType, string> = {
  coastlines: "#4b5563",
  rivers: "#4b5563",
  lakes: "#4b5563",
  geographic: "#4b5563",
};

const latLonToCartesian = (lat: number, lon: number, radius: number) => {
  const latRad = THREE.MathUtils.degToRad(lat);
  const lonRad = THREE.MathUtils.degToRad(lon);
  const cosLat = Math.cos(latRad);
  return new THREE.Vector3(
    radius * cosLat * Math.cos(lonRad),
    radius * Math.sin(latRad),
    -radius * cosLat * Math.sin(lonRad),
  );
};

export class LineGeometryProcessor {
  static processNEData(
    data: NELineData,
    type: NEDataType,
    radius: number,
    colorOverride?: string,
  ): LineSegment[] {
    const segments: LineSegment[] = [];
    const { Lon, Lat } = data;
    const color = new THREE.Color(colorOverride ?? DEFAULT_COLORS[type]);

    let currentSegment: THREE.Vector3[] = [];

    for (let i = 0; i < Lon.length; i += 1) {
      const lon = Lon[i];
      const lat = Lat[i];
      if (lon === null || lat === null) {
        if (currentSegment.length > 1) {
          segments.push({ positions: currentSegment, color });
        }
        currentSegment = [];
        continue;
      }
      currentSegment.push(latLonToCartesian(lat, lon, radius));
    }

    if (currentSegment.length > 1) {
      segments.push({ positions: currentSegment, color });
    }

    return segments;
  }

  static processGeoJSON(
    data: any,
    radius: number,
    colorOverride?: string,
  ): LineSegment[] {
    if (!data || !Array.isArray(data.features)) return [];
    const segments: LineSegment[] = [];
    const color = new THREE.Color(colorOverride ?? "#f8fafc");

    const addLine = (coords: number[][]) => {
      if (!coords || coords.length < 2) return;
      const positions = coords.map(([lon, lat]) =>
        latLonToCartesian(lat, lon, radius),
      );
      segments.push({ positions, color });
    };

    const processGeometry = (geometry: any) => {
      if (!geometry) return;
      if (geometry.type === "LineString") {
        addLine(geometry.coordinates);
      } else if (geometry.type === "MultiLineString") {
        geometry.coordinates.forEach(addLine);
      } else if (geometry.type === "Polygon") {
        geometry.coordinates.forEach(addLine);
      } else if (geometry.type === "MultiPolygon") {
        geometry.coordinates.forEach((poly: any[]) => {
          poly.forEach(addLine);
        });
      }
    };

    data.features.forEach((feature: any) => {
      processGeometry(feature?.geometry);
    });

    return segments;
  }

  static createLineGeometry(
    segments: LineSegment[],
    lineWidth = 1,
    options?: {
      dashed?: boolean;
      dashSize?: number;
      gapSize?: number;
      color?: string;
      opacity?: number;
      depthTest?: boolean;
    },
  ): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];

    segments.forEach((segment) => {
      const { positions: pts, color } = segment;
      for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i];
        const b = pts[i + 1];
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    });

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    if (!options?.dashed) {
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3),
      );
    }

    const opacity = typeof options?.opacity === "number" ? options.opacity : 1;
    const material = options?.dashed
      ? new THREE.LineDashedMaterial({
          color: options.color ?? "#f8fafc",
          linewidth: lineWidth,
          dashSize: options.dashSize ?? 2,
          gapSize: options.gapSize ?? 2,
          transparent: true,
          opacity,
        })
      : new THREE.LineBasicMaterial({
          vertexColors: true,
          linewidth: lineWidth,
          transparent: true,
          opacity,
        });

    const line = new THREE.LineSegments(geometry, material);
    if (options?.dashed) {
      line.computeLineDistances();
    }
    const depthTest = options?.depthTest ?? true;
    if (line.material && !Array.isArray(line.material)) {
      line.material.depthTest = depthTest;
      line.material.depthWrite = false;
    } else if (Array.isArray(line.material)) {
      line.material.forEach((mat) => {
        mat.depthTest = depthTest;
        mat.depthWrite = false;
      });
    }
    return line;
  }
}
