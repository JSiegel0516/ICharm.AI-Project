"use client";

import React, {
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
} from "react";
import Globe, { GlobeRef } from "@/components/Globe/Globe";
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
import { useAppState } from "@/context/HeaderContext";
import {
  RegionData,
  PressureLevel,
  GlobeSettings,
  type Dataset,
} from "@/types";
import { pressureLevels } from "@/utils/constants";
import { isSeaSurfaceTemperatureDataset } from "@/utils/datasetGuards";
import {
  buildRasterRequestKey,
  fetchRasterVisualization,
  resolveEffectiveColorbarRange,
  type RasterLayerData,
} from "@/hooks/useRasterLayer";
import { Play, Square, Loader2 } from "lucide-react";
import { SideButtons } from "./_components/SideButtons";
import { Tutorial } from "./_components/Tutorial";

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
    ) {
      return "millibar";
    }
    if (normalized === "hpa" || normalized.includes("hectopascal")) {
      return "hPa";
    }
    if (normalized === "pa" || normalized.includes("pascal")) {
      return "Pa";
    }
    if (normalized === "m" || normalized.includes("meter")) {
      return "m";
    }
    if (normalized === "km" || normalized.includes("kilometer")) {
      return "km";
    }
    return unit.trim();
  }

  const descriptorText = descriptor?.toLowerCase() ?? "";
  if (
    descriptorText.includes("pressure") ||
    descriptorText.includes("millibar") ||
    descriptorText.includes("mbar")
  ) {
    return "millibar";
  }
  if (
    descriptorText.includes("height") ||
    descriptorText.includes("altitude")
  ) {
    return "m";
  }
  return "level";
};

const isPressureUnit = (unit: string) => {
  const normalized = unit.toLowerCase();
  return (
    normalized === "millibar" || normalized === "hpa" || normalized === "pa"
  );
};

const formatLevelValue = (value: number) => {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
};

const formatPressureLevelLabel = (value: number, unit: string) => {
  const formattedValue = formatLevelValue(value);
  if (unit === "level") {
    return formattedValue;
  }
  return `${formattedValue} ${unit}`;
};

const parseNumericList = (input: unknown): number[] => {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
  }
  if (typeof input === "string") {
    const matches = input.match(/-?\d+(\.\d+)?/g);
    if (!matches) return [];
    return matches
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
  }
  if (typeof input === "number" && Number.isFinite(input)) {
    return [input];
  }
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
  if (step === "year") {
    next.setFullYear(next.getFullYear() + 1);
  } else if (step === "month") {
    next.setMonth(next.getMonth() + 1);
  } else {
    next.setDate(next.getDate() + 1);
  }
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
    if (next <= cursor) {
      break;
    }
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return clampDateToRange(parsed, minDate, maxDate);
};

