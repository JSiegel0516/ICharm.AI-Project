'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

interface DateSelectorProps {
  selectedDate?: Date;
  onDateChange?: (date: Date) => void;
  className?: string;
}

const DateSelector: React.FC<DateSelectorProps> = ({
  selectedDate = new Date(),
  onDateChange,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(selectedDate);
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Get days in month
  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // Get first day of month (0 = Sunday)
  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  // Generate calendar days
  const generateCalendarDays = () => {
    const daysInMonth = getDaysInMonth(viewMonth, viewYear);
    const firstDay = getFirstDayOfMonth(viewMonth, viewYear);
    const days = [];

    // Previous month's trailing days
    const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
    const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    const daysInPrevMonth = getDaysInMonth(prevMonth, prevYear);
    
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({
        day: daysInPrevMonth - i,
        isCurrentMonth: false,
        date: new Date(prevYear, prevMonth, daysInPrevMonth - i)
      });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({
        day,
        isCurrentMonth: true,
        date: new Date(viewYear, viewMonth, day)
      });
    }

    // Next month's leading days
    const remainingDays = 42 - days.length; // 6 rows × 7 days
    const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
    
    for (let day = 1; day <= remainingDays; day++) {
      days.push({
        day,
        isCurrentMonth: false,
        date: new Date(nextYear, nextMonth, day)
      });
    }

    return days;
  };

  // Handle date selection
  const handleDateSelect = (date: Date) => {
    setCurrentDate(date);
    setIsOpen(false);
    onDateChange?.(date);
  };

  // Handle month/year navigation
  const navigateMonth = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      if (viewMonth === 0) {
        setViewMonth(11);
        setViewYear(viewYear - 1);
      } else {
        setViewMonth(viewMonth - 1);
      }
    } else {
      if (viewMonth === 11) {
        setViewMonth(0);
        setViewYear(viewYear + 1);
      } else {
        setViewMonth(viewMonth + 1);
      }
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !buttonRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check if date is today
  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Check if date is selected
  const isSelected = (date: Date) => {
    return date.toDateString() === currentDate.toDateString();
  };

  const calendarDays = generateCalendarDays();

  return (
    <div className={`relative ${className}`}>
      {/* Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all duration-200 hover:scale-105 focus:outline-none ${
          isOpen
            ? 'border-white/30 bg-white/20 text-white'
            : 'border-gray-500/30 bg-gray-600/40 text-gray-400 hover:border-white/20 hover:bg-white/10 hover:text-white'
        }`}
        title="Select Date"
        type="button"
      >
        <Calendar size={14} />
        <span className="min-w-[80px] text-left">
          {currentDate.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric'
          })}
        </span>
        <ChevronDown 
          size={14} 
          className={`transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`} 
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 z-50 mb-2 w-80 rounded-xl border border-white/20 bg-gray-800/95 p-4 shadow-2xl backdrop-blur-md"
          style={{
            transform: 'translateY(-8px)',
          }}
        >
          {/* Header with month/year navigation */}
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => navigateMonth('prev')}
              className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white"
              type="button"
            >
              <ChevronDown className="rotate-90" size={16} />
            </button>
            
            <h3 className="text-lg font-semibold text-white">
              {months[viewMonth]} {viewYear}
            </h3>
            
            <button
              onClick={() => navigateMonth('next')}
              className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white"
              type="button"
            >
              <ChevronDown className="-rotate-90" size={16} />
            </button>
          </div>

          {/* Days of week header */}
          <div className="mb-2 grid grid-cols-7 gap-1">
            {daysOfWeek.map((day) => (
              <div
                key={day}
                className="p-2 text-center text-xs font-medium text-gray-400"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((dayInfo, index) => (
              <button
                key={index}
                onClick={() => handleDateSelect(dayInfo.date)}
                className={`rounded-lg p-2 text-sm transition-all duration-200 hover:scale-105 focus:outline-none ${
                  !dayInfo.isCurrentMonth
                    ? 'text-gray-600 hover:bg-white/5 hover:text-gray-500'
                    : isSelected(dayInfo.date)
                      ? 'bg-white/20 text-white ring-2 ring-white/30'
                      : isToday(dayInfo.date)
                        ? 'bg-blue-500/30 text-blue-200 hover:bg-blue-500/40'
                        : 'text-gray-300 hover:bg-white/10 hover:text-white'
                }`}
                type="button"
              >
                {dayInfo.day}
              </button>
            ))}
          </div>

          {/* Quick select buttons */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => handleDateSelect(new Date())}
              className="rounded-lg bg-blue-500/20 px-3 py-1 text-xs text-blue-200 hover:bg-blue-500/30"
              type="button"
            >
              Today
            </button>
            <button
              onClick={() => {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                handleDateSelect(yesterday);
              }}
              className="rounded-lg bg-gray-500/20 px-3 py-1 text-xs text-gray-300 hover:bg-gray-500/30"
              type="button"
            >
              Yesterday
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateSelector;