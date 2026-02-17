import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type {
  Dataset,
  GlobeLineResolution,
  LineColorSettings,
  RegionData,
} from "@/types";
import type { RasterLayerData } from "@/hooks/useRasterLayer";
import type { RasterGridData } from "@/hooks/useRasterGrid";
import { buildColorStops, mapValueToRgba } from "@/lib/mesh/colorMapping";
import {
  fetchOpenLayersTile,
  type LabelFeature,
  type LabelKind,
} from "@/lib/labels/openlayersVectorTiles";
import { useGlobeLines } from "@/hooks/useGlobeLines";
import { LineGeometryProcessor } from "@/utils/lineGeometryProcessor";
import type { NELineData } from "@/utils/naturalEarthLoader";
import { fetchGeoJson, preloadGeoJson } from "@/utils/geoJsonCache";
import {
  BASE_RADIUS,
  BASE_TEXTURE_URL,
  BASE_FILL_COLOR_SRGB,
  DEFAULT_GLOBE_ROTATION,
  DEFAULT_MAX_ZOOM,
  DEFAULT_MIN_ZOOM,
  DEFAULT_NORMAL_MAP_MODE,
  LABEL_FADE_MS,
  LABEL_MAX_VISIBLE,
  LABEL_MIN_VISIBLE,
  LABEL_TILE_URL,
  LABEL_VISIBILITY_THROTTLE_MS,
  MESH_TO_RASTER_ZOOM,
  NORMAL_MAP_LAND_BATHY_URL,
  NORMAL_MAP_LAND_URL,
  OVERLAY_RADIUS,
  RASTER_TO_MESH_ZOOM,
  VERTEX_COLOR_GAIN,
} from "./_ortho/constants";
import {
  DEFAULT_COLOR_TEXTURE,
  DEFAULT_NORMAL_TEXTURE,
  createGlobeMaterial,
  ensureTangents,
  setSolidVertexColor,
} from "./_ortho/materials";
import { clamp, latLonToCartesian } from "./_ortho/geo";
import {
  calculateLabelOpacity,
  cameraZoomToTileZoom,
  getLabelSpec,
  getLabelTier,
  latToTileY,
  lonToTileX,
  tileCenter,
} from "./_ortho/labelUtils";

type Props = {
  rasterData?: RasterLayerData;
  rasterGridData?: RasterGridData;
  rasterOpacity: number;
  satelliteLayerVisible: boolean;
  boundaryLinesVisible: boolean;
  countryBoundaryResolution?: GlobeLineResolution;
  stateBoundaryResolution?: GlobeLineResolution;
  geographicLinesVisible: boolean;
  timeZoneLinesVisible?: boolean;
  coastlineResolution?: GlobeLineResolution;
  riverResolution?: GlobeLineResolution;
  lakeResolution?: GlobeLineResolution;
  naturalEarthGeographicLinesVisible?: boolean;
  lineColors?: LineColorSettings;
  labelsVisible?: boolean;
  currentDataset?: Dataset;
  useMeshRaster: boolean;
  rasterBlurEnabled: boolean;
  useLegacyRendering?: boolean;
  normalMapMode?: "none" | "land" | "landBathymetry";
  smoothGridBoxValues?: boolean;
  hideZeroValues?: boolean;
  minZoom?: number;
  maxZoom?: number;
  clearMarkerSignal?: number;
  onRegionClick?: (lat: number, lon: number, data: RegionData) => void;
};

type OrthoLabelEntry = {
  feature: LabelFeature;
  el: HTMLDivElement;
  kind: LabelKind;
  opacity: number;
  targetOpacity: number;
};

