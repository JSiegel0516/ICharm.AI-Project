"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { ColorBarProps, TemperatureUnit } from "@/types";

const ColorBar: React.FC<ColorBarProps> = ({
  show,
  onToggle,
  dataset,
  unit = "celsius",
  onUnitChange,
  onPositionChange,
  collapsed = false,
  rasterMeta = null,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [position, setPosition] = useState({ x: 24, y: 24 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const [previousPosition, setPreviousPosition] = useState({ x: 24, y: 24 });
  const colorBarRef = useRef<HTMLDivElement>(null);

  const baseUnitRaw = rasterMeta?.units ?? dataset.units ?? "";
  const normalizedUnit = baseUnitRaw.trim();

  const defaultUnitSymbol = useMemo(() => {
    if (!normalizedUnit) return "";
    const lower = normalizedUnit.toLowerCase();
    if (lower.includes("degc") || lower.includes("celsius")) return "°C";
    if (lower.includes("degf") || lower.includes("fahrenheit")) return "°F";
    if (lower.includes("degk")) return "K";
    return normalizedUnit;
  }, [normalizedUnit]);

  const allowUnitToggle = useMemo(() => {
    return dataset.dataType === "temperature" && defaultUnitSymbol === "°C";
  }, [dataset.dataType, defaultUnitSymbol]);

  const resolvedMin = rasterMeta?.min ?? dataset.colorScale.min;
  const resolvedMax = rasterMeta?.max ?? dataset.colorScale.max;
  const safeMin = Number.isFinite(resolvedMin) ? Number(resolvedMin) : 0;
  const safeMax = Number.isFinite(resolvedMax) ? Number(resolvedMax) : safeMin;
  const labelCount = Math.max(
    dataset.colorScale.labels.length || 0,
    dataset.colorScale.colors.length || 0,
    2,
  );

  const convertToFahrenheit = (value: number) => (value * 9) / 5 + 32;

  const formatLabelValue = (value: number) => {
    if (!Number.isFinite(value)) return "–";
    const abs = Math.abs(value);
    if (abs >= 100 || abs === 0) return value.toFixed(0);
    if (abs >= 10) return value.toFixed(1);
    return value.toFixed(2);
  };

  const getDefaultPosition = () => {
    return { x: 24, y: window.innerHeight - 180 };
  };

  const getNumericLabels = () => {
    if (labelCount <= 1 || Math.abs(safeMax - safeMin) < 1e-9) {
      return Array(labelCount).fill(safeMin);
    }

    return Array.from({ length: labelCount }, (_, index) => {
      return safeMin + ((safeMax - safeMin) * index) / (labelCount - 1);
    });
  };

  const numericLabels = getNumericLabels();

  const getDisplayLabels = () => {
    const values =
      allowUnitToggle && unit === "fahrenheit"
        ? numericLabels.map(convertToFahrenheit)
        : numericLabels;
    return values.map((val) => formatLabelValue(val));
  };

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

  // FIX: Simplified collapse toggle with better event handling
  const handleCollapseToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    console.log("ColorBar collapse clicked", { isDragging, isCollapsed });

    if (isDragging) {
      console.log("Blocked: currently dragging");
      return;
    }

    setIsCollapsed((prev) => {
      console.log("ColorBar toggle: from", prev, "to", !prev);
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

  useEffect(() => {
    const initialPosition = getDefaultPosition();
    setPosition(initialPosition);
    setPreviousPosition(initialPosition);
  }, []);

  // Notify parent of position changes
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

  // FIX: Remove position from dependency array to prevent infinite loop
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
  }, [isDragging, dragStart, isCollapsed]); // Removed position from deps

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
        const colorBarWidth = colorBarElement
          ? colorBarElement.offsetWidth
          : 320;
        const colorBarHeight = colorBarElement
          ? colorBarElement.offsetHeight
          : 200;

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

  const displayLabels = getDisplayLabels();
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
          className="pointer-events-auto cursor-pointer rounded-xl border border-blue-500/20 bg-linear-to-br from-blue-900/95 to-purple-900/95 backdrop-blur-sm transition-all duration-200 hover:shadow-lg"
          onClick={(e) => {
            console.log("Collapsed div clicked");
            handleCollapseToggle(e);
          }}
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
          className="pointer-events-auto rounded-xl border border-gray-700/30 bg-neutral-800/60 px-6 py-6 text-blue-100 backdrop-blur-sm"
        >
          <div className="-mt-2 mb-2 flex h-4 w-full items-center justify-between">
            <button
              onClick={handleCollapseToggle}
              className="z-10 -m-1 flex cursor-pointer items-center p-1 text-blue-300 transition-colors hover:text-blue-200 focus:outline-none"
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

            <button
              onClick={handleResetPosition}
              className="z-10 -m-1 flex cursor-pointer items-center p-1 text-blue-300 transition-colors hover:text-blue-200 focus:outline-none"
              title="Reset to default position"
              type="button"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>

          <div className="relative mt-2 mb-12">
            {allowUnitToggle ? (
              <>
                <button
                  onClick={handleDropdownToggle}
                  className="flex w-full items-center justify-between text-sm font-medium text-blue-200 transition-colors hover:text-white focus:outline-none"
                  type="button"
                >
                  <span>Unit of measurement</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${showDropdown ? "rotate-180" : ""}`}
                  />
                </button>

                {showDropdown && !isDragging && (
                  <div className="absolute top-8 left-0 z-50 w-full rounded-md border border-gray-200 bg-white py-1 shadow-lg">
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
              </>
            ) : (
              <div className="flex w-full items-center justify-between text-sm font-medium text-blue-200">
                <span>Unit of measurement</span>
                <span className="text-blue-100">{unitSymbol || "–"}</span>
              </div>
            )}
          </div>

          <div className="relative">
            <div
              className="mx-auto h-8 w-60 rounded-md"
              style={{
                background: `linear-gradient(to right, ${dataset.colorScale.colors.join(", ")})`,
              }}
            />

            <div className="absolute -top-[65px] right-6 text-xs">
              <span className="font-medium text-blue-200">{unitSymbol}</span>
            </div>

            <div className="absolute -top-4 left-0 flex w-60 justify-between text-xs">
              {displayLabels.map((label, index) => (
                <span key={index} className="leading-none text-blue-200">
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ColorBar;
