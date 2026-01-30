"use client";

import { Monitor } from "lucide-react";
import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import {
  ChevronDown,
  X,
  MapPin,
  Calendar,
  Activity,
  Loader2,
  Download,
} from "lucide-react";
import { RegionInfoPanelProps } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartConfig, ChartContainer } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Types
type TemperatureUnitInfo = {
  type: "celsius" | "fahrenheit" | "kelvin" | null;
  symbol: string;
};

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

type Position = { x: number; y: number };

// Constants
const COLLAPSED_HEIGHT = 52;
const COLLAPSED_WIDTH = 225;
const DEFAULT_PANEL_WIDTH = 300;
const DEFAULT_PANEL_HEIGHT = 200;
const MARGIN = 16;

const chartConfig = {
  desktop: {
    label: "Desktop",
    icon: Monitor,
    color: "#2563eb",
  },
} satisfies ChartConfig;

// Helper Functions
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

const celsiusToFahrenheit = (value: number): number => (value * 9) / 5 + 32;

const formatValue = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return "--";

  const abs = Math.abs(value);
  if (abs === 0) return "0";
  if (abs < 1e-4) return value.toExponential(2);
  if (abs < 1) return Number(value.toPrecision(3)).toString();
  if (abs < 10) return value.toFixed(2);
  if (abs < 100) return value.toFixed(1);
  return value.toFixed(0);
};

