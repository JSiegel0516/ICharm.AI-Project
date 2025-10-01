'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, Settings, X } from 'lucide-react';
import { ChartSplineIcon } from '../UI/chart-spline';
import { SettingsGearIcon } from '../UI/settings-gear';
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
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const datasetDropdownRef = useRef<HTMLDivElement>(null);
  const datasetButtonRef = useRef<HTMLButtonElement>(null);
  const settingsDropdownRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  // Standardized icon size
  const ICON_SIZE = 20;

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
    setShowSettingsModal(true);
    setActiveDropdown(null);
  };

  const closeSettingsModal = () => {
    setShowSettingsModal(false);
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
          id="aboutme"
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
            id="site-settings"
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
      <AnimatePresence>
        {showSettingsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={closeSettingsModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative mx-4 w-full max-w-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-xl border border-gray-700/50 bg-gray-900/95 shadow-2xl backdrop-blur-lg">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-700/50 p-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-blue-500/20 p-2">
                      <Settings size={24} className="text-blue-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-white">
                        Site Settings
                      </h2>
                      <p className="text-sm text-gray-400">
                        Configure your iCharm experience
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={closeSettingsModal}
                    className="rounded-lg p-2 text-gray-400 transition-colors duration-200 hover:bg-gray-700/50 hover:text-white"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Settings Content */}
                <div className="max-h-[60vh] overflow-y-auto p-6">
                  <div className="space-y-6">
                    {/* Accessibility Settings */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium text-white">
                        Accessibility
                      </h3>

                      {/* Language Settings */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between rounded-lg bg-gray-800/30 p-3">
                          <div>
                            <span className="text-white">Language</span>
                            <div className="text-sm text-gray-400">
                              Interface language
                            </div>
                          </div>
                          <select className="rounded-lg bg-gray-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="en">English</option>
                            <option value="es">Español</option>
                            <option value="fr">Français</option>
                            <option value="de">Deutsch</option>
                            <option value="zh">中文</option>
                            <option value="ja">日本語</option>
                            <option value="ko">한국어</option>
                            <option value="ar">العربية</option>
                          </select>
                        </div>

                        {/* Font Size */}
                        <div className="flex items-center justify-between rounded-lg bg-gray-800/30 p-3">
                          <div>
                            <span className="text-white">Font Size</span>
                            <div className="text-sm text-gray-400">
                              Adjust text size
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button className="rounded-lg bg-gray-700 p-2 text-gray-400 transition-colors hover:bg-gray-600 hover:text-white">
                              A
                            </button>
                            <button className="rounded-lg bg-gray-700 p-2 text-white transition-colors hover:bg-gray-600">
                              A
                            </button>
                            <button className="rounded-lg bg-gray-700 p-2 text-lg text-gray-400 transition-colors hover:bg-gray-600 hover:text-white">
                              A
                            </button>
                            <button className="rounded-lg bg-gray-700 p-2 text-xl text-gray-400 transition-colors hover:bg-gray-600 hover:text-white">
                              A
                            </button>
                          </div>
                        </div>

                        {/* Color Contrast */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-white">Color Contrast</span>
                              <div className="text-sm text-gray-400">
                                Enhance color visibility
                              </div>
                            </div>
                            <select className="rounded-lg bg-gray-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                              <option value="default">Default</option>
                              <option value="high">High Contrast</option>
                              <option value="mono">Monochrome</option>
                              <option value="inverted">Inverted Colors</option>
                            </select>
                          </div>

                          {/* Color Contrast Preview */}
                          <div className="mt-2 grid grid-cols-4 gap-2">
                            <div className="cursor-pointer rounded-lg border-2 border-transparent p-2 text-center text-xs transition-colors hover:border-blue-500">
                              <div className="mb-1 h-8 rounded bg-gradient-to-r from-blue-500 to-purple-600"></div>
                              <span className="text-white">Default</span>
                            </div>
                            <div className="cursor-pointer rounded-lg border-2 border-transparent p-2 text-center text-xs transition-colors hover:border-blue-500">
                              <div className="mb-1 h-8 rounded bg-gradient-to-r from-yellow-400 to-red-600"></div>
                              <span className="text-white">High Contrast</span>
                            </div>
                            <div className="cursor-pointer rounded-lg border-2 border-transparent p-2 text-center text-xs transition-colors hover:border-blue-500">
                              <div className="mb-1 h-8 rounded bg-gradient-to-r from-gray-700 to-gray-900"></div>
                              <span className="text-white">Monochrome</span>
                            </div>
                            <div className="cursor-pointer rounded-lg border-2 border-transparent p-2 text-center text-xs transition-colors hover:border-blue-500">
                              <div className="mb-1 h-8 rounded bg-gradient-to-r from-white to-gray-300"></div>
                              <span className="text-black">Inverted</span>
                            </div>
                          </div>
                        </div>

                        {/* Additional Accessibility Options */}
                        <div className="space-y-2">
                          <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-3 transition-colors duration-200 hover:bg-gray-700/40">
                            <input
                              type="checkbox"
                              className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                            />
                            <span className="text-white">
                              Reduce animations
                            </span>
                          </label>
                          <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-3 transition-colors duration-200 hover:bg-gray-700/40">
                            <input
                              type="checkbox"
                              className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                              defaultChecked
                            />
                            <span className="text-white">
                              Keyboard navigation
                            </span>
                          </label>
                          <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-3 transition-colors duration-200 hover:bg-gray-700/40">
                            <input
                              type="checkbox"
                              className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                            />
                            <span className="text-white">
                              Screen reader support
                            </span>
                          </label>
                          <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-3 transition-colors duration-200 hover:bg-gray-700/40">
                            <input
                              type="checkbox"
                              className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                              defaultChecked
                            />
                            <span className="text-white">Focus indicators</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Theme Settings */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium text-white">
                        Appearance
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <button className="rounded-lg border-2 border-gray-600 bg-gray-800/50 p-4 transition-colors duration-200 hover:border-blue-500">
                          <div className="font-medium text-white">
                            Light Mode
                          </div>
                          <div className="mt-1 text-sm text-gray-400">
                            Bright theme
                          </div>
                        </button>
                        <button className="rounded-lg border-2 border-blue-500 bg-blue-500/20 p-4">
                          <div className="font-medium text-white">
                            Dark Mode
                          </div>
                          <div className="mt-1 text-sm text-blue-400">
                            Currently active
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Data Settings */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium text-white">
                        Data Preferences
                      </h3>
                      <div className="space-y-3">
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-3 transition-colors duration-200 hover:bg-gray-700/40">
                          <input
                            type="checkbox"
                            className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                            defaultChecked
                          />
                          <span className="text-white">Auto-refresh data</span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-3 transition-colors duration-200 hover:bg-gray-700/40">
                          <input
                            type="checkbox"
                            className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                            defaultChecked
                          />
                          <span className="text-white">
                            Show data points on hover
                          </span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-3 transition-colors duration-200 hover:bg-gray-700/40">
                          <input
                            type="checkbox"
                            className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                          />
                          <span className="text-white">
                            High precision mode
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Performance Settings */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium text-white">
                        Performance
                      </h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between rounded-lg bg-gray-800/30 p-3">
                          <span className="text-white">Animation Quality</span>
                          <select className="rounded-lg bg-gray-700 px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option>High</option>
                            <option>Medium</option>
                            <option>Low</option>
                          </select>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-gray-800/30 p-3">
                          <span className="text-white">Cache Duration</span>
                          <select className="rounded-lg bg-gray-700 px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option>1 hour</option>
                            <option>6 hours</option>
                            <option>24 hours</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Reset Settings */}
                    <div className="border-t border-gray-700/50 pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-white">Reset to Defaults</span>
                          <div className="text-sm text-gray-400">
                            Restore all settings to defaults
                          </div>
                        </div>
                        <button className="rounded-lg bg-red-600/20 px-4 py-2 text-red-400 transition-colors hover:bg-red-600/30 hover:text-red-300">
                          Reset All
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 border-t border-gray-700/50 p-6">
                  <button
                    onClick={closeSettingsModal}
                    className="rounded-lg px-4 py-2 text-gray-400 transition-colors duration-200 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={closeSettingsModal}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors duration-200 hover:bg-blue-700"
                  >
                    Save Settings
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default NavigationIcons;
