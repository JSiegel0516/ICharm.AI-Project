import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import type { NEDataType, NEResolution } from "@/utils/naturalEarthLoader";
import { getCachedNaturalEarthData } from "@/utils/naturalEarthCache";
import { LineGeometryProcessor } from "@/utils/lineGeometryProcessor";

type LineSettings = {
  visible: boolean;
  coastline: NEResolution;
  rivers: NEResolution;
  lakes: NEResolution;
  geographic: boolean;
  radius: number;
  colors?: Partial<Record<NEDataType, string>>;
};

const debounceDelayMs = 200;

export const useGlobeLines = (
  root: THREE.Object3D | null,
  settings: LineSettings,
  onUpdate?: () => void,
) => {
  const lineGroupsRef = useRef<Map<NEDataType, THREE.LineSegments>>(new Map());
  const debounceTimersRef = useRef<Map<NEDataType, number>>(new Map());

  const clearLine = useCallback(
    (type: NEDataType) => {
      const existing = lineGroupsRef.current.get(type);
      if (!existing || !root) return;
      root.remove(existing);
      existing.geometry.dispose();
      if (Array.isArray(existing.material)) {
        existing.material.forEach((material) => material.dispose());
      } else {
        existing.material.dispose();
      }
      lineGroupsRef.current.delete(type);
      onUpdate?.();
    },
    [onUpdate, root],
  );

  const updateLines = useCallback(
    async (type: NEDataType, resolution: NEResolution) => {
      if (!root) return;

      clearLine(type);

      if (!settings.visible || resolution === "none") return;

      const data = await getCachedNaturalEarthData(type, resolution);
      if (!data) return;

      const segments = LineGeometryProcessor.processNEData(
        data,
        type,
        settings.radius,
        settings.colors?.[type],
      );
      if (!segments.length) return;

      const lineGeometry = LineGeometryProcessor.createLineGeometry(segments);
      lineGeometry.renderOrder = 10;
      lineGeometry.frustumCulled = false;
      root.add(lineGeometry);
      lineGroupsRef.current.set(type, lineGeometry);
      onUpdate?.();
    },
    [
      clearLine,
      onUpdate,
      root,
      settings.radius,
      settings.visible,
      settings.colors,
    ],
  );

  const scheduleUpdate = useCallback(
    (type: NEDataType, resolution: NEResolution) => {
      const timers = debounceTimersRef.current;
      const existing = timers.get(type);
      if (existing) {
        window.clearTimeout(existing);
      }
      const id = window.setTimeout(() => {
        timers.delete(type);
        updateLines(type, resolution);
      }, debounceDelayMs);
      timers.set(type, id);
    },
    [updateLines],
  );

  useEffect(() => {
    if (!root) return;
    scheduleUpdate("coastlines", settings.coastline);
    return () => {
      clearLine("coastlines");
    };
  }, [
    root,
    settings.coastline,
    settings.colors?.coastlines,
    scheduleUpdate,
    clearLine,
  ]);

  useEffect(() => {
    if (!root) return;
    scheduleUpdate("rivers", settings.rivers);
    return () => {
      clearLine("rivers");
    };
  }, [
    root,
    settings.rivers,
    settings.colors?.rivers,
    scheduleUpdate,
    clearLine,
  ]);

  useEffect(() => {
    if (!root) return;
    scheduleUpdate("lakes", settings.lakes);
    return () => {
      clearLine("lakes");
    };
  }, [root, settings.lakes, settings.colors?.lakes, scheduleUpdate, clearLine]);

  useEffect(() => {
    if (!root) return;
    const resolution = settings.geographic ? "low" : "none";
    scheduleUpdate("geographic", resolution);
    return () => {
      clearLine("geographic");
    };
  }, [
    root,
    settings.geographic,
    settings.colors?.geographic,
    scheduleUpdate,
    clearLine,
  ]);

  useEffect(() => {
    return () => {
      debounceTimersRef.current.forEach((timer) => {
        window.clearTimeout(timer);
      });
      debounceTimersRef.current.clear();
      lineGroupsRef.current.forEach((line) => {
        root?.remove(line);
        line.geometry.dispose();
        if (Array.isArray(line.material)) {
          line.material.forEach((material) => material.dispose());
        } else {
          line.material.dispose();
        }
      });
      lineGroupsRef.current.clear();
      onUpdate?.();
    };
  }, [onUpdate, root]);
};
