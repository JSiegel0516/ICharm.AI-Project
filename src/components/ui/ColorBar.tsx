"use client";

import React, {
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useState,
  useReducer,
} from "react";
import { ChevronDown, ChevronUp, RotateCcw, Move } from "lucide-react";
import { Button } from "./button";

type TemperatureUnit = "celsius" | "fahrenheit";

interface ColorBarProps {
  show: boolean;
  onToggle?: () => void;
  onToggleCollapse?: (collapsed: boolean) => void;
  dataset: any;
  unit?: TemperatureUnit;
  onUnitChange?: (unit: TemperatureUnit) => void;
  onRangeChange?: (range: { min: number | null; max: number | null }) => void;
  onRangeReset?: () => void;
  onPositionChange?: (position: { x: number; y: number }) => void;
  collapsed?: boolean;
  rasterMeta?: any;
  orientation?: "horizontal" | "vertical";
  selectedLevel?: number | null;
  customRange?: {
    enabled?: boolean;
    min?: number | null;
    max?: number | null;
  };
}

interface Position {
  x: number;
  y: number;
}

type UIState = {
  position: Position;
  previousPosition: Position;
  isCollapsed: boolean;
  isDragging: boolean;
  dragStart: Position;
  hasInitialized: boolean;
};

type UIAction =
  | { type: "SET_POSITION"; payload: Position }
  | { type: "START_DRAG"; payload: Position }
  | { type: "STOP_DRAG" }
  | { type: "TOGGLE_COLLAPSE" }
  | { type: "SET_COLLAPSED"; payload: boolean }
  | { type: "INITIALIZE"; payload: Position }
  | { type: "RESET_POSITION"; payload: Position };

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "SET_POSITION":
      return { ...state, position: action.payload };
    case "START_DRAG":
      return { ...state, isDragging: true, dragStart: action.payload };
    case "STOP_DRAG":
      return { ...state, isDragging: false };
    case "TOGGLE_COLLAPSE":
      if (state.isCollapsed) {
        return {
          ...state,
          isCollapsed: false,
          position: state.previousPosition,
        };
      }
      return {
        ...state,
        isCollapsed: true,
        previousPosition: state.position,
        position: { x: 24, y: window.innerHeight - 60 },
      };
    case "SET_COLLAPSED":
      return { ...state, isCollapsed: action.payload };
    case "INITIALIZE":
      return {
        ...state,
        position: action.payload,
        previousPosition: action.payload,
        hasInitialized: true,
      };
    case "RESET_POSITION":
      return {
        ...state,
        position: action.payload,
        previousPosition: action.payload,
      };
    default:
      return state;
  }
}

