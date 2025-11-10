"use client";

import React, {
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useReducer,
} from "react";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { Button } from "./button";

// Types
type TemperatureUnit = "celsius" | "fahrenheit";

interface ColorBarProps {
  show: boolean;
  onToggle?: () => void;
  dataset: any;
  unit?: TemperatureUnit;
  onUnitChange?: (unit: TemperatureUnit) => void;
  onPositionChange?: (position: { x: number; y: number }) => void;
  collapsed?: boolean;
  rasterMeta?: any;
  orientation?: "horizontal" | "vertical";
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
  showDropdown: boolean;
  hasInitialized: boolean;
};

type UIAction =
  | { type: "SET_POSITION"; payload: Position }
  | { type: "START_DRAG"; payload: Position }
  | { type: "STOP_DRAG" }
  | { type: "TOGGLE_COLLAPSE" }
  | { type: "SET_COLLAPSED"; payload: boolean }
  | { type: "TOGGLE_DROPDOWN" }
  | { type: "CLOSE_DROPDOWN" }
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
          showDropdown: false,
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

    case "TOGGLE_DROPDOWN":
      return { ...state, showDropdown: !state.showDropdown };

    case "CLOSE_DROPDOWN":
      return { ...state, showDropdown: false };

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
  dataset,
  unit = "celsius",
  onUnitChange,
  onPositionChange,
  collapsed = false,
  rasterMeta = null,
  orientation = "horizontal",
}) => {
  const colorBarRef = useRef<HTMLDivElement>(null);
  const isVertical = orientation === "vertical";

  const [uiState, dispatch] = useReducer(uiReducer, {
    position: { x: 24, y: 24 },
    previousPosition: { x: 24, y: 24 },
    isCollapsed: collapsed,
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    showDropdown: false,
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

  const colorScale = useMemo(() => {
    const metaMin =
      typeof rasterMeta?.min === "number" && Number.isFinite(rasterMeta.min)
        ? rasterMeta.min
        : null;
    const metaMax =
      typeof rasterMeta?.max === "number" && Number.isFinite(rasterMeta.max)
        ? rasterMeta.max
        : null;

    const min = metaMin ?? dataset.colorScale.min;
    const max = metaMax ?? dataset.colorScale.max;
    const safeMin = Number.isFinite(min) ? Number(min) : 0;
    const safeMax = Number.isFinite(max) ? Number(max) : safeMin;

    // Parse numeric labels from dataset
    const numericLabels = dataset.colorScale.labels
      .map((label: any) => {
        if (typeof label === "number" && Number.isFinite(label)) return label;
        if (typeof label === "string") {
          const match = label.trim().match(/-?\d+(\.\d+)?/);
          if (match) {
            const num = Number(match[0]);
            if (Number.isFinite(num)) return num;
          }
        }
        return null;
      })
      .filter((v: any): v is number => v !== null);

    const labelCount = Math.max(
      dataset.colorScale.labels.length || 0,
      dataset.colorScale.colors.length || 0,
      2,
    );

    // Decide whether to use dynamic range
    const useDynamicRange =
      (metaMin !== null && metaMax !== null) || unitInfo.symbol === "K";

    // Generate labels
    let labels: number[];
    if (numericLabels.length && !useDynamicRange) {
      labels = numericLabels;
    } else if (labelCount <= 1 || Math.abs(safeMax - safeMin) < 1e-9) {
      labels = Array(labelCount).fill(safeMin);
    } else {
      labels = Array.from(
        { length: labelCount },
        (_, i) => safeMin + ((safeMax - safeMin) * i) / (labelCount - 1),
      );
    }

    return { labels, colors: dataset.colorScale.colors };
  }, [dataset.colorScale, rasterMeta, unitInfo.symbol]);

  const displayLabels = useMemo(() => {
    const values =
      unitInfo.allowToggle && unit === "fahrenheit"
        ? colorScale.labels.map((v) => (v * 9) / 5 + 32)
        : colorScale.labels;

    return values.map((v) => {
      if (!Number.isFinite(v)) return "–";
      const rounded = Math.round(v);
      return (Object.is(rounded, -0) ? 0 : rounded).toString();
    });
  }, [colorScale.labels, unitInfo.allowToggle, unit]);

  const labels = isVertical ? [...displayLabels].reverse() : displayLabels;

  const gradientBackground = `linear-gradient(${isVertical ? "to top" : "to right"}, ${colorScale.colors.join(", ")})`;

  // ============================================================================
  // POSITIONING LOGIC
  // ============================================================================

  const getDefaultPosition = useCallback((): Position => {
    if (typeof window === "undefined") {
      return isVertical ? { x: 24, y: 120 } : { x: 24, y: 180 };
    }

    const margin = 24;

    if (isVertical) {
      const offset = Math.round(window.innerHeight * 0.05);
      const cardWidth = 200;
      const cardHeight = 360;
      const x = Math.max(margin, window.innerWidth - cardWidth - margin - 12);
      const targetTop =
        Math.round(window.innerHeight * 0.25) - cardHeight / 2 + offset;
      const y = Math.max(
        margin,
        Math.min(targetTop, window.innerHeight - cardHeight - margin),
      );
      return { x, y };
    }

    const actualHeight = colorBarRef.current?.offsetHeight ?? 220;
    return { x: margin, y: window.innerHeight - actualHeight - margin };
  }, [isVertical]);

  const forceDynamicLabels = defaultUnitSymbol === "K";

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
        dispatch({ type: "TOGGLE_COLLAPSE" });
      }
    },
    [uiState.isDragging],
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

  const handleDropdownToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!unitInfo.allowToggle || uiState.isCollapsed || uiState.isDragging)
        return;
      dispatch({ type: "TOGGLE_DROPDOWN" });
    },
    [unitInfo.allowToggle, uiState.isCollapsed, uiState.isDragging],
  );

  const handleUnitChange = useCallback(
    (newUnit: TemperatureUnit) => {
      if (!unitInfo.allowToggle) return;
      onUnitChange?.(newUnit);
      dispatch({ type: "CLOSE_DROPDOWN" });
    },
    [unitInfo.allowToggle, onUnitChange],
  );

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

  // Update position when orientation changes
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

  // Close dropdown on outside click
  useEffect(() => {
    if (!uiState.showDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        colorBarRef.current &&
        !colorBarRef.current.contains(event.target as Node)
      ) {
        dispatch({ type: "CLOSE_DROPDOWN" });
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [uiState.showDropdown]);

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
        <div className="border-border bg-card/80 text-primary pointer-events-auto rounded-xl border px-6 py-6 backdrop-blur-sm">
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
                <div className="relative">
                  <button
                    onClick={handleDropdownToggle}
                    className="text-muted-foreground hover:text-card-foreground flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-colors focus:outline-none"
                    type="button"
                  >
                    <span>{currentUnitSymbol}</span>
                    <ChevronDown
                      className={`h-3 w-3 transition-transform ${uiState.showDropdown ? "rotate-180" : ""}`}
                    />
                  </button>

                  {uiState.showDropdown && !uiState.isDragging && (
                    <div className="absolute top-7 right-0 z-50 w-32 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                      <button
                        onClick={() => handleUnitChange("celsius")}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 focus:outline-none ${
                          unit === "celsius"
                            ? "bg-blue-50 text-blue-600"
                            : "text-gray-700"
                        }`}
                        type="button"
                      >
                        Celsius (°C)
                      </button>
                      <button
                        onClick={() => handleUnitChange("fahrenheit")}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 focus:outline-none ${
                          unit === "fahrenheit"
                            ? "bg-blue-50 text-blue-600"
                            : "text-gray-700"
                        }`}
                        type="button"
                      >
                        Fahrenheit (°F)
                      </button>
                    </div>
                  )}
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
        </div>
      )}
    </div>
  );
};
export default ColorBar;
