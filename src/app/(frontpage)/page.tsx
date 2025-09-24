'use client';

import React, { useState } from 'react';
import Globe from '@/components/Globe/Globe';
import CollapsibleSidebar from '@/components/UI/CollapsibleSidebar';
import ColorBar from '@/components/UI/ColorBar';
import TimeBar from '@/components/UI/TimeBar';
import RegionInfoPanel from '@/components/UI/RegionInfoPanel';
import ChatBot from '@/components/Chat/ChatBot';
import SettingsModal from '@/components/Modals/SettingsModal';
import AboutModal from '@/components/Modals/AboutModal';
import TutorialModal from '@/components/Modals/TutorialModal';
import { useAppState } from '@/app/context/HeaderContext';
import { TemperatureUnit, RegionData } from '@/types';

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

  // Add TimeBar state
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear()
  );
  const [isTimebarPlaying, setIsTimebarPlaying] = useState<boolean>(false);

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

  // TimeBar handlers
  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    // TODO: Update globe data based on selected year
    console.log('Year changed to:', year);
  };

  const handleTimebarPlayPause = (isPlaying: boolean) => {
    setIsTimebarPlaying(isPlaying);
    console.log('Timebar playing:', isPlaying);
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
    <section className="flex h-full">
      {/* Section Content Area */}
      <div className="relative flex flex-1 flex-col">
        <div className="relative flex flex-1">
          {/* Enhanced Collapsible Sidebar */}
          <CollapsibleSidebar
            onShowSettings={() => setShowSettings(true)}
            activePanel={activeSidebarPanel}
            onPanelChange={handleSidebarPanelChange}
          />

          {/* Center Globe Area */}
          <div className="relative flex flex-1 flex-col overflow-hidden">
            {/* Globe */}
            <div className="relative flex-1">
              <Globe
                currentDataset={currentDataset}
                onRegionClick={handleRegionClick}
              />

              {/* ColorBar */}
              <ColorBar
                show={showColorbar}
                onToggle={toggleColorbar}
                dataset={currentDataset}
                unit={temperatureUnit}
                onUnitChange={setTemperatureUnit}
                onPositionChange={handleColorBarPositionChange}
                collapsed={colorBarCollapsed}
              />

              {/* RegionInfoPanel */}
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

            {/* TimeBar - positioned at the bottom of the globe area */}
            <div className="relative z-20 pb-4">
              <TimeBar
                selectedYear={selectedYear}
                onYearChange={handleYearChange}
                onPlayPause={handleTimebarPlayPause}
              />
            </div>
          </div>

          {/* Chat Bot */}
          <ChatBot show={showChat} onClose={() => setShowChat(false)} />
        </div>
      </div>

      {/* Modals */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {showAbout && (
        <AboutModal
          onClose={() => setShowAbout(false)}
          onShowTutorial={() => {
            setShowAbout(false);
            setShowTutorial(true);
          }}
        />
      )}

      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
    </section>
  );
}
