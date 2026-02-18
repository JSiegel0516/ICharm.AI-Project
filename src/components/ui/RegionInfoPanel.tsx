"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useReducer,
} from "react";
import {
  ChevronDown,
  X,
  MapPin,
  Calendar,
  Download,
  Monitor,
} from "lucide-react";
import type { RegionInfoPanelProps } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "recharts";

// ============================================================================
// Types
// ============================================================================

type TemperatureUnitInfo = {
  type: "celsius" | "fahrenheit" | "kelvin" | null;
  symbol: string;
};

type DateRangeOption =
  | "all"
  | "1year"
  | "6months"
  | "3months"
  | "1month"
  | "custom";

type Position = { x: number; y: number };

// ============================================================================
// Drag reducer (matches ColorBar pattern for smooth dragging)
// ============================================================================

type DragState = {
  position: Position;
  previousPosition: Position;
  isCollapsed: boolean;
  isDragging: boolean;
  dragStart: Position;
};

type DragAction =
  | { type: "SET_POSITION"; payload: Position }
  | { type: "START_DRAG"; payload: Position }
  | { type: "STOP_DRAG" }
  | { type: "TOGGLE_COLLAPSE"; payload: Position }
  | { type: "SET_COLLAPSED"; payload: { collapsed: boolean; pos: Position } };

function dragReducer(state: DragState, action: DragAction): DragState {
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
        position: action.payload,
      };

    case "SET_COLLAPSED":
      return {
        ...state,
        isCollapsed: action.payload.collapsed,
        position: action.payload.pos,
      };

    default:
      return state;
  }
}

// ============================================================================
// Constants
// ============================================================================

const COLLAPSED_HEIGHT = 52;
const COLLAPSED_WIDTH = 225;
const DEFAULT_PANEL_WIDTH = 300;
const DEFAULT_PANEL_HEIGHT = 200;
const MARGIN = 16;

const chartConfig = {
  desktop: {
    label: "Desktop",
    icon: Monitor,
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

// ============================================================================
// Helpers
// ============================================================================

const normalizeTemperatureUnit = (
  rawUnit?: string | null,
): TemperatureUnitInfo => {
  if (!rawUnit?.trim()) return { type: null, symbol: "units" };

  const normalized = rawUnit.trim();
  const lower = normalized.toLowerCase();
  const alpha = lower.replace(/[^a-z]/g, "");

  if (
    normalized.includes("℃") ||
    lower.includes("celsius") ||
    lower.includes("celcius") ||
    lower.includes("°c") ||
    lower.includes("degc") ||
    alpha === "c"
  )
    return { type: "celsius", symbol: "°C" };

  if (
    normalized.includes("℉") ||
    lower.includes("fahrenheit") ||
    lower.includes("°f") ||
    lower.includes("degf") ||
    alpha === "f"
  )
    return { type: "fahrenheit", symbol: "°F" };

  if (
    normalized.includes("K") ||
    lower.includes("kelvin") ||
    lower.includes("°k") ||
    lower.includes("degk") ||
    alpha === "k"
  )
    return { type: "kelvin", symbol: "K" };

  return { type: null, symbol: normalized };
};

const c2f = (v: number) => (v * 9) / 5 + 32;

const fmt = (v: number | null): string => {
  if (v === null || !Number.isFinite(v)) return "--";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a < 1e-4) return v.toExponential(2);
  if (a < 1) return Number(v.toPrecision(3)).toString();
  if (a < 10) return v.toFixed(2);
  if (a < 100) return v.toFixed(1);
  return v.toFixed(0);
};

const isoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const sanitizeTimeseriesValue = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return null;
  // Filter sentinel/missing values that blow out the chart scale.
  if (Math.abs(value) >= 1e6) return null;
  return value;
};

