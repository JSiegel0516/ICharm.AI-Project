import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Dataset, RegionData } from "@/types";
import type { RasterLayerData } from "@/hooks/useRasterLayer";
import type { RasterGridData } from "@/hooks/useRasterGrid";
import { buildColorStops, mapValueToRgba } from "@/lib/mesh/colorMapping";

type Props = {
  rasterData?: RasterLayerData;
  rasterGridData?: RasterGridData;
  rasterOpacity: number;
  satelliteLayerVisible: boolean;
  boundaryLinesVisible: boolean;
  geographicLinesVisible: boolean;
  currentDataset?: Dataset;
  useMeshRaster: boolean;
  rasterBlurEnabled: boolean;
  minZoom?: number;
  maxZoom?: number;
  clearMarkerSignal?: number;
  onRegionClick?: (lat: number, lon: number, data: RegionData) => void;
};

const BASE_TEXTURE_URL = "/images/world_imagery_arcgis.png";
const BASE_RADIUS = 1;
const OVERLAY_RADIUS = 1.005;
const DEFAULT_MIN_ZOOM = 0.2;
const DEFAULT_MAX_ZOOM = 20.0;
const MESH_TO_RASTER_ZOOM = 1.35;
const RASTER_TO_MESH_ZOOM = 1.2;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

type GeoPoint = { lon: number; lat: number };
type BoundaryVector = {
  id: string;
  coordinates: GeoPoint[];
  kind: "boundary";
};

const boundaryFiles = [
  { name: "ne_110m_coastline.json", kind: "boundary" as const },
  { name: "ne_110m_lakes.json", kind: "boundary" as const },
  { name: "ne_110m_rivers_lake_centerlines.json", kind: "boundary" as const },
];

const splitAtDateline = (coords: GeoPoint[]) => {
  const parts: GeoPoint[][] = [];
  let current: GeoPoint[] = [];
  const maxGeoJumpLon = 30;
  const maxGeoJumpLat = 20;
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

const fetchBoundaries = async (): Promise<BoundaryVector[]> => {
  const results: BoundaryVector[] = [];

  for (const file of boundaryFiles) {
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
    } catch {
      // ignore boundary load errors
    }
  }

  return results;
};

