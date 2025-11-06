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
import { SideButtons } from "./_components/SideButtons";
import { Tutorial } from "./_components/Tutorial";

type SidebarPanel = "datasets" | "history" | "about" | null;

export default function HomePage() {
  const { showColorbar, currentDataset, toggleColorbar, colorBarOrientation } =
    useAppState();
  const globeRef = useRef<GlobeRef>(null);

  // Date & Time State
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isTimebarPlaying, setIsTimebarPlaying] = useState(false);

  // UI State
  const [temperatureUnit, setTemperatureUnit] =
    useState<TemperatureUnit>("celsius");
  const [activeSidebarPanel, setActiveSidebarPanel] =
    useState<SidebarPanel>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [colorBarCollapsed, setColorBarCollapsed] = useState(false);
  const [colorBarPosition, setColorBarPosition] = useState({ x: 24, y: 300 });

  // Region Info State
  const [showRegionInfo, setShowRegionInfo] = useState(false);
  const [regionInfoData, setRegionInfoData] = useState<{
    latitude: number;
    longitude: number;
    regionData: RegionData;
  }>({
    latitude: 21.25,
    longitude: -71.25,
    regionData: {
      name: "GPCP V2.3 Precipitation",
      precipitation: 0.9,
      temperature: 24.5,
      dataset: "Global Precipitation Climatation Project",
    },
  });

  // Pressure Level State
  const [selectedPressureLevel, setSelectedPressureLevel] =
    useState<PressureLevel>({
      id: "surface",
      value: 1000,
      label: "Surface",
      unit: "hPa",
    });
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
  });

  // Event Handlers
  const handleDateChange = useCallback((date: Date) => {
    setSelectedDate(date);
  }, []);

  const handlePlayPause = useCallback((isPlaying: boolean) => {
    setIsTimebarPlaying(isPlaying);
  }, []);

  const handlePressureLevelChange = useCallback((level: PressureLevel) => {
    setSelectedPressureLevel(level);
  }, []);

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
    },
    [],
  );

  const handleRegionInfoClose = useCallback(() => {
    setShowRegionInfo(false);
    globeRef.current?.clearMarker();
  }, []);

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

  useEffect(() => {
    setRasterMeta(null);
  }, [currentDataset]);

  // Memoized Globe
  const selectedLevelValue = selectedPressureLevel?.value ?? null;

  const memoizedGlobe = useMemo(
    () => (
      <Globe
        ref={globeRef}
        currentDataset={currentDataset}
        selectedDate={selectedDate}
        selectedLevel={selectedLevelValue}
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
    ],
  );

  return (
    <section className="bg-background fixed inset-0 h-screen w-screen overflow-hidden">
      {memoizedGlobe}

      <div className="pointer-events-none absolute inset-0 z-10">
        {/* Side Menu */}
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
        />

        {/* Tutorial Modal */}
        <Tutorial
          isOpen={tutorialOpen}
          onClose={() => setTutorialOpen(false)}
        />

        {/* Color Bar */}
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

        {/* Region Info Panel */}
        <RegionInfoPanel
          show={showRegionInfo}
          onClose={handleRegionInfoClose}
          latitude={regionInfoData.latitude}
          longitude={regionInfoData.longitude}
          regionData={regionInfoData.regionData}
          colorBarPosition={colorBarPosition}
          colorBarCollapsed={colorBarCollapsed}
          currentDataset={currentDataset}
          selectedDate={selectedDate}
        />

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
            <div
              id="pressure"
              className="pointer-events-auto absolute bottom-0 flex items-center gap-4"
              style={{ left: "calc(50% + 300px)", transform: "translateX(0)" }}
            >
              <PressureLevelsSelector
                selectedLevel={selectedPressureLevel}
                onLevelChange={handlePressureLevelChange}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
