"use client";
import { Monitor } from "lucide-react";
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
  Card,
  CardAction,
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
  BarChart,
  Bar,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
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

const chartConfig = {
  desktop: {
    label: "Desktop",
    icon: Monitor,
    // A color like 'hsl(220, 98%, 61%)' or 'var(--color-name)'
    color: "#2563eb",
  },
} satisfies ChartConfig;

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

  // Date range selection state
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

  // Get the dataset ID - try multiple possible locations
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

  // Determine if this dataset should use the legacy single-month range (e.g., NDVI)
  const isHighFrequencyDataset = useMemo(() => {
    const datasetName = (currentDataset?.name || "").toLowerCase();
    return datasetName.includes("vegetation") || datasetName.includes("ndvi");
  }, [currentDataset]);

  useEffect(() => {
    if (show && typeof window !== "undefined") {
      const initialPos = { x: window.innerWidth - 350, y: 200 };
      setPosition(initialPos);
      setPreviousPosition(initialPos);
    }
  }, [show]);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === "undefined") return;

      if (!isCollapsed && panelRef.current) {
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
  }, [isCollapsed]);

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
          setPosition({
            x: window.innerWidth - 225,
            y: window.innerHeight - 60,
          });
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

  // Calculate date range based on selected option
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

    // For high-frequency datasets (CMORPH, NDVI), always use the selected month
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
      // For regular datasets, use the selected range option
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
            // Fallback to 1 year if custom dates not set
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

    // Clamp to dataset bounds
    if (datasetStart && startDate < datasetStart) {
      startDate = datasetStart;
    }
    if (datasetEnd && endDate > datasetEnd) {
      endDate = datasetEnd;
    }

    return { start: startDate, end: endDate };
  };

  // Dynamic timeseries handler using your backend API
  const handleTimeseriesClick = async () => {
    setTimeseriesOpen(true);

    // Check if we have a valid dataset ID
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
      // Format coordinates string for focusCoordinates parameter
      const focusCoords = `${latitude},${longitude}`;

      // Format dates as YYYY-MM-DD (backend expects this format)
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

      // Check content type before parsing
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

      // Extract data from API response
      if (!result?.data || !Array.isArray(result.data)) {
        throw new Error("Invalid response format");
      }

      // Transform API response to SeriesPoint format
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

      // Get units from metadata
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

  // Add this right before "if (!show) return null;"
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
          className="border-border bg-card hover:bg-muted-foreground cursor-pointer rounded-xl border transition-all duration-200 hover:border-gray-500/50 hover:shadow-lg"
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
            <div className="text-muted-foreground hover:text-card-foreground flex items-center gap-2 transition-colors">
              <MapPin className="h-4 w-4" />
              <span className="text-sm font-medium select-none">
                Region Info
              </span>
            </div>
          </div>
        </div>
      ) : (
        <Card className="bg-card w-full max-w-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-1">
              <button
                onClick={handleCollapseToggle}
                className="z-10 flex cursor-pointer items-center p-1 text-gray-400 transition-colors hover:text-gray-200 focus:outline-none"
                title="Collapse"
                type="button"
              >
                <ChevronDown className="h-3 w-3" />
              </button>

              <div
                className={`flex h-3 items-center justify-center gap-1 px-2 ${isDragging ? "cursor-grabbing" : "cursor-grab"} select-none`}
                onMouseDown={handleMouseDown}
                title="Drag to move"
              >
                <div className="dot"></div>
                <div className="dot"></div>
                <div className="dot"></div>
              </div>

              <button
                onClick={handleClose}
                className="z-10 flex cursor-pointer items-center p-1 text-gray-400 transition-colors hover:text-gray-200 focus:outline-none"
                title="Close"
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>
                <div className="flex flex-row gap-4 text-sm font-medium text-white">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  {latitude.toFixed(2)}°, {longitude.toFixed(2)}°
                </div>
              </CardTitle>
            </div>
            <CardDescription>
              Click on the globe to view data for any location
            </CardDescription>
          </CardHeader>

          <CardContent className="">
            <div className="space-y-3">
              <div className="bg-secondary/40 border-border rounded-lg border p-3">
                <div className="text-center">
                  <div className="mb-1 font-mono text-2xl font-bold text-white">
                    {(regionData.precipitation ?? 0).toFixed(2)}{" "}
                    <span className="text-base font-normal text-gray-400">
                      {datasetUnit}
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
                <div className="border-border bg-secondary/40 rounded-lg border p-2">
                  <div className="mb-1 text-xs text-gray-400">Lat</div>
                  <div className="font-mono text-sm font-medium text-white">
                    {Math.abs(latitude).toFixed(2)}° {latitude >= 0 ? "N" : "S"}
                  </div>
                </div>
                <div className="border-border bg-secondary/40 rounded-lg border p-2">
                  <div className="mb-1 text-xs text-gray-400">Lon</div>
                  <div className="font-mono text-sm font-medium text-white">
                    {Math.abs(longitude).toFixed(2)}°{" "}
                    {longitude >= 0 ? "E" : "W"}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-2">
            <Dialog>
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
                >
                  View Time Series
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[825px]">
                <DialogHeader>
                  <DialogTitle>
                    {currentDataset?.name || "Time Series"}
                  </DialogTitle>
                  <DialogDescription>
                    Location: {latitude.toFixed(2)}°, {longitude.toFixed(2)}°
                  </DialogDescription>
                </DialogHeader>

                {/* Date Range Selector - Only show for non-high-frequency datasets */}
                {!isHighFrequencyDataset && (
                  <div className="space-y-2">
                    <label className="text-card-foreground flex items-center gap-2 text-sm font-medium">
                      <Calendar className="h-4 w-4" />
                      Date Range
                    </label>

                    <div className="flex flex-wrap items-center gap-4">
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
                        onClick={handleTimeseriesClick}
                        disabled={timeseriesLoading}
                      >
                        {timeseriesLoading ? "Loading..." : "Update"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Chart Area */}
                <div className="relative h-80 w-full overflow-hidden rounded-lg border border-gray-700">
                  {timeseriesLoading ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500"></div>
                        <p className="text-sm text-gray-400">
                          Loading timeseries data...
                        </p>
                      </div>
                    </div>
                  ) : timeseriesError ? (
                    <div className="flex h-full w-full items-center justify-center p-4">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <div className="rounded-full bg-red-900/20 p-3">
                          <svg
                            className="h-6 w-6 text-red-400"
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
                        <p className="text-sm text-red-400">
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
                        data={chartData}
                        margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis
                          dataKey="date"
                          stroke="#94a3b8"
                          tick={{ fontSize: 12 }}
                          tickLine={{ stroke: "#4b5563" }}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          tick={{ fontSize: 12 }}
                          tickLine={{ stroke: "#4b5563" }}
                          label={{
                            value: timeseriesUnits ?? datasetUnit,
                            angle: -90,
                            position: "insideLeft",
                            fill: "#94a3b8",
                            fontSize: 12,
                          }}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "#1f2937",
                            border: "1px solid #374151",
                            borderRadius: "0.5rem",
                            padding: "8px 12px",
                          }}
                          labelStyle={{ color: "#e5e7eb", marginBottom: "4px" }}
                          itemStyle={{ color: "#38bdf8" }}
                        />
                        <Legend
                          wrapperStyle={{
                            paddingTop: "10px",
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
                        <div className="rounded-full bg-gray-700/50 p-3">
                          <svg
                            className="h-6 w-6 text-gray-400"
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
                        <p className="text-sm text-gray-400">
                          No timeseries data available
                        </p>
                        <p className="text-xs text-gray-500">
                          Try selecting a different date range or location
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Close</Button>
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
