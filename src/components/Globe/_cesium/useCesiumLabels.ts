import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import {
  fetchOpenLayersTile,
  type LabelFeature,
  type LabelKind,
} from "@/lib/labels/openlayersVectorTiles";
import {
  estimateLabelSize,
  getLabelSpec,
  getLabelTier,
  heightToTileZoom,
  heightToTileZoomFloat,
  tileCenter,
} from "./labelUtils";
import { getTileKeysForView } from "./labelTiles";
import {
  LABEL_FADE_MS,
  LABEL_MIN_VISIBLE,
  LABEL_TILE_URL,
  LABEL_VISIBILITY_THROTTLE_MS,
} from "./constants";

type Params = {
  cesiumInstance: any;
  viewerRef: MutableRefObject<any>;
  effectiveLabelsVisible: boolean;
  effectiveViewMode: string;
  viewerReady: boolean;
};

export const useCesiumLabels = ({
  cesiumInstance,
  viewerRef,
  effectiveLabelsVisible,
  effectiveViewMode,
  viewerReady,
}: Params) => {
  const labelTileCacheRef = useRef<Map<string, any[]>>(new Map());
  const labelTilePendingRef = useRef<Set<string>>(new Set());
  const labelTileAbortRef = useRef<AbortController | null>(null);
  const labelUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const labelTileZoomRef = useRef<number | null>(null);
  const labelUpdateInFlightRef = useRef(false);
  const labelUpdateRequestedRef = useRef(false);
  const labelCameraHeightRef = useRef<number | null>(null);
  const labelCameraIdleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const labelRafRef = useRef<number | null>(null);
  const labelLastFrameRef = useRef<number>(0);
  const labelFadeLastRef = useRef<number>(0);

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
  }, [viewerRef]);

  const createLabelEntity = useCallback(
    (feature: LabelFeature) => {
      if (!viewerRef.current || !cesiumInstance) return null;
      const viewer = viewerRef.current;
      const Cesium = cesiumInstance;
      const spec = getLabelSpec(feature.kind);
      const baseFill = Cesium.Color.fromCssColorString(spec.color);
      const baseOutline = Cesium.Color.fromCssColorString(spec.outline);

      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(feature.lon, feature.lat, 0),
        show: false,
        label: {
          text: feature.name,
          font: spec.font,
          fillColor: baseFill.withAlpha(0),
          outlineColor: baseOutline.withAlpha(0),
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      entity.__labelKind = feature.kind;
      entity.__labelBaseFill = baseFill;
      entity.__labelBaseOutline = baseOutline;
      entity.__labelOpacity = 0;
      entity.__labelTargetOpacity = 0;
      return entity;
    },
    [cesiumInstance, viewerRef],
  );

  const setLabelOpacity = (entity: any, opacity: number) => {
    const clamped = Math.max(0, Math.min(1, opacity));
    entity.__labelOpacity = clamped;
    const baseFill = entity.__labelBaseFill;
    const baseOutline = entity.__labelBaseOutline;
    if (entity.label) {
      if (baseFill) {
        entity.label.fillColor = baseFill.withAlpha(clamped);
      }
      if (baseOutline) {
        entity.label.outlineColor = baseOutline.withAlpha(clamped);
      }
    }
  };

  const setLabelTarget = (entity: any, shouldShow: boolean) => {
    entity.__labelTargetOpacity = shouldShow ? 1 : 0;
    if (shouldShow) {
      entity.show = true;
    }
  };

  const updateLabelVisibility = useCallback(() => {
    if (!viewerRef.current || !cesiumInstance) return;
    if (!effectiveLabelsVisible) {
      labelTileCacheRef.current.forEach((entities) => {
        entities.forEach((entity) => {
          setLabelTarget(entity, false);
          setLabelOpacity(entity, 0);
          entity.show = false;
        });
      });
      viewerRef.current.scene?.requestRender();
      return;
    }
    if (effectiveViewMode === "ortho") {
      clearLabelTiles();
      return;
    }

    const viewer = viewerRef.current;
    const Cesium = cesiumInstance;
    const height = viewer.camera.positionCartographic.height;
    const zoom = Math.min(10, heightToTileZoom(height));
    const zoomFloat = heightToTileZoomFloat(height);
    const tier = getLabelTier(zoomFloat);
    const activeKinds = new Set<LabelKind>(tier.eligible);
    const tileInfo = getTileKeysForView({ Cesium, viewer, zoom });
    if (!tileInfo || !tileInfo.keys.length) {
      return;
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

    const activeKeys = new Set(tileKeys);
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

    const candidates: any[] = [];
    labelTileCacheRef.current.forEach((entities, key) => {
      if (!activeKeys.has(key)) {
        entities.forEach((entity) => setLabelTarget(entity, false));
        return;
      }
      const filtered = entities.filter((entity) => {
        const kind = entity?.__labelKind as LabelKind | undefined;
        if (!kind || !activeKinds.has(kind)) {
          setLabelTarget(entity, false);
          return false;
        }
        return true;
      });
      labelTileCacheRef.current.set(key, filtered);
      filtered.forEach((entity) => {
        candidates.push(entity);
      });
    });

    candidates.sort((a, b) => {
      const kindA = a?.__labelKind as LabelKind;
      const kindB = b?.__labelKind as LabelKind;
      return priority(kindA) - priority(kindB);
    });

    const eligibleByKind = new Map<LabelKind, number>();
    const screenPositions = new Map<any, { x: number; y: number }>();
    const occlusionPass = (entity: any) => {
      const kind = entity?.__labelKind as LabelKind | undefined;
      if (!kind || !activeKinds.has(kind)) return false;
      const position = entity?.position?.getValue(now);
      if (!position) return false;
      if (!occluder.isPointVisible(position)) return false;

      const vector = Cesium.Cartesian3.subtract(
        position,
        cameraPosition,
        new Cesium.Cartesian3(),
      );
      Cesium.Cartesian3.normalize(vector, vector);
      const centerDot = Cesium.Cartesian3.dot(vector, cameraDirection);
      if (centerDot < 0.15) return false;

      const screenPosition = Cesium.SceneTransforms.wgs84ToWindowCoordinates(
        scene,
        position,
      );
      if (!screenPosition) return false;
      if (
        screenPosition.x < 0 ||
        screenPosition.y < 0 ||
        screenPosition.x > canvas.clientWidth ||
        screenPosition.y > canvas.clientHeight
      ) {
        return false;
      }
      screenPositions.set(entity, screenPosition);
      eligibleByKind.set(kind, (eligibleByKind.get(kind) ?? 0) + 1);
      return true;
    };

    candidates.forEach((entity) => {
      occlusionPass(entity);
    });

    const hasEligible = (kinds: LabelKind[]) =>
      kinds.some((kind) => (eligibleByKind.get(kind) ?? 0) > 0);
    const displayKinds = hasEligible(tier.display)
      ? tier.display
      : hasEligible(tier.eligible)
        ? tier.eligible
        : tier.display;
    const visibleSet = new Set<any>();

    const placeCandidates = (kinds: LabelKind[]) => {
      let added = 0;
      candidates.forEach((entity) => {
        const kind = entity?.__labelKind as LabelKind | undefined;
        if (!kind || !kinds.includes(kind)) return;
        if (visibleSet.has(entity)) return;
        if (!screenPositions.has(entity) && !occlusionPass(entity)) return;
        const screenPosition = screenPositions.get(entity);
        if (!screenPosition) return;

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
        visibleSet.add(entity);
        setLabelTarget(entity, true);
        added += 1;
      });
      return added;
    };

    let shownCount = placeCandidates(displayKinds);
    if (shownCount < LABEL_MIN_VISIBLE) {
      const extraKinds = tier.eligible.filter(
        (kind) => !displayKinds.includes(kind),
      );
      if (extraKinds.length) {
        shownCount += placeCandidates(extraKinds);
      }
    }

    candidates.forEach((entity) => {
      if (!visibleSet.has(entity)) {
        setLabelTarget(entity, false);
      }
    });

    if (typeof globalThis !== "undefined") {
      const debugRegion = (globalThis as any).__labelDebugRegion === true;
      if (debugRegion) {
        const regionEntries: Array<{
          name: string;
          kind: LabelKind;
          lon: number;
          lat: number;
        }> = [];
        candidates.forEach((entity) => {
          const kind = entity?.__labelKind as LabelKind | undefined;
          const rawText = entity?.label?.text;
          const name =
            typeof rawText === "string" ? rawText : rawText?.getValue?.();
          if (!kind || !name) return;
          const position = entity?.position?.getValue(now);
          if (!position) return;
          const carto = Cesium.Cartographic.fromCartesian(position);
          const lon = Cesium.Math.toDegrees(carto.longitude);
          const lat = Cesium.Math.toDegrees(carto.latitude);
          if (lon >= 110 && lon <= 155 && lat >= -45 && lat <= -10) {
            regionEntries.push({ name: String(name), kind, lon, lat });
          }
        });
        (globalThis as any).__labelDebugRegionData = regionEntries;
      }
      (globalThis as any).__labelDebug = {
        zoom,
        zoomFloat: Number(zoomFloat.toFixed(2)),
        tiles: tileKeys.length,
        cachedTiles: labelTileCacheRef.current.size,
        candidates: candidates.length,
        shown: shownCount,
        displayKinds,
        eligibleKinds: tier.eligible,
      };
    }

    viewer.scene.requestRender();
  }, [
    cesiumInstance,
    clearLabelTiles,
    effectiveViewMode,
    effectiveLabelsVisible,
    viewerRef,
  ]);

  const updateLabelFades = useCallback(
    (now: number) => {
      const last = labelFadeLastRef.current || now;
      const dt = Math.min(1, (now - last) / LABEL_FADE_MS);
      let needsRender = false;
      labelTileCacheRef.current.forEach((entities) => {
        entities.forEach((entity) => {
          const target =
            typeof entity.__labelTargetOpacity === "number"
              ? entity.__labelTargetOpacity
              : entity.show
                ? 1
                : 0;
          const current =
            typeof entity.__labelOpacity === "number"
              ? entity.__labelOpacity
              : entity.show
                ? 1
                : 0;
          if (Math.abs(target - current) < 0.01) {
            if (target === 0 && current !== 0) {
              setLabelOpacity(entity, 0);
              entity.show = false;
              needsRender = true;
            }
            return;
          }
          const next = current + (target - current) * dt;
          setLabelOpacity(entity, next);
          if (target > 0) {
            entity.show = true;
          } else if (next <= 0.01) {
            entity.show = false;
          }
          needsRender = true;
        });
      });
      if (needsRender) {
        viewerRef.current?.scene?.requestRender();
      }
      labelFadeLastRef.current = now;
    },
    [viewerRef],
  );

  const updateLabelTiles = useCallback(async () => {
    if (!viewerRef.current || !cesiumInstance) return;
    if (labelUpdateInFlightRef.current) {
      labelUpdateRequestedRef.current = true;
      return;
    }
    labelUpdateInFlightRef.current = true;
    if (!effectiveLabelsVisible || effectiveViewMode === "ortho") {
      clearLabelTiles();
      labelUpdateInFlightRef.current = false;
      return;
    }

    const viewer = viewerRef.current;
    const height = viewer.camera.positionCartographic.height;
    const zoom = Math.min(10, heightToTileZoom(height));
    const zoomFloat = heightToTileZoomFloat(height);
    const tier = getLabelTier(zoomFloat);
    const activeKinds = new Set<LabelKind>(tier.eligible);
    const tileInfo = getTileKeysForView({
      Cesium: cesiumInstance,
      viewer,
      zoom,
    });
    if (!tileInfo || !tileInfo.keys.length) {
      labelUpdateInFlightRef.current = false;
      return;
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
            const filtered = features.filter((feature) =>
              activeKinds.has(feature.kind),
            );
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

    if (addedTiles) {
      updateLabelVisibility();
    }
    labelUpdateInFlightRef.current = false;

    if (labelUpdateRequestedRef.current) {
      labelUpdateRequestedRef.current = false;
      updateLabelTiles();
    }
  }, [
    cesiumInstance,
    clearLabelTiles,
    createLabelEntity,
    effectiveViewMode,
    effectiveLabelsVisible,
    updateLabelVisibility,
    viewerRef,
  ]);

  const scheduleLabelUpdate = useCallback(() => {
    if (labelUpdateTimeoutRef.current) {
      clearTimeout(labelUpdateTimeoutRef.current);
    }
    labelUpdateTimeoutRef.current = setTimeout(() => {
      updateLabelTiles();
    }, 120);
  }, [updateLabelTiles]);

  useEffect(() => {
    if (!viewerReady || !viewerRef.current || !cesiumInstance) return;
    const viewer = viewerRef.current;

    const handleCameraChange = () => {
      scheduleLabelUpdate();
      if (labelCameraIdleTimeoutRef.current) {
        clearTimeout(labelCameraIdleTimeoutRef.current);
      }
      labelCameraIdleTimeoutRef.current = setTimeout(() => {
        updateLabelTiles();
        updateLabelVisibility();
      }, 120);
    };

    const handlePreRender = () => {
      if (!viewerRef.current) return;
      const height = viewerRef.current.camera.positionCartographic.height;
      const lastHeight = labelCameraHeightRef.current;
      if (lastHeight === null || Math.abs(height - lastHeight) > 10) {
        labelCameraHeightRef.current = height;
        scheduleLabelUpdate();
      }
    };

    viewer.camera.changed.addEventListener(handleCameraChange);
    viewer.scene.preRender.addEventListener(handlePreRender);
    scheduleLabelUpdate();
    updateLabelTiles();
    updateLabelVisibility();

    return () => {
      if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
      viewerRef.current.camera.changed.removeEventListener(handleCameraChange);
      viewerRef.current.scene.preRender.removeEventListener(handlePreRender);
      if (labelCameraIdleTimeoutRef.current) {
        clearTimeout(labelCameraIdleTimeoutRef.current);
        labelCameraIdleTimeoutRef.current = null;
      }
      clearLabelTiles();
    };
  }, [
    cesiumInstance,
    viewerReady,
    scheduleLabelUpdate,
    clearLabelTiles,
    updateLabelTiles,
    updateLabelVisibility,
    viewerRef,
  ]);

  useEffect(() => {
    if (!viewerReady) return;
    if (effectiveLabelsVisible) {
      updateLabelTiles();
      updateLabelVisibility();
    } else {
      updateLabelVisibility();
    }
  }, [
    effectiveLabelsVisible,
    viewerReady,
    updateLabelTiles,
    updateLabelVisibility,
  ]);

  useEffect(() => {
    if (!viewerReady) return;
    const tick = (time: number) => {
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
  }, [viewerReady, updateLabelVisibility, updateLabelFades]);
};
