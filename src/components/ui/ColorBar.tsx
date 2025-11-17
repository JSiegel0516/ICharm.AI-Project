"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";

// Mock types for the example
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
  const [showDropdown, setShowDropdown] = useState(false);
  const [position, setPosition] = useState({ x: 24, y: 24 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const [previousPosition, setPreviousPosition] = useState({ x: 24, y: 24 });
  const colorBarRef = useRef<HTMLDivElement>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  const defaultUnitSymbol = useMemo(() => {
    const rawCandidates = [dataset.units, rasterMeta?.units].filter(
      (value): value is string =>
        typeof value === "string" && value.trim() !== "",
    );

    let fallback = "";

    for (const raw of rawCandidates) {
      const normalized = raw.trim();
      const lower = normalized.toLowerCase();
      const alphaOnly = lower.replace(/[^a-z]/g, "");

      const isCelsius =
        normalized.includes("℃") ||
        lower.includes("celsius") ||
        lower.includes("celcius") ||
        lower.includes("°c") ||
        lower.includes("degc") ||
        alphaOnly === "c";
      if (isCelsius) {
        return "°C";
      }

      const isFahrenheit =
        normalized.includes("℉") ||
        lower.includes("fahrenheit") ||
        lower.includes("°f") ||
        lower.includes("degf") ||
        alphaOnly === "f";
      if (isFahrenheit) {
        return "°F";
      }

      const isKelvin =
        normalized.includes("K") ||
        lower.includes("kelvin") ||
        lower.includes("°k") ||
        lower.includes("degk") ||
        alphaOnly === "k";
      if (isKelvin) {
        return "K";
      }

      if (!fallback) {
        fallback = normalized;
      }
    }

    if (!fallback && typeof dataset.dataType === "string") {
      const typeLower = dataset.dataType.toLowerCase();
      if (typeLower === "temperature") {
        return "°C";
      }
    }

    return fallback;
  }, [dataset.units, rasterMeta?.units, dataset.dataType]);

  const hasTemperatureHints = useMemo(() => {
    const parts: string[] = [];

    const typeLower =
      typeof dataset?.dataType === "string"
        ? dataset.dataType.toLowerCase()
        : "";
    if (typeLower) {
      parts.push(typeLower);
    }

    const possibleKeys: Array<string | undefined | null> = [
      dataset?.name,
      dataset?.description,
      (dataset as any)?.category,
      dataset?.backend?.datasetName,
      dataset?.backend?.layerParameter,
      dataset?.backend?.datasetType,
    ];
    possibleKeys.forEach((value) => {
      if (typeof value === "string" && value.trim()) {
        parts.push(value);
      }
    });

    if (!parts.length) {
      return false;
    }

    const combined = parts.join(" ").toLowerCase();
    return (
      combined.includes("temp") ||
      combined.includes("°c") ||
      combined.includes("degc") ||
      combined.includes("sea surface") ||
      combined.includes("sst") ||
      combined.includes("surface temp")
    );
  }, [dataset]);

  const allowUnitToggle = useMemo(() => {
    return defaultUnitSymbol === "°C" && hasTemperatureHints;
  }, [defaultUnitSymbol, hasTemperatureHints]);

  const metaMin =
    typeof rasterMeta?.min === "number" && Number.isFinite(rasterMeta.min)
      ? rasterMeta.min
      : null;
  const metaMax =
    typeof rasterMeta?.max === "number" && Number.isFinite(rasterMeta.max)
      ? rasterMeta.max
      : null;

  const resolvedMin = metaMin ?? dataset.colorScale.min;
  const resolvedMax = metaMax ?? dataset.colorScale.max;
  const safeMin = Number.isFinite(resolvedMin) ? Number(resolvedMin) : 0;
  const safeMax = Number.isFinite(resolvedMax) ? Number(resolvedMax) : safeMin;
  const numericColorScaleLabels = useMemo(() => {
    const labels = dataset.colorScale.labels;
    if (!Array.isArray(labels) || !labels.length) {
      return null;
    }

    const parsed = labels.map((label) => {
      if (typeof label === "number" && Number.isFinite(label)) {
        return label;
      }

      if (typeof label === "string") {
        const match = label.trim().match(/-?\d+(\.\d+)?/);
        if (match) {
          const numeric = Number(match[0]);
          if (Number.isFinite(numeric)) {
            return numeric;
          }
        }
      }

      return null;
    });

    if (parsed.every((value) => typeof value === "number")) {
      return parsed as number[];
    }
    return null;
  }, [dataset.colorScale.labels]);

  const labelCount = useMemo(() => {
    if (numericColorScaleLabels?.length) {
      return numericColorScaleLabels.length;
    }
    return Math.max(
      dataset.colorScale.labels.length || 0,
      dataset.colorScale.colors.length || 0,
      2,
    );
  }, [
    dataset.colorScale.colors.length,
    dataset.colorScale.labels.length,
    numericColorScaleLabels,
  ]);

  const convertToFahrenheit = (value: number) => (value * 9) / 5 + 32;

  const formatLabelValue = (value: number) => {
    if (!Number.isFinite(value)) return "–";
    const rounded = Math.round(value);
    return (Object.is(rounded, -0) ? 0 : rounded).toString();
  };

  const isVertical = orientation === "vertical";

  // NEW: Function that uses ACTUAL measured height
  const getDefaultPosition = useCallback(() => {
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

    // For horizontal: use ACTUAL measured height from DOM
    const colorBarElement = colorBarRef.current;
    const actualHeight = colorBarElement ? colorBarElement.offsetHeight : 220;

    const x = margin;
    const y = window.innerHeight - actualHeight - margin;

    return { x, y };
  }, [isVertical]);

  const dynamicRangeActive = metaMin !== null && metaMax !== null;
  const forceDynamicLabels = defaultUnitSymbol === "K";

  const numericLabels = useMemo(() => {
    if (
      numericColorScaleLabels?.length &&
      !forceDynamicLabels &&
      !dynamicRangeActive
    ) {
      return numericColorScaleLabels;
    }

    if (labelCount <= 1 || Math.abs(safeMax - safeMin) < 1e-9) {
      return Array(labelCount).fill(safeMin);
    }

    return Array.from({ length: labelCount }, (_, index) => {
      return safeMin + ((safeMax - safeMin) * index) / (labelCount - 1);
    });
  }, [
    labelCount,
    numericColorScaleLabels,
    safeMax,
    safeMin,
    forceDynamicLabels,
    dynamicRangeActive,
  ]);

  const displayLabels = useMemo(() => {
    const values =
      allowUnitToggle && unit === "fahrenheit"
        ? numericLabels.map(convertToFahrenheit)
        : numericLabels;
    return values.map((val) => formatLabelValue(val));
  }, [allowUnitToggle, unit, numericLabels]);

  const verticalLabels = useMemo(
    () => [...displayLabels].reverse(),
    [displayLabels],
  );

  const gradientBackground = useMemo(
    () =>
      `linear-gradient(${isVertical ? "to top" : "to right"}, ${dataset.colorScale.colors.join(", ")})`,
    [isVertical, dataset.colorScale.colors],
  );

  const getUnitSymbol = () => {
    if (allowUnitToggle) {
      return unit === "fahrenheit" ? "°F" : "°C";
    }
    return defaultUnitSymbol || "";
  };

  const handleUnitChange = (newUnit: TemperatureUnit) => {
    if (!allowUnitToggle) return;
    if (onUnitChange) {
      onUnitChange(newUnit);
    }
    setShowDropdown(false);
  };

  const handleResetPosition = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isCollapsed && !isDragging) {
      const defaultPos = getDefaultPosition();
      setPosition(defaultPos);
      setPreviousPosition(defaultPos);
    }
  };

  const handleCollapseToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isDragging) {
      return;
    }

    setIsCollapsed((prev) => {
      if (prev) {
        // Expanding
        setPosition(previousPosition);
        return false;
      } else {
        // Collapsing
        setPreviousPosition(position);
        setPosition({ x: 24, y: window.innerHeight - 60 });
        return true;
      }
    });
    setShowDropdown(false);
  };

  useEffect(() => {
    setIsCollapsed(collapsed);
  }, [collapsed]);

  // NEW: Initialize position after component mounts and measures itself
  useEffect(() => {
    if (!hasInitialized && colorBarRef.current && !isCollapsed) {
      // Small delay to ensure DOM has rendered
      const timer = setTimeout(() => {
        const defaultPosition = getDefaultPosition();
        setPosition(defaultPosition);
        setPreviousPosition(defaultPosition);
        setHasInitialized(true);
      }, 0);

      return () => clearTimeout(timer);
    }
  }, [hasInitialized, getDefaultPosition, isCollapsed]);

  // Update position when orientation changes
  useEffect(() => {
    if (hasInitialized && !isCollapsed) {
      const defaultPosition = getDefaultPosition();
      setPosition(defaultPosition);
      setPreviousPosition(defaultPosition);
    }
  }, [orientation, hasInitialized, isCollapsed, getDefaultPosition]);

  useEffect(() => {
    if (onPositionChange) {
      onPositionChange(position);
    }
  }, [position, onPositionChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isCollapsed) return;

    e.preventDefault();
    e.stopPropagation();

    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || isCollapsed) return;

      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;

      const colorBarElement = colorBarRef.current;
      const colorBarWidth = colorBarElement ? colorBarElement.offsetWidth : 320;
      const colorBarHeight = colorBarElement
        ? colorBarElement.offsetHeight
        : 200;

      const maxX = window.innerWidth - colorBarWidth;
      const maxY = window.innerHeight - colorBarHeight;

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging && !isCollapsed) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragStart, isCollapsed]);

  const handleDropdownToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!allowUnitToggle || isCollapsed) {
      return;
    }
    if (!isDragging) {
      setShowDropdown(!showDropdown);
    }
  };

  useEffect(() => {
    const handleResize = () => {
      if (isCollapsed) {
        setPosition({ x: 24, y: window.innerHeight - 60 });
      } else {
        const colorBarElement = colorBarRef.current;
        if (!colorBarElement) return;

        const colorBarWidth = colorBarElement.offsetWidth;
        const colorBarHeight = colorBarElement.offsetHeight;

        const maxX = window.innerWidth - colorBarWidth;
        const maxY = window.innerHeight - colorBarHeight;

        setPosition((prevPosition) => ({
          x: Math.max(0, Math.min(prevPosition.x, maxX)),
          y: Math.max(0, Math.min(prevPosition.y, maxY)),
        }));
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isCollapsed]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        colorBarRef.current &&
        !colorBarRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showDropdown]);

  const unitSymbol = getUnitSymbol();

  return (
    <div
      ref={colorBarRef}
      className="pointer-events-auto fixed"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: isCollapsed ? 1000 : 10,
      }}
    >
      {isCollapsed ? (
        <div
          className="pointer-events-auto cursor-pointer rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-900/95 to-purple-900/95 backdrop-blur-sm transition-all duration-200 hover:shadow-lg"
          onClick={handleCollapseToggle}
          style={{ transform: "scale(1)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <div className="pointer-events-none px-3 py-2">
            <div className="flex items-center gap-2 text-blue-100 transition-colors hover:text-white">
              <ChevronUp className="h-4 w-4" />
              <span className="text-sm font-medium select-none">
                Color Scale
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div
          id="temperature"
          className="border-border bg-card/80 text-primary pointer-events-auto rounded-xl border px-6 py-6 backdrop-blur-sm"
        >
          <div className="-mt-2 mb-2 flex w-full items-center justify-between gap-2">
            <button
              onClick={handleCollapseToggle}
              className="text-muted-foreground hover:text-card-foreground z-10 -m-1 flex cursor-pointer items-center p-1 transition-colors focus:outline-none"
              title="Collapse"
              type="button"
            >
              <ChevronDown className="h-3 w-3" />
            </button>

            <div
              className={`h-4 flex-1 ${isDragging ? "cursor-grabbing" : "cursor-grab"} mx-2 select-none`}
              onMouseDown={handleMouseDown}
              title="Drag to move"
            >
              <div className="flex h-full items-center justify-center gap-1">
                <div className="h-1 w-1 rounded-full bg-blue-400"></div>
                <div className="h-1 w-1 rounded-full bg-blue-400"></div>
                <div className="h-1 w-1 rounded-full bg-blue-400"></div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleResetPosition}
                className="text-muted-foreground hover:text-card-foreground z-10 -m-1 flex cursor-pointer items-center p-1 transition-colors focus:outline-none"
                title="Reset to default position"
                type="button"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="relative mt-2 mb-10">
            <div className="text-muted-foreground flex w-full items-center justify-between gap-2 text-sm font-medium">
              <span>Unit of measurement</span>

              {allowUnitToggle ? (
                <div className="relative">
                  <button
                    onClick={handleDropdownToggle}
                    className="text-muted-foreground hover:text-card-foreground flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-colors focus:outline-none"
                    type="button"
                  >
                    <span>{unitSymbol}</span>
                    <ChevronDown
                      className={`h-3 w-3 transition-transform ${showDropdown ? "rotate-180" : ""}`}
                    />
                  </button>

                  {showDropdown && !isDragging && (
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
                <span className="min-w-8text-right text-card-foreground ml-2">
                  {unitSymbol || "–"}
                </span>
              )}
            </div>
          </div>

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
                    {verticalLabels.map((label, index) => (
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
                  {displayLabels.map((label, index) => (
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
