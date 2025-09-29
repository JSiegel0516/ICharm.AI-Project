'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { TimeBarProps } from '@/types';

const TimeBar: React.FC<TimeBarProps> = ({
  selectedYear = new Date().getFullYear(),
  onYearChange,
  onPlayPause,
  className = '',
}) => {
  const [currentYear, setCurrentYear] = useState(selectedYear);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState(0);

  const sliderRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const minYear = 1979;
  const maxYear = new Date().getFullYear();
  const yearRange = maxYear - minYear;

  // Calculate position percentage from year
  const getPositionFromYear = (year: number) => {
    return ((year - minYear) / yearRange) * 100;
  };

  // Calculate year from position percentage
  const getYearFromPosition = (percentage: number) => {
    return Math.round(minYear + (percentage / 100) * yearRange);
  };

  // Handle mouse/touch events
  const handleInteractionStart = (clientX: number) => {
    if (!trackRef.current) return;

    setIsDragging(true);
    setShowTooltip(true);

    const rect = trackRef.current.getBoundingClientRect();
    const percentage = Math.max(
      0,
      Math.min(100, ((clientX - rect.left) / rect.width) * 100)
    );
    const newYear = getYearFromPosition(percentage);

    setCurrentYear(newYear);
    setTooltipPosition(percentage);
    onYearChange?.(newYear);
  };

  const handleInteractionMove = (clientX: number) => {
    if (!isDragging || !trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const percentage = Math.max(
      0,
      Math.min(100, ((clientX - rect.left) / rect.width) * 100)
    );
    const newYear = getYearFromPosition(percentage);

    setCurrentYear(newYear);
    setTooltipPosition(percentage);
    onYearChange?.(newYear);
  };

  const handleInteractionEnd = () => {
    if (isDragging) {
      setIsDragging(false);
      setTimeout(() => setShowTooltip(false), 1500);
    }
  };

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleInteractionStart(e.clientX);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      handleInteractionMove(e.clientX);
    }
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (isDragging) {
      handleInteractionEnd();
    }
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const touch = e.touches[0];
    handleInteractionStart(touch.clientX);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (isDragging) {
      e.preventDefault();
      const touch = e.touches[0];
      handleInteractionMove(touch.clientX);
    }
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (isDragging) {
      handleInteractionEnd();
    }
  };

  // Global event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove, {
        passive: false,
      });
      document.addEventListener('mouseup', handleMouseUp, { passive: false });
      document.addEventListener('touchmove', handleTouchMove, {
        passive: false,
      });
      document.addEventListener('touchend', handleTouchEnd, { passive: false });

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
  }, [isDragging]);

  // Cleanup effect
  useEffect(() => {
    document.body.style.userSelect = '';

    return () => {
      document.body.style.userSelect = '';
    };
  }, []);

  // Play/Pause functionality
  const handlePlayPause = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const newIsPlaying = !isPlaying;
    setIsPlaying(newIsPlaying);
    onPlayPause?.(newIsPlaying);

    if (newIsPlaying) {
      playIntervalRef.current = setInterval(() => {
        setCurrentYear((prevYear) => {
          const nextYear = prevYear + 1;
          if (nextYear > maxYear) {
            setIsPlaying(false);
            onPlayPause?.(false);
            return maxYear;
          }
          onYearChange?.(nextYear);
          return nextYear;
        });
      }, 500);
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.body.style.userSelect = '';
    };
  }, []);

  // Update position when currentYear changes
  useEffect(() => {
    if (!isDragging) {
      setTooltipPosition(getPositionFromYear(currentYear));
    }
  }, [currentYear, isDragging]);

  // Sync with external year changes
  useEffect(() => {
    setCurrentYear(selectedYear);
  }, [selectedYear]);

  const sliderPosition = getPositionFromYear(currentYear);
  const isActive = isDragging || isHovered || isPlaying;

  return (
    <div
      ref={sliderRef}
      className={`mx-auto w-full max-w-3xl px-32 ${className}`}
    >
      <div className="flex items-center justify-center gap-6">
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

        {/* Slider Container */}
        <div
          className="relative flex-1"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => {
            if (!isDragging) {
              setIsHovered(false);
            }
          }}
        >
          {/* Year Labels */}
          <div
            className={`mb-2 flex justify-between text-xs transition-colors duration-200 ${
              isActive ? 'text-white/90' : 'text-gray-500'
            }`}
          >
            <span>{minYear}</span>
            <span
              className={`text-base font-medium transition-all duration-200 ${
                isActive ? 'scale-110 text-white' : 'text-gray-400'
              }`}
            >
              {currentYear}
            </span>
            <span>{maxYear}</span>
          </div>

          {/* Track */}
          <div
            ref={trackRef}
            className={`relative h-1 cursor-pointer ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >
            {/* Background Track */}
            <div
              className={`absolute inset-0 rounded-full transition-all duration-200 ${
                isActive
                  ? 'border border-white/30 bg-white/20'
                  : 'border border-gray-500/20 bg-gray-600/30'
              }`}
            />

            {/* Progress Fill */}
            <div
              className={`absolute left-0 top-0 h-full rounded-full transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-white/70 to-white/50'
                  : 'bg-gradient-to-r from-gray-400/50 to-gray-500/40'
              }`}
              style={{ width: `${sliderPosition}%` }}
            />

            {/* Slider Handle */}
            <div
              className={`pointer-events-none absolute top-1/2 h-2 w-2 -translate-y-1/2 transform rounded-full border-2 shadow-lg transition-all duration-200 ${
                isDragging
                  ? 'scale-125 border-white/90 bg-white'
                  : isActive
                    ? 'scale-110 border-white/70 bg-white/90'
                    : 'border-gray-400/50 bg-gray-400/70'
              }`}
              style={{ left: `calc(${sliderPosition}% - 8px)` }}
            />

            {/* Tooltip */}
            {showTooltip && (
              <div
                className="pointer-events-none absolute -top-12 z-50 -translate-x-1/2 transform rounded bg-gray-800 px-3 py-1 text-sm text-white shadow-lg"
                style={{ left: `${tooltipPosition}%` }}
              >
                {currentYear}
                <div className="absolute left-1/2 top-full -translate-x-1/2 transform border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800" />
              </div>
            )}

            {/* Tick Marks for Decades */}
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