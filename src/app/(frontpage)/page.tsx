'use client';

import React, { useState, useRef } from 'react';
import Globe, { GlobeRef } from '@/components/Globe/Globe';
import ColorBar from '@/components/UI/ColorBar';
import TimeBar from '@/components/UI/TimeBar';
import YearSelector from '@/components/UI/Popups/YearSelector';
import PressureLevelsSelector from '@/components/UI/Popups/PressureLevelsSelector';
import RegionInfoPanel from '@/components/UI/RegionInfoPanel';

import { useAppState } from '@/context/HeaderContext';
import { TemperatureUnit, RegionData, PressureLevel } from '@/types';
import { SideButtons } from './_components/SideButtons';
import { Tutorial } from './_components/Tutorial';

type SidebarPanel = 'datasets' | 'history' | 'about' | null;

export default function HomePage() {
  const {
    showChat,
    showColorbar,
    currentDataset,
    setShowChat,
    toggleColorbar,
    setCurrentDataset,
  } = useAppState();

  const globeRef = useRef<GlobeRef>(null);
  const [temperatureUnit, setTemperatureUnit] =
    useState<TemperatureUnit>('celsius');
  const [activeSidebarPanel, setActiveSidebarPanel] =
    useState<SidebarPanel>(null);
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear()
  );
  const [isTimebarPlaying, setIsTimebarPlaying] = useState<boolean>(false);
  const [selectedPressureLevel, setSelectedPressureLevel] =
    useState<PressureLevel>({
      id: 'surface',
      value: 1000,
      label: 'Surface',
      unit: 'hPa',
    });

  const [showRegionInfo, setShowRegionInfo] = useState<boolean>(false);
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
      dataset: 'Global Precipitation Climatology Project',
    },
  });

  const [colorBarPosition, setColorBarPosition] = useState({ x: 24, y: 300 });
  const [colorBarCollapsed, setColorBarCollapsed] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const handleShowSidebarPanel = (panel: SidebarPanel) => {
    setActiveSidebarPanel(panel);
  };

  const handleSidebarPanelChange = (panel: SidebarPanel) => {
    setActiveSidebarPanel(panel);
  };

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    console.log('Year changed to:', year);
  };

  const handleTimebarPlayPause = (isPlaying: boolean) => {
    setIsTimebarPlaying(isPlaying);
    console.log('Timebar playing:', isPlaying);
  };

  const handlePressureLevelChange = (level: PressureLevel) => {
    setSelectedPressureLevel(level);
    console.log('Pressure level changed to:', level);
  };

  const handleRegionClick = (
    latitude: number,
    longitude: number,
    data?: RegionData
  ) => {
    console.log('Region clicked:', { latitude, longitude, data });
    setRegionInfoData({
      latitude,
      longitude,
      regionData: data || {
        name: 'GPCP V2.3 Precipitation',
        precipitation: Math.random() * 2,
        temperature: 15 + Math.random() * 20,
        dataset: 'Global Precipitation Climatology Project',
      },
    });
    setShowRegionInfo(true);
  };

  const handleRegionInfoClose = () => {
    setShowRegionInfo(false);
    globeRef.current?.clearMarker();
  };

  const handleColorBarPositionChange = (position: { x: number; y: number }) => {
    setColorBarPosition(position);
  };

  return (
    <section className="fixed inset-0 h-screen w-screen overflow-hidden">
      <Globe
        ref={globeRef}
        currentDataset={currentDataset}
        onRegionClick={handleRegionClick}
      />

      <div className="pointer-events-none absolute inset-0 z-10">
        <SideButtons />
        <Tutorial
          isOpen={tutorialOpen}
          onClose={() => setTutorialOpen(false)}
        />

        <ColorBar
          show={showColorbar}
          onToggle={toggleColorbar}
          dataset={currentDataset}
          unit={temperatureUnit}
          onUnitChange={setTemperatureUnit}
          onPositionChange={handleColorBarPositionChange}
          collapsed={colorBarCollapsed}
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

        <div className="pointer-events-auto absolute bottom-0 left-0 right-12 z-20 pb-4">
          <div className="relative flex items-end justify-center px-4">
            {/* TimeBar - Centered with flexible width */}
            <div className="pointer-events-auto w-full max-w-4xl">
              <TimeBar
                selectedYear={selectedYear}
                onYearChange={handleYearChange}
                onPlayPause={handleTimebarPlayPause}
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
