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

  const handleAboutClick = () => {
    setActiveDropdown(null);
    setShowAbout(true);
  };

  const handleDatasetClick = () => {
    setActiveDropdown(activeDropdown === 'datasets' ? null : 'datasets');
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
    setActiveDropdown(activeDropdown === 'settings' ? null : 'settings');
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Check if click is outside both dropdown areas
      const isOutsideDataset =
        datasetDropdownRef.current &&
        !datasetDropdownRef.current.contains(target) &&
        datasetButtonRef.current &&
        !datasetButtonRef.current.contains(target);

      const isOutsideSettings =
        settingsDropdownRef.current &&
        !settingsDropdownRef.current.contains(target) &&
        settingsButtonRef.current &&
        !settingsButtonRef.current.contains(target);

      if (isOutsideDataset && isOutsideSettings) {
        setActiveDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const getIconButtonClasses = (isActive: boolean = false) => {
    return `px-4 py-2 transition-colors duration-200 relative group ${
      isActive
        ? 'border-b-2 border-blue-400 text-blue-400'
        : 'hover:text-white text-gray-400'
    }`;
  };

  return (
    <nav className="flex items-center gap-4">
      {/* Datasets with Dropdown */}
      <div className="relative" ref={datasetDropdownRef}>
        <button
          ref={datasetButtonRef}
          onClick={handleDatasetClick}
          className={getIconButtonClasses(activeDropdown === 'datasets')}
        >
          <FileText size={20} />
          <div className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 transform whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
            Datasets
          </div>
        </button>

        <DatasetDropdown
          isVisible={activeDropdown === 'datasets'}
          onSelectDataset={handleDatasetSelect}
        />
      </div>

      {/* About */}
      <button onClick={handleAboutClick} className={getIconButtonClasses()}>
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
          className={getIconButtonClasses(activeDropdown === 'settings')}
        >
          <Settings size={20} />
          <div className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 transform whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
            Settings
          </div>
        </button>

        <SettingsDropdown
          isVisible={activeDropdown === 'settings'}
          onSelectSetting={handleSettingSelect}
        />
      </div>
    </nav>
  );
};

export default NavigationIcons;
