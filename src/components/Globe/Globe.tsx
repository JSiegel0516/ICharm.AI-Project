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
import type { RasterLayerData } from "@/hooks/useRasterLayer";
import GlobeLoading from "./GlobeLoading";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
      rasterBlurEnabled = true,
      hideZeroPrecipitation = false,
      onRasterMetadataChange,
      isPlaying = false,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<any>(null);
    const initializingViewerRef = useRef(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const currentMarkerRef = useRef<any>(null);
    const searchMarkerRef = useRef<any>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [cesiumInstance, setCesiumInstance] = useState<any>(null);
    const [viewerReady, setViewerReady] = useState(false);
    const [isRasterTransitioning, setIsRasterTransitioning] = useState(false);
    const [isRasterImageryLoading, setIsRasterImageryLoading] = useState(false);

    const satelliteLayerRef = useRef<any>(null);
    const boundaryEntitiesRef = useRef<any[]>([]);
    const geographicLineEntitiesRef = useRef<any[]>([]);
    const rasterLayerRef = useRef<any[]>([]);
    const textureLoadIdRef = useRef(0);
    const isComponentUnmountedRef = useRef(false);
    const isUpdatingMarkerRef = useRef(false);

    const rasterDataRef = useRef<RasterLayerData | undefined>(undefined);
    const datasetName = (currentDataset?.name ?? "").toLowerCase();
    const datasetSupportsZeroMask =
      currentDataset?.dataType === "precipitation" ||
      datasetName.includes("cmorph");
    const shouldHideZero = datasetSupportsZeroMask && hideZeroPrecipitation;
    const rasterState = useRasterLayer({
      dataset: currentDataset,
      date: selectedDate,
      level: selectedLevel ?? null,
      maskZeroValues: shouldHideZero,
      colorbarRange,
    });

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
          const position = Cesium.Cartesian3.fromDegrees(
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

          const is2D =
            viewerRef.current?.scene?.mode === Cesium.SceneMode.SCENE2D;

          if (is2D) {
            const entity = viewerRef.current.entities.add({
              position: Cesium.Cartesian3.fromDegrees(longitude, latitude, 0),
              billboard: {
                image: "/images/selector.png",
                width: 28,
                height: 28,
                heightReference: Cesium.HeightReference.NONE,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });

            currentMarkerRef.current = entity;
          } else {
            const camera = viewerRef.current.camera;
            const canvas = viewerRef.current.scene.canvas;
            const fovy =
              camera.frustum && camera.frustum.fovy
                ? camera.frustum.fovy
                : Cesium.Math.toRadians(60);
            const cameraHeight =
              viewerRef.current.camera.positionCartographic.height;

            const metersPerPixel =
              (2 * Math.tan(fovy / 2) * cameraHeight) / canvas.height;

            const targetPixelSize = 28;
            const targetMeters = targetPixelSize * metersPerPixel;
            const radiusMeters = Math.max(10, targetMeters / 2);

            const geometry = new Cesium.EllipseGeometry({
              center: Cesium.Cartesian3.fromDegrees(longitude, latitude, 0),
              semiMajorAxis: radiusMeters,
              semiMinorAxis: radiusMeters,
              height: 0,
              vertexFormat: Cesium.EllipsoidSurfaceAppearance.VERTEX_FORMAT,
            });

            const primitive = new Cesium.GroundPrimitive({
              geometryInstances: new Cesium.GeometryInstance({
                geometry,
              }),
              appearance: new Cesium.EllipsoidSurfaceAppearance({
                material: Cesium.Material.fromType("Image", {
                  image: "/images/selector.png",
                }),
              }),
              classificationType: Cesium.ClassificationType.TERRAIN,
            });

            viewerRef.current.scene.primitives.add(primitive);

            currentMarkerRef.current = {
              primitive,
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
      [clearMarker],
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

    useEffect(() => {
      if (isLoading) {
        setIsRasterTransitioning(false);
        return;
      }

      if (rasterState.isLoading || isRasterImageryLoading) {
        setIsRasterTransitioning(true);
        return;
      }

      if (rasterState.error) {
        setIsRasterTransitioning(false);
        return;
      }

      const timer = window.setTimeout(() => {
        setIsRasterTransitioning(false);
      }, 150);

      return () => window.clearTimeout(timer);
    }, [
      isLoading,
      rasterState.isLoading,
      rasterState.error,
      rasterState.requestKey,
      isRasterImageryLoading,
    ]);

    // Helper function to enforce infinite scroll disabled state
    const enforceInfiniteScrollDisabled = useCallback((viewer: any) => {
      if (!viewer?.scene?.screenSpaceCameraController) return;

      const controller = viewer.scene.screenSpaceCameraController;

      // Force these settings
      controller.infiniteScroll = false;
      controller.inertiaSpin = 0;
      controller.inertiaTranslate = 0;
    }, []);

    useEffect(() => {
      if (
        !containerRef.current ||
        viewerRef.current ||
        initializingViewerRef.current
      )
        return;

      const initViewer = async () => {
        const container = containerRef.current;
        if (!container) return;

        try {
          initializingViewerRef.current = true;
          setIsLoading(true);
          setError(null);

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
            // Prevent wraparound and reduce drift in 2D mode.
            mapMode2D: Cesium.MapMode2D.SINGLE_TILE,
          });
          viewer.scene.globe.depthTestAgainstTerrain = true;
          viewer.screenSpaceEventHandler.removeInputAction(
            Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
          );

          // Disable infinite horizontal scroll in 2D mode to reduce lag.
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

          const { boundaryEntities, geographicLineEntities } =
            addGeographicBoundaries(Cesium, viewer, boundaryData);
          boundaryEntitiesRef.current = boundaryEntities;
          geographicLineEntitiesRef.current = geographicLineEntities;

          boundaryEntitiesRef.current.forEach((entity) => {
            entity.show = boundaryLinesVisible;
          });
          geographicLineEntitiesRef.current.forEach((entity) => {
            entity.show = geographicLinesVisible;
          });

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
                    name: `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`,
                    precipitation: looksTemperature ? undefined : value,
                    temperature: looksTemperature ? value : undefined,
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
          setIsLoading(false);
          setViewerReady(true);
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

        Promise.all(
          layerData.textures.map(
            (texture) =>
              new Promise<void>((resolve) => {
                const image = new Image();
                image.crossOrigin = "anonymous";
                image.onload = () => resolve();
                image.onerror = () => resolve();
                image.src = texture.imageUrl;
              }),
          ),
        ).finally(() => {
          if (
            textureLoadIdRef.current === loadId &&
            !isComponentUnmountedRef.current
          ) {
            setIsRasterImageryLoading(false);
          }
        });

        const newLayers: any[] = [];

        layerData.textures.forEach((texture, index) => {
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

            layer.minificationFilter = rasterBlurEnabled
              ? cesiumInstance.TextureMinificationFilter.LINEAR
              : cesiumInstance.TextureMinificationFilter.NEAREST;
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
        const fadeDuration = 320;

        animateLayerAlpha(newLayers, 0, rasterOpacity, fadeDuration, () => {
          newLayers.forEach((layer) => {
            layer.alpha = rasterOpacity;
          });
        });

        if (previousLayers.length) {
          animateLayerAlpha(previousLayers, startAlpha, 0, fadeDuration, () => {
            previousLayers.forEach((layer) => {
              try {
                viewer.scene.imageryLayers.remove(layer, true);
              } catch (err) {
                console.warn("Failed to remove raster layer", err);
              }
            });
          });
        }

        viewer.scene.requestRender();
      },
      [
        animateLayerAlpha,
        cesiumInstance,
        rasterOpacity,
        rasterBlurEnabled,
        viewerReady,
      ],
    );

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
    }, [clearMarker, clearSearchMarker]);

    useEffect(() => {
      if (rasterState.error) {
        console.warn("Raster pipeline error", rasterState.error);
      }
    }, [rasterState.error]);

    const applyViewMode = useCallback(() => {
      if (!viewerRef.current || !cesiumInstance) return;
      const viewer = viewerRef.current;
      const Cesium = cesiumInstance;

      if (viewMode === "2d") {
        viewer.scene.morphTo2D(0.0);
        viewer.scene.globe.show = true;

        // Enforce infinite scroll disabled in 2D mode
        enforceInfiniteScrollDisabled(viewer);

        viewer.scene.requestRender();
        // Ensure camera frames the whole world in 2D
        viewer.camera.setView({
          destination: Cesium.Rectangle.fromDegrees(-180.0, -90.0, 180.0, 90.0),
        });
        return;
      }

      viewer.scene.morphTo3D(0.0);
      viewer.scene.globe.show = true;

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
    }, [viewMode, cesiumInstance, enforceInfiniteScrollDisabled]);

    // Add an effect to periodically enforce infinite scroll disabled in 2D mode
    useEffect(() => {
      if (viewMode !== "2d" || !viewerRef.current) return;

      // Set up an interval to periodically check and enforce the setting
      const intervalId = setInterval(() => {
        enforceInfiniteScrollDisabled(viewerRef.current);
      }, 1000); // Check every second

      return () => clearInterval(intervalId);
    }, [viewMode, enforceInfiniteScrollDisabled]);

    useEffect(() => {
      if (!satelliteLayerRef.current) return;

      satelliteLayerRef.current.show = satelliteLayerVisible;
    }, [satelliteLayerVisible]);

    useEffect(() => {
      if (boundaryEntitiesRef.current.length === 0) return;

      boundaryEntitiesRef.current.forEach((entity) => {
        entity.show = boundaryLinesVisible;
      });
    }, [boundaryLinesVisible]);

    useEffect(() => {
      if (geographicLineEntitiesRef.current.length === 0) return;

      geographicLineEntitiesRef.current.forEach((entity) => {
        entity.show = geographicLinesVisible;
      });
    }, [geographicLinesVisible]);

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
      if (!viewerReady) return;
      applyViewMode();
    }, [viewerReady, applyViewMode]);

    useEffect(() => {
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
    }, [rasterState.data, onRasterMetadataChange]);

    useEffect(() => {
      if (!viewerReady) return;
      if (!rasterDataRef.current) return;
      applyRasterLayers(rasterDataRef.current);
    }, [viewerReady, applyRasterLayers]);

    const showInitialLoading = isLoading;
    const showRasterTransitionLoading =
      !isLoading && isRasterTransitioning && !isPlaying;

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

        {showRasterTransitionLoading && (
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

        {currentDataset && (
          <Dialog>
            <DialogTrigger asChild>
              <div className="absolute inset-x-0 top-6 z-30 mx-auto max-w-max">
                <Button
                  variant="ghost"
                  title="Click for dataset details"
                  id="dataset-title"
                  className="text-3xl font-semibold"
                  onClick={() => setIsModalOpen(true)}
                >
                  {currentDataset.name}
                </Button>
              </div>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[625px]">
              <DialogHeader>
                <DialogTitle className="mb-2 text-2xl font-semibold">
                  {currentDataset.name}
                </DialogTitle>
                <DialogDescription className="text-lg">
                  <span className="text-xl">{currentDataset.description}</span>
                  <br />
                  <br />
                  <span>
                    Date Range:{" "}
                    {currentDataset?.startDate && currentDataset?.endDate
                      ? `${new Date(
                          currentDataset.startDate,
                        ).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "numeric",
                          day: "numeric",
                        })} - ${new Date(
                          currentDataset.endDate,
                        ).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "numeric",
                          day: "numeric",
                        })}`
                      : "Date information not available"}
                  </span>
                  <br />
                  <span>Units: {currentDataset.units} </span>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Close</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  },
);

Globe.displayName = "Globe";

export default Globe;
