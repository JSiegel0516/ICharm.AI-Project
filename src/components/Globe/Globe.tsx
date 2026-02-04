"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  useCallback,
  forwardRef,
} from "react";
import type { Dataset, RegionData, GlobeProps, GlobeRef } from "@/types";
import { useRasterLayer } from "@/hooks/useRasterLayer";
import { useRasterGrid, RasterGridData } from "@/hooks/useRasterGrid";
import { buildRasterMesh } from "@/lib/mesh/rasterMesh";
import {
  fetchOpenLayersTile,
  type LabelFeature,
  type LabelKind,
} from "@/lib/labels/openlayersVectorTiles";
import type { RasterLayerData } from "@/hooks/useRasterLayer";
import GlobeLoading from "./GlobeLoading";
import WinkelMap from "./WinkelMap";
import OrthoGlobe from "./OrthoGlobe";
import { Button } from "@/components/ui/button";

const loadCesiumFromCDN = async () => {
  if (window.Cesium) {
    return window.Cesium;
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cesium.com/downloads/cesiumjs/releases/1.95/Build/Cesium/Cesium.js";
    script.async = true;

    script.onload = () => {
      const link = document.createElement("link");
      link.href =
        "https://cesium.com/downloads/cesiumjs/releases/1.95/Build/Cesium/Widgets/widgets.css";
      link.rel = "stylesheet";
      document.head.appendChild(link);

      window.CESIUM_BASE_URL =
        "https://cesium.com/downloads/cesiumjs/releases/1.95/Build/Cesium/";
      resolve(window.Cesium);
    };

    script.onerror = () => reject(new Error("Failed to load Cesium"));
    document.head.appendChild(script);
  });
};

type BoundaryDataset = {
  name: string;
  kind: "boundary" | "geographicLines";
  data: any;
};

const loadGeographicBoundaries = async (): Promise<BoundaryDataset[]> => {
  const files: Array<{ name: string; kind: BoundaryDataset["kind"] }> = [
    { name: "ne_110m_coastline.json", kind: "boundary" },
    { name: "ne_110m_lakes.json", kind: "boundary" },
    { name: "ne_110m_rivers_lake_centerlines.json", kind: "boundary" },
  ];

  const boundaryData: BoundaryDataset[] = [];

  for (const file of files) {
    try {
      const response = await fetch(`/_countries/${file.name}`);
      if (response.ok) {
        const data = await response.json();
        boundaryData.push({ name: file.name, kind: file.kind, data });
      }
    } catch (error) {
      console.error(`Error loading ${file.name}:`, error);
    }
  }

  return boundaryData;
};

const addGeographicBoundaries = (
  Cesium: any,
  viewer: any,
  boundaryData: BoundaryDataset[],
) => {
  const boundaryEntities: any[] = [];
  const geographicLineEntities: any[] = [];

  boundaryData.forEach(({ name, kind, data }) => {
    const isGeographicLines =
      kind === "geographicLines" || name.includes("geographic_lines");

    const targetCollection = isGeographicLines
      ? geographicLineEntities
      : boundaryEntities;

    if (data.type === "FeatureCollection" && data.features) {
      let color = Cesium.Color.fromCssColorString("#f8fafc").withAlpha(0.8);
      let width = 2;

      if (name.includes("coastline")) {
        width = 3;
        color = Cesium.Color.fromCssColorString("#e2e8f0").withAlpha(0.85);
      } else if (isGeographicLines) {
        width = 1.5;
        color = Cesium.Color.fromCssColorString("#64748b").withAlpha(0.45);
      } else if (name.includes("lakes")) {
        width = 2;
        color = Cesium.Color.fromCssColorString("#cbd5f5").withAlpha(0.7);
      } else if (name.includes("rivers")) {
        width = 2;
        color = Cesium.Color.fromCssColorString("#9ca3af").withAlpha(0.55);
      }

      data.features.forEach((feature: any) => {
        const geometry = feature.geometry;
        if (!geometry) return;

        const processCoordinates = (coords: any[]) => {
          if (coords.length < 2) return;

          const positions = coords.map((coord: number[]) =>
            Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 10000),
          );

          if (positions.length > 1) {
            const entity = viewer.entities.add({
              polyline: {
                positions: positions,
                width: width,
                material: color,
                clampToGround: false,
              },
            });
            targetCollection.push(entity);
          }
        };

        if (geometry.type === "LineString") {
          processCoordinates(geometry.coordinates);
        } else if (geometry.type === "MultiLineString") {
          geometry.coordinates.forEach((lineCoords: any[]) => {
            processCoordinates(lineCoords);
          });
        } else if (geometry.type === "Polygon") {
          geometry.coordinates.forEach((ring: any[]) => {
            processCoordinates(ring);
          });
        } else if (geometry.type === "MultiPolygon") {
          geometry.coordinates.forEach((polygon: any[]) => {
            polygon.forEach((ring: any[]) => {
              processCoordinates(ring);
            });
          });
        }
      });
    } else if (data.Lon && data.Lat) {
      const positions: any[] = [];
      let color = Cesium.Color.CYAN.withAlpha(0.3);
      let width = 1.5;

      if (name.includes("coastline")) {
        color = Cesium.Color.WHITE.withAlpha(0.6);
        width = 2;
      }
      if (name.includes("lakes")) {
        color = Cesium.Color.WHITE.withAlpha(0.3);
        width = 2;
      }
      if (name.includes("rivers")) {
        color = Cesium.Color.fromCssColorString("#9ca3af").withAlpha(0.5);
        width = 2;
      }

      for (let i = 0; i < data.Lon.length; i++) {
        if (data.Lon[i] !== null && data.Lat[i] !== null) {
          positions.push(
            Cesium.Cartesian3.fromDegrees(data.Lon[i], data.Lat[i], 10000),
          );
        } else if (positions.length > 0) {
          const entity = viewer.entities.add({
            polyline: {
              positions: positions.slice(),
              width: width,
              material: color,
              clampToGround: false,
            },
          });
          targetCollection.push(entity);
          positions.length = 0;
        }
      }

      if (positions.length > 0) {
        const entity = viewer.entities.add({
          polyline: {
            positions: positions,
            width: width,
            material: color,
            clampToGround: false,
          },
        });
        targetCollection.push(entity);
      }
    }
  });

  const addLatLine = (latitude: number) => {
    const positions: any[] = [];
    for (let lon = -180; lon <= 180; lon += 2) {
      positions.push(Cesium.Cartesian3.fromDegrees(lon, latitude, 10000));
    }
    const entity = viewer.entities.add({
      polyline: {
        positions,
        width: 1.2,
        material: Cesium.Color.fromCssColorString("#64748b").withAlpha(0.35),
        clampToGround: false,
      },
    });
    geographicLineEntities.push(entity);
  };

  const addLonLine = (longitude: number) => {
    const positions: any[] = [];
    for (let lat = -90; lat <= 90; lat += 2) {
      positions.push(Cesium.Cartesian3.fromDegrees(longitude, lat, 10000));
    }
    const entity = viewer.entities.add({
      polyline: {
        positions,
        width: 1.2,
        material: Cesium.Color.fromCssColorString("#64748b").withAlpha(0.35),
        clampToGround: false,
      },
    });
    geographicLineEntities.push(entity);
  };

  for (let lat = -80; lat <= 80; lat += 10) {
    addLatLine(lat);
  }

  for (let lon = -170; lon <= 170; lon += 10) {
    addLonLine(lon);
  }

  return { boundaryEntities, geographicLineEntities };
};