const ColorBar: React.FC<ColorBarProps> = ({
  show,
  onToggle,
  onToggleCollapse,
  dataset,
  unit = "celsius",
  onUnitChange,
  onRangeChange,
  onRangeReset,
  onPositionChange,
  collapsed = false,
  rasterMeta = null,
  orientation = "horizontal",
  selectedLevel = null,
  customRange,
}) => {
  const colorBarRef = useRef<HTMLDivElement>(null);
  const gradientRef = useRef<HTMLDivElement>(null);
  const isVertical = orientation === "vertical";

  // Hover and drag range state
  const [isGradientHovered, setIsGradientHovered] = useState(false);
  const [isDraggingRange, setIsDraggingRange] = useState<"min" | "max" | null>(
    null,
  );
  const [dragTemp, setDragTemp] = useState<{ min: number; max: number } | null>(
    null,
  );
  const dragTempRef = useRef<{ min: number; max: number } | null>(null);

  const [uiState, dispatch] = useReducer(uiReducer, {
    position: { x: 24, y: 24 },
    previousPosition: { x: 24, y: 24 },
    isCollapsed: collapsed,
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    hasInitialized: false,
  });

  // ============================================================================
  // UNIT DETECTION
  // ============================================================================

  const unitInfo = useMemo(() => {
    const rawCandidates = [dataset?.units, rasterMeta?.units].filter(
      (value): value is string =>
        typeof value === "string" && value.trim() !== "",
    );

    let symbol = "";

    for (const raw of rawCandidates) {
      const normalized = raw.trim();
      const lower = normalized.toLowerCase();
      const alphaOnly = lower.replace(/[^a-z]/g, "");

      if (
        normalized.includes("℃") ||
        lower.includes("celsius") ||
        lower.includes("°c") ||
        lower.includes("degc") ||
        alphaOnly === "c"
      ) {
        symbol = "°C";
        break;
      }
      if (
        normalized.includes("℉") ||
        lower.includes("fahrenheit") ||
        lower.includes("°f") ||
        lower.includes("degf") ||
        alphaOnly === "f"
      ) {
        symbol = "°F";
        break;
      }
      if (
        normalized.includes("K") ||
        lower.includes("kelvin") ||
        lower.includes("°k") ||
        lower.includes("degk") ||
        alphaOnly === "k"
      ) {
        symbol = "K";
        break;
      }
      if (!symbol) symbol = normalized;
    }

    if (!symbol && dataset.dataType?.toLowerCase() === "temperature")
      symbol = "°C";

    const parts = [
      dataset?.dataType,
      dataset?.name,
      dataset?.description,
      dataset?.backend?.datasetName,
      dataset?.backend?.layerParameter,
    ]
      .filter((v): v is string => typeof v === "string" && !!v.trim())
      .join(" ")
      .toLowerCase();

    const hasTemperatureHints =
      parts.includes("temp") ||
      parts.includes("°c") ||
      parts.includes("sea surface") ||
      parts.includes("sst");

    return { symbol, allowToggle: symbol === "°C" && hasTemperatureHints };
  }, [dataset, rasterMeta?.units]);

  const currentUnitSymbol = unitInfo.allowToggle
    ? unit === "fahrenheit"
      ? "°F"
      : "°C"
    : unitInfo.symbol || "";

  // ============================================================================
  // COLOR SCALE CALCULATIONS
  // ============================================================================

  const datasetFlags = useMemo(() => {
    const datasetText = [
      dataset?.id,
      dataset?.slug,
      dataset?.name,
      dataset?.description,
      dataset?.backend?.datasetName,
      dataset?.backend?.slug,
      dataset?.backend?.id,
    ]
      .filter((v) => typeof v === "string")
      .map((v) => v.toLowerCase())
      .join(" ");

    const isGodas =
      datasetText.includes("godas") ||
      datasetText.includes("global ocean data assimilation system") ||
      datasetText.includes("ncep global ocean data assimilation");
    const isGodasDeepLevel =
      isGodas &&
      typeof selectedLevel === "number" &&
      Number.isFinite(selectedLevel) &&
      Math.abs(selectedLevel - 4736) < 0.5;

    return { isGodas, isGodasDeepLevel };
  }, [dataset, selectedLevel]);

  const colorScale = useMemo(() => {
    const customRangeEnabled = Boolean(customRange?.enabled);
    const GODAS_DEFAULT_MIN = -0.0000005;
    const GODAS_DEFAULT_MAX = 0.0000005;
    const { isGodas } = datasetFlags;

    const overrideMin =
      customRangeEnabled &&
      typeof customRange?.min === "number" &&
      Number.isFinite(customRange.min)
        ? Number(customRange.min)
        : null;
    const overrideMax =
      customRangeEnabled &&
      typeof customRange?.max === "number" &&
      Number.isFinite(customRange.max)
        ? Number(customRange.max)
        : null;

    const godasDefaultMin = isGodas ? GODAS_DEFAULT_MIN : null;
    const godasDefaultMax = isGodas ? GODAS_DEFAULT_MAX : null;

    const metaMin =
      typeof rasterMeta?.min === "number" && Number.isFinite(rasterMeta.min)
        ? Number(rasterMeta.min)
        : null;
    const metaMax =
      typeof rasterMeta?.max === "number" && Number.isFinite(rasterMeta.max)
        ? Number(rasterMeta.max)
        : null;

    const defaultMin = godasDefaultMin ?? metaMin ?? dataset.colorScale.min;
    const defaultMax = godasDefaultMax ?? metaMax ?? dataset.colorScale.max;
    const safeDefaultMin = Number.isFinite(defaultMin) ? Number(defaultMin) : 0;
    const safeDefaultMax = Number.isFinite(defaultMax)
      ? Number(defaultMax)
      : safeDefaultMin;

    // Labels always reflect the full dataset range so the gradient tick marks
    // stay fixed. The narrowed range is shown only via indicator lines.
    const labelMin = safeDefaultMin;
    const labelMax = safeDefaultMax;

    const MAX_TICKS = 7;
    const labelCount = Math.min(
      MAX_TICKS,
      Math.max(dataset.colorScale.labels.length || 0, 2),
    );

    const generateLabels = () => {
      if (labelCount <= 1 || Math.abs(labelMax - labelMin) < 1e-9)
        return Array(labelCount).fill(labelMin);
      if (isGodas) return [labelMin, labelMax];
      return Array.from(
        { length: labelCount },
        (_, i) => labelMin + ((labelMax - labelMin) * i) / (labelCount - 1),
      );
    };

    return {
      labels: generateLabels(),
      colors: dataset.colorScale.colors,
      rangeMin: safeDefaultMin,
      rangeMax: safeDefaultMax,
    };
  }, [customRange, dataset.colorScale, datasetFlags, rasterMeta]);

  const formatTick = useCallback((v: number) => {
    if (!Number.isFinite(v)) return "–";
    if (v === 0) return "0";
    const abs = Math.abs(v);
    if (abs < 1e-4) return v.toExponential(2);
    if (abs < 1) {
      const p = Number(v.toPrecision(3));
      return (Object.is(p, -0) ? 0 : p).toString();
    }
    if (abs < 10) return v.toFixed(2);
    if (abs < 100) return v.toFixed(1);
    if (abs < 1000) return v.toFixed(0);
    return `${(v / 1000).toFixed(1)}k`;
  }, []);

  // Store the stable "original" full range so that when rasterMeta changes
  // due to custom range filtering, displayLimits stays pinned and indicators
  // don't shift.
  const stableRangeRef = useRef<{ min: number; max: number } | null>(null);

  const rangeLimits = useMemo(() => {
    const { rangeMin, rangeMax } = colorScale;
    const current = { min: rangeMin, max: rangeMax };

    if (!customRange?.enabled) {
      // No custom range active — update the stable reference
      stableRangeRef.current = current;
      return current;
    }

    // Custom range is active — use the stored stable range if available
    // so that rasterMeta changes don't shift the scale
    return stableRangeRef.current ?? current;
  }, [colorScale, customRange?.enabled]);

  // MOVED ABOVE fullRangeLabels to avoid TDZ error
  const toDisplayValue = useCallback(
    (value: number) => {
      if (!unitInfo.allowToggle || unit !== "fahrenheit") return value;
      return (value * 9) / 5 + 32;
    },
    [unitInfo.allowToggle, unit],
  );

  const fromDisplayValue = useCallback(
    (value: number) => {
      if (!unitInfo.allowToggle || unit !== "fahrenheit") return value;
      return ((value - 32) * 5) / 9;
    },
    [unitInfo.allowToggle, unit],
  );

  // Labels always reflect the full dataset range so the gradient tick marks
  // stay fixed regardless of the custom range.
  const fullRangeLabels = useMemo(() => {
    const { rangeMin, rangeMax } = colorScale;
    const min = toDisplayValue(rangeMin);
    const max = toDisplayValue(rangeMax);
    const labelCount = Math.min(7, Math.max(colorScale.labels.length, 2));
    if (labelCount <= 1 || Math.abs(max - min) < 1e-9)
      return Array(labelCount).fill(min);
    return Array.from(
      { length: labelCount },
      (_, i) => min + ((max - min) * i) / (labelCount - 1),
    );
  }, [colorScale, toDisplayValue]);

  const displayLabels = useMemo(() => {
    return fullRangeLabels.map(formatTick);
  }, [fullRangeLabels, formatTick]);

  const labels = isVertical ? [...displayLabels].reverse() : displayLabels;

  // The currently active display range
  const displayLimits = useMemo(() => {
    const min = toDisplayValue(rangeLimits.min);
    const max = toDisplayValue(rangeLimits.max);
    return min <= max ? { min, max } : { min: max, max: min };
  }, [rangeLimits, toDisplayValue]);

  const gradientStops = colorScale.colors
    .map((color: string, index: number) => {
      const start = (index / colorScale.colors.length) * 100;
      const end = ((index + 1) / colorScale.colors.length) * 100;
      return `${color} ${start}%, ${color} ${end}%`;
    })
    .join(", ");

  const gradientBackground = `linear-gradient(${isVertical ? "to top" : "to right"}, ${gradientStops})`;

  // ============================================================================
  // POSITIONING
  // ============================================================================

  const getDefaultPosition = useCallback((): Position => {
    if (typeof window === "undefined")
      return isVertical ? { x: 24, y: 120 } : { x: 24, y: 180 };
    const margin = 16;
    if (isVertical) {
      const cardWidth = colorBarRef.current
        ? colorBarRef.current.offsetWidth
        : 200;
      return {
        x: window.innerWidth - cardWidth - margin,
        y: Math.round(window.innerHeight * 0.25),
      };
    }
    const actualHeight = colorBarRef.current?.offsetHeight ?? 250;
    return { x: margin, y: window.innerHeight - actualHeight - margin };
  }, [isVertical]);

  const clampPosition = useCallback((pos: Position): Position => {
    const element = colorBarRef.current;
    if (!element) return pos;
    const maxX = window.innerWidth - element.offsetWidth;
    const maxY = window.innerHeight - element.offsetHeight;
    return {
      x: Math.max(0, Math.min(pos.x, maxX)),
      y: Math.max(0, Math.min(pos.y, maxY)),
    };
  }, []);

  // ============================================================================
  // RANGE INTERACTION
  // ============================================================================

  const getValueFromPosition = useCallback(
    (clientX: number, clientY: number): number => {
      const gradient = gradientRef.current;
      if (!gradient) return 0;
      const rect = gradient.getBoundingClientRect();
      let ratio: number;
      if (isVertical) {
        ratio = Math.max(0, Math.min(1, (rect.bottom - clientY) / rect.height));
      } else {
        ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      }
      return (
        displayLimits.min + (displayLimits.max - displayLimits.min) * ratio
      );
    },
    [isVertical, displayLimits],
  );

  const customDisplayRange = useMemo(() => {
    const hasMin =
      customRange?.enabled &&
      typeof customRange?.min === "number" &&
      Number.isFinite(customRange.min);
    const hasMax =
      customRange?.enabled &&
      typeof customRange?.max === "number" &&
      Number.isFinite(customRange.max);
    return {
      min: hasMin ? toDisplayValue(customRange!.min!) : displayLimits.min,
      max: hasMax ? toDisplayValue(customRange!.max!) : displayLimits.max,
    };
  }, [customRange, toDisplayValue, displayLimits]);

  const handleGradientMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const value = getValueFromPosition(e.clientX, e.clientY);
      const distToMin = Math.abs(value - customDisplayRange.min);
      const distToMax = Math.abs(value - customDisplayRange.max);
      const adjusting = distToMin < distToMax ? "min" : "max";

      setIsDraggingRange(adjusting);
      setDragTemp(customDisplayRange);
      dragTempRef.current = customDisplayRange;
    },
    [getValueFromPosition, customDisplayRange],
  );

  const handleGradientTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const touch = e.touches[0];
      const value = getValueFromPosition(touch.clientX, touch.clientY);
      const distToMin = Math.abs(value - customDisplayRange.min);
      const distToMax = Math.abs(value - customDisplayRange.max);
      const adjusting = distToMin < distToMax ? "min" : "max";

      setIsDraggingRange(adjusting);
      setIsGradientHovered(true);
      setDragTemp(customDisplayRange);
      dragTempRef.current = customDisplayRange;
    },
    [getValueFromPosition, customDisplayRange],
  );

  const commitRange = useCallback(
    (range: { min: number; max: number }) => {
      const baseMin = fromDisplayValue(range.min);
      const baseMax = fromDisplayValue(range.max);
      onRangeChange?.({ min: baseMin, max: baseMax });
    },
    [fromDisplayValue, onRangeChange],
  );

  // ============================================================================
  // GLOBAL MOUSE/TOUCH HANDLERS FOR RANGE DRAG
  // ============================================================================

  useEffect(() => {
    if (!isDraggingRange) return;

    const handleMouseMove = (e: MouseEvent) => {
      const value = getValueFromPosition(e.clientX, e.clientY);
      setDragTemp((prev) => {
        if (!prev) return prev;
        const clamped = Math.max(
          displayLimits.min,
          Math.min(displayLimits.max, value),
        );
        const next =
          isDraggingRange === "min"
            ? { min: clamped, max: prev.max }
            : { min: prev.min, max: clamped };
        dragTempRef.current = next;
        return next;
      });
    };

    const handleMouseUp = () => {
      const finalRange = dragTempRef.current;
      setDragTemp(null);
      dragTempRef.current = null;
      setIsDraggingRange(null);
      if (finalRange) {
        const sorted = {
          min: Math.min(finalRange.min, finalRange.max),
          max: Math.max(finalRange.min, finalRange.max),
        };
        commitRange(sorted);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      const value = getValueFromPosition(touch.clientX, touch.clientY);
      setDragTemp((prev) => {
        if (!prev) return prev;
        const clamped = Math.max(
          displayLimits.min,
          Math.min(displayLimits.max, value),
        );
        const next =
          isDraggingRange === "min"
            ? { min: clamped, max: prev.max }
            : { min: prev.min, max: clamped };
        dragTempRef.current = next;
        return next;
      });
    };

    const handleTouchEnd = () => {
      const finalRange = dragTempRef.current;
      setDragTemp(null);
      dragTempRef.current = null;
      setIsDraggingRange(null);
      if (finalRange) {
        const sorted = {
          min: Math.min(finalRange.min, finalRange.max),
          max: Math.max(finalRange.min, finalRange.max),
        };
        commitRange(sorted);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDraggingRange, getValueFromPosition, commitRange, displayLimits]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    setIsGradientHovered(false);
    setIsDraggingRange(null);
    setDragTemp(null);
    dragTempRef.current = null;
    stableRangeRef.current = null;
  }, [dataset?.id]);

  useEffect(() => {
    if (
      !uiState.hasInitialized &&
      colorBarRef.current &&
      !uiState.isCollapsed
    ) {
      const timer = setTimeout(() => {
        dispatch({ type: "INITIALIZE", payload: getDefaultPosition() });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [uiState.hasInitialized, uiState.isCollapsed, getDefaultPosition]);

  useEffect(() => {
    if (uiState.hasInitialized && !uiState.isCollapsed) {
      dispatch({ type: "RESET_POSITION", payload: getDefaultPosition() });
    }
  }, [
    orientation,
    uiState.hasInitialized,
    uiState.isCollapsed,
    getDefaultPosition,
  ]);

  useEffect(() => {
    dispatch({ type: "SET_COLLAPSED", payload: collapsed });
  }, [collapsed]);

  useEffect(() => {
    onPositionChange?.(uiState.position);
  }, [uiState.position, onPositionChange]);

  useEffect(() => {
    if (!uiState.isDragging || uiState.isCollapsed) return;

    const handleMouseMove = (e: MouseEvent) => {
      dispatch({
        type: "SET_POSITION",
        payload: clampPosition({
          x: e.clientX - uiState.dragStart.x,
          y: e.clientY - uiState.dragStart.y,
        }),
      });
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      dispatch({
        type: "SET_POSITION",
        payload: clampPosition({
          x: touch.clientX - uiState.dragStart.x,
          y: touch.clientY - uiState.dragStart.y,
        }),
      });
    };

    const handleUp = () => dispatch({ type: "STOP_DRAG" });

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleUp);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleUp);
    };
  }, [
    uiState.isDragging,
    uiState.isCollapsed,
    uiState.dragStart,
    clampPosition,
  ]);

  useEffect(() => {
    const handleResize = () => {
      if (uiState.isCollapsed) {
        dispatch({
          type: "SET_POSITION",
          payload: { x: 24, y: window.innerHeight - 60 },
        });
      } else {
        dispatch({
          type: "SET_POSITION",
          payload: clampPosition(uiState.position),
        });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [uiState.isCollapsed, uiState.position, clampPosition]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  const handleCollapseToggle = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!uiState.isDragging) {
        onToggleCollapse?.(!uiState.isCollapsed);
        dispatch({ type: "TOGGLE_COLLAPSE" });
      }
    },
    [onToggleCollapse, uiState.isCollapsed, uiState.isDragging],
  );

  const handleResetPosition = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!uiState.isCollapsed && !uiState.isDragging) {
        dispatch({ type: "RESET_POSITION", payload: getDefaultPosition() });
      }
    },
    [uiState.isCollapsed, uiState.isDragging, getDefaultPosition],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (uiState.isCollapsed) return;
      e.preventDefault();
      e.stopPropagation();
      dispatch({
        type: "START_DRAG",
        payload: {
          x: e.clientX - uiState.position.x,
          y: e.clientY - uiState.position.y,
        },
      });
    },
    [uiState.isCollapsed, uiState.position],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (uiState.isCollapsed) return;
      e.preventDefault();
      e.stopPropagation();
      const touch = e.touches[0];
      dispatch({
        type: "START_DRAG",
        payload: {
          x: touch.clientX - uiState.position.x,
          y: touch.clientY - uiState.position.y,
        },
      });
    },
    [uiState.isCollapsed, uiState.position],
  );

  const handleUnitChange = useCallback(
    (newUnit: TemperatureUnit) => {
      if (!unitInfo.allowToggle) return;
      onUnitChange?.(newUnit);
    },
    [unitInfo.allowToggle, onUnitChange],
  );

  const handleRangeReset = useCallback(() => {
    setDragTemp(null);
    dragTempRef.current = null;
    setIsDraggingRange(null);
    onRangeReset?.();
    if (!onRangeReset) onRangeChange?.({ min: null, max: null });
  }, [onRangeChange, onRangeReset]);

  // ============================================================================
  // RENDER
  // ============================================================================

  const hasCustomRange = Boolean(customRange?.enabled);
  const showIndicators =
    isGradientHovered || isDraggingRange !== null || hasCustomRange;

  const indicatorPositions = useMemo(() => {
    const range = displayLimits.max - displayLimits.min;
    if (Math.abs(range) < 1e-12) return null;

    const source = dragTemp ?? customDisplayRange;
    const minPct = ((source.min - displayLimits.min) / range) * 100;
    const maxPct = ((source.max - displayLimits.min) / range) * 100;

    return {
      min: Math.max(0, Math.min(100, isVertical ? 100 - minPct : minPct)),
      max: Math.max(0, Math.min(100, isVertical ? 100 - maxPct : maxPct)),
    };
  }, [displayLimits, dragTemp, customDisplayRange, isVertical]);

  const rangeIndicators =
    showIndicators && indicatorPositions ? (
      <>
        {/* Min line */}
        {isVertical ? (
          <div
            className="pointer-events-none absolute left-0 w-full"
            style={{ top: `${indicatorPositions.min}%` }}
          >
            <div className="h-0.5 w-full bg-white shadow-[0_0_4px_rgba(0,0,0,0.6)]" />
          </div>
        ) : (
          <div
            className="pointer-events-none absolute top-0 h-full"
            style={{ left: `${indicatorPositions.min}%` }}
          >
            <div className="h-full w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.6)]" />
          </div>
        )}
        {/* Max line */}
        {isVertical ? (
          <div
            className="pointer-events-none absolute left-0 w-full"
            style={{ top: `${indicatorPositions.max}%` }}
          >
            <div className="h-0.5 w-full bg-white shadow-[0_0_4px_rgba(0,0,0,0.6)]" />
          </div>
        ) : (
          <div
            className="pointer-events-none absolute top-0 h-full"
            style={{ left: `${indicatorPositions.max}%` }}
          >
            <div className="h-full w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.6)]" />
          </div>
        )}
        {/* Dimming overlay outside the selected range */}
        {isVertical
          ? (() => {
              const top = Math.min(
                indicatorPositions.min,
                indicatorPositions.max,
              );
              const bottom = Math.max(
                indicatorPositions.min,
                indicatorPositions.max,
              );
              return (
                <>
                  <div
                    className="pointer-events-none absolute left-0 w-full rounded-t-lg bg-black/40"
                    style={{ top: 0, height: `${top}%` }}
                  />
                  <div
                    className="pointer-events-none absolute left-0 w-full rounded-b-lg bg-black/40"
                    style={{
                      top: `${bottom}%`,
                      height: `${100 - bottom}%`,
                    }}
                  />
                </>
              );
            })()
          : (() => {
              const left = Math.min(
                indicatorPositions.min,
                indicatorPositions.max,
              );
              const right = Math.max(
                indicatorPositions.min,
                indicatorPositions.max,
              );
              return (
                <>
                  <div
                    className="pointer-events-none absolute top-0 h-full rounded-l-xl bg-black/40"
                    style={{ left: 0, width: `${left}%` }}
                  />
                  <div
                    className="pointer-events-none absolute top-0 h-full rounded-r-xl bg-black/40"
                    style={{
                      left: `${right}%`,
                      width: `${100 - right}%`,
                    }}
                  />
                </>
              );
            })()}
      </>
    ) : null;

  const dragTooltip =
    isDraggingRange && dragTemp
      ? (() => {
          const range = displayLimits.max - displayLimits.min;
          if (Math.abs(range) < 1e-12) return null;
          const activeValue =
            isDraggingRange === "min" ? dragTemp.min : dragTemp.max;
          const pct = ((activeValue - displayLimits.min) / range) * 100;
          const clampedPct = Math.max(0, Math.min(100, pct));

          return isVertical ? (
            <div
              className="pointer-events-none absolute right-full mr-2"
              style={{
                top: `${100 - clampedPct}%`,
                transform: "translateY(-50%)",
              }}
            >
              <div className="rounded bg-black/80 px-2 py-1 font-mono text-xs whitespace-nowrap text-white shadow-lg">
                {formatTick(activeValue)}
              </div>
            </div>
          ) : (
            <div
              className="pointer-events-none absolute bottom-full mb-2"
              style={{
                left: `${clampedPct}%`,
                transform: "translateX(-50%)",
              }}
            >
              <div className="rounded bg-black/80 px-2 py-1 font-mono text-xs whitespace-nowrap text-white shadow-lg">
                {formatTick(activeValue)}
              </div>
            </div>
          );
        })()
      : null;

  if (!show) return null;

  return (
    <div
      ref={colorBarRef}
      className="pointer-events-auto fixed"
      style={{
        left: `${uiState.position.x}px`,
        top: `${uiState.position.y}px`,
        zIndex: uiState.isCollapsed ? 100 : 30,
        opacity: uiState.hasInitialized ? 1 : 0,
      }}
    >
      {uiState.isCollapsed ? (
        <Button
          className="bg-card/90 border-border text-muted-foreground hover:text-card-foreground pointer-events-auto flex cursor-pointer items-center gap-1 rounded-xl border backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:shadow-lg lg:gap-2"
          onClick={handleCollapseToggle}
        >
          <ChevronUp className="pointer-events-none sm:h-2 sm:w-2 lg:h-4 lg:w-4" />
          <span className="pointer-events-none font-medium select-none sm:text-xs lg:text-sm">
            Color Bar
          </span>
        </Button>
      ) : (
        <div className="border-border bg-card/90 text-primary group pointer-events-auto relative rounded-2xl border px-4 pt-4 pb-4 shadow-2xl backdrop-blur-md transition-all duration-200 lg:px-6 lg:pt-6 lg:pb-8">
          {/* Header Controls */}
          <div className="-mt-2 flex w-full items-center justify-between gap-2 sm:mb-2 lg:mb-4">
            <button
              onClick={handleCollapseToggle}
              className="text-muted-foreground hover:text-card-foreground -m-1 flex cursor-pointer items-center rounded-full p-2 transition-all hover:bg-white/10 focus:outline-none"
              title="Collapse"
              type="button"
            >
              <ChevronDown className="h-3 w-3 lg:h-4 lg:w-4" />
            </button>

            <div
              className={`mx-2 flex h-6 flex-1 cursor-grab items-center justify-center gap-1 rounded-full px-3 transition-all hover:bg-white/10 ${uiState.isDragging ? "cursor-grabbing bg-white/20" : ""}`}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
              style={{ touchAction: "none" }}
              title="Drag to move"
            >
              <Move className="text-muted-foreground h-2.5 w-2.5 lg:h-3 lg:w-3" />
              <span className="text-muted-foreground text-xs font-medium select-none">
                Color Bar
              </span>
            </div>

            <button
              onClick={handleResetPosition}
              className="text-muted-foreground hover:text-card-foreground -m-1 flex cursor-pointer items-center rounded-full p-2 transition-all hover:bg-white/10 focus:outline-none"
              title="Reset position"
              type="button"
            >
              <RotateCcw className="h-3 w-3 lg:h-4 lg:w-4" />
            </button>
          </div>

          {/* Unit and Reset Row */}
          <div className="mb-3">
            <div className="text-muted-foreground flex w-full items-center text-sm font-medium">
              <div className="w-24">
                {hasCustomRange && (onRangeReset || onRangeChange) && (
                  <Button size="xs" variant="ghost" onClick={handleRangeReset}>
                    Reset Range
                  </Button>
                )}
              </div>

              {unitInfo.allowToggle ? (
                <button
                  type="button"
                  onClick={() =>
                    handleUnitChange(
                      unit === "celsius" ? "fahrenheit" : "celsius",
                    )
                  }
                  className="bg-card/80 hover:bg-card relative ml-auto inline-flex h-6 w-12 shrink-0 items-center rounded-lg border border-white/20 transition-colors focus:ring-2 focus:ring-white/50 focus:outline-none lg:h-7 lg:w-14"
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-lg bg-white/80 shadow-lg transition-transform lg:h-7 lg:w-7 ${unit === "fahrenheit" ? "translate-x-6 lg:translate-x-7" : "translate-x-0"}`}
                  />
                  <span
                    className={`absolute left-0 w-7 text-center text-xs font-semibold transition-colors lg:text-sm ${unit === "celsius" ? "text-gray-900" : "text-white"}`}
                  >
                    C
                  </span>
                  <span
                    className={`absolute right-0 w-7 text-center text-xs font-semibold transition-colors lg:text-sm ${unit === "fahrenheit" ? "text-gray-900" : "text-white"}`}
                  >
                    F
                  </span>
                </button>
              ) : (
                <span className="text-card-foreground ml-auto min-w-8 shrink-0 text-right font-mono text-xs lg:text-sm">
                  {currentUnitSymbol || "–"}
                </span>
              )}
            </div>
          </div>

          {/* Color Scale */}
          <div className="relative">
            {isVertical ? (
              <div className="flex w-full items-center justify-center">
                <div className="relative flex">
                  <div
                    ref={gradientRef}
                    className="relative h-64 w-16 cursor-crosshair rounded-lg shadow-inner"
                    style={{
                      background: gradientBackground,
                      touchAction: "none",
                    }}
                    onMouseEnter={() => setIsGradientHovered(true)}
                    onMouseLeave={() => {
                      if (!isDraggingRange) setIsGradientHovered(false);
                    }}
                    onMouseDown={handleGradientMouseDown}
                    onTouchStart={handleGradientTouchStart}
                  >
                    {rangeIndicators}
                  </div>
                  {dragTooltip}
                  <div className="text-card-foreground absolute inset-y-4 left-full ml-4 flex flex-col justify-between text-right text-xs">
                    {labels.map((label, index) => (
                      <span key={index} className="font-mono leading-none">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative mx-auto sm:w-50 lg:w-70">
                <div
                  ref={gradientRef}
                  className="relative h-7 w-full cursor-crosshair rounded-xl shadow-inner lg:h-10"
                  style={{
                    background: gradientBackground,
                    touchAction: "none",
                  }}
                  onMouseEnter={() => setIsGradientHovered(true)}
                  onMouseLeave={() => {
                    if (!isDraggingRange) setIsGradientHovered(false);
                  }}
                  onMouseDown={handleGradientMouseDown}
                  onTouchStart={handleGradientTouchStart}
                >
                  {rangeIndicators}
                </div>
                {dragTooltip}
                <div className="mt-2 flex w-full justify-between text-xs">
                  {labels.map((label, index) => (
                    <span
                      key={index}
                      className="text-card-foreground font-mono leading-none"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ColorBar;
