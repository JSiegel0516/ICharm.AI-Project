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

// Types
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

// State management with useReducer
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
      } else {
        return {
          ...state,
          isCollapsed: true,
          previousPosition: state.position,
          position: { x: 24, y: window.innerHeight - 60 },
        };
      }

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

  // Range adjustment state
  const [isGradientHovered, setIsGradientHovered] = useState(false);
  const pointerInsideGradientRef = useRef(false);
  const [isColorBarHovered, setIsColorBarHovered] = useState(false);
  const [isDraggingRange, setIsDraggingRange] = useState<"min" | "max" | null>(
    null,
  );
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [tempRange, setTempRange] = useState<{
    min: number;
    max: number;
  } | null>(null);
  const [hasCustomRange, setHasCustomRange] = useState(false);

  const [uiState, dispatch] = useReducer(uiReducer, {
    position: { x: 24, y: 24 },
    previousPosition: { x: 24, y: 24 },
    isCollapsed: collapsed,
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    hasInitialized: false,
  });

  // ============================================================================
  // UNIT DETECTION AND CONVERSION
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

    if (!symbol && dataset.dataType?.toLowerCase() === "temperature") {
      symbol = "°C";
    }

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

    return {
      symbol,
      allowToggle: symbol === "°C" && hasTemperatureHints,
    };
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
    const isNoaaGlobalTemp =
      datasetText.includes("noaaglobaltemp") ||
      datasetText.includes("noaa global temp") ||
      datasetText.includes("noaa global surface temperature") ||
      datasetText.includes("noaa global surface temp") ||
      datasetText.includes("noaa global temperature");

    const isGodasDeepLevel =
      isGodas &&
      typeof selectedLevel === "number" &&
      Number.isFinite(selectedLevel) &&
      Math.abs(selectedLevel - 4736) < 0.5;

    return { isGodas, isNoaaGlobalTemp, isGodasDeepLevel };
  }, [dataset, selectedLevel]);

  const colorScale = useMemo(() => {
    const customRangeEnabled = Boolean(customRange?.enabled);
    const GODAS_DEFAULT_MIN = -0.0000005;
    const GODAS_DEFAULT_MAX = 0.0000005;
    const GODAS_DEEP_MIN = -0.0000005;
    const GODAS_DEEP_MAX = 0.0000005;
    const NOAAGLOBALTEMP_DEFAULT_MIN = -2;
    const NOAAGLOBALTEMP_DEFAULT_MAX = 2;
    const { isGodas, isNoaaGlobalTemp, isGodasDeepLevel } = datasetFlags;

    const preferBaselineRange = false;

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

    const godasDefaultMin = isGodas
      ? isGodasDeepLevel
        ? GODAS_DEEP_MIN
        : GODAS_DEFAULT_MIN
      : null;
    const godasDefaultMax = isGodas
      ? isGodasDeepLevel
        ? GODAS_DEEP_MAX
        : GODAS_DEFAULT_MAX
      : null;
    const noaaDefaultMin = isNoaaGlobalTemp ? NOAAGLOBALTEMP_DEFAULT_MIN : null;
    const noaaDefaultMax = isNoaaGlobalTemp ? NOAAGLOBALTEMP_DEFAULT_MAX : null;

    const metaMin =
      !preferBaselineRange &&
      typeof rasterMeta?.min === "number" &&
      Number.isFinite(rasterMeta.min)
        ? Number(rasterMeta.min)
        : null;
    const metaMax =
      !preferBaselineRange &&
      typeof rasterMeta?.max === "number" &&
      Number.isFinite(rasterMeta.max)
        ? Number(rasterMeta.max)
        : null;

    const min =
      overrideMin ??
      godasDefaultMin ??
      noaaDefaultMin ??
      metaMin ??
      dataset.colorScale.min;
    const max =
      overrideMax ??
      godasDefaultMax ??
      noaaDefaultMax ??
      metaMax ??
      dataset.colorScale.max;
    const safeMin = Number.isFinite(min) ? Number(min) : 0;
    const safeMax = Number.isFinite(max) ? Number(max) : safeMin;

    const rangeMin = safeMin;
    const rangeMax = safeMax;

    const MAX_TICKS = 7;
    const labelCount = Math.min(
      MAX_TICKS,
      Math.max(dataset.colorScale.labels.length || 0, 2),
    );

    const generateLabels = () => {
      if (labelCount <= 1 || Math.abs(rangeMax - rangeMin) < 1e-9) {
        return Array(labelCount).fill(rangeMin);
      }

      if (isGodas) {
        return [rangeMin, rangeMax];
      }

      return Array.from(
        { length: labelCount },
        (_, i) => rangeMin + ((rangeMax - rangeMin) * i) / (labelCount - 1),
      );
    };

    const labels = generateLabels();

    return {
      labels,
      colors: dataset.colorScale.colors,
      rangeMin,
      rangeMax,
    };
  }, [customRange, dataset.colorScale, datasetFlags, rasterMeta]);

  const displayLabels = useMemo(() => {
    const values =
      unitInfo.allowToggle && unit === "fahrenheit"
        ? colorScale.labels.map((v) => (v * 9) / 5 + 32)
        : colorScale.labels;

    const formatTick = (v: number) => {
      if (!Number.isFinite(v)) return "–";
      if (v === 0) return "0";

      const abs = Math.abs(v);
      if (abs < 1e-4) return v.toExponential(2);
      if (abs < 1) {
        const precise = Number(v.toPrecision(3));
        return (Object.is(precise, -0) ? 0 : precise).toString();
      }
      if (abs < 10) return v.toFixed(2);
      if (abs < 100) return v.toFixed(1);
      if (abs < 1000) return v.toFixed(0);
      return `${(v / 1000).toFixed(1)}k`;
    };

    return values.map(formatTick);
  }, [colorScale.labels, unitInfo.allowToggle, unit]);

  const labels = isVertical ? [...displayLabels].reverse() : displayLabels;

  const rangeLimits = useMemo(() => {
    const baseMin =
      typeof dataset?.colorScale?.min === "number" &&
      Number.isFinite(dataset.colorScale.min)
        ? Number(dataset.colorScale.min)
        : null;
    const baseMax =
      typeof dataset?.colorScale?.max === "number" &&
      Number.isFinite(dataset.colorScale.max)
        ? Number(dataset.colorScale.max)
        : null;
    const metaMin =
      typeof rasterMeta?.min === "number" && Number.isFinite(rasterMeta.min)
        ? Number(rasterMeta.min)
        : null;
    const metaMax =
      typeof rasterMeta?.max === "number" && Number.isFinite(rasterMeta.max)
        ? Number(rasterMeta.max)
        : null;

    let min = baseMin ?? metaMin ?? 0;
    let max = baseMax ?? metaMax ?? min + 1;

    if (datasetFlags.isGodasDeepLevel) {
      min = -0.0000005;
      max = 0.0000005;
    }

    if (!Number.isFinite(min)) min = 0;
    if (!Number.isFinite(max)) max = min + 1;
    if (min === max) {
      max = min + 1;
    }
    if (min > max) {
      [min, max] = [max, min];
    }

    return { min, max };
  }, [
    dataset?.colorScale?.min,
    dataset?.colorScale?.max,
    rasterMeta,
    datasetFlags.isGodasDeepLevel,
  ]);

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

  const displayRange = useMemo(() => {
    const min = toDisplayValue(colorScale.rangeMin);
    const max = toDisplayValue(colorScale.rangeMax);
    return min <= max ? { min, max } : { min: max, max: min };
  }, [colorScale.rangeMin, colorScale.rangeMax, toDisplayValue]);

  const displayLimits = useMemo(() => {
    const min = toDisplayValue(rangeLimits.min);
    const max = toDisplayValue(rangeLimits.max);
    return min <= max ? { min, max } : { min: max, max: min };
  }, [rangeLimits, toDisplayValue]);

  const formatRangeValue = useCallback((value: number) => {
    if (!Number.isFinite(value)) return "–";
    if (value === 0) return "0";

    const abs = Math.abs(value);
    if (abs < 1e-4) return value.toExponential(2);
    if (abs < 1) {
      const precise = Number(value.toPrecision(3));
      return (Object.is(precise, -0) ? 0 : precise).toString();
    }
    if (abs < 10) return value.toFixed(2);
    if (abs < 100) return value.toFixed(1);
    if (abs < 1000) return value.toFixed(0);
    return `${(value / 1000).toFixed(1)}k`;
  }, []);

  const gradientStops = colorScale.colors
    .map((color: string, index: number) => {
      const start = (index / colorScale.colors.length) * 100;
      const end = ((index + 1) / colorScale.colors.length) * 100;
      return `${color} ${start}%, ${color} ${end}%`;
    })
    .join(", ");

  const gradientBackground = `linear-gradient(${isVertical ? "to top" : "to right"}, ${gradientStops})`;

  // ============================================================================
  // POSITIONING LOGIC
  // ============================================================================

  const getDefaultPosition = useCallback((): Position => {
    if (typeof window === "undefined") {
      return isVertical ? { x: 24, y: 120 } : { x: 24, y: 180 };
    }

    const margin = 16;

    if (isVertical) {
      const colorBarElement = colorBarRef.current;
      const cardWidth = colorBarElement ? colorBarElement.offsetWidth : 200;
      const x = window.innerWidth - cardWidth - margin;
      const verticalOffset = Math.round(window.innerHeight * 0.25);
      const y = verticalOffset;
      return { x, y };
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
  // RANGE INTERACTION LOGIC
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

  const getPositionFromValue = useCallback(
    (value: number): number => {
      const ratio =
        (value - displayLimits.min) / (displayLimits.max - displayLimits.min);
      return Math.max(0, Math.min(1, ratio));
    },
    [displayLimits],
  );

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
        const defaultPos = getDefaultPosition();
        dispatch({ type: "RESET_POSITION", payload: defaultPos });
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
    setTempRange(null);
    setHasCustomRange(false);
    onRangeReset?.();
    if (!onRangeReset) {
      onRangeChange?.({ min: null, max: null });
    }
  }, [onRangeChange, onRangeReset]);

  // Gradient interaction handlers
  const handleGradientMouseEnter = useCallback(() => {
    pointerInsideGradientRef.current = true;
    setIsGradientHovered(true);
  }, []);

  const handleGradientMouseLeave = useCallback(() => {
    pointerInsideGradientRef.current = false;
    if (!isDraggingRange) {
      setIsGradientHovered(false);
      setHoverPosition(null);
      setTempRange(null);
    }
  }, [isDraggingRange]);

  const handleGradientMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isGradientHovered && !isDraggingRange) return;

      const value = getValueFromPosition(e.clientX, e.clientY);
      setHoverPosition(value);

      if (isDraggingRange) {
        const currentRange = tempRange || displayRange;
        let newRange: { min: number; max: number };

        if (isDraggingRange === "min") {
          newRange = {
            min: Math.min(value, currentRange.max),
            max: currentRange.max,
          };
        } else {
          newRange = {
            min: currentRange.min,
            max: Math.max(value, currentRange.min),
          };
        }

        setTempRange(newRange);
      }
    },
    [
      isGradientHovered,
      isDraggingRange,
      getValueFromPosition,
      tempRange,
      displayRange,
    ],
  );

  const handleGradientMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const value = getValueFromPosition(e.clientX, e.clientY);
      const currentRange = displayRange;

      const distToMin = Math.abs(value - currentRange.min);
      const distToMax = Math.abs(value - currentRange.max);

      const adjusting = distToMin < distToMax ? "min" : "max";
      setIsDraggingRange(adjusting);
      setTempRange(currentRange);
    },
    [getValueFromPosition, displayRange],
  );

  // Touch equivalents for gradient range interaction
  const handleGradientTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const touch = e.touches[0];
      const value = getValueFromPosition(touch.clientX, touch.clientY);
      const currentRange = displayRange;

      const distToMin = Math.abs(value - currentRange.min);
      const distToMax = Math.abs(value - currentRange.max);

      const adjusting = distToMin < distToMax ? "min" : "max";
      setIsDraggingRange(adjusting);
      setIsGradientHovered(true);
      setTempRange(currentRange);
    },
    [getValueFromPosition, displayRange],
  );

  const handleGradientMouseUp = useCallback(() => {
    if (isDraggingRange && tempRange) {
      const baseMin = fromDisplayValue(tempRange.min);
      const baseMax = fromDisplayValue(tempRange.max);
      onRangeChange?.({ min: baseMin, max: baseMax });
      setHasCustomRange(true);
    }
    setIsDraggingRange(null);
    setTempRange(null);
    // Keep hovered if pointer is still inside
    if (!pointerInsideGradientRef.current) {
      setIsGradientHovered(false);
    }
  }, [isDraggingRange, tempRange, fromDisplayValue, onRangeChange]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Re-sync hover state after colorbar data updates
  useEffect(() => {
    if (pointerInsideGradientRef.current) {
      setIsGradientHovered(true);
    }
  }, [colorScale, displayRange, rasterMeta]);

  // Initialize hasCustomRange based on customRange prop
  useEffect(() => {
    setHasCustomRange(Boolean(customRange?.enabled));
  }, [customRange?.enabled]);

  // Initialize position on mount
  useEffect(() => {
    if (
      !uiState.hasInitialized &&
      colorBarRef.current &&
      !uiState.isCollapsed
    ) {
      const timer = setTimeout(() => {
        const defaultPosition = getDefaultPosition();
        dispatch({ type: "INITIALIZE", payload: defaultPosition });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [uiState.hasInitialized, uiState.isCollapsed, getDefaultPosition]);

  useEffect(() => {
    if (uiState.hasInitialized && !uiState.isCollapsed) {
      const defaultPosition = getDefaultPosition();
      dispatch({ type: "RESET_POSITION", payload: defaultPosition });
    }
  }, [
    orientation,
    uiState.hasInitialized,
    uiState.isCollapsed,
    getDefaultPosition,
  ]);

  // Sync collapsed state from props
  useEffect(() => {
    dispatch({ type: "SET_COLLAPSED", payload: collapsed });
  }, [collapsed]);

  // Notify parent of position changes
  useEffect(() => {
    onPositionChange?.(uiState.position);
  }, [uiState.position, onPositionChange]);

  // Handle dragging (mouse + touch)
  useEffect(() => {
    if (!uiState.isDragging || uiState.isCollapsed) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newPos = {
        x: e.clientX - uiState.dragStart.x,
        y: e.clientY - uiState.dragStart.y,
      };
      dispatch({ type: "SET_POSITION", payload: clampPosition(newPos) });
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      const newPos = {
        x: touch.clientX - uiState.dragStart.x,
        y: touch.clientY - uiState.dragStart.y,
      };
      dispatch({ type: "SET_POSITION", payload: clampPosition(newPos) });
    };

    const handleMouseUp = () => {
      dispatch({ type: "STOP_DRAG" });
    };

    const handleTouchEnd = () => {
      dispatch({ type: "STOP_DRAG" });
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
  }, [
    uiState.isDragging,
    uiState.isCollapsed,
    uiState.dragStart,
    clampPosition,
  ]);

  // Handle global mouse/touch up for range dragging
  useEffect(() => {
    if (!isDraggingRange) return;

    const handleMouseUp = () => {
      handleGradientMouseUp();
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      const value = getValueFromPosition(touch.clientX, touch.clientY);
      setHoverPosition(value);

      const currentRange = tempRange || displayRange;
      let newRange: { min: number; max: number };

      if (isDraggingRange === "min") {
        newRange = {
          min: Math.min(value, currentRange.max),
          max: currentRange.max,
        };
      } else {
        newRange = {
          min: currentRange.min,
          max: Math.max(value, currentRange.min),
        };
      }

      setTempRange(newRange);
    };

    const handleTouchEnd = () => {
      handleGradientMouseUp();
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [
    isDraggingRange,
    handleGradientMouseUp,
    getValueFromPosition,
    tempRange,
    displayRange,
  ]);

  // Handle window resize
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
  // RENDER
  // ============================================================================

  const currentRange = tempRange || displayRange;
  const minPosition = getPositionFromValue(currentRange.min);
  const maxPosition = getPositionFromValue(currentRange.max);

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
          className="bg-card/90 border-border text-muted-foreground hover:text-card-foreground pointer-events-auto flex cursor-pointer items-center gap-2 rounded-xl border backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:shadow-lg"
          onClick={handleCollapseToggle}
        >
          <ChevronUp className="pointer-events-none sm:h-2 sm:w-2 lg:h-4 lg:w-4" />
          <span className="pointer-events-none font-medium select-none sm:text-xs lg:text-sm">
            Color Bar
          </span>
        </Button>
      ) : (
        <div
          className="border-border bg-card/90 text-primary group pointer-events-auto relative rounded-2xl border px-6 pt-6 pb-8 shadow-2xl backdrop-blur-md transition-all duration-200"
          onMouseEnter={() => setIsColorBarHovered(true)}
          onMouseLeave={() => setIsColorBarHovered(false)}
        >
          {/* Header Controls */}
          <div className="-mt-2 mb-4 flex w-full items-center justify-between gap-2">
            <button
              onClick={handleCollapseToggle}
              className="text-muted-foreground hover:text-card-foreground -m-1 flex cursor-pointer items-center rounded-full p-2 transition-all hover:bg-white/10 focus:outline-none"
              title="Collapse"
              type="button"
            >
              <ChevronDown className="h-4 w-4" />
            </button>

            <div
              className={`mx-2 flex h-6 flex-1 cursor-grab items-center justify-center gap-1 rounded-full px-3 transition-all hover:bg-white/10 ${uiState.isDragging ? "cursor-grabbing bg-white/20" : ""}`}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
              style={{ touchAction: "none" }}
              title="Drag to move"
            >
              <Move className="text-muted-foreground h-3 w-3" />
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
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          {/* Unit Selector */}
          <div className="mb-3">
            <div className="text-muted-foreground flex w-full items-center text-sm font-medium">
              {/* Fixed-width slot for reset button to prevent layout shift */}
              <div className="w-24">
                {hasCustomRange && (onRangeReset || onRangeChange) && (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={handleRangeReset}
                  >
                    Reset Range
                  </Button>
                )}
              </div>

              {/* Unit toggle pinned to the right */}
              {unitInfo.allowToggle ? (
                <button
                  type="button"
                  onClick={() =>
                    handleUnitChange(
                      unit === "celsius" ? "fahrenheit" : "celsius",
                    )
                  }
                  className="bg-card/80 hover:bg-card relative ml-auto inline-flex h-7 w-14 shrink-0 items-center rounded-lg border border-white/20 transition-colors focus:ring-2 focus:ring-white/50 focus:outline-none"
                >
                  <span
                    className={`inline-block h-7 w-7 transform rounded-lg bg-white/80 shadow-lg transition-transform ${
                      unit === "fahrenheit" ? "translate-x-7" : "translate-x-0"
                    }`}
                  />
                  <span
                    className={`absolute left-0 w-7 text-center text-sm font-semibold transition-colors ${
                      unit === "celsius" ? "text-gray-900" : "text-white"
                    }`}
                  >
                    C
                  </span>
                  <span
                    className={`absolute right-0 w-7 text-center text-sm font-semibold transition-colors ${
                      unit === "fahrenheit" ? "text-gray-900" : "text-white"
                    }`}
                  >
                    F
                  </span>
                </button>
              ) : (
                <span className="text-card-foreground ml-auto min-w-8 shrink-0 text-right font-mono text-sm">
                  {currentUnitSymbol || "–"}
                </span>
              )}
            </div>
          </div>

          {/* Color Scale with Interactive Range */}
          <div className="relative">
            {isVertical ? (
              <div className="flex w-full items-center justify-center">
                <div className="relative flex">
                  <div
                    ref={gradientRef}
                    className="relative h-64 w-16 cursor-crosshair rounded-lg bg-white/10 p-1 shadow-inner"
                    style={{
                      background: gradientBackground,
                      touchAction: "none",
                    }}
                    onMouseEnter={handleGradientMouseEnter}
                    onMouseLeave={handleGradientMouseLeave}
                    onMouseMove={handleGradientMouseMove}
                    onMouseDown={handleGradientMouseDown}
                    onTouchStart={handleGradientTouchStart}
                  >
                    {/* Range indicators */}
                    {(isGradientHovered || isDraggingRange) && (
                      <>
                        <div
                          className="absolute right-0 left-0 h-1 bg-white shadow-lg"
                          style={{ bottom: `${minPosition * 100}%` }}
                        />
                        <div
                          className="absolute right-0 left-0 h-1 bg-white shadow-lg"
                          style={{ bottom: `${maxPosition * 100}%` }}
                        />
                        <div
                          className="absolute right-0 left-0 border-y border-white/40 bg-white/20"
                          style={{
                            bottom: `${Math.min(minPosition * 100, maxPosition * 100)}%`,
                            height: `${Math.abs((maxPosition - minPosition) * 100)}%`,
                          }}
                        />
                      </>
                    )}
                  </div>
                  {isDraggingRange && tempRange && (
                    <div className="absolute top-1/2 left-full z-50 ml-2 -translate-y-1/2 rounded-lg bg-black/80 px-3 py-2 font-mono text-xs whitespace-nowrap text-white">
                      <div className="flex flex-col gap-1">
                        <div>
                          Min: {formatRangeValue(tempRange.min)}
                          {currentUnitSymbol}
                        </div>
                        <div>
                          Max: {formatRangeValue(tempRange.max)}
                          {currentUnitSymbol}
                        </div>
                      </div>
                    </div>
                  )}
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
              <div className="relative mx-auto w-70">
                <div
                  ref={gradientRef}
                  className="relative h-10 w-full cursor-crosshair rounded-xl shadow-inner"
                  style={{
                    background: gradientBackground,
                    touchAction: "none",
                  }}
                  onMouseEnter={handleGradientMouseEnter}
                  onMouseLeave={handleGradientMouseLeave}
                  onMouseMove={handleGradientMouseMove}
                  onMouseDown={handleGradientMouseDown}
                  onTouchStart={handleGradientTouchStart}
                >
                  {/* Range indicators */}
                  {(isGradientHovered || isDraggingRange) && (
                    <>
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-white shadow-lg"
                        style={{ left: `${minPosition * 100}%` }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-white shadow-lg"
                        style={{ left: `${maxPosition * 100}%` }}
                      />
                      <div
                        className="absolute top-0 bottom-0 border-x border-white/40 bg-white/20"
                        style={{
                          left: `${Math.min(minPosition * 100, maxPosition * 100)}%`,
                          width: `${Math.abs((maxPosition - minPosition) * 100)}%`,
                        }}
                      />
                    </>
                  )}
                </div>
                {isDraggingRange && tempRange && (
                  <div className="absolute -bottom-12 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-black/80 px-3 py-2 font-mono text-xs whitespace-nowrap text-white">
                    <div className="flex gap-3">
                      <div>
                        Min: {formatRangeValue(tempRange.min)}
                        {currentUnitSymbol}
                      </div>
                      <div>
                        Max: {formatRangeValue(tempRange.max)}
                        {currentUnitSymbol}
                      </div>
                    </div>
                  </div>
                )}
                {/* Labels below the gradient */}
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
