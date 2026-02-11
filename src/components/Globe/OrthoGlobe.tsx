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

type Props = {
  rasterData?: RasterLayerData;
  rasterGridData?: RasterGridData;
  rasterOpacity: number;
  satelliteLayerVisible: boolean;
  boundaryLinesVisible: boolean;
  geographicLinesVisible: boolean;
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

const BASE_TEXTURE_URL = "/images/world_imagery_arcgis.png";
const NORMAL_MAP_LAND_URL = "/_land/earth_normalmap_flat_8192x4096.jpg";
const NORMAL_MAP_LAND_BATHY_URL = "/_land/earth_normalmap_8192x4096.jpg";
const BASE_RADIUS = 1;
const OVERLAY_RADIUS = 1.005;
const DEFAULT_MIN_ZOOM = 0.2;
const DEFAULT_MAX_ZOOM = 20.0;
const MESH_TO_RASTER_ZOOM = 1.35;
const RASTER_TO_MESH_ZOOM = 1.2;
const DEFAULT_NORMAL_MAP_MODE: Props["normalMapMode"] = "none";
const VERTEX_COLOR_GAIN = 1.2;
const BASE_FILL_COLOR = new THREE.Color("#0b1e2f");
const BASE_FILL_COLOR_SRGB = BASE_FILL_COLOR.clone().convertLinearToSRGB();
const DEFAULT_GLOBE_ROTATION = new THREE.Euler(0, -Math.PI / 2, 0, "XYZ");
const DEFAULT_LIGHT_DIRECTION = new THREE.Vector3(3, 2, 4).normalize();
const LABEL_TILE_URL = "/tiles/labels/{z}/{x}/{y}.pbf";
const LABEL_MIN_VISIBLE = 3;
const LABEL_MAX_VISIBLE = 50;
const LABEL_FADE_MS = 160;
const LABEL_VISIBILITY_THROTTLE_MS = 33;

const GLOBE_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vColor;
  varying mat3 vTBN;

  attribute vec3 tangent;
  attribute vec3 color;

  void main() {
    vUv = uv;
    vColor = color;

    vec3 T = normalize(normalMatrix * tangent);
    vec3 N = normalize(normalMatrix * normal);
    vec3 B = normalize(cross(N, T));
    vTBN = mat3(T, B, N);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOBE_FRAGMENT_SHADER = `
  uniform sampler2D normalMap;
  uniform sampler2D colorMap;
  uniform bool useTexture;
  uniform bool useVertexColor;
  uniform bool lightingEnabled;
  uniform vec3 lightDirection;
  uniform vec3 baseColor;
  uniform float opacity;
  uniform float ambientIntensity;

  varying vec2 vUv;
  varying vec3 vColor;
  varying mat3 vTBN;

  void main() {
    vec4 texColor = texture2D(colorMap, vUv);
    vec3 base = useTexture
      ? texColor.rgb
      : (useVertexColor ? vColor : baseColor);
    float alpha = useTexture ? texColor.a : 1.0;

    if (lightingEnabled) {
      vec3 normalRGB = texture2D(normalMap, vUv).rgb;
      vec3 tangentNormal = normalRGB * 2.0 - 1.0;
      vec3 normal = normalize(vTBN * tangentNormal);
      float lighting = max(dot(normal, normalize(lightDirection)), 0.0);
      lighting = max(lighting, ambientIntensity);
      base *= lighting;
    }

    gl_FragColor = vec4(base, alpha * opacity);
  }
`;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const createSolidTexture = (rgba: [number, number, number, number]) => {
  const data = new Uint8Array(rgba);
  const texture = new THREE.DataTexture(data, 1, 1);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
};

const DEFAULT_NORMAL_TEXTURE = createSolidTexture([128, 128, 255, 255]);
const DEFAULT_COLOR_TEXTURE = createSolidTexture([255, 255, 255, 255]);

const setSolidVertexColor = (
  geometry: THREE.BufferGeometry,
  color: THREE.Color,
) => {
  const position = geometry.getAttribute("position");
  if (!position) return;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const base = i * 3;
    colors[base] = color.r;
    colors[base + 1] = color.g;
    colors[base + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
};

const ensureTangents = (geometry: THREE.BufferGeometry) => {
  if (!geometry.index || !geometry.getAttribute("uv")) return;
  geometry.computeTangents();
};

const createGlobeMaterial = (options: {
  transparent?: boolean;
  depthWrite?: boolean;
  opacity?: number;
  useTexture?: boolean;
  useVertexColor?: boolean;
  baseColor?: THREE.Color;
  colorMap?: THREE.Texture;
  normalMap?: THREE.Texture;
  lightingEnabled?: boolean;
  lightDirection?: THREE.Vector3;
}) => {
  const {
    transparent = false,
    depthWrite = true,
    opacity = 1,
    useTexture = false,
    useVertexColor = true,
    baseColor = BASE_FILL_COLOR_SRGB,
    colorMap = DEFAULT_COLOR_TEXTURE,
    normalMap = DEFAULT_NORMAL_TEXTURE,
    lightingEnabled = false,
    lightDirection = DEFAULT_LIGHT_DIRECTION,
    ambientIntensity = 0.45,
  } = options;

  return new THREE.ShaderMaterial({
    vertexShader: GLOBE_VERTEX_SHADER,
    fragmentShader: GLOBE_FRAGMENT_SHADER,
    transparent,
    depthWrite,
    lights: false,
    uniforms: {
      normalMap: { value: normalMap },
      colorMap: { value: colorMap },
      useTexture: { value: useTexture },
      useVertexColor: { value: useVertexColor },
      lightingEnabled: { value: lightingEnabled },
      lightDirection: { value: lightDirection.clone() },
      baseColor: { value: baseColor.clone() },
      opacity: { value: opacity },
      ambientIntensity: { value: ambientIntensity },
    },
  });
};

type OrthoLabelEntry = {
  feature: LabelFeature;
  el: HTMLDivElement;
  kind: LabelKind;
  opacity: number;
  targetOpacity: number;
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

type LabelTier = {
  display: LabelKind[];
  eligible: LabelKind[];
  fadeRange?: [number, number];
};

const getLabelTier = (tileZoom: number): LabelTier => {
  if (tileZoom <= 3.5) {
    return {
      display: ["continent"],
      eligible: ["continent", "country"],
      fadeRange: [3.0, 3.5],
    };
  }
  if (tileZoom <= 5.5) {
    return {
      display: ["continent", "country"],
      eligible: ["continent", "country", "state"],
      fadeRange: [5.0, 5.5],
    };
  }
  if (tileZoom <= 7.5) {
    return {
      display: ["country", "state"],
      eligible: ["country", "state", "cityLarge"],
      fadeRange: [7.0, 7.5],
    };
  }
  if (tileZoom <= 9) {
    return {
      display: ["state", "cityLarge"],
      eligible: ["state", "cityLarge", "cityMedium"],
      fadeRange: [8.5, 9.0],
    };
  }
  if (tileZoom <= 10.5) {
    return {
      display: ["cityLarge", "cityMedium"],
      eligible: ["cityLarge", "cityMedium", "citySmall"],
      fadeRange: [10.0, 10.5],
    };
  }
  return {
    display: ["cityMedium", "citySmall"],
    eligible: ["cityMedium", "citySmall"],
  };
};

const getLabelSpec = (kind: LabelKind) => {
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

const lonToTileX = (lon: number, zoom: number) => {
  const tileCount = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * tileCount);
  return Math.min(tileCount - 1, Math.max(0, x));
};

const latToTileY = (lat: number, zoom: number) => {
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

const tileCenter = (x: number, y: number, zoom: number) => {
  const tileCount = 2 ** zoom;
  const lon = ((x + 0.5) / tileCount) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * (y + 0.5)) / tileCount;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lon, lat };
};

const cameraZoomToTileZoom = (cameraZoom: number) => {
  const minCameraZoom = 1.0;
  const maxCameraZoom = 50.0;
  const minTileZoom = 2;
  const maxTileZoom = 15;
  const clamped = Math.max(minCameraZoom, Math.min(maxCameraZoom, cameraZoom));
  const normalized =
    (clamped - minCameraZoom) / (maxCameraZoom - minCameraZoom);
  return minTileZoom + normalized * (maxTileZoom - minTileZoom);
};

const calculateLabelOpacity = (
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

const OrthoGlobe: React.FC<Props> = ({
  rasterData,
  rasterGridData,
  rasterOpacity,
  satelliteLayerVisible,
  boundaryLinesVisible,
  geographicLinesVisible,
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
  const markerRef = useRef<THREE.Mesh | null>(null);
  const skyboxTextureRef = useRef<THREE.CubeTexture | null>(null);
  const gridTextureRef = useRef<THREE.Texture | null>(null);
  const rasterTextureRef = useRef<THREE.Texture | null>(null);
  const labelLayerRef = useRef<HTMLDivElement | null>(null);
  const normalMapTextureRef = useRef<THREE.Texture | null>(null);
  const baseTextureRef = useRef<THREE.Texture | null>(null);
  const sunlightRef = useRef<THREE.DirectionalLight | null>(null);
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

  const getTileKeysForView = useCallback((zoom: number) => {
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

    const sampleCorner = (x: number, y: number) => {
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
      corners.push({ lon, lat });
    };

    const samples = [-1, -0.5, 0, 0.5, 1];
    samples.forEach((x) => {
      samples.forEach((y) => {
        sampleCorner(x, y);
      });
    });
    if (!corners.length) return null;

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

    let centerLon = lons.reduce((sum, value) => sum + value, 0) / lons.length;
    let centerLat = lats.reduce((sum, value) => sum + value, 0) / lats.length;

    const keys = crossesDateline
      ? [
          ...collectRange(-180, Math.max(...lons)),
          ...collectRange(Math.min(...lons), 180),
        ]
      : collectRange(Math.min(...lons), Math.max(...lons));

    return { keys, centerLon, centerLat };
  }, []);

  const updateLabelVisibility = useCallback(() => {
    if (!labelsVisible) {
      labelTileCacheRef.current.forEach((entries) => {
        entries.forEach((entry) => {
          setLabelTarget(entry, 0);
          setLabelOpacity(entry, 0);
        });
      });
      return;
    }

    const tileZoomFloat = cameraZoomToTileZoom(cameraRef.current?.zoom ?? 1);
    const tier = getLabelTier(tileZoomFloat);
    const activeKinds = new Set<LabelKind>(tier.eligible);
    const tileInfo = getTileKeysForView(Math.round(tileZoomFloat));
    if (!tileInfo) return;

    const centerLon = tileInfo.centerLon;
    const centerLat = tileInfo.centerLat;

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
    estimateLabelSize,
    getLabelScreenPosition,
    getTileKeysForView,
    labelsVisible,
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
    const { keys: tileKeys, centerLon, centerLat } = tileInfo;
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

    if (labelTileZoomRef.current !== zoom) {
      clearLabelTiles();
      labelTileZoomRef.current = zoom;
    }
    if (!labelTileAbortRef.current) {
      labelTileAbortRef.current = new AbortController();
    }
    const { signal } = labelTileAbortRef.current;

    const maxTiles = 24;
    if (tileKeys.length > maxTiles) {
      tileKeys.length = maxTiles;
    }

    let addedTiles = false;
    const maxConcurrent = 6;
    for (let i = 0; i < tileKeys.length; i += maxConcurrent) {
      const chunk = tileKeys.slice(i, i + maxConcurrent);
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
