import type { RasterLayerTexture } from "@/hooks/useRasterLayer";
import {
  type GeoPoint,
  type ProjectionSpaceBounds,
  WINKEL_TRIPEL_BOUNDS,
  geographicToPixel,
  pixelToGeographic,
  pixelToProjection,
  inverse,
} from "./winkelTripel";

export type SampleableImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type SampledRaster = {
  texture: SampleableImage;
  rectangle: RasterLayerTexture["rectangle"];
  opacity?: number;
};

export type RenderedFrame = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  downsample: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const wrapLongitude = (lon: number) => {
  let v = lon;
  while (v < -180) v += 360;
  while (v > 180) v -= 360;
  return v;
};

const bilinearSample = (
  img: SampleableImage,
  x: number,
  y: number,
): [number, number, number, number] => {
  if (img.width <= 0 || img.height <= 0) return [0, 0, 0, 0];

  const x0 = Math.floor(x);
  const x1 = clamp(x0 + 1, 0, img.width - 1);
  const y0 = Math.floor(y);
  const y1 = clamp(y0 + 1, 0, img.height - 1);

  const fx = clamp(x - x0, 0, 1);
  const fy = clamp(y - y0, 0, 1);

  const idx = (ix: number, iy: number) => (iy * img.width + ix) * 4;
  const c00Idx = idx(clamp(x0, 0, img.width - 1), clamp(y0, 0, img.height - 1));
  const c10Idx = idx(x1, clamp(y0, 0, img.height - 1));
  const c01Idx = idx(clamp(x0, 0, img.width - 1), y1);
  const c11Idx = idx(x1, y1);

  const d = img.data;
  const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;

  const c00 = [d[c00Idx], d[c00Idx + 1], d[c00Idx + 2], d[c00Idx + 3]];
  const c10 = [d[c10Idx], d[c10Idx + 1], d[c10Idx + 2], d[c10Idx + 3]];
  const c01 = [d[c01Idx], d[c01Idx + 1], d[c01Idx + 2], d[c01Idx + 3]];
  const c11 = [d[c11Idx], d[c11Idx + 1], d[c11Idx + 2], d[c11Idx + 3]];

  const top = c00.map((c, i) => lerp(c, c10[i], fx));
  const bottom = c01.map((c, i) => lerp(c, c11[i], fx));
  const result = top.map((c, i) => lerp(c, bottom[i], fy));

  return [result[0], result[1], result[2], result[3]].map((v) =>
    Math.max(0, Math.min(255, v)),
  ) as [number, number, number, number];
};

const sampleEquirectangular = (
  image: SampleableImage,
  geo: GeoPoint,
): [number, number, number, number] => {
  const lonWrapped = wrapLongitude(geo.lon);
  const u = (lonWrapped + 180) / 360;
  const v = (90 - geo.lat) / 180;
  const x = u * image.width;
  const y = v * image.height;
  return bilinearSample(image, x, y);
};

const sampleRaster = (
  raster: SampledRaster,
  geo: GeoPoint,
): [number, number, number, number] | null => {
  const { rectangle, texture } = raster;
  const { west, east, south, north } = rectangle;
  if (geo.lon < west || geo.lon > east || geo.lat < south || geo.lat > north) {
    return null;
  }
  const u = (geo.lon - west) / (east - west);
  const v = (north - geo.lat) / (north - south);
  const x = u * texture.width;
  const y = v * texture.height;
  return bilinearSample(texture, x, y);
};

const alphaBlend = (
  base: [number, number, number, number],
  overlay: [number, number, number, number],
  opacity: number,
): [number, number, number, number] => {
  const aOverlay = (overlay[3] / 255) * opacity;
  const aBase = base[3] / 255;
  const outA = aOverlay + aBase * (1 - aOverlay);
  if (outA <= 0) return [0, 0, 0, 0];

  const blendChannel = (idx: number) =>
    (overlay[idx] * aOverlay + base[idx] * aBase * (1 - aOverlay)) / outA;

  return [blendChannel(0), blendChannel(1), blendChannel(2), outA * 255] as [
    number,
    number,
    number,
    number,
  ];
};

