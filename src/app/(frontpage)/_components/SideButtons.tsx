'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useCallback } from 'react';
import { SettingsIcon } from '@/components/ui/settings';
import { FileTextIcon } from '@/components/ui/file-text';
import { DownloadIcon } from '@/components/ui/download';
import { EarthIcon } from '@/components/ui/earth';
import { CalendarDaysIcon } from '@/components/ui/calendar-days';
import { Maximize2Icon } from '@/components/ui/maximize-2';
import { CircleHelpIcon } from '@/components/ui/circle-help';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';

interface SideButtonsProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onShowTutorial: () => void;
  onShowSidebarPanel: (panel: 'datasets' | 'history' | 'about' | null) => void;
}

interface Dataset {
  id: string;
  name: string;
  description: string;
  size: string;
  lastUpdated: string;
  category: string;
  selected?: boolean;
}

export function SideButtons({
  selectedDate,
  onDateChange,
  onShowTutorial,
  onShowSidebarPanel,
}: SideButtonsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showDatasetCard, setShowDatasetCard] = useState(false);
  const [inputValue, setInputValue] = useState(
    selectedDate.toLocaleDateString('en-US')
  );
  const [viewDate, setViewDate] = useState(selectedDate);
  const [selectedDatasets, setSelectedDatasets] = useState<Set<string>>(
    new Set()
  );

  // Sample datasets data
  const datasets: Dataset[] = [
    {
      id: 'global-temp',
      name: 'Global Temperature',
      description: 'Global surface temperature data from 1880 to present',
      size: '2.4 GB',
      lastUpdated: '2024-01-15',
      category: 'Climate',
    },
    {
      id: 'co2-concentration',
      name: 'CO₂ Concentration',
      description: 'Atmospheric carbon dioxide measurements worldwide',
      size: '1.1 GB',
      lastUpdated: '2024-01-10',
      category: 'Atmosphere',
    },
    {
      id: 'sea-level',
      name: 'Sea Level Rise',
      description:
        'Global mean sea level measurements from satellite altimetry',
      size: '3.2 GB',
      lastUpdated: '2024-01-08',
      category: 'Oceans',
    },
    {
      id: 'arctic-ice',
      name: 'Arctic Sea Ice',
      description: 'Daily Arctic sea ice extent and concentration',
      size: '4.7 GB',
      lastUpdated: '2024-01-12',
      category: 'Cryosphere',
    },
    {
      id: 'precipitation',
      name: 'Global Precipitation',
      description: 'Worldwide precipitation measurements and estimates',
      size: '5.1 GB',
      lastUpdated: '2024-01-05',
      category: 'Hydrology',
    },
  ];

  // Update input and viewDate when selectedDate changes
  useEffect(() => {
    setInputValue(selectedDate.toLocaleDateString('en-US'));
    setViewDate(selectedDate);
  }, [selectedDate]);

  // Event handlers with useCallback for performance
  const toggleMenu = useCallback(() => setIsExpanded((prev) => !prev), []);

  const handleFileTextClick = useCallback(() => {
    console.log('Dataset selection clicked');
    setShowDatasetCard(true);
    onShowSidebarPanel('datasets');
  }, [onShowSidebarPanel]);

  const handleDownloadClick = useCallback(() => {
    console.log('Download clicked');
  }, []);

  const handlePreferencesClick = useCallback(() => {
    console.log('Preferences clicked');
    onShowSidebarPanel('about');
  }, [onShowSidebarPanel]);

  const handleFullscreenClick = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  const handleTutorialClick = useCallback(() => {
    onShowTutorial();
  }, [onShowTutorial]);

  const handleCalendarClick = useCallback(() => {
    setShowCalendar(true);
    setViewDate(selectedDate);
  }, [selectedDate]);

  const closeCalendar = useCallback(() => {
    setShowCalendar(false);
  }, []);

  const closeDatasetCard = useCallback(() => {
    setShowDatasetCard(false);
    onShowSidebarPanel(null);
  }, [onShowSidebarPanel]);

  const toggleDatasetSelection = useCallback((datasetId: string) => {
    setSelectedDatasets((prev) => {
      const newSelection = new Set(prev);
      if (newSelection.has(datasetId)) {
        newSelection.delete(datasetId);
      } else {
        newSelection.add(datasetId);
      }
      return newSelection;
    });
  }, []);

  const handleApplyDatasets = useCallback(() => {
    console.log('Selected datasets:', Array.from(selectedDatasets));
    // Here you would typically apply the selected datasets
    closeDatasetCard();
  }, [selectedDatasets, closeDatasetCard]);

  // Calendar helpers
  const getDaysInMonth = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return { firstDay, daysInMonth };
  }, []);

  const handleDateSelect = useCallback(
    (date: Date | undefined) => {
      if (date) {
        // Create new date while preserving the time components from selectedDate
        const newDate = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          selectedDate.getHours(),
          selectedDate.getMinutes(),
          selectedDate.getSeconds()
        );
        onDateChange(newDate);
        closeCalendar();
      }
    },
    [selectedDate, onDateChange, closeCalendar]
  );

  // Memoized calendar data based on viewDate
  const { firstDay, daysInMonth } = getDaysInMonth(viewDate);

  // Button data for cleaner rendering
  const buttonConfigs = useMemo(
    () => [
      {
        id: 'tutorial',
        icon: <CircleHelpIcon size={18} />,
        label: 'Show Tutorial',
        onClick: handleTutorialClick,
        delay: 0.15,
      },
      {
        id: 'dataset',
        icon: <FileTextIcon size={18} />,
        label: 'Select Dataset',
        onClick: handleFileTextClick,
        delay: 0,
      },
      {
        id: 'calendar',
        icon: <CalendarDaysIcon size={18} />,
        label: 'Set Date',
        onClick: handleCalendarClick,
        delay: 0.05,
      },
      {
        id: 'download',
        icon: <DownloadIcon size={18} />,
        label: 'Download Dataset',
        onClick: handleDownloadClick,
        delay: 0.1,
      },
      {
        id: 'preferences',
        icon: <EarthIcon size={18} />,
        label: 'Globe Settings',
        onClick: handlePreferencesClick,
        delay: 0.2,
      },
      {
        id: 'fullscreen',
        icon: <Maximize2Icon size={18} />,
        label: 'Fullscreen',
        onClick: handleFullscreenClick,
        delay: 0.25,
      },
    ],
    [
      handleTutorialClick,
      handleFileTextClick,
      handleCalendarClick,
      handleDownloadClick,
      handlePreferencesClick,
      handleFullscreenClick,
    ]
  );

  return (
    <>
      {/* Side Menu */}
      <AnimatePresence>
        {!showCalendar && !showDatasetCard && (
          <motion.div
            initial={{ x: 0 }}
            exit={{ x: -100, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="pointer-events-auto fixed top-0 left-4 z-9999 flex h-screen flex-col items-center justify-center gap-2"
          >
            {/* Dynamic Buttons */}
            {buttonConfigs.map(({ id, icon, label, onClick, delay }) => (
              <motion.div
                key={id}
                id={id}
                initial={false}
                animate={{
                  opacity: isExpanded ? 1 : 0,
                  scale: isExpanded ? 1 : 0.8,
                  y: isExpanded ? 0 : 10,
                }}
                transition={{ duration: 0.2, delay }}
              >
                <div className="btn-icon group" onClick={onClick}>
                  {icon}
                  <div className="btn-hover group-hover:opacity-100">
                    {label}
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Settings Toggle */}
            <motion.div
              initial={false}
              animate={{ opacity: isExpanded ? 1 : 0.8, scale: 1, y: 1 }}
              transition={{ duration: 0.2, delay: 0.25 }}
            >
              <div className="btn-icon group">
                <SettingsIcon size={18} onClick={toggleMenu} />
                <div className="btn-hover group-hover:opacity-100">
                  {isExpanded ? 'Hide Settings' : 'Show Settings'}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Calendar Window */}
      <AnimatePresence>
        {showCalendar && (
          <motion.div
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -100, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="pointer-events-auto fixed top-1/2 left-4 z-9999 w-80 -translate-y-1/2"
          >
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              className="rounded-md border shadow-sm lg:h-[300px] lg:w-[250px]"
              captionLayout="dropdown"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dataset Selection Card */}
      <AnimatePresence>
        {showDatasetCard && (
          <motion.div
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -100, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="pointer-events-auto fixed top-1/2 left-4 z-9999 w-96 -translate-y-1/2"
          >
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-lg">
                  <span>Select Datasets</span>
                  <Badge variant="secondary" className="">
                    {selectedDatasets.size} selected
                  </Badge>
                </CardTitle>
                <CardDescription className="">
                  Choose datasets to visualize on the globe
                </CardDescription>
              </CardHeader>
              <CardContent className="max-h-96 space-y-3 overflow-y-auto">
                {datasets.map((dataset) => (
                  <div
                    key={dataset.id}
                    className={`cursor-pointer rounded-lg border p-3 transition-all ${
                      selectedDatasets.has(dataset.id)
                        ? 'border-slate-300/50 bg-slate-300/20'
                        : 'border-slate-600 bg-slate-700/50 hover:bg-slate-700/70'
                    }`}
                    onClick={() => toggleDatasetSelection(dataset.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-white">
                          {dataset.name}
                        </h3>
                        <p className="mt-1 text-xs text-slate-400">
                          {dataset.description}
                        </p>
                        <div className="mt-2 flex items-center gap-3">
                          <Badge variant="outline" className="text-xs">
                            {dataset.category}
                          </Badge>
                          <span className="text-xs text-slate-500">
                            {dataset.size}
                          </span>
                        </div>
                      </div>
                      <div
                        className={`ml-2 flex h-4 w-4 items-center justify-center rounded border ${
                          selectedDatasets.has(dataset.id)
                            ? 'border-rose-500 bg-rose-500'
                            : 'border-slate-400'
                        }`}
                      >
                        {selectedDatasets.has(dataset.id) && (
                          <svg
                            className="h-3 w-3 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
              <div className="flex gap-2 border-t border-slate-700 p-4">
                <Button
                  variant="outline"
                  onClick={closeDatasetCard}
                  className="flex-1 border-slate-600 bg-transparent text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleApplyDatasets}
                  disabled={selectedDatasets.size === 0}
                  className="flex-1 bg-rose-500 text-white hover:bg-rose-600 disabled:bg-slate-700 disabled:text-slate-500"
                >
                  Apply Datasets
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
