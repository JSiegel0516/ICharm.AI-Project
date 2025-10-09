'use client';

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { Play, Pause } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';

interface TimeBarProps {
  selectedDate?: Date;
  onDateChange?: (date: Date) => void;
  onPlayPause?: (isPlaying: boolean) => void;
  isPlaying?: boolean;
  className?: string;
}

const TimeBar: React.FC<TimeBarProps> = ({
  selectedDate = new Date(),
  onDateChange,
  onPlayPause,
  isPlaying = false,
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [dateInput, setDateInput] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);

  const sliderRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const rafRef = useRef<number | null>(null);

  const minYear = 1979;
  const maxYear = new Date().getFullYear();
  const yearRange = maxYear - minYear;

  const getPositionFromYear = useCallback(
    (year: number) => ((year - minYear) / yearRange) * 100,
    [minYear, yearRange]
  );

  const getYearFromPosition = useCallback(
    (percentage: number) =>
      Math.round(minYear + (percentage / 100) * yearRange),
    [minYear, yearRange]
  );

  const formatDate = useCallback(
    (date: Date) =>
      date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    []
  );

  const formatDateForInput = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const parseDateInput = useCallback((input: string): Date | null => {
    try {
      const parts = input.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          const date = new Date(year, month, day);
          if (
            date.getFullYear() === year &&
            date.getMonth() === month &&
            date.getDate() === day
          ) {
            return date;
          }
        }
      }
      const parsed = new Date(input);
      return !isNaN(parsed.getTime()) ? parsed : null;
    } catch (error) {
      console.error('Error parsing date input:', error);
      return null;
    }
  }, []);

  const setDate = useCallback(
    (date: Date) => {
      try {
        const clampedYear = Math.max(
          minYear,
          Math.min(maxYear, date.getFullYear())
        );
        const newDate = new Date(clampedYear, date.getMonth(), date.getDate());
        onDateChange?.(newDate);
      } catch (error) {
        console.error('Error setting date:', error);
      }
    },
    [minYear, maxYear, onDateChange]
  );

  const updateYear = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

      rafRef.current = requestAnimationFrame(() => {
        if (!trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const percentage = Math.max(
          0,
          Math.min(100, ((clientX - rect.left) / rect.width) * 100)
        );
        const newYear = getYearFromPosition(percentage);
        const newDate = new Date(
          newYear,
          selectedDate.getMonth(),
          selectedDate.getDate()
        );
        setDate(newDate);
        setTooltipPosition(percentage);
        rafRef.current = null;
      });
    },
    [selectedDate, getYearFromPosition, setDate]
  );

  const handleInteractionStart = useCallback(
    (clientX: number) => {
      setIsDragging(true);
      setShowTooltip(true);
      updateYear(clientX);
    },
    [updateYear]
  );

  const handleInteractionMove = useCallback(
    (clientX: number) => {
      if (isDragging) updateYear(clientX);
    },
    [isDragging, updateYear]
  );

  const handleInteractionEnd = useCallback(() => {
    setIsDragging(false);
    setTimeout(() => setShowTooltip(false), 1500);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      handleInteractionStart(e.clientX);
    },
    [handleInteractionStart]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => handleInteractionMove(e.clientX),
    [handleInteractionMove]
  );

  const handleMouseUp = useCallback(
    () => handleInteractionEnd(),
    [handleInteractionEnd]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => handleInteractionStart(e.touches[0].clientX),
    [handleInteractionStart]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      e.preventDefault();
      handleInteractionMove(e.touches[0].clientX);
    },
    [handleInteractionMove]
  );

  const handleTouchEnd = useCallback(
    () => handleInteractionEnd(),
    [handleInteractionEnd]
  );

  const handlePlayPause = useCallback(() => {
    const newIsPlaying = !isPlaying;
    onPlayPause?.(newIsPlaying);
  }, [isPlaying, onPlayPause]);

  useEffect(() => {
    if (isPlaying && !playIntervalRef.current) {
      playIntervalRef.current = setInterval(() => {
        const next = new Date(selectedDate);
        next.setFullYear(selectedDate.getFullYear() + 1);
        if (next.getFullYear() > maxYear) {
          onPlayPause?.(false);
        } else {
          onDateChange?.(next);
        }
      }, 500);
    } else if (!isPlaying && playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [isPlaying, selectedDate, maxYear, onDateChange, onPlayPause]);

  // Update dateInput when selectedDate changes externally
  useEffect(() => {
    if (isEditing) {
      setDateInput(formatDateForInput(selectedDate));
    }
  }, [selectedDate, isEditing, formatDateForInput]);

  const handleDateClick = useCallback(() => {
    setIsEditing(true);
    setShowCalendar(true);
    setDateInput(formatDateForInput(selectedDate));
    setTimeout(() => dateInputRef.current?.focus(), 0);
  }, [selectedDate, formatDateForInput]);

  const handleCalendarDateSelect = useCallback(
    (date: Date) => {
      setDate(date);
      setIsEditing(false);
      setShowCalendar(false);
      setDateInput('');
    },
    [setDate]
  );

  const handleDateSubmit = useCallback(() => {
    const parsed = parseDateInput(dateInput);
    if (parsed) {
      setDate(parsed);
    }
    setIsEditing(false);
    setShowCalendar(false);
    setDateInput('');
  }, [dateInput, parseDateInput, setDate]);

  const handleDateInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleDateSubmit();
      if (e.key === 'Escape') {
        setIsEditing(false);
        setShowCalendar(false);
        setDateInput('');
      }
    },
    [handleDateSubmit]
  );

  const handleCalendarClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleCalendarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        showCalendar &&
        calendarRef.current &&
        !calendarRef.current.contains(e.target as Node) &&
        dateInputRef.current &&
        !dateInputRef.current.contains(e.target as Node)
      ) {
        setShowCalendar(false);
        setIsEditing(false);
        setDateInput('');
      }
    };

    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCalendar]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, {
        passive: false,
      });
      document.addEventListener('touchend', handleTouchEnd);
      if (sliderRef.current) sliderRef.current.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      if (sliderRef.current) sliderRef.current.style.userSelect = '';
    };
  }, [
    isDragging,
    handleMouseMove,
    handleMouseUp,
    handleTouchMove,
    handleTouchEnd,
  ]);

  useEffect(() => {
    if (!isDragging)
      setTooltipPosition(getPositionFromYear(selectedDate.getFullYear()));
  }, [selectedDate, isDragging, getPositionFromYear]);

  useEffect(() => {
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const calendarData = useMemo(() => {
    const today = new Date();
    const currentMonth = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      1
    );
    const firstDay = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      1
    ).getDay();
    const daysInMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + 1,
      0
    ).getDate();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return { today, currentMonth, firstDay, daysInMonth, dayNames };
  }, [selectedDate]);

  const calendarDays = useMemo(
    () => Array.from({ length: calendarData.daysInMonth }, (_, i) => i + 1),
    [calendarData.daysInMonth]
  );

  const emptyDays = useMemo(
    () => Array.from({ length: calendarData.firstDay }, (_, i) => i),
    [calendarData.firstDay]
  );

  const sliderPosition = getPositionFromYear(selectedDate.getFullYear());
  const isActive = isDragging || isHovered || isPlaying;

  const handlePrevMonth = useCallback(() => {
    const newDate = new Date(
      calendarData.currentMonth.getFullYear(),
      calendarData.currentMonth.getMonth() - 1,
      selectedDate.getDate()
    );
    setDate(newDate);
  }, [calendarData.currentMonth, selectedDate, setDate]);

  const handleNextMonth = useCallback(() => {
    const newDate = new Date(
      calendarData.currentMonth.getFullYear(),
      calendarData.currentMonth.getMonth() + 1,
      selectedDate.getDate()
    );
    setDate(newDate);
  }, [calendarData.currentMonth, selectedDate, setDate]);

  return (
    <div
      ref={sliderRef}
      className={`mx-auto w-full max-w-3xl px-32 ${className}`}
    >
      <div id="timebar" className="flex items-center justify-center gap-6">
        <button
          onClick={handlePlayPause}
          className={`flex h-5 w-5 items-center justify-center rounded-full transition-all duration-200 hover:scale-110 focus:outline-none ${
            isPlaying || isActive
              ? 'border border-white/30 bg-white/20 text-white'
              : 'border border-gray-500/30 bg-gray-600/40 text-gray-400 hover:border-white/20 hover:bg-white/10 hover:text-white'
          }`}
          title={isPlaying ? 'Pause' : 'Play'}
          type="button"
          aria-label={isPlaying ? 'Pause animation' : 'Play animation'}
        >
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
        </button>

        <div
          className="relative flex-1"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => !isDragging && setIsHovered(false)}
        >
          <div className="relative mb-2 flex items-center justify-center gap-2">
            {isEditing ? (
              <div className="relative flex items-center gap-2">
                <input
                  ref={dateInputRef}
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  onKeyDown={handleDateInputKeyDown}
                  onBlur={handleDateSubmit}
                  min={`${minYear}-01-01`}
                  max={`${maxYear}-12-31`}
                  className="rounded bg-gray-700 px-2 py-1 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  aria-label="Select date"
                />

                <AnimatePresence>
                  {showCalendar && (
                    <div
                      ref={calendarRef}
                      onClick={handleCalendarClick}
                      onMouseDown={handleCalendarMouseDown}
                      className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 transform rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl"
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handlePrevMonth();
                          }}
                          className="rounded p-1 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                          aria-label="Previous month"
                        >
                          ‹
                        </button>
                        <div className="font-medium text-white">
                          {calendarData.currentMonth.toLocaleDateString(
                            'en-US',
                            {
                              month: 'long',
                              year: 'numeric',
                            }
                          )}
                        </div>
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleNextMonth();
                          }}
                          className="rounded p-1 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                          aria-label="Next month"
                        >
                          ›
                        </button>
                      </div>

                      <div className="mb-2 grid grid-cols-7 gap-1">
                        {calendarData.dayNames.map((day) => (
                          <div
                            key={day}
                            className="py-1 text-center text-xs font-medium text-gray-400"
                          >
                            {day}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-7 gap-1">
                        {emptyDays.map((index) => (
                          <div key={`empty-${index}`} />
                        ))}
                        {calendarDays.map((day) => {
                          const date = new Date(
                            calendarData.currentMonth.getFullYear(),
                            calendarData.currentMonth.getMonth(),
                            day
                          );
                          const isSelected =
                            selectedDate.toDateString() === date.toDateString();
                          const isToday =
                            calendarData.today.toDateString() ===
                            date.toDateString();
                          const isValidYear =
                            date.getFullYear() >= minYear &&
                            date.getFullYear() <= maxYear;

                          return (
                            <button
                              key={day}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleCalendarDateSelect(date);
                              }}
                              disabled={!isValidYear}
                              className={`h-8 rounded text-sm transition-colors ${
                                isSelected
                                  ? 'bg-blue-500 text-white'
                                  : isToday
                                    ? 'bg-gray-600 text-white'
                                    : 'text-gray-300 hover:bg-gray-700'
                              } ${!isValidYear ? 'cursor-not-allowed opacity-30' : ''}`}
                              aria-label={`Select ${date.toLocaleDateString(
                                'en-US',
                                {
                                  month: 'long',
                                  day: 'numeric',
                                  year: 'numeric',
                                }
                              )}`}
                              aria-selected={isSelected}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button
                onClick={handleDateClick}
                className={`group flex items-center gap-2 rounded-lg px-3 py-1 text-base font-medium transition-all duration-200 hover:bg-white/10 ${
                  isActive
                    ? 'scale-105 text-white'
                    : 'text-gray-200 hover:text-white'
                }`}
                title="Click to edit date"
                type="button"
                aria-label="Edit date"
              >
                <span>{formatDate(selectedDate)}</span>
              </button>
            )}
          </div>

          <div
            className={`relative h-1 touch-none ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            ref={trackRef}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            role="slider"
            aria-label="Time slider"
            aria-valuenow={selectedDate.getFullYear()}
            aria-valuemin={minYear}
            aria-valuemax={maxYear}
          >
            <div
              className={`absolute inset-0 rounded-full transition-all duration-200 ${
                isActive
                  ? 'border border-white/30 bg-white/20'
                  : 'border border-gray-500/20 bg-gray-600/30'
              }`}
            />
            <div
              className={`absolute top-0 left-0 h-full rounded-full transition-none ${
                isActive
                  ? 'bg-linear-to-r from-white/70 to-white/50'
                  : 'bg-linear-to-r from-gray-400/50 to-gray-500/40'
              }`}
              style={{ width: `${sliderPosition}%` }}
            />
            <div
              className={`pointer-events-none absolute top-1/2 h-2 w-2 -translate-y-1/2 transform rounded-full border-2 shadow-lg transition-none ${
                isDragging
                  ? 'scale-125 border-white/90 bg-white'
                  : isActive
                    ? 'scale-110 border-white/70 bg-white/90'
                    : 'border-gray-400/50 bg-gray-400/70'
              }`}
              style={{ left: `calc(${sliderPosition}% - 8px)` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimeBar;
