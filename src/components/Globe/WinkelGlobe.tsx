import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  Dataset,
  GlobeLineResolution,
  LineColorSettings,
  WinkelOrientation,
} from "@/types";
import type { RasterGridData } from "@/hooks/useRasterGrid";
import { WinkelProjection } from "./WinkelProjection";
import {
  WinkelBoundaries,
  loadNaturalEarthBoundaries,
  type BoundaryDataset,
} from "./WinkelBoundaries";
import { WinkelOverlay } from "./WinkelOverlay";

const MIN_SCALE = 100;
const MAX_SCALE = 2000;
const MIN_SCALE_FOR_OVERLAY = 350;

type Props = {
  rasterGridData?: RasterGridData;
  currentDataset?: Dataset;
  rasterOpacity?: number;
  hideZeroValues: boolean;
  smoothGridBoxValues: boolean;
  boundaryLinesVisible: boolean;
  geographicLinesVisible: boolean;
  coastlineResolution?: GlobeLineResolution;
  riverResolution?: GlobeLineResolution;
  lakeResolution?: GlobeLineResolution;
  naturalEarthGeographicLinesVisible?: boolean;
  lineColors?: LineColorSettings;
  orientation?: WinkelOrientation;
  onOrientationChange?: (orientation: WinkelOrientation) => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const orientationsEqual = (a?: WinkelOrientation, b?: WinkelOrientation) => {
  if (!a || !b) return false;
  return (
    Math.abs(a.scale - b.scale) < 0.001 &&
    a.rotate.length === b.rotate.length &&
    a.rotate.every((value, idx) => Math.abs(value - b.rotate[idx]) < 0.001)
  );
};

const WinkelGlobe: React.FC<Props> = ({
  rasterGridData,
  currentDataset,
  rasterOpacity = 1,
  hideZeroValues,
  smoothGridBoxValues,
  boundaryLinesVisible,
  geographicLinesVisible,
  coastlineResolution = "low",
  riverResolution = "none",
  lakeResolution = "none",
  naturalEarthGeographicLinesVisible = false,
  lineColors,
  orientation,
  onOrientationChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const projectionRef = useRef<WinkelProjection | null>(null);
  const boundariesRef = useRef<WinkelBoundaries | null>(null);
  const overlayRef = useRef<WinkelOverlay | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const draggingRef = useRef(false);
  const dragStartRef = useRef<[number, number] | null>(null);
  const lastPointerRef = useRef<[number, number] | null>(null);
  const lastMoveTimeRef = useRef<number | null>(null);
  const velocityRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const inertiaFrameRef = useRef<number | null>(null);
  const scaleRef = useRef<number>(0);
  const hasInteractedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const interactionRafRef = useRef<number | null>(null);
  const orientationTimeoutRef = useRef<number | null>(null);
  const lastAppliedOrientationRef = useRef<WinkelOrientation | null>(null);

  const [boundaryData, setBoundaryData] = useState<BoundaryDataset[]>([]);
  const effectiveOrientation = useMemo(() => {
    if (!orientation) return undefined;
    if (
      typeof orientation.baseScale !== "number" ||
      !Number.isFinite(orientation.baseScale) ||
      orientation.baseScale <= 0
    ) {
      return undefined;
    }
    return orientation;
  }, [orientation]);

  const boundaryConfigKey = useMemo(
    () =>
      `${boundaryLinesVisible}-${coastlineResolution}-${riverResolution}-${lakeResolution}-${naturalEarthGeographicLinesVisible}`,
    [
      boundaryLinesVisible,
      coastlineResolution,
      riverResolution,
      lakeResolution,
      naturalEarthGeographicLinesVisible,
    ],
  );

  useEffect(() => {
    let active = true;
    if (!boundaryLinesVisible && !naturalEarthGeographicLinesVisible) {
      setBoundaryData([]);
      return;
    }
    loadNaturalEarthBoundaries({
      coastlineResolution: coastlineResolution ?? "low",
      riverResolution: riverResolution ?? "none",
      lakeResolution: lakeResolution ?? "none",
      includeGeographicLines: naturalEarthGeographicLinesVisible,
      includeBoundaries: boundaryLinesVisible,
    }).then((data) => {
      if (!active) return;
      setBoundaryData(data);
    });
    return () => {
      active = false;
    };
  }, [
    boundaryConfigKey,
    boundaryLinesVisible,
    naturalEarthGeographicLinesVisible,
    coastlineResolution,
    riverResolution,
    lakeResolution,
  ]);

  const scheduleOrientationCommit = useCallback(() => {
    if (!onOrientationChange || !projectionRef.current) return;
    if (orientationTimeoutRef.current) {
      window.clearTimeout(orientationTimeoutRef.current);
    }
    orientationTimeoutRef.current = window.setTimeout(() => {
      orientationTimeoutRef.current = null;
      const next = projectionRef.current?.getOrientation();
      if (next) {
        onOrientationChange(next);
      }
    }, 150);
  }, [onOrientationChange]);

  const renderOverlay = useCallback(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const isInteracting =
      draggingRef.current || inertiaFrameRef.current !== null;
    if (isInteracting) {
      return;
    }
    if (
      !rasterGridData ||
      !currentDataset?.colorScale?.colors?.length ||
      !overlayRef.current ||
      !projectionRef.current
    ) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      return;
    }
    const scale = projectionRef.current.projection.scale();
    if (scale < MIN_SCALE_FOR_OVERLAY) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      return;
    }
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    overlayRef.current.render({
      gridData: rasterGridData,
      colors: currentDataset.colorScale.colors,
      hideZeroValues,
      smoothGridBoxValues,
      opacity: clamp(rasterOpacity, 0, 1),
    });
    ctx.drawImage(overlayRef.current.getCanvas(), 0, 0);
  }, [
    currentDataset?.colorScale?.colors,
    hideZeroValues,
    rasterGridData,
    rasterOpacity,
    smoothGridBoxValues,
  ]);

  const updatePaths = useCallback(() => {
    boundariesRef.current?.update();
  }, []);

  const requestRender = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      updatePaths();
      renderOverlay();
    });
  }, [renderOverlay, updatePaths]);

  const scheduleInteractionRender = useCallback(() => {
    if (interactionRafRef.current) return;
    interactionRafRef.current = window.requestAnimationFrame(() => {
      interactionRafRef.current = null;
      updatePaths();
      renderOverlay();
      if (draggingRef.current || inertiaFrameRef.current !== null) {
        scheduleInteractionRender();
      }
    });
  }, [renderOverlay, updatePaths]);

  const renderBoundaries = useCallback(() => {
    if (!svgRef.current || !boundariesRef.current) return;
    boundariesRef.current.renderToSVG(svgRef.current, boundaryData, {
      showGraticule: geographicLinesVisible,
      lineColors,
    });
  }, [boundaryData, geographicLinesVisible, lineColors]);

  const applySize = useCallback(
    (width: number, height: number, force = false) => {
      if (
        !force &&
        width === sizeRef.current.width &&
        height === sizeRef.current.height
      ) {
        return;
      }
      sizeRef.current = { width, height };
      setSize({ width, height });
      if (canvasRef.current) {
        canvasRef.current.width = width;
        canvasRef.current.height = height;
      }
      if (!projectionRef.current) {
        projectionRef.current = new WinkelProjection(width, height);
        scaleRef.current = projectionRef.current.projection.scale();
      } else {
        const resetScale = !effectiveOrientation && !hasInteractedRef.current;
        projectionRef.current.setSize(width, height, resetScale);
        if (resetScale) {
          scaleRef.current = projectionRef.current.projection.scale();
        }
      }
      if (!boundariesRef.current && projectionRef.current) {
        boundariesRef.current = new WinkelBoundaries(
          projectionRef.current.projection,
        );
      }
      if (!overlayRef.current && projectionRef.current) {
        overlayRef.current = new WinkelOverlay(
          projectionRef.current.projection,
          width,
          height,
        );
      } else {
        overlayRef.current?.setSize(width, height);
      }

      if (effectiveOrientation && projectionRef.current) {
        projectionRef.current.setOrientation(effectiveOrientation);
        scaleRef.current = projectionRef.current.projection.scale();
        lastAppliedOrientationRef.current = effectiveOrientation;
      }

      renderBoundaries();
      requestRender();
    },
    [effectiveOrientation, renderBoundaries, requestRender],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.max(1, Math.round(entry.contentRect.width));
      const height = Math.max(1, Math.round(entry.contentRect.height));
      applySize(width, height);
    });
    observer.observe(container);
    const rect = container.getBoundingClientRect();
    const initialWidth = Math.max(1, Math.round(rect.width));
    const initialHeight = Math.max(1, Math.round(rect.height));
    applySize(initialWidth, initialHeight, true);
    return () => observer.disconnect();
  }, [applySize]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (hasInteractedRef.current || effectiveOrientation) return;
    let frame2: number | null = null;
    const frame1 = window.requestAnimationFrame(() => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      applySize(width, height, true);
      frame2 = window.requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const rect2 = containerRef.current.getBoundingClientRect();
        const width2 = Math.max(1, Math.round(rect2.width));
        const height2 = Math.max(1, Math.round(rect2.height));
        applySize(width2, height2, true);
      });
    });
    return () => {
      window.cancelAnimationFrame(frame1);
      if (frame2) {
        window.cancelAnimationFrame(frame2);
      }
    };
  }, [applySize, effectiveOrientation]);

  useEffect(() => {
    renderBoundaries();
    requestRender();
  }, [renderBoundaries, requestRender]);

  useEffect(() => {
    if (!projectionRef.current || !effectiveOrientation) return;
    if (
      orientationsEqual(
        lastAppliedOrientationRef.current ?? undefined,
        effectiveOrientation,
      )
    ) {
      return;
    }
    projectionRef.current.setOrientation(effectiveOrientation);
    scaleRef.current = projectionRef.current.projection.scale();
    lastAppliedOrientationRef.current = effectiveOrientation;
    requestRender();
  }, [effectiveOrientation, requestRender]);

  useEffect(() => {
    requestRender();
  }, [
    rasterGridData,
    currentDataset?.colorScale?.colors,
    hideZeroValues,
    smoothGridBoxValues,
    rasterOpacity,
    requestRender,
  ]);

  const getLocalPointer = useCallback((event: React.PointerEvent) => {
    if (!svgRef.current) return [0, 0] as [number, number];
    const rect = svgRef.current.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top] as [
      number,
      number,
    ];
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!projectionRef.current || !svgRef.current) return;
      event.preventDefault();
      hasInteractedRef.current = true;
      if (inertiaFrameRef.current) {
        window.cancelAnimationFrame(inertiaFrameRef.current);
        inertiaFrameRef.current = null;
      }
      svgRef.current.setPointerCapture(event.pointerId);
      draggingRef.current = true;
      const start = getLocalPointer(event);
      dragStartRef.current = start;
      lastPointerRef.current = start;
      lastMoveTimeRef.current = performance.now();
      velocityRef.current = { x: 0, y: 0 };
    },
    [getLocalPointer],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!draggingRef.current || !projectionRef.current) return;
      const start = dragStartRef.current;
      if (!start) return;
      const current = getLocalPointer(event);
      const last = lastPointerRef.current ?? current;
      const now = performance.now();
      const lastTime = lastMoveTimeRef.current ?? now;
      const dt = Math.max(1, now - lastTime);
      const dx = current[0] - last[0];
      const dy = current[1] - last[1];
      const sensitivity = 0.25;
      const rotate = projectionRef.current.projection.rotate() as [
        number,
        number,
        number,
      ];
      projectionRef.current.projection.rotate([
        rotate[0] + dx * sensitivity,
        rotate[1] - dy * sensitivity,
        rotate[2],
      ]);
      velocityRef.current = {
        x: (dx * sensitivity) / dt,
        y: (-dy * sensitivity) / dt,
      };
      lastPointerRef.current = current;
      lastMoveTimeRef.current = now;
      scheduleInteractionRender();
    },
    [getLocalPointer, scheduleInteractionRender],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      dragStartRef.current = null;
      lastPointerRef.current = null;
      try {
        svgRef.current?.releasePointerCapture(event.pointerId);
      } catch {
        // noop
      }
      const velocity = velocityRef.current;
      const speed = Math.hypot(velocity.x, velocity.y);
      if (speed > 0.01 && projectionRef.current) {
        let lastFrame = performance.now();
        const friction = 0.92;
        const tick = () => {
          if (!projectionRef.current) return;
          const now = performance.now();
          const dt = Math.max(1, now - lastFrame);
          lastFrame = now;
          velocityRef.current = {
            x: velocityRef.current.x * friction,
            y: velocityRef.current.y * friction,
          };
          const v = velocityRef.current;
          if (Math.hypot(v.x, v.y) < 0.005) {
            inertiaFrameRef.current = null;
            scheduleOrientationCommit();
            return;
          }
          const rotate = projectionRef.current.projection.rotate() as [
            number,
            number,
            number,
          ];
          projectionRef.current.projection.rotate([
            rotate[0] + v.x * dt,
            rotate[1] + v.y * dt,
            rotate[2],
          ]);
          scheduleInteractionRender();
          inertiaFrameRef.current = window.requestAnimationFrame(tick);
        };
        inertiaFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        scheduleOrientationCommit();
      }
    },
    [scheduleInteractionRender, scheduleOrientationCommit],
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent) => {
      if (!projectionRef.current) return;
      event.preventDefault();
      hasInteractedRef.current = true;
      const currentScale = projectionRef.current.projection.scale();
      const delta = -event.deltaY;
      const zoomFactor = 1 + delta * 0.0015;
      const nextScale = clamp(currentScale * zoomFactor, MIN_SCALE, MAX_SCALE);
      projectionRef.current.projection.scale(nextScale);
      scaleRef.current = nextScale;
      requestRender();
      scheduleOrientationCommit();
    },
    [requestRender, scheduleOrientationCommit],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
      if (interactionRafRef.current) {
        window.cancelAnimationFrame(interactionRafRef.current);
      }
      if (inertiaFrameRef.current) {
        window.cancelAnimationFrame(inertiaFrameRef.current);
      }
      if (orientationTimeoutRef.current) {
        window.clearTimeout(orientationTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 h-full w-full">
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      />
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    </div>
  );
};

export default WinkelGlobe;
