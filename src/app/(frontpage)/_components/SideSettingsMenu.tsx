'use client';

import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';
import { SettingsIcon } from '@/components/UI/settings';
import { FileTextIcon } from '@/components/UI/file-text';
import { DownloadIcon } from '@/components/UI/download';
import { SettingsGearIcon } from '@/components/UI/settings-gear';
import { CalendarDaysIcon } from '@/components/UI/calendar-days';
import { Maximize2Icon } from '@/components/UI/maximize-2';
import { CircleHelpIcon } from '@/components/UI/circle-help';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export function SettingsSideMenu() {
  const [isExpanded, setIsExpanded] = useState(true); // Default to expanded
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [inputValue, setInputValue] = useState('');

  // Tutorial
  useEffect(() => {
    if (!showTutorial) return;

    const driverObj = driver({
      showProgress: true,
      animate: true,
      overlayOpacity: 0.5,
      smoothScroll: true,
      onDestroyStarted: () => {
        driverObj.destroy();
        setShowTutorial(false);
      },
      onPopoverClose: () => {
        driverObj.destroy();
        setShowTutorial(false);
      },
      steps: [
        {
          element: '#dataset',
          popover: {
            title: 'Dataset Selection',
            description:
              'Click here to select and load different datasets for visualization.',
            side: 'right',
            align: 'start',
          },
        },
        {
          element: '#calendar',
          popover: {
            title: 'Date Selection',
            description:
              'Set specific dates for your data visualization using the calendar.',
            side: 'right',
            align: 'start',
          },
        },
        {
          element: '#download',
          popover: {
            title: 'Download Data',
            description:
              'Export your current dataset or visualization in various formats.',
            side: 'right',
            align: 'start',
          },
        },
        {
          element: '#preferences',
          popover: {
            title: 'Globe Settings',
            description:
              'Customize the globe appearance, layers, and visualization settings.',
            side: 'right',
            align: 'start',
          },
        },
        {
          element: '#fullscreen',
          popover: {
            title: 'Fullscreen Mode',
            description:
              'Toggle fullscreen mode for an immersive viewing experience.',
            side: 'right',
            align: 'start',
          },
        },
        {
          popover: {
            title: 'Tutorial Complete!',
            description:
              'You now know all the main controls. The help button is always available if you need a refresher!',
          },
        },
      ],
    });

    driverObj.drive();

    return () => {
      if (driverObj.isActive()) {
        driverObj.destroy();
      }
    };
  }, [showTutorial]);

  // Menu handlers
  const toggleMenu = () => setIsExpanded(!isExpanded);

  const handleFileTextClick = () => {
    console.log('Documents clicked');
    // Add your file/document action here
  };

  const handleCalendarClick = () => {
    console.log('Calendar clicked');
    setShowCalendar(true);
    // Don't collapse menu when opening calendar
  };

  const handleDownloadClick = () => {
    console.log('Download clicked');
    // Add your download action here
  };

  const handleFullscreenClick = () => {
    console.log('Fullscreen clicked');
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  };

  const handlePreferencesClick = () => {
    console.log('Preferences clicked');
    // Add your preferences action here
  };

  const handleTutorialClick = () => {
    setShowTutorial(true);
    // Don't collapse menu when starting tutorial
  };

  const closeCalendar = () => {
    setShowCalendar(false);
  };

  // Calendar helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return { firstDay, daysInMonth };
  };

  const handlePrevMonth = () => {
    setSelectedDate(
      new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1)
    );
  };

  const handleNextMonth = () => {
    setSelectedDate(
      new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1)
    );
  };

  const handleDateSelect = (day: number) => {
    const newDate = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      day
    );
    setSelectedDate(newDate);
    setInputValue(
      newDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    );
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    const parsed = new Date(e.target.value);
    if (!isNaN(parsed.getTime())) {
      setSelectedDate(parsed);
    }
  };

  const { firstDay, daysInMonth } = getDaysInMonth(selectedDate);
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <>
      {/* Main Side Menu */}
      <AnimatePresence>
        {!showCalendar && (
          <motion.div
            initial={{ x: 0 }}
            exit={{ x: -100, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="pointer-events-auto fixed left-4 top-0 z-[9999] flex h-screen flex-col items-center justify-center gap-2"
          >
            {/* Dataset Button */}
            <motion.div
              id="dataset"
              initial={false}
              animate={{
                opacity: isExpanded ? 1 : 0,
                scale: isExpanded ? 1 : 0.8,
                y: isExpanded ? 0 : 10,
              }}
              transition={{ duration: 0.2 }}
            >
              <div
                className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:scale-105 hover:bg-slate-700/90"
                onClick={handleFileTextClick}
              >
                <FileTextIcon size={18} />
                <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Select Dataset
                </div>
              </div>
            </motion.div>

            {/* Calendar Button */}
            <motion.div
              id="calendar"
              initial={false}
              animate={{
                opacity: isExpanded ? 1 : 0,
                scale: isExpanded ? 1 : 0.8,
                y: isExpanded ? 0 : 10,
              }}
              transition={{ duration: 0.2, delay: 0.05 }}
            >
              <div
                className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:scale-105 hover:bg-slate-700/90"
                onClick={handleCalendarClick}
              >
                <CalendarDaysIcon size={18} />
                <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Set Date
                </div>
              </div>
            </motion.div>

            {/* Download Button */}
            <motion.div
              id="download"
              initial={false}
              animate={{
                opacity: isExpanded ? 1 : 0,
                scale: isExpanded ? 1 : 0.8,
                y: isExpanded ? 0 : 10,
              }}
              transition={{ duration: 0.2, delay: 0.1 }}
            >
              <div
                className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:scale-105 hover:bg-slate-700/90"
                onClick={handleDownloadClick}
              >
                <DownloadIcon size={18} />
                <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Download Dataset
                </div>
              </div>
            </motion.div>

            {/* Preferences Button */}
            <motion.div
              id="preferences"
              initial={false}
              animate={{
                opacity: isExpanded ? 1 : 0,
                scale: isExpanded ? 1 : 0.8,
                y: isExpanded ? 0 : 10,
              }}
              transition={{ duration: 0.2, delay: 0.2 }}
            >
              <div
                className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:scale-105 hover:bg-slate-700/90"
                onClick={handlePreferencesClick}
              >
                <SettingsGearIcon size={18} />
                <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Globe Settings
                </div>
              </div>
            </motion.div>

            {/* Tutorial Button */}
            <motion.div
              initial={false}
              animate={{
                opacity: isExpanded ? 1 : 0,
                scale: isExpanded ? 1 : 0.8,
                y: isExpanded ? 0 : 10,
              }}
              transition={{ duration: 0.2, delay: 0.15 }}
            >
              <div
                className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:scale-105 hover:bg-slate-700/90"
                onClick={handleTutorialClick}
              >
                <CircleHelpIcon size={18} />
                <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Show Tutorial
                </div>
              </div>
            </motion.div>

            {/* Fullscreen Button */}
            <motion.div
              id="fullscreen"
              initial={false}
              animate={{
                opacity: isExpanded ? 1 : 0,
                scale: isExpanded ? 1 : 0.8,
                y: isExpanded ? 0 : 10,
              }}
              transition={{ duration: 0.2, delay: 0.25 }}
            >
              <div
                className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:scale-105 hover:bg-slate-700/90"
                onClick={handleFullscreenClick}
              >
                <Maximize2Icon size={18} />
                <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Fullscreen
                </div>
              </div>
            </motion.div>

            {/* Settings Toggle Button */}
            <motion.div
              initial={false}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              <div className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-900/90 transition-all hover:scale-105 hover:bg-slate-700/90">
                <SettingsIcon size={18} onClick={toggleMenu} />
                <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
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
            className="pointer-events-auto fixed left-4 top-1/2 z-[9999] w-80 -translate-y-1/2 rounded-xl bg-slate-800/95 p-4 shadow-2xl backdrop-blur-sm"
          >
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Select Date</h3>
              <button
                onClick={closeCalendar}
                className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-slate-700/50 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Date Input */}
            <input
              type="text"
              value={
                inputValue ||
                selectedDate.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                })
              }
              onChange={handleInputChange}
              placeholder="MM/DD/YYYY"
              className="mb-4 w-full rounded-lg bg-slate-700/50 px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Month/Year Navigation */}
            <div className="mb-4 flex items-center justify-between">
              <button
                onClick={handlePrevMonth}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-slate-700/50 hover:text-white"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="text-center">
                <div className="text-sm font-semibold text-white">
                  {monthNames[selectedDate.getMonth()]}{' '}
                  {selectedDate.getFullYear()}
                </div>
              </div>
              <button
                onClick={handleNextMonth}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-slate-700/50 hover:text-white"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Day Names */}
              {dayNames.map((day) => (
                <div
                  key={day}
                  className="py-2 text-center text-xs font-medium text-gray-400"
                >
                  {day}
                </div>
              ))}

              {/* Empty cells for offset */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}

              {/* Days */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const isSelected = selectedDate.getDate() === day;
                const isToday =
                  new Date().toDateString() ===
                  new Date(
                    selectedDate.getFullYear(),
                    selectedDate.getMonth(),
                    day
                  ).toDateString();

                return (
                  <button
                    key={day}
                    onClick={() => handleDateSelect(day)}
                    className={`rounded-lg py-2 text-sm transition-colors ${
                      isSelected
                        ? 'bg-blue-500 font-semibold text-white'
                        : isToday
                          ? 'bg-slate-700/50 font-medium text-blue-400'
                          : 'text-gray-300 hover:bg-slate-700/50'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={closeCalendar}
                className="flex-1 rounded-lg bg-slate-700/50 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  console.log('Selected date:', selectedDate);
                  closeCalendar();
                }}
                className="flex-1 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
              >
                Apply
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