const downloadFile = (content: string, filename: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ============================================================================
// Chart placeholder component
// ============================================================================

const ChartPlaceholder = ({
  icon,
  title,
  subtitle,
  variant = "default",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  variant?: "default" | "error";
}) => (
  <div className="flex h-full w-full items-center justify-center p-4">
    <div className="flex flex-col items-center gap-2 text-center">
      <div
        className={`rounded-full p-2 sm:p-3 ${
          variant === "error" ? "bg-destructive/10" : "bg-muted"
        }`}
      >
        {icon}
      </div>
      <p
        className={`text-xs sm:text-sm ${
          variant === "error" ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {title}
      </p>
      {subtitle && (
        <p className="text-muted-foreground text-[10px] sm:text-xs">
          {subtitle}
        </p>
      )}
    </div>
  </div>
);

// ============================================================================
// Component
// ============================================================================

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
  colorbarCustomMin = null,
  colorbarCustomMax = null,
  className = "",
  currentDataset,
  selectedDate,
  temperatureUnit = "celsius",
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Default position ──
  const getDefaultPosition = useCallback((): Position => {
    if (typeof window === "undefined") return { x: 800, y: 200 };
    const cardWidth = 280;
    return {
      x: window.innerWidth - cardWidth - MARGIN - 200,
      y: Math.round(window.innerHeight * 0.2),
    };
  }, []);

  // ── Drag state (useReducer for smooth updates) ──
  const [drag, dispatch] = useReducer(dragReducer, {
    position: getDefaultPosition(),
    previousPosition: getDefaultPosition(),
    isCollapsed: false,
    isDragging: false,
    dragStart: { x: 0, y: 0 },
  });

  // ── Timeseries state ──
  const [timeseriesOpen, setTimeseriesOpen] = useState(false);
  const [timeseriesLoading, setTimeseriesLoading] = useState(false);
  const [timeseriesError, setTimeseriesError] = useState<string | null>(null);
  const [rawTimeseriesData, setRawTimeseriesData] = useState<any[]>([]);
  const [timeseriesUnits, setTimeseriesUnits] = useState<string | null>(null);
  const [dateRangeOption, setDateRangeOption] =
    useState<DateRangeOption>("1year");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [zoomWindow, setZoomWindow] = useState<[number, number] | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);

  // ── Memoised derived values ──
  const datasetUnit = regionData.unit ?? currentDataset?.units ?? "units";
  const datasetIdentifier =
    currentDataset?.name ?? regionData.dataset ?? "No dataset";

  const datasetUnitInfo = useMemo(
    () => normalizeTemperatureUnit(datasetUnit),
    [datasetUnit],
  );

  const useFahrenheit =
    datasetUnitInfo.type === "celsius" && temperatureUnit === "fahrenheit";

  const displayUnitLabel = useFahrenheit
    ? "°F"
    : datasetUnitInfo.symbol || datasetUnit || "units";

  const resolvedTimeseriesUnit = useFahrenheit
    ? "°F"
    : (timeseriesUnits ?? datasetUnitInfo.symbol ?? datasetUnit ?? "units");

  const primaryValue = useMemo(() => {
    const raw = regionData.temperature ?? regionData.precipitation ?? null;
    if (raw === null) return null;
    return useFahrenheit ? c2f(raw) : raw;
  }, [regionData.temperature, regionData.precipitation, useFahrenheit]);

  const datasetId = currentDataset?.id ?? null;

  const chartData = useMemo(() => {
    if (!datasetId || rawTimeseriesData.length === 0) return [];
    return rawTimeseriesData
      .map((point: any) => {
        const raw = sanitizeTimeseriesValue(point?.[datasetId] ?? null);
        if (raw == null) {
          return { ...point, [datasetId]: null, value: null };
        }
        const v = useFahrenheit ? c2f(Number(raw)) : Number(raw);
        const value = Number(v.toFixed(2));
        return { ...point, [datasetId]: value, value };
      })
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [rawTimeseriesData, datasetId, useFahrenheit]);

  useEffect(() => {
    if (!rawTimeseriesData.length || !datasetId) return;
    const numericCount = rawTimeseriesData.filter((point: any) =>
      Number.isFinite(point?.[datasetId]),
    ).length;
    console.debug("[Timeseries] summary", {
      datasetId,
      rawPoints: rawTimeseriesData.length,
      numericCount,
      chartPoints: chartData.length,
    });
  }, [rawTimeseriesData, datasetId, chartData.length]);

  const displayedChartData = useMemo(() => {
    if (!zoomWindow || !chartData.length) return chartData;
    const [s, e] = zoomWindow;
    return chartData.slice(s, Math.min(e + 1, chartData.length));
  }, [chartData, zoomWindow]);

  const displayedLineData = useMemo(() => {
    if (!displayedChartData.length || !datasetId) return displayedChartData;
    return displayedChartData.map((point) => {
      if (typeof point?.value === "number") return point;
      const fallback = point?.[datasetId];
      return {
        ...point,
        value: typeof fallback === "number" ? fallback : null,
      };
    });
  }, [displayedChartData, datasetId]);

  const numericChartValues = useMemo(() => {
    return displayedLineData
      .map((p) => p?.value)
      .filter((v): v is number => typeof v === "number");
  }, [displayedLineData]);
  const validPointCount = numericChartValues.length;

  const yAxisDomain = useMemo((): [number, number] | undefined => {
    const vals = numericChartValues;
    if (!vals.length) return undefined;

    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;

    if (min === max) {
      const pad = Math.abs(min) * 0.05 || 1;
      return [min - pad, max + pad];
    }
    const pad = (max - min) * 0.1;
    return [min - pad, max + pad];
  }, [numericChartValues]);

  const datasetStart = useMemo(() => {
    const s = currentDataset?.startDate;
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [currentDataset?.startDate]);

  const datasetEnd = useMemo(() => {
    const s = currentDataset?.endDate;
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [currentDataset?.endDate]);

  const isHighFrequency = useMemo(() => {
    const n = (currentDataset?.name || "").toLowerCase();
    return n.includes("vegetation") || n.includes("ndvi");
  }, [currentDataset?.name]);

  const hasData =
    numericChartValues.length > 0 && !timeseriesLoading && !timeseriesError;

  // ── Clamp helper ──
  const clampPos = useCallback((x: number, y: number): Position => {
    const el = panelRef.current;
    const w = el?.offsetWidth ?? DEFAULT_PANEL_WIDTH;
    const h = el?.offsetHeight ?? DEFAULT_PANEL_HEIGHT;
    return {
      x: Math.max(0, Math.min(x, window.innerWidth - w)),
      y: Math.max(0, Math.min(y, window.innerHeight - h)),
    };
  }, []);

  // ── Event handlers ──
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
      if (drag.isDragging) return;

      const collapsedPos =
        typeof window !== "undefined"
          ? {
              x: window.innerWidth - COLLAPSED_WIDTH,
              y: window.innerHeight - 60,
            }
          : { x: 0, y: 0 };

      dispatch({ type: "TOGGLE_COLLAPSE", payload: collapsedPos });
    },
    [drag.isDragging],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (drag.isCollapsed) return;
      e.preventDefault();
      e.stopPropagation();
      dispatch({
        type: "START_DRAG",
        payload: {
          x: e.clientX - drag.position.x,
          y: e.clientY - drag.position.y,
        },
      });
    },
    [drag.isCollapsed, drag.position],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (drag.isCollapsed) return;
      e.preventDefault();
      e.stopPropagation();
      const t = e.touches[0];
      dispatch({
        type: "START_DRAG",
        payload: {
          x: t.clientX - drag.position.x,
          y: t.clientY - drag.position.y,
        },
      });
    },
    [drag.isCollapsed, drag.position],
  );

  // ── Date range calculation ──
  const calculateDateRange = useCallback((): { start: Date; end: Date } => {
    let target = selectedDate ?? datasetEnd ?? new Date();
    if (datasetStart && target < datasetStart) target = datasetStart;
    if (datasetEnd && target > datasetEnd) target = datasetEnd;

    let startDate: Date;
    let endDate: Date;

    if (isHighFrequency) {
      startDate = new Date(target.getFullYear(), target.getMonth(), 1);
      endDate = new Date(
        target.getFullYear(),
        target.getMonth() + 1,
        0,
        23,
        59,
        59,
      );
    } else {
      const endOfMonth = () =>
        new Date(target.getFullYear(), target.getMonth() + 1, 0, 23, 59, 59);

      switch (dateRangeOption) {
        case "all":
          startDate = datasetStart ?? new Date(target.getFullYear() - 10, 0, 1);
          endDate = datasetEnd ?? target;
          break;
        case "1year":
          startDate = new Date(target.getFullYear() - 1, target.getMonth(), 1);
          endDate = endOfMonth();
          break;
        case "6months":
          startDate = new Date(target.getFullYear(), target.getMonth() - 6, 1);
          endDate = endOfMonth();
          break;
        case "3months":
          startDate = new Date(target.getFullYear(), target.getMonth() - 3, 1);
          endDate = endOfMonth();
          break;
        case "1month":
          startDate = new Date(target.getFullYear(), target.getMonth(), 1);
          endDate = endOfMonth();
          break;
        case "custom":
          if (customStartDate && customEndDate) {
            const parsedStart = new Date(customStartDate);
            const parsedEnd = new Date(customEndDate);
            if (
              Number.isFinite(parsedStart.getTime()) &&
              Number.isFinite(parsedEnd.getTime())
            ) {
              if (parsedEnd < parsedStart) {
                startDate = parsedEnd;
                endDate = parsedStart;
              } else {
                startDate = parsedStart;
                endDate = parsedEnd;
              }
              endDate.setHours(23, 59, 59, 999);
              break;
            }
          }
          {
            startDate = new Date(
              target.getFullYear() - 1,
              target.getMonth(),
              1,
            );
            endDate = endOfMonth();
          }
          break;
        default:
          startDate = new Date(target.getFullYear() - 1, target.getMonth(), 1);
          endDate = endOfMonth();
      }
    }

    if (datasetStart && startDate < datasetStart) startDate = datasetStart;
    if (datasetEnd && endDate > datasetEnd) endDate = datasetEnd;

    return { start: startDate, end: endDate };
  }, [
    selectedDate,
    datasetEnd,
    datasetStart,
    isHighFrequency,
    dateRangeOption,
    customStartDate,
    customEndDate,
  ]);

  const customRangeDefaults = useMemo(() => {
    const base = selectedDate ?? datasetEnd ?? new Date();
    const start = new Date(base.getFullYear() - 1, base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    const clampedStart =
      datasetStart && start < datasetStart ? datasetStart : start;
    const clampedEnd = datasetEnd && end > datasetEnd ? datasetEnd : end;
    return { start: isoDate(clampedStart), end: isoDate(clampedEnd) };
  }, [datasetEnd, datasetStart, selectedDate]);

  const isCustomRangeValid = useMemo(() => {
    if (dateRangeOption !== "custom") return true;
    if (!customStartDate || !customEndDate) return false;
    const start = new Date(customStartDate);
    const end = new Date(customEndDate);
    return (
      Number.isFinite(start.getTime()) &&
      Number.isFinite(end.getTime()) &&
      start.getTime() <= end.getTime()
    );
  }, [customEndDate, customStartDate, dateRangeOption]);

  // ── Timeseries fetch ──
  const handleTimeseriesClick = useCallback(async () => {
    setTimeseriesOpen(true);

    if (!datasetId) {
      setTimeseriesError("No dataset selected.");
      setRawTimeseriesData([]);
      setTimeseriesUnits(null);
      return;
    }

    const { start: startDate, end: endDate } = calculateDateRange();
    console.debug("[Timeseries] request", {
      datasetId,
      latitude,
      longitude,
      dateRangeOption,
      startDate: isoDate(startDate),
      endDate: isoDate(endDate),
    });
    setTimeseriesLoading(true);
    setTimeseriesError(null);

    try {
      const res = await fetch("/api/timeseries/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetIds: [datasetId],
          startDate: isoDate(startDate),
          endDate: isoDate(endDate),
          focusCoordinates: `${latitude},${longitude}`,
          aggregation: "mean",
          includeStatistics: false,
          includeMetadata: true,
        }),
      });

      const ct = res.headers.get("content-type");
      if (!ct?.includes("application/json")) {
        throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      }
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.detail || `Request failed (${res.status})`);
      }

      const result = await res.json();
      if (!result?.data || !Array.isArray(result.data)) {
        throw new Error("Invalid response format");
      }

      const normalized = result.data.map((point: any) => {
        if (point && typeof point === "object" && point.values) {
          return { date: point.date, ...point.values };
        }
        return point;
      });
      console.debug("[Timeseries] response", {
        datasetId,
        points: normalized.length,
        sampleKeys: normalized[0] ? Object.keys(normalized[0]) : [],
        sample: normalized[0] ?? null,
        metadataKeys: result.metadata ? Object.keys(result.metadata) : [],
      });
      setRawTimeseriesData(normalized);
      setTimeseriesUnits(result.metadata?.[datasetId]?.units ?? datasetUnit);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to load timeseries";
      console.error("[Timeseries]", msg);
      setTimeseriesError(msg);
      setRawTimeseriesData([]);
      setTimeseriesUnits(null);
    } finally {
      setTimeseriesLoading(false);
    }
  }, [datasetId, calculateDateRange, latitude, longitude, datasetUnit]);

  // ── Export handlers ──
  const handleExportCSV = useCallback(() => {
    if (!chartData.length) return;
    const csv = [
      `Date,Value (${resolvedTimeseriesUnit})`,
      ...chartData.map((p) => `${p.date},${p.value ?? ""}`),
    ].join("\n");
    downloadFile(
      csv,
      `timeseries_${latitude.toFixed(2)}_${longitude.toFixed(2)}_${isoDate(new Date())}.csv`,
      "text/csv",
    );
    setShowExportDialog(false);
  }, [chartData, resolvedTimeseriesUnit, latitude, longitude]);

  const handleExportJSON = useCallback(() => {
    if (!chartData.length) return;
    const json = JSON.stringify(
      {
        metadata: {
          dataset: currentDataset?.name || datasetIdentifier,
          location: { latitude, longitude },
          unit: resolvedTimeseriesUnit,
          exportDate: new Date().toISOString(),
          dataPoints: chartData.length,
        },
        data: chartData,
      },
      null,
      2,
    );
    downloadFile(
      json,
      `timeseries_${latitude.toFixed(2)}_${longitude.toFixed(2)}_${isoDate(new Date())}.json`,
      "application/json",
    );
    setShowExportDialog(false);
  }, [
    chartData,
    currentDataset,
    datasetIdentifier,
    latitude,
    longitude,
    resolvedTimeseriesUnit,
  ]);

  // ── Chart zoom ──
  const handleChartWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!chartData.length) return;
      e.preventDefault();
      const zoomIn = e.deltaY < 0;

      setZoomWindow((cur) => {
        const total = chartData.length;
        const [s, end] = cur ?? [0, total - 1];
        const size = end - s + 1;
        const minW = Math.max(5, Math.ceil(total * 0.05));
        const step = Math.max(1, Math.ceil(size * 0.1));

        if (zoomIn) {
          if (size <= minW) return cur;
          return [
            Math.min(s + step, end - minW + 1),
            Math.max(end - step, s + minW - 1),
          ];
        }

        const ns = Math.max(0, s - step);
        const ne = Math.min(total - 1, end + step);
        return ns === 0 && ne === total - 1 ? null : [ns, ne];
      });
    },
    [chartData],
  );

  // ============================================================================
  // Effects
  // ============================================================================

  // Reset position when panel is shown
  useEffect(() => {
    if (show) {
      const pos = getDefaultPosition();
      dispatch({ type: "SET_POSITION", payload: pos });
    }
  }, [show, getDefaultPosition]);

  // Position collapsed pill next to colorbar
  useEffect(() => {
    if (drag.isCollapsed && typeof window !== "undefined") {
      const cbW = colorBarCollapsed ? 160 : 320;
      const gap = colorBarCollapsed ? 4 : 8;
      dispatch({
        type: "SET_COLLAPSED",
        payload: {
          collapsed: true,
          pos: {
            x: colorBarPosition.x + cbW + gap,
            y: window.innerHeight - COLLAPSED_HEIGHT - MARGIN,
          },
        },
      });
    }
  }, [drag.isCollapsed, colorBarPosition.x, colorBarCollapsed]);

  // Reset zoom on new data
  useEffect(() => setZoomWindow(null), [chartData]);

  // Handle resize
  useEffect(() => {
    const onResize = () => {
      if (typeof window === "undefined") return;
      if (drag.isCollapsed) {
        const cbW = colorBarCollapsed ? 160 : 320;
        const gap = colorBarCollapsed ? 4 : 8;
        dispatch({
          type: "SET_POSITION",
          payload: {
            x: colorBarPosition.x + cbW + gap,
            y: window.innerHeight - COLLAPSED_HEIGHT - MARGIN,
          },
        });
      } else {
        dispatch({
          type: "SET_POSITION",
          payload: clampPos(drag.position.x, drag.position.y),
        });
      }
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [
    drag.isCollapsed,
    drag.position,
    colorBarPosition.x,
    colorBarCollapsed,
    clampPos,
  ]);

  // Drag movement (global listeners)
  useEffect(() => {
    if (!drag.isDragging || drag.isCollapsed) return;

    const onMouseMove = (e: MouseEvent) => {
      dispatch({
        type: "SET_POSITION",
        payload: clampPos(
          e.clientX - drag.dragStart.x,
          e.clientY - drag.dragStart.y,
        ),
      });
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      dispatch({
        type: "SET_POSITION",
        payload: clampPos(
          t.clientX - drag.dragStart.x,
          t.clientY - drag.dragStart.y,
        ),
      });
    };

    const onEnd = () => dispatch({ type: "STOP_DRAG" });

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onEnd);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onEnd);
    };
  }, [drag.isDragging, drag.isCollapsed, drag.dragStart, clampPos]);

  // ============================================================================
  // Render
  // ============================================================================

  if (!show) return null;

  return (
    <div
      ref={panelRef}
      className={`pointer-events-auto fixed ${className}`}
      style={{
        left: `${drag.position.x}px`,
        top: `${drag.position.y}px`,
        zIndex: drag.isCollapsed ? 1000 : 20,
      }}
    >
      {drag.isCollapsed ? (
        /* ── Collapsed pill ── */
        <Button
          variant="outline"
          size="sm"
          className="bg-card/90 text-muted-foreground hover:text-card-foreground pointer-events-auto cursor-pointer backdrop-blur-sm transition-all duration-200 hover:scale-105"
          onClick={handleCollapseToggle}
        >
          <MapPin className="h-3.5 w-3.5" />
          <span className="font-medium select-none">Region Info</span>
        </Button>
      ) : (
        /* ── Expanded card ── */
        <Card className="max-w-2xs lg:max-w-xs">
          <CardHeader>
            {/* Controls row */}
            <div className="flex items-center justify-between gap-1">
              <button
                onClick={handleCollapseToggle}
                className="text-muted-foreground hover:text-card-foreground hover:bg-muted z-10 flex cursor-pointer items-center rounded-full p-1 transition-colors focus:outline-none"
                title="Collapse"
                type="button"
              >
                <ChevronDown className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
              </button>

              <div
                className={`hover:bg-muted flex h-3 items-center justify-center gap-0.5 rounded-full px-2 transition-colors sm:gap-1 lg:h-3.5 ${
                  drag.isDragging ? "bg-muted cursor-grabbing" : "cursor-grab"
                } select-none`}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                style={{ touchAction: "none" }}
                title="Drag to move"
              >
                <div className="dot" />
                <div className="dot" />
                <div className="dot" />
              </div>

              <button
                onClick={handleClose}
                className="text-muted-foreground hover:text-card-foreground hover:bg-muted z-10 flex cursor-pointer items-center rounded-full p-1 transition-colors focus:outline-none"
                title="Close"
                type="button"
              >
                <X className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
              </button>
            </div>

            <CardTitle className="flex flex-row items-center justify-center gap-2 text-center text-lg lg:text-xl">
              <MapPin className="text-muted-foreground h-3.5 w-3.5 lg:h-4 lg:w-4" />
              {Math.abs(latitude).toFixed(2)}° {latitude >= 0 ? "N" : "S"},{" "}
              {Math.abs(longitude).toFixed(2)}° {longitude >= 0 ? "E" : "W"}
            </CardTitle>
            <CardDescription className="text-center text-xs lg:text-sm">
              Latitude, Longitude
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="bg-muted/40 border-border rounded-lg border p-2 lg:p-3">
              <div className="text-center">
                <div className="text-card-foreground text-lg font-medium lg:mb-1 lg:text-xl">
                  {fmt(primaryValue)}{" "}
                  <span className="text-card-foreground text-lg font-medium lg:text-xl">
                    {displayUnitLabel}
                  </span>
                </div>
                <div className="text-muted-foreground text-xs lg:text-sm">
                  {currentDataset?.name ||
                    regionData.name ||
                    datasetIdentifier ||
                    "No dataset selected"}
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-2">
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
                  className="w-full text-xs lg:text-sm"
                >
                  View Time Series
                </Button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-206">
                <DialogHeader>
                  <DialogTitle className="text-base lg:text-lg">
                    {currentDataset?.name || "Time Series"}
                  </DialogTitle>
                  <DialogDescription className="text-xs lg:text-sm">
                    Location: {latitude.toFixed(2)}°, {longitude.toFixed(2)}°
                  </DialogDescription>
                </DialogHeader>

                {/* Date range */}
                {!isHighFrequency && (
                  <div className="space-y-2">
                    <label className="text-card-foreground flex items-center gap-2 text-xs font-medium sm:text-sm">
                      <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      Date Range
                    </label>
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                      <NativeSelect
                        value={dateRangeOption}
                        onChange={(e) => {
                          const next = e.target.value as DateRangeOption;
                          setDateRangeOption(next);
                          if (
                            next === "custom" &&
                            (!customStartDate || !customEndDate)
                          ) {
                            setCustomStartDate(customRangeDefaults.start);
                            setCustomEndDate(customRangeDefaults.end);
                          }
                        }}
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
                        <NativeSelectOption value="custom">
                          Custom Range
                        </NativeSelectOption>
                      </NativeSelect>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTimeseriesClick}
                        disabled={timeseriesLoading || !isCustomRangeValid}
                      >
                        {timeseriesLoading ? "Loading..." : "Update"}
                      </Button>
                    </div>

                    {dateRangeOption === "custom" && (
                      <div className="flex flex-wrap items-end gap-3 sm:gap-4">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-slate-300">
                            Start date
                          </label>
                          <Input
                            type="date"
                            value={customStartDate}
                            min={
                              datasetStart ? isoDate(datasetStart) : undefined
                            }
                            max={datasetEnd ? isoDate(datasetEnd) : undefined}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className="h-9"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-slate-300">
                            End date
                          </label>
                          <Input
                            type="date"
                            value={customEndDate}
                            min={
                              datasetStart ? isoDate(datasetStart) : undefined
                            }
                            max={datasetEnd ? isoDate(datasetEnd) : undefined}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            className="h-9"
                          />
                        </div>
                        {!isCustomRangeValid && (
                          <p className="text-xs text-red-400">
                            Pick a valid start and end date.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Chart */}
                <div
                  className="border-border relative h-64 w-full overflow-hidden rounded-lg border sm:h-80"
                  onWheel={handleChartWheel}
                >
                  {timeseriesLoading ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="border-muted border-t-primary h-6 w-6 animate-spin rounded-full border-2 sm:h-8 sm:w-8" />
                        <p className="text-muted-foreground text-xs sm:text-sm">
                          Loading timeseries data...
                        </p>
                      </div>
                    </div>
                  ) : timeseriesError ? (
                    <ChartPlaceholder
                      variant="error"
                      icon={
                        <svg
                          className="text-destructive h-5 w-5 sm:h-6 sm:w-6"
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
                      }
                      title={timeseriesError}
                    />
                  ) : hasData ? (
                    <ChartContainer
                      config={chartConfig}
                      className="h-full w-full"
                    >
                      <LineChart
                        accessibilityLayer
                        data={displayedLineData}
                        margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-border"
                        />
                        <XAxis
                          dataKey="date"
                          className="fill-muted-foreground"
                          tick={{ fontSize: 10 }}
                          tickLine={{ className: "stroke-border" }}
                        />
                        <YAxis
                          className="fill-muted-foreground"
                          tick={{ fontSize: 10 }}
                          tickLine={{ className: "stroke-border" }}
                          domain={yAxisDomain}
                          label={{
                            value: resolvedTimeseriesUnit,
                            angle: -90,
                            position: "insideLeft",
                            className: "fill-muted-foreground",
                            fontSize: 10,
                          }}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--popover))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "0.5rem",
                            padding: "8px 12px",
                            color: "hsl(var(--popover-foreground))",
                          }}
                          labelStyle={{
                            color: "hsl(var(--popover-foreground))",
                            marginBottom: "4px",
                            fontSize: "12px",
                          }}
                          itemStyle={{
                            color: "hsl(var(--primary))",
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
                          type="linear"
                          dataKey="value"
                          name={currentDataset?.name || "Value"}
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={validPointCount <= 1 ? { r: 3 } : false}
                          connectNulls
                          isAnimationActive={false}
                          activeDot={{ r: 4, strokeWidth: 0 }}
                        />
                      </LineChart>
                    </ChartContainer>
                  ) : (
                    <ChartPlaceholder
                      icon={
                        <svg
                          className="text-muted-foreground h-5 w-5 sm:h-6 sm:w-6"
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
                      }
                      title="Click on the globe to select a location"
                      subtitle="Time series data will appear here"
                    />
                  )}
                </div>

                <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <div className="flex gap-2">
                    {hasData && (
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
