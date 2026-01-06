"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  RasterLayerData,
  RasterLayerTexture,
} from "@/hooks/useRasterLayer";
import {
  renderComposite,
  projectVectors,
} from "@/lib/projection/winkelTripelRenderer";
import type {
  GeoPoint,
  ProjectionSpaceBounds,
} from "@/lib/projection/winkelTripel";

type Props = {
  rasterData?: RasterLayerData;
  rasterOpacity?: number;
  satelliteLayerVisible?: boolean;
  boundaryLinesVisible?: boolean;
  geographicLinesVisible?: boolean;
  bounds?: ProjectionSpaceBounds;
};

type SampleableImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

// Prefer cached ArcGIS World Imagery first (avoid CORS/taint), then live endpoint.
const BLUE_MARBLE_SOURCES = [
  "/images/world_imagery_arcgis.png",
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=-180,-90,180,90&bboxSR=4326&imageSR=4326&size=4096,2048&format=png&f=image",
];

const fetchBoundaries = async () => {
  const files: Array<{ name: string; kind: "boundary" | "geographicLines" }> = [
    { name: "ne_110m_coastline.json", kind: "boundary" },
    { name: "ne_110m_lakes.json", kind: "boundary" },
    { name: "ne_110m_rivers_lake_centerlines.json", kind: "boundary" },
  ];

  const results: Array<{ id: string; coordinates: GeoPoint[]; kind: string }> =
    [];

  for (const file of files) {
    try {
      const res = await fetch(`/_countries/${file.name}`);
      if (!res.ok) continue;
      const data = await res.json();

      const pushFeature = (coords: any) => {
        if (!Array.isArray(coords)) return;
        const segments: GeoPoint[][] = [];
        let current: GeoPoint[] = [];

        coords.forEach((pair: any) => {
          if (Array.isArray(pair) && pair.length >= 2) {
            current.push({ lon: pair[0], lat: pair[1] });
          } else if (current.length) {
            segments.push(current);
            current = [];
          }
        });
        if (current.length) segments.push(current);

        segments.forEach((segment) => {
          if (segment.length >= 2) {
            results.push({
              id: `${file.name}-${results.length}`,
              coordinates: segment,
              kind: file.kind,
            });
          }
        });
      };

      if (data.type === "FeatureCollection" && Array.isArray(data.features)) {
        data.features.forEach((feature: any) => {
          const geom = feature?.geometry;
          if (!geom) return;
          if (geom.type === "LineString") pushFeature(geom.coordinates);
          if (geom.type === "MultiLineString") {
            geom.coordinates.forEach((line: any) => pushFeature(line));
          }
          if (geom.type === "Polygon") {
            geom.coordinates.forEach((ring: any) => pushFeature(ring));
          }
          if (geom.type === "MultiPolygon") {
            geom.coordinates.forEach((poly: any) =>
              poly.forEach((ring: any) => pushFeature(ring)),
            );
          }
        });
      } else if (Array.isArray(data?.Lon) && Array.isArray(data?.Lat)) {
        const coords: GeoPoint[] = [];
        for (let i = 0; i < data.Lon.length; i += 1) {
          if (data.Lon[i] !== null && data.Lat[i] !== null) {
            coords.push({ lon: data.Lon[i], lat: data.Lat[i] });
          }
        }
        if (coords.length >= 2) {
          results.push({
            id: `${file.name}-series`,
            coordinates: coords,
            kind: file.kind,
          });
        }
      }
    } catch (err) {
      console.warn("Failed to load boundary", file.name, err);
    }
  }

  return results;
};

const loadImageData = (
  src: string,
  options?: { forceOpaqueAlpha?: boolean },
): Promise<SampleableImage> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (options?.forceOpaqueAlpha) {
        // Some Blue Marble assets ship with partially transparent coastlines; force opacity.
        const data = imageData.data;
        for (let i = 3; i < data.length; i += 4) {
          data[i] = 255;
        }
      }
      resolve({
        width: canvas.width,
        height: canvas.height,
        data: imageData.data,
      });
    };
    img.onerror = (err) => reject(err);
    img.src = src;
  });

const loadRasterTextures = async (
  textures: RasterLayerTexture[],
): Promise<
  Array<{
    texture: SampleableImage;
    rectangle: RasterLayerTexture["rectangle"];
  }>
> => {
  const results: Array<{
    texture: SampleableImage;
    rectangle: RasterLayerTexture["rectangle"];
  }> = [];

  for (const tex of textures) {
    try {
      const sampleable = await loadImageData(tex.imageUrl);
      results.push({ texture: sampleable, rectangle: tex.rectangle });
    } catch (err) {
      console.warn("Failed to load raster texture", err);
    }
  }

  return results;
};

