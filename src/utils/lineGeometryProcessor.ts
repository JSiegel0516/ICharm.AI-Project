import * as THREE from "three";
import type { NEDataType, NELineData } from "./naturalEarthLoader";

export interface LineSegment {
  positions: THREE.Vector3[];
  color: THREE.Color;
}

const DEFAULT_COLORS: Record<NEDataType, string> = {
  coastlines: "#9ca3af",
  rivers: "#9ca3af",
  lakes: "#9ca3af",
  geographic: "#9ca3af",
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

  static createLineGeometry(
    segments: LineSegment[],
    lineWidth = 1,
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
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: lineWidth,
      transparent: true,
      opacity: 1,
    });

    return new THREE.LineSegments(geometry, material);
  }
}
