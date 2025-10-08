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

interface SideButtonsProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onShowTutorial: () => void;
  onShowSidebarPanel: (panel: 'datasets' | 'history' | 'about' | null) => void;
}

export function SideButtons({
  selectedDate,
  onDateChange,
  onShowTutorial,
  onShowSidebarPanel,
}: SideButtonsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);
  const [inputValue, setInputValue] = useState(
    selectedDate.toLocaleDateString('en-US')
  );
  const [viewDate, setViewDate] = useState(selectedDate);

  // Update input and viewDate when selectedDate changes
  useEffect(() => {
    setInputValue(selectedDate.toLocaleDateString('en-US'));
    setViewDate(selectedDate);
  }, [selectedDate]);

  // Event handlers with useCallback for performance
  const toggleMenu = useCallback(() => setIsExpanded((prev) => !prev), []);

  const handleFileTextClick = useCallback(() => {
    console.log('Documents clicked');
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

  // Calendar helpers
  const getDaysInMonth = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return { firstDay, daysInMonth };
  }, []);

  const handlePrevMonth = useCallback(() => {
    setViewDate((prev) => {
      const newDate = new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
      return newDate;
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setViewDate((prev) => {
      const newDate = new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
      return newDate;
    });
  }, []);

  const handleDateSelect = useCallback(
    (day: number) => {
      // Create new date while preserving the time components from selectedDate
      const newDate = new Date(
        viewDate.getFullYear(),
        viewDate.getMonth(),
        day,
        selectedDate.getHours(),
        selectedDate.getMinutes(),
        selectedDate.getSeconds()
      );
      onDateChange(newDate);
      closeCalendar();
    },
    [viewDate, selectedDate, onDateChange, closeCalendar]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputValue(value);

      // Try to parse the date
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        // Create date preserving year/month/day but keeping time from selectedDate
        const newDate = new Date(
          parsed.getFullYear(),
          parsed.getMonth(),
          parsed.getDate(),
          selectedDate.getHours(),
          selectedDate.getMinutes(),
          selectedDate.getSeconds()
        );
        onDateChange(newDate);
        setViewDate(newDate);
      }
    },
    [selectedDate, onDateChange]
  );

  // Memoized calendar data based on viewDate
  const { firstDay, daysInMonth } = getDaysInMonth(viewDate);

  const monthNames = useMemo(
    () => [
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
    ],
    []
  );

  const dayNames = useMemo(
    () => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    []
  );

  const calendarDays = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth]
  );

  const emptyDays = useMemo(
    () => Array.from({ length: firstDay }, (_, i) => i),
    [firstDay]
  );

  // Check if a day is selected (compare with actual selectedDate)
  const isDaySelected = useCallback(
    (day: number) => {
      return (
        selectedDate.getDate() === day &&
        selectedDate.getMonth() === viewDate.getMonth() &&
        selectedDate.getFullYear() === viewDate.getFullYear()
      );
    },
    [selectedDate, viewDate]
  );

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
        {!showCalendar && (
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
            className="pointer-events-auto fixed top-1/2 left-4 z-9999 w-80 -translate-y-1/2 rounded-xl bg-slate-800/95 p-4 text-slate-100 shadow-2xl backdrop-blur-sm"
          >
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <button
                onClick={handlePrevMonth}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
                aria-label="Previous month"
              >
                ‹
              </button>
              <h2 className="text-center text-lg font-semibold">
                {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
              </h2>
              <button
                onClick={handleNextMonth}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
                aria-label="Next month"
              >
                ›
              </button>
            </div>

            {/* Input */}
            <div className="mb-4">
              <input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                placeholder="MM/DD/YYYY"
                className="w-full rounded-lg border border-slate-600 bg-slate-700/60 px-3 py-2 text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-rose-400/50 focus:outline-none"
                aria-label="Date input"
              />
            </div>

            {/* Day Labels */}
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
              {dayNames.map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {/* Empty days for calendar alignment */}
              {emptyDays.map((index) => (
                <div key={`empty-${index}`} />
              ))}

              {/* Calendar days */}
              {calendarDays.map((day) => {
                const selected = isDaySelected(day);
                return (
                  <button
                    key={day}
                    onClick={() => handleDateSelect(day)}
                    className={`aspect-square rounded-md text-sm transition-all ${
                      selected
                        ? 'bg-rose-500 font-semibold text-white'
                        : 'hover:bg-slate-700'
                    }`}
                    aria-label={`Select ${monthNames[viewDate.getMonth()]} ${day}, ${viewDate.getFullYear()}`}
                    aria-selected={selected}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="mt-4 flex justify-end">
              <button
                onClick={closeCalendar}
                className="rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-600"
              >
                Close
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
