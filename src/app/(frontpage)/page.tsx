'use client';

import React, { useState, useRef, useMemo, useCallback } from 'react';
import Globe, { GlobeRef } from '@/components/Globe/Globe';
import ColorBar from '@/components/UI/ColorBar';
import TimeBar from '@/components/UI/TimeBar';
import PressureLevelsSelector from '@/components/UI/Popups/PressureLevelsSelector';
import RegionInfoPanel from '@/components/UI/RegionInfoPanel';

import { useAppState } from '@/context/HeaderContext';
import { TemperatureUnit, RegionData, PressureLevel } from '@/types';
import { SideButtons } from './_components/SideButtons';
import { Tutorial } from './_components/Tutorial';

type SidebarPanel = 'datasets' | 'history' | 'about' | null;

interface UIState {
  temperatureUnit: TemperatureUnit;
  activeSidebarPanel: SidebarPanel;
  isTimebarPlaying: boolean;
  showRegionInfo: boolean;
  tutorialOpen: boolean;
  colorBarCollapsed: boolean;
}

export default function HomePage() {
  const { showColorbar, currentDataset, toggleColorbar } = useAppState();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const globeRef = useRef<GlobeRef>(null);

  // Consolidated UI state - removed duplicate selectedYear
  const [uiState, setUiState] = useState<UIState>({
    temperatureUnit: 'celsius',
    activeSidebarPanel: null,
    isTimebarPlaying: false,
    showRegionInfo: false,
    tutorialOpen: false,
    colorBarCollapsed: false,
  });

  const [selectedPressureLevel, setSelectedPressureLevel] =
    useState<PressureLevel>({
      id: 'surface',
      value: 1000,
      label: 'Surface',
      unit: 'hPa',
    });

  const [regionInfoData, setRegionInfoData] = useState<{
    latitude: number;
    longitude: number;
    regionData: RegionData;
  }>({
    latitude: 21.25,
    longitude: -71.25,
    regionData: {
      name: 'GPCP V2.3 Precipitation',
      precipitation: 0.9,
      temperature: 24.5,
      dataset: 'Global Precipitation Climatation Project',
    },
  });

  const [colorBarPosition, setColorBarPosition] = useState({ x: 24, y: 300 });

  // Unified state updaters
  const updateUIState = useCallback((updates: Partial<UIState>) => {
    setUiState((prev) => ({ ...prev, ...updates }));
  }, []);

  // Event handlers
  const handleDateChange = useCallback((date: Date) => {
    setSelectedDate(date);
    console.log('Selected date:', date);
    // If you need the year separately, you can extract it here
    const year = date.getFullYear();
    console.log('Year:', year);
  }, []);

  const handlePlayPause = useCallback(
    (isPlaying: boolean) => {
      updateUIState({ isTimebarPlaying: isPlaying });
      console.log('Play/Pause:', isPlaying);
    },
    [updateUIState]
  );

  const handlePressureLevelChange = useCallback((level: PressureLevel) => {
    setSelectedPressureLevel(level);
    console.log('Pressure level changed to:', level);
  }, []);

  const handleRegionClick = useCallback(
    (latitude: number, longitude: number, data?: RegionData) => {
      try {
        console.log('Region clicked:', { latitude, longitude, data });
        setRegionInfoData({
          latitude,
          longitude,
          regionData: data || {
            name: 'GPCP V2.3 Precipitation',
            precipitation: Math.random() * 2,
            temperature: 15 + Math.random() * 20,
            dataset: 'Global Precipitation Climatation Project',
          },
        });
        updateUIState({ showRegionInfo: true });
      } catch (error) {
        console.error('Error handling region click:', error);
      }
    },
    [updateUIState]
  );

  const handleRegionInfoClose = useCallback(() => {
    updateUIState({ showRegionInfo: false });
    globeRef.current?.clearMarker();
  }, [updateUIState]);

  const handleColorBarPositionChange = useCallback(
    (position: { x: number; y: number }) => {
      setColorBarPosition(position);
    },
    []
  );

  const handleShowSidebarPanel = useCallback(
    (panel: SidebarPanel) => {
      updateUIState({ activeSidebarPanel: panel });
    },
    [updateUIState]
  );

  const handleTutorialClose = useCallback(() => {
    updateUIState({ tutorialOpen: false });
  }, [updateUIState]);

  const handleTutorialOpen = useCallback(() => {
    updateUIState({ tutorialOpen: true });
  }, [updateUIState]);

  // Memoized Globe component for performance
  const memoizedGlobe = useMemo(
    () => (
      <Globe
        ref={globeRef}
        currentDataset={currentDataset}
        onRegionClick={handleRegionClick}
      />
    ),
    [currentDataset, handleRegionClick, selectedDate]
  );

  // Destructure state for easier access
  const {
    temperatureUnit,
    isTimebarPlaying,
    showRegionInfo,
    tutorialOpen,
    colorBarCollapsed,
  } = uiState;

  return (
    <section className="bg-background fixed inset-0 h-screen w-screen overflow-hidden">
      {memoizedGlobe}

      <div className="pointer-events-none absolute inset-0 z-10">
        <SideButtons
          selectedDate={selectedDate}
          onDateChange={handleDateChange}
          onShowTutorial={handleTutorialOpen}
          onShowSidebarPanel={handleShowSidebarPanel}
        />

        <Tutorial isOpen={tutorialOpen} onClose={handleTutorialClose} />

        <ColorBar
          show={showColorbar}
          onToggle={toggleColorbar}
          dataset={currentDataset}
          unit={temperatureUnit}
          onUnitChange={(unit) => updateUIState({ temperatureUnit: unit })}
          onPositionChange={handleColorBarPositionChange}
          collapsed={colorBarCollapsed}
          onToggleCollapse={(collapsed) =>
            updateUIState({ colorBarCollapsed: collapsed })
          }
        />

        <RegionInfoPanel
          show={showRegionInfo}
          onClose={handleRegionInfoClose}
          latitude={regionInfoData.latitude}
          longitude={regionInfoData.longitude}
          regionData={regionInfoData.regionData}
          colorBarPosition={colorBarPosition}
          colorBarCollapsed={colorBarCollapsed}
        />

        <div className="pointer-events-auto absolute right-12 bottom-0 left-0 z-20 pb-4">
          <div className="relative flex items-end justify-center px-4">
            {/* TimeBar - Centered with flexible width */}
            <div className="pointer-events-auto w-full max-w-4xl">
              <TimeBar
                selectedDate={selectedDate}
                onDateChange={handleDateChange}
                onPlayPause={handlePlayPause}
                isPlaying={isTimebarPlaying}
              />
            </div>

            <div
              id="pressure"
              className="pointer-events-auto absolute bottom-0 flex items-center gap-4"
              style={{ left: 'calc(50% + 300px)', transform: 'translateX(0)' }}
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
