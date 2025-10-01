'use client';

import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { SettingsIcon } from '@/components/UI/settings';
import { FileTextIcon } from '@/components/UI/file-text';
import { DownloadIcon } from '@/components/UI/download';
import { EarthIcon } from '@/components/UI/earth';
import { CalendarDaysIcon } from '@/components/UI/calendar-days';
import { Maximize2Icon } from '@/components/UI/maximize-2';
import { CircleHelpIcon } from '@/components/UI/circle-help';
import { Tutorial } from './Tutorial'; // Import the tutorial component

export function SideButtons() {
  const [isExpanded, setIsExpanded] = useState(true); // Default to expanded
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [inputValue, setInputValue] = useState('');

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

  const closeTutorial = () => {
    setShowTutorial(false);
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
              <div className="btn-icon group" onClick={handleFileTextClick}>
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
              <div className="btn-icon group" onClick={handleCalendarClick}>
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
              <div className="btn-icon group" onClick={handleDownloadClick}>
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
              <div className="btn-icon group" onClick={handlePreferencesClick}>
                <EarthIcon size={18} />
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
              <div className="btn-icon group" onClick={handleTutorialClick}>
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
              <div className="btn-icon group" onClick={handleFullscreenClick}>
                <Maximize2Icon size={18} />
                <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Fullscreen
                </div>
              </div>
            </motion.div>

            {/* Settings Toggle Button */}
            <motion.div
              initial={false}
              animate={{
                opacity: isExpanded ? 1 : 0.8,
                scale: isExpanded ? 1 : 1,
                y: isExpanded ? 1 : 1,
              }}
              transition={{ duration: 0.2, delay: 0.25 }}
            >
              <div className="btn-icon group">
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
          ></motion.div>
        )}
      </AnimatePresence>

      {/* Tutorial Component */}
      <Tutorial isOpen={showTutorial} onClose={closeTutorial} />
    </>
  );
}
