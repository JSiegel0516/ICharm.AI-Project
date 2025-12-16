"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Play, Pause } from "lucide-react";
import { useAppState } from "@/context/HeaderContext";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface TimeBarProps {
  selectedDate?: Date;
  onDateChange?: (date: Date) => void;
  onPlayPause?: (isPlaying: boolean) => void;
  playIntervalMs?: number;
  isPlaying?: boolean;
  className?: string;
}

const TimeBar: React.FC<TimeBarProps> = ({
  selectedDate = new Date(),
  onDateChange,
  onPlayPause,
  playIntervalMs = 500,
  isPlaying = false,
  className = "",
}) => {
  const { currentDataset } = useAppState();

  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState(0);
  const [previewDate, setPreviewDate] = useState(selectedDate);
  const [showCalendar, setShowCalendar] = useState(false);

  const sliderRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const rafRef = useRef<number | null>(null);

  // Get date range from current dataset, fallback to default range
  const minDate = useMemo(() => {
    if (currentDataset?.startDate) {
      return currentDataset.startDate;
    }
    return new Date(1979, 0, 1);
  }, [currentDataset]);

  const maxDate = useMemo(() => {
    if (currentDataset?.endDate) {
      return currentDataset.endDate;
    }
    return new Date();
  }, [currentDataset]);

  useEffect(() => {
    if (!isDragging) {
      setPreviewDate(selectedDate);
    }
  }, [selectedDate, isDragging]);

  const minMonthIndex = minDate.getFullYear() * 12 + minDate.getMonth();
  const maxMonthIndex = maxDate.getFullYear() * 12 + maxDate.getMonth();
  const minYear = minDate.getFullYear();
  const maxYear = maxDate.getFullYear();
  const monthRange = Math.max(1, maxMonthIndex - minMonthIndex);

  const getPositionFromMonthIndex = useCallback(
    (monthIndex: number) => ((monthIndex - minMonthIndex) / monthRange) * 100,
    [minMonthIndex, monthRange],
  );

  const getMonthIndexFromPosition = useCallback(
    (percentage: number) =>
      Math.round(minMonthIndex + (percentage / 100) * monthRange),
    [minMonthIndex, monthRange],
  );

  const formatDate = useCallback(
    (date: Date) => {
      const name = currentDataset?.name?.toLowerCase() ?? "";
      const backendName =
        currentDataset?.backend?.datasetName?.toLowerCase() ?? "";
      const isDaily =
        name.includes("cmorph") ||
        backendName.includes("cmorph") ||
        name.includes("cdr sst") ||
        backendName.includes("cdr sst");

      const options: Intl.DateTimeFormatOptions = {
        year: "numeric",
        month: "long",
      };

      if (isDaily) {
        options.day = "numeric";
      }

      return date.toLocaleDateString("en-US", options);
    },
    [currentDataset],
  );

  const setDate = useCallback(
    (date: Date) => {
      try {
        // Clamp date to valid range
        let clampedDate = date;
        if (date < minDate) {
          clampedDate = minDate;
        } else if (date > maxDate) {
          clampedDate = maxDate;
        }

        const newDate = new Date(
          clampedDate.getFullYear(),
          clampedDate.getMonth(),
          clampedDate.getDate(),
        );
        onDateChange?.(newDate);
      } catch (error) {
        console.error("Error setting date:", error);
      }
    },
    [minDate, maxDate, onDateChange],
  );

  const updateMonth = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

      rafRef.current = requestAnimationFrame(() => {
        if (!trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const percentage = Math.max(
          0,
          Math.min(100, ((clientX - rect.left) / rect.width) * 100),
        );
        const monthIndex = getMonthIndexFromPosition(percentage);

        const baseDate = isDragging ? previewDate : selectedDate;
        const tentative = new Date(
          Math.floor(monthIndex / 12),
          monthIndex % 12,
          baseDate.getDate(),
        );

        let clamped = tentative;
        if (tentative < minDate) clamped = minDate;
        if (tentative > maxDate) clamped = maxDate;

        setPreviewDate(clamped);
        setTooltipPosition(percentage);
        rafRef.current = null;
      });
    },
    [
      selectedDate,
      previewDate,
      isDragging,
      getMonthIndexFromPosition,
      minDate,
      maxDate,
    ],
  );

  const handleInteractionStart = useCallback(
    (clientX: number) => {
      setPreviewDate(selectedDate);
      setIsDragging(true);
      setShowTooltip(true);
      updateMonth(clientX);
    },
    [updateMonth, selectedDate],
  );

  const handleInteractionMove = useCallback(
    (clientX: number) => {
      if (isDragging) updateMonth(clientX);
    },
    [isDragging, updateMonth],
  );

  const handleInteractionEnd = useCallback(() => {
    setIsDragging(false);
    setDate(previewDate);
    setTimeout(() => setShowTooltip(false), 1500);
  }, [previewDate, setDate]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      handleInteractionStart(e.clientX);
    },
    [handleInteractionStart],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => handleInteractionMove(e.clientX),
    [handleInteractionMove],
  );

  const handleMouseUp = useCallback(
    () => handleInteractionEnd(),
    [handleInteractionEnd],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => handleInteractionStart(e.touches[0].clientX),
    [handleInteractionStart],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      e.preventDefault();
      handleInteractionMove(e.touches[0].clientX);
    },
    [handleInteractionMove],
  );

  const handleTouchEnd = useCallback(
    () => handleInteractionEnd(),
    [handleInteractionEnd],
  );

  const handlePlayPause = useCallback(() => {
    const newIsPlaying = !isPlaying;
    onPlayPause?.(newIsPlaying);
  }, [isPlaying, onPlayPause]);

  const handleCalendarSelect = useCallback(
    (date: Date | undefined) => {
      if (date) {
        setDate(date);
        setShowCalendar(false);
      }
    },
    [setDate],
  );

  useEffect(() => {
    if (isPlaying && !playIntervalRef.current) {
      playIntervalRef.current = setInterval(() => {
        const next = new Date(selectedDate);
        next.setMonth(selectedDate.getMonth() + 1);
        if (next > maxDate) {
          onPlayPause?.(false);
        } else {
          onDateChange?.(next);
        }
      }, playIntervalMs);
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
  }, [
    isPlaying,
    selectedDate,
    maxDate,
    onDateChange,
    onPlayPause,
    playIntervalMs,
  ]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("touchmove", handleTouchMove, {
        passive: false,
      });
      document.addEventListener("touchend", handleTouchEnd);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.removeEventListener("touchmove", handleTouchMove);
        document.removeEventListener("touchend", handleTouchEnd);
      };
    }
  }, [
    isDragging,
    handleMouseMove,
    handleMouseUp,
    handleTouchMove,
    handleTouchEnd,
  ]);

  const isActive = isHovered || isDragging || isPlaying;
  const displayDate = isDragging ? previewDate : selectedDate;
  const sliderPosition = getPositionFromMonthIndex(
    displayDate.getFullYear() * 12 + displayDate.getMonth(),
  );

  return (
    <div
      ref={sliderRef}
      className={`mx-auto w-full max-w-3xl px-32 ${className}`}
    >
      <div id="timebar" className="flex items-center justify-center gap-6">
        <div
          className="relative flex-1"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => !isDragging && setIsHovered(false)}
        >
          <div className="relative mb-2 flex items-center justify-center gap-2">
            <button
              onClick={handlePlayPause}
              className={`flex h-5 w-5 items-center justify-center rounded-full transition-all duration-200 hover:scale-110 focus:outline-none ${
                isPlaying || isActive
                  ? "border border-white/30 bg-white/20 text-white"
                  : "border border-gray-500/30 bg-gray-600/40 text-gray-400 hover:border-white/20 hover:bg-white/10 hover:text-white"
              }`}
              title={isPlaying ? "Pause" : "Play"}
              type="button"
              aria-label={isPlaying ? "Pause animation" : "Play animation"}
            >
              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
            </button>

            <Popover open={showCalendar} onOpenChange={setShowCalendar}>
              <PopoverTrigger asChild>
                <button
                  className={`group flex items-center gap-2 rounded-lg px-3 py-1 text-base font-medium transition-all duration-200 hover:bg-white/10 ${
                    isActive
                      ? "scale-105 text-white"
                      : "text-gray-200 hover:text-white"
                  }`}
                  title="Click to edit date"
                  type="button"
                  aria-label="Edit date"
                >
                  <span>{formatDate(displayDate)}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto border-0 p-0 shadow-none"
                align="center"
              >
                <Calendar
                  mode="single"
                  className="rounded-md border shadow-sm select-none"
                  selected={selectedDate}
                  onSelect={handleCalendarSelect}
                  defaultMonth={selectedDate}
                  disabled={(date) => date < minDate || date > maxDate}
                  autoFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div
            className={`relative h-1 touch-none ${
              isDragging ? "cursor-grabbing" : "cursor-grab"
            }`}
            ref={trackRef}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            role="slider"
            aria-label="Time slider"
            aria-valuenow={displayDate.getFullYear()}
            aria-valuemin={minYear}
            aria-valuemax={maxYear}
          >
            <div
              className={`absolute inset-0 rounded-full transition-all duration-200 ${
                isActive
                  ? "border border-white/30 bg-white/20"
                  : "border border-gray-500/20 bg-gray-600/30"
              }`}
            />
            <div
              className={`absolute top-0 left-0 h-full rounded-full transition-none ${
                isActive
                  ? "bg-linear-to-r from-white/70 to-white/50"
                  : "bg-linear-to-r from-gray-400/50 to-gray-500/40"
              }`}
              style={{ width: `${sliderPosition}%` }}
            />
            <div
              className={`pointer-events-none absolute top-1/2 h-2 w-2 -translate-y-1/2 transform rounded-full border-2 shadow-lg transition-none ${
                isDragging
                  ? "scale-125 border-white/90 bg-white"
                  : isActive
                    ? "scale-110 border-white/70 bg-white/90"
                    : "border-gray-400/50 bg-gray-400/70"
              }`}
              style={{ left: `calc(${sliderPosition}% - 4px)` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimeBar;
