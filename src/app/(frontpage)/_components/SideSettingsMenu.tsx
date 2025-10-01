import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { SettingsIcon } from '@/components/UI/settings';
import { FileTextIcon } from '@/components/UI/file-text';
import { DownloadIcon } from '@/components/UI/download';
import { SettingsGearIcon } from '@/components/UI/settings-gear';
import { CalendarDaysIcon } from '@/components/UI/calendar-days';
import { Maximize2Icon } from '@/components/UI/maximize-2';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export function SettingsSideMenu() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [inputValue, setInputValue] = useState('');

  const toggleMenu = () => {
    setIsExpanded(!isExpanded);
  };

  const handleFileTextClick = () => {
    console.log('Documents clicked');
  };

  const handleCalendarClick = () => {
    console.log('Calendar clicked');
    setShowCalendar(true);
    setIsExpanded(false);
  };

  const handleDownloadClick = () => {
    console.log('Download clicked');
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
  };

  const closeCalendar = () => {
    setShowCalendar(false);
    setIsExpanded(true);
  };

  const getDaysInMonth = (date) => {
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

  const handleDateSelect = (day) => {
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

  const handleInputChange = (e) => {
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

  const menuItemClass = (visible: boolean) =>
    `transition-opacity duration-300 ${
      visible
        ? 'opacity-100 pointer-events-auto'
        : 'opacity-0 pointer-events-none'
    }`;

  return (
    <>
      <AnimatePresence>
        {!showCalendar && (
          <motion.div
            initial={{ x: 0 }}
            exit={{ x: -100, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="pointer-events-auto fixed left-4 top-0 z-[9999] flex h-screen flex-col items-center justify-center gap-2"
          >
            {/* FileText Button */}
            <div className={menuItemClass(isExpanded)}>
              <div
                className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:bg-slate-700/90"
                onClick={handleFileTextClick}
              >
                <div className="transition-all group-hover:brightness-150">
                  <FileTextIcon size={18} />
                </div>
                <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Select Dataset
                </div>
              </div>
            </div>

            {/* Calendar Button */}
            <div className={menuItemClass(isExpanded)}>
              <div
                className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:bg-slate-700/90"
                onClick={handleCalendarClick}
              >
                <div className="transition-all group-hover:brightness-150">
                  <CalendarDaysIcon size={18} />
                </div>
                <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Set Date
                </div>
              </div>
            </div>

            {/* Download Button */}
            <div className={menuItemClass(isExpanded)}>
              <div
                className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:bg-slate-700/90"
                onClick={handleDownloadClick}
              >
                <div className="transition-all group-hover:brightness-150">
                  <DownloadIcon size={18} />
                </div>
                <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Download Dataset
                </div>
              </div>
            </div>

            {/* Globe Settings Button */}
            <div className={menuItemClass(isExpanded)}>
              <div
                className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:bg-slate-700/90"
                onClick={handlePreferencesClick}
              >
                <div className="transition-all group-hover:brightness-150">
                  <SettingsGearIcon size={18} />
                </div>
                <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Globe Settings
                </div>
              </div>
            </div>

            {/* Fullscreen Button */}
            <div className={menuItemClass(isExpanded)}>
              <div
                className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:bg-slate-700/90"
                onClick={handleFullscreenClick}
              >
                <div className="transition-all group-hover:brightness-150">
                  <Maximize2Icon size={18} />
                </div>
                <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Fullscreen
                </div>
              </div>
            </div>

            {/* Settings Button (always visible) */}
            <div className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-900/90 transition-all hover:bg-slate-700/90">
              <div className="transition-all group-hover:brightness-150">
                <SettingsIcon size={18} onClick={toggleMenu} />
              </div>
              <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
                Show or hide settings
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Calendar UI */}
      <AnimatePresence>
        {showCalendar && (
          <motion.div
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -100, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="pointer-events-auto fixed left-4 top-1/2 z-[9999] w-80 -translate-y-1/2 rounded-xl bg-slate-800/95 p-4 shadow-2xl backdrop-blur-sm"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Select Date</h3>
              <button
                onClick={closeCalendar}
                className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-slate-700/50 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

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

            <div className="mb-4 flex items-center justify-between">
              <button
                onClick={handlePrevMonth}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-slate-700/50 hover:text-white"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="text-center text-sm font-semibold text-white">
                {monthNames[selectedDate.getMonth()]}{' '}
                {selectedDate.getFullYear()}
              </div>
              <button
                onClick={handleNextMonth}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-slate-700/50 hover:text-white"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {dayNames.map((day) => (
                <div
                  key={day}
                  className="py-2 text-center text-xs font-medium text-gray-400"
                >
                  {day}
                </div>
              ))}

              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}

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
