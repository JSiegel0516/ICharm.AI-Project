"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { ChevronDown, X, MapPin, Calendar } from "lucide-react";
import { RegionInfoPanelProps } from "@/types";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

type TemperatureUnitInfo = {
  type: "celsius" | "fahrenheit" | "kelvin" | null;
  symbol: string;
};

const normalizeTemperatureUnit = (
  rawUnit?: string | null,
): TemperatureUnitInfo => {
  if (!rawUnit || !rawUnit.trim()) {
    return { type: null, symbol: "units" };
  }

  const normalized = rawUnit.trim();
  const lower = normalized.toLowerCase();
  const alphaOnly = lower.replace(/[^a-z]/g, "");

  const celsiusHints =
    normalized.includes("℃") ||
    lower.includes("celsius") ||
    lower.includes("celcius") ||
    lower.includes("°c") ||
    lower.includes("degc") ||
    alphaOnly === "c";
  if (celsiusHints) {
    return { type: "celsius", symbol: "°C" };
  }

  const fahrenheitHints =
    normalized.includes("℉") ||
    lower.includes("fahrenheit") ||
    lower.includes("°f") ||
    lower.includes("degf") ||
    alphaOnly === "f";
  if (fahrenheitHints) {
    return { type: "fahrenheit", symbol: "°F" };
  }

  const kelvinHints =
    normalized.includes("K") ||
    lower.includes("kelvin") ||
    lower.includes("°k") ||
    lower.includes("degk") ||
    alphaOnly === "k";
  if (kelvinHints) {
    return { type: "kelvin", symbol: "K" };
  }

  return { type: null, symbol: normalized };
};

