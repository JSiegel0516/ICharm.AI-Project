"use client";

import React, {
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useState,
  useReducer,
} from "react";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { Button } from "./button";
import { Slider } from "./slider";

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
        // Expanding
        return {
          ...state,
          isCollapsed: false,
          position: state.previousPosition,
        };
      } else {
        // Collapsing
        return {
          ...state,
          isCollapsed: true,
          previousPosition: state.position,
          position: { x: 24, y: window.innerHeight - 60 },
          showDropdown: false,
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
  customRange,
}) => {
  const colorBarRef = useRef<HTMLDivElement>(null);
  const isVertical = orientation === "vertical";
  const [rangeValue, setRangeValue] = useState<[number, number]>([0, 0]);
  const [isRangeEditing, setIsRangeEditing] = useState(false);

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
    const rawCandidates = [dataset.units, rasterMeta?.units].filter(
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

    // Check if dataset has temperature hints
    const parts = [
      dataset?.dataType,
      dataset?.name,
      dataset?.description,
      dataset?.backend?.datasetName,
      dataset?.backend?.layerParameter,
    ]
      .filter((v): v is string => typeof v === "string" && v.trim())
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

    return { isGodas, isNoaaGlobalTemp };
  }, [dataset]);

  const colorScale = useMemo(() => {
    const customRangeEnabled = Boolean(customRange?.enabled);
    const GODAS_DEFAULT_MIN = -0.0000005;
    const GODAS_DEFAULT_MAX = 0.0000005;
    const NOAAGLOBALTEMP_DEFAULT_MIN = -2;
    const NOAAGLOBALTEMP_DEFAULT_MAX = 2;
    const { isGodas, isNoaaGlobalTemp } = datasetFlags;

    // Prefer the dataset's baseline range for any obvious variant of NOAAGlobalTemp.
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

    const godasDefaultMin = isGodas ? GODAS_DEFAULT_MIN : null;
    const godasDefaultMax = isGodas ? GODAS_DEFAULT_MAX : null;
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

    // Use the actual range (no forced zero-centering)
    const rangeMin = safeMin;
    const rangeMax = safeMax;

    // Limit visible tick count so labels don't flood the UI while keeping band sharpness.
    const MAX_TICKS = 7;
    const labelCount = Math.min(
      MAX_TICKS,
      Math.max(dataset.colorScale.labels.length || 0, 2),
    );

    // Generate labels across the actual range
    const generateLabels = () => {
      if (labelCount <= 1 || Math.abs(rangeMax - rangeMin) < 1e-9) {
        return Array(labelCount).fill(rangeMin);
      }

      if (isGodas) {
        // Show only min and max for GODAS by default.
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

    if (!Number.isFinite(min)) min = 0;
    if (!Number.isFinite(max)) max = min + 1;
    if (min === max) {
      max = min + 1;
    }
    if (min > max) {
      [min, max] = [max, min];
    }

    return { min, max };
  }, [dataset?.colorScale?.min, dataset?.colorScale?.max, rasterMeta]);

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

  const sliderStep = useMemo(() => {
    const span = Math.abs(displayLimits.max - displayLimits.min);
    if (!Number.isFinite(span) || span <= 0) return 1;
    const rough = span / 200;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const normalized = rough / magnitude;
    let step = magnitude;
    if (normalized <= 1) step = 1 * magnitude;
    else if (normalized <= 2) step = 2 * magnitude;
    else if (normalized <= 5) step = 5 * magnitude;
    else step = 10 * magnitude;

    const safeStep = Number.parseFloat(step.toPrecision(2));
    return Number.isFinite(safeStep) && safeStep > 0 ? safeStep : rough;
  }, [displayLimits]);

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
      const cardHeight = colorBarElement ? colorBarElement.offsetHeight : 360;
      const x = window.innerWidth - cardWidth - margin;
      const verticalOffset = Math.round(window.innerHeight * 0.25);
      const y = verticalOffset;
      return { x, y };
    }

    const actualHeight = colorBarRef.current?.offsetHeight ?? 220;
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

  const handleUnitChange = useCallback(
    (newUnit: TemperatureUnit) => {
      if (!unitInfo.allowToggle) return;
      onUnitChange?.(newUnit);
      dispatch({ type: "CLOSE_DROPDOWN" });
    },
    [unitInfo.allowToggle, onUnitChange],
  );

  const handleRangeValueChange = useCallback((values: number[]) => {
    if (!Array.isArray(values) || values.length < 2) return;
    const min = Math.min(values[0], values[1]);
    const max = Math.max(values[0], values[1]);
    setIsRangeEditing(true);
    setRangeValue([min, max]);
  }, []);

  const handleRangeValueCommit = useCallback(
    (values: number[]) => {
      if (!Array.isArray(values) || values.length < 2) return;
      const min = Math.min(values[0], values[1]);
      const max = Math.max(values[0], values[1]);
      const clampedMin = Math.max(displayLimits.min, Math.min(min, max));
      const clampedMax = Math.min(displayLimits.max, Math.max(min, max));
      const baseMin = fromDisplayValue(clampedMin);
      const baseMax = fromDisplayValue(clampedMax);

      setIsRangeEditing(false);
      setRangeValue([clampedMin, clampedMax]);
      onRangeChange?.({ min: baseMin, max: baseMax });
    },
    [displayLimits, fromDisplayValue, onRangeChange],
  );

  const handleRangeReset = useCallback(() => {
    setIsRangeEditing(false);
    onRangeReset?.();
    if (!onRangeReset) {
      onRangeChange?.({ min: null, max: null });
    }
  }, [onRangeChange, onRangeReset]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

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

  useEffect(() => {
    if (isRangeEditing) return;
    const clampedMin = Math.max(
      displayLimits.min,
      Math.min(displayRange.min, displayLimits.max),
    );
    const clampedMax = Math.min(
      displayLimits.max,
      Math.max(displayRange.max, displayLimits.min),
    );
    setRangeValue([clampedMin, clampedMax]);
  }, [displayLimits, displayRange, isRangeEditing]);

  // Notify parent of position changes
  useEffect(() => {
    onPositionChange?.(uiState.position);
  }, [uiState.position, onPositionChange]);

  // Handle dragging
  useEffect(() => {
    if (!uiState.isDragging || uiState.isCollapsed) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newPos = {
        x: e.clientX - uiState.dragStart.x,
        y: e.clientY - uiState.dragStart.y,
      };
      dispatch({ type: "SET_POSITION", payload: clampPosition(newPos) });
    };

    const handleMouseUp = () => {
      dispatch({ type: "STOP_DRAG" });
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    uiState.isDragging,
    uiState.isCollapsed,
    uiState.dragStart,
    clampPosition,
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

  return (
    <div
      ref={colorBarRef}
      className="pointer-events-auto fixed"
      style={{
        left: `${uiState.position.x}px`,
        top: `${uiState.position.y}px`,
        zIndex: uiState.isCollapsed ? 1000 : 10,
      }}
    >
      {uiState.isCollapsed ? (
        <Button
          className="bg-card/80 border-border text-muted-foreground hover:text-card-foreground pointer-events-auto flex cursor-pointer items-center gap-2 rounded-xl border backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:shadow-lg"
          onClick={handleCollapseToggle}
        >
          <ChevronUp className="pointer-events-none h-4 w-4" />
          <span className="pointer-events-none text-sm font-medium select-none">
            Color Scale
          </span>
        </Button>
      ) : (
        <div className="border-border bg-card/80 text-primary group pointer-events-auto relative rounded-xl border px-6 py-6 backdrop-blur-sm">
          {/* Header Controls */}
          <div className="-mt-2 mb-2 flex w-full items-center justify-between gap-2">
            <button
              onClick={handleCollapseToggle}
              className="text-muted-foreground hover:text-card-foreground -m-1 flex cursor-pointer items-center p-1 focus:outline-none"
              title="Collapse"
              type="button"
            >
              <ChevronDown className="h-3 w-3" />
            </button>

            <div
              className={`mx-2 h-4 flex-1 select-none ${uiState.isDragging ? "cursor-grabbing" : "cursor-grab"}`}
              onMouseDown={handleMouseDown}
              title="Drag to move"
            >
              <div className="flex h-full items-center justify-center gap-1">
                <div className="dot"></div>
                <div className="dot"></div>
                <div className="dot"></div>
              </div>
            </div>

            <button
              onClick={handleResetPosition}
              className="text-muted-foreground hover:text-card-foreground -m-1 flex cursor-pointer items-center p-1 transition-colors focus:outline-none"
              title="Reset to default position"
              type="button"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>

          {/* Unit Selector */}
          <div className="relative mt-2 mb-10">
            <div className="text-muted-foreground flex w-full items-center justify-between gap-2 text-sm font-medium">
              <span>Unit</span>

              {unitInfo.allowToggle ? (
                <div className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/5 p-1">
                  <button
                    type="button"
                    onClick={() => handleUnitChange("celsius")}
                    className={`rounded px-2 py-1 text-xs font-semibold transition-colors focus:outline-none ${
                      unit === "celsius"
                        ? "bg-white text-gray-900"
                        : "text-gray-300 hover:text-white"
                    }`}
                  >
                    °C
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUnitChange("fahrenheit")}
                    className={`rounded px-2 py-1 text-xs font-semibold transition-colors focus:outline-none ${
                      unit === "fahrenheit"
                        ? "bg-white text-gray-900"
                        : "text-gray-300 hover:text-white"
                    }`}
                  >
                    °F
                  </button>
                </div>
              ) : (
                <span className="text-card-foreground ml-2 min-w-8 text-right">
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
                  <div className="h-64 w-14 rounded-lg bg-white/10 p-px shadow-inner">
                    <div
                      className="h-full w-full overflow-hidden rounded-[10px]"
                      style={{ background: gradientBackground }}
                    />
                  </div>
                  <div className="text-card-foreground absolute inset-y-4 left-full ml-4 flex flex-col justify-between text-right text-xs">
                    {labels.map((label, index) => (
                      <span key={index} className="leading-none">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative mx-auto w-60">
                <div
                  className="h-8 w-full rounded-md"
                  style={{ background: gradientBackground }}
                />
                <div className="absolute -top-4 left-0 flex w-full justify-between text-xs">
                  {labels.map((label, index) => (
                    <span
                      key={index}
                      className="text-card-foreground leading-none"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-border bg-card/90 pointer-events-none absolute top-full left-1/2 z-20 mt-3 w-72 -translate-x-1/2 rounded-xl border px-4 py-3 opacity-0 shadow-lg backdrop-blur-md transition-all duration-200 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
            <div className="text-muted-foreground mb-3 flex items-center justify-between text-xs font-medium">
              <span>Color Range</span>
              {(onRangeReset || onRangeChange) && (
                <button
                  type="button"
                  onClick={handleRangeReset}
                  className="text-muted-foreground hover:text-card-foreground text-xs transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
            <Slider
              min={displayLimits.min}
              max={displayLimits.max}
              step={sliderStep}
              value={rangeValue}
              onValueChange={handleRangeValueChange}
              onValueCommit={handleRangeValueCommit}
            />
            <div className="text-muted-foreground mt-2 flex items-center justify-between text-[11px]">
              <span>
                Min {formatRangeValue(rangeValue[0])}
                {currentUnitSymbol ? ` ${currentUnitSymbol}` : ""}
              </span>
              <span>
                Max {formatRangeValue(rangeValue[1])}
                {currentUnitSymbol ? ` ${currentUnitSymbol}` : ""}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ColorBar;