const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const downloadFile = (content: string, filename: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const RegionInfoPanel: React.FC<RegionInfoPanelProps> = ({
  show,
  onClose,
  latitude = 0,
  longitude = 0,
  regionData = {
    name: "No data",
    precipitation: null,
    temperature: null,
    dataset: "No dataset selected",
    unit: "units",
  },
  colorBarPosition = { x: 24, y: 300 },
  colorBarCollapsed = false,
  colorBarOrientation = "horizontal",
  className = "",
  currentDataset,
  selectedDate,
  temperatureUnit = "celsius",
}) => {
  // Refs
  const panelRef = useRef<HTMLDivElement>(null);

  // Position State
  const getDefaultPosition = useCallback((): Position => {
    if (typeof window === "undefined") {
      return { x: 800, y: 200 };
    }
    const cardWidth = 280;
    const verticalOffset = Math.round(window.innerHeight * 0.2);
    return {
      x: window.innerWidth - cardWidth - MARGIN - 200,
      y: verticalOffset,
    };
  }, []);

  const [position, setPosition] = useState<Position>(getDefaultPosition);
  const [previousPosition, setPreviousPosition] =
    useState<Position>(getDefaultPosition);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Drag State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 });

  // Timeseries State
  const [timeseriesOpen, setTimeseriesOpen] = useState(false);
  const [timeseriesLoading, setTimeseriesLoading] = useState(false);
  const [timeseriesError, setTimeseriesError] = useState<string | null>(null);
  const [timeseriesSeries, setTimeseriesSeries] = useState<SeriesPoint[]>([]);
  const [timeseriesUnits, setTimeseriesUnits] = useState<string | null>(null);
  const [dateRangeOption, setDateRangeOption] =
    useState<DateRangeOption>("1year");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [zoomWindow, setZoomWindow] = useState<[number, number] | null>(null);

  // Export Dialog State
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Memoized Values
  const datasetUnit = useMemo(
    () => regionData.unit ?? currentDataset?.units ?? "units",
    [regionData.unit, currentDataset?.units],
  );

  const datasetIdentifier = useMemo(
    () => currentDataset?.name ?? regionData.dataset ?? "No dataset",
    [currentDataset, regionData.dataset],
  );

  const datasetUnitInfo = useMemo(
    () => normalizeTemperatureUnit(datasetUnit),
    [datasetUnit],
  );

  const useFahrenheit = useMemo(
    () =>
      datasetUnitInfo.type === "celsius" && temperatureUnit === "fahrenheit",
    [datasetUnitInfo.type, temperatureUnit],
  );

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

  const primaryValueSource = useMemo(() => {
    if (typeof regionData.temperature === "number") {
      return regionData.temperature;
    }
    if (typeof regionData.precipitation === "number") {
      return regionData.precipitation;
    }
    return null;
  }, [regionData.temperature, regionData.precipitation]);

  const convertedPrimaryValue = useMemo(() => {
    if (primaryValueSource === null) return null;
    return useFahrenheit
      ? celsiusToFahrenheit(primaryValueSource)
      : primaryValueSource;
  }, [primaryValueSource, useFahrenheit]);

  const formattedPrimaryValue = useMemo(
    () => formatValue(convertedPrimaryValue),
    [convertedPrimaryValue],
  );

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

  const displayedChartData = useMemo(() => {
    if (!zoomWindow || chartData.length === 0) {
      return chartData;
    }
    const [start, end] = zoomWindow;
    return chartData.slice(start, Math.min(end + 1, chartData.length));
  }, [chartData, zoomWindow]);

  const yAxisDomain = useMemo((): [number, number] | undefined => {
    const values = displayedChartData
      .map((point) => point.value)
      .filter((value): value is number => typeof value === "number");

    if (!values.length) return undefined;

    let min = Math.min(...values);
    let max = Math.max(...values);

    if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;

    if (min === max) {
      const padding = Math.abs(min) * 0.05 || 1;
      min -= padding;
      max += padding;
    } else {
      const padding = (max - min) * 0.1;
      min -= padding;
      max += padding;
    }

    return [min, max];
  }, [displayedChartData]);

  const datasetId = useMemo(() => {
    return currentDataset?.id ?? currentDataset?.id ?? null;
  }, [currentDataset]);

  const datasetStart = useMemo(() => {
    if (!currentDataset?.startDate && !currentDataset?.startDate) return null;
    const dateStr = currentDataset.startDate ?? currentDataset.startDate;
    const parsed = new Date(dateStr);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [currentDataset]);

  const datasetEnd = useMemo(() => {
    if (!currentDataset?.endDate && !currentDataset?.endDate) return null;
    const dateStr = currentDataset.endDate ?? currentDataset.endDate;
    const parsed = new Date(dateStr);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [currentDataset]);

  const isHighFrequencyDataset = useMemo(() => {
    const datasetName = (currentDataset?.name || "").toLowerCase();
    return datasetName.includes("vegetation") || datasetName.includes("ndvi");
  }, [currentDataset]);

  // Check if we have loaded timeseries data
  const hasTimeseriesData = useMemo(() => {
    return chartData.length > 0 && !timeseriesLoading && !timeseriesError;
  }, [chartData.length, timeseriesLoading, timeseriesError]);

  // Event Handlers
  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    },
    [onClose],
  );

  const handleCollapseToggle = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (isDragging) return;

      setIsCollapsed((prev) => {
        if (prev) {
          setPosition(previousPosition);
          return false;
        } else {
          setPreviousPosition(position);
          if (typeof window !== "undefined") {
            setPosition({
              x: window.innerWidth - COLLAPSED_WIDTH,
              y: window.innerHeight - 60,
            });
          }
          return true;
        }
      });
    },
    [isDragging, previousPosition, position],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isCollapsed) return;

      e.preventDefault();
      e.stopPropagation();

      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    },
    [isCollapsed, position],
  );

  const calculateDateRange = useCallback((): { start: Date; end: Date } => {
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
  }, [
    selectedDate,
    datasetEnd,
    datasetStart,
    isHighFrequencyDataset,
    dateRangeOption,
    customStartDate,
    customEndDate,
  ]);

  const handleTimeseriesClick = useCallback(async () => {
    setTimeseriesOpen(true);

    if (!datasetId) {
      console.error("[Timeseries] No dataset ID found");
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

      const response = await fetch("/api/timeseries/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      console.log("[Timeseries] Response status:", response.status);

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error(
          "[Timeseries] Non-JSON response:",
          text.substring(0, 500),
        );
        throw new Error(
          `Server returned ${response.status}: ${response.statusText}`,
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

      if (!result?.data || !Array.isArray(result.data)) {
        throw new Error("Invalid response format");
      }

      const series: SeriesPoint[] = result.data.map((point: any) => ({
        date: point.date,
        value: point.values?.[datasetId] ?? null,
      }));

      const units = result.metadata?.[datasetId]?.units ?? datasetUnit;

      setTimeseriesSeries(series);
      setTimeseriesUnits(units);

      console.log(`[Timeseries] Loaded ${series.length} data points`);
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
  }, [datasetId, calculateDateRange, latitude, longitude, datasetUnit]);

  const handleExportCSV = useCallback(() => {
    if (!chartData.length) return;

    const headers = ["Date", `Value (${resolvedTimeseriesUnit})`];
    const rows = chartData.map((point) => [
      point.date,
      point.value !== null ? point.value.toString() : "",
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
      "\n",
    );

    const filename = `timeseries_${latitude.toFixed(2)}_${longitude.toFixed(2)}_${new Date().toISOString().split("T")[0]}.csv`;
    downloadFile(csv, filename, "text/csv");
    setShowExportDialog(false);
  }, [chartData, resolvedTimeseriesUnit, latitude, longitude]);

  const handleExportJSON = useCallback(() => {
    if (!chartData.length) return;

    const exportData = {
      metadata: {
        dataset: currentDataset?.name || datasetIdentifier,
        location: {
          latitude,
          longitude,
        },
        unit: resolvedTimeseriesUnit,
        exportDate: new Date().toISOString(),
        dataPoints: chartData.length,
      },
      data: chartData,
    };

    const json = JSON.stringify(exportData, null, 2);
    const filename = `timeseries_${latitude.toFixed(2)}_${longitude.toFixed(2)}_${new Date().toISOString().split("T")[0]}.json`;
    downloadFile(json, filename, "application/json");
    setShowExportDialog(false);
  }, [
    chartData,
    currentDataset,
    datasetIdentifier,
    latitude,
    longitude,
    resolvedTimeseriesUnit,
  ]);

  const handleChartWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (chartData.length === 0) return;

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
          if (windowSize <= minWindow) return currentWindow;
          start = Math.min(start + zoomStep, end - minWindow + 1);
          end = Math.max(end - zoomStep, start + minWindow - 1);
          return [start, end];
        }

        start = Math.max(0, start - zoomStep);
        end = Math.min(total - 1, end + zoomStep);

        if (start === 0 && end === total - 1) return null;

        return [start, end];
      });
    },
    [chartData],
  );

  // Effects
  useEffect(() => {
    if (show) {
      const initialPos = getDefaultPosition();
      setPosition(initialPos);
      setPreviousPosition(initialPos);
    }
  }, [show, getDefaultPosition]);

  useEffect(() => {
    if (isCollapsed && typeof window !== "undefined") {
      const colorBarWidth = colorBarCollapsed ? 160 : 320;
      const gap = colorBarCollapsed ? 4 : 8;
      const newX = colorBarPosition.x + colorBarWidth + gap;
      const newY = window.innerHeight - COLLAPSED_HEIGHT - MARGIN;
      setPosition({ x: newX, y: newY });
    }
  }, [isCollapsed, colorBarPosition.x, colorBarCollapsed]);

  useEffect(() => {
    setZoomWindow(null);
  }, [chartData]);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === "undefined") return;

      if (isCollapsed) {
        const colorBarWidth = colorBarCollapsed ? 160 : 320;
        const gap = colorBarCollapsed ? 4 : 8;
        const newX = colorBarPosition.x + colorBarWidth + gap;
        const newY = window.innerHeight - COLLAPSED_HEIGHT - MARGIN;
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

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || isCollapsed) return;

      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;

      const panelElement = panelRef.current;
      const panelWidth = panelElement
        ? panelElement.offsetWidth
        : DEFAULT_PANEL_WIDTH;
      const panelHeight = panelElement
        ? panelElement.offsetHeight
        : DEFAULT_PANEL_HEIGHT;

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

  if (!show) return null;

  return (
    <div
      ref={panelRef}
      className={`pointer-events-auto fixed transition-all duration-150 ${className}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: isCollapsed ? 1000 : 20,
      }}
    >
      {isCollapsed ? (
        <div
          className="border-border bg-card hover:bg-muted/50 cursor-pointer rounded-lg border px-3 py-2 transition-all duration-200 hover:scale-105 hover:shadow-lg sm:rounded-xl"
          onClick={handleCollapseToggle}
        >
          <div className="pointer-events-none">
            <div className="text-muted-foreground hover:text-card-foreground flex items-center gap-2 transition-colors">
              <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="text-xs font-medium select-none sm:text-sm">
                Region Info
              </span>
            </div>
          </div>
        </div>
      ) : (
        <Card className="max-w-xs">
          <CardHeader>
            <div className="flex items-center justify-between gap-1">
              <button
                onClick={handleCollapseToggle}
                className="text-muted-foreground hover:text-card-foreground z-10 flex cursor-pointer items-center p-1 transition-colors focus:outline-none"
                title="Collapse"
                type="button"
              >
                <ChevronDown className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              </button>

              <div
                className={`flex h-3 items-center justify-center gap-0.5 px-2 sm:h-3.5 sm:gap-1 ${isDragging ? "cursor-grabbing" : "cursor-grab"} select-none`}
                onMouseDown={handleMouseDown}
                title="Drag to move"
              >
                <div className="dot"></div>
                <div className="dot"></div>
                <div className="dot"></div>
              </div>

              <button
                onClick={handleClose}
                className="text-muted-foreground hover:text-card-foreground z-10 flex cursor-pointer items-center p-1 transition-colors focus:outline-none"
                title="Close"
                type="button"
              >
                <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              </button>
            </div>
            <CardTitle className="flex flex-row items-center justify-center gap-2 text-center text-lg sm:text-xl">
              <MapPin className="text-muted-foreground h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {Math.abs(latitude).toFixed(2)}° {latitude >= 0 ? "N" : "S"},{" "}
              {Math.abs(longitude).toFixed(2)}° {longitude >= 0 ? "E" : "W"}
            </CardTitle>
            <CardDescription className="text-center text-xs sm:text-sm">
              Latitude, Longitude
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="space-y-3">
              <div className="bg-secondary/40 border-border rounded-lg border p-2 sm:p-3">
                <div className="text-center">
                  <div className="mb-1 font-mono text-lg font-bold text-white sm:text-xl">
                    {formattedPrimaryValue}{" "}
                    <span className="text-lg font-normal text-white sm:text-xl">
                      {displayUnitLabel}
                    </span>
                  </div>
                  <div className="text-muted-foreground text-xs sm:text-sm">
                    {currentDataset?.name ||
                      regionData.name ||
                      datasetIdentifier ||
                      "No dataset selected"}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-2">
            {/* View Time Series Button */}
            <Dialog open={timeseriesOpen} onOpenChange={setTimeseriesOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  onClick={handleTimeseriesClick}
                  disabled={!datasetId}
                  title={
                    !datasetId
                      ? "Select a dataset first"
                      : "View time series for this location"
                  }
                  className="w-full"
                >
                  View Time Series
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[825px]">
                <DialogHeader>
                  <DialogTitle className="text-base sm:text-lg">
                    {currentDataset?.name || "Time Series"}
                  </DialogTitle>
                  <DialogDescription className="text-xs sm:text-sm">
                    Location: {latitude.toFixed(2)}°, {longitude.toFixed(2)}°
                  </DialogDescription>
                </DialogHeader>

                {/* Date Range Selector - Only show for non-high-frequency datasets */}
                {!isHighFrequencyDataset && (
                  <div className="space-y-2">
                    <label className="text-card-foreground flex items-center gap-2 text-xs font-medium sm:text-sm">
                      <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      Date Range
                    </label>

                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                      <NativeSelect
                        value={dateRangeOption}
                        onChange={(e) =>
                          setDateRangeOption(e.target.value as DateRangeOption)
                        }
                      >
                        <NativeSelectOption value="1month">
                          1 Month
                        </NativeSelectOption>
                        <NativeSelectOption value="3months">
                          3 Months
                        </NativeSelectOption>
                        <NativeSelectOption value="6months">
                          6 Months
                        </NativeSelectOption>
                        <NativeSelectOption value="1year">
                          1 Year
                        </NativeSelectOption>
                      </NativeSelect>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTimeseriesClick}
                        disabled={timeseriesLoading}
                      >
                        {timeseriesLoading ? "Loading..." : "Update"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Chart Area */}
                <div
                  className="relative h-64 w-full overflow-hidden rounded-lg border border-gray-700 sm:h-80"
                  onWheel={handleChartWheel}
                >
                  {timeseriesLoading ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500 sm:h-8 sm:w-8"></div>
                        <p className="text-muted-foreground text-xs sm:text-sm">
                          Loading timeseries data...
                        </p>
                      </div>
                    </div>
                  ) : timeseriesError ? (
                    <div className="flex h-full w-full items-center justify-center p-4">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <div className="rounded-full bg-red-900/20 p-2 sm:p-3">
                          <svg
                            className="h-5 w-5 text-red-400 sm:h-6 sm:w-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </div>
                        <p className="text-xs text-red-400 sm:text-sm">
                          {timeseriesError}
                        </p>
                      </div>
                    </div>
                  ) : chartData.length > 0 ? (
                    <ChartContainer
                      config={chartConfig}
                      className="h-full w-full"
                    >
                      <LineChart
                        accessibilityLayer
                        data={displayedChartData}
                        margin={{
                          top: 10,
                          right: 10,
                          bottom: 10,
                          left: 10,
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis
                          dataKey="date"
                          stroke="#94a3b8"
                          tick={{ fontSize: 10 }}
                          tickLine={{ stroke: "#4b5563" }}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          tick={{ fontSize: 10 }}
                          tickLine={{ stroke: "#4b5563" }}
                          domain={yAxisDomain}
                          label={{
                            value: resolvedTimeseriesUnit,
                            angle: -90,
                            position: "insideLeft",
                            fill: "#94a3b8",
                            fontSize: 10,
                          }}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "#1f2937",
                            border: "1px solid #374151",
                            borderRadius: "0.5rem",
                            padding: "8px 12px",
                          }}
                          labelStyle={{
                            color: "#e5e7eb",
                            marginBottom: "4px",
                            fontSize: "12px",
                          }}
                          itemStyle={{
                            color: "#38bdf8",
                            fontSize: "12px",
                          }}
                        />
                        <Legend
                          wrapperStyle={{
                            paddingTop: "10px",
                            fontSize: "12px",
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          name={currentDataset?.name || "Value"}
                          stroke="#38bdf8"
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                          activeDot={{ r: 4, strokeWidth: 0 }}
                        />
                      </LineChart>
                    </ChartContainer>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <div className="rounded-full bg-gray-700/50 p-2 sm:p-3">
                          <svg
                            className="h-5 w-5 text-gray-400 sm:h-6 sm:w-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                            />
                          </svg>
                        </div>
                        <p className="text-muted-foreground text-xs sm:text-sm">
                          Click on the globe to select a location
                        </p>
                        <p className="text-muted-foreground text-[10px] sm:text-xs">
                          Time series data will appear here
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <div className="flex gap-2">
                    {/* Export Data Button - Only show when data is loaded */}
                    {hasTimeseriesData && (
                      <Dialog
                        open={showExportDialog}
                        onOpenChange={setShowExportDialog}
                      >
                        <DialogTrigger asChild>
                          <Button variant="default" size="sm">
                            <Download className="mr-2 h-4 w-4" />
                            Export Data
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                          <DialogHeader>
                            <DialogTitle>Export Time Series Data</DialogTitle>
                            <DialogDescription>
                              Choose a format to download your time series data
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 py-4">
                            <Button
                              onClick={handleExportCSV}
                              className="w-full justify-start"
                              variant="outline"
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Export as CSV (Spreadsheet)
                            </Button>
                            <Button
                              onClick={handleExportJSON}
                              className="w-full justify-start"
                              variant="outline"
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Export as JSON (Raw Data)
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                  <DialogClose asChild>
                    <Button variant="outline" size="sm">
                      Close
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardFooter>
        </Card>
      )}
    </div>
  );
};

export default RegionInfoPanel;
