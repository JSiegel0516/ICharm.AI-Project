"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useCallback,
  forwardRef,
} from "react";
import type {
  Dataset,
  RegionData,
  GlobeProps,
  GlobeRef,
  MapProjectionId,
} from "@/types";
import { useRasterLayer } from "@/hooks/useRasterLayer";
import { useRasterGrid, RasterGridData } from "@/hooks/useRasterGrid";
import { buildRasterMesh, prepareRasterMeshGrid } from "@/lib/mesh/rasterMesh";
import { buildRasterImageFromMesh } from "@/lib/mesh/rasterImage";
import type { RasterLayerData } from "@/hooks/useRasterLayer";
import GlobeLoading from "./GlobeLoading";
import OrthoGlobe from "./OrthoGlobe";
import ProjectedGlobe from "./ProjectedGlobe";
import { MAP_PROJECTIONS } from "./projectionConfig";
import { Button } from "@/components/ui/button";
import { loadCesiumFromCDN } from "./_cesium/loadCesium";
import {
  addGeographicBoundaries,
  loadGeographicBoundaries,
} from "./_cesium/naturalEarthBoundaries";
import { useCesiumLabels } from "./_cesium/useCesiumLabels";
import { addGeoJsonLines } from "./_cesium/geoJsonLines";
import {
  IMAGERY_HIDE_HEIGHT,
  IMAGERY_PRELOAD_HEIGHT,
  VERTEX_COLOR_GAIN,
} from "./_cesium/constants";
import { getLabelTier, heightToTileZoomFloat } from "./_cesium/labelUtils";

const FORCE_IMAGERY_ONLY = true;
const FORCE_MESH_ONLY = false;
import { fetchGeoJson, preloadGeoJson } from "@/utils/geoJsonCache";

