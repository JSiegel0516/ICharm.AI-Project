"use client";

import React, {
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
} from "react";
import Globe from "@/components/Globe/Globe";
import type { GlobeRef } from "@/types/index";
import ColorBar from "@/components/ui/ColorBar";
import TimeBar from "@/components/ui/TimeBar";
import PressureLevelsSelector from "@/components/ui/Popups/PressureLevelsSelector";
import RegionInfoPanel from "@/components/ui/RegionInfoPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { useAppState } from "@/context/dataset-context";
import { useSettings } from "@/context/settings-context";
import {
  RegionData,
  PressureLevel,
  GlobeSettings,
  GlobeLineResolution,
  MapOrientation,
  MapProjectionId,
  GlobeViewMode,
  type Dataset,
} from "@/types";
import { pressureLevels } from "@/utils/constants";
import { isSeaSurfaceTemperatureDataset } from "@/utils/datasetGuards";
import { MAP_PROJECTIONS } from "@/components/Globe/projectionConfig";
import {
  buildRasterRequestKey,
  fetchRasterVisualization,
  type RasterLayerData,
} from "@/hooks/useRasterLayer";
import {
  buildRasterGridRequestKey,
  fetchRasterGrid,
  type RasterGridData,
} from "@/hooks/useRasterGrid";
import { resolveEffectiveColorbarRange } from "@/lib/mesh/rasterUtils";
import { Play, Square, Loader2 } from "lucide-react";
import { SideButtons } from "./_components/SideButtons";
import { Tutorial } from "./_components/Tutorial";
import { useRasterLayer } from "@/hooks/useRasterLayer";
import { useRasterGrid } from "@/hooks/useRasterGrid";

type SidebarPanel = "datasets" | "history" | "about" | null;

const normalizeLevelUnit = (
  unit?: string | null,
  descriptor?: string | null,
) => {
  const normalized = unit?.trim().toLowerCase();
  if (normalized) {
    if (
      normalized === "mb" ||
      normalized.includes("millibar") ||
      normalized.includes("mbar")
    )
      return "millibar";
    if (normalized === "hpa" || normalized.includes("hectopascal"))
      return "hPa";
    if (normalized === "pa" || normalized.includes("pascal")) return "Pa";
    if (normalized === "m" || normalized.includes("meter")) return "m";
    if (normalized === "km" || normalized.includes("kilometer")) return "km";
    return normalized;
  }
  const descriptorText = descriptor?.toLowerCase() ?? "";
  if (
    descriptorText.includes("pressure") ||
    descriptorText.includes("millibar") ||
    descriptorText.includes("mbar")
  )
    return "millibar";
  if (descriptorText.includes("height") || descriptorText.includes("altitude"))
    return "m";
  return "level";
};

const isPressureUnit = (unit: string) => {
  const normalized = unit.toLowerCase();
  return (
    normalized === "millibar" || normalized === "hpa" || normalized === "pa"
  );
};

const formatLevelValue = (value: number) => {
  if (Number.isInteger(value)) return value.toString();
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
};

const formatPressureLevelLabel = (value: number, unit: string) => {
  const formattedValue = formatLevelValue(value);
  if (unit === "level") return formattedValue;
  return `${formattedValue} ${unit}`;
};

const parseNumericList = (input: unknown): number[] => {
  if (!input) return [];
  if (Array.isArray(input))
    return input.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (typeof input === "string") {
    const matches = input.match(/-?\d+(\.\d+)?/g);
    if (!matches) return [];
    return matches.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  }
  if (typeof input === "number" && Number.isFinite(input)) return [input];
  return [];
};

type VisualizationStep = "year" | "month" | "day";

const clampDateToRange = (date: Date, minDate: Date, maxDate: Date) => {
  if (date < minDate) return minDate;
  if (date > maxDate) return maxDate;
  return date;
};

const stepDate = (date: Date, step: VisualizationStep) => {
  const next = new Date(date);
  if (step === "year") next.setFullYear(next.getFullYear() + 1);
  else if (step === "month") next.setMonth(next.getMonth() + 1);
  else next.setDate(next.getDate() + 1);
  return next;
};

const buildFrameDates = (
  start: Date,
  end: Date,
  step: VisualizationStep,
): Date[] => {
  const frames: Date[] = [];
  let cursor = new Date(start);
  const limit = 10_000;
  let guard = 0;
  while (cursor <= end && guard < limit) {
    frames.push(new Date(cursor));
    const next = stepDate(cursor, step);
    if (next <= cursor) break;
    cursor = next;
    guard += 1;
  }
  return frames;
};

const getStepOptionsForDataset = (
  dataset?: Dataset | null,
): VisualizationStep[] => {
  const resolution = dataset?.temporalResolution ?? "monthly";
  if (resolution === "yearly") return ["year"];
  if (resolution === "monthly") return ["month", "year"];
  return ["day", "month", "year"];
};

const parseDateInput = (
  value: string,
  minDate: Date,
  maxDate: Date,
): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return clampDateToRange(parsed, minDate, maxDate);
};

const DAY_MS = 24 * 60 * 60 * 1000;

const clampDayIndex = (value: number, maxDays: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.round(value), 0), maxDays);
};

const dateToDayIndex = (date: Date, minDate: Date, maxDays: number) => {
  const diffDays = Math.round((date.getTime() - minDate.getTime()) / DAY_MS);
  return clampDayIndex(diffDays, maxDays);
};

const dayIndexToDate = (index: number, minDate: Date, maxDate: Date) => {
  const next = new Date(minDate.getTime() + index * DAY_MS);
  return clampDateToRange(next, minDate, maxDate);
};

const yieldToBrowser = () =>
  new Promise<void>((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    const idle = (window as unknown as { requestIdleCallback?: Function })
      .requestIdleCallback;
    if (typeof idle === "function") {
      idle(() => resolve(), { timeout: 200 });
      return;
    }
    window.requestAnimationFrame(() => resolve());
  });

