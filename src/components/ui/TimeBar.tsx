"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { CalendarIcon } from "lucide-react";
import { useAppState } from "@/context/HeaderContext";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { SearchIcon } from "lucide-react";

interface TimeBarProps {
  selectedDate?: Date;
  onDateChange?: (date: Date) => void;
  onPlayPause?: (isPlaying: boolean) => void;
  playIntervalMs?: number;
  isPlaying?: boolean;
  className?: string;
  disableAutoplay?: boolean;
  disablePlayButton?: boolean;
}

const formatDateDisplay = (date: Date, includeDay: boolean): string => {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
  };
  if (includeDay) {
    options.day = "numeric";
  }
  return date.toLocaleDateString("en-US", options);
};

const TimeBar: React.FC<TimeBarProps> = ({
  selectedDate = new Date(),
  onDateChange,
  onPlayPause,
  playIntervalMs = 500,
  isPlaying = false,
  className = "",
  disableAutoplay = false,
  disablePlayButton = false,
}) => {
  const { currentDataset } = useAppState();

  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState(0);
  const [previewDate, setPreviewDate] = useState(selectedDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dateInputValue, setDateInputValue] = useState("");

  const sliderRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const rafRef = useRef<number | null>(null);

  // Determine if dataset uses daily granularity
  const isDailyDataset = useMemo(() => {
    const name = currentDataset?.name?.toLowerCase() ?? "";
    return name.includes("cmorph") || name.includes("cdr sst");
  }, [currentDataset]);

  // Date range from current dataset
  const minDate = useMemo(() => {
    return currentDataset?.startDate ?? new Date(1979, 0, 1);
  }, [currentDataset]);

  const maxDate = useMemo(() => {
    return currentDataset?.endDate ?? new Date();
  }, [currentDataset]);

  // Keep input value in sync with selectedDate when not actively editing
  useEffect(() => {
    setDateInputValue(formatDateDisplay(selectedDate, isDailyDataset));
  }, [selectedDate, isDailyDataset]);

  useEffect(() => {
    if (!isDragging) {
      setPreviewDate(selectedDate);
    }
  }, [selectedDate, isDragging]);

  // Slider math
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

  const clampDate = useCallback(
    (date: Date): Date => {
      if (date < minDate) return minDate;
      if (date > maxDate) return maxDate;
      return date;
    },
    [minDate, maxDate],
  );

  const commitDate = useCallback(
    (date: Date) => {
      const clamped = clampDate(date);
      const normalized = new Date(
        clamped.getFullYear(),
        clamped.getMonth(),
        clamped.getDate(),
      );
      onDateChange?.(normalized);
    },
    [clampDate, onDateChange],
  );

  // Parse a user-typed date string and commit it
  const commitDateFromInput = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setDateInputValue(formatDateDisplay(selectedDate, isDailyDataset));
        return;
      }

      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) {
        // Invalid input -- revert
        setDateInputValue(formatDateDisplay(selectedDate, isDailyDataset));
        return;
      }

      // For monthly datasets, snap to the 1st of the month
      if (!isDailyDataset) {
        parsed.setDate(1);
      }

      commitDate(parsed);
    },
    [selectedDate, isDailyDataset, commitDate],
  );

  // Slider interaction
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

        const clamped = clampDate(tentative);

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
      clampDate,
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
    commitDate(previewDate);
    setTimeout(() => setShowTooltip(false), 1500);
  }, [previewDate, commitDate]);

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
    if (disablePlayButton) return;
    onPlayPause?.(!isPlaying);
  }, [disablePlayButton, isPlaying, onPlayPause]);

  const handleCalendarSelect = useCallback(
    (date: Date | undefined) => {
      if (date) {
        commitDate(date);
        setCalendarOpen(false);
      }
    },
    [commitDate],
  );

  // Autoplay effect
  useEffect(() => {
    if (!disableAutoplay && isPlaying && !playIntervalRef.current) {
      playIntervalRef.current = setInterval(() => {
        const next = new Date(selectedDate);
        next.setMonth(selectedDate.getMonth() + 1);
        if (next > maxDate) {
          onPlayPause?.(false);
        } else {
          onDateChange?.(next);
        }
      }, playIntervalMs);
    } else if ((!isPlaying || disableAutoplay) && playIntervalRef.current) {
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
    disableAutoplay,
  ]);

  // Global drag listeners
  useEffect(() => {
    if (!isDragging) return;

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
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
          {/* Controls row: play button + date input */}
          <div className="relative mb-2 flex items-center justify-center gap-2">
            <Field className="mx-auto w-42">
              <InputGroup>
                <InputGroupInput
                  id="date-input"
                  value={dateInputValue}
                  placeholder={isDailyDataset ? "Jan 15, 2020" : "January 2020"}
                  onChange={(e) => setDateInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitDateFromInput(dateInputValue);
                      (e.target as HTMLInputElement).blur();
                    }
                    if (e.key === "Escape") {
                      setCalendarOpen(false);
                    }
                  }}
                  onBlur={() => commitDateFromInput(dateInputValue)}
                />
                <InputGroupAddon align="inline-end">
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <InputGroupButton
                        id="date-picker"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Select date"
                      >
                        <CalendarIcon />
                      </InputGroupButton>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto overflow-hidden p-0"
                      align="end"
                      alignOffset={-8}
                      sideOffset={10}
                    >
                      <Calendar
                        mode="single"
                        captionLayout="dropdown"
                        className="rounded-md border shadow-sm select-none"
                        selected={selectedDate}
                        onSelect={handleCalendarSelect}
                        defaultMonth={selectedDate}
                        disabled={(date) => date < minDate || date > maxDate}
                        autoFocus
                      />
                    </PopoverContent>
                  </Popover>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </div>

          {/* Slider track */}
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
