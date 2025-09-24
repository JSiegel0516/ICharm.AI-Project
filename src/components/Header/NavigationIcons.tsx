'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Settings, Info, FileText } from 'lucide-react';
import DatasetDropdown from './Dropdowns/DatasetDropdown';
import SettingsDropdown from './Dropdowns/SettingsDropdown';
import { useAppState } from '@/app/context/HeaderContext';

type ActiveDropdown = 'datasets' | 'settings' | null;

const NavigationIcons: React.FC = () => {
  const {
    setShowSettings,
    setShowAbout,
    setShowChat,
    setCurrentDataset,
    currentDataset,
  } = useAppState();

  const [activeDropdown, setActiveDropdown] = useState<ActiveDropdown>(null);

  const datasetDropdownRef = useRef<HTMLDivElement>(null);
  const datasetButtonRef = useRef<HTMLButtonElement>(null);
  const settingsDropdownRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearHideTimeout = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const setHideTimeout = (delay: number = 300) => {
    clearHideTimeout();
    hideTimeoutRef.current = setTimeout(() => {
      setActiveDropdown(null);
    }, delay);
  };

  const handleAboutClick = () => {
    clearHideTimeout();
    setActiveDropdown(null);
    setShowAbout(true);
  };

  const handleDatasetSelect = (dataset: any) => {
    setCurrentDataset(dataset);
    setActiveDropdown(null);
  };

  const handleSettingSelect = (setting: any) => {
    console.log('Setting selected:', setting);
    setActiveDropdown(null);
  };

  const handleSettingsClick = () => {
    setShowSettings(true);
  };

  const handleDatasetMouseEnter = () => {
    clearHideTimeout();
    setActiveDropdown('datasets');
  };

  const handleDatasetMouseLeave = () => {
    setHideTimeout(300);
  };

  const handleDatasetDropdownMouseEnter = () => {
    clearHideTimeout();
    setActiveDropdown('datasets');
  };

  const handleDatasetDropdownMouseLeave = () => {
    setHideTimeout(200);
  };

  const handleSettingsMouseEnter = () => {
    clearHideTimeout();
    setActiveDropdown('settings');
  };

  const handleSettingsMouseLeave = () => {
    setHideTimeout(300);
  };

  const handleSettingsDropdownMouseEnter = () => {
    clearHideTimeout();
    setActiveDropdown('settings');
  };

  const handleSettingsDropdownMouseLeave = () => {
    setHideTimeout(200);
  };

  const handleAboutMouseEnter = () => {
    clearHideTimeout();
    setActiveDropdown(null);
  };

  useEffect(() => {
    return () => {
      clearHideTimeout();
    };
  }, []);

  const getIconButtonClasses = (isActive: boolean = false) => {
    return `px-4 py-2 transition-all duration-200 relative group ${
      isActive
        ? 'border-b-2 border-blue-400 text-blue-400'
        : 'hover:opacity-80 hover:border hover:border-white/30 hover:rounded-lg text-gray-400'
    }`;
  };

  return (
    <nav className="flex items-center gap-4">
      {/* Datasets with Dropdown */}
      <div className="relative" ref={datasetDropdownRef}>
        <button
          ref={datasetButtonRef}
          onMouseEnter={handleDatasetMouseEnter}
          onMouseLeave={handleDatasetMouseLeave}
          className={getIconButtonClasses(activeDropdown === 'datasets')}
        >
          <FileText size={20} />
          <div className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 transform whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
            Datasets
          </div>
        </button>

        <div
          onMouseEnter={handleDatasetDropdownMouseEnter}
          onMouseLeave={handleDatasetDropdownMouseLeave}
        >
          <DatasetDropdown
            isVisible={activeDropdown === 'datasets'}
            onSelectDataset={handleDatasetSelect}
          />
        </div>
      </div>

      {/* About */}
      <button
        onClick={handleAboutClick}
        onMouseEnter={handleAboutMouseEnter}
        className={getIconButtonClasses()}
      >
        <Info size={20} />
        <div className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 transform whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
          About 4DVD
        </div>
      </button>

      {/* Settings with Dropdown */}
      <div className="relative" ref={settingsDropdownRef}>
        <button
          ref={settingsButtonRef}
          onClick={handleSettingsClick}
          onMouseEnter={handleSettingsMouseEnter}
          onMouseLeave={handleSettingsMouseLeave}
          className={getIconButtonClasses(activeDropdown === 'settings')}
        >
          <Settings size={20} />
          <div className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 transform whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
            Settings
          </div>
        </button>

        <div
          onMouseEnter={handleSettingsDropdownMouseEnter}
          onMouseLeave={handleSettingsDropdownMouseLeave}
        >
          <SettingsDropdown
            isVisible={activeDropdown === 'settings'}
            onSelectSetting={handleSettingSelect}
          />
        </div>
      </div>
    </nav>
  );
};

export default NavigationIcons;
