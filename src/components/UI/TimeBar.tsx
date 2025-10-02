'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Calendar } from 'lucide-react';
import { TimeBarProps } from '@/types';

const TimeBar: React.FC<TimeBarProps> = ({
  selectedYear = new Date().getFullYear(),
  onYearChange,
  onPlayPause,
  className = '',
}) => {
  const [currentDate, setCurrentDate] = useState(new Date(selectedYear, 0, 1));
  const [isPlaying, setIsPlaying] = useState(false);
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
  const lastYearRef = useRef(currentDate.getFullYear());
  const rafRef = useRef<number | null>(null);

  const minYear = 1979;
  const maxYear = new Date().getFullYear();
  const yearRange = maxYear - minYear;

  // FIX: Memoize these functions with useMemo instead of useCallback to prevent recreation
  const getPositionFromYear = useCallback(
    (year: number) => {
      return ((year - minYear) / yearRange) * 100;
    },
    [minYear, yearRange]
  );

  const getYearFromPosition = useCallback(
    (percentage: number) => {
      return Math.round(minYear + (percentage / 100) * yearRange);
    },
    [minYear, yearRange]
  );

  const formatDate = useCallback((date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  const formatDateForInput = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const parseDateInput = useCallback((input: string): Date | null => {
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
  }, []);

  const updateYear = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return;

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        if (!trackRef.current) return;

        const rect = trackRef.current.getBoundingClientRect();
        const percentage = Math.max(
          0,
          Math.min(100, ((clientX - rect.left) / rect.width) * 100)
        );
        const newYear = getYearFromPosition(percentage);

        if (newYear !== lastYearRef.current) {
          lastYearRef.current = newYear;
          const newDate = new Date(
            newYear,
            currentDate.getMonth(),
            currentDate.getDate()
          );
          setCurrentDate(newDate);
          setTooltipPosition(percentage);
          onYearChange?.(newYear);
        }

        rafRef.current = null;
      });
    },
    [getYearFromPosition, onYearChange, currentDate]
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
      if (isDragging) {
        updateYear(clientX);
      }
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
      e.stopPropagation();
      handleInteractionStart(e.clientX);
    },
    [handleInteractionStart]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      handleInteractionMove(e.clientX);
    },
    [handleInteractionMove]
  );

  const handleMouseUp = useCallback(() => {
    handleInteractionEnd();
  }, [handleInteractionEnd]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const touch = e.touches[0];
      handleInteractionStart(touch.clientX);
    },
    [handleInteractionStart]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handleInteractionMove(touch.clientX);
    },
    [handleInteractionMove]
  );

  const handleTouchEnd = useCallback(() => {
    handleInteractionEnd();
  }, [handleInteractionEnd]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, {
        passive: false,
      });
      document.addEventListener('touchend', handleTouchEnd);

      if (sliderRef.current) {
        sliderRef.current.style.userSelect = 'none';
      }
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);

      if (sliderRef.current) {
        sliderRef.current.style.userSelect = '';
      }
    };
  }, [
    isDragging,
    handleMouseMove,
    handleMouseUp,
    handleTouchMove,
    handleTouchEnd,
  ]);

  const handlePlayPause = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const newIsPlaying = !isPlaying;
      setIsPlaying(newIsPlaying);
      onPlayPause?.(newIsPlaying);

      if (newIsPlaying) {
        playIntervalRef.current = setInterval(() => {
          setCurrentDate((prevDate) => {
            const nextDate = new Date(prevDate);
            nextDate.setFullYear(prevDate.getFullYear() + 1);

            if (nextDate.getFullYear() > maxYear) {
              setIsPlaying(false);
              onPlayPause?.(false);
              return new Date(maxYear, prevDate.getMonth(), prevDate.getDate());
            }

            lastYearRef.current = nextDate.getFullYear();
            onYearChange?.(nextDate.getFullYear());
            return nextDate;
          });
        }, 500);
      } else {
        if (playIntervalRef.current) {
          clearInterval(playIntervalRef.current);
          playIntervalRef.current = null;
        }
      }
    },
    [isPlaying, maxYear, onPlayPause, onYearChange]
  );

  const handleDateClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsEditing(true);
      setShowCalendar(true);
      setDateInput(formatDateForInput(currentDate));
    },
    [currentDate, formatDateForInput]
  );

  const handleCalendarClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setShowCalendar(!showCalendar);
    },
    [showCalendar]
  );

  const handleDateInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDateInput(e.target.value);
    },
    []
  );

  const handleDateSubmit = useCallback(() => {
    if (dateInput.trim()) {
      const parsedDate = parseDateInput(dateInput);
      if (parsedDate) {
        const year = parsedDate.getFullYear();
        const clampedYear = Math.max(minYear, Math.min(maxYear, year));
        const newDate = new Date(
          clampedYear,
          parsedDate.getMonth(),
          parsedDate.getDate()
        );

        setCurrentDate(newDate);
        lastYearRef.current = clampedYear;
        onYearChange?.(clampedYear);
      }
    }
    setIsEditing(false);
    setShowCalendar(false);
    setDateInput('');
  }, [dateInput, parseDateInput, minYear, maxYear, onYearChange]);

  const handleDateInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleDateSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsEditing(false);
        setShowCalendar(false);
        setDateInput('');
      }
    },
    [handleDateSubmit]
  );

  const handleDateInputBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      if (calendarRef.current?.contains(e.relatedTarget as Node)) {
        return;
      }
      setTimeout(() => {
        handleDateSubmit();
      }, 150);
    },
    [handleDateSubmit]
  );

  const handleCalendarDateSelect = useCallback(
    (date: Date) => {
      const year = date.getFullYear();
      const clampedYear = Math.max(minYear, Math.min(maxYear, year));
      const newDate = new Date(clampedYear, date.getMonth(), date.getDate());

      setCurrentDate(newDate);
      lastYearRef.current = clampedYear;
      onYearChange?.(clampedYear);
      setIsEditing(false);
      setShowCalendar(false);
      setDateInput('');
    },
    [minYear, maxYear, onYearChange]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(event.target as Node) &&
        dateInputRef.current &&
        !dateInputRef.current.contains(event.target as Node)
      ) {
        handleDateSubmit();
      }
    };

    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCalendar, handleDateSubmit]);

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

  // FIX: Only update tooltip position when not dragging and year changes
  useEffect(() => {
    if (!isDragging) {
      const year = currentDate.getFullYear();
      const position = ((year - minYear) / yearRange) * 100;
      setTooltipPosition(position);
    }
  }, [currentDate.getFullYear(), isDragging, minYear, yearRange]);

  useEffect(() => {
    const newDate = new Date(
      selectedYear,
      currentDate.getMonth(),
      currentDate.getDate()
    );
    setCurrentDate(newDate);
    lastYearRef.current = selectedYear;
  }, [selectedYear]);

  const sliderPosition = getPositionFromYear(currentDate.getFullYear());
  const isActive = isDragging || isHovered || isPlaying;

  const renderCalendar = () => {
    const today = new Date();
    const currentMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );

    const getDaysInMonth = (date: Date) => {
      const year = date.getFullYear();
      const month = date.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      return { firstDay, daysInMonth };
    };

    const { firstDay, daysInMonth } = getDaysInMonth(currentMonth);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const handlePrevMonth = () => {
      const newDate = new Date(currentMonth);
      newDate.setMonth(newDate.getMonth() - 1);
      setCurrentDate(newDate);
    };

    const handleNextMonth = () => {
      const newDate = new Date(currentMonth);
      newDate.setMonth(newDate.getMonth() + 1);
      setCurrentDate(newDate);
    };

    const handleDateClick = (day: number) => {
      const selectedDate = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth(),
        day
      );
      handleCalendarDateSelect(selectedDate);
    };

    return (
      <div
        ref={calendarRef}
        className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 transform rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={handlePrevMonth}
            className="rounded p-1 text-gray-300 hover:bg-gray-700 hover:text-white"
          >
            ‹
          </button>
          <div className="font-medium text-white">
            {currentMonth.toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric',
            })}
          </div>
          <button
            onClick={handleNextMonth}
            className="rounded p-1 text-gray-300 hover:bg-gray-700 hover:text-white"
          >
            ›
          </button>
        </div>

        <div className="mb-2 grid grid-cols-7 gap-1">
          {dayNames.map((day) => (
            <div
              key={day}
              className="py-1 text-center text-xs font-medium text-gray-400"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const date = new Date(
              currentMonth.getFullYear(),
              currentMonth.getMonth(),
              day
            );
            const isSelected =
              currentDate.toDateString() === date.toDateString();
            const isToday = today.toDateString() === date.toDateString();
            const isValidYear =
              date.getFullYear() >= minYear && date.getFullYear() <= maxYear;

            return (
              <button
                key={day}
                onClick={() => handleDateClick(day)}
                disabled={!isValidYear}
                className={`h-8 rounded text-sm transition-colors ${
                  isSelected
                    ? 'bg-blue-500 text-white'
                    : isToday
                      ? 'bg-gray-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                } ${!isValidYear ? 'cursor-not-allowed opacity-30' : ''} `}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={sliderRef}
      className={`mx-auto w-full max-w-3xl px-32 ${className}`}
    >
      <div id="timebar" className="flex items-center justify-center gap-6">
        {/* Play/Pause Button */}
        <button
          onClick={handlePlayPause}
          className={`flex h-5 w-5 items-center justify-center rounded-full transition-all duration-200 hover:scale-110 focus:outline-none ${
            isPlaying || isActive
              ? 'border border-white/30 bg-white/20 text-white'
              : 'border border-gray-500/30 bg-gray-600/40 text-gray-400 hover:border-white/20 hover:bg-white/10 hover:text-white'
          }`}
          title={isPlaying ? 'Pause' : 'Play'}
          type="button"
        >
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
        </button>

        <div
          className="relative flex-1"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => {
            if (!isDragging) {
              setIsHovered(false);
            }
          }}
        >
          <div className="relative mb-2 flex items-center justify-center gap-2">
            {isEditing ? (
              <div className="relative">
                <div className="flex items-center gap-2">
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={dateInput}
                    onChange={handleDateInputChange}
                    onKeyDown={handleDateInputKeyDown}
                    onBlur={handleDateInputBlur}
                    min={`${minYear}-01-01`}
                    max={`${maxYear}-12-31`}
                    className="rounded bg-gray-700 px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="YYYY-MM-DD"
                  />
                  <button
                    onClick={handleCalendarClick}
                    className="rounded p-1 text-gray-300 hover:bg-gray-600 hover:text-white"
                    title="Toggle calendar"
                    type="button"
                  >
                    <Calendar size={16} />
                  </button>
                </div>

                {showCalendar && renderCalendar()}
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
              >
                <Calendar size={16} className="opacity-70" />
                <span>{formatDate(currentDate)}</span>
              </button>
            )}
          </div>

          <div
            className={`mb-2 flex justify-between text-xs transition-colors duration-200 ${
              isActive ? 'text-white/90' : 'text-gray-500'
            }`}
          >
            <span>{minYear}</span>
            <span>{maxYear}</span>
          </div>

          <div
            ref={trackRef}
            className={`relative h-1 cursor-pointer touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >
            <div
              className={`absolute inset-0 rounded-full transition-all duration-200 ${
                isActive
                  ? 'border border-white/30 bg-white/20'
                  : 'border border-gray-500/20 bg-gray-600/30'
              }`}
            />

            <div
              className={`absolute left-0 top-0 h-full rounded-full transition-none ${
                isActive
                  ? 'bg-gradient-to-r from-white/70 to-white/50'
                  : 'bg-gradient-to-r from-gray-400/50 to-gray-500/40'
              }`}
              style={{
                width: `${sliderPosition}%`,
                willChange: isDragging ? 'width' : 'auto',
              }}
            />

            <div
              className={`pointer-events-none absolute top-1/2 h-2 w-2 -translate-y-1/2 transform rounded-full border-2 shadow-lg transition-none ${
                isDragging
                  ? 'scale-125 border-white/90 bg-white'
                  : isActive
                    ? 'scale-110 border-white/70 bg-white/90'
                    : 'border-gray-400/50 bg-gray-400/70'
              }`}
              style={{
                left: `calc(${sliderPosition}% - 8px)`,
                willChange: isDragging ? 'left' : 'auto',
              }}
            />

            {showTooltip && (
              <div
                className="pointer-events-none absolute -top-12 z-50 -translate-x-1/2 transform rounded bg-gray-800 px-3 py-1 text-sm text-white shadow-lg"
                style={{
                  left: `${tooltipPosition}%`,
                  willChange: isDragging ? 'left' : 'auto',
                }}
              >
                {formatDate(currentDate)}
                <div className="absolute left-1/2 top-full -translate-x-1/2 transform border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800" />
              </div>
            )}

            <div className="pointer-events-none absolute top-0 h-2 w-full">
              {Array.from(
                { length: Math.floor(yearRange / 10) + 1 },
                (_, i) => {
                  const year = minYear + i * 10;
                  if (year > maxYear) return null;
                  const position = getPositionFromYear(year);
                  return (
                    <div
                      key={year}
                      className={`absolute h-full w-px transition-colors duration-200 ${
                        isActive ? 'bg-white/40' : 'bg-gray-500/30'
                      }`}
                      style={{ left: `${position}%` }}
                    />
                  );
                }
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimeBar;
