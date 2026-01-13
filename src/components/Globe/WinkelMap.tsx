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
import {
  renderComposite,
  projectVectors,
  progressiveRender,
} from "@/lib/projection/winkelTripelRenderer";
import type {
  GeoPoint,
  ProjectionSpaceBounds,
} from "@/lib/projection/winkelTripel";
import {
  geographicToPixel,
  pixelToGeographic,
} from "@/lib/projection/winkelTripel";
import type { Dataset, RegionData } from "@/types";

type Props = {
  rasterData?: RasterLayerData;
  rasterOpacity?: number;
  satelliteLayerVisible?: boolean;
  boundaryLinesVisible?: boolean;
  geographicLinesVisible?: boolean;
  bounds?: ProjectionSpaceBounds;
  currentDataset?: Dataset;
  onRegionClick?: (lat: number, lon: number, data: RegionData) => void;
  clearMarkerSignal?: number;
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
  currentDataset,
  onRegionClick = () => {},
  clearMarkerSignal = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { width, height } = useWindowSize();
  const renderScale =
    typeof window !== "undefined"
      ? Math.max(1, Math.min(1.1, (window.devicePixelRatio || 1) * 0.75))
      : 1.1;
  const renderWidth = Math.max(1, Math.round(width / renderScale));
  const renderHeight = Math.max(1, Math.round(height / renderScale));
  const renderTokenRef = useRef(0);
  const [viewScale, setViewScale] = useState(1);
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
  const pendingViewScaleRef = useRef(viewScale);
  const selectorImgRef = useRef<HTMLImageElement | null>(null);
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
  const [debouncedOpacity, setDebouncedOpacity] = useState(rasterOpacity);
  const [clickMarker, setClickMarker] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const offsets = useMemo(
    () => ({
      offsetX: 0.5 * renderWidth * (1 - viewScale) + viewOffset.x,
      offsetY: 0.5 * renderHeight * (1 - viewScale) + viewOffset.y,
    }),
    [renderWidth, renderHeight, viewScale, viewOffset],
  );
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
  const overlayStateRef = useRef<{
    projectedVectors: ReturnType<typeof projectVectors>;
    boundaryLinesVisible: boolean;
    geographicLinesVisible: boolean;
    clickMarker: { lat: number; lon: number } | null;
  }>({
    projectedVectors: [],
    boundaryLinesVisible,
    geographicLinesVisible,
    clickMarker: null,
  });

  // Reduce rapid re-renders while dragging the opacity slider.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedOpacity(rasterOpacity), 120);
    return () => clearTimeout(handle);
  }, [rasterOpacity]);

  useEffect(() => {
    pendingViewScaleRef.current = viewScale;
  }, [viewScale]);

  useEffect(() => {
    viewOffsetRef.current = viewOffset;
  }, [viewOffset]);

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
      const hideLines = isZoomingRef.current || isPanningRef.current;
      const params = paramsOverride ?? renderParamsRef.current;
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#e5e7eb";
      state.projectedVectors.forEach((vec) => {
        if (hideLines) return;
        if (vec.kind === "boundary" && !state.boundaryLinesVisible) return;
        if (vec.kind === "geographicLines" && !state.geographicLinesVisible)
          return;
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
    (w: number, h: number) => Math.max(1, Math.round(Math.min(w, h) / 2000)),
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
      if (!state.blueMarble) return;
      const downsample = Math.min(
        computeBaseDownsample(state.renderWidth, state.renderHeight) * 3,
        8,
      );
      const placeholder = renderComposite({
        width: state.renderWidth,
        height: state.renderHeight,
        blueMarble: state.blueMarble,
        rasters: [],
        bounds: state.bounds,
        downsample,
        scale,
        offsetX,
        offsetY,
      });
      const imageData = new ImageData(
        placeholder.data,
        placeholder.width,
        placeholder.height,
      );
      if (
        placeholder.width === state.renderWidth &&
        placeholder.height === state.renderHeight
      ) {
        ctx.putImageData(imageData, 0, 0);
      } else {
        const temp = document.createElement("canvas");
        temp.width = placeholder.width;
        temp.height = placeholder.height;
        const tctx = temp.getContext("2d");
        tctx?.putImageData(imageData, 0, 0);
        ctx.drawImage(temp, 0, 0, state.renderWidth, state.renderHeight);
      }
      drawOverlay(ctx, {
        renderWidth: state.renderWidth,
        renderHeight: state.renderHeight,
        scale,
        offsetX,
        offsetY,
        bounds: state.bounds,
      });
    },
    [computeBaseDownsample, drawOverlay],
  );

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
      renderWidth,
      renderHeight,
      {
        bounds,
        scale: viewScale,
        offsetX: offsets.offsetX,
        offsetY: offsets.offsetY,
      },
    );

    return projected.map((v, idx) => ({ ...v, kind: expanded[idx].kind }));
  }, [
    vectors,
    renderWidth,
    renderHeight,
    bounds,
    viewScale,
    offsets.offsetX,
    offsets.offsetY,
  ]);

  useEffect(() => {
    overlayStateRef.current = {
      projectedVectors,
      boundaryLinesVisible,
      geographicLinesVisible,
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
  }, [
    projectedVectors,
    boundaryLinesVisible,
    geographicLinesVisible,
    clickMarker,
    drawOverlay,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
      canvas.width = renderWidth;
      canvas.height = renderHeight;
      baseFrameRef.current = null;
    }

    const baseDownsample = computeBaseDownsample(renderWidth, renderHeight);

    const drawFrame = (frame: ImageData) => {
      ctx.clearRect(0, 0, renderWidth, renderHeight);

      if (frame.width === renderWidth && frame.height === renderHeight) {
        ctx.putImageData(frame, 0, 0);
        baseFrameRef.current = frame;
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
    };

    const interactive = isZooming || isPanning;
    const passes = interactive
      ? [Math.min(baseDownsample * 4, 8)]
      : [Math.min(baseDownsample * 2, 4), 1];

    const token = ++renderTokenRef.current;

    progressiveRender(
      passes.map((ds) => ({
        downsample: ds,
        onFrame: (frame) => {
          const imageData = new ImageData(
            frame.data,
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
          blueMarble: satelliteLayerVisible
            ? (blueMarble ?? undefined)
            : undefined,
          rasters:
            interactive && downsample > 1
              ? []
              : rasterTextures.map((entry) => ({
                  texture: entry.texture,
                  rectangle: entry.rectangle,
                  // If satellite is visible, gently reduce raster opacity to let basemap peek through.
                  opacity: satelliteLayerVisible
                    ? debouncedOpacity * 0.9
                    : debouncedOpacity,
                })),
          bounds,
          downsample,
          scale: viewScale,
          offsetX: offsets.offsetX,
          offsetY: offsets.offsetY,
        }),
    );
  }, [
    blueMarble,
    rasterTextures,
    debouncedOpacity,
    satelliteLayerVisible,
    bounds,
    renderWidth,
    renderHeight,
    viewScale,
    isZooming,
    isPanning,
    computeBaseDownsample,
    drawOverlay,
    offsets.offsetX,
    offsets.offsetY,
  ]);

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

      const rasterValue = rasterData?.sampleValue(geo.lat, geo.lon);
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
    currentDataset,
    viewScale,
    offsets.offsetX,
    offsets.offsetY,
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
      baseFrameRef.current = null;
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
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
      viewOffsetRef.current = nextOffset;
      setViewOffset(nextOffset);

      if (placeholderRafRef.current) {
        cancelAnimationFrame(placeholderRafRef.current);
      }
      const ctx = canvas.getContext("2d");
      placeholderRafRef.current = requestAnimationFrame(() => {
        renderBasemapPlaceholder(
          ctx,
          viewScale,
          0.5 * renderWidth * (1 - viewScale) + nextOffset.x,
          0.5 * renderHeight * (1 - viewScale) + nextOffset.y,
        );
      });
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
  }, [renderBasemapPlaceholder, renderHeight, renderWidth, viewScale]);

  // Mouse wheel zoom to adjust view scale (center-anchored).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (evt: WheelEvent) => {
      evt.preventDefault();
      const factor = evt.deltaY > 0 ? 0.9 : 1.1;
      const nextScale = Math.min(
        12,
        Math.max(0.7, pendingViewScaleRef.current * factor),
      );
      pendingViewScaleRef.current = nextScale;

      setIsZooming(true);
      isZoomingRef.current = true;
      baseFrameRef.current = null;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      const contextState = wheelContextRef.current;
      renderBasemapPlaceholder(
        ctx,
        nextScale,
        0.5 * contextState.renderWidth * (1 - nextScale) +
          contextState.viewOffset.x,
        0.5 * contextState.renderHeight * (1 - nextScale) +
          contextState.viewOffset.y,
      );

      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }
      zoomTimeoutRef.current = setTimeout(() => {
        isZoomingRef.current = false;
        setIsZooming(false);
      }, 180);

      if (zoomRafRef.current) {
        cancelAnimationFrame(zoomRafRef.current);
      }
      zoomRafRef.current = requestAnimationFrame(() => {
        setViewScale(pendingViewScaleRef.current);
      });
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

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ width: "100%", height: "100%" }}
    />
  );
};

export default WinkelMap;
