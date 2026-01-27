"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  RasterLayerData,
  RasterLayerTexture,
} from "@/hooks/useRasterLayer";
import type { RasterGridData } from "@/hooks/useRasterGrid";
import { buildColorStops, mapValueToRgba } from "@/lib/mesh/colorMapping";
import { geoPath, geoTransform } from "d3-geo";
import {
  renderComposite,
  progressiveRender,
} from "@/lib/projection/winkelTripelRenderer";
import type {
  GeoPoint,
  ProjectionSpaceBounds,
} from "@/lib/projection/winkelTripel";
import {
  geographicToPixel,
  pixelToGeographic,
  pixelToProjection,
  WINKEL_TRIPEL_BOUNDS,
} from "@/lib/projection/winkelTripel";
import type { Dataset, RegionData } from "@/types";

type Props = {
  rasterData?: RasterLayerData;
  rasterGridData?: RasterGridData;
  rasterOpacity?: number;
  satelliteLayerVisible?: boolean;
  boundaryLinesVisible?: boolean;
  geographicLinesVisible?: boolean;
  bounds?: ProjectionSpaceBounds;
  currentDataset?: Dataset;
  onRegionClick?: (lat: number, lon: number, data: RegionData) => void;
  useMeshRaster?: boolean;
  clearMarkerSignal?: number;
};

type SampleableImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

const MIN_SCALE = 1; // same as initial view; prevents over-zooming out
const MAX_SCALE = 400; // allow very deep zoom for satellite inspection
const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

type BoundaryResolution = "110m" | "50m" | "10m";

const boundaryFilesByResolution: Record<
  BoundaryResolution,
  Array<{ name: string; kind: "boundary" | "geographicLines" }>
> = {
  "110m": [
    { name: "ne_110m_coastline.json", kind: "boundary" },
    { name: "ne_110m_lakes.json", kind: "boundary" },
    { name: "ne_110m_rivers_lake_centerlines.json", kind: "boundary" },
    { name: "ne_110m_geographic_lines.json", kind: "geographicLines" },
  ],
  "50m": [
    { name: "ne_50m_coastline.json", kind: "boundary" },
    { name: "ne_50m_lakes.json", kind: "boundary" },
    { name: "ne_50m_rivers_lake_centerlines.json", kind: "boundary" },
    { name: "ne_50m_geographic_lines.json", kind: "geographicLines" },
  ],
  "10m": [
    { name: "ne_10m_coastline.json", kind: "boundary" },
    { name: "ne_10m_lakes.json", kind: "boundary" },
    { name: "ne_10m_rivers_lake_centerlines.json", kind: "boundary" },
    { name: "ne_10m_geographic_lines.json", kind: "geographicLines" },
  ],
};

