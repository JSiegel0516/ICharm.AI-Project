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
import { useAppState } from "@/context/HeaderContext";
import {
  TemperatureUnit,
  RegionData,
  PressureLevel,
  GlobeSettings,
} from "@/types";
import { pressureLevels } from "@/utils/constants";
import { isSeaSurfaceTemperatureDataset } from "@/utils/datasetGuards";
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

export default function HomePage() {
  const {
    showColorbar,
    currentDataset,
    toggleColorbar,
    colorBarOrientation,
    locationFocusRequest,
    clearLocationFocusRequest,
    showRegionInfo,
    setShowRegionInfo,
    regionInfoData,
    setRegionInfoData,
    selectedDate,
    setSelectedDate,
    setCurrentLocationMarker,
  } = useAppState();
  const globeRef = useRef<GlobeRef>(null);

  // Date & Time State
  const [isTimebarPlaying, setIsTimebarPlaying] = useState(false);

  // UI State
  const [temperatureUnit, setTemperatureUnit] =
    useState<TemperatureUnit>("celsius");
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

  // Globe Settings State
  const [globeSettings, setGlobeSettings] = useState<GlobeSettings>({
    satelliteLayerVisible: true,
    boundaryLinesVisible: true,
    geographicLinesVisible: false,
    rasterOpacity: 0.65,
    hideZeroPrecipitation: false,
  });

  // Event Handlers
  const handleDateChange = useCallback(
    (date: Date) => {
      setSelectedDate(date);
    },
    [setSelectedDate],
  );

  const handlePlayPause = useCallback((isPlaying: boolean) => {
    setIsTimebarPlaying(isPlaying);
  }, []);

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

  const handleRasterOpacityChange = useCallback((opacity: number) => {
    setGlobeSettings((prev) => ({ ...prev, rasterOpacity: opacity }));
  }, []);

  const handleHideZeroPrecipToggle = useCallback((enabled: boolean) => {
    setGlobeSettings((prev) => ({
      ...prev,
      hideZeroPrecipitation: enabled,
    }));
  }, []);

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

  // Memoized Globe
  const selectedLevelValue =
    hasPressureLevels && selectedPressureLevel
      ? selectedPressureLevel.value
      : null;

  const pressureLevelHelperText = selectedPressureLevel
    ? `Current: ${formatPressureLevelLabel(
        selectedPressureLevel.value,
        selectedPressureLevel.unit,
      )}`
    : undefined;

  const memoizedGlobe = useMemo(
    () => (
      <Globe
        ref={globeRef}
        currentDataset={currentDataset}
        selectedDate={selectedDate}
        selectedLevel={selectedLevelValue}
        hideZeroPrecipitation={globeSettings.hideZeroPrecipitation}
        onRegionClick={handleRegionClick}
        satelliteLayerVisible={globeSettings.satelliteLayerVisible}
        boundaryLinesVisible={globeSettings.boundaryLinesVisible}
        geographicLinesVisible={globeSettings.geographicLinesVisible}
        rasterOpacity={globeSettings.rasterOpacity}
        onRasterMetadataChange={setRasterMeta}
      />
    ),
    [
      currentDataset,
      handleRegionClick,
      selectedDate,
      selectedLevelValue,
      globeSettings.satelliteLayerVisible,
      globeSettings.boundaryLinesVisible,
      globeSettings.geographicLinesVisible,
      globeSettings.rasterOpacity,
      globeSettings.hideZeroPrecipitation,
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
      });
    }
    clearLocationFocusRequest();
  }, [
    locationFocusRequest,
    clearLocationFocusRequest,
    setCurrentLocationMarker,
  ]);

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
          />
        </div>

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
          />
        </div>

        {/* Bottom Controls */}
        <div className="pointer-events-auto absolute right-12 bottom-0 left-0 z-20 pb-4">
          <div className="relative flex items-end justify-center px-4">
            {/* TimeBar - Centered */}
            <div className="pointer-events-auto w-full max-w-4xl">
              <TimeBar
                selectedDate={selectedDate}
                onDateChange={handleDateChange}
                onPlayPause={handlePlayPause}
                isPlaying={isTimebarPlaying}
              />
            </div>

            {/* Pressure Levels Selector */}
            {hasPressureLevels && datasetPressureLevels && (
              <div className="pointer-events-auto">
                <div
                  id="pressure"
                  className="pointer-events-auto absolute bottom-0 flex items-center gap-4"
                  style={{
                    left: "calc(50% + 300px)",
                    transform: "translateX(0)",
                  }}
                >
                  <PressureLevelsSelector
                    selectedLevel={selectedPressureLevel}
                    onLevelChange={handlePressureLevelChange}
                    levels={datasetPressureLevels}
                    helperText={pressureLevelHelperText}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

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