const CesiumGlobe = forwardRef<GlobeRef, GlobeProps>(
  (
    {
      currentDataset,
      onRegionClick,
      selectedDate,
      selectedLevel,
      colorbarRange,
      viewMode = "3d",
      baseMapMode = "satellite",
      satelliteLayerVisible = true,
      boundaryLinesVisible = true,
      countryBoundaryResolution = "low",
      stateBoundaryResolution = "low",
      geographicLinesVisible = false,
      timeZoneLinesVisible = false,
      coastlineResolution = "low",
      riverResolution = "none",
      lakeResolution = "none",
      naturalEarthGeographicLinesVisible = false,
      labelsVisible = true,
      rasterOpacity = 1.0,
      rasterBlurEnabled = false,
      hideZeroPrecipitation = false,
      bumpMapMode = "none",
      pacificCentered = false,
      useMeshRaster = false,
      lineColors,
      mapOrientations,
      onProjectionOrientationChange,
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
    const cesiumDebugRef = useRef<HTMLDivElement | null>(null);
    const initializingViewerRef = useRef(false);

    // FIXED: Better loading state management
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [loadingTimeout, setLoadingTimeout] = useState<NodeJS.Timeout | null>(
      null,
    );

    const currentMarkerRef = useRef<{
      latitude: number;
      longitude: number;
      meshEntity?: any;
      imageryLayer?: any;
    } | null>(null);
    const searchMarkerRef = useRef<any>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [cesiumInstance, setCesiumInstance] = useState<any>(null);
    const [viewerReady, setViewerReady] = useState(false);
    const [isRasterImageryLoading, setIsRasterImageryLoading] = useState(false);

    const satelliteLayerRef = useRef<any>(null);
    const streetLayerRef = useRef<any>(null);
    const streetOverlayLayerRef = useRef<any>(null);
    const boundaryEntitiesRef = useRef<any[]>([]);
    const geographicLineEntitiesRef = useRef<any[]>([]);
    const timeZoneLineEntitiesRef = useRef<any[]>([]);
    const naturalEarthLineEntitiesRef = useRef<any[]>([]);
    const countryBoundaryEntitiesRef = useRef<any[]>([]);
    const stateBoundaryEntitiesRef = useRef<any[]>([]);
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
    const boundaryConfigRef = useRef<string>("");
    const adminBoundaryConfigRef = useRef<string>("");

    const rasterDataRef = useRef<RasterLayerData | RasterGridData | undefined>(
      undefined,
    );
    const [orthoClearMarkerTick, setOrthoClearMarkerTick] = useState(0);
    const [projectionClearMarkerTick, setProjectionClearMarkerTick] =
      useState(0);
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
    const effectiveViewMode = viewMode;
    const isOrtho = effectiveViewMode === "ortho";
    const forceImageryOnly = FORCE_IMAGERY_ONLY && !FORCE_MESH_ONLY;
    const forceMeshOnly = FORCE_MESH_ONLY && !FORCE_IMAGERY_ONLY;
    const projectionId = MAP_PROJECTIONS.find(
      (projection) => projection.id === effectiveViewMode,
    )?.id as MapProjectionId | undefined;
    const isProjection = Boolean(projectionId);
    const smoothGridBoxValues = rasterBlurEnabled;
    const useMeshRasterEffective = useMeshRaster;
    const effectiveSatelliteVisible = !isOrtho && satelliteLayerVisible;
    const effectiveLabelsVisible = !isOrtho && labelsVisible;
    const effectiveBaseMapMode = isOrtho ? "satellite" : baseMapMode;

    useCesiumLabels({
      cesiumInstance,
      viewerRef,
      effectiveLabelsVisible,
      effectiveViewMode,
      viewerReady,
    });

    const [useMeshRasterActive, setUseMeshRasterActive] = useState(
      useMeshRasterEffective,
    );
    const useMeshRasterActiveRef = useRef(useMeshRasterEffective);
    const [clientRasterizeImagery] = useState(true);
    const clientRasterizeImageryRef = useRef(true);
    const rasterState = useRasterLayer({
      dataset: rasterLayerDataset,
      date: selectedDate,
      level: selectedLevel ?? null,
      maskZeroValues: shouldHideZero,
      smoothGridBoxValues: rasterBlurEnabled,
      opacity: rasterOpacity,
      clientRasterize: clientRasterizeImagery,
      colorbarRange,
      prefetchedData: prefetchedRasters,
    });
    const rasterGridState = useRasterGrid({
      dataset: currentDataset,
      date: selectedDate,
      level: selectedLevel ?? null,
      maskZeroValues: shouldHideZero,
      colorbarRange,
      enabled: effectiveViewMode !== "ortho" || useMeshRasterEffective,
      prefetchedData: prefetchedRasterGrids,
    });

    const meshDerivedRaster = useMemo(() => {
      const grid = rasterGridState.data;
      if (!grid || !currentDataset?.colorScale?.colors?.length) {
        return undefined;
      }

      const min = grid.min ?? 0;
      const max = grid.max ?? 1;
      const prepared = prepareRasterMeshGrid({
        lat: grid.lat,
        lon: grid.lon,
        values: grid.values,
        mask: grid.mask,
        smoothValues: false,
        flatShading: !rasterBlurEnabled,
        sampleStep: meshSamplingStep,
        wrapSeam: true,
      });
      const mesh = buildRasterMesh({
        lat: prepared.lat,
        lon: prepared.lon,
        values: prepared.values,
        mask: prepared.mask,
        preparedGrid: prepared,
        min,
        max,
        colors: currentDataset.colorScale.colors,
        opacity: 1,
        smoothValues: false,
        flatShading: !rasterBlurEnabled,
        sampleStep: meshSamplingStep,
        useTiling: false,
      });

      const image = buildRasterImageFromMesh({
        lat: prepared.lat,
        lon: prepared.lon,
        rows: prepared.rows,
        cols: prepared.cols,
        colors: mesh.colors,
        flatShading: !rasterBlurEnabled,
        colorGain: VERTEX_COLOR_GAIN,
      });

      if (!image) return undefined;

      return {
        textures: [
          {
            imageUrl: image.dataUrl,
            width: image.width,
            height: image.height,
            rectangle: image.rectangle,
          },
        ],
        units: grid.units ?? currentDataset?.units,
        min,
        max,
        sampleValue: grid.sampleValue,
      };
    }, [
      currentDataset?.colorScale?.colors,
      currentDataset?.units,
      meshSamplingStep,
      rasterBlurEnabled,
      rasterGridState.data,
    ]);

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

    const getShowImagery = useCallback(() => {
      const viewer = viewerRef.current;
      if (!viewer) return true;
      if (forceImageryOnly) return true;
      if (forceMeshOnly) return false;
      if (
        !useMeshRasterActiveRef.current ||
        effectiveViewMode === "2d" ||
        effectiveViewMode === "ortho"
      ) {
        return true;
      }
      const height = viewer.camera.positionCartographic.height;
      return height < IMAGERY_HIDE_HEIGHT;
    }, [
      effectiveViewMode,
      forceImageryOnly,
      forceMeshOnly,
      IMAGERY_HIDE_HEIGHT,
    ]);

    const setMarkerLayerVisibility = useCallback((showImagery: boolean) => {
      if (!viewerRef.current) return;
      const marker = currentMarkerRef.current;
      if (!marker) return;
      if (marker.meshEntity) {
        marker.meshEntity.show = !showImagery;
        if (marker.meshEntity.billboard) {
          marker.meshEntity.billboard.show = !showImagery;
        }
      }
      if (marker.imageryLayer) {
        marker.imageryLayer.show = showImagery;
        marker.imageryLayer.alpha = showImagery ? 1.0 : 0.0;
        if (showImagery) {
          viewerRef.current.scene.imageryLayers.raiseToTop(marker.imageryLayer);
        }
      }
      viewerRef.current.scene.requestRender();
    }, []);

    const updateOrthoFrustum = useCallback(() => {
      if (!viewerRef.current || !cesiumInstance) return;
      if (effectiveViewMode !== "ortho") return;
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
    }, [cesiumInstance, effectiveViewMode]);

    const updateRasterLod = useCallback(() => {
      if (!viewerRef.current || !viewerReady) return;

      if (forceImageryOnly) {
        setMeshRasterActive(false);
        setMarkerLayerVisibility(true);
        const layers = rasterLayerRef.current;
        if (layers.length) {
          layers.forEach((layer) => {
            layer.show = true;
            layer.alpha = rasterOpacity;
          });
          if (viewerRef.current.scene.globe.material) {
            viewerRef.current.scene.globe.material = undefined;
          }
          viewerRef.current.scene.requestRender();
        }
        return;
      }

      if (forceMeshOnly) {
        setMeshRasterActive(true);
        setMarkerLayerVisibility(false);
        const layers = rasterLayerRef.current;
        if (layers.length) {
          layers.forEach((layer) => {
            layer.show = false;
            layer.alpha = 0;
          });
          if (globeMaterialRef.current) {
            viewerRef.current.scene.globe.material = globeMaterialRef.current;
          }
          viewerRef.current.scene.requestRender();
        }
        return;
      }

      if (isPlaying) {
        setMeshRasterActive(false);
        return;
      }

      if (!useMeshRasterEffective || effectiveViewMode === "ortho") {
        setMeshRasterActive(false);
        return;
      }

      setMeshRasterActive(true);

      const viewer = viewerRef.current;
      const height = viewer.camera.positionCartographic.height;

      const showImagery = height < IMAGERY_HIDE_HEIGHT;
      setMarkerLayerVisibility(showImagery);

      // Keep imagery in sync with zoom even if mesh state lags.
      const layers = rasterLayerRef.current;
      if (layers.length) {
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
      forceImageryOnly,
      forceMeshOnly,
      setMeshRasterActive,
      useMeshRasterEffective,
      viewerReady,
      effectiveViewMode,
      rasterOpacity,
      setMarkerLayerVisibility,
    ]);

    const clearMarker = useCallback(() => {
      if (
        currentMarkerRef.current &&
        viewerRef.current &&
        !viewerRef.current.isDestroyed()
      ) {
        try {
          const marker = currentMarkerRef.current;
          if (marker.meshEntity) {
            viewerRef.current.entities.remove(marker.meshEntity);
          }
          if (marker.imageryLayer) {
            viewerRef.current.scene.imageryLayers.remove(
              marker.imageryLayer,
              true,
            );
          }
        } catch (err) {
          console.warn("Failed to remove marker", err);
        }
        currentMarkerRef.current = null;
      }

      setOrthoClearMarkerTick((tick) => tick + 1);
      setProjectionClearMarkerTick((tick) => tick + 1);
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
      if (currentMarkerRef.current?.meshEntity) {
        updateEntityVisibility(currentMarkerRef.current.meshEntity);
      }

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

          const meshEntity = viewerRef.current.entities.add({
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

          const rectangle = buildMarkerRectangle(computeRadius());
          const provider = new Cesium.SingleTileImageryProvider({
            url: "/images/selector.png",
            rectangle,
          });
          const imageryLayer =
            viewerRef.current.scene.imageryLayers.addImageryProvider(provider);
          imageryLayer.alpha = 1.0;
          viewerRef.current.scene.imageryLayers.raiseToTop(imageryLayer);

          currentMarkerRef.current = {
            latitude,
            longitude,
            meshEntity,
            imageryLayer,
          };

          setMarkerLayerVisibility(getShowImagery());

          viewerRef.current.scene.requestRender();
          viewerRef.current.scene?.requestRender();
        } finally {
          isUpdatingMarkerRef.current = false;
        }
      },
      [clearMarker, getShowImagery, setMarkerLayerVisibility],
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
      if (forceMeshOnly) {
        setMeshRasterActive(true);
        return;
      }
      if (!useMeshRasterEffective) {
        setMeshRasterActive(false);
      }
    }, [forceMeshOnly, setMeshRasterActive, useMeshRasterEffective]);

    useEffect(() => {
      if (isPlaying && !forceMeshOnly) {
        setMeshRasterActive(false);
      }
    }, [forceMeshOnly, isPlaying, setMeshRasterActive]);

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
      if (!viewerReady || !viewerRef.current) return;
      if (!currentMarkerRef.current?.latitude) return;
      setMarkerLayerVisibility(getShowImagery());
    }, [
      getShowImagery,
      setMarkerLayerVisibility,
      useMeshRasterActive,
      viewerReady,
    ]);

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
        isProjection
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

          try {
            const streetProvider = new Cesium.UrlTemplateImageryProvider({
              url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
              credit: "© OpenStreetMap contributors",
            });
            const streetLayer =
              viewer.scene.imageryLayers.addImageryProvider(streetProvider);
            streetLayer.alpha = 1.0;
            streetLayer.brightness = 1.0;
            streetLayer.contrast = 1.0;
            streetLayer.show = false;
            viewer.scene.imageryLayers.lowerToBottom(streetLayer);
            streetLayerRef.current = streetLayer;
          } catch (layerError) {
            console.error("Failed to load street base layer", layerError);
          }

          try {
            const streetOverlayProvider = new Cesium.UrlTemplateImageryProvider(
              {
                url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                credit: "© OpenStreetMap contributors",
              },
            );
            const overlayLayer = viewer.scene.imageryLayers.addImageryProvider(
              streetOverlayProvider,
            );
            overlayLayer.alpha = 0.9;
            overlayLayer.brightness = 1.05;
            overlayLayer.contrast = 1.05;
            overlayLayer.show = false;
            viewer.scene.imageryLayers.raiseToTop(overlayLayer);
            streetOverlayLayerRef.current = overlayLayer;
          } catch (layerError) {
            console.error("Failed to load street overlay layer", layerError);
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

          const boundaryData = await loadGeographicBoundaries({
            coastlineResolution,
            riverResolution,
            lakeResolution,
            includeGeographicLines: naturalEarthGeographicLinesVisible,
            includeBoundaries: boundaryLinesVisible,
          });
          console.log("[CesiumGlobe] initial boundary load", {
            count: boundaryData.length,
            boundaryLinesVisible,
            geographicLinesVisible,
            naturalEarthGeographicLinesVisible,
          });

          if (effectiveViewMode !== "ortho") {
            const {
              boundaryEntities,
              geographicLineEntities,
              naturalEarthLineEntities,
            } = addGeographicBoundaries(
              Cesium,
              viewer,
              boundaryData,
              lineColors,
            );
            console.log("[CesiumGlobe] initial boundary entities", {
              boundary: boundaryEntities.length,
              geographic: geographicLineEntities.length,
              naturalEarth: naturalEarthLineEntities.length,
            });
            boundaryEntitiesRef.current = boundaryEntities;
            geographicLineEntitiesRef.current = geographicLineEntities;
            naturalEarthLineEntitiesRef.current = naturalEarthLineEntities;

            const showBoundaries = boundaryLinesVisible;
            const showGeographic = geographicLinesVisible;
            boundaryEntitiesRef.current.forEach((entity) => {
              entity.show = showBoundaries;
            });
            geographicLineEntitiesRef.current.forEach((entity) => {
              entity.show = showGeographic;
            });
            naturalEarthLineEntitiesRef.current.forEach((entity) => {
              entity.show = naturalEarthGeographicLinesVisible;
            });
          } else {
            boundaryEntitiesRef.current = [];
            geographicLineEntitiesRef.current = [];
            naturalEarthLineEntitiesRef.current = [];
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

                  const texture = (meshDerivedRaster ?? rasterState.data)
                    ?.textures?.[0];
                  const rect = texture?.rectangle;
                  const width = texture?.width;
                  const height = texture?.height;
                  if (
                    rect &&
                    typeof width === "number" &&
                    typeof height === "number" &&
                    width > 0 &&
                    height > 0 &&
                    typeof texture?.imageUrl === "string"
                  ) {
                    const lonRange = rect.east - rect.west;
                    let lonForSample = longitude;
                    if (lonRange > 300 && lonForSample < rect.west) {
                      lonForSample += 360;
                    }
                    const x =
                      lonRange !== 0
                        ? Math.floor(
                            ((lonForSample - rect.west) / lonRange) * width,
                          )
                        : 0;
                    const yRange = rect.north - rect.south;
                    const y =
                      yRange !== 0
                        ? Math.floor(
                            ((rect.north - latitude) / yRange) * height,
                          )
                        : 0;

                    const image = new Image();
                    image.crossOrigin = "anonymous";
                    image.onload = () => {
                      const canvas = document.createElement("canvas");
                      canvas.width = width;
                      canvas.height = height;
                      const ctx = canvas.getContext("2d");
                      if (!ctx) return;
                      ctx.drawImage(image, 0, 0, width, height);
                      const px = Math.min(Math.max(x, 0), width - 1);
                      const py = Math.min(Math.max(y, 0), height - 1);
                      const data = ctx.getImageData(px, py, 1, 1).data;
                      console.debug("[RasterDebug] sample", {
                        latitude,
                        longitude,
                        rect,
                        width,
                        height,
                        pixel: { x: px, y: py },
                        rgba: Array.from(data),
                        value,
                      });
                    };
                    image.onerror = (err) => {
                      console.debug("[RasterDebug] image load failed", err);
                    };
                    image.src = texture.imageUrl;
                  } else {
                    console.debug("[RasterDebug] missing texture", {
                      hasTexture: Boolean(texture),
                      width,
                      height,
                      rect,
                      hasImageUrl: typeof texture?.imageUrl === "string",
                    });
                  }
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
      effectiveViewMode, // Include effectiveViewMode in dependency array
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

    const applyMeshColorGain = useCallback(
      (mesh?: ReturnType<typeof buildRasterMesh>) => {
        if (!mesh) return mesh;
        const boost = (colors?: Uint8Array) => {
          if (!colors || colors.length < 4) return;
          for (let i = 0; i < colors.length; i += 4) {
            colors[i] = Math.min(
              255,
              Math.round(colors[i] * VERTEX_COLOR_GAIN),
            );
            colors[i + 1] = Math.min(
              255,
              Math.round(colors[i + 1] * VERTEX_COLOR_GAIN),
            );
            colors[i + 2] = Math.min(
              255,
              Math.round(colors[i + 2] * VERTEX_COLOR_GAIN),
            );
          }
        };

        if (mesh.tiles && mesh.tiles.length > 0) {
          mesh.tiles.forEach((tile) => boost(tile.colors));
        } else {
          boost(mesh.colors);
        }
        return mesh;
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

        if (effectiveViewMode === "ortho") {
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
        const visible = true;

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

            const filter = rasterBlurEnabled
              ? cesiumInstance.TextureMinificationFilter.LINEAR
              : cesiumInstance.TextureMinificationFilter.NEAREST;
            layer.minificationFilter = filter;
            layer.magnificationFilter = rasterBlurEnabled
              ? cesiumInstance.TextureMagnificationFilter.LINEAR
              : cesiumInstance.TextureMagnificationFilter.NEAREST;

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
      [
        animateLayerAlpha,
        cesiumInstance,
        rasterBlurEnabled,
        rasterOpacity,
        viewerReady,
        effectiveViewMode,
      ],
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

    const destroyViewer = useCallback(() => {
      if (!viewerRef.current || viewerRef.current.isDestroyed()) {
        return;
      }
      if (rasterLayerRef.current.length) {
        rasterLayerRef.current.forEach((layer) => {
          try {
            viewerRef.current.scene.imageryLayers.remove(layer, true);
          } catch (err) {
            console.warn("Failed to remove raster layer during cleanup", err);
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
      naturalEarthLineEntitiesRef.current = [];
      viewerRef.current.destroy();
      viewerRef.current = null;
      setViewerReady(false);
      initializingViewerRef.current = false;
    }, [
      cancelMeshFade,
      clearMarker,
      clearMeshCache,
      clearSearchMarker,
      setMeshVisibility,
    ]);

    useEffect(() => {
      if (!isProjection) return;
      destroyViewer();
      setIsLoading(false);
      setIsRasterImageryLoading(false);
    }, [destroyViewer, isProjection]);
    useEffect(() => {
      return () => {
        destroyViewer();
      };
    }, [destroyViewer]);

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

      const is2D = effectiveViewMode === "2d";

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
      viewer.scene.globe.show = effectiveViewMode !== "ortho";

      if (effectiveViewMode === "ortho") {
        viewer.scene.morphTo3D(0.0);
        updateOrthoFrustum();
        try {
          viewer.entities.removeAll();
        } catch (err) {
          console.warn("Failed to clear Cesium entities for ortho view", err);
        }
        boundaryEntitiesRef.current = [];
        geographicLineEntitiesRef.current = [];
        naturalEarthLineEntitiesRef.current = [];
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
      effectiveViewMode,
      cesiumInstance,
      enforceInfiniteScrollDisabled,
      updateOrthoFrustum,
    ]);

    useEffect(() => {
      if (!viewerReady || effectiveViewMode !== "ortho" || !viewerRef.current)
        return;
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
    }, [updateOrthoFrustum, viewerReady, effectiveViewMode]);

    // Add an effect to periodically enforce infinite scroll disabled in 2D mode
    useEffect(() => {
      const is2D = effectiveViewMode === "2d";
      if (!is2D || !viewerRef.current) return;

      // Set up an interval to periodically check and enforce the setting
      const intervalId = setInterval(() => {
        enforceInfiniteScrollDisabled(viewerRef.current);
      }, 1000); // Check every second

      return () => clearInterval(intervalId);
    }, [effectiveViewMode, enforceInfiniteScrollDisabled]);

    useEffect(() => {
      if (!viewerRef.current || !cesiumInstance || !viewerReady) return;
      if (effectiveViewMode !== "2d") return;
      const viewer = viewerRef.current;
      const current = viewer.camera?.positionCartographic;
      const height = current?.height ?? 20000000;
      const targetLon = pacificCentered ? 180 : 0;
      viewer.camera.setView({
        destination: cesiumInstance.Cartesian3.fromDegrees(
          targetLon,
          0,
          height,
        ),
      });
    }, [pacificCentered, effectiveViewMode, viewerReady, cesiumInstance]);

    useEffect(() => {
      if (!satelliteLayerRef.current) return;

      satelliteLayerRef.current.show =
        effectiveBaseMapMode === "satellite" && effectiveSatelliteVisible;
    }, [effectiveSatelliteVisible, effectiveBaseMapMode]);

    useEffect(() => {
      if (!streetLayerRef.current) return;
      streetLayerRef.current.show = effectiveBaseMapMode === "street";
    }, [effectiveBaseMapMode]);

    useEffect(() => {
      if (!streetOverlayLayerRef.current) return;
      const shouldShow =
        effectiveBaseMapMode === "street" && useMeshRasterActive;
      streetOverlayLayerRef.current.show = shouldShow;
    }, [effectiveBaseMapMode, useMeshRasterActive]);

    useEffect(() => {
      if (boundaryEntitiesRef.current.length === 0) return;

      boundaryEntitiesRef.current.forEach((entity) => {
        entity.show =
          effectiveViewMode === "ortho" ? false : boundaryLinesVisible;
      });
    }, [boundaryLinesVisible, effectiveViewMode]);

    useEffect(() => {
      if (geographicLineEntitiesRef.current.length === 0) return;

      geographicLineEntitiesRef.current.forEach((entity) => {
        entity.show =
          effectiveViewMode === "ortho" ? false : geographicLinesVisible;
      });
    }, [geographicLinesVisible, effectiveViewMode]);

    useEffect(() => {
      if (timeZoneLineEntitiesRef.current.length === 0) return;

      timeZoneLineEntitiesRef.current.forEach((entity) => {
        entity.show =
          effectiveViewMode === "ortho" ? false : timeZoneLinesVisible;
      });
    }, [timeZoneLinesVisible, effectiveViewMode]);

    useEffect(() => {
      if (naturalEarthLineEntitiesRef.current.length === 0) return;

      naturalEarthLineEntitiesRef.current.forEach((entity) => {
        entity.show =
          effectiveViewMode === "ortho"
            ? false
            : naturalEarthGeographicLinesVisible;
      });
    }, [naturalEarthGeographicLinesVisible, effectiveViewMode]);

    const updateAdminBoundaryVisibility = useCallback(() => {
      if (!viewerRef.current) return;
      if (effectiveViewMode === "ortho") {
        countryBoundaryEntitiesRef.current.forEach((entity) => {
          entity.show = false;
        });
        stateBoundaryEntitiesRef.current.forEach((entity) => {
          entity.show = false;
        });
        return;
      }

      const height = viewerRef.current.camera.positionCartographic.height;
      const zoomFloat = heightToTileZoomFloat(height);
      const tier = getLabelTier(zoomFloat);
      const showCountry =
        labelsVisible &&
        countryBoundaryResolution !== "none" &&
        tier.display.includes("country");
      const showState =
        labelsVisible &&
        stateBoundaryResolution !== "none" &&
        tier.display.includes("state");

      countryBoundaryEntitiesRef.current.forEach((entity) => {
        entity.show = showCountry;
      });
      stateBoundaryEntitiesRef.current.forEach((entity) => {
        entity.show = showState;
      });
    }, [
      countryBoundaryResolution,
      effectiveViewMode,
      labelsVisible,
      stateBoundaryResolution,
    ]);

    useEffect(() => {
      if (!viewerReady || !viewerRef.current || !cesiumInstance) return;
      const viewer = viewerRef.current;
      const handleCameraChange = () => {
        updateAdminBoundaryVisibility();
      };
      viewer.camera.changed.addEventListener(handleCameraChange);
      viewer.scene.preRender.addEventListener(handleCameraChange);
      updateAdminBoundaryVisibility();
      return () => {
        if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
        viewer.camera.changed.removeEventListener(handleCameraChange);
        viewer.scene.preRender.removeEventListener(handleCameraChange);
      };
    }, [cesiumInstance, updateAdminBoundaryVisibility, viewerReady]);

    useEffect(() => {
      if (!cesiumDebugRef.current) return;
      const interval = window.setInterval(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed?.()) return;
        const height = viewer.camera.positionCartographic.height;
        const tileZoom = heightToTileZoomFloat(height);
        if (cesiumDebugRef.current) {
          cesiumDebugRef.current.textContent = `height: ${Math.round(
            height,
          ).toLocaleString()}m | tileZoom: ${tileZoom.toFixed(2)}`;
        }
      }, 200);
      return () => {
        window.clearInterval(interval);
      };
    }, []);

    useEffect(() => {
      if (effectiveViewMode === "ortho") return;
      const resMap = { low: "110m", medium: "50m", high: "10m" } as const;
      const urls: string[] = [];
      if (countryBoundaryResolution !== "none") {
        const res = resMap[countryBoundaryResolution];
        urls.push(`/_countries/ne_${res}_admin_0_boundary_lines_land.geojson`);
      }
      if (stateBoundaryResolution !== "none") {
        const res = resMap[stateBoundaryResolution];
        urls.push(
          `/_countries/ne_${res}_admin_1_states_provinces_lines.geojson`,
        );
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
    }, [countryBoundaryResolution, effectiveViewMode, stateBoundaryResolution]);

    useEffect(() => {
      if (!viewerRef.current || !cesiumInstance) return;
      if (!viewerReady) return;
      if (effectiveViewMode === "ortho") return;

      const viewer = viewerRef.current;
      const removeEntities = (entities: any[]) => {
        if (!entities.length) return;
        entities.forEach((entity) => {
          try {
            viewer.entities.remove(entity);
          } catch (err) {
            console.warn("Failed to remove admin boundary entity", err);
          }
        });
      };

      const configKey = JSON.stringify({
        countryBoundaryResolution,
        stateBoundaryResolution,
        lineColors: lineColors ?? null,
      });
      const configChanged = adminBoundaryConfigRef.current !== configKey;
      if (configChanged) {
        adminBoundaryConfigRef.current = configKey;
        removeEntities(countryBoundaryEntitiesRef.current);
        removeEntities(stateBoundaryEntitiesRef.current);
        countryBoundaryEntitiesRef.current = [];
        stateBoundaryEntitiesRef.current = [];
      }

      const shouldLoad =
        countryBoundaryResolution !== "none" ||
        stateBoundaryResolution !== "none";

      if (!shouldLoad) {
        updateAdminBoundaryVisibility();
        return;
      }

      const boundaryColor =
        lineColors?.boundaryLines ?? lineColors?.coastlines ?? "#e2e8f0";

      const loadCountryBoundaries = async () => {
        if (countryBoundaryResolution === "none") return;
        if (countryBoundaryEntitiesRef.current.length) return;
        const resMap = { low: "110m", medium: "50m", high: "10m" } as const;
        const res = resMap[countryBoundaryResolution];
        const data = await fetchGeoJson(
          `/_countries/ne_${res}_admin_0_boundary_lines_land.geojson`,
        );
        if (!data) return;
        const entities = addGeoJsonLines(cesiumInstance, viewer, data, {
          color: boundaryColor,
          width: 1.6,
          height: 50,
        });
        countryBoundaryEntitiesRef.current = entities;
      };

      const loadStateBoundaries = async () => {
        if (stateBoundaryResolution === "none") return;
        if (stateBoundaryEntitiesRef.current.length) return;
        const resMap = { low: "110m", medium: "50m", high: "10m" } as const;
        const res = resMap[stateBoundaryResolution];
        const data = await fetchGeoJson(
          `/_countries/ne_${res}_admin_1_states_provinces_lines.geojson`,
        );
        if (!data) return;
        const entities = addGeoJsonLines(cesiumInstance, viewer, data, {
          color: boundaryColor,
          width: 1.0,
          dashed: true,
          dashLength: 14,
          height: 50,
        });
        stateBoundaryEntitiesRef.current = entities;
      };

      Promise.all([loadCountryBoundaries(), loadStateBoundaries()])
        .then(() => {
          updateAdminBoundaryVisibility();
          viewer.scene?.requestRender();
        })
        .catch((err) => {
          console.warn("Failed to load admin boundaries", err);
        });
    }, [
      cesiumInstance,
      countryBoundaryResolution,
      effectiveViewMode,
      lineColors,
      stateBoundaryResolution,
      updateAdminBoundaryVisibility,
      viewerReady,
    ]);

    useEffect(() => {
      if (!viewerRef.current || !cesiumInstance) return;
      if (!viewerReady) return;
      if (effectiveViewMode === "ortho") return;

      const viewer = viewerRef.current;
      const removeEntities = (entities: any[]) => {
        if (!entities.length) return;
        entities.forEach((entity) => {
          try {
            viewer.entities.remove(entity);
          } catch (err) {
            console.warn("Failed to remove boundary entity", err);
          }
        });
      };
      const configKey = JSON.stringify({
        coastlineResolution,
        riverResolution,
        lakeResolution,
        includeGeographic: naturalEarthGeographicLinesVisible,
        includeTimeZones: timeZoneLinesVisible,
        lineColors: lineColors ?? null,
      });
      const configChanged = boundaryConfigRef.current !== configKey;
      if (configChanged) {
        boundaryConfigRef.current = configKey;
        removeEntities(boundaryEntitiesRef.current);
        removeEntities(naturalEarthLineEntitiesRef.current);
        removeEntities(geographicLineEntitiesRef.current);
        removeEntities(timeZoneLineEntitiesRef.current);
        boundaryEntitiesRef.current = [];
        naturalEarthLineEntitiesRef.current = [];
        geographicLineEntitiesRef.current = [];
        timeZoneLineEntitiesRef.current = [];
      }

      if (!boundaryLinesVisible && boundaryEntitiesRef.current.length) {
        removeEntities(boundaryEntitiesRef.current);
        boundaryEntitiesRef.current = [];
      }
      if (!geographicLinesVisible && geographicLineEntitiesRef.current.length) {
        removeEntities(geographicLineEntitiesRef.current);
        geographicLineEntitiesRef.current = [];
      }
      if (!timeZoneLinesVisible && timeZoneLineEntitiesRef.current.length) {
        removeEntities(timeZoneLineEntitiesRef.current);
        timeZoneLineEntitiesRef.current = [];
      }
      if (
        !naturalEarthGeographicLinesVisible &&
        naturalEarthLineEntitiesRef.current.length
      ) {
        removeEntities(naturalEarthLineEntitiesRef.current);
        naturalEarthLineEntitiesRef.current = [];
      }

      const shouldLoad =
        boundaryLinesVisible ||
        naturalEarthGeographicLinesVisible ||
        geographicLinesVisible ||
        timeZoneLinesVisible;

      const needsReload =
        configChanged ||
        (boundaryEntitiesRef.current.length === 0 &&
          geographicLineEntitiesRef.current.length === 0 &&
          naturalEarthLineEntitiesRef.current.length === 0);

      if (needsReload && shouldLoad) {
        loadGeographicBoundaries({
          coastlineResolution,
          riverResolution,
          lakeResolution,
          includeGeographicLines: naturalEarthGeographicLinesVisible,
          includeBoundaries: boundaryLinesVisible,
          includeTimeZones: timeZoneLinesVisible,
        })
          .then((boundaryData) => {
            if (!viewerRef.current || !cesiumInstance) return;
            const {
              boundaryEntities,
              geographicLineEntities,
              timeZoneLineEntities,
              naturalEarthLineEntities,
            } = addGeographicBoundaries(
              cesiumInstance,
              viewerRef.current,
              boundaryData,
              lineColors,
              timeZoneLinesVisible,
            );
            boundaryEntitiesRef.current = boundaryEntities;
            geographicLineEntitiesRef.current = geographicLineEntities;
            timeZoneLineEntitiesRef.current = timeZoneLineEntities;
            naturalEarthLineEntitiesRef.current = naturalEarthLineEntities;
            const showBoundaries = boundaryLinesVisible;
            const showGeographic = geographicLinesVisible;
            boundaryEntitiesRef.current.forEach((entity) => {
              entity.show = showBoundaries;
            });
            geographicLineEntitiesRef.current.forEach((entity) => {
              entity.show = showGeographic;
            });
            timeZoneLineEntitiesRef.current.forEach((entity) => {
              entity.show = timeZoneLinesVisible;
            });
            naturalEarthLineEntitiesRef.current.forEach((entity) => {
              entity.show = naturalEarthGeographicLinesVisible;
            });
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
      timeZoneLineEntitiesRef.current.forEach((entity) => {
        entity.show = timeZoneLinesVisible;
      });
      naturalEarthLineEntitiesRef.current.forEach((entity) => {
        entity.show = naturalEarthGeographicLinesVisible;
      });
    }, [
      boundaryLinesVisible,
      geographicLinesVisible,
      timeZoneLinesVisible,
      naturalEarthGeographicLinesVisible,
      effectiveViewMode,
      cesiumInstance,
      viewerReady,
      coastlineResolution,
      riverResolution,
      lakeResolution,
      lineColors,
    ]);

    useEffect(() => {
      if (!viewerReady) {
        return;
      }

      if (forceMeshOnly) {
        viewerRef.current?.scene?.requestRender();
        return;
      }

      const imageryData = meshDerivedRaster ?? rasterState.data;
      const textureCount = imageryData?.textures?.length ?? 0;
      if (textureCount === 0) {
        viewerRef.current?.scene?.requestRender();
        return;
      }

      applyRasterLayers(imageryData);
    }, [
      applyRasterLayers,
      forceMeshOnly,
      meshDerivedRaster,
      rasterState.data,
      rasterState.requestKey,
      viewerReady,
    ]);

    useEffect(() => {
      if (!viewerReady || !viewerRef.current) return;
      const viewer = viewerRef.current;
      const imageryData = meshDerivedRaster ?? rasterState.data;
      const hasRasterTextures = Boolean(imageryData?.textures?.length);
      const shouldShowImagery =
        !forceMeshOnly && hasRasterTextures && effectiveViewMode !== "ortho";
      const rasterOverlayActive =
        effectiveViewMode !== "ortho" &&
        (useMeshRasterActive || forceMeshOnly || shouldShowImagery);

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

      if (viewer.scene.globe.showGroundAtmosphere === rasterOverlayActive) {
        viewer.scene.globe.showGroundAtmosphere = !rasterOverlayActive;
        viewer.scene.requestRender();
      }
    }, [
      viewerReady,
      meshDerivedRaster,
      rasterState.data,
      rasterState.requestKey,
      useMeshRasterActive,
      forceMeshOnly,
      effectiveViewMode,
    ]);

    useEffect(() => {
      if (effectiveViewMode !== "ortho") return;
      if (rasterMeshRef.current) {
        setMeshVisibility(rasterMeshRef.current, false);
      }
    }, [setMeshVisibility, effectiveViewMode]);

    useEffect(() => {
      if (!viewerReady || !viewerRef.current) return;

      const layers = rasterLayerRef.current;
      if (!layers.length) return;

      const visible = true;
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
      if (isProjection) {
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
      isProjection,
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
        if (!forceMeshOnly) {
          setMeshRasterActive(false);
        }
      }
    }, [
      rasterGridState.data,
      rasterGridState.dataKey,
      rasterGridState.requestKey,
      rasterState.data,
      setMeshRasterActive,
      useMeshRaster,
      useMeshRasterActive,
      forceMeshOnly,
    ]);

    useEffect(() => {
      if (forceImageryOnly) {
        clearRasterMesh();
        return;
      }
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
      const midIdx = Math.floor(grid.values.length / 2);
      const midSample = Number.isFinite(grid.values[midIdx])
        ? grid.values[midIdx]
        : null;
      console.debug("[RasterMesh] build", {
        datasetId: currentDataset?.id ?? null,
        min,
        max,
        flatShading: !rasterBlurEnabled,
        smoothValues: false,
        sampleStep: meshSamplingStep,
        midSample,
      });
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
      const meshMidIdx = Math.floor(mesh.colors.length / 2);
      const meshMid = mesh.colors.slice(meshMidIdx, meshMidIdx + 4);
      console.debug("[RasterMesh] colors", {
        datasetId: currentDataset?.id ?? null,
        meshColors: mesh.colors.length,
        meshMid: Array.from(meshMid),
        flatShading: !rasterBlurEnabled,
        opacity: effectiveOpacity,
      });
      applyMeshColorGain(mesh);
      const meshKey = rasterGridState.requestKey
        ? `${rasterGridState.requestKey}|blur:${rasterBlurEnabled ? 1 : 0}|grid:${meshSamplingStep}|op:${meshOpacityKey}`
        : undefined;
      applyRasterMesh(mesh, meshKey);
    }, [
      applyRasterMesh,
      applyMeshColorGain,
      clearRasterMesh,
      currentDataset?.colorScale?.colors,
      forceImageryOnly,
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
        applyMeshColorGain(mesh);
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
      applyMeshColorGain,
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
    const showInitialLoading = !isProjection && isLoading && !viewerReady;
    const showRasterLoading =
      !isProjection &&
      !isPlaying &&
      !isLoading &&
      viewerReady &&
      // OPTIMIZED: Only show loading if actually loading AND no data available
      ((useMeshRasterActive
        ? rasterGridState.isLoading && !rasterGridState.data
        : rasterState.isLoading && !rasterState.data) ||
        isRasterImageryLoading);

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
            display: isProjection ? "none" : "block",
          }}
        />
        <div
          ref={cesiumDebugRef}
          className="absolute bottom-3 left-3 z-10 rounded-lg px-2 py-1 text-xs"
          style={{
            background: "rgba(15, 23, 42, 0.7)",
            color: "#e2e8f0",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            pointerEvents: "none",
            display: isProjection || isOrtho ? "none" : "block",
          }}
        />

        {isOrtho && (
          <OrthoGlobe
            rasterData={rasterState.data}
            rasterGridData={
              useMeshRasterEffective ? rasterGridState.data : undefined
            }
            rasterOpacity={rasterOpacity}
            satelliteLayerVisible={effectiveSatelliteVisible}
            boundaryLinesVisible={boundaryLinesVisible}
            countryBoundaryResolution={countryBoundaryResolution}
            stateBoundaryResolution={stateBoundaryResolution}
            geographicLinesVisible={geographicLinesVisible}
            timeZoneLinesVisible={timeZoneLinesVisible}
            coastlineResolution={coastlineResolution}
            riverResolution={riverResolution}
            lakeResolution={lakeResolution}
            naturalEarthGeographicLinesVisible={
              naturalEarthGeographicLinesVisible
            }
            lineColors={lineColors}
            currentDataset={currentDataset}
            useMeshRaster={useMeshRasterEffective}
            labelsVisible={labelsVisible}
            rasterBlurEnabled={rasterBlurEnabled}
            smoothGridBoxValues={rasterBlurEnabled}
            hideZeroValues={shouldHideZero}
            normalMapMode={bumpMapMode}
            onRegionClick={onRegionClick}
            clearMarkerSignal={orthoClearMarkerTick}
          />
        )}

        {isProjection && projectionId && (
          <ProjectedGlobe
            key={projectionId}
            projectionId={projectionId}
            rasterGridData={rasterGridState.data}
            rasterGridKey={rasterGridState.requestKey}
            rasterGridDataKey={rasterGridState.dataKey}
            currentDataset={currentDataset}
            rasterOpacity={rasterOpacity}
            hideZeroValues={shouldHideZero}
            smoothGridBoxValues={rasterBlurEnabled}
            boundaryLinesVisible={boundaryLinesVisible}
            geographicLinesVisible={geographicLinesVisible}
            timeZoneLinesVisible={timeZoneLinesVisible}
            pacificCentered={pacificCentered}
            coastlineResolution={coastlineResolution}
            riverResolution={riverResolution}
            lakeResolution={lakeResolution}
            naturalEarthGeographicLinesVisible={
              naturalEarthGeographicLinesVisible
            }
            lineColors={lineColors}
            orientation={mapOrientations?.[projectionId]}
            onOrientationChange={(orientation) => {
              if (!onProjectionOrientationChange) return;
              onProjectionOrientationChange(projectionId, orientation);
            }}
            onRegionClick={onRegionClick}
            clearMarkerSignal={projectionClearMarkerTick}
          />
        )}
      </div>
    );
  },
);

CesiumGlobe.displayName = "CesiumGlobe";

export default CesiumGlobe;