const fetchBoundaries = async (resolution: BoundaryResolution) => {
  const files = boundaryFilesByResolution[resolution];

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

const splitAtDateline = (coords: GeoPoint[]) => {
  const parts: GeoPoint[][] = [];
  let current: GeoPoint[] = [];
  const maxGeoJumpLon = 30; // degrees
  const maxGeoJumpLat = 20; // degrees
  for (let i = 0; i < coords.length; i += 1) {
    const pt = coords[i];
    const prev = coords[i - 1];
    if (prev) {
      const lonJump = Math.abs(pt.lon - prev.lon);
      const latJump = Math.abs(pt.lat - prev.lat);
      const crossesDateline =
        lonJump > 180 ||
        (prev.lon > 170 && pt.lon < -170) ||
        (prev.lon < -170 && pt.lon > 170);
      if (
        (crossesDateline ||
          lonJump > maxGeoJumpLon ||
          latJump > maxGeoJumpLat) &&
        current.length >= 2
      ) {
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

const splitAtFootprint = (
  coords: GeoPoint[],
  renderWidth: number,
  renderHeight: number,
  options: {
    bounds?: ProjectionSpaceBounds;
    offsetX: number;
    offsetY: number;
    scale: number;
  },
) => {
  const parts: GeoPoint[][] = [];
  let current: GeoPoint[] = [];
  const maxJumpPx = Math.max(renderWidth, renderHeight) * 0.04;
  let prevPx: { x: number; y: number } | null = null;
  const bounds = options.bounds ?? WINKEL_TRIPEL_BOUNDS;
  const cx = (bounds.xMin + bounds.xMax) / 2;
  const cy = (bounds.yMin + bounds.yMax) / 2;
  const rx = bounds.width / 2 || 1;
  const ry = bounds.height / 2 || 1;

  for (let i = 0; i < coords.length; i += 1) {
    const pt = coords[i];
    const { px, py } = geographicToPixel(
      pt.lon,
      pt.lat,
      renderWidth,
      renderHeight,
      options,
    );

    const proj = pixelToProjection(px, py, renderWidth, renderHeight, options);
    const dx = (proj.x - cx) / rx;
    const dy = (proj.y - cy) / ry;
    const inFootprint = dx * dx + dy * dy <= 1.05;

    if (!inFootprint) {
      if (current.length >= 2) parts.push(current);
      current = [];
      prevPx = null;
      continue;
    }

    if (prevPx) {
      const jump = Math.hypot(px - prevPx.x, py - prevPx.y);
      if (jump > maxJumpPx) {
        if (current.length >= 2) parts.push(current);
        current = [];
      }
    }

    current.push(pt);
    prevPx = { x: px, y: py };
  }

  if (current.length >= 2) parts.push(current);
  return parts.length ? parts : [];
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
  rasterGridData,
  rasterOpacity = 1,
  satelliteLayerVisible = true,
  boundaryLinesVisible = true,
  geographicLinesVisible = false,
  bounds,
  currentDataset,
  onRegionClick = () => {},
  useMeshRaster = false,
  clearMarkerSignal = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { width, height } = useWindowSize();
  const [viewScale, setViewScale] = useState(1);
  const renderScale = useMemo(() => {
    if (typeof window === "undefined") return 1.6;
    const dpr = window.devicePixelRatio || 1;
    const zoomFactor = viewScale > 3 ? 1.6 : viewScale > 1.6 ? 1.3 : 1.1;
    return Math.max(1.0, Math.min(2.0, dpr * zoomFactor));
  }, [viewScale]);
  const renderWidth = Math.max(1, Math.round(width / renderScale));
  const renderHeight = Math.max(1, Math.round(height / renderScale));
  const renderTokenRef = useRef(0);
  const [viewOffset, setViewOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const viewOffsetRef = useRef(viewOffset);
  const [isZooming, setIsZooming] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const isZoomingRef = useRef(false);
  const isPanningRef = useRef(false);
  const placeholderRafRef = useRef<number | null>(null);
  const zoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomRafRef = useRef<number | null>(null);
  const targetOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const targetScaleRef = useRef(viewScale);
  const pendingViewScaleRef = useRef(viewScale);
  const selectorImgRef = useRef<HTMLImageElement | null>(null);
  const viewScaleRef = useRef(viewScale);
  const wheelContextRef = useRef<{
    blueMarble: SampleableImage | null;
    bounds?: ProjectionSpaceBounds;
    renderWidth: number;
    renderHeight: number;
    viewOffset: { x: number; y: number };
  }>({
    blueMarble: null,
    bounds,
    renderWidth,
    renderHeight,
    viewOffset,
  });

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
  const [vectorPaths, setVectorPaths] = useState<{
    boundary: string[];
    geographic: string[];
  }>({ boundary: [], geographic: [] });
  const [debouncedOpacity, setDebouncedOpacity] = useState(rasterOpacity);
  const [clickMarker, setClickMarker] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [useMeshRasterActive, setUseMeshRasterActive] = useState(useMeshRaster);
  const useMeshRasterActiveRef = useRef(useMeshRaster);
  const pendingRenderRef = useRef(false);
  const boundaryCacheRef = useRef(
    new Map<
      BoundaryResolution,
      Array<{ id: string; coordinates: GeoPoint[]; kind: string }>
    >(),
  );
  const renderSizeRef = useRef({ width: renderWidth, height: renderHeight });
  const boundsRef = useRef(bounds);
  const meshToRasterScale = 1.4;
  const rasterToMeshScale = 1.2;
  const clampViewOffset = useCallback(
    (scale: number, candidate: { x: number; y: number }) => {
      const pad = 0.08; // keep a thin margin of the ellipse in view to avoid blanks
      const baseX = 0.5 * renderWidth * (1 - scale);
      const baseY = 0.5 * renderHeight * (1 - scale);
      const minTotalX = -(1 - pad) * renderWidth * scale;
      const maxTotalX = renderWidth * (1 - pad * scale);
      const minTotalY = -(1 - pad) * renderHeight * scale;
      const maxTotalY = renderHeight * (1 - pad * scale);
      const totalX = baseX + candidate.x;
      const totalY = baseY + candidate.y;
      const clampedTotalX = clamp(totalX, minTotalX, maxTotalX);
      const clampedTotalY = clamp(totalY, minTotalY, maxTotalY);
      return {
        x: clampedTotalX - baseX,
        y: clampedTotalY - baseY,
      };
    },
    [renderHeight, renderWidth],
  );
  const clampViewOffsetRef = useRef(clampViewOffset);
  const renderBasemapPlaceholderRef = useRef<
    typeof renderBasemapPlaceholder | null
  >(null);
  const offsets = useMemo(
    () => ({
      offsetX: 0.5 * renderWidth * (1 - viewScale) + viewOffset.x,
      offsetY: 0.5 * renderHeight * (1 - viewScale) + viewOffset.y,
    }),
    [renderWidth, renderHeight, viewScale, viewOffset],
  );
  const boundaryResolution = useMemo<BoundaryResolution>(() => {
    if (isZooming || isPanning) return "110m";
    if (renderWidth < 720) return "110m";
    if (viewScale >= 5) return "10m";
    if (viewScale >= 2) return "50m";
    return "110m";
  }, [isZooming, isPanning, renderWidth, viewScale]);
  const baseFrameRef = useRef<ImageData | null>(null);
  const renderParamsRef = useRef<{
    renderWidth: number;
    renderHeight: number;
    scale: number;
    offsetX: number;
    offsetY: number;
    bounds?: ProjectionSpaceBounds;
  }>({
    renderWidth,
    renderHeight,
    scale: viewScale,
    offsetX: 0,
    offsetY: 0,
    bounds,
  });
  const committedParamsRef = useRef(renderParamsRef.current);
  const overlayStateRef = useRef<{
    clickMarker: { lat: number; lon: number } | null;
  }>({
    clickMarker: null,
  });

  // Reduce rapid re-renders while dragging the opacity slider.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedOpacity(rasterOpacity), 120);
    return () => clearTimeout(handle);
  }, [rasterOpacity]);

  useEffect(() => {
    useMeshRasterActiveRef.current = useMeshRasterActive;
  }, [useMeshRasterActive]);

  useEffect(() => {
    if (!useMeshRaster) {
      setUseMeshRasterActive(false);
      return;
    }
    if (!rasterGridData) {
      setUseMeshRasterActive(false);
      return;
    }
    const current = useMeshRasterActiveRef.current;
    if (current && viewScale > meshToRasterScale) {
      setUseMeshRasterActive(false);
    } else if (!current && viewScale < rasterToMeshScale) {
      setUseMeshRasterActive(true);
    }
  }, [rasterGridData, useMeshRaster, viewScale]);

  const gridTexture = useMemo(() => {
    if (
      !rasterGridData ||
      !currentDataset?.colorScale?.colors?.length ||
      !rasterGridData.values?.length
    ) {
      return null;
    }
    const rows = rasterGridData.lat.length;
    const cols = rasterGridData.lon.length;
    if (!rows || !cols || rasterGridData.values.length < rows * cols) {
      return null;
    }

    const min = rasterGridData.min ?? 0;
    const max = rasterGridData.max ?? 1;
    const stops = buildColorStops(currentDataset.colorScale.colors);
    const data = new Uint8ClampedArray(rows * cols * 4);
    const latAscending = rasterGridData.lat[0] < rasterGridData.lat[rows - 1];

    for (let r = 0; r < rows; r += 1) {
      const destRow = latAscending ? rows - 1 - r : r;
      for (let c = 0; c < cols; c += 1) {
        const srcIdx = r * cols + c;
        const destIdx = (destRow * cols + c) * 4;
        if (rasterGridData.mask && rasterGridData.mask[srcIdx] === 0) {
          data[destIdx] = 0;
          data[destIdx + 1] = 0;
          data[destIdx + 2] = 0;
          data[destIdx + 3] = 0;
          continue;
        }
        const value = rasterGridData.values[srcIdx];
        const rgba = mapValueToRgba(value, min, max, stops);
        data[destIdx] = rgba[0];
        data[destIdx + 1] = rgba[1];
        data[destIdx + 2] = rgba[2];
        data[destIdx + 3] = rgba[3];
      }
    }

    const latMin = Math.min(
      rasterGridData.lat[0],
      rasterGridData.lat[rows - 1],
    );
    const latMax = Math.max(
      rasterGridData.lat[0],
      rasterGridData.lat[rows - 1],
    );
    const lonMin = Math.min(
      rasterGridData.lon[0],
      rasterGridData.lon[cols - 1],
    );
    const lonMax = Math.max(
      rasterGridData.lon[0],
      rasterGridData.lon[cols - 1],
    );

    return {
      texture: {
        width: cols,
        height: rows,
        data,
      },
      rectangle: {
        west: lonMin,
        east: lonMax,
        south: latMin,
        north: latMax,
      },
    };
  }, [currentDataset?.colorScale?.colors, rasterGridData]);

  useEffect(() => {
    pendingViewScaleRef.current = viewScale;
    viewScaleRef.current = viewScale;
  }, [viewScale]);

  useEffect(() => {
    viewOffsetRef.current = viewOffset;
  }, [viewOffset]);

  useEffect(() => {
    renderSizeRef.current = { width: renderWidth, height: renderHeight };
  }, [renderWidth, renderHeight]);

  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  useEffect(() => {
    clampViewOffsetRef.current = clampViewOffset;
  }, [clampViewOffset]);

  useEffect(() => {
    wheelContextRef.current = {
      blueMarble,
      bounds,
      renderWidth,
      renderHeight,
      viewOffset,
    };
  }, [blueMarble, bounds, renderWidth, renderHeight, viewOffset]);

  useEffect(() => {
    renderParamsRef.current = {
      renderWidth,
      renderHeight,
      scale: viewScale,
      offsetX: offsets.offsetX,
      offsetY: offsets.offsetY,
      bounds,
    };
  }, [
    renderWidth,
    renderHeight,
    viewScale,
    offsets.offsetX,
    offsets.offsetY,
    bounds,
  ]);

  useEffect(() => {
    // Clear any cached base frame whenever scale or pan changes so we don't reuse stale rasters.
    baseFrameRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [viewScale, viewOffset]);

  useEffect(() => {
    // External signal to clear click marker (e.g., region panel close).
    setClickMarker(null);
  }, [clearMarkerSignal]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      selectorImgRef.current = img;
    };
    img.src = "/images/selector.png";
  }, []);

  const drawOverlay = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      paramsOverride?: {
        renderWidth: number;
        renderHeight: number;
        scale: number;
        offsetX: number;
        offsetY: number;
        bounds?: ProjectionSpaceBounds;
      },
    ) => {
      const state = overlayStateRef.current;
      const params = paramsOverride ?? renderParamsRef.current;
      ctx.save();
      if (state.clickMarker) {
        const { px, py } = geographicToPixel(
          state.clickMarker.lon,
          state.clickMarker.lat,
          params.renderWidth,
          params.renderHeight,
          {
            bounds: params.bounds,
            scale: params.scale,
            offsetX: params.offsetX,
            offsetY: params.offsetY,
          },
        );
        const img = selectorImgRef.current;
        if (img) {
          const size = 28;
          ctx.drawImage(img, px - size / 2, py - size / 2, size, size);
        } else {
          ctx.fillStyle = "#4cff00";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, py, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();
    },
    [],
  );

  const computeBaseDownsample = useCallback(
    (w: number, h: number, scale: number) => {
      const base = Math.max(1, Math.round(Math.min(w, h) / 2000));
      const zoomPenalty = scale > 4 ? Math.min(6, Math.sqrt(scale) / 3) : 1;
      return Math.max(1, Math.min(8, Math.round(base * zoomPenalty)));
    },
    [],
  );

  const renderBasemapPlaceholder = useCallback(
    (
      ctx: CanvasRenderingContext2D | null,
      scale: number,
      offsetX: number,
      offsetY: number,
    ) => {
      if (!ctx) return;
      const state = wheelContextRef.current;
      // Paint a solid backdrop and keep boundary lines visible; no basemap imagery.
      ctx.save();
      ctx.fillStyle = "#0b172a";
      ctx.fillRect(0, 0, state.renderWidth, state.renderHeight);
      ctx.restore();
      const overlayParams =
        isZoomingRef.current || isPanningRef.current
          ? committedParamsRef.current
          : {
              renderWidth: state.renderWidth,
              renderHeight: state.renderHeight,
              scale,
              offsetX,
              offsetY,
              bounds: state.bounds,
            };
      drawOverlay(ctx, overlayParams);
    },
    [drawOverlay],
  );

  useEffect(() => {
    renderBasemapPlaceholderRef.current = renderBasemapPlaceholder;
  }, [renderBasemapPlaceholder]);

  useEffect(() => {
    let cancelled = false;
    loadImageData("/images/world_imagery_arcgis.png", {
      forceOpaqueAlpha: true,
    })
      .then((img) => {
        if (!cancelled) setBlueMarble(img);
      })
      .catch((err) => {
        console.warn("Failed to load world imagery basemap", err);
        if (!cancelled) setBlueMarble(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    const cached = boundaryCacheRef.current.get(boundaryResolution);
    if (cached) {
      setVectors(cached);
      return () => {
        mounted = false;
      };
    }
    fetchBoundaries(boundaryResolution).then((res) => {
      if (!mounted) return;
      boundaryCacheRef.current.set(boundaryResolution, res);
      setVectors(res);
    });
    return () => {
      mounted = false;
    };
  }, [boundaryResolution]);

  useEffect(() => {
    if (isZooming || isPanning) return;
    if (!vectors.length) {
      setVectorPaths({ boundary: [], geographic: [] });
      return;
    }
    const transform = geoTransform({
      point(lon, lat) {
        const { px, py } = geographicToPixel(
          lon,
          lat,
          renderWidth,
          renderHeight,
          {
            bounds,
            scale: viewScale,
            offsetX: offsets.offsetX,
            offsetY: offsets.offsetY,
          },
        );
        this.stream.point(px, py);
      },
    });
    const path = geoPath(transform);
    const nextBoundary: string[] = [];
    const nextGeographic: string[] = [];
    const footprintOptions = {
      bounds,
      scale: viewScale,
      offsetX: offsets.offsetX,
      offsetY: offsets.offsetY,
    };
    vectors.forEach((vec) => {
      splitAtDateline(vec.coordinates).forEach((segment) => {
        const trimmed = splitAtFootprint(
          segment,
          renderWidth,
          renderHeight,
          footprintOptions,
        );
        trimmed.forEach((footprintSegment) => {
          const d = path({
            type: "LineString",
            coordinates: footprintSegment.map((point) => [
              point.lon,
              point.lat,
            ]),
          });
          if (!d) return;
          if (vec.kind === "boundary") {
            nextBoundary.push(d);
          } else {
            nextGeographic.push(d);
          }
        });
      });
    });
    setVectorPaths({ boundary: nextBoundary, geographic: nextGeographic });
  }, [
    vectors,
    bounds,
    renderWidth,
    renderHeight,
    viewScale,
    offsets.offsetX,
    offsets.offsetY,
    isZooming,
    isPanning,
  ]);

  useEffect(() => {
    overlayStateRef.current = {
      clickMarker,
    };
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (
      baseFrameRef.current &&
      baseFrameRef.current.width === canvas.width &&
      baseFrameRef.current.height === canvas.height
    ) {
      ctx.putImageData(baseFrameRef.current, 0, 0);
    }

    drawOverlay(ctx);
  }, [clickMarker, drawOverlay]);

  useEffect(() => {
    // Keep offsets valid after resizes or programmatic scale changes.
    const clamped = clampViewOffset(
      viewScaleRef.current,
      viewOffsetRef.current,
    );
    if (
      clamped.x !== viewOffsetRef.current.x ||
      clamped.y !== viewOffsetRef.current.y
    ) {
      viewOffsetRef.current = clamped;
      setViewOffset(clamped);
    }
  }, [clampViewOffset]);

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
      canvas.width = renderWidth;
      canvas.height = renderHeight;
      baseFrameRef.current = null;
    }

    const baseDownsample = computeBaseDownsample(
      renderWidth,
      renderHeight,
      viewScale,
    );

    const drawFrame = (frame: ImageData) => {
      ctx.save();
      ctx.fillStyle = "#0b172a";
      ctx.fillRect(0, 0, renderWidth, renderHeight);
      ctx.restore();

      if (frame.width === renderWidth && frame.height === renderHeight) {
        ctx.putImageData(frame, 0, 0);
        baseFrameRef.current = frame;
        committedParamsRef.current = {
          renderWidth,
          renderHeight,
          scale: viewScale,
          offsetX: offsets.offsetX,
          offsetY: offsets.offsetY,
          bounds,
        };
      } else {
        const temp = document.createElement("canvas");
        temp.width = frame.width;
        temp.height = frame.height;
        const tctx = temp.getContext("2d");
        if (tctx) {
          tctx.putImageData(frame, 0, 0);
          ctx.drawImage(temp, 0, 0, renderWidth, renderHeight);
        }
        // Do not cache scaled preview frames
        baseFrameRef.current = null;
      }

      drawOverlay(ctx);
      committedParamsRef.current = {
        renderWidth,
        renderHeight,
        scale: viewScale,
        offsetX: offsets.offsetX,
        offsetY: offsets.offsetY,
        bounds,
      };
    };

    const isZooming = isZoomingRef.current;
    const shouldUseGridRaster =
      useMeshRasterActive && Boolean(gridTexture?.texture);
    const passes = isZooming ? [Math.min(baseDownsample * 4, 8)] : [1];

    const token = ++renderTokenRef.current;

    progressiveRender(
      passes.map((ds) => ({
        downsample: ds,
        onFrame: (frame) => {
          const imageData = new ImageData(
            new Uint8ClampedArray(frame.data),
            frame.width,
            frame.height,
          );
          if (token !== renderTokenRef.current) return;
          drawFrame(imageData);
        },
      })),
      (downsample) =>
        renderComposite({
          width: renderWidth,
          height: renderHeight,
          blueMarble: !isZooming ? (blueMarble ?? undefined) : undefined,
          rasters:
            isZooming && downsample > 1
              ? []
              : shouldUseGridRaster && gridTexture
                ? [
                    {
                      texture: gridTexture.texture,
                      rectangle: gridTexture.rectangle,
                      opacity: debouncedOpacity,
                    },
                  ]
                : rasterTextures.map((entry) => ({
                    texture: entry.texture,
                    rectangle: entry.rectangle,
                    opacity: debouncedOpacity,
                  })),
          bounds,
          downsample,
          scale: viewScale,
          offsetX: offsets.offsetX,
          offsetY: offsets.offsetY,
        }),
    );
  }, [
    rasterTextures,
    gridTexture,
    debouncedOpacity,
    bounds,
    blueMarble,
    renderWidth,
    renderHeight,
    viewScale,
    computeBaseDownsample,
    drawOverlay,
    offsets.offsetX,
    offsets.offsetY,
    useMeshRasterActive,
  ]);

  useEffect(() => {
    if (isZooming || isPanning) {
      pendingRenderRef.current = true;
      return;
    }
    pendingRenderRef.current = false;
    renderFrame();
  }, [renderFrame, isZooming, isPanning]);

  useEffect(() => {
    if (!isZooming && !isPanning && pendingRenderRef.current) {
      pendingRenderRef.current = false;
      renderFrame();
    }
  }, [isZooming, isPanning, renderFrame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onRegionClick) return;

    const handleClick = (evt: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const px = (evt.clientX - rect.left) * scaleX;
      const py = (evt.clientY - rect.top) * scaleY;
      const geo = pixelToGeographic(px, py, renderWidth, renderHeight, {
        bounds,
        scale: viewScale,
        offsetX: offsets.offsetX,
        offsetY: offsets.offsetY,
      });
      if (!geo) return;
      setClickMarker({ lat: geo.lat, lon: geo.lon });

      const rasterSource =
        useMeshRasterActive && rasterGridData ? rasterGridData : rasterData;
      const rasterValue = rasterSource?.sampleValue(geo.lat, geo.lon);
      const units = rasterData?.units ?? currentDataset?.units ?? "units";
      const datasetName = currentDataset?.name?.toLowerCase() ?? "";
      const datasetType = currentDataset?.dataType?.toLowerCase() ?? "";
      const looksTemperature =
        datasetType.includes("temp") ||
        datasetName.includes("temp") ||
        units.toLowerCase().includes("degc") ||
        units.toLowerCase().includes("celsius");
      const fallbackValue = looksTemperature
        ? -20 + Math.random() * 60
        : Math.random() * 100;
      const value = rasterValue ?? fallbackValue;

      const regionData: RegionData = {
        name: `${geo.lat.toFixed(2)}°, ${geo.lon.toFixed(2)}°`,
        precipitation: looksTemperature ? undefined : value,
        temperature: looksTemperature ? value : undefined,
        dataset: currentDataset?.name || "Sample Dataset",
        unit: units,
      };

      onRegionClick(geo.lat, geo.lon, regionData);
    };

    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [
    bounds,
    renderWidth,
    renderHeight,
    onRegionClick,
    rasterData,
    rasterGridData,
    currentDataset,
    viewScale,
    offsets.offsetX,
    offsets.offsetY,
    useMeshRasterActive,
  ]);

  // Drag to pan the view.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dragStateRef = {
      current: null as null | {
        startX: number;
        startY: number;
        startOffset: { x: number; y: number };
        scaleX: number;
        scaleY: number;
        pointerId: number;
      },
    };

    const onPointerDown = (evt: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      dragStateRef.current = {
        startX: evt.clientX,
        startY: evt.clientY,
        startOffset: { ...viewOffsetRef.current },
        scaleX,
        scaleY,
        pointerId: evt.pointerId,
      };
      isPanningRef.current = true;
      setIsPanning(true);
      try {
        canvas.setPointerCapture(evt.pointerId);
      } catch {
        /* noop */
      }
    };

    const onPointerMove = (evt: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      const dx = (evt.clientX - state.startX) * state.scaleX;
      const dy = (evt.clientY - state.startY) * state.scaleY;
      const nextOffset = {
        x: state.startOffset.x + dx,
        y: state.startOffset.y + dy,
      };
      const clamped = clampViewOffsetRef.current(
        viewScaleRef.current,
        nextOffset,
      );
      viewOffsetRef.current = clamped;
    };

    const endDrag = (evt: PointerEvent) => {
      const state = dragStateRef.current;
      if (state && state.pointerId === evt.pointerId) {
        dragStateRef.current = null;
        isPanningRef.current = false;
        setIsPanning(false);
        if (placeholderRafRef.current) {
          cancelAnimationFrame(placeholderRafRef.current);
          placeholderRafRef.current = null;
        }
        try {
          canvas.releasePointerCapture(evt.pointerId);
        } catch {
          /* noop */
        }
        setViewOffset(viewOffsetRef.current);
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
    };
  }, []);

  // Mouse wheel zoom to adjust view scale (center-anchored).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (evt: WheelEvent) => {
      evt.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const cursorPx = (evt.clientX - rect.left) * scaleX;
      const cursorPy = (evt.clientY - rect.top) * scaleY;
      const isZoomOut = evt.deltaY > 0;
      // Keep steps smooth but slightly stronger so users can reach very deep zoom with fewer scrolls.
      const factor = isZoomOut ? 0.9 : 1.2;

      const currentScale = viewScaleRef.current;
      const { width, height } = renderSizeRef.current;
      const currentOffsets = {
        offsetX: 0.5 * width * (1 - currentScale) + viewOffsetRef.current.x,
        offsetY: 0.5 * height * (1 - currentScale) + viewOffsetRef.current.y,
      };
      const geo = pixelToGeographic(cursorPx, cursorPy, width, height, {
        bounds: boundsRef.current,
        scale: currentScale,
        offsetX: currentOffsets.offsetX,
        offsetY: currentOffsets.offsetY,
      });

      const candidateScale = clamp(currentScale * factor, MIN_SCALE, MAX_SCALE);
      targetScaleRef.current = candidateScale;

      let nextOffset: { x: number; y: number };
      if (isZoomOut) {
        // Recentre on zoom out.
        nextOffset = { x: 0, y: 0 };
      } else if (geo) {
        // Keep cursor-focused point pinned under the pointer.
        const baseOffsetX =
          0.5 * width * (1 - candidateScale) + viewOffsetRef.current.x;
        const baseOffsetY =
          0.5 * height * (1 - candidateScale) + viewOffsetRef.current.y;
        const projected = geographicToPixel(geo.lon, geo.lat, width, height, {
          bounds: boundsRef.current,
          scale: candidateScale,
          offsetX: baseOffsetX,
          offsetY: baseOffsetY,
        });
        const deltaX = cursorPx - projected.px;
        const deltaY = cursorPy - projected.py;
        nextOffset = {
          x: viewOffsetRef.current.x + deltaX,
          y: viewOffsetRef.current.y + deltaY,
        };
      } else {
        nextOffset = { ...viewOffsetRef.current };
      }

      const clampedOffset = clampViewOffsetRef.current(
        candidateScale,
        nextOffset,
      );

      targetOffsetRef.current = clampedOffset;
      pendingViewScaleRef.current = candidateScale;
      viewScaleRef.current = candidateScale;
      viewOffsetRef.current = clampedOffset;

      setIsZooming(true);
      isZoomingRef.current = true;
      if (zoomRafRef.current) {
        cancelAnimationFrame(zoomRafRef.current);
      }
      zoomRafRef.current = requestAnimationFrame(() => {
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const offsetX = 0.5 * width * (1 - candidateScale) + clampedOffset.x;
        const offsetY = 0.5 * height * (1 - candidateScale) + clampedOffset.y;
        renderBasemapPlaceholderRef.current?.(
          ctx,
          candidateScale,
          offsetX,
          offsetY,
        );
      });

      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }
      zoomTimeoutRef.current = setTimeout(() => {
        isZoomingRef.current = false;
        setIsZooming(false);
        setViewScale(pendingViewScaleRef.current);
        setViewOffset(targetOffsetRef.current);
      }, 220);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }
      if (zoomRafRef.current) {
        cancelAnimationFrame(zoomRafRef.current);
      }
    };
  }, []);

  const boundaryStrokeWidth = 1.4;
  const geographicStrokeWidth = 1.1;

  return (
    <div className="absolute inset-0 h-full w-full">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ width: "100%", height: "100%" }}
      />
      <svg
        className="absolute inset-0 h-full w-full"
        width={renderWidth}
        height={renderHeight}
        viewBox={`0 0 ${renderWidth} ${renderHeight}`}
        style={{ pointerEvents: "none" }}
      >
        {boundaryLinesVisible &&
          vectorPaths.boundary.map((d, idx) => (
            <path
              key={`boundary-${idx}`}
              d={d}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth={boundaryStrokeWidth}
              vectorEffect="non-scaling-stroke"
              shapeRendering="geometricPrecision"
            />
          ))}
        {geographicLinesVisible &&
          vectorPaths.geographic.map((d, idx) => (
            <path
              key={`geographic-${idx}`}
              d={d}
              fill="none"
              stroke="#9ca3af"
              strokeWidth={geographicStrokeWidth}
              vectorEffect="non-scaling-stroke"
              shapeRendering="geometricPrecision"
              opacity={0.85}
            />
          ))}
      </svg>
    </div>
  );
};

export default WinkelMap;