export default function HomePage() {
  const {
    showColorbar,
    currentDataset,
    toggleColorbar,
    datasets,
    locationFocusRequest,
    clearLocationFocusRequest,
    showRegionInfo,
    setShowRegionInfo,
    regionInfoData,
    setRegionInfoData,
    selectedDate,
    setSelectedDate,
    setCurrentDataset,
    setCurrentLocationMarker,
    temperatureUnit,
    setTemperatureUnit,
    isLoading,
    error,
  } = useAppState();

  const {
    colorBarOrientation,
    lineColors,
    setLineColors,
    colorbarCustomMin,
    colorbarCustomMax,
    setColorbarRange,
    resetColorbarRange,
  } = useSettings();

  const globeRef = useRef<GlobeRef>(null);
  const lastDatasetIdRef = useRef<string | null>(null);
  const initialDateSetRef = useRef<string | null>(null);

  // Visualization State
  const [showVisualizationModal, setShowVisualizationModal] = useState(false);
  const [visualizationStart, setVisualizationStart] = useState<Date | null>(
    null,
  );
  const [visualizationEnd, setVisualizationEnd] = useState<Date | null>(null);
  const [visualizationStep, setVisualizationStep] =
    useState<VisualizationStep>("month");
  const [visualizationStatus, setVisualizationStatus] = useState<
    "idle" | "preparing" | "ready" | "playing"
  >("idle");
  const [visualizationProgress, setVisualizationProgress] = useState(0);
  const [visualizationDates, setVisualizationDates] = useState<Date[]>([]);
  const [activeVisualizationIndex, setActiveVisualizationIndex] = useState(0);
  const [visualizationError, setVisualizationError] = useState<string | null>(
    null,
  );
  const [startInputValue, setStartInputValue] = useState("");
  const [endInputValue, setEndInputValue] = useState("");
  const [prefetchedRasters, setPrefetchedRasters] = useState<
    Map<string, RasterLayerData>
  >(new Map());
  const [prefetchedRasterGrids, setPrefetchedRasterGrids] = useState<
    Map<string, RasterGridData>
  >(new Map());
  const [visualizationFadeMs, setVisualizationFadeMs] = useState(300);
  const [showVisualizationBar, setShowVisualizationBar] = useState(true);
  const [visualizationTarget, setVisualizationTarget] = useState<{
    datasetId: string;
    datasetSnapshot: Dataset;
    level: number | null;
  } | null>(null);

  const visualizationAbortRef = useRef<AbortController | null>(null);
  const prefetchedRastersRef = useRef<Map<string, RasterLayerData>>(new Map());
  const prefetchedRasterGridsRef = useRef<Map<string, RasterGridData>>(
    new Map(),
  );
  const visualizationPrefetchIndexRef = useRef(0);
  const visualizationResumeTimeoutRef = useRef<number | null>(null);
  const visualizationInteractionTimeoutRef = useRef<number | null>(null);
  const visualizationPausedRef = useRef(false);
  const visualizationPrefetchConfigRef = useRef<{
    dataset: Dataset;
    frames: Date[];
    cssColors: string[];
    colorbarRange: ReturnType<typeof resolveEffectiveColorbarRange>;
    level: number | null;
    hideZero: boolean;
    smoothGridBoxValues: boolean;
    keyDatasetId: string;
  } | null>(null);

  // UI State
  const [activeSidebarPanel, setActiveSidebarPanel] =
    useState<SidebarPanel>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [colorBarCollapsed, setColorBarCollapsed] = useState(false);
  const [colorBarPosition, setColorBarPosition] = useState({ x: 24, y: 300 });

  const datasetPressureLevels = useMemo<PressureLevel[] | null>(() => {
    if (isSeaSurfaceTemperatureDataset(currentDataset)) return null;
    const backend = currentDataset;
    if (!backend) return null;

    let rawValues = parseNumericList(backend.levelValues);
    if (!rawValues.length) rawValues = parseNumericList(backend.levels);

    const normalizedUnit = normalizeLevelUnit(
      backend.levelUnits,
      backend.levels,
    );

    const isLikelyPressureDataset =
      isPressureUnit(normalizedUnit) ||
      backend.name?.toLowerCase().includes("pressure") ||
      backend.layerParameter?.toLowerCase().includes("pressure") ||
      currentDataset?.description?.toLowerCase().includes("pressure") ||
      backend.levels?.toLowerCase().includes("pressure");

    if (!rawValues.length && isLikelyPressureDataset) {
      return pressureLevels.map((level) => ({
        ...level,
        id: `${backend.id ?? currentDataset?.id ?? "dataset"}-default-${level.id}`,
      }));
    }

    if (!rawValues.length) return null;

    const shouldSortDescending =
      isPressureUnit(normalizedUnit) ||
      normalizedUnit === "m" ||
      normalizedUnit === "km";
    const sortedValues = [...rawValues].sort((a, b) =>
      shouldSortDescending ? b - a : a - b,
    );

    return sortedValues.map((value, index) => ({
      id: `${backend.id ?? currentDataset?.id ?? "dataset"}-level-${index}-${value}`,
      value,
      unit: normalizedUnit,
      label: formatPressureLevelLabel(value, normalizedUnit),
    }));
  }, [currentDataset]);

  const hasPressureLevels = Boolean(datasetPressureLevels?.length);

  const isGodasDataset = useMemo(() => {
    const datasetText = [
      currentDataset?.id,
      currentDataset?.slug,
      currentDataset?.name,
      currentDataset?.description,
      currentDataset?.sourceName,
    ]
      .filter((v) => typeof v === "string")
      .map((v) => v.toLowerCase())
      .join(" ");
    return (
      datasetText.includes("godas") ||
      datasetText.includes("global ocean data assimilation system") ||
      datasetText.includes("ncep global ocean data assimilation")
    );
  }, [currentDataset]);

  const defaultPressureLevel = useMemo(() => {
    if (!datasetPressureLevels || datasetPressureLevels.length === 0)
      return null;
    if (!isGodasDataset) return datasetPressureLevels[0];
    const match = datasetPressureLevels.find(
      (level) => Math.abs(level.value - 4225) < 0.5,
    );
    return match ?? datasetPressureLevels[0];
  }, [datasetPressureLevels, isGodasDataset]);

  const [selectedPressureLevel, setSelectedPressureLevel] =
    useState<PressureLevel | null>(null);
  const [rasterMeta, setRasterMeta] = useState<{
    units?: string | null;
    min?: number | null;
    max?: number | null;
  } | null>(null);

  const selectedLevelValue =
    hasPressureLevels && selectedPressureLevel
      ? selectedPressureLevel.value
      : null;

  const [globeSettings, setGlobeSettings] = useState<GlobeSettings>({
    baseMapMode: "satellite",
    satelliteLayerVisible: true,
    boundaryLinesVisible: true,
    countryBoundaryResolution: "low",
    stateBoundaryResolution: "low",
    geographicLinesVisible: false,
    timeZoneLinesVisible: false,
    pacificCentered: false,
    coastlineResolution: "low",
    riverResolution: "none",
    lakeResolution: "none",
    naturalEarthGeographicLinesVisible: false,
    labelsVisible: true,
    rasterOpacity: 0.9,
    hideZeroPrecipitation: false,
    rasterBlurEnabled: true,
    bumpMapMode: "none",
    colorbarCustomMin: null,
    colorbarCustomMax: null,
    viewMode: "3d",
    mapOrientations: {},
  });

  const lastSatelliteLabelsVisibleRef = useRef(true);
  const lastCesiumLabelsVisibleRef = useRef(true);
  const lastNonProjectionGridVisibleRef = useRef(
    globeSettings.geographicLinesVisible,
  );
  const lastCesiumGridVisibleRef = useRef(false);
  const lastNonOrthoGridVisibleRef = useRef(
    globeSettings.geographicLinesVisible,
  );
  const lastViewModeRef = useRef<GlobeViewMode | null>(null);

  const DEFAULT_LINE_COLORS_BLACK = useMemo(
    () => ({
      boundaryLines: "#000000",
      coastlines: "#000000",
      rivers: "#000000",
      lakes: "#000000",
      geographicLines: "#000000",
      geographicGrid: "#000000",
    }),
    [],
  );

  const DEFAULT_LINE_COLORS_GRAY = useMemo(
    () => ({
      boundaryLines: "#4b5563",
      coastlines: "#4b5563",
      rivers: "#4b5563",
      lakes: "#4b5563",
      geographicLines: "#4b5563",
      geographicGrid: "#4b5563",
    }),
    [],
  );

  const isLineColorDefault = useCallback(
    (
      colors: typeof DEFAULT_LINE_COLORS_BLACK | null | undefined,
      target: typeof DEFAULT_LINE_COLORS_BLACK,
    ) => {
      if (!colors) return true;
      const keys = Object.keys(target) as Array<keyof typeof target>;
      return keys.every((key) => colors[key] === target[key]);
    },
    [DEFAULT_LINE_COLORS_BLACK],
  );

  // Colorbar range derived from SettingsContext (per-dataset)
  const colorbarRange = useMemo(
    () => ({
      enabled: colorbarCustomMin !== null || colorbarCustomMax !== null,
      min: colorbarCustomMin ?? null,
      max: colorbarCustomMax ?? null,
    }),
    [colorbarCustomMin, colorbarCustomMax],
  );

  useEffect(() => {
    const lastMode = lastViewModeRef.current;
    const nextMode = globeSettings.viewMode ?? "3d";
    lastViewModeRef.current = nextMode;

    const wasCesium = lastMode === "3d" || lastMode === "2d";
    const isCesium = nextMode === "3d" || nextMode === "2d";
    const wasOrtho = lastMode === "ortho";
    const isOrtho = nextMode === "ortho";
    const wasProjection = MAP_PROJECTIONS.some((p) => p.id === lastMode);
    const isProjection = MAP_PROJECTIONS.some((p) => p.id === nextMode);

    if (wasCesium && !isCesium) {
      lastCesiumLabelsVisibleRef.current = globeSettings.labelsVisible;
      lastCesiumGridVisibleRef.current = globeSettings.geographicLinesVisible;
    }

    if (!wasCesium && isCesium) {
      const restore = lastCesiumGridVisibleRef.current;
      if (restore !== globeSettings.geographicLinesVisible) {
        setGlobeSettings((prev) => ({
          ...prev,
          geographicLinesVisible: restore,
        }));
      }
      return;
    }

    if (
      nextMode === "ortho" &&
      lastMode !== "ortho" &&
      globeSettings.labelsVisible
    ) {
      setGlobeSettings((prev) => ({ ...prev, labelsVisible: false }));
      return;
    }

    if (!wasCesium && isCesium && globeSettings.baseMapMode !== "street") {
      const restore = lastCesiumLabelsVisibleRef.current;
      if (restore !== globeSettings.labelsVisible) {
        setGlobeSettings((prev) => ({ ...prev, labelsVisible: restore }));
      }
    }

    if (!wasOrtho && isOrtho) {
      lastNonOrthoGridVisibleRef.current = globeSettings.geographicLinesVisible;
      if (!globeSettings.geographicLinesVisible) {
        setGlobeSettings((prev) => ({ ...prev, geographicLinesVisible: true }));
      }
      return;
    }

    if (wasOrtho && !isOrtho) {
      const restore = lastNonOrthoGridVisibleRef.current;
      if (restore !== globeSettings.geographicLinesVisible) {
        setGlobeSettings((prev) => ({
          ...prev,
          geographicLinesVisible: restore,
        }));
      }
    }

    if (!wasProjection && isProjection) {
      lastNonProjectionGridVisibleRef.current =
        globeSettings.geographicLinesVisible;
      if (!globeSettings.geographicLinesVisible) {
        setGlobeSettings((prev) => ({ ...prev, geographicLinesVisible: true }));
      }
      return;
    }

    if (wasProjection && !isProjection) {
      const restore = lastNonProjectionGridVisibleRef.current;
      if (restore !== globeSettings.geographicLinesVisible) {
        setGlobeSettings((prev) => ({
          ...prev,
          geographicLinesVisible: restore,
        }));
      }
    }
  }, [
    globeSettings.baseMapMode,
    globeSettings.geographicLinesVisible,
    globeSettings.labelsVisible,
    globeSettings.viewMode,
  ]);

  useEffect(() => {
    const mode = globeSettings.viewMode ?? "3d";
    const isCesium = mode === "3d" || mode === "2d";
    const isOrtho = mode === "ortho";
    const useBlack = isCesium || isOrtho;
    const desired = useBlack
      ? DEFAULT_LINE_COLORS_BLACK
      : DEFAULT_LINE_COLORS_GRAY;
    const other = useBlack
      ? DEFAULT_LINE_COLORS_GRAY
      : DEFAULT_LINE_COLORS_BLACK;
    if (isLineColorDefault(lineColors, other)) {
      setLineColors(desired);
    }
  }, [
    DEFAULT_LINE_COLORS_BLACK,
    DEFAULT_LINE_COLORS_GRAY,
    globeSettings.viewMode,
    isLineColorDefault,
    lineColors,
    setLineColors,
  ]);

  const datasetStartDate = useMemo(
    () =>
      currentDataset?.startDate
        ? new Date(currentDataset.startDate)
        : new Date(1979, 0, 1),
    [currentDataset?.startDate],
  );

  const datasetEndDate = useMemo(
    () =>
      currentDataset?.endDate ? new Date(currentDataset.endDate) : new Date(),
    [currentDataset?.endDate],
  );

  const defaultDateForDataset = useMemo(() => {
    if (!currentDataset) return new Date();
    return datasetEndDate;
  }, [currentDataset, datasetEndDate]);

  useEffect(() => {
    const datasetId = currentDataset?.id;
    if (!datasetId) return;
    if (initialDateSetRef.current === datasetId) return;
    initialDateSetRef.current = datasetId;
    const clamped = clampDateToRange(
      selectedDate,
      datasetStartDate,
      datasetEndDate,
    );
    if (clamped.getTime() !== selectedDate.getTime()) {
      setSelectedDate(clamped);
    }
  }, [
    currentDataset?.id,
    selectedDate,
    datasetStartDate,
    datasetEndDate,
    setSelectedDate,
  ]);

  const totalDatasetDays = useMemo(
    () =>
      Math.max(
        0,
        Math.round(
          (datasetEndDate.getTime() - datasetStartDate.getTime()) / DAY_MS,
        ),
      ),
    [datasetEndDate, datasetStartDate],
  );

  const stepOptions = useMemo(
    () => getStepOptionsForDataset(currentDataset),
    [currentDataset],
  );

  useEffect(() => {
    const nextStep =
      stepOptions.includes(visualizationStep) && visualizationStep
        ? visualizationStep
        : stepOptions[0];
    if (nextStep && nextStep !== visualizationStep)
      setVisualizationStep(nextStep);

    const defaultStart =
      visualizationStart ??
      selectedDate ??
      clampDateToRange(defaultDateForDataset, datasetStartDate, datasetEndDate);
    const clampedStart = clampDateToRange(
      defaultStart,
      datasetStartDate,
      datasetEndDate,
    );
    const desiredEnd =
      visualizationEnd ??
      selectedDate ??
      clampDateToRange(defaultDateForDataset, datasetStartDate, datasetEndDate);
    const normalizedEnd = desiredEnd < clampedStart ? clampedStart : desiredEnd;
    const clampedEnd = clampDateToRange(
      normalizedEnd,
      datasetStartDate,
      datasetEndDate,
    );

    if (
      !visualizationStart ||
      visualizationStart.getTime() !== clampedStart.getTime()
    )
      setVisualizationStart(clampedStart);
    if (
      !visualizationEnd ||
      visualizationEnd.getTime() !== clampedEnd.getTime()
    )
      setVisualizationEnd(clampedEnd);
  }, [
    datasetEndDate,
    datasetStartDate,
    selectedDate,
    stepOptions,
    visualizationEnd,
    visualizationStart,
    visualizationStep,
    defaultDateForDataset,
  ]);

  useEffect(() => {
    if (!showVisualizationModal) return;
    const fallbackStart = clampDateToRange(
      visualizationStart ??
        selectedDate ??
        clampDateToRange(
          defaultDateForDataset,
          datasetStartDate,
          datasetEndDate,
        ),
      datasetStartDate,
      datasetEndDate,
    );
    const fallbackEnd = clampDateToRange(
      visualizationEnd ??
        selectedDate ??
        clampDateToRange(
          defaultDateForDataset,
          datasetStartDate,
          datasetEndDate,
        ),
      datasetStartDate,
      datasetEndDate,
    );
    setStartInputValue(fallbackStart.toISOString().slice(0, 10));
    setEndInputValue(fallbackEnd.toISOString().slice(0, 10));
    setVisualizationStart(fallbackStart);
    setVisualizationEnd(fallbackEnd);
  }, [
    datasetEndDate,
    datasetStartDate,
    selectedDate,
    showVisualizationModal,
    visualizationEnd,
    visualizationStart,
    defaultDateForDataset,
  ]);

  const playbackIntervalMs = useMemo(() => {
    if (visualizationStep === "year") return 1200;
    if (visualizationStep === "month") return 800;
    return 500;
  }, [visualizationStep]);

  const startPlayback = useCallback(() => {
    if (
      !visualizationDates.length ||
      prefetchedRasters.size === 0 ||
      prefetchedRasterGrids.size === 0 ||
      !visualizationTarget
    )
      return;
    if (visualizationTarget.datasetId) {
      const targetDataset =
        datasets.find((ds) => ds.id === visualizationTarget.datasetId) ??
        visualizationTarget.datasetSnapshot;
      setCurrentDataset(targetDataset);
    }
    const safeIndex = Math.min(
      activeVisualizationIndex,
      visualizationDates.length - 1,
    );
    setActiveVisualizationIndex(safeIndex);
    setSelectedDate(visualizationDates[safeIndex]);
    setVisualizationStatus("playing");
  }, [
    activeVisualizationIndex,
    prefetchedRasters,
    prefetchedRasterGrids,
    setSelectedDate,
    visualizationDates,
    datasets,
    setCurrentDataset,
    visualizationTarget,
  ]);

  const handleStopVisualization = useCallback(() => {
    if (visualizationAbortRef.current) {
      visualizationAbortRef.current.abort();
      visualizationAbortRef.current = null;
    }
    if (visualizationResumeTimeoutRef.current != null) {
      window.clearTimeout(visualizationResumeTimeoutRef.current);
      visualizationResumeTimeoutRef.current = null;
    }
    if (visualizationInteractionTimeoutRef.current != null) {
      window.clearTimeout(visualizationInteractionTimeoutRef.current);
      visualizationInteractionTimeoutRef.current = null;
    }
    visualizationPausedRef.current = false;
    visualizationPrefetchConfigRef.current = null;
    visualizationPrefetchIndexRef.current = 0;
    setVisualizationStatus("idle");
    setVisualizationProgress(0);
    setPrefetchedRasters(new Map());
    setPrefetchedRasterGrids(new Map());
    setVisualizationDates([]);
    setActiveVisualizationIndex(0);
  }, []);

  useEffect(() => {
    prefetchedRastersRef.current = prefetchedRasters;
  }, [prefetchedRasters]);
  useEffect(() => {
    prefetchedRasterGridsRef.current = prefetchedRasterGrids;
  }, [prefetchedRasterGrids]);

  const runVisualizationPrefetch = useCallback(async (startIndex: number) => {
    const config = visualizationPrefetchConfigRef.current;
    if (!config) return;

    if (visualizationAbortRef.current) visualizationAbortRef.current.abort();
    const controller = new AbortController();
    visualizationAbortRef.current = controller;
    visualizationPausedRef.current = false;

    const nextMap = new Map(prefetchedRastersRef.current);
    const nextGridMap = new Map(prefetchedRasterGridsRef.current);
    const loadedImageUrls = new Set<string>();

    const preloadTextureImages = async (
      textures: RasterLayerData["textures"],
    ) => {
      if (!Array.isArray(textures) || textures.length === 0) return;
      await Promise.all(
        textures.map((texture) => {
          const url =
            typeof texture?.imageUrl === "string"
              ? texture.imageUrl.trim()
              : "";
          if (!url || loadedImageUrls.has(url)) return Promise.resolve();
          loadedImageUrls.add(url);
          return new Promise<void>((resolve) => {
            const image = new Image();
            image.onload = () => resolve();
            image.onerror = () => resolve();
            image.src = url;
          });
        }),
      );
    };

    try {
      for (let i = startIndex; i < config.frames.length; i += 1) {
        if (controller.signal.aborted) {
          return;
        }
        if (visualizationPausedRef.current) {
          visualizationPrefetchIndexRef.current = i;
          return;
        }

        // Yield so interactive imagery can render while prefetching.
        if (i > startIndex) {
          await yieldToBrowser();
          if (controller.signal.aborted || visualizationPausedRef.current) {
            visualizationPrefetchIndexRef.current = i;
            return;
          }
        }

        const frameDate = config.frames[i];
        const rasterGrid = await fetchRasterGrid({
          dataset: config.dataset,
          backendDatasetId: config.keyDatasetId,
          date: frameDate,
          level: config.level ?? undefined,
          maskZeroValues: config.hideZero,
          colorbarRange: config.colorbarRange,
          signal: controller.signal,
        });
        const raster = await fetchRasterVisualization({
          dataset: config.dataset,
          backendDatasetId: config.keyDatasetId,
          date: frameDate,
          level: config.level ?? undefined,
          cssColors: config.cssColors,
          maskZeroValues: config.hideZero,
          smoothGridBoxValues: config.smoothGridBoxValues,
          gridData: rasterGrid,
          colorbarRange: config.colorbarRange,
          signal: controller.signal,
        });
        await preloadTextureImages(raster.textures);

        await yieldToBrowser();
        if (controller.signal.aborted || visualizationPausedRef.current) {
          visualizationPrefetchIndexRef.current = i + 1;
          return;
        }

        const key = buildRasterRequestKey({
          dataset: config.dataset,
          backendDatasetId: config.keyDatasetId,
          date: frameDate,
          level: config.level ?? undefined,
          cssColors: config.cssColors,
          maskZeroValues: config.hideZero,
          smoothGridBoxValues: config.smoothGridBoxValues,
          colorbarRange: config.colorbarRange,
        });
        if (key) nextMap.set(key, raster);

        const gridKey = buildRasterGridRequestKey({
          dataset: config.dataset,
          backendDatasetId: config.keyDatasetId,
          date: frameDate,
          level: config.level ?? undefined,
          maskZeroValues: config.hideZero,
          colorbarRange: config.colorbarRange,
        });
        if (gridKey) nextGridMap.set(gridKey, rasterGrid);

        visualizationPrefetchIndexRef.current = i + 1;
        setPrefetchedRasters(new Map(nextMap));
        setPrefetchedRasterGrids(new Map(nextGridMap));
        setVisualizationProgress((i + 1) / config.frames.length);
      }

      visualizationPrefetchIndexRef.current = config.frames.length;
      setVisualizationStatus("ready");
      setVisualizationProgress(1);
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error as DOMException).name === "AbortError"
      ) {
        if (visualizationPausedRef.current) return;
      } else {
        setVisualizationError(
          error instanceof Error
            ? error.message
            : "Failed to prepare visualization.",
        );
      }
      setVisualizationStatus("idle");
    } finally {
      if (visualizationAbortRef.current === controller)
        visualizationAbortRef.current = null;
    }
  }, []);

  const handleBeginVisualization = useCallback(async () => {
    if (!currentDataset || !visualizationStart || !visualizationEnd) {
      setVisualizationError("Select a start and end date.");
      return;
    }

    setVisualizationTarget({
      datasetId: currentDataset.id,
      datasetSnapshot: currentDataset,
      level: selectedLevelValue ?? null,
    });
    setShowVisualizationModal(false);
    setShowVisualizationBar(true);

    const normalizedStart = clampDateToRange(
      visualizationStart,
      datasetStartDate,
      datasetEndDate,
    );
    const normalizedEnd = clampDateToRange(
      visualizationEnd,
      datasetStartDate,
      datasetEndDate,
    );
    const start =
      normalizedStart <= normalizedEnd ? normalizedStart : normalizedEnd;
    const end =
      normalizedEnd >= normalizedStart ? normalizedEnd : normalizedStart;
    const frames = buildFrameDates(start, end, visualizationStep);

    if (!frames.length) {
      setVisualizationError("Unable to build frames for the selected range.");
      return;
    }

    setVisualizationError(null);
    setVisualizationStatus("preparing");
    setVisualizationProgress(0);
    setVisualizationDates(frames);
    setActiveVisualizationIndex(0);
    setPrefetchedRasters(new Map());
    setPrefetchedRasterGrids(new Map());

    const cssColors = currentDataset?.colorScale?.colors
      ?.map((color) => (typeof color === "string" ? color.trim() : ""))
      .filter(Boolean);
    const colorRangeForRequests = resolveEffectiveColorbarRange(
      currentDataset,
      selectedLevelValue,
      colorbarRange,
    );
    const keyDatasetId =
      currentDataset.id ?? currentDataset.slug ?? currentDataset.id;

    visualizationPrefetchConfigRef.current = {
      dataset: currentDataset,
      frames,
      cssColors: cssColors ?? [],
      colorbarRange: colorRangeForRequests,
      level: selectedLevelValue ?? null,
      hideZero: globeSettings.hideZeroPrecipitation,
      smoothGridBoxValues: globeSettings.rasterBlurEnabled,
      keyDatasetId,
    };
    visualizationPrefetchIndexRef.current = 0;
    if (visualizationResumeTimeoutRef.current != null) {
      window.clearTimeout(visualizationResumeTimeoutRef.current);
      visualizationResumeTimeoutRef.current = null;
    }
    visualizationPausedRef.current = false;
    runVisualizationPrefetch(0);
    setShowVisualizationModal(false);
  }, [
    colorbarRange,
    currentDataset,
    datasetEndDate,
    datasetStartDate,
    globeSettings.hideZeroPrecipitation,
    globeSettings.rasterBlurEnabled,
    runVisualizationPrefetch,
    selectedLevelValue,
    visualizationEnd,
    visualizationStart,
    visualizationStep,
  ]);

  useEffect(() => {
    if (visualizationStatus !== "playing") return;
    const frames = visualizationDates;
    if (!frames.length) {
      setVisualizationStatus("ready");
      return;
    }

    let index = activeVisualizationIndex;
    setSelectedDate(frames[index]);

    const timer = window.setInterval(() => {
      index += 1;
      if (index >= frames.length) {
        setVisualizationStatus("ready");
        setActiveVisualizationIndex(0);
        return;
      }
      setActiveVisualizationIndex(index);
      setSelectedDate(frames[index]);
    }, playbackIntervalMs);

    return () => window.clearInterval(timer);
  }, [
    activeVisualizationIndex,
    playbackIntervalMs,
    setSelectedDate,
    visualizationDates,
    visualizationStatus,
  ]);

  useEffect(() => {
    const datasetId = currentDataset?.id;
    if (!datasetId) return;

    const datasetText = [
      currentDataset?.id,
      currentDataset?.slug,
      currentDataset?.name,
      currentDataset?.description,
      currentDataset?.sourceName,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase())
      .join(" ");
    const isCmorphDataset = datasetText.includes("cmorph");
    const isGodasDataset =
      datasetText.includes("godas") ||
      datasetText.includes("global ocean data assimilation system") ||
      datasetText.includes("ncep global ocean data assimilation");

    const isNewDataset = lastDatasetIdRef.current !== datasetId;
    if (isNewDataset) {
      lastDatasetIdRef.current = datasetId;
      setGlobeSettings((prev) => {
        if (isCmorphDataset || isGodasDataset) {
          return prev.hideZeroPrecipitation
            ? prev
            : { ...prev, hideZeroPrecipitation: true };
        }

        // Non-CMORPH/GODAS datasets should default to showing all values.
        return prev.hideZeroPrecipitation
          ? { ...prev, hideZeroPrecipitation: false }
          : prev;
      });
    }
  }, [currentDataset]);

  useEffect(() => {
    const datasetId = currentDataset?.id;
    if (!datasetId || !visualizationTarget?.datasetId) return;
    const switchedDatasets = visualizationTarget.datasetId !== datasetId;
    if (visualizationStatus !== "preparing") return;

    if (!switchedDatasets) {
      if (visualizationPausedRef.current) {
        visualizationPausedRef.current = false;
        if (visualizationResumeTimeoutRef.current != null) {
          window.clearTimeout(visualizationResumeTimeoutRef.current);
          visualizationResumeTimeoutRef.current = null;
        }
        runVisualizationPrefetch(visualizationPrefetchIndexRef.current);
      }
      return;
    }

    visualizationPausedRef.current = true;
    if (visualizationAbortRef.current) {
      visualizationAbortRef.current.abort();
      visualizationAbortRef.current = null;
    }
    if (visualizationResumeTimeoutRef.current != null)
      window.clearTimeout(visualizationResumeTimeoutRef.current);
    visualizationResumeTimeoutRef.current = window.setTimeout(() => {
      visualizationResumeTimeoutRef.current = null;
      visualizationPausedRef.current = false;
      runVisualizationPrefetch(visualizationPrefetchIndexRef.current);
    }, 1500);
  }, [
    currentDataset?.id,
    runVisualizationPrefetch,
    visualizationStatus,
    visualizationTarget?.datasetId,
  ]);

  useEffect(() => {
    if (visualizationStatus !== "preparing") {
      return;
    }
    if (visualizationInteractionTimeoutRef.current != null) {
      window.clearTimeout(visualizationInteractionTimeoutRef.current);
    }
    visualizationPausedRef.current = true;
    if (visualizationAbortRef.current) {
      visualizationAbortRef.current.abort();
      visualizationAbortRef.current = null;
    }
    visualizationInteractionTimeoutRef.current = window.setTimeout(() => {
      visualizationInteractionTimeoutRef.current = null;
      visualizationPausedRef.current = false;
      runVisualizationPrefetch(visualizationPrefetchIndexRef.current);
    }, 1000);
  }, [selectedDate, runVisualizationPrefetch, visualizationStatus]);

  // Event Handlers
  const handleDateChange = useCallback(
    (date: Date) => {
      setSelectedDate(date);
      if (visualizationStatus === "playing") setVisualizationStatus("ready");
    },
    [setSelectedDate, visualizationStatus],
  );

  const handlePlayPause = useCallback(
    (shouldPlay: boolean) => {
      if (shouldPlay) {
        if (visualizationStatus === "ready") {
          startPlayback();
        } else if (
          visualizationStatus === "idle" &&
          prefetchedRasters.size > 0 &&
          prefetchedRasterGrids.size > 0
        ) {
          setVisualizationStatus("ready");
          startPlayback();
        }
      } else if (visualizationStatus === "playing") {
        setVisualizationStatus("ready");
      }
    },
    [
      prefetchedRasters,
      prefetchedRasterGrids,
      startPlayback,
      visualizationStatus,
    ],
  );

  const handlePressureLevelChange = useCallback((level: PressureLevel) => {
    setSelectedPressureLevel(level);
    setRasterMeta(null);
  }, []);

  const handleRegionClick = useCallback(
    (latitude: number, longitude: number, data?: RegionData) => {
      setRegionInfoData({
        latitude,
        longitude,
        regionData: data || {
          name: "No data",
          dataset: currentDataset?.name ?? "No dataset selected",
          unit: currentDataset?.units ?? "units",
        },
      });
      setShowRegionInfo(true);
      setCurrentLocationMarker({
        latitude,
        longitude,
        name: data?.name,
        source: "marker",
      });
    },
    [
      setRegionInfoData,
      setShowRegionInfo,
      setCurrentLocationMarker,
      currentDataset,
    ],
  );

  const handleRegionInfoClose = useCallback(() => {
    setShowRegionInfo(false);
    globeRef.current?.clearMarker();
  }, [setShowRegionInfo]);

  const handleSatelliteToggle = useCallback((visible: boolean) => {
    setGlobeSettings((prev) => ({ ...prev, satelliteLayerVisible: visible }));
  }, []);

  const handleBoundaryToggle = useCallback((visible: boolean) => {
    setGlobeSettings((prev) => ({ ...prev, boundaryLinesVisible: visible }));
  }, []);

  const handleCountryBoundaryResolutionChange = useCallback(
    (resolution: GlobeLineResolution) => {
      setGlobeSettings((prev) => ({
        ...prev,
        countryBoundaryResolution: resolution,
      }));
    },
    [],
  );

  const handleStateBoundaryResolutionChange = useCallback(
    (resolution: GlobeLineResolution) => {
      setGlobeSettings((prev) => ({
        ...prev,
        stateBoundaryResolution: resolution,
      }));
    },
    [],
  );

  const handleGeographicLinesToggle = useCallback((visible: boolean) => {
    setGlobeSettings((prev) => ({ ...prev, geographicLinesVisible: visible }));
  }, []);

  const handleTimeZoneLinesToggle = useCallback((visible: boolean) => {
    setGlobeSettings((prev) => ({ ...prev, timeZoneLinesVisible: visible }));
  }, []);

  const handlePacificCenteredToggle = useCallback((enabled: boolean) => {
    setGlobeSettings((prev) => ({ ...prev, pacificCentered: enabled }));
  }, []);

  const handleCoastlineResolutionChange = useCallback(
    (resolution: GlobeLineResolution) => {
      setGlobeSettings((prev) => ({
        ...prev,
        coastlineResolution: resolution,
      }));
    },
    [],
  );

  const handleRiverResolutionChange = useCallback(
    (resolution: GlobeLineResolution) => {
      setGlobeSettings((prev) => ({ ...prev, riverResolution: resolution }));
    },
    [],
  );

  const handleLakeResolutionChange = useCallback(
    (resolution: GlobeLineResolution) => {
      setGlobeSettings((prev) => ({ ...prev, lakeResolution: resolution }));
    },
    [],
  );

  const handleNaturalEarthGeographicLinesToggle = useCallback(
    (visible: boolean) => {
      setGlobeSettings((prev) => ({
        ...prev,
        naturalEarthGeographicLinesVisible: visible,
      }));
    },
    [],
  );

  const handleBaseMapModeChange = useCallback(
    (mode: "satellite" | "street") => {
      setGlobeSettings((prev) => ({
        ...prev,
        baseMapMode: mode,
        labelsVisible:
          mode === "street" ? false : lastSatelliteLabelsVisibleRef.current,
      }));
    },
    [],
  );

  const handleLabelsToggle = useCallback((visible: boolean) => {
    setGlobeSettings((prev) => {
      if (prev.baseMapMode !== "street")
        lastSatelliteLabelsVisibleRef.current = visible;
      return { ...prev, labelsVisible: visible };
    });
  }, []);

  const handleRasterBlurToggle = useCallback((enabled: boolean) => {
    setGlobeSettings((prev) => ({ ...prev, rasterBlurEnabled: enabled }));
  }, []);

  const handleBumpMapModeChange = useCallback(
    (mode: "none" | "land" | "landBathymetry") => {
      setGlobeSettings((prev) => ({ ...prev, bumpMapMode: mode }));
    },
    [],
  );

  const handleRasterOpacityChange = useCallback((opacity: number) => {
    setGlobeSettings((prev) => ({ ...prev, rasterOpacity: opacity }));
  }, []);

  const handleHideZeroPrecipToggle = useCallback((enabled: boolean) => {
    setGlobeSettings((prev) => ({ ...prev, hideZeroPrecipitation: enabled }));
  }, []);

  const handleColorbarRangeChange = useCallback(
    (payload: { min: number | null; max: number | null }) => {
      setColorbarRange(payload.min, payload.max);
    },
    [setColorbarRange],
  );

  const handleColorbarRangeReset = useCallback(() => {
    resetColorbarRange();
  }, [resetColorbarRange]);

  const handleViewModeChange = useCallback(
    (mode: GlobeSettings["viewMode"]) => {
      setGlobeSettings((prev) => ({ ...prev, viewMode: mode ?? "3d" }));
    },
    [],
  );

  const handleProjectionOrientationChange = useCallback(
    (projectionId: MapProjectionId, orientation: MapOrientation) => {
      if (!orientation) return;
      setGlobeSettings((prev) => ({
        ...prev,
        mapOrientations: {
          ...(prev.mapOrientations ?? {}),
          [projectionId]: orientation,
        },
      }));
    },
    [],
  );

  useEffect(() => {
    setRasterMeta(null);
  }, [currentDataset]);

  useEffect(() => {
    if (!hasPressureLevels || !datasetPressureLevels) {
      setSelectedPressureLevel(null);
      return;
    }
    setSelectedPressureLevel((prev) => {
      if (prev) {
        const match = datasetPressureLevels.find(
          (level) => level.value === prev.value,
        );
        if (match) return match;
      }
      return defaultPressureLevel ?? datasetPressureLevels[0];
    });
  }, [
    hasPressureLevels,
    datasetPressureLevels,
    currentDataset?.id,
    defaultPressureLevel,
  ]);

  useEffect(() => {
    if (!hasPressureLevels) return;
    setRasterMeta(null);
  }, [selectedPressureLevel, hasPressureLevels]);

  useEffect(() => {
    if (
      !visualizationTarget ||
      !currentDataset ||
      currentDataset.id !== visualizationTarget.datasetId
    )
      return;
    if (
      visualizationTarget.level != null &&
      hasPressureLevels &&
      datasetPressureLevels
    ) {
      const match = datasetPressureLevels.find(
        (lvl) => lvl.value === visualizationTarget.level,
      );
      if (match) setSelectedPressureLevel(match);
    }
  }, [
    currentDataset,
    datasetPressureLevels,
    hasPressureLevels,
    visualizationTarget,
  ]);

  const useMeshRaster = true;

  const rasterState = useRasterLayer({
    dataset: currentDataset ?? undefined,
    date: selectedDate,
    level: selectedLevelValue ?? null,
    maskZeroValues: globeSettings.hideZeroPrecipitation,
    smoothGridBoxValues: globeSettings.rasterBlurEnabled,
    opacity: globeSettings.rasterOpacity,
    keepPreviousData: visualizationStatus === "playing",
    colorbarRange,
    prefetchedData: prefetchedRasters,
  });

  const rasterGridState = useRasterGrid({
    dataset: currentDataset ?? undefined,
    date: selectedDate,
    level: selectedLevelValue ?? null,
    maskZeroValues: globeSettings.hideZeroPrecipitation,
    colorbarRange,
    enabled: useMeshRaster,
    prefetchedData: prefetchedRasterGrids,
  });

  useEffect(() => {
    if (!locationFocusRequest || !globeRef.current) return;
    if (locationFocusRequest.mode === "clear") {
      globeRef.current.clearSearchMarker();
      setCurrentLocationMarker(null);
      clearLocationFocusRequest();
      return;
    }
    const { latitude, longitude, name } = locationFocusRequest;
    if (typeof latitude === "number" && typeof longitude === "number") {
      globeRef.current.focusOnLocation({ latitude, longitude, name });
      setCurrentLocationMarker({
        latitude,
        longitude,
        name: name ?? null,
        source: "search",
      });
    }
    clearLocationFocusRequest();
  }, [
    locationFocusRequest,
    clearLocationFocusRequest,
    setCurrentLocationMarker,
  ]);

  const isPlaybackReady =
    prefetchedRasters.size > 0 &&
    prefetchedRasterGrids.size > 0 &&
    visualizationDates.length > 0 &&
    visualizationStatus !== "preparing" &&
    Boolean(visualizationTarget);

  const progressPercent = Math.round(
    Math.min(Math.max(visualizationProgress, 0), 1) * 100,
  );

  if (isLoading || !currentDataset) {
    return (
      <section className="bg-background fixed inset-0 flex h-screen w-screen items-center justify-center">
        <div className="text-center">
          <div className="border-primary mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-t-transparent" />
          <p className="text-muted-foreground">
            {isLoading ? "Loading datasets..." : "No dataset available"}
          </p>
          {!isLoading && !currentDataset && datasets.length === 0 && (
            <p className="text-muted-foreground mt-2 text-sm">
              Please check your database connection
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="bg-background fixed inset-0 h-screen w-screen overflow-hidden">
      <Globe
        ref={globeRef}
        currentDataset={currentDataset ?? undefined}
        selectedDate={selectedDate}
        selectedLevel={selectedLevelValue}
        colorbarRange={colorbarRange}
        hideZeroPrecipitation={globeSettings.hideZeroPrecipitation}
        onRegionClick={handleRegionClick}
        baseMapMode={globeSettings.baseMapMode}
        satelliteLayerVisible={globeSettings.satelliteLayerVisible}
        boundaryLinesVisible={globeSettings.boundaryLinesVisible}
        countryBoundaryResolution={globeSettings.countryBoundaryResolution}
        stateBoundaryResolution={globeSettings.stateBoundaryResolution}
        geographicLinesVisible={globeSettings.geographicLinesVisible}
        timeZoneLinesVisible={globeSettings.timeZoneLinesVisible}
        pacificCentered={globeSettings.pacificCentered}
        coastlineResolution={globeSettings.coastlineResolution}
        riverResolution={globeSettings.riverResolution}
        lakeResolution={globeSettings.lakeResolution}
        naturalEarthGeographicLinesVisible={
          globeSettings.naturalEarthGeographicLinesVisible
        }
        labelsVisible={globeSettings.labelsVisible}
        rasterOpacity={globeSettings.rasterOpacity}
        rasterBlurEnabled={globeSettings.rasterBlurEnabled}
        bumpMapMode={globeSettings.bumpMapMode}
        lineColors={lineColors}
        mapOrientations={globeSettings.mapOrientations}
        onProjectionOrientationChange={handleProjectionOrientationChange}
        useMeshRaster={useMeshRaster}
        viewMode={globeSettings.viewMode ?? "3d"}
        onRasterMetadataChange={setRasterMeta}
        isPlaying={visualizationStatus === "playing"}
        prefetchedRasters={prefetchedRasters}
        prefetchedRasterGrids={prefetchedRasterGrids}
        meshFadeDurationMs={visualizationFadeMs}
        rasterState={rasterState}
        rasterGridState={rasterGridState}
      />

      <div className="pointer-events-none absolute inset-0 z-20">
        <div className="pointer-events-auto">
          <SideButtons
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
            onShowTutorial={() => setTutorialOpen(true)}
            onShowSidebarPanel={setActiveSidebarPanel}
            globeSettings={globeSettings}
            onBaseMapModeChange={handleBaseMapModeChange}
            onSatelliteToggle={handleSatelliteToggle}
            onBoundaryToggle={handleBoundaryToggle}
            onCountryBoundaryResolutionChange={
              handleCountryBoundaryResolutionChange
            }
            onStateBoundaryResolutionChange={
              handleStateBoundaryResolutionChange
            }
            onGeographicLinesToggle={handleGeographicLinesToggle}
            onTimeZoneLinesToggle={handleTimeZoneLinesToggle}
            onPacificCenteredToggle={handlePacificCenteredToggle}
            onCoastlineResolutionChange={handleCoastlineResolutionChange}
            onRiverResolutionChange={handleRiverResolutionChange}
            onLakeResolutionChange={handleLakeResolutionChange}
            onNaturalEarthGeographicLinesToggle={
              handleNaturalEarthGeographicLinesToggle
            }
            onLabelsToggle={handleLabelsToggle}
            onRasterOpacityChange={handleRasterOpacityChange}
            onHideZeroPrecipToggle={handleHideZeroPrecipToggle}
            onRasterBlurToggle={handleRasterBlurToggle}
            onBumpMapModeChange={handleBumpMapModeChange}
            onColorbarRangeChange={handleColorbarRangeChange}
            onColorbarRangeReset={handleColorbarRangeReset}
            viewMode={globeSettings.viewMode ?? "3d"}
            onViewModeChange={handleViewModeChange}
            onShowVisualizationModal={() => {
              setVisualizationError(null);
              setShowVisualizationModal(true);
              setShowVisualizationBar(true);
            }}
          />
        </div>

        {showVisualizationBar &&
          (visualizationStatus === "preparing" ||
            isPlaybackReady ||
            visualizationStatus === "playing") && (
            <div className="pointer-events-auto fixed top-20 left-6 z-60 flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-full bg-black/60 text-white hover:bg-white/10"
                onClick={() => setShowVisualizationBar(false)}
                aria-label="Close visualization bar"
              >
                ×
              </Button>
              <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/70 px-4 py-2 shadow-lg backdrop-blur">
                <div className="w-48">
                  <div className="text-xs font-medium text-slate-100">
                    {visualizationStatus === "preparing"
                      ? "Preparing visualization…"
                      : visualizationStatus === "playing"
                        ? "Playing visualization"
                        : "Visualization ready"}
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-white/15">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                  onClick={() => {
                    if (visualizationStatus === "preparing") {
                      handleStopVisualization();
                      return;
                    }
                    if (visualizationStatus === "playing") {
                      setVisualizationStatus("ready");
                      return;
                    }
                    if (isPlaybackReady) startPlayback();
                  }}
                >
                  {visualizationStatus === "preparing" ||
                  visualizationStatus === "playing" ? (
                    <Square className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  <span className="ml-2">
                    {visualizationStatus === "preparing"
                      ? "Stop"
                      : visualizationStatus === "playing"
                        ? "Pause"
                        : "Play"}
                  </span>
                </Button>
              </div>
            </div>
          )}

        <div className="pointer-events-auto">
          <Tutorial
            isOpen={tutorialOpen}
            onClose={() => setTutorialOpen(false)}
          />
        </div>

        <div className="pointer-events-auto z-9999">
          <ColorBar
            show={showColorbar}
            onToggle={toggleColorbar}
            dataset={currentDataset}
            unit={temperatureUnit}
            onUnitChange={setTemperatureUnit}
            onRangeChange={handleColorbarRangeChange}
            onRangeReset={handleColorbarRangeReset}
            onPositionChange={setColorBarPosition}
            collapsed={colorBarCollapsed}
            onToggleCollapse={setColorBarCollapsed}
            rasterMeta={rasterMeta}
            orientation={colorBarOrientation}
            selectedLevel={selectedLevelValue}
            customRange={{
              enabled: colorbarCustomMin !== null || colorbarCustomMax !== null,
              min: colorbarCustomMin ?? null,
              max: colorbarCustomMax ?? null,
            }}
          />
        </div>

        <div className="pointer-events-auto absolute right-0 bottom-0 left-0 z-20 pb-6">
          <div className="relative flex items-end justify-center px-4 py-2">
            <div className="pointer-events-auto w-full max-w-4xl">
              <TimeBar
                selectedDate={selectedDate}
                onDateChange={handleDateChange}
                onPlayPause={handlePlayPause}
                isPlaying={visualizationStatus === "playing"}
                playIntervalMs={playbackIntervalMs}
                disableAutoplay
                disablePlayButton={
                  visualizationStatus !== "ready" &&
                  visualizationStatus !== "playing"
                }
              />
            </div>
            {hasPressureLevels && datasetPressureLevels && (
              <div
                className="pointer-events-auto absolute bottom-0"
                style={{ left: "calc(45% + (min(100vw, 896px) / 2))" }}
              >
                <PressureLevelsSelector
                  selectedLevel={selectedPressureLevel}
                  onLevelChange={handlePressureLevelChange}
                  levels={datasetPressureLevels}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={showVisualizationModal}
        onOpenChange={(open) => {
          setShowVisualizationModal(open);
          if (!open) setVisualizationError(null);
        }}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-225 lg:max-w-250">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              Visualization
            </DialogTitle>
            <DialogDescription className="text-slate-200">
              Choose two dates from{" "}
              {datasetStartDate.toLocaleDateString("en-US")} to{" "}
              {datasetEndDate.toLocaleDateString("en-US")} to build a playback
              for {currentDataset?.name ?? "this dataset"}.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-6 py-4 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="mb-2 text-sm font-semibold text-white">Start</p>
              <Input
                type="text"
                className="mb-3 bg-black/40 text-white"
                placeholder="YYYY-MM-DD"
                value={startInputValue}
                onChange={(e) => {
                  const value = e.target.value;
                  setStartInputValue(value);
                  const next = parseDateInput(
                    value,
                    datasetStartDate,
                    datasetEndDate,
                  );
                  if (next) {
                    setVisualizationStart(next);
                    setStartInputValue(next.toISOString().slice(0, 10));
                  }
                }}
              />
              <div className="flex items-center justify-center gap-6">
                <Calendar
                  mode="single"
                  selected={
                    parseDateInput(
                      startInputValue,
                      datasetStartDate,
                      datasetEndDate,
                    ) ??
                    visualizationStart ??
                    datasetStartDate
                  }
                  onSelect={(value) => {
                    if (value) {
                      const clamped = clampDateToRange(
                        value,
                        datasetStartDate,
                        datasetEndDate,
                      );
                      setVisualizationStart(clamped);
                      setStartInputValue(clamped.toISOString().slice(0, 10));
                    }
                  }}
                  defaultMonth={
                    parseDateInput(
                      startInputValue,
                      datasetStartDate,
                      datasetEndDate,
                    ) ??
                    visualizationStart ??
                    datasetStartDate
                  }
                  disabled={(date) =>
                    date < datasetStartDate || date > datasetEndDate
                  }
                />
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[10px] tracking-wide text-slate-300 uppercase">
                    {datasetEndDate.toLocaleDateString("en-US")}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={totalDatasetDays}
                    value={dateToDayIndex(
                      visualizationStart ?? datasetStartDate,
                      datasetStartDate,
                      totalDatasetDays,
                    )}
                    onChange={(e) => {
                      const dayIndex = clampDayIndex(
                        Number(e.target.value),
                        totalDatasetDays,
                      );
                      const next = dayIndexToDate(
                        dayIndex,
                        datasetStartDate,
                        datasetEndDate,
                      );
                      setVisualizationStart(next);
                      setStartInputValue(next.toISOString().slice(0, 10));
                    }}
                    className="h-56 w-5 cursor-pointer appearance-none rounded-full bg-white/10"
                    style={{
                      WebkitAppearance: "slider-vertical",
                      writingMode: "vertical-rl",
                      direction: "rtl",
                    }}
                    aria-label="Start date slider"
                  />
                  <span className="text-[10px] tracking-wide text-slate-400 uppercase">
                    {datasetStartDate.toLocaleDateString("en-US")}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="mb-2 text-sm font-semibold text-white">End</p>
              <Input
                type="text"
                className="mb-3 bg-black/40 text-white"
                placeholder="YYYY-MM-DD"
                value={endInputValue}
                onChange={(e) => {
                  const value = e.target.value;
                  setEndInputValue(value);
                  const next = parseDateInput(
                    value,
                    datasetStartDate,
                    datasetEndDate,
                  );
                  if (next) {
                    setVisualizationEnd(next);
                    setEndInputValue(next.toISOString().slice(0, 10));
                  }
                }}
              />
              <div className="flex items-center justify-center gap-6">
                <Calendar
                  mode="single"
                  selected={
                    parseDateInput(
                      endInputValue,
                      datasetStartDate,
                      datasetEndDate,
                    ) ??
                    visualizationEnd ??
                    datasetEndDate
                  }
                  onSelect={(value) => {
                    if (value) {
                      const clamped = clampDateToRange(
                        value,
                        datasetStartDate,
                        datasetEndDate,
                      );
                      setVisualizationEnd(clamped);
                      setEndInputValue(clamped.toISOString().slice(0, 10));
                    }
                  }}
                  defaultMonth={
                    parseDateInput(
                      endInputValue,
                      datasetStartDate,
                      datasetEndDate,
                    ) ??
                    visualizationEnd ??
                    datasetEndDate
                  }
                  disabled={(date) =>
                    date < datasetStartDate || date > datasetEndDate
                  }
                />
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[10px] tracking-wide text-slate-300 uppercase">
                    {datasetEndDate.toLocaleDateString("en-US")}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={totalDatasetDays}
                    value={dateToDayIndex(
                      visualizationEnd ?? datasetEndDate,
                      datasetStartDate,
                      totalDatasetDays,
                    )}
                    onChange={(e) => {
                      const dayIndex = clampDayIndex(
                        Number(e.target.value),
                        totalDatasetDays,
                      );
                      const next = dayIndexToDate(
                        dayIndex,
                        datasetStartDate,
                        datasetEndDate,
                      );
                      setVisualizationEnd(next);
                      setEndInputValue(next.toISOString().slice(0, 10));
                    }}
                    className="h-56 w-5 cursor-pointer appearance-none rounded-full bg-white/10"
                    style={{
                      WebkitAppearance: "slider-vertical",
                      writingMode: "vertical-rl",
                      direction: "rtl",
                    }}
                    aria-label="End date slider"
                  />
                  <span className="text-[10px] tracking-wide text-slate-400 uppercase">
                    {datasetStartDate.toLocaleDateString("en-US")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-white">Advance by</p>
              <select
                className="w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white shadow-sm focus:border-white focus:outline-none"
                value={visualizationStep}
                onChange={(e) => {
                  const next = e.target.value as VisualizationStep;
                  if (stepOptions.includes(next)) setVisualizationStep(next);
                }}
              >
                {stepOptions.map((step) => (
                  <option key={step} value={step}>
                    {step === "year"
                      ? "Year"
                      : step === "month"
                        ? "Month"
                        : "Day"}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-300">
                Only increments supported by this dataset are available.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-white">Fade time</p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={1500}
                  step={50}
                  value={visualizationFadeMs}
                  onChange={(e) =>
                    setVisualizationFadeMs(Number(e.target.value))
                  }
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/20"
                />
                <span className="text-xs text-slate-200">
                  {visualizationFadeMs} ms
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Only affects mesh transitions during visualization playback.
              </p>
            </div>
          </div>

          {visualizationError && (
            <div className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {visualizationError}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowVisualizationModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleBeginVisualization}
              disabled={visualizationStatus === "preparing"}
            >
              {visualizationStatus === "preparing" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Begin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RegionInfoPanel
        show={showRegionInfo}
        onClose={handleRegionInfoClose}
        latitude={regionInfoData.latitude}
        longitude={regionInfoData.longitude}
        regionData={regionInfoData.regionData}
        colorBarPosition={colorBarPosition}
        colorBarCollapsed={colorBarCollapsed}
        colorBarOrientation={colorBarOrientation}
        colorbarCustomMin={globeSettings.colorbarCustomMin}
        colorbarCustomMax={globeSettings.colorbarCustomMax}
        currentDataset={currentDataset ?? undefined}
        selectedDate={selectedDate}
        temperatureUnit={temperatureUnit}
      />
    </section>
  );
}
