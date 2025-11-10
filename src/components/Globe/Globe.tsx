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

// Cesium setup function for CDN loading
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

// Load geographic boundary data
const loadGeographicBoundaries = async (): Promise<BoundaryDataset[]> => {
  const files: Array<{ name: string; kind: BoundaryDataset["kind"] }> = [
    { name: "ne_110m_coastline.json", kind: "boundary" },
    { name: "ne_110m_lakes.json", kind: "boundary" },
    { name: "ne_110m_rivers_lake_centerlines.json", kind: "boundary" },
  ];

  const boundaryData: BoundaryDataset[] = [];

  for (const file of files) {
    try {
      console.log(`Attempting to load: /_countries/${file.name}`);
      const response = await fetch(`/_countries/${file.name}`);
      console.log(`Response for ${file.name}:`, response.status, response.ok);
      if (response.ok) {
        const data = await response.json();
        console.log(
          `Successfully loaded ${file.name}, type:`,
          data.type,
          "features:",
          data.features?.length,
        );
        boundaryData.push({ name: file.name, kind: file.kind, data });
      } else {
        console.warn(
          `Failed to fetch ${file.name}: ${response.status} ${response.statusText}`,
        );
      }
    } catch (error) {
      console.error(`Error loading ${file.name}:`, error);
    }
  }

  console.log(`Total boundary files loaded: ${boundaryData.length}`);
  return boundaryData;
};

// Draw geographic boundaries on the globe - returns grouped entity arrays
const addGeographicBoundaries = (
  Cesium: any,
  viewer: any,
  boundaryData: BoundaryDataset[],
) => {
  const boundaryEntities: any[] = [];
  const geographicLineEntities: any[] = [];
  let totalLinesAdded = 0;

  boundaryData.forEach(({ name, kind, data }) => {
    console.log(`Processing ${name}, type: ${data.type}`);

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
      } else if (name.includes("time_zones")) {
        width = 1.5;
        color = Cesium.Color.fromCssColorString("#64748b").withAlpha(0.5);
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
            totalLinesAdded++;
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
          totalLinesAdded++;
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
        totalLinesAdded++;
      }
    } else {
      console.warn(`Unknown data format for ${name}:`, Object.keys(data));
    }
  });

  // Generate additional graticule lines (every 10 degrees) to ensure full grid
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
    totalLinesAdded++;
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
    totalLinesAdded++;
  };

  for (let lat = -80; lat <= 80; lat += 10) {
    addLatLine(lat);
  }

  for (let lon = -170; lon <= 170; lon += 10) {
    addLonLine(lon);
  }

  console.log(
    `Geographic boundaries added: ${totalLinesAdded} lines from ${boundaryData.length} files`,
  );

  return { boundaryEntities, geographicLineEntities };
};

