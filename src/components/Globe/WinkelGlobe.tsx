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
const MIN_SCALE_FOR_OVERLAY = 200;

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
  const dragManipulatorRef = useRef<ReturnType<
    WinkelProjection["createManipulator"]
  > | null>(null);
  const scaleRef = useRef<number>(0);
  const hasInteractedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const orientationTimeoutRef = useRef<number | null>(null);
  const lastAppliedOrientationRef = useRef<WinkelOrientation | null>(null);

  const [boundaryData, setBoundaryData] = useState<BoundaryDataset[]>([]);

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
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    if (
      !rasterGridData ||
      !currentDataset?.colorScale?.colors?.length ||
      !overlayRef.current ||
      !projectionRef.current
    ) {
      return;
    }
    const scale = projectionRef.current.projection.scale();
    if (scale < MIN_SCALE_FOR_OVERLAY) {
      return;
    }
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

  const renderBoundaries = useCallback(() => {
    if (!svgRef.current || !boundariesRef.current) return;
    boundariesRef.current.renderToSVG(svgRef.current, boundaryData, {
      showGraticule: geographicLinesVisible,
      lineColors,
    });
  }, [boundaryData, geographicLinesVisible, lineColors]);

  const applySize = useCallback(
    (width: number, height: number) => {
      if (
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
        const resetScale = !orientation && !hasInteractedRef.current;
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

      if (orientation && projectionRef.current) {
        projectionRef.current.setOrientation(orientation);
        scaleRef.current = projectionRef.current.projection.scale();
        lastAppliedOrientationRef.current = orientation;
      }

      renderBoundaries();
      requestRender();
    },
    [orientation, renderBoundaries, requestRender],
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
    applySize(initialWidth, initialHeight);
    return () => observer.disconnect();
  }, [applySize]);

  useEffect(() => {
    renderBoundaries();
    requestRender();
  }, [renderBoundaries, requestRender]);

  useEffect(() => {
    if (!projectionRef.current || !orientation) return;
    if (
      orientationsEqual(
        lastAppliedOrientationRef.current ?? undefined,
        orientation,
      )
    ) {
      return;
    }
    projectionRef.current.setOrientation(orientation);
    scaleRef.current = projectionRef.current.projection.scale();
    lastAppliedOrientationRef.current = orientation;
    requestRender();
  }, [orientation, requestRender]);

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
      svgRef.current.setPointerCapture(event.pointerId);
      draggingRef.current = true;
      const start = getLocalPointer(event);
      dragStartRef.current = start;
      dragManipulatorRef.current = projectionRef.current.createManipulator(
        start,
        projectionRef.current.projection.scale(),
      );
    },
    [getLocalPointer],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!draggingRef.current || !dragManipulatorRef.current) return;
      const start = dragStartRef.current;
      if (!start || !projectionRef.current) return;
      const current = getLocalPointer(event);
      dragManipulatorRef.current.move(current);
      requestRender();
    },
    [getLocalPointer, requestRender],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      dragStartRef.current = null;
      dragManipulatorRef.current = null;
      try {
        svgRef.current?.releasePointerCapture(event.pointerId);
      } catch {
        // noop
      }
      scheduleOrientationCommit();
    },
    [scheduleOrientationCommit],
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