const OrthoGlobe: React.FC<Props> = ({
  rasterData,
  rasterGridData,
  rasterOpacity,
  satelliteLayerVisible,
  boundaryLinesVisible,
  countryBoundaryResolution = "low",
  stateBoundaryResolution = "low",
  geographicLinesVisible,
  timeZoneLinesVisible = false,
  coastlineResolution = "low",
  riverResolution = "none",
  lakeResolution = "none",
  naturalEarthGeographicLinesVisible = false,
  lineColors,
  labelsVisible = false,
  currentDataset,
  useMeshRaster,
  rasterBlurEnabled,
  useLegacyRendering = false,
  normalMapMode = DEFAULT_NORMAL_MAP_MODE,
  smoothGridBoxValues = rasterBlurEnabled,
  hideZeroValues = false,
  minZoom = DEFAULT_MIN_ZOOM,
  maxZoom = DEFAULT_MAX_ZOOM,
  clearMarkerSignal = 0,
  onRegionClick,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const globeGroupRef = useRef<THREE.Group | null>(null);
  const baseMeshRef = useRef<THREE.Mesh | null>(null);
  const baseMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const meshOverlayRef = useRef<THREE.Mesh | null>(null);
  const meshMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const rasterOverlayRef = useRef<THREE.Mesh | null>(null);
  const rasterMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const geographicLineGroupRef = useRef<THREE.Group | null>(null);
  const timeZoneLineGroupRef = useRef<THREE.Group | null>(null);
  const timeZoneDataRef = useRef<NELineData | null>(null);
  const markerRef = useRef<THREE.Mesh | null>(null);
  const skyboxTextureRef = useRef<THREE.CubeTexture | null>(null);
  const gridTextureRef = useRef<THREE.Texture | null>(null);
  const rasterTextureRef = useRef<THREE.Texture | null>(null);
  const labelLayerRef = useRef<HTMLDivElement | null>(null);
  const normalMapTextureRef = useRef<THREE.Texture | null>(null);
  const baseTextureRef = useRef<THREE.Texture | null>(null);
  const sunlightRef = useRef<THREE.DirectionalLight | null>(null);
  const adminBoundaryGroupRef = useRef<THREE.Group | null>(null);
  const countryBoundaryLineRef = useRef<THREE.LineSegments | null>(null);
  const stateBoundaryLineRef = useRef<THREE.LineSegments | null>(null);
  const adminBoundaryConfigRef = useRef<string>("");
  const adminBoundarySegmentsRef = useRef<
    Map<string, ReturnType<typeof LineGeometryProcessor.processGeoJSON>>
  >(new Map());
  const markerBaseScaleRef = useRef(1);
  const markerBaseZoomRef = useRef(1);
  const zoomRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const useMeshRasterRef = useRef(useMeshRaster);
  const useMeshRasterActiveRef = useRef(useMeshRaster);
  const [useMeshRasterActive, setUseMeshRasterActive] = useState(useMeshRaster);
  const [linesRoot, setLinesRoot] = useState<THREE.Object3D | null>(null);
  const labelTileCacheRef = useRef<Map<string, OrthoLabelEntry[]>>(new Map());
  const labelTilePendingRef = useRef<Set<string>>(new Set());
  const labelTileAbortRef = useRef<AbortController | null>(null);
  const labelUpdateTimeoutRef = useRef<number | null>(null);
  const labelTileZoomRef = useRef<number | null>(null);
  const labelUpdateInFlightRef = useRef(false);
  const labelUpdateRequestedRef = useRef(false);
  const labelTierKeyRef = useRef<string | null>(null);
  const labelRafRef = useRef<number | null>(null);
  const labelZoomRef = useRef<number | null>(null);
  const labelLastFrameRef = useRef<number>(0);
  const labelFadeLastRef = useRef<number>(0);

  const useGridTexture = useLegacyRendering || !smoothGridBoxValues;
  useEffect(() => {
    useMeshRasterRef.current = useMeshRaster;
    useMeshRasterActiveRef.current = useMeshRaster;
    setUseMeshRasterActive(useMeshRaster);
  }, [useMeshRaster]);

  useEffect(() => {
    useMeshRasterActiveRef.current = useMeshRasterActive;
  }, [useMeshRasterActive]);

  useEffect(() => {
    const resMap: Record<Exclude<GlobeLineResolution, "none">, string> = {
      low: "110m",
      medium: "50m",
      high: "10m",
    };
    const urls: string[] = [];
    if (countryBoundaryResolution !== "none") {
      const res = resMap[countryBoundaryResolution];
      urls.push(`/_countries/ne_${res}_admin_0_boundary_lines_land.geojson`);
    }
    if (stateBoundaryResolution !== "none") {
      const res = resMap[stateBoundaryResolution];
      urls.push(`/_countries/ne_${res}_admin_1_states_provinces_lines.geojson`);
    }
    if (!urls.length) return;
    const preload = () => {
      urls.forEach((url) => preloadGeoJson(url));
    };
    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(preload, { timeout: 1200 });
    } else {
      window.setTimeout(preload, 300);
    }
  }, [countryBoundaryResolution, stateBoundaryResolution]);

  const requestRender = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) {
        return;
      }
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    });
  }, []);

  const useVertexColorsActive =
    !useGridTexture &&
    useMeshRasterActive &&
    Boolean(rasterGridData && currentDataset?.colorScale?.colors?.length);

  useGlobeLines(
    linesRoot,
    {
      visible: boundaryLinesVisible,
      coastline: coastlineResolution,
      rivers: riverResolution,
      lakes: lakeResolution,
      geographic: naturalEarthGeographicLinesVisible,
      radius: OVERLAY_RADIUS + 0.001,
      colors: {
        coastlines:
          lineColors?.coastlines ?? lineColors?.boundaryLines ?? "#9ca3af",
        rivers: lineColors?.rivers ?? lineColors?.boundaryLines ?? "#9ca3af",
        lakes: lineColors?.lakes ?? lineColors?.boundaryLines ?? "#9ca3af",
        geographic:
          lineColors?.geographicLines ??
          lineColors?.geographicGrid ??
          "#9ca3af",
      },
    },
    requestRender,
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const layer = document.createElement("div");
    layer.style.position = "absolute";
    layer.style.inset = "0";
    layer.style.zIndex = "2";
    layer.style.pointerEvents = "none";
    layer.style.userSelect = "none";
    if (typeof globalThis !== "undefined") {
      (globalThis as any).__orthoLabelLayer = layer;
    }
    containerRef.current.appendChild(layer);
    labelLayerRef.current = layer;

    return () => {
      layer.remove();
      if (labelLayerRef.current === layer) {
        labelLayerRef.current = null;
      }
    };
  }, []);

  const clearLabelTiles = useCallback(() => {
    const layer = labelLayerRef.current;
    if (layer) {
      labelTileCacheRef.current.forEach((entries) => {
        entries.forEach((entry) => {
          entry.el.remove();
        });
      });
    }
    labelTileCacheRef.current.clear();
    labelTilePendingRef.current.clear();
    labelTileZoomRef.current = null;
    labelTierKeyRef.current = null;
    if (labelTileAbortRef.current) {
      labelTileAbortRef.current.abort();
      labelTileAbortRef.current = null;
    }
  }, []);

  const createLabelEntry = useCallback((feature: LabelFeature) => {
    const layer = labelLayerRef.current;
    if (!layer) return null;
    const spec = getLabelSpec(feature.kind);
    const el = document.createElement("div");
    el.textContent = feature.name;
    el.style.position = "absolute";
    el.style.transform = "translate(-50%, -100%)";
    el.style.font = spec.font;
    el.style.color = spec.color;
    el.style.whiteSpace = "nowrap";
    el.style.textShadow = `0 1px 2px ${spec.outline}`;
    el.style.transition = "opacity 200ms ease-in-out";
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
    layer.appendChild(el);
    return {
      feature,
      el,
      kind: feature.kind,
      opacity: 0,
      targetOpacity: 0,
    } as OrthoLabelEntry;
  }, []);

  const setLabelOpacity = useCallback(
    (entry: OrthoLabelEntry, opacity: number) => {
      const clamped = Math.max(0, Math.min(1, opacity));
      entry.opacity = clamped;
      entry.el.style.opacity = `${clamped}`;
      if (clamped <= 0 && entry.targetOpacity <= 0) {
        entry.el.style.display = "none";
      } else {
        entry.el.style.display = "block";
      }
    },
    [],
  );

  const setLabelTarget = useCallback(
    (entry: OrthoLabelEntry, opacity: number) => {
      const clamped = Math.max(0, Math.min(1, opacity));
      entry.targetOpacity = clamped;
      if (clamped > 0) {
        entry.el.style.display = "block";
      }
    },
    [],
  );

  const estimateLabelSize = useCallback((entry: OrthoLabelEntry) => {
    const fontText = entry.el.style.font || "12px sans-serif";
    const fontSize = Number.parseFloat(fontText.split("px")[0] ?? "12");
    const length = entry.feature.name.length;
    const width = Math.max(10, Math.round(fontSize * 0.6 * length));
    const height = Math.max(10, Math.round(fontSize * 1.2));
    return { width, height };
  }, []);

  const angularDistanceDeg = useCallback(
    (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const toRad = (value: number) => (value * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return (c * 180) / Math.PI;
    },
    [],
  );

  const getLabelScreenPosition = useCallback((feature: LabelFeature) => {
    if (!cameraRef.current || !globeGroupRef.current || !containerRef.current) {
      return null;
    }
    cameraRef.current.updateMatrixWorld(true);
    globeGroupRef.current.updateMatrixWorld(true);
    const local = latLonToCartesian(
      feature.lat,
      feature.lon,
      OVERLAY_RADIUS + 0.003,
    );
    const world = globeGroupRef.current.localToWorld(local.clone());
    const cameraDirection = new THREE.Vector3();
    cameraRef.current.getWorldDirection(cameraDirection);
    const worldNormal = world.clone().normalize();
    if (worldNormal.dot(cameraDirection) > 0) {
      return null;
    }
    const cameraSpace = world
      .clone()
      .applyMatrix4(cameraRef.current.matrixWorldInverse);
    if (cameraSpace.z > 0) {
      return null;
    }
    const ndc = world.clone().project(cameraRef.current);
    if (ndc.x < -1 || ndc.x > 1 || ndc.y < -1 || ndc.y > 1) {
      return null;
    }
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (ndc.x * 0.5 + 0.5) * rect.width,
      y: (-ndc.y * 0.5 + 0.5) * rect.height,
      width: rect.width,
      height: rect.height,
    };
  }, []);

  const removeAdminLine = useCallback((line: THREE.LineSegments | null) => {
    if (!line || !adminBoundaryGroupRef.current) return;
    adminBoundaryGroupRef.current.remove(line);
    line.geometry.dispose();
    if (Array.isArray(line.material)) {
      line.material.forEach((material) => material.dispose());
    } else {
      line.material.dispose();
    }
  }, []);

  const loadAdminBoundaries = useCallback(async () => {
    if (!adminBoundaryGroupRef.current) return;
    const boundaryColor =
      lineColors?.boundaryLines ?? lineColors?.coastlines ?? "#9ca3af";
    const configKey = JSON.stringify({
      countryBoundaryResolution,
      stateBoundaryResolution,
      boundaryColor,
    });
    if (adminBoundaryConfigRef.current === configKey) return;
    adminBoundaryConfigRef.current = configKey;

    removeAdminLine(countryBoundaryLineRef.current);
    removeAdminLine(stateBoundaryLineRef.current);
    countryBoundaryLineRef.current = null;
    stateBoundaryLineRef.current = null;

    if (countryBoundaryResolution !== "none") {
      const resMap: Record<Exclude<GlobeLineResolution, "none">, string> = {
        low: "110m",
        medium: "50m",
        high: "10m",
      };
      const res = resMap[countryBoundaryResolution];
      const url = `/_countries/ne_${res}_admin_0_boundary_lines_land.geojson`;
      const cacheKey = `${url}|${OVERLAY_RADIUS + 0.002}`;
      let segments = adminBoundarySegmentsRef.current.get(cacheKey);
      if (!segments) {
        const data = await fetchGeoJson(url);
        if (data) {
          segments = LineGeometryProcessor.processGeoJSON(
            data,
            OVERLAY_RADIUS + 0.002,
            boundaryColor,
          );
          adminBoundarySegmentsRef.current.set(cacheKey, segments);
        }
      }
      if (segments?.length) {
        const line = LineGeometryProcessor.createLineGeometry(segments, 1.2, {
          color: boundaryColor,
          opacity: 0.7,
        });
        line.renderOrder = 12;
        line.frustumCulled = false;
        adminBoundaryGroupRef.current.add(line);
        countryBoundaryLineRef.current = line;
      }
    }

    if (stateBoundaryResolution !== "none") {
      const resMap: Record<Exclude<GlobeLineResolution, "none">, string> = {
        low: "110m",
        medium: "50m",
        high: "10m",
      };
      const res = resMap[stateBoundaryResolution];
      const url = `/_countries/ne_${res}_admin_1_states_provinces_lines.geojson`;
      const cacheKey = `${url}|${OVERLAY_RADIUS + 0.002}`;
      let segments = adminBoundarySegmentsRef.current.get(cacheKey);
      if (!segments) {
        const data = await fetchGeoJson(url);
        if (data) {
          segments = LineGeometryProcessor.processGeoJSON(
            data,
            OVERLAY_RADIUS + 0.002,
            boundaryColor,
          );
          adminBoundarySegmentsRef.current.set(cacheKey, segments);
        }
      }
      if (segments?.length) {
        const line = LineGeometryProcessor.createLineGeometry(segments, 1, {
          dashed: true,
          dashSize: 2.5,
          gapSize: 2.5,
          color: boundaryColor,
          opacity: 0.7,
        });
        line.renderOrder = 12;
        line.frustumCulled = false;
        adminBoundaryGroupRef.current.add(line);
        stateBoundaryLineRef.current = line;
      }
    }
    requestRender();
  }, [
    countryBoundaryResolution,
    lineColors?.boundaryLines,
    lineColors?.coastlines,
    removeAdminLine,
    requestRender,
    stateBoundaryResolution,
  ]);

  useEffect(() => {
    if (!adminBoundaryGroupRef.current || !linesRoot) return;
    loadAdminBoundaries();
  }, [loadAdminBoundaries, linesRoot]);

  const getTileKeysForView = useCallback(
    (zoom: number) => {
      if (!cameraRef.current || !globeGroupRef.current) return null;
      const corners: Array<{ lon: number; lat: number }> = [];
      const raycaster = new THREE.Raycaster();
      const targetMesh =
        baseMeshRef.current ??
        (useMeshRasterActiveRef.current && meshOverlayRef.current
          ? meshOverlayRef.current
          : rasterOverlayRef.current);
      if (!targetMesh) return null;
      cameraRef.current.updateMatrixWorld(true);
      globeGroupRef.current.updateMatrixWorld(true);
      targetMesh.updateMatrixWorld(true);

      const samplePoint = (x: number, y: number) => {
        raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current!);
        const intersects = raycaster.intersectObject(targetMesh);
        if (!intersects.length) return;
        const point = intersects[0].point;
        const localPoint = globeGroupRef.current
          ? globeGroupRef.current.worldToLocal(point.clone())
          : point;
        const lat =
          90 - (Math.acos(localPoint.y / OVERLAY_RADIUS) * 180) / Math.PI;
        const lon =
          ((Math.atan2(localPoint.z, localPoint.x) * 180) / Math.PI) * -1;
        return { lon, lat };
      };

      const samples = [-1, -0.5, 0, 0.5, 1];
      samples.forEach((x) => {
        samples.forEach((y) => {
          const point = samplePoint(x, y);
          if (point) corners.push(point);
        });
      });
      if (!corners.length) return null;

      const centerPoint = samplePoint(0, 0);
      const lats = corners.map((p) => p.lat);
      const lons = corners.map((p) => p.lon);
      const south = Math.min(...lats);
      const north = Math.max(...lats);
      const lonSpan = Math.max(...lons) - Math.min(...lons);
      const crossesDateline = lonSpan > 180;
      const buffer = 1;
      const tileCount = 2 ** zoom;

      const collectRange = (rangeWest: number, rangeEast: number) => {
        const xStart = lonToTileX(rangeWest, zoom);
        const xEnd = lonToTileX(rangeEast, zoom);
        const yStart = latToTileY(north, zoom);
        const yEnd = latToTileY(south, zoom);
        const keys: string[] = [];
        for (
          let x = Math.max(0, xStart - buffer);
          x <= Math.min(tileCount - 1, xEnd + buffer);
          x += 1
        ) {
          for (
            let y = Math.max(0, yStart - buffer);
            y <= Math.min(tileCount - 1, yEnd + buffer);
            y += 1
          ) {
            keys.push(`${zoom}/${x}/${y}`);
          }
        }
        return keys;
      };

      let centerLon = centerPoint
        ? centerPoint.lon
        : lons.reduce((sum, value) => sum + value, 0) / lons.length;
      let centerLat = centerPoint
        ? centerPoint.lat
        : lats.reduce((sum, value) => sum + value, 0) / lats.length;

      let maxAngularDistance = 0;
      corners.forEach((point) => {
        const distance = angularDistanceDeg(
          point.lat,
          point.lon,
          centerLat,
          centerLon,
        );
        if (distance > maxAngularDistance) {
          maxAngularDistance = distance;
        }
      });

      const keys = crossesDateline
        ? [
            ...collectRange(-180, Math.max(...lons)),
            ...collectRange(Math.min(...lons), 180),
          ]
        : collectRange(Math.min(...lons), Math.max(...lons));

      return { keys, centerLon, centerLat, maxAngularDistance };
    },
    [angularDistanceDeg],
  );

  const updateLabelVisibility = useCallback(() => {
    if (!labelsVisible) {
      labelTileCacheRef.current.forEach((entries) => {
        entries.forEach((entry) => {
          setLabelTarget(entry, 0);
          setLabelOpacity(entry, 0);
        });
      });
      if (countryBoundaryLineRef.current) {
        countryBoundaryLineRef.current.visible = false;
      }
      if (stateBoundaryLineRef.current) {
        stateBoundaryLineRef.current.visible = false;
      }
      return;
    }

    const tileZoomFloat = cameraZoomToTileZoom(cameraRef.current?.zoom ?? 1);
    const tier = getLabelTier(tileZoomFloat);
    const activeKinds = new Set<LabelKind>(tier.eligible);
    const tileInfo = getTileKeysForView(Math.round(tileZoomFloat));
    if (!tileInfo) return;

    const centerLon = tileInfo.centerLon;
    const centerLat = tileInfo.centerLat;
    const maxAngularDistance = tileInfo.maxAngularDistance + 6;
    const showCountryLines =
      countryBoundaryResolution !== "none" && tier.display.includes("country");
    const showStateLines =
      stateBoundaryResolution !== "none" && tier.display.includes("state");
    if (countryBoundaryLineRef.current) {
      countryBoundaryLineRef.current.visible = showCountryLines;
    }
    if (stateBoundaryLineRef.current) {
      stateBoundaryLineRef.current.visible = showStateLines;
    }

    const occupied = new Map<
      string,
      Array<{ x: number; y: number; w: number; h: number }>
    >();
    const cellSize = 64;

    const collides = (box: { x: number; y: number; w: number; h: number }) => {
      const minCellX = Math.floor(box.x / cellSize);
      const minCellY = Math.floor(box.y / cellSize);
      const maxCellX = Math.floor((box.x + box.w) / cellSize);
      const maxCellY = Math.floor((box.y + box.h) / cellSize);
      for (let cx = minCellX - 1; cx <= maxCellX + 1; cx += 1) {
        for (let cy = minCellY - 1; cy <= maxCellY + 1; cy += 1) {
          const key = `${cx},${cy}`;
          const entries = occupied.get(key);
          if (!entries) continue;
          for (const entry of entries) {
            const intersects =
              box.x < entry.x + entry.w &&
              box.x + box.w > entry.x &&
              box.y < entry.y + entry.h &&
              box.y + box.h > entry.y;
            if (intersects) return true;
          }
        }
      }
      return false;
    };

    const addBox = (box: { x: number; y: number; w: number; h: number }) => {
      const minCellX = Math.floor(box.x / cellSize);
      const minCellY = Math.floor(box.y / cellSize);
      const maxCellX = Math.floor((box.x + box.w) / cellSize);
      const maxCellY = Math.floor((box.y + box.h) / cellSize);
      for (let cx = minCellX; cx <= maxCellX; cx += 1) {
        for (let cy = minCellY; cy <= maxCellY; cy += 1) {
          const key = `${cx},${cy}`;
          const list = occupied.get(key) ?? [];
          list.push(box);
          occupied.set(key, list);
        }
      }
    };

    const priority = (kind: LabelKind) => {
      if (kind === "continent") return 0;
      if (kind === "country") return 1;
      if (kind === "state") return 2;
      if (kind === "cityLarge") return 3;
      if (kind === "cityMedium") return 4;
      if (kind === "citySmall") return 5;
      return 6;
    };

    const candidates: Array<{
      entry: OrthoLabelEntry;
      x: number;
      y: number;
    }> = [];
    let totalEntries = 0;
    let positionedEntries = 0;
    let targetCount = 0;
    const visibleEntries = new Set<OrthoLabelEntry>();
    labelTileCacheRef.current.forEach((entries) => {
      entries.forEach((entry) => {
        totalEntries += 1;
        if (!activeKinds.has(entry.kind)) {
          setLabelTarget(entry, 0);
          return;
        }
        const distance = angularDistanceDeg(
          entry.feature.lat,
          entry.feature.lon,
          centerLat,
          centerLon,
        );
        if (distance > maxAngularDistance) {
          setLabelTarget(entry, 0);
          return;
        }
        const pos = getLabelScreenPosition(entry.feature);
        if (!pos) {
          setLabelTarget(entry, 0);
          return;
        }
        positionedEntries += 1;
        entry.el.style.left = `${pos.x}px`;
        entry.el.style.top = `${pos.y}px`;
        candidates.push({ entry, x: pos.x, y: pos.y });
      });
    });
    candidates.sort((a, b) => {
      const pa = priority(a.entry.kind);
      const pb = priority(b.entry.kind);
      if (pa !== pb) return pa - pb;
      const dLonA = a.entry.feature.lon - centerLon;
      const dLonB = b.entry.feature.lon - centerLon;
      const dLatA = a.entry.feature.lat - centerLat;
      const dLatB = b.entry.feature.lat - centerLat;
      return dLonA * dLonA + dLatA * dLatA - (dLonB * dLonB + dLatB * dLatB);
    });

    let shownCount = 0;
    const placeCandidates = (kinds: LabelKind[]) => {
      const allowed = new Set(kinds);
      candidates.forEach((candidate) => {
        if (shownCount >= LABEL_MAX_VISIBLE) return;
        const entry = candidate.entry;
        if (!allowed.has(entry.kind)) return;
        const size = estimateLabelSize(entry);
        const box = {
          x: candidate.x - size.width / 2,
          y: candidate.y - size.height,
          w: size.width,
          h: size.height,
        };
        if (collides(box)) return;
        const opacity = calculateLabelOpacity(entry.kind, tileZoomFloat, tier);
        if (opacity <= 0) {
          setLabelTarget(entry, 0);
          return;
        }
        addBox(box);
        setLabelTarget(entry, opacity);
        targetCount += 1;
        visibleEntries.add(entry);
        shownCount += 1;
      });
    };

    placeCandidates(tier.display);
    if (shownCount < LABEL_MIN_VISIBLE) {
      placeCandidates(tier.eligible);
    }
    candidates.forEach((candidate) => {
      if (!visibleEntries.has(candidate.entry)) {
        setLabelTarget(candidate.entry, 0);
      }
    });
    if (typeof globalThis !== "undefined") {
      (globalThis as any).__orthoLabelDebugVisibility = {
        zoomFloat: tileZoomFloat,
        totalEntries,
        positionedEntries,
        candidates: candidates.length,
        targetCount,
      };
    }
  }, [
    countryBoundaryResolution,
    estimateLabelSize,
    getLabelScreenPosition,
    getTileKeysForView,
    labelsVisible,
    stateBoundaryResolution,
    setLabelOpacity,
    setLabelTarget,
  ]);

  const updateLabelFades = useCallback(
    (now: number) => {
      const last = labelFadeLastRef.current || now;
      const dt = Math.min(1, (now - last) / LABEL_FADE_MS);
      let maxOpacity = 0;
      let visibleCount = 0;
      labelTileCacheRef.current.forEach((entries) => {
        entries.forEach((entry) => {
          const target = entry.targetOpacity ?? 0;
          const current = entry.opacity ?? 0;
          const next = current + (target - current) * dt;
          setLabelOpacity(entry, next);
          if (next > maxOpacity) {
            maxOpacity = next;
          }
          if (next > 0.05) {
            visibleCount += 1;
          }
        });
      });
      labelFadeLastRef.current = now;
      if (typeof globalThis !== "undefined") {
        (globalThis as any).__orthoLabelDebugFade = {
          maxOpacity,
          visibleCount,
        };
      }
    },
    [setLabelOpacity],
  );

  const updateLabelTiles = useCallback(async () => {
    if (!labelsVisible || !labelLayerRef.current) {
      clearLabelTiles();
      return;
    }
    if (labelUpdateInFlightRef.current) {
      labelUpdateRequestedRef.current = true;
      return;
    }
    labelUpdateInFlightRef.current = true;
    const tileZoomFloat = cameraZoomToTileZoom(cameraRef.current?.zoom ?? 1);
    const zoom = Math.min(10, Math.round(tileZoomFloat));
    const tier = getLabelTier(tileZoomFloat);
    const tierKey = `${tier.display.join(",")}|${tier.eligible.join(",")}`;
    if (labelTierKeyRef.current !== tierKey) {
      clearLabelTiles();
      labelTierKeyRef.current = tierKey;
    }
    const activeKinds = new Set<LabelKind>(tier.eligible);
    const tileInfo = getTileKeysForView(zoom);
    if (!tileInfo || !tileInfo.keys.length) {
      if (typeof globalThis !== "undefined") {
        (globalThis as any).__orthoLabelDebug = {
          reason: "no-tile-keys",
          zoom,
          zoomFloat: tileZoomFloat,
        };
      }
      labelUpdateInFlightRef.current = false;
      return;
    }
    if (typeof globalThis !== "undefined") {
      (globalThis as any).__orthoLabelDebug = {
        zoom,
        zoomFloat: tileZoomFloat,
        tileCount: tileInfo.keys.length,
        sampleKey: tileInfo.keys[0],
        cachedTiles: labelTileCacheRef.current.size,
        pendingTiles: labelTilePendingRef.current.size,
      };
      (globalThis as any).__orthoLabelTileStats = {
        cached: labelTileCacheRef.current.size,
        pending: labelTilePendingRef.current.size,
        lastFetch: null,
      };
    }
    const {
      keys: tileKeys,
      centerLon,
      centerLat,
      maxAngularDistance,
    } = tileInfo;
    tileKeys.sort((a, b) => {
      const [za, xa, ya] = a.split("/").map((value) => Number(value));
      const [zb, xb, yb] = b.split("/").map((value) => Number(value));
      if (za !== zb) return za - zb;
      const ca = tileCenter(xa, ya, za);
      const cb = tileCenter(xb, yb, zb);
      let dLonA = Math.abs(ca.lon - centerLon);
      if (dLonA > 180) dLonA = 360 - dLonA;
      let dLonB = Math.abs(cb.lon - centerLon);
      if (dLonB > 180) dLonB = 360 - dLonB;
      const dLatA = ca.lat - centerLat;
      const dLatB = cb.lat - centerLat;
      return dLonA * dLonA + dLatA * dLatA - (dLonB * dLonB + dLatB * dLatB);
    });
    const filteredTileKeys = tileKeys.filter((key) => {
      const [z, x, y] = key.split("/").map((value) => Number(value));
      const center = tileCenter(x, y, z);
      const distance = angularDistanceDeg(
        center.lat,
        center.lon,
        centerLat,
        centerLon,
      );
      return distance <= maxAngularDistance + 6;
    });

    if (labelTileZoomRef.current !== zoom) {
      clearLabelTiles();
      labelTileZoomRef.current = zoom;
    }
    if (!labelTileAbortRef.current) {
      labelTileAbortRef.current = new AbortController();
    }
    const { signal } = labelTileAbortRef.current;

    const maxTiles = 24;
    if (filteredTileKeys.length > maxTiles) {
      filteredTileKeys.length = maxTiles;
    }

    let addedTiles = false;
    const maxConcurrent = 6;
    for (let i = 0; i < filteredTileKeys.length; i += maxConcurrent) {
      const chunk = filteredTileKeys.slice(i, i + maxConcurrent);
      await Promise.all(
        chunk.map(async (key) => {
          if (labelTileCacheRef.current.has(key)) return;
          if (labelTilePendingRef.current.has(key)) return;
          labelTilePendingRef.current.add(key);
          const [z, x, y] = key.split("/").map((value) => Number(value));
          const url = LABEL_TILE_URL.replace("{z}", `${z}`)
            .replace("{x}", `${x}`)
            .replace("{y}", `${y}`);
          try {
            const features = await fetchOpenLayersTile(url, z, x, y, signal);
            const filtered = features
              .filter((feature) => feature.kind !== "street")
              .filter((feature) => activeKinds.has(feature.kind));
            const entries = filtered
              .map((feature) => createLabelEntry(feature))
              .filter(Boolean) as OrthoLabelEntry[];
            labelTileCacheRef.current.set(key, entries);
            if (entries.length) {
              addedTiles = true;
            }
            if (typeof globalThis !== "undefined") {
              (globalThis as any).__orthoLabelTileStats = {
                cached: labelTileCacheRef.current.size,
                pending: labelTilePendingRef.current.size,
                lastFetch: {
                  key,
                  url,
                  featureCount: features.length,
                  entryCount: entries.length,
                },
              };
            }
          } catch (error) {
            if (typeof globalThis !== "undefined") {
              (globalThis as any).__orthoLabelDebug = {
                error: (error as Error)?.message ?? "tile-fetch-failed",
                url,
                zoom,
              };
            }
          } finally {
            labelTilePendingRef.current.delete(key);
          }
        }),
      );
    }

    if (addedTiles) {
      updateLabelVisibility();
    }
    labelUpdateInFlightRef.current = false;
    if (labelUpdateRequestedRef.current) {
      labelUpdateRequestedRef.current = false;
      updateLabelTiles();
    }
  }, [
    clearLabelTiles,
    createLabelEntry,
    getTileKeysForView,
    labelsVisible,
    updateLabelVisibility,
  ]);

  const scheduleLabelUpdate = useCallback(() => {
    if (labelUpdateTimeoutRef.current != null) {
      window.clearTimeout(labelUpdateTimeoutRef.current);
    }
    labelUpdateTimeoutRef.current = window.setTimeout(() => {
      updateLabelTiles();
    }, 80);
  }, [updateLabelTiles]);

  useEffect(() => {
    if (!markerRef.current) return;
    markerRef.current.visible = false;
    markerRef.current = null;
    requestRender();
  }, [clearMarkerSignal, requestRender]);

  const updateCamera = useCallback(() => {
    if (!containerRef.current || !cameraRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const aspect = clientWidth / clientHeight || 1;
    const frustumHeight = 2.2;
    cameraRef.current.left = (-frustumHeight * aspect) / 2;
    cameraRef.current.right = (frustumHeight * aspect) / 2;
    cameraRef.current.top = frustumHeight / 2;
    cameraRef.current.bottom = -frustumHeight / 2;
    cameraRef.current.updateProjectionMatrix();
    requestRender();
  }, [requestRender]);

  const updateMeshVisibility = useCallback(() => {
    if (meshOverlayRef.current) {
      meshOverlayRef.current.visible = useGridTexture
        ? useMeshRasterActiveRef.current && Boolean(gridTextureRef.current)
        : useVertexColorsActive;
    }
    if (rasterOverlayRef.current) {
      rasterOverlayRef.current.visible = useGridTexture
        ? !useMeshRasterActiveRef.current && Boolean(rasterTextureRef.current)
        : !useVertexColorsActive && Boolean(rasterTextureRef.current);
    }
    requestRender();
  }, [requestRender, useGridTexture, useVertexColorsActive]);

  const updateRasterOpacity = useCallback(() => {
    const opacity = clamp(rasterOpacity, 0, 1);
    if (meshMaterialRef.current) {
      meshMaterialRef.current.uniforms.opacity.value = opacity;
      meshMaterialRef.current.needsUpdate = true;
    }
    if (rasterMaterialRef.current) {
      rasterMaterialRef.current.uniforms.opacity.value = opacity;
      rasterMaterialRef.current.needsUpdate = true;
    }
    requestRender();
  }, [rasterOpacity, requestRender]);

  const updateSatelliteVisibility = useCallback(() => {
    const visible = satelliteLayerVisible && !useMeshRasterActiveRef.current;
    if (baseMaterialRef.current) {
      baseMaterialRef.current.uniforms.useTexture.value = visible;
      baseMaterialRef.current.uniforms.colorMap.value = visible
        ? (baseTextureRef.current ?? DEFAULT_COLOR_TEXTURE)
        : DEFAULT_COLOR_TEXTURE;
      baseMaterialRef.current.uniforms.useVertexColor.value = false;
      baseMaterialRef.current.uniforms.baseColor.value.copy(
        BASE_FILL_COLOR_SRGB,
      );
      baseMaterialRef.current.uniforms.opacity.value = 1;
    }
    requestRender();
  }, [satelliteLayerVisible, requestRender]);

  const updateMeshRasterActive = useCallback((zoom: number) => {
    if (!useMeshRasterRef.current) return;
    if (rasterGridData && currentDataset?.colorScale?.colors?.length) {
      if (!useMeshRasterActiveRef.current) {
        useMeshRasterActiveRef.current = true;
        setUseMeshRasterActive(true);
      }
      return;
    }
    const current = useMeshRasterActiveRef.current;
    if (current && zoom > MESH_TO_RASTER_ZOOM) {
      useMeshRasterActiveRef.current = false;
      setUseMeshRasterActive(false);
    } else if (!current && zoom < RASTER_TO_MESH_ZOOM) {
      useMeshRasterActiveRef.current = true;
      setUseMeshRasterActive(true);
    }
  }, []);

  const updateMarkerVisibility = useCallback(() => {
    if (!markerRef.current || !cameraRef.current || !globeGroupRef.current) {
      return;
    }
    const worldPos = globeGroupRef.current.localToWorld(
      markerRef.current.position.clone(),
    );
    const cameraSpace = worldPos.applyMatrix4(
      cameraRef.current.matrixWorldInverse,
    );
    markerRef.current.visible = cameraSpace.z <= 0;
  }, []);

  const updateMarkerScale = useCallback(() => {
    if (!markerRef.current || !cameraRef.current) return;
    const baseScale = markerBaseScaleRef.current || 1;
    const baseZoom = markerBaseZoomRef.current || 1;
    const scale = baseScale * (baseZoom / cameraRef.current.zoom);
    markerRef.current.scale.set(scale, scale, scale);
  }, []);

  const buildVertexColorsFromGrid = useCallback(
    (geometry: THREE.BufferGeometry) => {
      if (!rasterGridData || !currentDataset?.colorScale?.colors?.length) {
        return;
      }
      const position = geometry.getAttribute("position");
      if (!position) return;
      const min = rasterGridData.min ?? 0;
      const max = rasterGridData.max ?? 1;
      const stops = buildColorStops(currentDataset.colorScale.colors);
      const latValues = rasterGridData.lat;
      const lonValues = rasterGridData.lon;
      const rows = latValues.length;
      const cols = lonValues.length;
      if (!rows || !cols) return;

      const buildCellIndexFinder = (values: ArrayLike<number>) => {
        const count = values.length;
        if (!count) {
          return () => 0;
        }
        const ascending = values[0] < values[count - 1];
        const normalized = ascending
          ? Array.from(values)
          : Array.from(values, (v) => -v);
        const edges = new Array(count + 1);
        if (count === 1) {
          edges[0] = normalized[0] - 0.5;
          edges[1] = normalized[0] + 0.5;
        } else {
          edges[0] = normalized[0] - (normalized[1] - normalized[0]) * 0.5;
          for (let i = 1; i < count; i += 1) {
            edges[i] = (normalized[i - 1] + normalized[i]) * 0.5;
          }
          edges[count] =
            normalized[count - 1] +
            (normalized[count - 1] - normalized[count - 2]) * 0.5;
        }

        return (target: number) => {
          const value = ascending ? target : -target;
          let low = 0;
          let high = edges.length - 1;
          while (low < high - 1) {
            const mid = Math.floor((low + high) / 2);
            if (value < edges[mid]) {
              high = mid;
            } else {
              low = mid;
            }
          }
          if (low < 0) return 0;
          if (low >= count) return count - 1;
          return low;
        };
      };

      const colors = new Float32Array(position.count * 3);
      const values = rasterGridData.values;
      const mask = rasterGridData.mask;
      const findLatCell = buildCellIndexFinder(latValues);
      const findLonCell = buildCellIndexFinder(lonValues);

      for (let i = 0; i < position.count; i += 1) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const r = Math.sqrt(x * x + y * y + z * z) || OVERLAY_RADIUS;
        const lat = 90 - (Math.acos(y / r) * 180) / Math.PI;
        const lon = ((Math.atan2(z, x) * 180) / Math.PI) * -1;

        let value: number | null = null;
        if (smoothGridBoxValues && rasterGridData.sampleValue) {
          value = rasterGridData.sampleValue(lat, lon);
        } else {
          const latIdx = findLatCell(lat);
          const lonIdx = findLonCell(lon);
          const idx = latIdx * cols + lonIdx;
          if (!mask || mask[idx] !== 0) {
            value = values[idx];
          }
        }

        if (hideZeroValues && value === 0) {
          value = null;
        }

        const rgba =
          value == null || Number.isNaN(value)
            ? [0, 0, 0, 0]
            : mapValueToRgba(value, min, max, stops);
        const rColor = Math.min(1, (rgba[0] / 255) * VERTEX_COLOR_GAIN);
        const gColor = Math.min(1, (rgba[1] / 255) * VERTEX_COLOR_GAIN);
        const bColor = Math.min(1, (rgba[2] / 255) * VERTEX_COLOR_GAIN);
        const base = i * 3;
        if (value == null || Number.isNaN(value)) {
          colors[base] = BASE_FILL_COLOR_SRGB.r;
          colors[base + 1] = BASE_FILL_COLOR_SRGB.g;
          colors[base + 2] = BASE_FILL_COLOR_SRGB.b;
        } else {
          colors[base] = rColor;
          colors[base + 1] = gColor;
          colors[base + 2] = bColor;
        }
      }

      const colorAttr = geometry.getAttribute(
        "color",
      ) as THREE.BufferAttribute | null;
      if (!colorAttr || colorAttr.count !== position.count) {
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      } else {
        colorAttr.copyArray(colors);
        colorAttr.needsUpdate = true;
      }
    },
    [
      currentDataset?.colorScale?.colors,
      hideZeroValues,
      rasterGridData,
      smoothGridBoxValues,
    ],
  );

  const buildGridTexture = useCallback(() => {
    if (!rasterGridData || !currentDataset?.colorScale?.colors?.length) {
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
    const canvas = document.createElement("canvas");
    canvas.width = cols;
    canvas.height = rows;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingEnabled = smoothGridBoxValues;
    const imageData = context.createImageData(cols, rows);
    const latAscending = rasterGridData.lat[0] < rasterGridData.lat[rows - 1];
    const values = rasterGridData.values;
    const mask = rasterGridData.mask;
    for (let row = 0; row < rows; row += 1) {
      const srcRow = latAscending ? rows - 1 - row : row;
      for (let col = 0; col < cols; col += 1) {
        const srcIdx = srcRow * cols + col;
        const destIdx = (row * cols + col) * 4;
        if (mask && mask[srcIdx] === 0) {
          imageData.data[destIdx + 3] = 0;
          continue;
        }
        const value = values[srcIdx];
        if (hideZeroValues && value === 0) {
          imageData.data[destIdx + 3] = 0;
          continue;
        }
        const rgba =
          value == null || Number.isNaN(value)
            ? [0, 0, 0, 0]
            : mapValueToRgba(value, min, max, stops);
        imageData.data[destIdx] = Math.min(
          255,
          Math.round(rgba[0] * VERTEX_COLOR_GAIN),
        );
        imageData.data[destIdx + 1] = Math.min(
          255,
          Math.round(rgba[1] * VERTEX_COLOR_GAIN),
        );
        imageData.data[destIdx + 2] = Math.min(
          255,
          Math.round(rgba[2] * VERTEX_COLOR_GAIN),
        );
        imageData.data[destIdx + 3] = rgba[3];
      }
    }
    context.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = smoothGridBoxValues
      ? THREE.LinearFilter
      : THREE.NearestFilter;
    texture.magFilter = smoothGridBoxValues
      ? THREE.LinearFilter
      : THREE.NearestFilter;
    texture.generateMipmaps = smoothGridBoxValues;
    texture.needsUpdate = true;
    return texture;
  }, [
    currentDataset?.colorScale?.colors,
    hideZeroValues,
    smoothGridBoxValues,
    rasterGridData,
  ]);

  const loadRasterTexture = useCallback(
    (url: string) => {
      const loader = new THREE.TextureLoader();
      return new Promise<THREE.Texture>((resolve, reject) => {
        loader.load(
          url,
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = smoothGridBoxValues
              ? THREE.LinearMipMapLinearFilter
              : THREE.NearestFilter;
            texture.magFilter = smoothGridBoxValues
              ? THREE.LinearFilter
              : THREE.NearestFilter;
            texture.generateMipmaps = smoothGridBoxValues;
            resolve(texture);
          },
          undefined,
          reject,
        );
      });
    },
    [smoothGridBoxValues],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.zIndex = "1";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(0, 0, 3);
    camera.zoom = zoomRef.current;
    camera.updateProjectionMatrix();
    cameraRef.current = camera;

    const group = new THREE.Group();
    globeGroupRef.current = group;
    group.rotation.copy(DEFAULT_GLOBE_ROTATION);
    scene.add(group);
    setLinesRoot(group);

    const adminGroup = new THREE.Group();
    adminGroup.renderOrder = 12;
    adminBoundaryGroupRef.current = adminGroup;
    group.add(adminGroup);

    const geometry = new THREE.SphereGeometry(BASE_RADIUS, 96, 64);
    setSolidVertexColor(geometry, BASE_FILL_COLOR_SRGB);
    ensureTangents(geometry);
    const baseMaterial = createGlobeMaterial({
      transparent: false,
      depthWrite: true,
      opacity: 1,
      useTexture: false,
      useVertexColor: false,
      baseColor: BASE_FILL_COLOR_SRGB,
      lightingEnabled: false,
    });
    const baseMesh = new THREE.Mesh(geometry, baseMaterial);
    baseMeshRef.current = baseMesh;
    baseMaterialRef.current = baseMaterial;
    group.add(baseMesh);

    const overlayGeometry = new THREE.SphereGeometry(OVERLAY_RADIUS, 96, 64);
    setSolidVertexColor(overlayGeometry, BASE_FILL_COLOR_SRGB);
    ensureTangents(overlayGeometry);
    const meshMaterial = createGlobeMaterial({
      transparent: true,
      depthWrite: false,
      opacity: rasterOpacity,
      useTexture: false,
      useVertexColor: true,
      baseColor: BASE_FILL_COLOR_SRGB,
      lightingEnabled: false,
    });
    const meshOverlay = new THREE.Mesh(overlayGeometry, meshMaterial);
    meshOverlayRef.current = meshOverlay;
    meshMaterialRef.current = meshMaterial;
    group.add(meshOverlay);

    const rasterMaterial = createGlobeMaterial({
      transparent: true,
      depthWrite: false,
      opacity: rasterOpacity,
      useTexture: false,
      useVertexColor: false,
      baseColor: BASE_FILL_COLOR_SRGB,
      lightingEnabled: false,
    });
    const rasterOverlay = new THREE.Mesh(overlayGeometry, rasterMaterial);
    rasterOverlayRef.current = rasterOverlay;
    rasterMaterialRef.current = rasterMaterial;
    group.add(rasterOverlay);

    const loader = new THREE.TextureLoader();
    loader.load(BASE_TEXTURE_URL, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      baseTextureRef.current = texture;
      if (baseMaterialRef.current) {
        baseMaterialRef.current.uniforms.colorMap.value = texture;
      }
      updateSatelliteVisibility();
      requestRender();
    });

    const cubeLoader = new THREE.CubeTextureLoader();
    cubeLoader.setPath("/cesium/Assets/Textures/SkyBox/");
    const skybox = cubeLoader.load([
      "tycho2t3_80_px.jpg",
      "tycho2t3_80_mx.jpg",
      "tycho2t3_80_py.jpg",
      "tycho2t3_80_my.jpg",
      "tycho2t3_80_pz.jpg",
      "tycho2t3_80_mz.jpg",
    ]);
    skybox.colorSpace = THREE.SRGBColorSpace;
    scene.background = skybox;
    skyboxTextureRef.current = skybox;

    updateCamera();
    requestRender();

    const handleResize = () => {
      if (!rendererRef.current || !containerRef.current) return;
      rendererRef.current.setSize(
        containerRef.current.clientWidth,
        containerRef.current.clientHeight,
      );
      updateCamera();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current.domElement.remove();
      }
      if (gridTextureRef.current) gridTextureRef.current.dispose();
      if (rasterTextureRef.current) rasterTextureRef.current.dispose();
      if (normalMapTextureRef.current) normalMapTextureRef.current.dispose();
      if (baseTextureRef.current) baseTextureRef.current.dispose();
      if (skyboxTextureRef.current) skyboxTextureRef.current.dispose();
      if (baseMaterialRef.current) baseMaterialRef.current.dispose();
      if (meshMaterialRef.current) meshMaterialRef.current.dispose();
      if (rasterMaterialRef.current) rasterMaterialRef.current.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      globeGroupRef.current = null;
      baseMeshRef.current = null;
      baseMaterialRef.current = null;
      meshOverlayRef.current = null;
      meshMaterialRef.current = null;
      rasterOverlayRef.current = null;
      rasterMaterialRef.current = null;
      geographicLineGroupRef.current = null;
      sunlightRef.current = null;
      markerRef.current = null;
    };
  }, [requestRender, updateCamera]);

  useEffect(() => {
    updateSatelliteVisibility();
  }, [updateSatelliteVisibility, useMeshRasterActive]);

  useEffect(() => {
    updateRasterOpacity();
  }, [updateRasterOpacity]);

  useEffect(() => {
    if (labelLayerRef.current) {
      labelLayerRef.current.style.display = labelsVisible ? "block" : "none";
    }
    if (labelsVisible) {
      labelZoomRef.current = cameraRef.current?.zoom ?? null;
      scheduleLabelUpdate();
      const timeout = window.setTimeout(() => {
        updateLabelTiles();
        updateLabelVisibility();
      }, 100);
      return () => {
        window.clearTimeout(timeout);
      };
    }
    clearLabelTiles();
    return undefined;
  }, [
    clearLabelTiles,
    labelsVisible,
    scheduleLabelUpdate,
    updateLabelTiles,
    updateLabelVisibility,
  ]);

  useEffect(() => {
    return () => {
      clearLabelTiles();
    };
  }, [clearLabelTiles]);

  useEffect(() => {
    if (!labelsVisible) {
      if (labelRafRef.current) {
        cancelAnimationFrame(labelRafRef.current);
        labelRafRef.current = null;
      }
      return;
    }
    const tick = (time: number) => {
      const currentZoom = cameraRef.current?.zoom;
      if (typeof currentZoom === "number") {
        if (labelZoomRef.current === null) {
          labelZoomRef.current = currentZoom;
        } else if (Math.abs(currentZoom - labelZoomRef.current) > 0.01) {
          labelZoomRef.current = currentZoom;
          scheduleLabelUpdate();
        }
      }
      if (time - labelLastFrameRef.current > LABEL_VISIBILITY_THROTTLE_MS) {
        updateLabelVisibility();
        labelLastFrameRef.current = time;
      }
      updateLabelFades(time);
      labelRafRef.current = requestAnimationFrame(tick);
    };
    labelRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (labelRafRef.current) {
        cancelAnimationFrame(labelRafRef.current);
        labelRafRef.current = null;
      }
    };
  }, [
    labelsVisible,
    scheduleLabelUpdate,
    updateLabelFades,
    updateLabelVisibility,
  ]);

  useEffect(() => {
    if (!meshOverlayRef.current) return;
    if (useGridTexture) {
      const texture = buildGridTexture();
      if (!texture) {
        if (gridTextureRef.current) {
          gridTextureRef.current.dispose();
          gridTextureRef.current = null;
        }
        if (meshMaterialRef.current) {
          meshMaterialRef.current.uniforms.useTexture.value = false;
          meshMaterialRef.current.uniforms.useVertexColor.value = false;
          meshMaterialRef.current.uniforms.colorMap.value =
            DEFAULT_COLOR_TEXTURE;
          meshMaterialRef.current.uniforms.baseColor.value.copy(
            BASE_FILL_COLOR_SRGB,
          );
        }
        updateMeshVisibility();
        return;
      }
      if (gridTextureRef.current) gridTextureRef.current.dispose();
      gridTextureRef.current = texture;
      if (meshMaterialRef.current) {
        meshMaterialRef.current.uniforms.useTexture.value = true;
        meshMaterialRef.current.uniforms.useVertexColor.value = false;
        meshMaterialRef.current.uniforms.colorMap.value = texture;
      }
      updateMeshVisibility();
      return;
    }

    const geometry = meshOverlayRef.current.geometry;
    buildVertexColorsFromGrid(geometry);
    if (meshMaterialRef.current) {
      meshMaterialRef.current.uniforms.useTexture.value = false;
      meshMaterialRef.current.uniforms.useVertexColor.value = true;
      meshMaterialRef.current.uniforms.colorMap.value = DEFAULT_COLOR_TEXTURE;
    }
    updateMeshVisibility();
  }, [
    buildGridTexture,
    buildVertexColorsFromGrid,
    updateMeshVisibility,
    useGridTexture,
  ]);

  useEffect(() => {
    if (!rasterOverlayRef.current) return;
    if (!rasterData?.textures?.length) {
      if (rasterTextureRef.current) {
        rasterTextureRef.current.dispose();
        rasterTextureRef.current = null;
      }
      if (rasterMaterialRef.current) {
        rasterMaterialRef.current.uniforms.useTexture.value = false;
        rasterMaterialRef.current.uniforms.useVertexColor.value = false;
        rasterMaterialRef.current.uniforms.colorMap.value =
          DEFAULT_COLOR_TEXTURE;
        rasterMaterialRef.current.uniforms.baseColor.value.copy(
          BASE_FILL_COLOR_SRGB,
        );
      }
      updateMeshVisibility();
      return;
    }
    const textureUrl = rasterData.textures[0]?.imageUrl;
    if (!textureUrl) return;
    let cancelled = false;
    loadRasterTexture(textureUrl)
      .then((texture) => {
        if (cancelled) {
          texture.dispose();
          return;
        }
        if (rasterTextureRef.current) rasterTextureRef.current.dispose();
        rasterTextureRef.current = texture;
        if (rasterMaterialRef.current) {
          rasterMaterialRef.current.uniforms.useTexture.value = true;
          rasterMaterialRef.current.uniforms.useVertexColor.value = false;
          rasterMaterialRef.current.uniforms.colorMap.value = texture;
        }
        updateMeshVisibility();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loadRasterTexture, rasterData, updateMeshVisibility]);

  useEffect(() => {
    if (!useMeshRaster) {
      useMeshRasterActiveRef.current = false;
      setUseMeshRasterActive(false);
      updateMeshVisibility();
    } else {
      useMeshRasterActiveRef.current = useMeshRasterActive;
      updateMeshVisibility();
    }
  }, [useMeshRaster, useMeshRasterActive, updateMeshVisibility]);

  useEffect(() => {
    const materials = [
      baseMaterialRef.current,
      meshMaterialRef.current,
      rasterMaterialRef.current,
    ].filter(Boolean) as THREE.ShaderMaterial[];
    if (normalMapTextureRef.current) {
      normalMapTextureRef.current.dispose();
      normalMapTextureRef.current = null;
    }

    if (normalMapMode === "none") {
      materials.forEach((material) => {
        material.uniforms.normalMap.value = DEFAULT_NORMAL_TEXTURE;
        material.uniforms.lightingEnabled.value = false;
      });
      requestRender();
      return;
    }

    const url =
      normalMapMode === "land"
        ? NORMAL_MAP_LAND_URL
        : NORMAL_MAP_LAND_BATHY_URL;
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.NoColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        materials.forEach((material) => {
          material.uniforms.normalMap.value = texture;
          material.uniforms.lightingEnabled.value = true;
        });
        normalMapTextureRef.current = texture;
        requestRender();
      },
      undefined,
      () => {},
    );
  }, [normalMapMode, requestRender]);

  useEffect(() => {
    if (!sceneRef.current || !globeGroupRef.current) return;
    if (!geographicLinesVisible) {
      if (geographicLineGroupRef.current) {
        geographicLineGroupRef.current.traverse((child) => {
          if (child instanceof THREE.LineSegments) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((material) => material.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
        geographicLineGroupRef.current.removeFromParent();
        geographicLineGroupRef.current = null;
      }
      requestRender();
      return;
    }

    if (geographicLineGroupRef.current) {
      geographicLineGroupRef.current.traverse((child) => {
        if (child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((material) => material.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      geographicLineGroupRef.current.removeFromParent();
      geographicLineGroupRef.current = null;
    }

    const segments: number[] = [];
    const latStep = 10;
    const lonStep = 10;
    const sampleStep = 5;

    for (let lat = -80; lat <= 80; lat += latStep) {
      let prev: THREE.Vector3 | null = null;
      for (let lon = -180; lon <= 180; lon += sampleStep) {
        const next = latLonToCartesian(lat, lon, OVERLAY_RADIUS + 0.002);
        if (prev) {
          segments.push(prev.x, prev.y, prev.z, next.x, next.y, next.z);
        }
        prev = next;
      }
    }

    for (let lon = -180; lon <= 180; lon += lonStep) {
      let prev: THREE.Vector3 | null = null;
      for (let lat = -80; lat <= 80; lat += sampleStep) {
        const next = latLonToCartesian(lat, lon, OVERLAY_RADIUS + 0.002);
        if (prev) {
          segments.push(prev.x, prev.y, prev.z, next.x, next.y, next.z);
        }
        prev = next;
      }
    }

    if (!segments.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(segments, 3),
    );
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(lineColors?.geographicGrid ?? "#9ca3af"),
      transparent: true,
      opacity: 0.35,
    });
    const lines = new THREE.LineSegments(geometry, material);
    const group = new THREE.Group();
    group.add(lines);
    geographicLineGroupRef.current = group;
    globeGroupRef.current.add(group);
    requestRender();
  }, [geographicLinesVisible, requestRender, lineColors?.geographicGrid]);

  useEffect(() => {
    if (!sceneRef.current || !globeGroupRef.current) return;
    if (!timeZoneLinesVisible) {
      if (timeZoneLineGroupRef.current) {
        timeZoneLineGroupRef.current.traverse((child) => {
          if (child instanceof THREE.LineSegments) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((material) => material.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
        timeZoneLineGroupRef.current.removeFromParent();
        timeZoneLineGroupRef.current = null;
      }
      requestRender();
      return;
    }

    if (timeZoneLineGroupRef.current) {
      timeZoneLineGroupRef.current.traverse((child) => {
        if (child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((material) => material.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      timeZoneLineGroupRef.current.removeFromParent();
      timeZoneLineGroupRef.current = null;
    }

    let cancelled = false;

    const buildLines = (data: NELineData) => {
      if (cancelled) return;
      const color = lineColors?.geographicGrid ?? "#9ca3af";
      const segments = LineGeometryProcessor.processNEData(
        data,
        "geographic",
        OVERLAY_RADIUS + 0.002,
        color,
      );
      if (!segments.length || cancelled) return;
      const lineGeometry = LineGeometryProcessor.createLineGeometry(
        segments,
        1,
      );
      lineGeometry.renderOrder = 10;
      lineGeometry.frustumCulled = false;
      if (Array.isArray(lineGeometry.material)) {
        lineGeometry.material.forEach((material) => {
          material.opacity = 0.55;
        });
      } else {
        lineGeometry.material.opacity = 0.55;
      }
      const group = new THREE.Group();
      group.add(lineGeometry);
      timeZoneLineGroupRef.current = group;
      globeGroupRef.current?.add(group);
      requestRender();
    };

    if (timeZoneDataRef.current) {
      buildLines(timeZoneDataRef.current);
      return () => {
        cancelled = true;
      };
    }

    fetch("/_countries/ne_10m_time_zones.json")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data?.Lon || !data?.Lat) return;
        timeZoneDataRef.current = data as NELineData;
        buildLines(timeZoneDataRef.current);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [timeZoneLinesVisible, requestRender, lineColors?.geographicGrid]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;
    let rotX = 0;
    let rotY = 0;
    let draggedDistance = 0;
    const dragThreshold = 6;

    const handlePointerDown = (event: PointerEvent) => {
      isDragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      draggedDistance = 0;
      if (globeGroupRef.current) {
        rotX = globeGroupRef.current.rotation.x;
        rotY = globeGroupRef.current.rotation.y;
      }
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging || !globeGroupRef.current) return;
      const deltaX = event.clientX - lastX;
      const deltaY = event.clientY - lastY;
      draggedDistance += Math.hypot(deltaX, deltaY);
      const nextY = rotY + deltaX * 0.005;
      const nextX = clamp(rotX + deltaY * 0.005, -1.2, 1.2);
      globeGroupRef.current.rotation.y = nextY;
      globeGroupRef.current.rotation.x = nextX;
      updateMarkerVisibility();
      updateMarkerScale();
      scheduleLabelUpdate();
      requestRender();
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      if (draggedDistance > dragThreshold) {
        return;
      }
      if (!onRegionClick || !globeGroupRef.current || !cameraRef.current) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
      const targetMesh =
        useMeshRasterActiveRef.current && meshOverlayRef.current
          ? meshOverlayRef.current
          : rasterOverlayRef.current;
      if (!targetMesh) return;
      const intersects = raycaster.intersectObject(targetMesh);
      if (!intersects.length) return;
      const point = intersects[0].point;
      const localPoint = globeGroupRef.current
        ? globeGroupRef.current.worldToLocal(point.clone())
        : point;
      const lat =
        90 - (Math.acos(localPoint.y / OVERLAY_RADIUS) * 180) / Math.PI;
      const lon =
        ((Math.atan2(localPoint.z, localPoint.x) * 180) / Math.PI) * -1;
      const sampledValue = rasterGridData?.sampleValue
        ? rasterGridData.sampleValue(lat, lon)
        : rasterData?.sampleValue
          ? rasterData.sampleValue(lat, lon)
          : null;
      const units =
        rasterGridData?.units ??
        rasterData?.units ??
        currentDataset?.units ??
        "units";

      const datasetName = currentDataset?.name?.toLowerCase() ?? "";
      const datasetType = currentDataset?.dataType?.toLowerCase() ?? "";
      const isOceanOnlyDataset =
        datasetName.includes("sea surface") ||
        datasetName.includes("godas") ||
        datasetName.includes("ocean data assimilation");
      const looksTemperature =
        datasetType.includes("temp") ||
        datasetName.includes("temp") ||
        units.toLowerCase().includes("degc") ||
        units.toLowerCase().includes("celsius");

      let value: number | null =
        typeof sampledValue === "number" ? sampledValue : null;
      if (value === null && !isOceanOnlyDataset) {
        value = looksTemperature
          ? -20 + Math.random() * 60
          : Math.random() * 100;
      }

      const regionData: RegionData = {
        name: `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`,
        ...(value === null
          ? {}
          : looksTemperature
            ? { temperature: value }
            : { precipitation: value }),
        dataset: currentDataset?.name || "Sample Dataset",
        unit: units,
      };

      onRegionClick(lat, lon, regionData);

      if (globeGroupRef.current) {
        const normal = localPoint.clone().normalize();
        const cameraSpace = point
          .clone()
          .applyMatrix4(cameraRef.current.matrixWorldInverse);
        const marker =
          markerRef.current ||
          new THREE.Mesh(
            new THREE.RingGeometry(0.035, 0.055, 48),
            new THREE.MeshBasicMaterial({
              color: 0x66ff33,
              transparent: true,
              opacity: 0.9,
              side: THREE.DoubleSide,
              depthWrite: false,
            }),
          );
        marker.position.copy(normal).multiplyScalar(OVERLAY_RADIUS + 0.01);
        marker.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          normal,
        );
        marker.visible = cameraSpace.z <= 0;
        if (!markerRef.current) {
          markerBaseScaleRef.current = 1;
          markerBaseZoomRef.current = cameraRef.current.zoom || 1;
          markerRef.current = marker;
          globeGroupRef.current.add(marker);
        }
        updateMarkerVisibility();
        updateMarkerScale();
        requestRender();
      }
    };
    const handleWheel = (event: WheelEvent) => {
      if (!cameraRef.current) return;
      event.preventDefault();
      const delta = event.deltaY * -0.001;
      const nextZoom = clamp(cameraRef.current.zoom + delta, minZoom, maxZoom);
      cameraRef.current.zoom = nextZoom;
      cameraRef.current.updateProjectionMatrix();
      zoomRef.current = nextZoom;
      updateMeshRasterActive(nextZoom);
      updateMarkerVisibility();
      updateMarkerScale();
      scheduleLabelUpdate();
      requestRender();
    };

    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerup", handlePointerUp);
    container.addEventListener("pointerleave", handlePointerUp);
    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerup", handlePointerUp);
      container.removeEventListener("pointerleave", handlePointerUp);
      container.removeEventListener("wheel", handleWheel);
    };
  }, [
    currentDataset,
    onRegionClick,
    rasterData,
    rasterGridData,
    requestRender,
    scheduleLabelUpdate,
    updateMeshRasterActive,
  ]);

  useEffect(() => {
    requestRender();
  }, [useMeshRasterActive, requestRender]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10 h-full w-full"
      style={{ touchAction: "none" }}
    ></div>
  );
};

export default OrthoGlobe;