const hasTemperatureHints = (
  dataset?: RegionInfoPanelProps["currentDataset"],
): boolean => {
  if (!dataset) {
    return false;
  }

  const parts: string[] = [];
  const typeLower =
    typeof dataset.dataType === "string" ? dataset.dataType.toLowerCase() : "";
  if (typeLower) {
    parts.push(typeLower);
  }

  const possibleKeys: Array<string | undefined | null> = [
    dataset.name,
    dataset.description,
    (dataset as any)?.category,
    dataset.backend?.datasetName,
    dataset.backend?.layerParameter,
    dataset.backend?.datasetType,
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
};

const celsiusToFahrenheit = (value: number) => (value * 9) / 5 + 32;

type SeriesPoint = {
  date: string;
  value: number | null;
};

type DateRangeOption =
  | "all"
  | "1year"
  | "6months"
  | "3months"
  | "1month"
  | "custom";

const RegionInfoPanel: React.FC<RegionInfoPanelProps> = ({
  show,
  onClose,
  latitude = 21.25,
  longitude = -71.25,
  regionData = {
    name: "GPCP V2.3 Precipitation",
    precipitation: 0.9,
    temperature: 24.5,
    dataset: "Global Precipitation Climatology Project",
    unit: "mm/day",
  },
  colorBarPosition = { x: 24, y: 300 },
  colorBarCollapsed = false,
  colorBarOrientation = "horizontal",
  className = "",
  currentDataset,
  selectedDate,
  temperatureUnit = "celsius",
}) => {
  const getDefaultPosition = () => {
    if (typeof window !== "undefined") {
      return { x: window.innerWidth - 350, y: 200 };
    }
    return { x: 1000, y: 200 };
  };

  const [position, setPosition] = useState(getDefaultPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [previousPosition, setPreviousPosition] = useState(getDefaultPosition);
  const panelRef = useRef<HTMLDivElement>(null);

  const [timeseriesOpen, setTimeseriesOpen] = useState(false);
  const [timeseriesLoading, setTimeseriesLoading] = useState(false);
  const [timeseriesError, setTimeseriesError] = useState<string | null>(null);
  const [timeseriesSeries, setTimeseriesSeries] = useState<SeriesPoint[]>([]);
  const [timeseriesUnits, setTimeseriesUnits] = useState<string | null>(null);

  const [dateRangeOption, setDateRangeOption] =
    useState<DateRangeOption>("1year");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  const datasetUnit = regionData.unit ?? currentDataset?.units ?? "units";

  const datasetIdentifier =
    currentDataset?.backend?.datasetName ??
    currentDataset?.name ??
    regionData.dataset ??
    "";

  const datasetUnitInfo = useMemo(
    () => normalizeTemperatureUnit(datasetUnit),
    [datasetUnit],
  );

  const datasetLooksTemperature = useMemo(
    () => hasTemperatureHints(currentDataset),
    [currentDataset],
  );

  const useFahrenheit =
    datasetLooksTemperature &&
    datasetUnitInfo.type === "celsius" &&
    temperatureUnit === "fahrenheit";

  const displayUnitLabel = useMemo(
    () =>
      useFahrenheit ? "°F" : datasetUnitInfo.symbol || datasetUnit || "units",
    [useFahrenheit, datasetUnitInfo.symbol, datasetUnit],
  );

  const resolvedTimeseriesUnit = useMemo(
    () =>
      useFahrenheit
        ? "°F"
        : (timeseriesUnits ?? datasetUnitInfo.symbol ?? datasetUnit ?? "units"),
    [useFahrenheit, timeseriesUnits, datasetUnitInfo.symbol, datasetUnit],
  );

  const primaryValueSource =
    typeof regionData.precipitation === "number"
      ? regionData.precipitation
      : typeof regionData.temperature === "number"
        ? regionData.temperature
        : 0;

  const convertedPrimaryValue = useFahrenheit
    ? celsiusToFahrenheit(primaryValueSource)
    : primaryValueSource;

  const formattedPrimaryValue = Number.isFinite(convertedPrimaryValue)
    ? convertedPrimaryValue.toFixed(2)
    : "0.00";

  const chartData = useMemo(() => {
    return timeseriesSeries.map((entry) => {
      if (entry.value == null || !Number.isFinite(entry.value)) {
        return { date: entry.date, value: null };
      }

      const numericValue = Number(entry.value);
      const convertedValue = useFahrenheit
        ? celsiusToFahrenheit(numericValue)
        : numericValue;

      return {
        date: entry.date,
        value: Number(convertedValue.toFixed(2)),
      };
    });
  }, [timeseriesSeries, useFahrenheit]);

  const [zoomWindow, setZoomWindow] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (isCollapsed && typeof window !== "undefined") {
      const colorBarWidth = colorBarCollapsed ? 160 : 320;
      const gap = colorBarCollapsed ? 4 : 8;
      const collapsedHeight = 52;
      const newX = colorBarPosition.x + colorBarWidth + gap;
      const newY = window.innerHeight - collapsedHeight - 16;
      setPosition({ x: newX, y: newY });
    }
  }, [isCollapsed, colorBarPosition.x, colorBarCollapsed]);

  useEffect(() => {
    setZoomWindow(null);
  }, [chartData]);

  const displayedChartData = useMemo(() => {
    if (!zoomWindow || chartData.length === 0) {
      return chartData;
    }
    const [start, end] = zoomWindow;
    return chartData.slice(start, Math.min(end + 1, chartData.length));
  }, [chartData, zoomWindow]);

  const yAxisDomain = useMemo(() => {
    const values = displayedChartData
      .map((point) => point.value)
      .filter((value): value is number => typeof value === "number");
    if (!values.length) {
      return undefined;
    }
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return undefined;
    }
    if (min === max) {
      const padding = Math.abs(min) * 0.05 || 1;
      min -= padding;
      max += padding;
    } else {
      const padding = (max - min) * 0.1;
      min -= padding;
      max += padding;
    }
    return [min, max] as [number, number];
  }, [displayedChartData]);

  const handleChartWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (chartData.length === 0) {
        return;
      }
      event.preventDefault();
      const directionIn = event.deltaY < 0;
      setZoomWindow((current) => {
        const total = chartData.length;
        const currentWindow = current ?? [0, total - 1];
        let [start, end] = currentWindow;
        const windowSize = end - start + 1;
        const minWindow = Math.max(5, Math.ceil(total * 0.05));
        const zoomStep = Math.max(1, Math.ceil(windowSize * 0.1));

        if (directionIn) {
          if (windowSize <= minWindow) {
            return currentWindow;
          }
          start = Math.min(start + zoomStep, end - minWindow + 1);
          end = Math.max(end - zoomStep, start + minWindow - 1);
          return [start, end];
        }

        start = Math.max(0, start - zoomStep);
        end = Math.min(total - 1, end + zoomStep);

        if (start === 0 && end === total - 1) {
          return null;
        }

        return [start, end];
      });
    },
    [chartData],
  );

  const datasetId = useMemo(() => {
    return (
      currentDataset?.backend?.id ??
      currentDataset?.backendId ??
      currentDataset?.id ??
      null
    );
  }, [currentDataset]);

  const datasetStart = useMemo(() => {
    if (!currentDataset?.backend?.startDate && !currentDataset?.startDate)
      return null;
    const dateStr =
      currentDataset.backend?.startDate ?? currentDataset.startDate;
    const parsed = new Date(dateStr);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [currentDataset]);

  const datasetEnd = useMemo(() => {
    if (!currentDataset?.backend?.endDate && !currentDataset?.endDate)
      return null;
    const dateStr = currentDataset.backend?.endDate ?? currentDataset.endDate;
    const parsed = new Date(dateStr);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [currentDataset]);

  const isHighFrequencyDataset = useMemo(() => {
    const datasetName = (currentDataset?.name || "").toLowerCase();
    return datasetName.includes("vegetation") || datasetName.includes("ndvi");
  }, [currentDataset]);

  const getOppositeColorBarAnchor = useCallback(() => {
    if (typeof window === "undefined") {
      return colorBarOrientation === "vertical"
        ? { x: 24, y: 180 }
        : { x: 24, y: 120 };
    }

    const margin = 16;
    if (colorBarOrientation === "vertical") {
      const estimatedHeight = 290;
      return { x: margin, y: window.innerHeight - estimatedHeight - margin };
    }

    const cardWidth = 280;
    const verticalOffset = Math.round(window.innerHeight * 0.2);
    return { x: window.innerWidth - cardWidth - margin, y: verticalOffset };
  }, [colorBarOrientation]);

  useEffect(() => {
    if (show) {
      const initialPos = getOppositeColorBarAnchor();
      setPosition(initialPos);
      setPreviousPosition(initialPos);
    }
  }, [show, getOppositeColorBarAnchor]);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === "undefined") return;

      if (isCollapsed) {
        const colorBarWidth = colorBarCollapsed ? 160 : 320;
        const gap = colorBarCollapsed ? 4 : 8;
        const collapsedHeight = 52;
        const newX = colorBarPosition.x + colorBarWidth + gap;
        const newY = window.innerHeight - collapsedHeight - 16;
        setPosition({ x: newX, y: newY });
      } else if (panelRef.current) {
        const panelWidth = panelRef.current.offsetWidth;
        const panelHeight = panelRef.current.offsetHeight;

        setPosition((prev) => ({
          x: Math.min(prev.x, window.innerWidth - panelWidth),
          y: Math.min(prev.y, window.innerHeight - panelHeight),
        }));
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, [isCollapsed, colorBarPosition.x, colorBarCollapsed]);

  const handleClose = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };

  const handleCollapseToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isDragging) {
      return;
    }

    setIsCollapsed((prev) => {
      if (prev) {
        setPosition(previousPosition);
        return false;
      } else {
        setPreviousPosition(position);
        if (typeof window !== "undefined") {
          const colorBarWidth = colorBarCollapsed ? 160 : 320;
          const gap = colorBarCollapsed ? 4 : 8;
          const collapsedHeight = 52;
          const newX = colorBarPosition.x + colorBarWidth + gap;
          const newY = window.innerHeight - collapsedHeight - 16;
          setPosition({ x: newX, y: newY });
        }
        return true;
      }
    });
  };

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

      const panelElement = panelRef.current;
      const panelWidth = panelElement ? panelElement.offsetWidth : 300;
      const panelHeight = panelElement ? panelElement.offsetHeight : 200;

      const maxX = window.innerWidth - panelWidth;
      const maxY = window.innerHeight - panelHeight;

      setPosition({
        x: Math.min(Math.max(0, newX), maxX),
        y: Math.min(Math.max(0, newY), maxY),
      });
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragStart, isCollapsed]);

  const calculateDateRange = (): { start: Date; end: Date } => {
    let targetDate = selectedDate ?? datasetEnd ?? new Date();

    if (datasetStart && targetDate < datasetStart) {
      targetDate = datasetStart;
    }
    if (datasetEnd && targetDate > datasetEnd) {
      targetDate = datasetEnd;
    }

    let startDate: Date;
    let endDate: Date;

    if (isHighFrequencyDataset) {
      startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      endDate = new Date(
        targetDate.getFullYear(),
        targetDate.getMonth() + 1,
        0,
        23,
        59,
        59,
      );
    } else {
      switch (dateRangeOption) {
        case "all":
          startDate =
            datasetStart ?? new Date(targetDate.getFullYear() - 10, 0, 1);
          endDate = datasetEnd ?? targetDate;
          break;

        case "1year":
          startDate = new Date(
            targetDate.getFullYear() - 1,
            targetDate.getMonth(),
            1,
          );
          endDate = new Date(
            targetDate.getFullYear(),
            targetDate.getMonth() + 1,
            0,
            23,
            59,
            59,
          );
          break;

        case "6months":
          startDate = new Date(
            targetDate.getFullYear(),
            targetDate.getMonth() - 6,
            1,
          );
          endDate = new Date(
            targetDate.getFullYear(),
            targetDate.getMonth() + 1,
            0,
            23,
            59,
            59,
          );
          break;

        case "3months":
          startDate = new Date(
            targetDate.getFullYear(),
            targetDate.getMonth() - 3,
            1,
          );
          endDate = new Date(
            targetDate.getFullYear(),
            targetDate.getMonth() + 1,
            0,
            23,
            59,
            59,
          );
          break;

        case "1month":
          startDate = new Date(
            targetDate.getFullYear(),
            targetDate.getMonth(),
            1,
          );
          endDate = new Date(
            targetDate.getFullYear(),
            targetDate.getMonth() + 1,
            0,
            23,
            59,
            59,
          );
          break;

        case "custom":
          if (customStartDate && customEndDate) {
            startDate = new Date(customStartDate);
            endDate = new Date(customEndDate);
            endDate.setHours(23, 59, 59, 999);
          } else {
            startDate = new Date(
              targetDate.getFullYear() - 1,
              targetDate.getMonth(),
              1,
            );
            endDate = new Date(
              targetDate.getFullYear(),
              targetDate.getMonth() + 1,
              0,
              23,
              59,
              59,
            );
          }
          break;

        default:
          startDate = new Date(
            targetDate.getFullYear() - 1,
            targetDate.getMonth(),
            1,
          );
          endDate = new Date(
            targetDate.getFullYear(),
            targetDate.getMonth() + 1,
            0,
            23,
            59,
            59,
          );
      }
    }

    if (datasetStart && startDate < datasetStart) {
      startDate = datasetStart;
    }
    if (datasetEnd && endDate > datasetEnd) {
      endDate = datasetEnd;
    }

    return { start: startDate, end: endDate };
  };

  const handleTimeseriesClick = async () => {
    setTimeseriesOpen(true);

    if (!datasetId) {
      console.error("[Timeseries] No dataset ID found");
      console.log("[Timeseries] currentDataset:", currentDataset);
      setTimeseriesError(
        "No dataset selected. Please select a dataset from the sidebar.",
      );
      setTimeseriesSeries([]);
      setTimeseriesUnits(null);
      return;
    }

    const { start: startDate, end: endDate } = calculateDateRange();

    setTimeseriesLoading(true);
    setTimeseriesError(null);

    try {
      const focusCoords = `${latitude},${longitude}`;

      const formatDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      const payload = {
        datasetIds: [datasetId],
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        focusCoordinates: focusCoords,
        aggregation: "mean",
        includeStatistics: false,
        includeMetadata: true,
      };

      console.log("[Timeseries] Request payload:", payload);
      console.log("[Timeseries] Date range:", {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        rangeOption: isHighFrequencyDataset ? "single-month" : dateRangeOption,
        datasetType: isHighFrequencyDataset ? "high-frequency" : "regular",
      });
      console.log("[Timeseries] Fetching from: /api/v2/timeseries/extract");

      const response = await fetch(
        "http://localhost:8000/api/v2/timeseries/extract",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      console.log("[Timeseries] Response status:", response.status);
      console.log("[Timeseries] Response headers:", response.headers);

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error(
          "[Timeseries] Non-JSON response:",
          text.substring(0, 500),
        );
        throw new Error(
          `Server returned ${response.status}: ${response.statusText}. Expected JSON but got ${contentType}`,
        );
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData?.detail || `Request failed with status ${response.status}`,
        );
      }

      const result = await response.json();
      console.log("[Timeseries] Full API Response:", result);
      console.log("[Timeseries] Data array length:", result?.data?.length);
      console.log(
        "[Timeseries] First 3 data points:",
        result?.data?.slice(0, 3),
      );
      console.log("[Timeseries] Processing info:", result?.processingInfo);

      if (!result?.data || !Array.isArray(result.data)) {
        throw new Error("Invalid response format");
      }

      const series: SeriesPoint[] = result.data.map((point: any) => ({
        date: point.date,
        value: point.values?.[datasetId] ?? null,
      }));

      console.log("[Timeseries] Transformed series length:", series.length);
      console.log("[Timeseries] First 3 series points:", series.slice(0, 3));
      console.log(
        "[Timeseries] Non-null values:",
        series.filter((p) => p.value !== null).length,
      );

      const units = result.metadata?.[datasetId]?.units ?? datasetUnit;

      setTimeseriesSeries(series);
      setTimeseriesUnits(units);

      console.log(
        `[Timeseries] Loaded ${series.length} data points for ${currentDataset?.name}`,
      );
      console.log(
        `[Timeseries] Date range: ${series[0]?.date} to ${series[series.length - 1]?.date}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load timeseries";
      console.error("[Timeseries] Error:", message);
      setTimeseriesError(message);
      setTimeseriesSeries([]);
      setTimeseriesUnits(null);
    } finally {
      setTimeseriesLoading(false);
    }
  };

  console.log("[RegionInfoPanel] Debug info:", {
    currentDataset: currentDataset,
    datasetId: datasetId,
    hasBackend: !!currentDataset?.backend,
    backendId: currentDataset?.backend?.id,
    directId: currentDataset?.id,
    isHighFrequency: isHighFrequencyDataset,
    dateRangeOption: dateRangeOption,
  });

  if (!show) return null;

  return (
    <div
      ref={panelRef}
      className={`pointer-events-auto fixed z-20 ${className}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: isCollapsed ? 1000 : 20,
      }}
    >
      {isCollapsed ? (
        <div
          className="cursor-pointer rounded-xl border border-gray-600/30 bg-gray-800/95 backdrop-blur-sm transition-all duration-200 hover:border-gray-500/50 hover:shadow-lg"
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
            <div className="flex items-center gap-2 text-gray-300 transition-colors hover:text-white">
              <MapPin className="h-4 w-4" />
              <span className="text-sm font-medium select-none">
                Region Info
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="min-w-60 rounded-xl border border-gray-600/30 bg-gray-800/95 px-4 py-4 text-gray-200 shadow-xl backdrop-blur-sm">
          <div className="-mt-1 mb-3 flex h-3 w-full items-center justify-between">
            <button
              onClick={handleCollapseToggle}
              className="z-10 -m-2 flex cursor-pointer items-center p-2 text-gray-400 transition-colors hover:text-gray-200 focus:outline-none"
              title="Collapse"
              type="button"
            >
              <ChevronDown className="h-3 w-3" />
            </button>

            <div
              className={`h-3 flex-1 ${isDragging ? "cursor-grabbing" : "cursor-grab"} mx-2 select-none`}
              onMouseDown={handleMouseDown}
              title="Drag to move"
            >
              <div className="flex h-full items-center justify-center gap-1">
                <div className="h-0.5 w-0.5 rounded-full bg-gray-500"></div>
                <div className="h-0.5 w-0.5 rounded-full bg-gray-500"></div>
                <div className="h-0.5 w-0.5 rounded-full bg-gray-500"></div>
              </div>
            </div>

            <button
              onClick={handleClose}
              className="z-10 -m-2 flex cursor-pointer items-center p-2 text-gray-400 transition-colors hover:text-gray-200 focus:outline-none"
              title="Close"
              type="button"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <div className="text-sm font-medium text-white">
                {latitude.toFixed(2)}°, {longitude.toFixed(2)}°
              </div>
            </div>

            <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-3">
              <div className="text-center">
                <div className="mb-1 font-mono text-2xl font-bold text-white">
                  {formattedPrimaryValue}{" "}
                  <span className="text-base font-normal text-gray-400">
                    {displayUnitLabel}
                  </span>
                </div>
                <div className="text-sm text-gray-400">
                  {currentDataset?.name ||
                    regionData.name ||
                    datasetIdentifier ||
                    "Value"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-gray-700/30 bg-gray-900/30 p-2">
                <div className="mb-1 text-xs text-gray-400">Lat</div>
                <div className="font-mono text-sm font-medium text-white">
                  {Math.abs(latitude).toFixed(2)}° {latitude >= 0 ? "N" : "S"}
                </div>
              </div>
              <div className="rounded-lg border border-gray-700/30 bg-gray-900/30 p-2">
                <div className="mb-1 text-xs text-gray-400">Lon</div>
                <div className="font-mono text-sm font-medium text-white">
                  {Math.abs(longitude).toFixed(2)}° {longitude >= 0 ? "E" : "W"}
                </div>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleTimeseriesClick}
                disabled={!datasetId}
                title={
                  !datasetId
                    ? "Select a dataset first"
                    : "View time series for this location"
                }
                className="relative flex w-full items-center justify-center gap-2 rounded-lg border border-gray-600/50 bg-gray-800/70 px-4 py-2 text-sm font-semibold text-gray-100 transition-colors outline-none hover:border-gray-400 hover:bg-gray-700 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span>Time Series</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {timeseriesOpen && (
        <div
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-6"
          onClick={() => setTimeseriesOpen(false)}
        >
          <div
            className="relative w-full max-w-4xl rounded-xl border border-gray-700 bg-gray-900/95 p-6 text-gray-200 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setTimeseriesOpen(false)}
              className="absolute top-4 right-4 rounded-full border border-gray-600/40 p-1 text-gray-400 transition-colors hover:border-gray-500/60 hover:text-white"
              title="Close"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white">
                {currentDataset?.name || "Time Series"}
              </h2>
              <p className="text-sm text-gray-400">
                {latitude.toFixed(2)}°, {longitude.toFixed(2)}°
              </p>
            </div>

            {!isHighFrequencyDataset && (
              <div className="mb-4 space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Calendar className="h-4 w-4" />
                  Date Range
                </label>

                <div className="flex flex-wrap gap-2">
                  <select
                    value={dateRangeOption}
                    onChange={(e) =>
                      setDateRangeOption(e.target.value as DateRangeOption)
                    }
                    className="rounded-lg border border-gray-600/40 bg-gray-800 px-3 py-2 text-sm text-gray-200 transition-colors hover:border-gray-500/60 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="1month">1 Month</option>
                    <option value="3months">3 Months</option>
                    <option value="6months">6 Months</option>
                    <option value="1year">1 Year</option>
                    <option value="all">All Available Data</option>
                    <option value="custom">Custom Range</option>
                  </select>

                  {dateRangeOption === "custom" && (
                    <>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        min={datasetStart?.toISOString().split("T")[0]}
                        max={datasetEnd?.toISOString().split("T")[0]}
                        className="rounded-lg border border-gray-600/40 bg-gray-800 px-3 py-2 text-sm text-gray-200 transition-colors hover:border-gray-500/60 focus:border-blue-500 focus:outline-none"
                      />
                      <span className="flex items-center text-gray-400">
                        to
                      </span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        min={
                          customStartDate ||
                          datasetStart?.toISOString().split("T")[0]
                        }
                        max={datasetEnd?.toISOString().split("T")[0]}
                        className="rounded-lg border border-gray-600/40 bg-gray-800 px-3 py-2 text-sm text-gray-200 transition-colors hover:border-gray-500/60 focus:border-blue-500 focus:outline-none"
                      />
                    </>
                  )}

                  <button
                    onClick={handleTimeseriesClick}
                    className="rounded-lg border border-blue-500/50 bg-blue-600/20 px-4 py-2 text-sm font-medium text-blue-300 transition-colors hover:border-blue-400 hover:bg-blue-600/30"
                    disabled={timeseriesLoading}
                  >
                    {timeseriesLoading ? "Loading..." : "Update"}
                  </button>
                </div>
              </div>
            )}

            <div
              className="relative h-80 w-full overflow-hidden rounded-lg border border-gray-700/50 bg-gray-900/50"
              onWheel={handleChartWheel}
            >
              {zoomWindow && (
                <button
                  onClick={() => setZoomWindow(null)}
                  className="absolute top-3 right-3 z-10 rounded-md border border-slate-600 bg-slate-800/80 px-3 py-1 text-xs text-slate-200 transition-colors hover:border-slate-400 hover:bg-slate-700/80"
                >
                  Reset zoom
                </button>
              )}
              {timeseriesLoading ? (
                <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
                  Loading timeseries...
                </div>
              ) : timeseriesError ? (
                <div className="flex h-full w-full items-center justify-center p-4 text-center text-sm text-red-400">
                  {timeseriesError}
                </div>
              ) : displayedChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayedChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      tick={{ fontSize: 12 }}
                      allowDuplicatedCategory={false}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tick={{ fontSize: 12 }}
                      domain={yAxisDomain ?? ["auto", "auto"]}
                      label={{
                        value: resolvedTimeseriesUnit,
                        angle: -90,
                        position: "insideLeft",
                        fill: "#94a3b8",
                        fontSize: 12,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1f2937",
                        border: "1px solid #374151",
                        borderRadius: "0.5rem",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="value"
                      name={currentDataset?.name || "Value"}
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
                  No timeseries data available.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegionInfoPanel;