const OrthoGlobe: React.FC<Props> = ({
  rasterData,
  rasterGridData,
  rasterOpacity,
  satelliteLayerVisible,
  boundaryLinesVisible,
  geographicLinesVisible,
  currentDataset,
  useMeshRaster,
  rasterBlurEnabled,
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
  const meshOverlayRef = useRef<THREE.Mesh | null>(null);
  const rasterOverlayRef = useRef<THREE.Mesh | null>(null);
  const boundaryOverlayRef = useRef<THREE.Mesh | null>(null);
  const markerRef = useRef<THREE.Mesh | null>(null);
  const skyboxTextureRef = useRef<THREE.CubeTexture | null>(null);
  const gridTextureRef = useRef<THREE.Texture | null>(null);
  const rasterTextureRef = useRef<THREE.Texture | null>(null);
  const boundaryTextureRef = useRef<THREE.Texture | null>(null);
  const markerBaseScaleRef = useRef(1);
  const markerBaseZoomRef = useRef(1);
  const zoomRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const useMeshRasterRef = useRef(useMeshRaster);
  const useMeshRasterActiveRef = useRef(useMeshRaster);
  const [useMeshRasterActive, setUseMeshRasterActive] = useState(useMeshRaster);
  const [vectors, setVectors] = useState<BoundaryVector[]>([]);

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
      meshOverlayRef.current.visible =
        useMeshRasterActiveRef.current && Boolean(gridTextureRef.current);
    }
    if (rasterOverlayRef.current) {
      rasterOverlayRef.current.visible =
        !useMeshRasterActiveRef.current && Boolean(rasterTextureRef.current);
    }
    requestRender();
  }, [requestRender]);

  const updateRasterOpacity = useCallback(() => {
    const opacity = clamp(rasterOpacity, 0, 1);
    if (meshOverlayRef.current) {
      const material = meshOverlayRef.current
        .material as THREE.MeshBasicMaterial;
      material.opacity = opacity;
    }
    if (rasterOverlayRef.current) {
      const material = rasterOverlayRef.current
        .material as THREE.MeshBasicMaterial;
      material.opacity = opacity;
    }
    requestRender();
  }, [rasterOpacity, requestRender]);

  const updateSatelliteVisibility = useCallback(() => {
    if (!baseMeshRef.current) return;
    const material = baseMeshRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = satelliteLayerVisible ? 1 : 0;
    material.transparent = !satelliteLayerVisible;
    requestRender();
  }, [satelliteLayerVisible, requestRender]);

  const updateMeshRasterActive = useCallback((zoom: number) => {
    if (!useMeshRasterRef.current) return;
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
        const rgba =
          value == null || Number.isNaN(value)
            ? [0, 0, 0, 0]
            : mapValueToRgba(value, min, max, stops);
        imageData.data[destIdx] = rgba[0];
        imageData.data[destIdx + 1] = rgba[1];
        imageData.data[destIdx + 2] = rgba[2];
        imageData.data[destIdx + 3] = rgba[3];
      }
    }
    context.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = rasterBlurEnabled
      ? THREE.LinearFilter
      : THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
  }, [currentDataset?.colorScale?.colors, rasterBlurEnabled, rasterGridData]);

  const loadRasterTexture = useCallback((url: string) => {
    const loader = new THREE.TextureLoader();
    return new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearMipMapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          resolve(texture);
        },
        undefined,
        reject,
      );
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
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
    scene.add(group);

    const geometry = new THREE.SphereGeometry(BASE_RADIUS, 96, 64);
    const baseMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: satelliteLayerVisible ? 1 : 0,
    });
    const baseMesh = new THREE.Mesh(geometry, baseMaterial);
    baseMeshRef.current = baseMesh;
    group.add(baseMesh);

    const overlayGeometry = new THREE.SphereGeometry(OVERLAY_RADIUS, 96, 64);
    const meshMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: rasterOpacity,
      depthWrite: false,
    });
    const meshOverlay = new THREE.Mesh(overlayGeometry, meshMaterial);
    meshOverlayRef.current = meshOverlay;
    group.add(meshOverlay);

    const rasterMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: rasterOpacity,
      depthWrite: false,
    });
    const rasterOverlay = new THREE.Mesh(overlayGeometry, rasterMaterial);
    rasterOverlayRef.current = rasterOverlay;
    group.add(rasterOverlay);

    const boundaryMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const boundaryOverlay = new THREE.Mesh(overlayGeometry, boundaryMaterial);
    boundaryOverlayRef.current = boundaryOverlay;
    group.add(boundaryOverlay);

    const loader = new THREE.TextureLoader();
    loader.load(BASE_TEXTURE_URL, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      baseMaterial.map = texture;
      baseMaterial.needsUpdate = true;
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
      if (boundaryTextureRef.current) boundaryTextureRef.current.dispose();
      if (skyboxTextureRef.current) skyboxTextureRef.current.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      globeGroupRef.current = null;
      baseMeshRef.current = null;
      meshOverlayRef.current = null;
      rasterOverlayRef.current = null;
      boundaryOverlayRef.current = null;
      markerRef.current = null;
    };
  }, [rasterOpacity, requestRender, satelliteLayerVisible, updateCamera]);

  useEffect(() => {
    updateSatelliteVisibility();
  }, [updateSatelliteVisibility]);

  useEffect(() => {
    let mounted = true;
    fetchBoundaries().then((res) => {
      if (mounted) setVectors(res);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!boundaryOverlayRef.current) return;
    if (!vectors.length || !boundaryLinesVisible) {
      const material = boundaryOverlayRef.current
        .material as THREE.MeshBasicMaterial;
      material.map = null;
      material.needsUpdate = true;
      requestRender();
      return;
    }

    const width = 2048;
    const height = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 2.0;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.9;

    const toPixel = (lon: number, lat: number) => ({
      x: ((lon + 180) / 360) * width,
      y: ((90 - lat) / 180) * height,
    });

    const drawPath = (segment: GeoPoint[]) => {
      if (segment.length < 2) return;
      ctx.beginPath();
      segment.forEach((point, index) => {
        const px = toPixel(point.lon, point.lat);
        if (index === 0) {
          ctx.moveTo(px.x, px.y);
        } else {
          ctx.lineTo(px.x, px.y);
        }
      });
      ctx.stroke();
    };

    vectors.forEach((vec) => {
      splitAtDateline(vec.coordinates).forEach((segment) => {
        drawPath(segment);
      });
    });

    // Fill tiny gaps by tracing again with a softer pass.
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2.8;
    vectors.forEach((vec) => {
      splitAtDateline(vec.coordinates).forEach((segment) => {
        drawPath(segment);
      });
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    if (boundaryTextureRef.current) boundaryTextureRef.current.dispose();
    boundaryTextureRef.current = texture;

    const material = boundaryOverlayRef.current
      .material as THREE.MeshBasicMaterial;
    material.map = texture;
    material.needsUpdate = true;
    requestRender();
  }, [boundaryLinesVisible, requestRender, vectors]);

  useEffect(() => {
    updateRasterOpacity();
  }, [updateRasterOpacity]);

  useEffect(() => {
    if (!meshOverlayRef.current) return;
    const texture = buildGridTexture();
    if (!texture) {
      if (gridTextureRef.current) {
        gridTextureRef.current.dispose();
        gridTextureRef.current = null;
      }
      const material = meshOverlayRef.current
        .material as THREE.MeshBasicMaterial;
      material.map = null;
      material.needsUpdate = true;
      updateMeshVisibility();
      return;
    }
    if (gridTextureRef.current) gridTextureRef.current.dispose();
    gridTextureRef.current = texture;
    const material = meshOverlayRef.current.material as THREE.MeshBasicMaterial;
    material.map = texture;
    material.needsUpdate = true;
    updateMeshVisibility();
  }, [buildGridTexture, updateMeshVisibility]);

  useEffect(() => {
    if (!rasterOverlayRef.current) return;
    if (!rasterData?.textures?.length) {
      if (rasterTextureRef.current) {
        rasterTextureRef.current.dispose();
        rasterTextureRef.current = null;
      }
      const material = rasterOverlayRef.current
        .material as THREE.MeshBasicMaterial;
      material.map = null;
      material.needsUpdate = true;
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
        const material = rasterOverlayRef.current
          ?.material as THREE.MeshBasicMaterial;
        material.map = texture;
        material.needsUpdate = true;
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
    if (!containerRef.current) return;
    const container = containerRef.current;
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;
    let rotX = 0;
    let rotY = 0;

    const handlePointerDown = (event: PointerEvent) => {
      isDragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      if (globeGroupRef.current) {
        rotX = globeGroupRef.current.rotation.x;
        rotY = globeGroupRef.current.rotation.y;
      }
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging || !globeGroupRef.current) return;
      const deltaX = event.clientX - lastX;
      const deltaY = event.clientY - lastY;
      const nextY = rotY + deltaX * 0.005;
      const nextX = clamp(rotX + deltaY * 0.005, -1.2, 1.2);
      globeGroupRef.current.rotation.y = nextY;
      globeGroupRef.current.rotation.x = nextX;
      updateMarkerVisibility();
      updateMarkerScale();
      requestRender();
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
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