export type CompositeOptions = {
  width: number;
  height: number;
  blueMarble?: SampleableImage;
  rasters?: SampledRaster[];
  bounds?: ProjectionSpaceBounds;
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  downsample?: number;
};

export const renderComposite = (options: CompositeOptions): RenderedFrame => {
  const bounds = options.bounds ?? WINKEL_TRIPEL_BOUNDS;
  const scale = options.scale ?? 1;
  const offsetX = options.offsetX ?? 0;
  const offsetY = options.offsetY ?? 0;
  const downsample = Math.max(1, Math.round(options.downsample ?? 1));

  const targetWidth = Math.max(1, Math.round(options.width / downsample));
  const targetHeight = Math.max(1, Math.round(options.height / downsample));
  const data = new Uint8ClampedArray(targetWidth * targetHeight * 4);

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      // Center of the target pixel
      const px = (x + 0.5) * downsample;
      const py = (y + 0.5) * downsample;

      // Map into projection space first so we can apply an ellipse mask
      const proj = pixelToProjection(px, py, options.width, options.height, {
        bounds,
        offsetX,
        offsetY,
        scale,
      });

      // Elliptical mask to limit to the valid projection footprint
      const cx = (bounds.xMin + bounds.xMax) / 2;
      const cy = (bounds.yMin + bounds.yMax) / 2;
      const rx = bounds.width / 2;
      const ry = bounds.height / 2;
      const dx = (proj.x - cx) / rx;
      const dy = (proj.y - cy) / ry;
      if (dx * dx + dy * dy > 1.08) {
        continue;
      }

      const inv = inverse(proj.x, proj.y);
      if (!inv.converged) {
        continue;
      }
      const geo = inv.point;

      // Start with Blue Marble as a full-world raster so it uses identical sampling to other rasters.
      const marbleRect = {
        west: -180,
        east: 180,
        south: -90,
        north: 90,
      } as const;
      const marbleSample =
        options.blueMarble &&
        sampleRaster(
          { texture: options.blueMarble, rectangle: marbleRect },
          geo,
        );
      let color: [number, number, number, number] = marbleSample
        ? marbleSample
        : [0, 0, 0, 0];

      if (options.rasters?.length) {
        for (const raster of options.rasters) {
          const sample = sampleRaster(raster, geo);
          if (sample) {
            color = alphaBlend(color, sample, raster.opacity ?? 0.85);
          }
        }
      }

      const idx = (y * targetWidth + x) * 4;
      data[idx] = color[0];
      data[idx + 1] = color[1];
      data[idx + 2] = color[2];
      data[idx + 3] = color[3];
    }
  }

  return { width: targetWidth, height: targetHeight, data, downsample };
};

export type ProjectionCache = {
  blueMarble?: RenderedFrame;
  vectors?: Array<{ id: string; points: Array<{ px: number; py: number }> }>;
  params?: {
    width: number;
    height: number;
    scale: number;
    offsetX: number;
    offsetY: number;
  };
};

export const invalidateCache = (cache: ProjectionCache) => {
  cache.blueMarble = undefined;
  cache.vectors = undefined;
  cache.params = undefined;
};

export const cacheMatches = (
  cache: ProjectionCache,
  params: {
    width: number;
    height: number;
    scale?: number;
    offsetX?: number;
    offsetY?: number;
  },
) => {
  if (!cache.params) return false;
  const scale = params.scale ?? 1;
  const offsetX = params.offsetX ?? 0;
  const offsetY = params.offsetY ?? 0;
  return (
    cache.params.width === params.width &&
    cache.params.height === params.height &&
    cache.params.scale === scale &&
    cache.params.offsetX === offsetX &&
    cache.params.offsetY === offsetY
  );
};

export type ProgressivePass = {
  downsample: number;
  onFrame: (frame: RenderedFrame) => void;
};