const Globe = forwardRef<GlobeRef, GlobeProps>(
  (
    {
      currentDataset,
      onRegionClick,
      selectedDate,
      selectedLevel,
      colorbarRange,
      viewMode = "3d",
      satelliteLayerVisible = true,
      boundaryLinesVisible = true,
      geographicLinesVisible = false,
      rasterOpacity = 1.0,
      rasterBlurEnabled = false,
      hideZeroPrecipitation = false,
      useMeshRaster = false,
      onRasterMetadataChange,
      isPlaying = false,
      prefetchedRasters,
      prefetchedRasterGrids,
      meshFadeDurationMs = 0,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<any>(null);
    const initializingViewerRef = useRef(false);

    // FIXED: Better loading state management
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [loadingTimeout, setLoadingTimeout] = useState<NodeJS.Timeout | null>(
      null,
    );

    const currentMarkerRef = useRef<any>(null);
    const searchMarkerRef = useRef<any>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [cesiumInstance, setCesiumInstance] = useState<any>(null);
    const [viewerReady, setViewerReady] = useState(false);
    const [isRasterImageryLoading, setIsRasterImageryLoading] = useState(false);
    const useMeshRasterEffective = useMeshRaster;

    const satelliteLayerRef = useRef<any>(null);
    const boundaryEntitiesRef = useRef<any[]>([]);
    const geographicLineEntitiesRef = useRef<any[]>([]);
    const rasterLayerRef = useRef<any[]>([]);
    const textureLoadIdRef = useRef(0);
    const isComponentUnmountedRef = useRef(false);
    const isUpdatingMarkerRef = useRef(false);
    const rasterMeshRef = useRef<any | any[] | null>(null);
    const rasterMeshFadeOutRef = useRef<any | any[] | null>(null);
    const rasterMeshFadeFrameRef = useRef<number | null>(null);
    const meshPrimitiveCacheRef = useRef<Map<string, any | any[]>>(new Map());
    const meshPreloadAbortRef = useRef<{ aborted: boolean }>({
      aborted: false,
    });
    const globeMaterialRef = useRef<any>(null);
    const labelTileCacheRef = useRef<Map<string, any[]>>(new Map());
    const labelTilePendingRef = useRef<Set<string>>(new Set());
    const labelTileAbortRef = useRef<AbortController | null>(null);
    const labelUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const labelTileZoomRef = useRef<number | null>(null);
    const labelUpdateInFlightRef = useRef(false);
    const labelUpdateRequestedRef = useRef(false);

    const rasterDataRef = useRef<RasterLayerData | RasterGridData | undefined>(
      undefined,
    );
    const [winkelClearMarkerTick, setWinkelClearMarkerTick] = useState(0);
    const [orthoClearMarkerTick, setOrthoClearMarkerTick] = useState(0);
    const datasetName = (currentDataset?.name ?? "").toLowerCase();
    const datasetSupportsZeroMask =
      currentDataset?.dataType === "precipitation" ||
      datasetName.includes("cmorph");
    const shouldHideZero = datasetSupportsZeroMask && hideZeroPrecipitation;
    const shouldTileLargeMesh =
      datasetName.includes("noaa/cires/doe") ||
      (currentDataset?.id ?? "").toLowerCase().includes("noaa-cires-doe");
    const rasterLayerDataset = currentDataset;
    const meshSamplingStep = 1;
    const meshOpacityKey = rasterOpacity.toFixed(3);
    const rasterState = useRasterLayer({
      dataset: rasterLayerDataset,
      date: selectedDate,
      level: selectedLevel ?? null,
      maskZeroValues: shouldHideZero,
      colorbarRange,
      prefetchedData: prefetchedRasters,
    });
    const rasterGridState = useRasterGrid({
      dataset: currentDataset,
      date: selectedDate,
      level: selectedLevel ?? null,
      maskZeroValues: shouldHideZero,
      colorbarRange,
      enabled: useMeshRasterEffective,
      prefetchedData: prefetchedRasterGrids,
    });
    const [useMeshRasterActive, setUseMeshRasterActive] = useState(
      useMeshRasterEffective,
    );
    const useMeshRasterActiveRef = useRef(useMeshRasterEffective);

    const MESH_TO_IMAGERY_HEIGHT = 2_200_000;
    const IMAGERY_TO_MESH_HEIGHT = 3_000_000;
    const IMAGERY_OVERLAP_HEIGHT = MESH_TO_IMAGERY_HEIGHT * 1.15;
    const IMAGERY_HIDE_HEIGHT = IMAGERY_TO_MESH_HEIGHT * 1.1;
    const IMAGERY_PRELOAD_HEIGHT = MESH_TO_IMAGERY_HEIGHT * 1.15;
    const LABEL_TILE_URL = "/tiles/labels/{z}/{x}/{y}.pbf";

    // FIXED: Add loading timeout to prevent infinite loading
    useEffect(() => {
      if (isLoading && !loadingTimeout) {
        const timeout = setTimeout(() => {
          // noop: timeout fallback to avoid infinite loading.
          setIsLoading(false);
          setIsRasterImageryLoading(false);
        }, 8000); // 8 second timeout (reduced from 15)
        setLoadingTimeout(timeout);
      }

      return () => {
        if (loadingTimeout) {
          clearTimeout(loadingTimeout);
          setLoadingTimeout(null);
        }
      };
    }, [isLoading, loadingTimeout]);

    // FIXED: Clear loading timeout when loading completes
    useEffect(() => {
      if (!isLoading && loadingTimeout) {
        clearTimeout(loadingTimeout);
        setLoadingTimeout(null);
      }
    }, [isLoading, loadingTimeout]);

    const setMeshRasterActive = useCallback((next: boolean) => {
      if (useMeshRasterActiveRef.current === next) return;
      useMeshRasterActiveRef.current = next;
      setUseMeshRasterActive(next);
      viewerRef.current?.scene?.requestRender();
    }, []);

    const updateOrthoFrustum = useCallback(() => {
      if (!viewerRef.current || !cesiumInstance) return;
      if (viewMode !== "ortho") return;
      const viewer = viewerRef.current;
      const Cesium = cesiumInstance;
      const camera = viewer.scene.camera;
      const canvas = viewer.scene.canvas;
      const cameraHeight = camera.positionCartographic.height;
      const aspectRatio =
        canvas && canvas.clientHeight
          ? canvas.clientWidth / canvas.clientHeight
          : 1;
      const globeRadius = Cesium.Ellipsoid.WGS84.maximumRadius;
      const width = Math.max(1, globeRadius * 2.02);

      let frustum = camera.frustum;
      if (!(frustum instanceof Cesium.OrthographicFrustum)) {
        frustum = new Cesium.OrthographicFrustum();
      }
      frustum.near = 1.0;
      frustum.far = Math.max(cameraHeight * 4, globeRadius * 6, 50_000_000);
      frustum.aspectRatio = aspectRatio;
      frustum.width = width;
      camera.frustum = frustum;
      viewer.scene.requestRender();
    }, [cesiumInstance, viewMode]);

    const updateRasterLod = useCallback(() => {
      if (!viewerRef.current || !viewerReady) return;

      if (isPlaying) {
        setMeshRasterActive(false);
        return;
      }

      if (
        !useMeshRasterEffective ||
        viewMode === "winkel" ||
        viewMode === "ortho"
      ) {
        setMeshRasterActive(false);
        return;
      }

      const viewer = viewerRef.current;
      const height = viewer.camera.positionCartographic.height;
      const usingMesh = useMeshRasterActiveRef.current;

      if (usingMesh && height < MESH_TO_IMAGERY_HEIGHT) {
        setMeshRasterActive(false);
      } else if (!usingMesh && height > IMAGERY_TO_MESH_HEIGHT) {
        setMeshRasterActive(true);
      }

      // Keep imagery in sync with zoom even if mesh state lags.
      const layers = rasterLayerRef.current;
      if (layers.length) {
        const showImagery = height < IMAGERY_HIDE_HEIGHT;
        layers.forEach((layer) => {
          layer.show = showImagery;
          layer.alpha = showImagery ? rasterOpacity : 0;
        });
        if (showImagery) {
          if (viewer.scene.globe.material) {
            viewer.scene.globe.material = undefined;
          }
        } else if (globeMaterialRef.current) {
          if (viewer.scene.globe.material !== globeMaterialRef.current) {
            viewer.scene.globe.material = globeMaterialRef.current;
          }
        }
        viewer.scene.requestRender();
      }
    }, [
      setMeshRasterActive,
      useMeshRasterEffective,
      viewerReady,
      viewMode,
      rasterOpacity,
    ]);

    const heightToTileZoom = (height: number) => {
      if (height > 35_000_000) return 2;
      if (height > 22_000_000) return 3;
      if (height > 14_000_000) return 4;
      if (height > 8_000_000) return 5;
      if (height > 4_500_000) return 6;
      if (height > 2_500_000) return 7;
      if (height > 1_300_000) return 8;
      if (height > 700_000) return 9;
      if (height > 350_000) return 10;
      if (height > 180_000) return 11;
      if (height > 90_000) return 12;
      return 13;
    };

    const getActiveLabelKinds = (zoom: number): LabelKind[] => {
      if (zoom <= 3) return ["continent"];
      if (zoom <= 4) return ["continent", "country"];
      if (zoom <= 5) return ["continent", "country", "cityLarge"];
      return ["continent", "country", "cityLarge", "cityMedium", "citySmall"];
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
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
          2) *
          tileCount,
      );
      return Math.min(tileCount - 1, Math.max(0, y));
    };

    const getTileKeysForView = (viewer: any, zoom: number) => {
      const Cesium = cesiumInstance;
      if (!Cesium) return null;
      const rectangle = viewer.camera.computeViewRectangle(
        viewer.scene.globe.ellipsoid,
      );
      if (!rectangle) return null;

      const west = Cesium.Math.toDegrees(rectangle.west);
      const east = Cesium.Math.toDegrees(rectangle.east);
      const south = Cesium.Math.toDegrees(rectangle.south);
      const north = Cesium.Math.toDegrees(rectangle.north);
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

      if (west <= east) {
        return collectRange(west, east);
      }
      return [...collectRange(west, 180), ...collectRange(-180, east)];
    };

    const clearLabelTiles = useCallback(() => {
      if (!viewerRef.current) return;
      const viewer = viewerRef.current;
      labelTileCacheRef.current.forEach((entities) => {
        entities.forEach((entity) => {
          viewer.entities.remove(entity);
        });
      });
      labelTileCacheRef.current.clear();
      labelTilePendingRef.current.clear();
      labelTileZoomRef.current = null;
      if (labelTileAbortRef.current) {
        labelTileAbortRef.current.abort();
        labelTileAbortRef.current = null;
      }
    }, []);

    const createLabelEntity = useCallback(
      (feature: LabelFeature) => {
        if (!viewerRef.current || !cesiumInstance) return null;
        const viewer = viewerRef.current;
        const Cesium = cesiumInstance;
        const spec = getLabelSpec(feature.kind);

        const entity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(feature.lon, feature.lat, 0),
          show: false,
          label: {
            text: feature.name,
            font: spec.font,
            fillColor: Cesium.Color.fromCssColorString(spec.color),
            outlineColor: Cesium.Color.fromCssColorString(spec.outline),
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -10),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        entity.__labelKind = feature.kind;
        return entity;
      },
      [cesiumInstance],
    );

    const estimateLabelSize = (entity: any) => {
      const rawFont = entity?.label?.font;
      const fontText =
        typeof rawFont === "string" ? rawFont : rawFont?.getValue?.();
      const fontSize = fontText
        ? Number.parseFloat(String(fontText).split("px")[0] ?? "12")
        : 12;
      const rawText = entity?.label?.text;
      const text =
        typeof rawText === "string" ? rawText : rawText?.getValue?.();
      const length = text ? String(text).length : 0;
      const width = Math.max(10, Math.round(fontSize * 0.6 * length));
      const height = Math.max(10, Math.round(fontSize * 1.2));
      return { width, height, fontSize };
    };

    const updateLabelTiles = useCallback(async () => {
      if (!viewerRef.current || !cesiumInstance) return;
      if (labelUpdateInFlightRef.current) {
        labelUpdateRequestedRef.current = true;
        return;
      }
      labelUpdateInFlightRef.current = true;
      if (viewMode === "ortho" || viewMode === "winkel") {
        clearLabelTiles();
        labelUpdateInFlightRef.current = false;
        return;
      }

      const viewer = viewerRef.current;
      const Cesium = cesiumInstance;
      const height = viewer.camera.positionCartographic.height;
      const zoom = Math.min(6, heightToTileZoom(height));
      const activeKinds = new Set<LabelKind>(getActiveLabelKinds(zoom));
      const tileKeys = getTileKeysForView(viewer, zoom);
      if (!tileKeys || !tileKeys.length) {
        labelUpdateInFlightRef.current = false;
        return;
      }
      const activeKeys = new Set(tileKeys);

      if (labelTileZoomRef.current !== zoom) {
        clearLabelTiles();
        labelTileZoomRef.current = zoom;
      }

      labelTileCacheRef.current.forEach((entities, key) => {
        if (!activeKeys.has(key)) {
          entities.forEach((entity) => viewer.entities.remove(entity));
          labelTileCacheRef.current.delete(key);
          return;
        }
        const filtered = entities.filter((entity) => {
          const kind = entity?.__labelKind as LabelKind | undefined;
          if (!kind || !activeKinds.has(kind)) {
            viewer.entities.remove(entity);
            return false;
          }
          return true;
        });
        labelTileCacheRef.current.set(key, filtered);
      });

      const occluder = new Cesium.EllipsoidalOccluder(
        Cesium.Ellipsoid.WGS84,
        viewer.camera.position,
      );
      const cameraPosition = viewer.camera.positionWC;
      const cameraDirection = viewer.camera.directionWC;
      const scene = viewer.scene;
      const canvas = scene.canvas;
      const now = Cesium.JulianDate.now();

      const occupied = new Map<
        string,
        Array<{ x: number; y: number; w: number; h: number }>
      >();
      const cellSize = 64;

      const collides = (box: {
        x: number;
        y: number;
        w: number;
        h: number;
      }) => {
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
        if (kind === "cityLarge") return 2;
        if (kind === "cityMedium") return 3;
        if (kind === "citySmall") return 4;
        return 5;
      };

      const candidates: any[] = [];
      labelTileCacheRef.current.forEach((entities, key) => {
        if (!activeKeys.has(key)) return;
        entities.forEach((entity) => {
          entity.show = false;
          candidates.push(entity);
        });
      });

      candidates.sort((a, b) => {
        const kindA = a?.__labelKind as LabelKind;
        const kindB = b?.__labelKind as LabelKind;
        return priority(kindA) - priority(kindB);
      });

      let shownCount = 0;
      candidates.forEach((entity) => {
        const kind = entity?.__labelKind as LabelKind | undefined;
        if (!kind || !activeKinds.has(kind)) return;
        const position = entity?.position?.getValue(now);
        if (!position) return;
        if (!occluder.isPointVisible(position)) return;

        const vector = Cesium.Cartesian3.subtract(
          position,
          cameraPosition,
          new Cesium.Cartesian3(),
        );
        Cesium.Cartesian3.normalize(vector, vector);
        const centerDot = Cesium.Cartesian3.dot(vector, cameraDirection);
        if (centerDot < 0.15) return;

        const screenPosition = Cesium.SceneTransforms.wgs84ToWindowCoordinates(
          scene,
          position,
        );
        if (!screenPosition) return;
        if (
          screenPosition.x < 0 ||
          screenPosition.y < 0 ||
          screenPosition.x > canvas.clientWidth ||
          screenPosition.y > canvas.clientHeight
        ) {
          return;
        }

        const { width, height: labelHeight } = estimateLabelSize(entity);
        const pad = kind === "street" ? 2 : 4;
        const box = {
          x: screenPosition.x - width / 2 - pad,
          y: screenPosition.y - labelHeight - pad,
          w: width + pad * 2,
          h: labelHeight + pad * 2,
        };
        if (collides(box)) return;
        addBox(box);
        entity.show = true;
        shownCount += 1;
      });

      const maxTiles = 24;
      if (tileKeys.length > maxTiles) {
        tileKeys.length = maxTiles;
      }
      if (!labelTileAbortRef.current) {
        labelTileAbortRef.current = new AbortController();
      }
      const { signal } = labelTileAbortRef.current;

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
              const filtered = features.filter((feature) => {
                if (!activeKinds.has(feature.kind)) return false;
                return true;
              });
              const entities = filtered
                .map((feature) => createLabelEntity(feature))
                .filter(Boolean) as any[];
              entities.forEach((entity, index) => {
                const feature = filtered[index];
                if (!feature) return;
                entity.__labelKind = feature.kind;
              });
              labelTileCacheRef.current.set(key, entities);
              if (entities.length) {
                addedTiles = true;
              }
            } catch (error) {
              if ((error as Error).name !== "AbortError") {
                console.warn("Failed to load label tile", error);
              }
            } finally {
              labelTilePendingRef.current.delete(key);
            }
          }),
        );
      }

      viewer.scene.requestRender();
      if (typeof globalThis !== "undefined") {
        (globalThis as any).__labelDebug = {
          zoom,
          tiles: tileKeys.length,
          cachedTiles: labelTileCacheRef.current.size,
          candidates: candidates.length,
          shown: shownCount,
        };
      }
      labelUpdateInFlightRef.current = false;

      if (addedTiles) {
        setTimeout(() => {
          if (isComponentUnmountedRef.current) return;
          updateLabelTiles();
        }, 0);
      }
      if (labelUpdateRequestedRef.current) {
        labelUpdateRequestedRef.current = false;
        updateLabelTiles();
      }
    }, [cesiumInstance, clearLabelTiles, createLabelEntity, viewMode]);

    const scheduleLabelUpdate = useCallback(() => {
      if (labelUpdateTimeoutRef.current) {
        clearTimeout(labelUpdateTimeoutRef.current);
      }
      labelUpdateTimeoutRef.current = setTimeout(() => {
        updateLabelTiles();
      }, 120);
    }, [updateLabelTiles]);

    const clearMarker = useCallback(() => {
      if (
        currentMarkerRef.current &&
        viewerRef.current &&
        !viewerRef.current.isDestroyed()
      ) {
        try {
          if (currentMarkerRef.current.primitive) {
            viewerRef.current.scene.primitives.remove(
              currentMarkerRef.current.primitive,
            );
          } else if (currentMarkerRef.current.layer) {
            viewerRef.current.scene.imageryLayers.remove(
              currentMarkerRef.current.layer,
              true,
            );
          } else if (
            currentMarkerRef.current._imageryProvider ||
            currentMarkerRef.current.alpha !== undefined
          ) {
            viewerRef.current.scene.imageryLayers.remove(
              currentMarkerRef.current,
              true,
            );
          } else if (Array.isArray(currentMarkerRef.current)) {
            currentMarkerRef.current.forEach((marker) =>
              viewerRef.current.entities.remove(marker),
            );
          } else {
            viewerRef.current.entities.remove(currentMarkerRef.current);
          }
        } catch (err) {
          console.warn("Failed to remove marker", err);
        }
        currentMarkerRef.current = null;
      }

      // Also clear Winkel Tripel marker via signal.
      setWinkelClearMarkerTick((tick) => tick + 1);
      setOrthoClearMarkerTick((tick) => tick + 1);
    }, []);

    const clearSearchMarker = useCallback(() => {
      if (
        searchMarkerRef.current &&
        viewerRef.current &&
        !viewerRef.current.isDestroyed()
      ) {
        viewerRef.current.entities.remove(searchMarkerRef.current);
        searchMarkerRef.current = null;
      }
    }, []);

    const updateMarkerVisibility = useCallback(() => {
      if (!viewerRef.current || !cesiumInstance) return;

      const scene = viewerRef.current.scene;
      const camera = viewerRef.current.camera;
      const occluder = new cesiumInstance.EllipsoidalOccluder(
        cesiumInstance.Ellipsoid.WGS84,
        camera.position,
      );

      const updateEntityVisibility = (entityRef: any) => {
        if (entityRef && entityRef.position) {
          const position = entityRef.position.getValue(
            cesiumInstance.JulianDate.now(),
          );
          if (position) {
            const visible = occluder.isPointVisible(position);
            entityRef.show = visible;
            if (entityRef.billboard) {
              entityRef.billboard.show = visible;
            }
          }
        } else if (entityRef && entityRef.primitive && entityRef.latitude) {
          const position = cesiumInstance.Cartesian3.fromDegrees(
            entityRef.longitude,
            entityRef.latitude,
            0,
          );
          const visible = occluder.isPointVisible(position);
          entityRef.primitive.show = visible;
        }
      };

      updateEntityVisibility(searchMarkerRef.current);
      updateEntityVisibility(currentMarkerRef.current);

      scene?.requestRender();
    }, [cesiumInstance]);

    const addSearchMarker = useCallback(
      (latitude: number, longitude: number, label?: string) => {
        if (!viewerRef.current || !cesiumInstance) {
          return;
        }

        clearSearchMarker();

        const entity = viewerRef.current.entities.add({
          position: cesiumInstance.Cartesian3.fromDegrees(
            longitude,
            latitude,
            0,
          ),
          point: {
            pixelSize: 14,
            color: cesiumInstance.Color.fromCssColorString("#38bdf8"),
            outlineColor: cesiumInstance.Color.WHITE,
            outlineWidth: 2,
            heightReference: cesiumInstance.HeightReference.NONE,
            // Keep marker visible above raster/terrain when zoomed in
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: label
            ? {
                text: label,
                font: "16px Inter, sans-serif",
                fillColor: cesiumInstance.Color.WHITE,
                outlineColor: cesiumInstance.Color.BLACK,
                outlineWidth: 2,
                style: cesiumInstance.LabelStyle.FILL_AND_OUTLINE,
                verticalOrigin: cesiumInstance.VerticalOrigin.BOTTOM,
                pixelOffset: new cesiumInstance.Cartesian2(0, -18),
                // Prevent label from being occluded by terrain/raster when close
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                eyeOffset: new cesiumInstance.Cartesian3(0, 0, -10),
              }
            : undefined,
        });

        searchMarkerRef.current = entity;
        viewerRef.current.scene?.requestRender();
      },
      [cesiumInstance, clearSearchMarker],
    );

    const focusOnLocation = useCallback(
      (target: { latitude: number; longitude: number; name?: string }) => {
        if (!viewerRef.current || !cesiumInstance) {
          return;
        }

        const destination = cesiumInstance.Cartesian3.fromDegrees(
          target.longitude,
          target.latitude,
          1800000,
        );

        viewerRef.current.camera.flyTo({
          destination,
          duration: 2.5,
          easingFunction: cesiumInstance.EasingFunction.SINUSOIDAL_IN_OUT,
          complete: () => {
            addSearchMarker(target.latitude, target.longitude, target.name);
          },
        });
      },
      [addSearchMarker, cesiumInstance],
    );

    const addClickMarker = useCallback(
      (Cesium: any, latitude: number, longitude: number) => {
        if (!viewerRef.current || isUpdatingMarkerRef.current) return;

        isUpdatingMarkerRef.current = true;

        try {
          if (
            currentMarkerRef.current &&
            viewerRef.current &&
            !viewerRef.current.isDestroyed()
          ) {
            clearMarker();
          }

          const markerPosition = Cesium.Cartesian3.fromDegrees(
            longitude,
            latitude,
            0,
          );
          const computeRadius = () => {
            const camera = viewerRef.current?.camera;
            const canvas = viewerRef.current?.scene?.canvas;
            if (!camera || !canvas || !canvas.height) {
              return 140000;
            }
            const fovy =
              camera.frustum && camera.frustum.fovy
                ? camera.frustum.fovy
                : Cesium.Math.toRadians(60);
            const cameraHeight = camera.positionCartographic.height;
            const metersPerPixel =
              (2 * Math.tan(fovy / 2) * cameraHeight) / canvas.height;
            const targetPixelSize = 36;
            const targetMeters = targetPixelSize * metersPerPixel;
            return Math.max(10, targetMeters / 2);
          };
          const buildMarkerRectangle = (radiusMeters: number) => {
            const metersPerDegreeLat = 111320;
            const latRadians = Cesium.Math.toRadians(latitude);
            const cosLat = Math.cos(latRadians);
            const safeCos = Math.abs(cosLat) < 0.1 ? 0.1 : cosLat;
            const deltaLat = radiusMeters / metersPerDegreeLat;
            const deltaLon = radiusMeters / (metersPerDegreeLat * safeCos);
            const west = Math.max(-180, longitude - deltaLon);
            const east = Math.min(180, longitude + deltaLon);
            const south = Math.max(-90, latitude - deltaLat);
            const north = Math.min(90, latitude + deltaLat);
            return Cesium.Rectangle.fromDegrees(west, south, east, north);
          };

          const useMeshMarker =
            useMeshRasterActiveRef.current &&
            viewMode !== "2d" &&
            viewMode !== "winkel" &&
            viewMode !== "ortho";

          if (useMeshMarker) {
            const entity = viewerRef.current.entities.add({
              position: markerPosition,
              ellipse: {
                semiMajorAxis: new Cesium.CallbackProperty(
                  () => computeRadius(),
                  false,
                ),
                semiMinorAxis: new Cesium.CallbackProperty(
                  () => computeRadius(),
                  false,
                ),
                height: 10000,
                heightReference: Cesium.HeightReference.NONE,
                material: new Cesium.ImageMaterialProperty({
                  image: "/images/selector.png",
                  transparent: true,
                }),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });

            entity.latitude = latitude;
            entity.longitude = longitude;
            currentMarkerRef.current = entity;
          } else {
            const rectangle = buildMarkerRectangle(computeRadius());
            const provider = new Cesium.SingleTileImageryProvider({
              url: "/images/selector.png",
              rectangle,
            });
            const layer =
              viewerRef.current.scene.imageryLayers.addImageryProvider(
                provider,
              );
            layer.alpha = 1.0;
            viewerRef.current.scene.imageryLayers.raiseToTop(layer);
            currentMarkerRef.current = {
              layer,
              latitude,
              longitude,
            };
          }

          viewerRef.current.scene.requestRender();
          viewerRef.current.scene?.requestRender();
        } finally {
          isUpdatingMarkerRef.current = false;
        }
      },
      [clearMarker, viewMode],
    );

    useImperativeHandle(
      ref,
      () => ({
        clearMarker,
        focusOnLocation,
        clearSearchMarker,
      }),
      [clearMarker, focusOnLocation, clearSearchMarker],
    );

    useEffect(() => {
      if (!useMeshRasterEffective) {
        setMeshRasterActive(false);
      }
    }, [setMeshRasterActive, useMeshRasterEffective]);

    useEffect(() => {
      if (isPlaying) {
        setMeshRasterActive(false);
      }
    }, [isPlaying, setMeshRasterActive]);

    useEffect(() => {
      if (!viewerReady || !viewerRef.current) return;

      const handleCameraChange = () => {
        updateRasterLod();
      };

      viewerRef.current.camera.changed.addEventListener(handleCameraChange);
      viewerRef.current.scene.preRender.addEventListener(handleCameraChange);
      updateRasterLod();

      return () => {
        if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
        viewerRef.current.camera.changed.removeEventListener(
          handleCameraChange,
        );
        viewerRef.current.scene.preRender.removeEventListener(
          handleCameraChange,
        );
      };
    }, [updateRasterLod, viewerReady]);

    useEffect(() => {
      if (!viewerReady || !viewerRef.current || !cesiumInstance) return;
      const viewer = viewerRef.current;

      const handleCameraChange = () => {
        scheduleLabelUpdate();
      };

      viewer.camera.changed.addEventListener(handleCameraChange);
      scheduleLabelUpdate();

      return () => {
        if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
        viewerRef.current.camera.changed.removeEventListener(
          handleCameraChange,
        );
        clearLabelTiles();
      };
    }, [cesiumInstance, viewerReady, scheduleLabelUpdate, clearLabelTiles]);

    useEffect(() => {
      if (!viewerReady || !viewerRef.current) return;
      if (!cesiumInstance) return;
      if (!currentMarkerRef.current?.latitude) return;

      addClickMarker(
        cesiumInstance,
        currentMarkerRef.current.latitude,
        currentMarkerRef.current.longitude,
      );
    }, [addClickMarker, cesiumInstance, useMeshRasterActive, viewerReady]);

    useEffect(() => {
      return () => {
        isComponentUnmountedRef.current = true;
      };
    }, []);

    useEffect(() => {
      const handleResize = () => {
        if (viewerRef.current && !viewerRef.current.isDestroyed()) {
          viewerRef.current.resize();
          viewerRef.current.forceResize();
        }
      };

      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, []);

    // Helper function to enforce infinite scroll disabled state
    const enforceInfiniteScrollDisabled = useCallback((viewer: any) => {
      if (!viewer?.scene?.screenSpaceCameraController) return;

      const controller = viewer.scene.screenSpaceCameraController;

      // Force these settings
      controller.infiniteScroll = false;
      controller.inertiaSpin = 0;
      controller.inertiaTranslate = 0;
    }, []);

    // FIXED: Improve viewer initialization logic
    useEffect(() => {
      if (
        !containerRef.current ||
        viewerRef.current ||
        initializingViewerRef.current ||
        viewMode === "winkel"
      )
        return;

      const initViewer = async () => {
        const container = containerRef.current;
        if (!container) return;

        try {
          initializingViewerRef.current = true;
          setIsLoading(true);
          await new Promise((resolve) => setTimeout(resolve, 50));

          const Cesium = await loadCesiumFromCDN();
          setCesiumInstance(Cesium);

          const viewer = new Cesium.Viewer(container, {
            homeButton: false,
            sceneModePicker: false,
            baseLayerPicker: false,
            navigationHelpButton: false,
            animation: false,
            timeline: false,
            fullscreenButton: false,
            geocoder: false,
            vrButton: false,
            infoBox: false,
            selectionIndicator: false,
            imageryProvider: false,
            mapMode2D: Cesium.MapMode2D.SINGLE_TILE,
          });

          viewer.scene.requestRenderMode = true;
          viewer.scene.maximumRenderTimeChange = 0.2;
          viewer.scene.globe.depthTestAgainstTerrain = true;
          viewer.screenSpaceEventHandler.removeInputAction(
            Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
          );

          if (viewer.scene?.screenSpaceCameraController) {
            const controller = viewer.scene.screenSpaceCameraController;

            // Enable all standard controls
            controller.enableInputs = true;
            controller.enableTranslate = true;
            controller.enableZoom = true;
            controller.enableRotate = true;
            controller.enableTilt = true;
            controller.enableLook = true;

            // Critical: disable infinite scroll and all inertia
            controller.infiniteScroll = false;
            controller.inertiaSpin = 0;
            controller.inertiaTranslate = 0;
            controller.inertiaZoom = 0;
          }

          const oceanMaterial = new Cesium.Material({
            fabric: {
              type: "ICharmOcean",
              uniforms: {
                deepColor: Cesium.Color.fromCssColorString("#063a6b"),
                polarColor: Cesium.Color.fromCssColorString("#0f4f7d"),
                horizonColor: Cesium.Color.fromCssColorString("#0d658f"),
                horizonIntensity: 0.15,
                polarBlendStart: 0.65,
                polarBlendEnd: 0.95,
                horizonExponent: 3.0,
                emissionStrength: 0.02,
              },
              source: `
              czm_material czm_getMaterial(czm_materialInput input)
              {
                czm_material material = czm_getDefaultMaterial(input);
                vec3 normalEC = normalize(input.normalEC);
                vec3 viewDir = normalize(-input.positionToEyeEC);

                float polarBlend = smoothstep(
                  polarBlendStart,
                  polarBlendEnd,
                  clamp(abs(input.st.t - 0.5) * 2.0, 0.0, 1.0)
                );
                vec3 base = mix(deepColor.rgb, polarColor.rgb, polarBlend);

                float rim = pow(1.0 - clamp(dot(normalEC, viewDir), 0.0, 1.0), horizonExponent);
                vec3 color = mix(base, horizonColor.rgb, rim * horizonIntensity);
                color = clamp(color, 0.0, 1.0);

                material.diffuse = color;
                material.emission = color * emissionStrength;
                material.alpha = 1.0;
                return material;
              }
            `,
            },
          });

          viewer.scene.globe.material = oceanMaterial;
          globeMaterialRef.current = oceanMaterial;
          viewer.scene.globe.baseColor =
            Cesium.Color.fromCssColorString("#061e34");
          viewer.scene.globe.enableLighting = false;
          viewer.scene.globe.dynamicAtmosphereLighting = false;
          viewer.scene.globe.dynamicAtmosphereLightingFromSun = false;
          viewer.scene.globe.showGroundAtmosphere = true;
          viewer.scene.backgroundColor = Cesium.Color.TRANSPARENT;
          viewer.scene.skyBox.show = true;
          viewer.scene.sun.show = true;
          viewer.scene.moon.show = true;

          try {
            const satelliteProvider = new Cesium.ArcGisMapServerImageryProvider(
              {
                url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
              },
            );

            const baseLayer =
              viewer.scene.imageryLayers.addImageryProvider(satelliteProvider);
            baseLayer.alpha = 1.0;
            baseLayer.brightness = 1.0;
            baseLayer.contrast = 1.0;
            viewer.scene.imageryLayers.lowerToBottom(baseLayer);

            satelliteLayerRef.current = baseLayer;
          } catch (layerError) {
            console.error("Failed to load satellite base layer", layerError);
          }

          viewer.canvas.style.width = "100%";
          viewer.canvas.style.height = "100%";

          const cesiumCredit = container.querySelector(".cesium-viewer-bottom");
          if (cesiumCredit) {
            (cesiumCredit as HTMLElement).style.display = "none";
          }

          viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(0, 20, 25000000),
          });

          const boundaryData = await loadGeographicBoundaries();

          if (viewMode !== "ortho") {
            const { boundaryEntities, geographicLineEntities } =
              addGeographicBoundaries(Cesium, viewer, boundaryData);
            boundaryEntitiesRef.current = boundaryEntities;
            geographicLineEntitiesRef.current = geographicLineEntities;

            const showBoundaries = boundaryLinesVisible;
            const showGeographic = geographicLinesVisible;
            boundaryEntitiesRef.current.forEach((entity) => {
              entity.show = showBoundaries;
            });
            geographicLineEntitiesRef.current.forEach((entity) => {
              entity.show = showGeographic;
            });
          } else {
            boundaryEntitiesRef.current = [];
            geographicLineEntitiesRef.current = [];
          }

          viewer.cesiumWidget.screenSpaceEventHandler.setInputAction(
            (event: any) => {
              const pickedPosition = viewer.camera.pickEllipsoid(
                event.position,
                viewer.scene.globe.ellipsoid,
              );
              if (pickedPosition) {
                const cartographic =
                  Cesium.Cartographic.fromCartesian(pickedPosition);
                const latitude = Cesium.Math.toDegrees(cartographic.latitude);
                const longitude = Cesium.Math.toDegrees(cartographic.longitude);

                addClickMarker(Cesium, latitude, longitude);

                if (onRegionClick) {
                  const rasterValue = rasterDataRef.current?.sampleValue(
                    latitude,
                    longitude,
                  );
                  const units =
                    rasterDataRef.current?.units ??
                    currentDataset?.units ??
                    "units";

                  const datasetName = currentDataset?.name?.toLowerCase() ?? "";
                  const datasetType =
                    currentDataset?.dataType?.toLowerCase() ?? "";
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
                    typeof rasterValue === "number" ? rasterValue : null;
                  if (value === null && !isOceanOnlyDataset) {
                    value = looksTemperature
                      ? -20 + Math.random() * 60
                      : Math.random() * 100;
                  }

                  const regionData: RegionData = {
                    name: `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`,
                    ...(value === null
                      ? {}
                      : looksTemperature
                        ? { temperature: value }
                        : { precipitation: value }),
                    dataset: currentDataset?.name || "Sample Dataset",
                    unit: units,
                  };

                  onRegionClick(latitude, longitude, regionData);
                }
              }
            },
            Cesium.ScreenSpaceEventType.LEFT_CLICK,
          );

          viewer.cesiumWidget.screenSpaceEventHandler.setInputAction(
            (event: any) => {
              const currentPosition = viewer.camera.positionCartographic;
              const currentLat = Cesium.Math.toDegrees(
                currentPosition.latitude,
              );
              const currentLon = Cesium.Math.toDegrees(
                currentPosition.longitude,
              );
              const currentHeight = currentPosition.height;

              let oppositeLon = currentLon + 180;
              if (oppositeLon > 180) {
                oppositeLon -= 360;
              }

              viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(
                  oppositeLon,
                  currentLat,
                  currentHeight,
                ),
                duration: 2.0,
                easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
              });
            },
            Cesium.ScreenSpaceEventType.RIGHT_CLICK,
          );

          viewer.camera.changed.addEventListener(updateMarkerVisibility);
          viewer.scene.preRender.addEventListener(updateMarkerVisibility);

          let lastCameraHeight = viewer.camera.positionCartographic.height;
          let cameraUpdateTimeout: any = null;

          viewer.camera.changed.addEventListener(() => {
            if (!currentMarkerRef.current || !currentMarkerRef.current.latitude)
              return;

            const currentHeight = viewer.camera.positionCartographic.height;
            const heightDifference = Math.abs(currentHeight - lastCameraHeight);

            if (heightDifference / lastCameraHeight > 0.1) {
              lastCameraHeight = currentHeight;

              if (cameraUpdateTimeout) {
                clearTimeout(cameraUpdateTimeout);
              }

              cameraUpdateTimeout = setTimeout(() => {
                if (
                  currentMarkerRef.current &&
                  currentMarkerRef.current.latitude
                ) {
                  addClickMarker(
                    Cesium,
                    currentMarkerRef.current.latitude,
                    currentMarkerRef.current.longitude,
                  );
                }
              }, 100);
            }
          });

          setTimeout(() => {
            viewer.resize();
            viewer.forceResize();
          }, 100);

          viewerRef.current = viewer;

          // FIXED: Proper sequence of state updates
          setViewerReady(true);
          setIsLoading(false);
          initializingViewerRef.current = false;
        } catch (err) {
          console.error("Failed to initialize Cesium:", err);
          setError(
            err instanceof Error ? err.message : "Failed to initialize globe",
          );
          setIsLoading(false);
          setViewerReady(false);
          initializingViewerRef.current = false;
        }
      };

      const timer = setTimeout(initViewer, 100);
      return () => clearTimeout(timer);
    }, [
      onRegionClick,
      currentDataset,
      boundaryLinesVisible,
      geographicLinesVisible,
      updateMarkerVisibility,
      addClickMarker,
      viewMode, // Include viewMode in dependency array
    ]);

    const animateLayerAlpha = useCallback(
      (
        layers: any[],
        from: number,
        to: number,
        duration: number,
        onComplete?: () => void,
      ) => {
        if (!layers.length) return;
        const start = performance.now();

        const step = (now: number) => {
          if (
            isComponentUnmountedRef.current ||
            !viewerRef.current ||
            viewerRef.current.isDestroyed()
          ) {
            return;
          }

          const t = Math.min(1, (now - start) / duration);
          const alpha = from + (to - from) * t;
          layers.forEach((layer) => {
            try {
              layer.alpha = alpha;
            } catch {
              /* noop */
            }
          });

          viewerRef.current.scene?.requestRender();

          if (t < 1) {
            requestAnimationFrame(step);
          } else if (onComplete) {
            onComplete();
          }
        };

        requestAnimationFrame(step);
      },
      [],
    );

    const applyRasterLayers = useCallback(
      (layerData?: RasterLayerData) => {
        const viewer = viewerRef.current;
        if (!viewer || !cesiumInstance) {
          return;
        }

        const previousLayers = [...rasterLayerRef.current];

        if (viewMode === "ortho") {
          rasterLayerRef.current = [];
          setIsRasterImageryLoading(false);
          if (previousLayers.length) {
            previousLayers.forEach((layer) => {
              try {
                viewer.scene.imageryLayers.remove(layer, true);
              } catch (err) {
                console.warn(
                  "Failed to remove raster layer while in ortho view",
                  err,
                );
              }
            });
          }
          viewer.scene.requestRender();
          return;
        }
        const startAlpha =
          previousLayers[0]?.alpha !== undefined
            ? previousLayers[0].alpha
            : rasterOpacity;

        if (
          !layerData ||
          !layerData.textures ||
          layerData.textures.length === 0
        ) {
          rasterLayerRef.current = [];
          // FIXED: Clear loading state when no data
          setIsRasterImageryLoading(false);
          if (previousLayers.length) {
            animateLayerAlpha(previousLayers, startAlpha, 0, 200, () => {
              previousLayers.forEach((layer) => {
                try {
                  viewer.scene.imageryLayers.remove(layer, true);
                } catch (err) {
                  console.warn(
                    "Failed to remove raster layer during fade-out",
                    err,
                  );
                }
              });
              viewer.scene.requestRender();
            });
          } else {
            viewer.scene.requestRender();
          }
          return;
        }

        const validTextures = layerData.textures.filter((texture) => {
          if (!texture || typeof texture.imageUrl !== "string") {
            return false;
          }
          const trimmed = texture.imageUrl.trim();
          if (!trimmed) {
            return false;
          }
          const rect = texture.rectangle;
          if (!rect) {
            return false;
          }
          return (
            Number.isFinite(rect.west) &&
            Number.isFinite(rect.south) &&
            Number.isFinite(rect.east) &&
            Number.isFinite(rect.north)
          );
        });

        if (validTextures.length === 0) {
          console.warn(
            "Raster layer textures missing imageUrl/rectangle; skipping imagery layer.",
            layerData.textures,
          );
          rasterLayerRef.current = [];
          // FIXED: Clear loading state when invalid textures
          setIsRasterImageryLoading(false);
          if (previousLayers.length) {
            animateLayerAlpha(previousLayers, startAlpha, 0, 200, () => {
              previousLayers.forEach((layer) => {
                try {
                  viewer.scene.imageryLayers.remove(layer, true);
                } catch (err) {
                  console.warn(
                    "Failed to remove raster layer during fade-out",
                    err,
                  );
                }
              });
              viewer.scene.requestRender();
            });
          } else {
            viewer.scene.requestRender();
          }
          return;
        }

        const loadId = textureLoadIdRef.current + 1;
        textureLoadIdRef.current = loadId;
        setIsRasterImageryLoading(true);

        // OPTIMIZED: Skip texture preloading for faster rendering
        setTimeout(() => {
          if (
            textureLoadIdRef.current === loadId &&
            !isComponentUnmountedRef.current
          ) {
            setIsRasterImageryLoading(false);
          }
        }, 100);

        const newLayers: any[] = [];
        const height = viewer.camera?.positionCartographic?.height;
        const shouldPreload =
          Number.isFinite(height) && height < IMAGERY_PRELOAD_HEIGHT;
        const visible = !useMeshRasterActiveRef.current;

        validTextures.forEach((texture, index) => {
          try {
            const provider = new cesiumInstance.SingleTileImageryProvider({
              url: texture.imageUrl,
              rectangle: cesiumInstance.Rectangle.fromDegrees(
                texture.rectangle.west,
                texture.rectangle.south,
                texture.rectangle.east,
                texture.rectangle.north,
              ),
            });

            const layer =
              viewer.scene.imageryLayers.addImageryProvider(provider);
            layer.alpha = 0;
            layer.brightness = 1.0;
            layer.contrast = 1.0;
            layer.hue = 0.0;
            layer.saturation = 1.0;
            layer.gamma = 1.0;

            layer.minificationFilter =
              cesiumInstance.TextureMinificationFilter.LINEAR;
            layer.magnificationFilter =
              cesiumInstance.TextureMagnificationFilter.LINEAR;

            viewer.scene.imageryLayers.raiseToTop(layer);
            newLayers.push(layer);
          } catch (err) {
            console.error(`Failed to add texture ${index}:`, err);
          }
        });

        rasterLayerRef.current = newLayers;
        const fadeDuration = 100; // Reduced from 220ms

        const targetOpacity = visible ? rasterOpacity : 0;
        const shouldShow = visible || shouldPreload;

        // OPTIMIZED: Direct assignment for faster rendering
        newLayers.forEach((layer) => {
          layer.alpha = targetOpacity;
          layer.show = shouldShow;
        });

        // OPTIMIZED: Quick cleanup of previous layers
        if (previousLayers.length) {
          setTimeout(() => {
            previousLayers.forEach((layer) => {
              try {
                viewer.scene.imageryLayers.remove(layer, true);
              } catch (err) {
                console.warn("Failed to remove raster layer", err);
              }
            });
          }, 50);
        }

        // FIXED: Ensure loading state is cleared
        if (loadId === textureLoadIdRef.current) {
          setIsRasterImageryLoading(false);
        }

        viewer.scene.requestRender();
      },
      [animateLayerAlpha, cesiumInstance, rasterOpacity, viewerReady, viewMode],
    );

    const removeMeshPrimitives = useCallback(
      (viewer: any, target: any | any[] | null) => {
        if (!viewer || !target) {
          return;
        }
        if (Array.isArray(target)) {
          target.forEach((primitive) => {
            try {
              viewer.scene.primitives.remove(primitive);
            } catch (err) {
              console.warn("Failed to remove tile primitive", err);
            }
          });
        } else {
          try {
            viewer.scene.primitives.remove(target);
          } catch (err) {
            console.warn("Failed to remove raster mesh", err);
          }
        }
      },
      [],
    );

    const setMeshVisibility = useCallback(
      (target: any | any[] | null, visible: boolean) => {
        if (!target) return;
        if (Array.isArray(target)) {
          target.forEach((primitive) => {
            primitive.show = visible;
          });
        } else {
          target.show = visible;
        }
      },
      [],
    );

    const setMeshAlpha = useCallback(
      (target: any | any[] | null, alpha: number) => {
        if (!target) {
          return;
        }
        const applyAlpha = (primitive: any) => {
          const alphaState = primitive?.__meshAlphaUniform;
          if (alphaState) {
            alphaState.value = alpha;
          }
        };
        if (Array.isArray(target)) {
          target.forEach(applyAlpha);
        } else {
          applyAlpha(target);
        }
      },
      [],
    );

    const createMeshPrimitives = useCallback(
      (meshData: ReturnType<typeof buildRasterMesh>) => {
        const viewer = viewerRef.current;
        if (!viewer || !cesiumInstance) {
          return null;
        }

        const buildAppearance = () => {
          const isOpaque = rasterOpacity >= 0.999;
          return new cesiumInstance.Appearance({
            vertexFormat: cesiumInstance.VertexFormat.POSITION_AND_COLOR,
            renderState: {
              depthTest: { enabled: true },
              depthMask: true,
              blending: isOpaque
                ? undefined
                : cesiumInstance.BlendingState.ALPHA_BLEND,
              cull: { enabled: false },
              polygonOffset: { enabled: true, factor: -1, units: -1 },
            },
            translucent: !isOpaque,
            closed: false,
            vertexShaderSource: `
              attribute vec3 position3DHigh;
              attribute vec3 position3DLow;
              attribute vec4 color;
              attribute float batchId;
              varying vec4 v_color;
              void main() {
                vec4 position = czm_computePosition();
                v_color = color;
                gl_Position = czm_modelViewProjectionRelativeToEye * position;
              }
            `,
            fragmentShaderSource: `
              varying vec4 v_color;
              void main() {
                gl_FragColor = v_color;
              }
            `,
          });
        };

        const surfaceOffset = 20000;
        if (meshData.tiles && meshData.tiles.length > 0) {
          const primitives: any[] = [];
          for (const tile of meshData.tiles) {
            const tileVerts = tile.vertexCount ?? tile.rows * tile.cols;
            const positions = new Float64Array(tileVerts * 3);
            for (let i = 0; i < tileVerts; i += 1) {
              const lon = tile.positionsDegrees[i * 2];
              const lat = tile.positionsDegrees[i * 2 + 1];
              const cart = cesiumInstance.Cartesian3.fromDegrees(
                lon,
                lat,
                surfaceOffset,
              );
              const outIdx = i * 3;
              positions[outIdx] = cart.x;
              positions[outIdx + 1] = cart.y;
              positions[outIdx + 2] = cart.z;
            }

            const geometry = new cesiumInstance.Geometry({
              attributes: {
                position: new cesiumInstance.GeometryAttribute({
                  componentDatatype: cesiumInstance.ComponentDatatype.DOUBLE,
                  componentsPerAttribute: 3,
                  values: positions,
                }),
                color: new cesiumInstance.GeometryAttribute({
                  componentDatatype:
                    cesiumInstance.ComponentDatatype.UNSIGNED_BYTE,
                  componentsPerAttribute: 4,
                  values: tile.colors,
                  normalize: true,
                }),
                batchId: new cesiumInstance.GeometryAttribute({
                  componentDatatype: cesiumInstance.ComponentDatatype.FLOAT,
                  componentsPerAttribute: 1,
                  values: new Float32Array(tileVerts),
                }),
              },
              indices: tile.indices,
              primitiveType: cesiumInstance.PrimitiveType.TRIANGLES,
              boundingSphere:
                cesiumInstance.BoundingSphere.fromVertices(positions),
              indexDatatype: cesiumInstance.IndexDatatype.UNSIGNED_INT,
            });

            const instance = new cesiumInstance.GeometryInstance({ geometry });
            const appearance = buildAppearance();

            const primitive = new cesiumInstance.Primitive({
              geometryInstances: instance,
              appearance,
              asynchronous: true, // Keep asynchronous for better performance
            });

            primitive.show = false;
            primitives.push(primitive);
            viewer.scene.primitives.add(primitive);
          }

          primitives.forEach((primitive) => {
            try {
              viewer.scene.primitives.lowerToBottom(primitive);
            } catch (err) {
              console.warn("Failed to lower tile primitive", err);
            }
          });

          return primitives;
        }

        const totalVerts =
          meshData.vertexCount ?? meshData.rows * meshData.cols;
        const positions = new Float64Array(totalVerts * 3);
        for (let i = 0; i < totalVerts; i += 1) {
          const lon = meshData.positionsDegrees[i * 2];
          const lat = meshData.positionsDegrees[i * 2 + 1];
          const cart = cesiumInstance.Cartesian3.fromDegrees(
            lon,
            lat,
            surfaceOffset,
          );
          const outIdx = i * 3;
          positions[outIdx] = cart.x;
          positions[outIdx + 1] = cart.y;
          positions[outIdx + 2] = cart.z;
        }

        const geometry = new cesiumInstance.Geometry({
          attributes: {
            position: new cesiumInstance.GeometryAttribute({
              componentDatatype: cesiumInstance.ComponentDatatype.DOUBLE,
              componentsPerAttribute: 3,
              values: positions,
            }),
            color: new cesiumInstance.GeometryAttribute({
              componentDatatype: cesiumInstance.ComponentDatatype.UNSIGNED_BYTE,
              componentsPerAttribute: 4,
              values: meshData.colors,
              normalize: true,
            }),
            batchId: new cesiumInstance.GeometryAttribute({
              componentDatatype: cesiumInstance.ComponentDatatype.FLOAT,
              componentsPerAttribute: 1,
              values: new Float32Array(totalVerts),
            }),
          },
          indices: meshData.indices,
          primitiveType: cesiumInstance.PrimitiveType.TRIANGLES,
          boundingSphere: cesiumInstance.BoundingSphere.fromVertices(positions),
        });

        const appearance = buildAppearance();
        const instance = new cesiumInstance.GeometryInstance({ geometry });
        const primitive = new cesiumInstance.Primitive({
          geometryInstances: instance,
          appearance,
          asynchronous: true, // Keep asynchronous for better performance
        });
        primitive.show = false;
        viewer.scene.primitives.add(primitive);
        try {
          viewer.scene.primitives.lowerToBottom(primitive);
        } catch (err) {
          console.warn("Failed to lower raster mesh", err);
        }
        return primitive;
      },
      [cesiumInstance, rasterOpacity],
    );

    const activateMeshPrimitives = useCallback(
      (target: any | any[] | null) => {
        if (!viewerRef.current) return;
        if (rasterMeshRef.current && rasterMeshRef.current !== target) {
          setMeshVisibility(rasterMeshRef.current, false);
        }
        rasterMeshRef.current = target;
        setMeshVisibility(target, true);
        viewerRef.current.scene.requestRender();
      },
      [setMeshVisibility],
    );

    const clearMeshCache = useCallback(() => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      meshPrimitiveCacheRef.current.forEach((primitive) => {
        removeMeshPrimitives(viewer, primitive);
      });
      meshPrimitiveCacheRef.current.clear();
      rasterMeshRef.current = null;
    }, [removeMeshPrimitives]);

    const cancelMeshFade = useCallback(() => {
      if (rasterMeshFadeFrameRef.current != null) {
        cancelAnimationFrame(rasterMeshFadeFrameRef.current);
        rasterMeshFadeFrameRef.current = null;
      }
      const viewer = viewerRef.current;
      if (viewer && rasterMeshFadeOutRef.current) {
        removeMeshPrimitives(viewer, rasterMeshFadeOutRef.current);
        rasterMeshFadeOutRef.current = null;
      }
    }, [removeMeshPrimitives]);

    const clearRasterMesh = useCallback(() => {
      const viewer = viewerRef.current;
      if (!viewer || !rasterMeshRef.current) {
        return;
      }
      cancelMeshFade();
      setMeshVisibility(rasterMeshRef.current, false);
      rasterMeshRef.current = null;
      viewer.scene.requestRender();
    }, [cancelMeshFade, setMeshVisibility]);

    const applyRasterMesh = useCallback(
      (meshData?: ReturnType<typeof buildRasterMesh>, cacheKey?: string) => {
        if (!meshData || meshData.rows === 0 || meshData.cols === 0) {
          clearRasterMesh();
          return;
        }

        const key = cacheKey ?? "";
        const cached = key ? meshPrimitiveCacheRef.current.get(key) : undefined;
        if (cached) {
          activateMeshPrimitives(cached);
          return;
        }

        const created = createMeshPrimitives(meshData);
        if (!created) {
          clearRasterMesh();
          return;
        }
        if (key) {
          meshPrimitiveCacheRef.current.set(key, created);
        }
        activateMeshPrimitives(created);
      },
      [activateMeshPrimitives, clearRasterMesh, createMeshPrimitives],
    );
    useEffect(() => {
      if (viewMode === "winkel" && viewerRef.current) {
        try {
          viewerRef.current.destroy();
        } catch (err) {
          console.warn("Failed to destroy Cesium viewer", err);
        }
        viewerRef.current = null;
        setViewerReady(false);
        initializingViewerRef.current = false;
      }
    }, [viewMode]);

    useEffect(() => {
      return () => {
        if (viewerRef.current && !viewerRef.current.isDestroyed()) {
          if (rasterLayerRef.current.length) {
            rasterLayerRef.current.forEach((layer) => {
              try {
                viewerRef.current.scene.imageryLayers.remove(layer, true);
              } catch (err) {
                console.warn(
                  "Failed to remove raster layer during cleanup",
                  err,
                );
              }
            });
            rasterLayerRef.current = [];
          }
          if (rasterMeshRef.current) {
            cancelMeshFade();
            setMeshVisibility(rasterMeshRef.current, false);
          }
          clearMeshCache();
          clearMarker();
          clearSearchMarker();
          boundaryEntitiesRef.current = [];
          geographicLineEntitiesRef.current = [];
          viewerRef.current.destroy();
          viewerRef.current = null;
          setViewerReady(false);
          initializingViewerRef.current = false;
        }
      };
    }, [
      cancelMeshFade,
      clearMarker,
      clearMeshCache,
      clearSearchMarker,
      setMeshVisibility,
    ]);

    useEffect(() => {
      if (rasterState.error) {
        console.warn("Raster pipeline error", rasterState.error);
      }
    }, [rasterState.error]);

    useEffect(() => {
      if (rasterGridState.error) {
        console.warn("Raster grid pipeline error", rasterGridState.error);
      }
    }, [rasterGridState.error]);

    const applyViewMode = useCallback(() => {
      if (!viewerRef.current || !cesiumInstance) return;
      const viewer = viewerRef.current;
      const Cesium = cesiumInstance;

      const is2D = viewMode === "2d" || viewMode === "winkel";

      if (is2D) {
        viewer.resolutionScale = 0.8;
        viewer.scene.morphTo2D(0.0);
        viewer.scene.globe.show = true;

        enforceInfiniteScrollDisabled(viewer);

        viewer.scene.requestRender();
        viewer.camera.setView({
          destination: Cesium.Rectangle.fromDegrees(-180.0, -90.0, 180.0, 90.0),
        });
        return;
      }

      viewer.resolutionScale = 1.0;
      viewer.scene.morphTo3D(0.0);
      viewer.scene.globe.show = viewMode !== "ortho";

      if (viewMode === "ortho") {
        viewer.scene.morphTo3D(0.0);
        updateOrthoFrustum();
        try {
          viewer.entities.removeAll();
        } catch (err) {
          console.warn("Failed to clear Cesium entities for ortho view", err);
        }
        boundaryEntitiesRef.current = [];
        geographicLineEntitiesRef.current = [];
        return;
      }

      const canvas = viewer.scene.canvas;
      const cameraHeight = viewer.scene.camera.positionCartographic.height;
      const globeRadius = Cesium.Ellipsoid.WGS84.maximumRadius;
      const aspectRatio =
        canvas && canvas.clientHeight
          ? canvas.clientWidth / canvas.clientHeight
          : 1;

      // Keep the far plane comfortably beyond the globe so it doesn't disappear when zoomed out.
      const farPlane = Math.max(globeRadius * 8, cameraHeight * 4, 50_000_000);

      viewer.scene.camera.frustum = new Cesium.PerspectiveFrustum({
        fov: Cesium.Math.toRadians(60),
        near: 1.0,
        far: farPlane,
        aspectRatio,
      });

      viewer.scene.requestRender();
    }, [
      viewMode,
      cesiumInstance,
      enforceInfiniteScrollDisabled,
      updateOrthoFrustum,
    ]);

    useEffect(() => {
      if (!viewerReady || viewMode !== "ortho" || !viewerRef.current) return;
      const viewer = viewerRef.current;
      const handleOrtho = () => updateOrthoFrustum();
      viewer.camera.changed.addEventListener(handleOrtho);
      viewer.scene.preRender.addEventListener(handleOrtho);
      updateOrthoFrustum();
      return () => {
        if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
        viewer.camera.changed.removeEventListener(handleOrtho);
        viewer.scene.preRender.removeEventListener(handleOrtho);
      };
    }, [updateOrthoFrustum, viewerReady, viewMode]);

    // Add an effect to periodically enforce infinite scroll disabled in 2D mode
    useEffect(() => {
      const is2D = viewMode === "2d" || viewMode === "winkel";
      if (!is2D || !viewerRef.current) return;

      // Set up an interval to periodically check and enforce the setting
      const intervalId = setInterval(() => {
        enforceInfiniteScrollDisabled(viewerRef.current);
      }, 1000); // Check every second

      return () => clearInterval(intervalId);
    }, [viewMode, enforceInfiniteScrollDisabled]);

    useEffect(() => {
      if (!satelliteLayerRef.current) return;

      satelliteLayerRef.current.show =
        viewMode === "ortho" ? false : satelliteLayerVisible;
    }, [satelliteLayerVisible, viewMode]);

    useEffect(() => {
      if (boundaryEntitiesRef.current.length === 0) return;

      boundaryEntitiesRef.current.forEach((entity) => {
        entity.show = viewMode === "ortho" ? false : boundaryLinesVisible;
      });
    }, [boundaryLinesVisible, viewMode]);

    useEffect(() => {
      if (geographicLineEntitiesRef.current.length === 0) return;

      geographicLineEntitiesRef.current.forEach((entity) => {
        entity.show = viewMode === "ortho" ? false : geographicLinesVisible;
      });
    }, [geographicLinesVisible, viewMode]);

    useEffect(() => {
      if (!viewerRef.current || !cesiumInstance) return;
      if (viewMode === "ortho") return;

      if (boundaryEntitiesRef.current.length === 0) {
        loadGeographicBoundaries()
          .then((boundaryData) => {
            if (!viewerRef.current || !cesiumInstance) return;
            const { boundaryEntities, geographicLineEntities } =
              addGeographicBoundaries(
                cesiumInstance,
                viewerRef.current,
                boundaryData,
              );
            boundaryEntitiesRef.current = boundaryEntities;
            geographicLineEntitiesRef.current = geographicLineEntities;
          })
          .catch((err) => {
            console.warn("Failed to restore geographic boundaries", err);
          });
      }

      const showBoundaries = boundaryLinesVisible;
      const showGeographic = geographicLinesVisible;
      boundaryEntitiesRef.current.forEach((entity) => {
        entity.show = showBoundaries;
      });
      geographicLineEntitiesRef.current.forEach((entity) => {
        entity.show = showGeographic;
      });
    }, [
      boundaryLinesVisible,
      geographicLinesVisible,
      viewMode,
      cesiumInstance,
    ]);

    useEffect(() => {
      if (!viewerReady) {
        return;
      }

      const textureCount = rasterState.data?.textures?.length ?? 0;
      if (textureCount === 0) {
        viewerRef.current?.scene?.requestRender();
        return;
      }

      applyRasterLayers(rasterState.data);
    }, [
      applyRasterLayers,
      rasterState.data,
      rasterState.requestKey,
      viewerReady,
    ]);

    useEffect(() => {
      if (!viewerReady || !viewerRef.current) return;
      const viewer = viewerRef.current;
      const hasRasterTextures = Boolean(rasterState.data?.textures?.length);
      const shouldShowImagery =
        hasRasterTextures &&
        !useMeshRasterActive &&
        viewMode !== "winkel" &&
        viewMode !== "ortho";

      // Cesium globe materials override imagery layers, so clear when showing rasters.
      if (shouldShowImagery) {
        if (viewer.scene.globe.material) {
          viewer.scene.globe.material = undefined;
          viewer.scene.requestRender();
        }
      } else if (globeMaterialRef.current) {
        if (viewer.scene.globe.material !== globeMaterialRef.current) {
          viewer.scene.globe.material = globeMaterialRef.current;
          viewer.scene.requestRender();
        }
      }
    }, [viewerReady, rasterState.data, useMeshRasterActive, viewMode]);

    useEffect(() => {
      if (viewMode !== "ortho") return;
      if (rasterMeshRef.current) {
        setMeshVisibility(rasterMeshRef.current, false);
      }
    }, [setMeshVisibility, viewMode]);

    useEffect(() => {
      if (!viewerReady || !viewerRef.current) return;

      const layers = rasterLayerRef.current;
      if (!layers.length) return;

      const visible = !useMeshRasterActive;
      const targetOpacity = visible ? rasterOpacity : 0;
      const startOpacity =
        layers[0]?.alpha !== undefined ? layers[0].alpha : targetOpacity;

      layers.forEach((layer) => {
        layer.show = true;
      });
      animateLayerAlpha(layers, startOpacity, targetOpacity, 160, () => {
        layers.forEach((layer) => {
          layer.alpha = targetOpacity;
          layer.show = visible;
        });
      });
    }, [animateLayerAlpha, rasterOpacity, useMeshRasterActive, viewerReady]);

    useEffect(() => {
      if (!viewerReady) return;
      applyViewMode();
    }, [viewerReady, applyViewMode]);

    useEffect(() => {
      if (useMeshRasterEffective && useMeshRasterActive) {
        if (
          rasterGridState.data &&
          rasterGridState.dataKey === rasterGridState.requestKey
        ) {
          rasterDataRef.current = rasterGridState.data;
        } else {
          rasterDataRef.current = undefined;
        }
        if (onRasterMetadataChange) {
          if (
            rasterGridState.data &&
            rasterGridState.dataKey === rasterGridState.requestKey
          ) {
            onRasterMetadataChange({
              units: rasterGridState.data.units ?? null,
              min: rasterGridState.data.min ?? null,
              max: rasterGridState.data.max ?? null,
            });
          } else {
            onRasterMetadataChange(null);
          }
        }
        return;
      }

      rasterDataRef.current = rasterState.data;
      if (onRasterMetadataChange) {
        if (rasterState.data) {
          onRasterMetadataChange({
            units: rasterState.data.units ?? null,
            min: rasterState.data.min ?? null,
            max: rasterState.data.max ?? null,
          });
        } else {
          onRasterMetadataChange(null);
        }
      }
    }, [
      onRasterMetadataChange,
      rasterGridState.data,
      rasterGridState.dataKey,
      rasterGridState.requestKey,
      rasterState.data,
      useMeshRasterEffective,
      useMeshRasterActive,
    ]);

    useEffect(() => {
      if (!useMeshRaster || !useMeshRasterActive) return;
      const hasMatchingGrid =
        rasterGridState.data &&
        rasterGridState.dataKey === rasterGridState.requestKey;
      if (!hasMatchingGrid && rasterState.data?.textures?.length) {
        setMeshRasterActive(false);
      }
    }, [
      rasterGridState.data,
      rasterGridState.dataKey,
      rasterGridState.requestKey,
      rasterState.data,
      setMeshRasterActive,
      useMeshRaster,
      useMeshRasterActive,
    ]);

    useEffect(() => {
      if (!viewerReady) return;
      if (!useMeshRasterEffective || !useMeshRasterActive) {
        clearRasterMesh();
        return;
      }

      const grid = rasterGridState.data;
      const hasMatchingGrid =
        grid && rasterGridState.dataKey === rasterGridState.requestKey;
      if (!hasMatchingGrid || !currentDataset?.colorScale?.colors?.length) {
        clearRasterMesh();
        return;
      }

      const min = grid.min ?? 0;
      const max = grid.max ?? 1;
      const effectiveOpacity = rasterOpacity;
      const mesh = buildRasterMesh({
        lat: grid.lat,
        lon: grid.lon,
        values: grid.values,
        mask: grid.mask,
        min,
        max,
        colors: currentDataset.colorScale.colors,
        opacity: effectiveOpacity,
        smoothValues: false,
        flatShading: !rasterBlurEnabled,
        sampleStep: meshSamplingStep,
        useTiling: shouldTileLargeMesh,
      });
      const meshKey = rasterGridState.requestKey
        ? `${rasterGridState.requestKey}|blur:${rasterBlurEnabled ? 1 : 0}|grid:${meshSamplingStep}|op:${meshOpacityKey}`
        : undefined;
      applyRasterMesh(mesh, meshKey);
    }, [
      applyRasterMesh,
      clearRasterMesh,
      currentDataset?.colorScale?.colors,
      meshSamplingStep,
      meshOpacityKey,
      rasterGridState.data,
      rasterGridState.dataKey,
      rasterGridState.requestKey,
      rasterBlurEnabled,
      rasterOpacity,
      satelliteLayerVisible,
      shouldTileLargeMesh,
      useMeshRasterEffective,
      useMeshRasterActive,
      viewerReady,
    ]);

    useEffect(() => {
      if (!viewerReady || !useMeshRasterEffective || !prefetchedRasterGrids) {
        return;
      }
      const abortSignal = { aborted: false };
      meshPreloadAbortRef.current = abortSignal;
      const entries =
        prefetchedRasterGrids instanceof Map
          ? Array.from(prefetchedRasterGrids.entries())
          : Object.entries(prefetchedRasterGrids);

      let index = 0;
      const preloadNext = () => {
        if (abortSignal.aborted || index >= entries.length) {
          return;
        }
        const [key, grid] = entries[index];
        index += 1;

        const meshKey = `${key}|blur:${rasterBlurEnabled ? 1 : 0}|grid:${meshSamplingStep}|op:${meshOpacityKey}`;
        if (
          !grid ||
          !currentDataset?.colorScale?.colors?.length ||
          meshPrimitiveCacheRef.current.has(meshKey)
        ) {
          setTimeout(preloadNext, 0);
          return;
        }

        const min = grid.min ?? 0;
        const max = grid.max ?? 1;
        const mesh = buildRasterMesh({
          lat: grid.lat,
          lon: grid.lon,
          values: grid.values,
          mask: grid.mask,
          min,
          max,
          colors: currentDataset.colorScale.colors,
          opacity: rasterOpacity,
          smoothValues: false,
          flatShading: !rasterBlurEnabled,
          sampleStep: meshSamplingStep,
          useTiling: shouldTileLargeMesh,
        });
        const created = createMeshPrimitives(mesh);
        if (created) {
          meshPrimitiveCacheRef.current.set(meshKey, created);
        }
        setTimeout(preloadNext, 0);
      };

      preloadNext();

      return () => {
        abortSignal.aborted = true;
      };
    }, [
      createMeshPrimitives,
      currentDataset?.colorScale?.colors,
      meshSamplingStep,
      meshOpacityKey,
      prefetchedRasterGrids,
      rasterBlurEnabled,
      rasterOpacity,
      shouldTileLargeMesh,
      useMeshRasterEffective,
      viewerReady,
    ]);

    useEffect(() => {
      clearMeshCache();
    }, [clearMeshCache, currentDataset?.id, selectedLevel]);
    const isWinkel = viewMode === "winkel";
    const isOrtho = viewMode === "ortho";
    const showInitialLoading = !isWinkel && isLoading && !viewerReady;
    const showRasterLoading =
      !isPlaying &&
      !isLoading &&
      viewerReady &&
      // OPTIMIZED: Only show loading if actually loading AND no data available
      ((useMeshRasterActive
        ? rasterGridState.isLoading && !rasterGridState.data
        : rasterState.isLoading && !rasterState.data) ||
        (!isWinkel && isRasterImageryLoading));

    if (isWinkel) {
      return (
        <div
          className="absolute inset-0 z-0 h-full w-full"
          style={{
            background:
              "radial-gradient(ellipse at center, #1e3a8a 0%, #0f172a 50%, #000000 100%)",
            minHeight: "100vh",
            minWidth: "100vw",
          }}
        >
          {(rasterState.isLoading || !rasterState.data) && (
            <GlobeLoading
              message="Rendering Winkel Tripel…"
              subtitle="Projecting climate data to 2D"
            />
          )}
          <WinkelMap
            rasterData={rasterState.data}
            rasterGridData={
              useMeshRasterEffective ? rasterGridState.data : undefined
            }
            rasterOpacity={rasterOpacity}
            satelliteLayerVisible={satelliteLayerVisible}
            boundaryLinesVisible={boundaryLinesVisible}
            geographicLinesVisible={geographicLinesVisible}
            currentDataset={currentDataset}
            onRegionClick={onRegionClick}
            useMeshRaster={useMeshRasterEffective}
            clearMarkerSignal={winkelClearMarkerTick}
          />
        </div>
      );
    }

    if (error) {
      return (
        <div className="absolute inset-0 z-0 flex h-full w-full items-center justify-center bg-linear-to-br from-slate-900 via-blue-900 to-indigo-900 text-white">
          <div className="text-center">
            <div className="mb-4 text-6xl">🌍</div>
            <h3 className="mb-2 text-lg font-semibold">Failed to Load Globe</h3>
            <p className="mb-2 text-sm text-gray-400">{error}</p>
            <p className="mb-4 text-xs text-gray-500">
              Check your tile server and try again
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        className="absolute inset-0 z-0 h-full w-full"
        style={{
          background:
            "radial-gradient(ellipse at center, #1e3a8a 0%, #0f172a 50%, #000000 100%)",
          minHeight: "100vh",
          minWidth: "100vw",
        }}
      >
        {showInitialLoading && (
          <GlobeLoading
            message="Loading globe…"
            subtitle="Initializing Cesium and geographic boundaries"
          />
        )}

        {showRasterLoading && (
          <GlobeLoading
            message="Rendering dataset…"
            subtitle={
              currentDataset
                ? `Applying ${currentDataset.name}`
                : "Fetching climate data"
            }
          />
        )}

        <div
          ref={containerRef}
          className="absolute inset-0 z-0 h-screen w-screen"
          style={{
            minHeight: "100vh",
            minWidth: "100vw",
            overflow: "hidden",
          }}
        />

        {isOrtho && (
          <OrthoGlobe
            rasterData={rasterState.data}
            rasterGridData={
              useMeshRasterEffective ? rasterGridState.data : undefined
            }
            rasterOpacity={rasterOpacity}
            satelliteLayerVisible={satelliteLayerVisible}
            boundaryLinesVisible={boundaryLinesVisible}
            geographicLinesVisible={geographicLinesVisible}
            currentDataset={currentDataset}
            useMeshRaster={useMeshRasterEffective}
            rasterBlurEnabled={rasterBlurEnabled}
            onRegionClick={onRegionClick}
            clearMarkerSignal={orthoClearMarkerTick}
          />
        )}
      </div>
    );
  },
);

Globe.displayName = "Globe";

export default Globe;
