'use client';

import React, { useState } from 'react';
import Globe from '@/components/Globe/Globe';
import CollapsibleSidebar from '@/components/UI/CollapsibleSidebar';
import ColorBar from '@/components/UI/ColorBar';
import TimeBar from '@/components/UI/TimeBar';
import YearSelector from '@/components/UI/Popups/YearSelector';
import PressureLevelsSelector from '@/components/UI/Popups/PressureLevelsSelector';
import RegionInfoPanel from '@/components/UI/RegionInfoPanel';
import ChatBot from '@/components/Chat/ChatBot';
import SettingsModal from '@/components/Modals/SettingsModal';
import AboutModal from '@/components/Modals/AboutModal';
import TutorialModal from '@/components/Modals/TutorialModal';
import { useAppState } from '@/app/context/HeaderContext';
import { TemperatureUnit, RegionData, PressureLevel } from '@/types';

type SidebarPanel = 'datasets' | 'history' | 'about' | null;

export default function HomePage() {
  const {
    showSettings,
    showAbout,
    showTutorial,
    showChat,
    showColorbar,
    currentDataset,
    setShowSettings,
    setShowAbout,
    setShowTutorial,
    setShowChat,
    toggleColorbar,
    setCurrentDataset,
  } = useAppState();

  // Add temperature unit state
  const [temperatureUnit, setTemperatureUnit] =
    useState<TemperatureUnit>('celsius');

  // Add sidebar panel state
  const [activeSidebarPanel, setActiveSidebarPanel] =
    useState<SidebarPanel>(null);

  // Unified year state - both TimeBar and YearSelector use this
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear()
  );
  const [isTimebarPlaying, setIsTimebarPlaying] = useState<boolean>(false);

  // Add PressureLevel state
  const [selectedPressureLevel, setSelectedPressureLevel] = useState<PressureLevel>({
    id: 'surface',
    value: 1000,
    label: 'Surface',
    unit: 'hPa'
  });

  // Add RegionInfoPanel state
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

  // Add ColorBar position tracking
  const [colorBarPosition, setColorBarPosition] = useState({ x: 24, y: 300 });
  const [colorBarCollapsed, setColorBarCollapsed] = useState(false);

  const handleShowSidebarPanel = (panel: SidebarPanel) => {
    setActiveSidebarPanel(panel);
  };

  const handleSidebarPanelChange = (panel: SidebarPanel) => {
    setActiveSidebarPanel(panel);
  };

  // Unified year change handler - used by both TimeBar and YearSelector
  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    // TODO: Update globe data based on selected year
    console.log('Year changed to:', year);
  };

  const handleTimebarPlayPause = (isPlaying: boolean) => {
    setIsTimebarPlaying(isPlaying);
    console.log('Timebar playing:', isPlaying);
  };

  // PressureLevel handler
  const handlePressureLevelChange = (level: PressureLevel) => {
    setSelectedPressureLevel(level);
    // TODO: Update globe data based on selected pressure level
    console.log('Pressure level changed to:', level);
  };

  // Globe region click handler
  const handleRegionClick = (
    latitude: number,
    longitude: number,
    data?: RegionData
  ) => {
    console.log('Region clicked:', { latitude, longitude, data });

    // Update region data with clicked coordinates
    setRegionInfoData({
      latitude,
      longitude,
      regionData: data || {
        name: 'GPCP V2.3 Precipitation',
        precipitation: Math.random() * 2, // Random data for now
        temperature: 15 + Math.random() * 20,
        dataset: 'Global Precipitation Climatology Project',
      },
    });

    // Show the region info panel
    setShowRegionInfo(true);
  };

  // ColorBar position change handler
  const handleColorBarPositionChange = (position: { x: number; y: number }) => {
    setColorBarPosition(position);
  };

  return (
    <section className="fixed inset-0 h-screen w-screen overflow-hidden">
      {/* Full-screen Globe Background - Lowest Layer */}
      <Globe
        currentDataset={currentDataset}
        onRegionClick={handleRegionClick}
      />

      {/* UI Layer - All interface elements positioned absolutely over the globe */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {/* Enhanced Collapsible Sidebar */}
        <div className="pointer-events-auto absolute left-0 top-0 z-20 h-full">
          <CollapsibleSidebar
            onShowSettings={() => setShowSettings(true)}
            activePanel={activeSidebarPanel}
            onPanelChange={handleSidebarPanelChange}
          />
        </div>

        {/* ColorBar */}
        <div className="pointer-events-auto absolute z-10">
          <ColorBar
            show={showColorbar}
            onToggle={toggleColorbar}
            dataset={currentDataset}
            unit={temperatureUnit}
            onUnitChange={setTemperatureUnit}
            onPositionChange={handleColorBarPositionChange}
            collapsed={colorBarCollapsed}
          />
        </div>

        {/* RegionInfoPanel */}
        <div className="pointer-events-auto absolute z-30">
          <RegionInfoPanel
            show={showRegionInfo}
            onClose={() => setShowRegionInfo(false)}
            latitude={regionInfoData.latitude}
            longitude={regionInfoData.longitude}
            regionData={regionInfoData.regionData}
            colorBarPosition={colorBarPosition}
            colorBarCollapsed={colorBarCollapsed}
          />
        </div>

        {/* Bottom Control Bar */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 pb-4">
          {/* TimeBar - Centered - Made pointer-events-auto */}
          <div className="pointer-events-auto flex items-center justify-center gap-3" style={{ paddingRight: '25px' }}>
            <TimeBar
              selectedYear={selectedYear}
              onYearChange={handleYearChange}
              onPlayPause={handleTimebarPlayPause}
            />
          </div>
          
          {/* Year and Pressure Buttons - Positioned independently */}
          <div className="pointer-events-auto absolute bottom-4 right-[175px] flex items-center gap-3">
            <YearSelector
              selectedYear={selectedYear}
              onYearChange={handleYearChange}
            />
            <PressureLevelsSelector
              selectedLevel={selectedPressureLevel}
              onLevelChange={handlePressureLevelChange}
            />
          </div>
        </div>

        {/* Chat Bot - positioned on the right */}
        <div className="pointer-events-auto absolute right-0 top-0 z-20 h-full">
          <ChatBot show={showChat} onClose={() => setShowChat(false)} />
        </div>
      </div>

      {/* Modals - Highest Layer */}
      {showSettings && (
        <div className="absolute inset-0 z-50">
          <SettingsModal onClose={() => setShowSettings(false)} />
        </div>
      )}

      {showAbout && (
        <div className="absolute inset-0 z-50">
          <AboutModal
            onClose={() => setShowAbout(false)}
            onShowTutorial={() => {
              setShowAbout(false);
              setShowTutorial(true);
            }}
          />
        </div>
      )}

      {showTutorial && (
        <div className="absolute inset-0 z-50">
          <TutorialModal onClose={() => setShowTutorial(false)} />
        </div>
      )}
    </section>
  );
}