// Simple progressive renderer: kicks off passes from coarse → fine.
export const progressiveRender = (
  passes: ProgressivePass[],
  render: (downsample: number) => RenderedFrame,
) => {
  passes.forEach((pass, idx) => {
    const run = () => {
      const frame = render(pass.downsample);
      pass.onFrame(frame);
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(run);
    } else {
      // Fallback for workers or server-side execution.
      setTimeout(run, idx * 10);
    }
  });
};

export const projectVectors = (
  vectors: Array<{ id: string; coordinates: GeoPoint[] }>,
  canvasWidth: number,
  canvasHeight: number,
  options?: {
    bounds?: ProjectionSpaceBounds;
    offsetX?: number;
    offsetY?: number;
    scale?: number;
  },
): Array<{
  id: string;
  segments: Array<Array<{ px: number; py: number }>>;
}> => {
  const bounds = options?.bounds ?? WINKEL_TRIPEL_BOUNDS;
  const scale = options?.scale ?? 1;
  const offsetX = options?.offsetX ?? 0;
  const offsetY = options?.offsetY ?? 0;

  const inFootprint = (px: number, py: number) => {
    const proj = pixelToProjection(px, py, canvasWidth, canvasHeight, {
      bounds,
      offsetX,
      offsetY,
      scale,
    });
    const cx = (bounds.xMin + bounds.xMax) / 2;
    const cy = (bounds.yMin + bounds.yMax) / 2;
    const rx = bounds.width / 2;
    const ry = bounds.height / 2;
    const dx = (proj.x - cx) / rx;
    const dy = (proj.y - cy) / ry;
    return dx * dx + dy * dy <= 1.05;
  };

  const maxJump = Math.max(canvasWidth, canvasHeight) * 0.04;
  const maxGeoJumpLon = 30; // degrees
  const maxGeoJumpLat = 20; // degrees

  return vectors.map((vector) => {
    // Pre-split by geographic jumps to avoid drawing across dateline/poles.
    const geoSegments: GeoPoint[][] = [];
    let gCurrent: GeoPoint[] = [];
    vector.coordinates.forEach((pt, idx) => {
      if (idx > 0) {
        const prev = vector.coordinates[idx - 1];
        const lonDiff = Math.abs(pt.lon - prev.lon);
        const latDiff = Math.abs(pt.lat - prev.lat);
        const crossesDateline =
          lonDiff > 180 ||
          (prev.lon > 170 && pt.lon < -170) ||
          (prev.lon < -170 && pt.lon > 170);
        if (
          crossesDateline ||
          lonDiff > maxGeoJumpLon ||
          latDiff > maxGeoJumpLat
        ) {
          if (gCurrent.length >= 2) geoSegments.push(gCurrent);
          gCurrent = [];
        }
      }
      gCurrent.push(pt);
    });
    if (gCurrent.length >= 2) geoSegments.push(gCurrent);

    const projectedSegments: Array<Array<{ px: number; py: number }>> = [];

    geoSegments.forEach((segment) => {
      const raw = segment.map((coord) =>
        geographicToPixel(
          coord.lon,
          coord.lat,
          canvasWidth,
          canvasHeight,
          options,
        ),
      );

      let current: Array<{ px: number; py: number }> = [];

      raw.forEach((pt, idx) => {
        const inside = inFootprint(pt.px, pt.py);
        if (!inside) {
          if (current.length >= 2) projectedSegments.push(current);
          current = [];
          return;
        }

        if (idx > 0) {
          const prev = raw[idx - 1];
          const dx = pt.px - prev.px;
          const dy = pt.py - prev.py;
          const dist = Math.hypot(dx, dy);
          if (dist > maxJump && current.length >= 2) {
            projectedSegments.push(current);
            current = [];
          }
        }

        current.push(pt);
      });

      if (current.length >= 2) projectedSegments.push(current);
    });

    return { id: vector.id, segments: projectedSegments };
  });
};
