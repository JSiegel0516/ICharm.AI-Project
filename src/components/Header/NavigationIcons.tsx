'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, Settings, X } from 'lucide-react';
import { ChartSplineIcon } from '../UI/chart-spline';
import { SettingsGearIcon } from '../UI/settings-gear';
import SettingsDropdown from './Dropdowns/SettingsDropdown';
import { useAppState } from '@/context/HeaderContext';
import { SettingsModal } from '@/app/(frontpage)/_components/Modals/SettingsModal';
import AboutModal from '@/app/(frontpage)/_components/Modals/AboutModal';

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
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false); // Add state for About modal

  const datasetDropdownRef = useRef<HTMLDivElement>(null);
  const datasetButtonRef = useRef<HTMLButtonElement>(null);
  const settingsDropdownRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  // Standardized icon size
  const ICON_SIZE = 20;

  const handleAboutClick = () => {
    setActiveDropdown(null);
    setShowAboutModal(true); // Use local state instead of context
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
    setShowSettingsModal(true);
    setActiveDropdown(null);
  };

  const closeSettingsModal = () => {
    setShowSettingsModal(false);
  };

  const closeAboutModal = () => {
    setShowAboutModal(false);
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

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

  // Standardized container classes
  const getIconContainerClasses = (isActive: boolean = false) => {
    return `relative group p-2 rounded-xl transition-all duration-300 ${
      isActive
        ? 'bg-blue-500/20 border border-blue-400/30 text-blue-400'
        : 'bg-gray-800/50 hover:bg-gray-700/60 text-gray-400 hover:text-white border border-transparent hover:border-gray-600/50'
    }`;
  };

  // Standardized icon wrapper for consistent sizing
  const IconWrapper = ({
    children,
    className = '',
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div className={`flex h-6 w-6 items-center justify-center ${className}`}>
      {children}
    </div>
  );

  return (
    <>
      <nav className="flex items-center gap-3">
        {/* Time Series Link */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={getIconContainerClasses()}
          id="time-series-button"
        >
          <Link
            href="/timeseries"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center"
          >
            <IconWrapper>
              <ChartSplineIcon size={ICON_SIZE} />
            </IconWrapper>
            <div className="pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 transform whitespace-nowrap rounded-lg bg-gray-900/95 px-3 py-2 text-xs text-white opacity-0 transition-all duration-300 group-hover:-bottom-12 group-hover:opacity-100">
              Time Series Analysis
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 transform border-b-4 border-l-4 border-r-4 border-transparent border-b-gray-900/95" />
            </div>
          </Link>
        </motion.div>

        {/* About Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          id="about-me-button"
          onClick={handleAboutClick}
          className={getIconContainerClasses()}
        >
          <IconWrapper>
            <Info size={ICON_SIZE} />
          </IconWrapper>
          <div className="pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 transform whitespace-nowrap rounded-lg bg-gray-900/95 px-3 py-2 text-xs text-white opacity-0 transition-all duration-300 group-hover:-bottom-12 group-hover:opacity-100">
            About iCharm
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 transform border-b-4 border-l-4 border-r-4 border-transparent border-b-gray-900/95" />
          </div>
        </motion.button>

        {/* Settings Button */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={getIconContainerClasses(activeDropdown === 'settings')}
        >
          <button
            id="site-settings-button"
            ref={settingsButtonRef}
            onClick={handleSettingsClick}
            className="flex items-center justify-center"
          >
            <IconWrapper>
              <SettingsGearIcon size={ICON_SIZE} />
            </IconWrapper>
            <div className="pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 transform whitespace-nowrap rounded-lg bg-gray-900/95 px-3 py-2 text-xs text-white opacity-0 transition-all duration-300 group-hover:-bottom-12 group-hover:opacity-100">
              Site Settings
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 transform border-b-4 border-l-4 border-r-4 border-transparent border-b-gray-900/95" />
            </div>
          </button>
        </motion.div>
      </nav>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={closeSettingsModal}
        onSave={(settings) => {
          // Save settings logic
          console.log('Saving settings:', settings);
          closeSettingsModal();
        }}
      />

      {/* About Modal */}
      <AboutModal
        isOpen={showAboutModal} // Pass the isOpen prop
        onClose={closeAboutModal}
        onShowTutorial={() => {
          // Handle tutorial launch
          closeAboutModal();
          // You might want to add tutorial launch logic here
          console.log('Launch tutorial from About modal');
        }}
      />
    </>
  );
};

export default NavigationIcons;