export default function HomePage() {
  const {
    showColorbar,
    currentDataset,
    toggleColorbar,
    datasets,
    colorBarOrientation,
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
  } = useAppState();
  const globeRef = useRef<GlobeRef>(null);
  const lastDatasetIdRef = useRef<string | null>(null);

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
  const [showVisualizationBar, setShowVisualizationBar] = useState(true);
  const [visualizationTarget, setVisualizationTarget] = useState<{
    datasetId: string;
    datasetSnapshot: Dataset;
    level: number | null;
  } | null>(null);
  const visualizationAbortRef = useRef<AbortController | null>(null);

  // UI State
  const [activeSidebarPanel, setActiveSidebarPanel] =
    useState<SidebarPanel>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [colorBarCollapsed, setColorBarCollapsed] = useState(false);
  const [colorBarPosition, setColorBarPosition] = useState({ x: 24, y: 300 });

  const datasetPressureLevels = useMemo<PressureLevel[] | null>(() => {
    if (isSeaSurfaceTemperatureDataset(currentDataset)) {
      return null;
    }

    const backend = currentDataset?.backend;
    if (!backend) {
      return null;
    }

    let rawValues = parseNumericList(backend.levelValues);
    if (!rawValues.length) {
      rawValues = parseNumericList(backend.levels);
    }

    const normalizedUnit = normalizeLevelUnit(
      backend.levelUnits,
      backend.levels,
    );

    const isLikelyPressureDataset =
      isPressureUnit(normalizedUnit) ||
      backend.datasetName?.toLowerCase().includes("pressure") ||
      backend.layerParameter?.toLowerCase().includes("pressure") ||
      currentDataset?.description?.toLowerCase().includes("pressure") ||
      backend.levels?.toLowerCase().includes("pressure");

    if (!rawValues.length && isLikelyPressureDataset) {
      return pressureLevels.map((level) => ({
        ...level,
        id: `${
          backend.id ?? currentDataset?.id ?? "dataset"
        }-default-${level.id}`,
      }));
    }

    if (!rawValues.length) {
      return null;
    }

    const shouldSortDescending =
      isPressureUnit(normalizedUnit) ||
      normalizedUnit === "m" ||
      normalizedUnit === "km";
    const sortedValues = [...rawValues].sort((a, b) =>
      shouldSortDescending ? b - a : a - b,
    );

    return sortedValues.map((value, index) => ({
      id: `${
        backend.id ?? currentDataset?.id ?? "dataset"
      }-level-${index}-${value}`,
      value,
      unit: normalizedUnit,
      label: formatPressureLevelLabel(value, normalizedUnit),
    }));
  }, [currentDataset]);

  const hasPressureLevels = Boolean(datasetPressureLevels?.length);

  // Pressure Level State
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

  // Globe Settings State
  const [globeSettings, setGlobeSettings] = useState<GlobeSettings>({
    satelliteLayerVisible: true,
    boundaryLinesVisible: true,
    geographicLinesVisible: false,
    rasterOpacity: 0.9,
    hideZeroPrecipitation: false,
    rasterBlurEnabled: true,
    colorbarCustomMin: null,
    colorbarCustomMax: null,
    viewMode: "3d",
  });

  const colorbarRange = useMemo(
    () => ({
      enabled:
        globeSettings.colorbarCustomMin !== null ||
        globeSettings.colorbarCustomMax !== null,
      min: globeSettings.colorbarCustomMin ?? null,
      max: globeSettings.colorbarCustomMax ?? null,
    }),
    [globeSettings.colorbarCustomMin, globeSettings.colorbarCustomMax],
  );

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

  const stepOptions = useMemo(
    () => getStepOptionsForDataset(currentDataset),
    [currentDataset],
  );

  useEffect(() => {
    const nextStep =
      stepOptions.includes(visualizationStep) && visualizationStep
        ? visualizationStep
        : stepOptions[0];
    if (nextStep && nextStep !== visualizationStep) {
      setVisualizationStep(nextStep);
    }

    const defaultStart =
      visualizationStart ??
      selectedDate ??
      clampDateToRange(new Date(), datasetStartDate, datasetEndDate);
    const clampedStart = clampDateToRange(
      defaultStart,
      datasetStartDate,
      datasetEndDate,
    );
    const desiredEnd =
      visualizationEnd ??
      selectedDate ??
      clampDateToRange(new Date(), datasetStartDate, datasetEndDate);
    const normalizedEnd = desiredEnd < clampedStart ? clampedStart : desiredEnd;
    const clampedEnd = clampDateToRange(
      normalizedEnd,
      datasetStartDate,
      datasetEndDate,
    );

    if (
      !visualizationStart ||
      visualizationStart.getTime() !== clampedStart.getTime()
    ) {
      setVisualizationStart(clampedStart);
    }
    if (
      !visualizationEnd ||
      visualizationEnd.getTime() !== clampedEnd.getTime()
    ) {
      setVisualizationEnd(clampedEnd);
    }
  }, [
    datasetEndDate,
    datasetStartDate,
    selectedDate,
    stepOptions,
    visualizationEnd,
    visualizationStart,
    visualizationStep,
  ]);

  useEffect(() => {
    if (!showVisualizationModal) {
      return;
    }
    const fallbackStart = clampDateToRange(
      visualizationStart ??
        selectedDate ??
        clampDateToRange(new Date(), datasetStartDate, datasetEndDate),
      datasetStartDate,
      datasetEndDate,
    );
    const fallbackEnd = clampDateToRange(
      visualizationEnd ??
        selectedDate ??
        clampDateToRange(new Date(), datasetStartDate, datasetEndDate),
      datasetStartDate,
      datasetEndDate,
    );
    setStartInputValue(fallbackStart.toISOString().slice(0, 10));
    setVisualizationStart(fallbackStart);
    setEndInputValue(fallbackEnd.toISOString().slice(0, 10));
    setVisualizationEnd(fallbackEnd);
  }, [
    datasetEndDate,
    datasetStartDate,
    selectedDate,
    showVisualizationModal,
    visualizationEnd,
    visualizationStart,
  ]);

  useEffect(() => {
    // If the user changes visualization inputs while a previous run is active,
    // we intentionally keep the existing progress so they can browse other datasets.
  }, []);

  const playbackIntervalMs = useMemo(() => {
    if (visualizationStep === "year") return 1200;
    if (visualizationStep === "month") return 800;
    return 500;
  }, [visualizationStep]);

  const startPlayback = useCallback(() => {
    if (
      !visualizationDates.length ||
      prefetchedRasters.size === 0 ||
      !visualizationTarget
    ) {
      return;
    }
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
    setSelectedDate,
    visualizationDates,
  ]);

  const handleStopVisualization = useCallback(() => {
    if (visualizationAbortRef.current) {
      visualizationAbortRef.current.abort();
      visualizationAbortRef.current = null;
    }
    setVisualizationStatus("idle");
    setVisualizationProgress(0);
    setPrefetchedRasters(new Map());
    setVisualizationDates([]);
    setActiveVisualizationIndex(0);
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

    if (visualizationAbortRef.current) {
      visualizationAbortRef.current.abort();
    }

    const controller = new AbortController();
    visualizationAbortRef.current = controller;

    setVisualizationError(null);
    setVisualizationStatus("preparing");
    setVisualizationProgress(0);
    setVisualizationDates(frames);
    setActiveVisualizationIndex(0);
    setPrefetchedRasters(new Map());

    const cssColors = currentDataset?.colorScale?.colors
      ?.map((color) => (typeof color === "string" ? color.trim() : ""))
      .filter(Boolean);
    const colorRangeForRequests = resolveEffectiveColorbarRange(
      currentDataset,
      colorbarRange,
    );
    const keyDatasetId =
      currentDataset.backend?.id ??
      currentDataset.backendId ??
      currentDataset.backend?.slug ??
      currentDataset.backendSlug ??
      currentDataset.id;

    try {
      const nextMap = new Map<string, RasterLayerData>();
      for (let i = 0; i < frames.length; i += 1) {
        if (controller.signal.aborted) {
          return;
        }
        const frameDate = frames[i];
        const raster = await fetchRasterVisualization({
          dataset: currentDataset,
          backendDatasetId: keyDatasetId,
          date: frameDate,
          level: selectedLevelValue ?? undefined,
          cssColors,
          maskZeroValues: globeSettings.hideZeroPrecipitation,
          colorbarRange: colorRangeForRequests,
          signal: controller.signal,
        });

        const key = buildRasterRequestKey({
          dataset: currentDataset,
          backendDatasetId: keyDatasetId,
          date: frameDate,
          level: selectedLevelValue ?? undefined,
          cssColors,
          maskZeroValues: globeSettings.hideZeroPrecipitation,
          colorbarRange: colorRangeForRequests,
        });

        if (key) {
          nextMap.set(key, raster);
        }
        setVisualizationProgress((i + 1) / frames.length);
      }
      setPrefetchedRasters(nextMap);
      setVisualizationStatus("ready");
      setVisualizationProgress(1);
      setShowVisualizationModal(false);
    } catch (error) {
      if (
        !(
          error instanceof DOMException &&
          (error as DOMException).name === "AbortError"
        )
      ) {
        setVisualizationError(
          error instanceof Error
            ? error.message
            : "Failed to prepare visualization.",
        );
      }
      setVisualizationStatus("idle");
    } finally {
      visualizationAbortRef.current = null;
    }
  }, [
    colorbarRange,
    currentDataset,
    datasetEndDate,
    datasetStartDate,
    globeSettings.hideZeroPrecipitation,
    selectedLevelValue,
    visualizationEnd,
    visualizationStart,
    visualizationStep,
  ]);

  useEffect(() => {
    if (visualizationStatus !== "playing") {
      return;
    }

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
    if (!datasetId) {
      return;
    }

    const isCmorphDataset = [
      currentDataset?.name,
      currentDataset?.description,
      currentDataset?.backend?.datasetName,
      currentDataset?.backend?.slug,
      currentDataset?.backendId,
      currentDataset?.backendSlug,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes("cmorph"));

    const isNewDataset = lastDatasetIdRef.current !== datasetId;
    if (isNewDataset) {
      lastDatasetIdRef.current = datasetId;
      setGlobeSettings((prev) => {
        if (isCmorphDataset) {
          return prev.hideZeroPrecipitation
            ? prev
            : { ...prev, hideZeroPrecipitation: true };
        }

        // Non-CMORPH datasets should default to showing all values.
        return prev.hideZeroPrecipitation
          ? { ...prev, hideZeroPrecipitation: false }
          : prev;
      });
    }
  }, [currentDataset]);

  // Event Handlers
  const handleDateChange = useCallback(
    (date: Date) => {
      setSelectedDate(date);
      if (visualizationStatus === "playing") {
        setVisualizationStatus("ready");
      }
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
          prefetchedRasters.size > 0
        ) {
          setVisualizationStatus("ready");
          startPlayback();
        }
      } else if (visualizationStatus === "playing") {
        setVisualizationStatus("ready");
      }
    },
    [prefetchedRasters, startPlayback, visualizationStatus],
  );

  const handlePressureLevelChange = useCallback(
    (level: PressureLevel) => {
      setSelectedPressureLevel(level);
      setRasterMeta(null);
    },
    [setRasterMeta],
  );

  const handleRegionClick = useCallback(
    (latitude: number, longitude: number, data?: RegionData) => {
      setRegionInfoData({
        latitude,
        longitude,
        regionData: data || {
          name: "GPCP V2.3 Precipitation",
          precipitation: Math.random() * 2,
          temperature: 15 + Math.random() * 20,
          dataset: "Global Precipitation Climatation Project",
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
    [setRegionInfoData, setShowRegionInfo, setCurrentLocationMarker],
  );

  const handleRegionInfoClose = useCallback(() => {
    setShowRegionInfo(false);
    globeRef.current?.clearMarker();
  }, [setShowRegionInfo]);

  // Globe Settings Handlers
  const handleSatelliteToggle = useCallback((visible: boolean) => {
    setGlobeSettings((prev) => ({ ...prev, satelliteLayerVisible: visible }));
  }, []);

  const handleBoundaryToggle = useCallback((visible: boolean) => {
    setGlobeSettings((prev) => ({ ...prev, boundaryLinesVisible: visible }));
  }, []);

  const handleGeographicLinesToggle = useCallback((visible: boolean) => {
    setGlobeSettings((prev) => ({ ...prev, geographicLinesVisible: visible }));
  }, []);

  const handleRasterBlurToggle = useCallback((enabled: boolean) => {
    setGlobeSettings((prev) => ({ ...prev, rasterBlurEnabled: enabled }));
  }, []);

  const handleRasterOpacityChange = useCallback((opacity: number) => {
    setGlobeSettings((prev) => ({ ...prev, rasterOpacity: opacity }));
  }, []);

  const handleHideZeroPrecipToggle = useCallback((enabled: boolean) => {
    setGlobeSettings((prev) => ({
      ...prev,
      hideZeroPrecipitation: enabled,
    }));
  }, []);

  const handleColorbarRangeChange = useCallback(
    (payload: { min: number | null; max: number | null }) => {
      setGlobeSettings((prev) => ({
        ...prev,
        colorbarCustomMin: payload.min,
        colorbarCustomMax: payload.max,
      }));
    },
    [],
  );

  const handleColorbarRangeReset = useCallback(() => {
    setGlobeSettings((prev) => ({
      ...prev,
      colorbarCustomMin: null,
      colorbarCustomMax: null,
    }));
  }, []);

  const handleViewModeChange = useCallback(
    (mode: GlobeSettings["viewMode"]) => {
      setGlobeSettings((prev) => ({
        ...prev,
        viewMode: mode ?? "3d",
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
        if (match) {
          return match;
        }
      }
      return datasetPressureLevels[0];
    });
  }, [
    hasPressureLevels,
    datasetPressureLevels,
    currentDataset?.id,
    currentDataset?.backend?.id,
  ]);

  useEffect(() => {
    if (!hasPressureLevels) {
      return;
    }
    setRasterMeta(null);
  }, [selectedPressureLevel, hasPressureLevels]);

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
        if (match) {
          return match;
        }
      }
      return datasetPressureLevels[0];
    });
  }, [
    hasPressureLevels,
    datasetPressureLevels,
    currentDataset?.id,
    currentDataset?.backend?.id,
  ]);

  useEffect(() => {
    if (!hasPressureLevels) {
      return;
    }
    setRasterMeta(null);
  }, [selectedPressureLevel, hasPressureLevels]);

  const useMeshRaster = true;

  // Memoized Globe
  const memoizedGlobe = useMemo(
    () => (
      <Globe
        ref={globeRef}
        currentDataset={currentDataset}
        selectedDate={selectedDate}
        selectedLevel={selectedLevelValue}
        colorbarRange={colorbarRange}
        hideZeroPrecipitation={globeSettings.hideZeroPrecipitation}
        onRegionClick={handleRegionClick}
        satelliteLayerVisible={globeSettings.satelliteLayerVisible}
        boundaryLinesVisible={globeSettings.boundaryLinesVisible}
        geographicLinesVisible={globeSettings.geographicLinesVisible}
        rasterOpacity={globeSettings.rasterOpacity}
        rasterBlurEnabled={globeSettings.rasterBlurEnabled}
        useMeshRaster={useMeshRaster}
        viewMode={globeSettings.viewMode ?? "3d"}
        onRasterMetadataChange={setRasterMeta}
        isPlaying={visualizationStatus === "playing"}
        prefetchedRasters={prefetchedRasters}
      />
    ),
    [
      currentDataset,
      handleRegionClick,
      selectedDate,
      selectedLevelValue,
      visualizationStatus,
      globeSettings.satelliteLayerVisible,
      globeSettings.boundaryLinesVisible,
      globeSettings.geographicLinesVisible,
      globeSettings.rasterOpacity,
      globeSettings.rasterBlurEnabled,
      globeSettings.hideZeroPrecipitation,
      useMeshRaster,
      colorbarRange,
      globeSettings.viewMode,
      prefetchedRasters,
    ],
  );

  useEffect(() => {
    if (!locationFocusRequest || !globeRef.current) {
      return;
    }

    if (locationFocusRequest.mode === "clear") {
      globeRef.current.clearSearchMarker();
      setCurrentLocationMarker(null);
      clearLocationFocusRequest();
      return;
    }

    const { latitude, longitude, name } = locationFocusRequest;
    if (typeof latitude === "number" && typeof longitude === "number") {
      globeRef.current.focusOnLocation(locationFocusRequest);
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

  // Ensure the stored visualization level is applied when returning to its dataset
  useEffect(() => {
    if (
      !visualizationTarget ||
      !currentDataset ||
      currentDataset.id !== visualizationTarget.datasetId
    ) {
      return;
    }
    if (
      visualizationTarget.level != null &&
      hasPressureLevels &&
      datasetPressureLevels
    ) {
      const match = datasetPressureLevels.find(
        (lvl) => lvl.value === visualizationTarget.level,
      );
      if (match) {
        setSelectedPressureLevel(match);
      }
    }
  }, [
    currentDataset,
    datasetPressureLevels,
    hasPressureLevels,
    visualizationTarget,
    setSelectedPressureLevel,
  ]);

  const isPlaybackReady =
    prefetchedRasters.size > 0 &&
    visualizationDates.length > 0 &&
    visualizationStatus !== "preparing" &&
    Boolean(visualizationTarget);
  const progressPercent = Math.round(
    Math.min(Math.max(visualizationProgress, 0), 1) * 100,
  );

  return (
    <section className="bg-background fixed inset-0 h-screen w-screen overflow-hidden">
      {memoizedGlobe}

      <div className="pointer-events-none absolute inset-0 z-10">
        {/* Side Menu */}
        <div className="pointer-events-auto">
          <SideButtons
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
            onShowTutorial={() => setTutorialOpen(true)}
            onShowSidebarPanel={setActiveSidebarPanel}
            globeSettings={globeSettings}
            onSatelliteToggle={handleSatelliteToggle}
            onBoundaryToggle={handleBoundaryToggle}
            onGeographicLinesToggle={handleGeographicLinesToggle}
            onRasterOpacityChange={handleRasterOpacityChange}
            onHideZeroPrecipToggle={handleHideZeroPrecipToggle}
            onRasterBlurToggle={handleRasterBlurToggle}
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

        {/* Visualization Progress */}
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
                    if (isPlaybackReady) {
                      startPlayback();
                    }
                  }}
                >
                  {visualizationStatus === "preparing" ? (
                    <Square className="h-4 w-4" />
                  ) : visualizationStatus === "playing" ? (
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

        {/* Tutorial Modal */}
        <div className="pointer-events-auto">
          <Tutorial
            isOpen={tutorialOpen}
            onClose={() => setTutorialOpen(false)}
          />
        </div>

        {/* Color Bar */}
        <div className="pointer-events-auto">
          <ColorBar
            show={showColorbar}
            onToggle={toggleColorbar}
            dataset={currentDataset}
            unit={temperatureUnit}
            onUnitChange={setTemperatureUnit}
            onPositionChange={setColorBarPosition}
            collapsed={colorBarCollapsed}
            onToggleCollapse={setColorBarCollapsed}
            rasterMeta={rasterMeta}
            orientation={colorBarOrientation}
            customRange={{
              enabled:
                globeSettings.colorbarCustomMin !== null ||
                globeSettings.colorbarCustomMax !== null,
              min: globeSettings.colorbarCustomMin ?? null,
              max: globeSettings.colorbarCustomMax ?? null,
            }}
          />
        </div>

        {/* Bottom Controls */}
        <div className="pointer-events-auto absolute right-0 bottom-0 left-0 z-20 pb-6">
          <div className="relative flex items-end justify-center px-4 py-2">
            {/* TimeBar - Centered */}
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

            {/* Pressure Levels Selector - Right of TimeBar */}
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
          if (!open) {
            setVisualizationError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[720px]">
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
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
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
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
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-sm font-semibold text-white">Advance by</p>
            <select
              className="w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white shadow-sm focus:border-white focus:outline-none"
              value={visualizationStep}
              onChange={(e) => {
                const next = e.target.value as VisualizationStep;
                if (stepOptions.includes(next)) {
                  setVisualizationStep(next);
                }
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

      {/* Region Info Panel */}
      <RegionInfoPanel
        show={showRegionInfo}
        onClose={handleRegionInfoClose}
        latitude={regionInfoData.latitude}
        longitude={regionInfoData.longitude}
        regionData={regionInfoData.regionData}
        colorBarPosition={colorBarPosition}
        colorBarCollapsed={colorBarCollapsed}
        colorBarOrientation={colorBarOrientation}
        currentDataset={currentDataset}
        selectedDate={selectedDate}
        temperatureUnit={temperatureUnit}
      />
    </section>
  );
}