const Globe = forwardRef<GlobeRef, GlobeProps>(
  (
    {
      currentDataset,
      onRegionClick,
      selectedDate,
      selectedLevel,
      // NEW: Globe settings props with defaults
      satelliteLayerVisible = true,
      boundaryLinesVisible = true,
      geographicLinesVisible = false,
      rasterOpacity = 0.65,
      hideZeroPrecipitation = false,
      onRasterMetadataChange,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<any>(null);
    const initializingViewerRef = useRef(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const currentMarkerRef = useRef<any>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [cesiumInstance, setCesiumInstance] = useState<any>(null);
    const [viewerReady, setViewerReady] = useState(false);
    const [isRasterTransitioning, setIsRasterTransitioning] = useState(false);

    // NEW: Layer references for visibility control
    const satelliteLayerRef = useRef<any>(null);
    const boundaryEntitiesRef = useRef<any[]>([]);
    const geographicLineEntitiesRef = useRef<any[]>([]);
    const rasterLayerRef = useRef<any[]>([]);

    const rasterDataRef = useRef<RasterLayerData | undefined>(undefined);
    const shouldHideZero = hideZeroPrecipitation;
    const rasterState = useRasterLayer({
      dataset: currentDataset,
      date: selectedDate,
      level: selectedLevel ?? null,
      maskZeroValues: shouldHideZero,
    });

    const clearMarker = () => {
      if (
        currentMarkerRef.current &&
        viewerRef.current &&
        !viewerRef.current.isDestroyed()
      ) {
        if (Array.isArray(currentMarkerRef.current)) {
          currentMarkerRef.current.forEach((marker) =>
            viewerRef.current.entities.remove(marker),
          );
        } else {
          viewerRef.current.entities.remove(currentMarkerRef.current);
        }
        currentMarkerRef.current = null;
      }
    };

    useImperativeHandle(ref, () => ({
      clearMarker,
    }));

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

      if (rasterState.isLoading) {
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
    ]);

    const calculateRadiusFromCameraHeight = (cameraHeight: number): number => {
      const referenceHeight = 10000000;
      const baseRadius = 65000;
      const scaleFactor = Math.sqrt(cameraHeight / referenceHeight);
      const minRadius = 8000;
      const maxRadius = 150000;
      const calculatedRadius = baseRadius * scaleFactor;
      return Math.max(minRadius, Math.min(maxRadius, calculatedRadius));
    };

    const addClickMarker = (
      Cesium: any,
      latitude: number,
      longitude: number,
    ) => {
      if (!viewerRef.current) return;

      clearMarker();

      const cameraHeight = viewerRef.current.camera.positionCartographic.height;
      const baseRadius = calculateRadiusFromCameraHeight(cameraHeight);

      const markers = [];
      const numRings = 8;
      const ringSpacing = baseRadius * 0.05;

      for (let i = 0; i < numRings; i++) {
        const radius = baseRadius - i * ringSpacing;
        if (radius <= 0) break;

        const circleEntity = viewerRef.current.entities.add({
          position: Cesium.Cartesian3.fromDegrees(
            longitude,
            latitude,
            1000 + i,
          ),
          ellipse: {
            semiMajorAxis: radius,
            semiMinorAxis: radius,
            material: Cesium.Color.TRANSPARENT,
            outline: true,
            outlineColor: Cesium.Color.LIME.withAlpha(0.9 - i * 0.1),
            outlineWidth: 3,
            height: 0,
            extrudedHeight: 0,
            zIndex: 9999,
          },
        });

        markers.push(circleEntity);
      }

      currentMarkerRef.current = markers;
      viewerRef.current.scene?.requestRender();
    };

    const updateMarkerRadius = (Cesium: any) => {
      if (!currentMarkerRef.current || !viewerRef.current) return;

      const cameraHeight = viewerRef.current.camera.positionCartographic.height;
      const baseRadius = calculateRadiusFromCameraHeight(cameraHeight);
      const ringSpacing = baseRadius * 0.05;

      if (Array.isArray(currentMarkerRef.current)) {
        currentMarkerRef.current.forEach((marker, i) => {
          const radius = baseRadius - i * ringSpacing;
          if (radius > 0) {
            marker.ellipse.semiMajorAxis = radius;
            marker.ellipse.semiMinorAxis = radius;
          }
        });
      }
    };

    // Initialize Cesium viewer
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

          console.log("Loading Cesium from CDN...");
          const Cesium = await loadCesiumFromCDN();
          setCesiumInstance(Cesium);

          console.log("Creating self-hosted Cesium viewer...");

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
          });

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

            // NEW: Store satellite layer reference
            satelliteLayerRef.current = baseLayer;
            console.log("Satellite base layer added and stored");
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

          console.log("Loading geographic boundaries...");
          const boundaryData = await loadGeographicBoundaries();

          // NEW: Store boundary entities
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

          console.log(
            `Stored ${boundaryEntities.length} boundary entities and ${geographicLineEntities.length} geographic grid entities`,
          );

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
                  const regionData: RegionData = {
                    name: `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`,
                    precipitation: rasterValue ?? Math.random() * 100,
                    temperature: -20 + Math.random() * 60,
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

          viewer.camera.changed.addEventListener(() => {
            if (window.Cesium) {
              updateMarkerRadius(window.Cesium);
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

          console.log("Self-hosted Cesium viewer initialized successfully");
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
    ]);

    // Cleanup
    const applyRasterLayers = useCallback(
      (layerData?: RasterLayerData) => {
        const viewer = viewerRef.current;
        if (!viewer || !cesiumInstance) {
          console.log(
            "[Globe] applyRasterLayers skipped - viewer or Cesium missing",
            {
              hasViewer: !!viewer,
              hasCesium: !!cesiumInstance,
              viewerReady,
            },
          );
          return;
        }

        if (rasterLayerRef.current.length) {
          rasterLayerRef.current.forEach((layer) => {
            try {
              viewer.scene.imageryLayers.remove(layer, true);
            } catch (err) {
              console.warn("Failed to remove raster layer", err);
            }
          });
          rasterLayerRef.current = [];
        }

        if (
          !layerData ||
          !layerData.textures ||
          layerData.textures.length === 0
        ) {
          console.log("[Globe] applyRasterLayers - no textures available");
          viewer.scene.requestRender();
          return;
        }

        console.log(
          "[Globe] applyRasterLayers - adding textures",
          layerData.textures.length,
        );
        console.log("Raster opacity:", rasterOpacity);

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
            layer.alpha = rasterOpacity;
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
            console.log(
              `Successfully added texture layer ${index} with opacity ${rasterOpacity}`,
            );
          } catch (err) {
            console.error(`Failed to add texture ${index}:`, err);
          }
        });

        rasterLayerRef.current = newLayers;
        console.log(
          `Successfully added ${newLayers.length} raster layers to globe`,
        );
        viewer.scene.requestRender();
      },
      [cesiumInstance, rasterOpacity, viewerReady],
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
          boundaryEntitiesRef.current = [];
          geographicLineEntitiesRef.current = [];
          viewerRef.current.destroy();
          viewerRef.current = null;
          setViewerReady(false);
          initializingViewerRef.current = false;
        }
      };
    }, []);

    useEffect(() => {
      if (rasterState.error) {
        console.warn("Raster pipeline error", rasterState.error);
      }
    }, [rasterState.error]);

    // NEW: Control satellite layer visibility
    useEffect(() => {
      if (!satelliteLayerRef.current) return;

      satelliteLayerRef.current.show = satelliteLayerVisible;
      console.log("Satellite layer visibility:", satelliteLayerVisible);
    }, [satelliteLayerVisible]);

    // NEW: Control boundary lines visibility
    useEffect(() => {
      if (boundaryEntitiesRef.current.length === 0) return;

      boundaryEntitiesRef.current.forEach((entity) => {
        entity.show = boundaryLinesVisible;
      });
      console.log("Boundary lines visibility:", boundaryLinesVisible);
    }, [boundaryLinesVisible]);

    // NEW: Control geographic grid visibility
    useEffect(() => {
      if (geographicLineEntitiesRef.current.length === 0) return;

      geographicLineEntitiesRef.current.forEach((entity) => {
        entity.show = geographicLinesVisible;
      });
      console.log("Geographic lines visibility:", geographicLinesVisible);
    }, [geographicLinesVisible]);

    // Raster texture rendering with viewer readiness guard
    useEffect(() => {
      if (!viewerReady) {
        console.log(
          "[Globe] applyRasterLayers skip - viewer not ready",
          rasterState.data?.textures?.length ?? 0,
        );
        return;
      }

      const textureCount = rasterState.data?.textures?.length ?? 0;
      if (textureCount === 0) {
        console.warn(
          "[Globe] No raster textures available for current dataset request",
          rasterState.requestKey,
        );
        viewerRef.current?.scene?.requestRender();
        return;
      }

      console.log("[Globe] applyRasterLayers trigger", {
        requestKey: rasterState.requestKey,
        textureCount,
      });
      applyRasterLayers(rasterState.data);
    }, [
      applyRasterLayers,
      rasterState.data,
      rasterState.requestKey,
      viewerReady,
    ]);

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
      console.log("[Globe] viewerReady effect re-applying raster");
      applyRasterLayers(rasterDataRef.current);
    }, [viewerReady, applyRasterLayers]);

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
        {isLoading && (
          <GlobeLoading
            message="Loading globe…"
            subtitle="Initializing Cesium and geographic boundaries"
          />
        )}

        {!isLoading && isRasterTransitioning && (
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
          <div className="absolute inset-x-0 top-4 z-30 mx-auto max-w-max">
            <button
              onClick={() => setIsModalOpen(true)}
              className="rounded-lg px-6 py-3 text-2xl font-semibold text-gray-300 transition hover:rounded-xl hover:bg-slate-800/50"
              title="Click for dataset details"
            >
              {currentDataset.name}
            </button>
          </div>
        )}

        {currentDataset && isModalOpen && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50">
            <div className="max-w-2xl rounded-lg bg-slate-800 p-6 text-white">
              <h2 className="mb-4 text-2xl font-bold">{currentDataset.name}</h2>
              <p className="mb-4">
                {currentDataset.description || "No description available"}
              </p>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded bg-blue-600 px-4 py-2 transition-colors hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    );
  },
);

Globe.displayName = "Globe";

export default Globe;