const useWindowSize = () => {
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: typeof window !== "undefined" ? window.innerWidth : 1920,
    height: typeof window !== "undefined" ? window.innerHeight : 1080,
  });

  useEffect(() => {
    const onResize = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return size;
};

export const WinkelMap: React.FC<Props> = ({
  rasterData,
  rasterOpacity = 1,
  satelliteLayerVisible = true,
  boundaryLinesVisible = true,
  geographicLinesVisible = false,
  bounds,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { width, height } = useWindowSize();

  const [blueMarble, setBlueMarble] = useState<SampleableImage | null>(null);
  const [rasterTextures, setRasterTextures] = useState<
    Array<{
      texture: SampleableImage;
      rectangle: RasterLayerTexture["rectangle"];
    }>
  >([]);
  const [vectors, setVectors] = useState<
    Array<{ id: string; coordinates: GeoPoint[]; kind: string }>
  >([]);

  useEffect(() => {
    if (!satelliteLayerVisible) {
      setBlueMarble(null);
      return;
    }
    let cancelled = false;
    const tryLoad = async () => {
      for (const src of BLUE_MARBLE_SOURCES) {
        try {
          const img = await loadImageData(src, { forceOpaqueAlpha: true });
          if (!cancelled) {
            setBlueMarble(img);
          }
          return;
        } catch (err) {
          console.warn("Blue Marble load failed", src, err);
        }
      }
      console.warn("Blue Marble unavailable from all sources");
    };

    tryLoad();
    return () => {
      cancelled = true;
    };
  }, [satelliteLayerVisible]);

  useEffect(() => {
    let cancelled = false;
    if (rasterData?.textures?.length) {
      loadRasterTextures(rasterData.textures).then((loaded) => {
        if (!cancelled) setRasterTextures(loaded);
      });
    } else {
      setRasterTextures([]);
    }
    return () => {
      cancelled = true;
    };
  }, [rasterData?.textures, rasterData?.textures?.length]);

  useEffect(() => {
    let mounted = true;
    fetchBoundaries().then((res) => {
      if (mounted) setVectors(res);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const projectedVectors = useMemo(() => {
    if (!vectors.length) return [];

    // Split at the dateline to avoid long jumps across the map
    const splitAtDateline = (coords: GeoPoint[]) => {
      const parts: GeoPoint[][] = [];
      let current: GeoPoint[] = [];
      for (let i = 0; i < coords.length; i += 1) {
        const pt = coords[i];
        const prev = coords[i - 1];
        if (prev) {
          const lonJump = Math.abs(pt.lon - prev.lon);
          const crossesDateline =
            lonJump > 180 ||
            (prev.lon > 170 && pt.lon < -170) ||
            (prev.lon < -170 && pt.lon > 170);
          if (crossesDateline && current.length >= 2) {
            parts.push([...current]);
            current = [];
          }
        }
        current.push(pt);
      }
      if (current.length >= 2) {
        parts.push(current);
      }
      return parts.length ? parts : [coords];
    };

    const expanded = vectors.flatMap((vec) =>
      splitAtDateline(vec.coordinates).map((segment, idx) => ({
        id: `${vec.id}-seg-${idx}`,
        coordinates: segment,
        kind: vec.kind,
      })),
    );

    const projected = projectVectors(
      expanded.map((v) => ({ id: v.id, coordinates: v.coordinates })),
      width,
      height,
      { bounds },
    );

    return projected.map((v, idx) => ({ ...v, kind: expanded[idx].kind }));
  }, [vectors, width, height, bounds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    const frame = renderComposite({
      width,
      height,
      blueMarble: satelliteLayerVisible ? (blueMarble ?? undefined) : undefined,
      rasters: rasterTextures.map((entry) => ({
        texture: entry.texture,
        rectangle: entry.rectangle,
        // If satellite is visible, gently reduce raster opacity to let basemap peek through.
        opacity: satelliteLayerVisible ? rasterOpacity * 0.9 : rasterOpacity,
      })),
      bounds,
    });

    const imageData = new ImageData(frame.data, frame.width, frame.height);
    ctx.putImageData(imageData, 0, 0);

    // Draw vectors over the composite
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#e5e7eb";
    projectedVectors.forEach((vec) => {
      if (vec.kind === "boundary" && !boundaryLinesVisible) return;
      if (vec.kind === "geographicLines" && !geographicLinesVisible) return;
      vec.segments?.forEach((segment) => {
        if (!segment || segment.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(segment[0].px, segment[0].py);
        for (let i = 1; i < segment.length; i += 1) {
          ctx.lineTo(segment[i].px, segment[i].py);
        }
        ctx.stroke();
      });
    });
    ctx.restore();
  }, [
    width,
    height,
    blueMarble,
    rasterTextures,
    rasterOpacity,
    satelliteLayerVisible,
    boundaryLinesVisible,
    geographicLinesVisible,
    projectedVectors,
    bounds,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ width: "100%", height: "100%" }}
    />
  );
};

export default WinkelMap;
