'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { YearSelectorProps } from '@/types';


const YearSelector: React.FC<YearSelectorProps> = ({
  selectedYear = new Date().getFullYear(),
  onYearChange,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentYear, setCurrentYear] = useState(selectedYear);
  const [viewDecade, setViewDecade] = useState(Math.floor(selectedYear / 10) * 10);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const minYear = 1979;
  const maxYear = new Date().getFullYear();

  // Generate years for the current decade view (show 20 years at a time)
  const generateYears = () => {
    const years = [];
    const startYear = viewDecade;
    const endYear = Math.min(startYear + 19, maxYear);
    
    for (let year = startYear; year <= endYear; year++) {
      if (year >= minYear && year <= maxYear) {
        years.push(year);
      }
    }
    
    return years;
  };

  // Handle year selection
  const handleYearSelect = (year: number) => {
    setCurrentYear(year);
    setIsOpen(false);
    onYearChange?.(year);
  };

  // Handle decade navigation
  const navigateDecade = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      setViewDecade(Math.max(minYear, viewDecade - 20));
    } else {
      setViewDecade(Math.min(maxYear - 19, viewDecade + 20));
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

  // Sync with external year changes
  useEffect(() => {
    setCurrentYear(selectedYear);
    setViewDecade(Math.floor(selectedYear / 10) * 10);
  }, [selectedYear]);

  // Check if year is current year
  const isCurrentYearToday = (year: number) => {
    return year === new Date().getFullYear();
  };

  // Check if year is selected
  const isSelected = (year: number) => {
    return year === currentYear;
  };

  const years = generateYears();
  const canGoPrev = viewDecade > minYear;
  const canGoNext = viewDecade + 20 <= maxYear;

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
        title="Select Year"
        type="button"
      >
        <Calendar size={14} />
        <span className="min-w-[80px] text-left">
          {currentYear}
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
          {/* Header with decade navigation */}
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => navigateDecade('prev')}
              disabled={!canGoPrev}
              className={`rounded-lg p-1 ${
                canGoPrev
                  ? 'text-white/70 hover:bg-white/10 hover:text-white'
                  : 'cursor-not-allowed text-white/20'
              }`}
              type="button"
            >
              <ChevronDown className="rotate-90" size={16} />
            </button>
            
            <h3 className="text-lg font-semibold text-white">
              {viewDecade} - {Math.min(viewDecade + 19, maxYear)}
            </h3>
            
            <button
              onClick={() => navigateDecade('next')}
              disabled={!canGoNext}
              className={`rounded-lg p-1 ${
                canGoNext
                  ? 'text-white/70 hover:bg-white/10 hover:text-white'
                  : 'cursor-not-allowed text-white/20'
              }`}
              type="button"
            >
              <ChevronDown className="-rotate-90" size={16} />
            </button>
          </div>

          {/* Years grid */}
          <div className="grid grid-cols-4 gap-2">
            {years.map((year) => (
              <button
                key={year}
                onClick={() => handleYearSelect(year)}
                className={`rounded-lg p-3 text-sm font-medium transition-all duration-200 hover:scale-105 focus:outline-none ${
                  isSelected(year)
                    ? 'bg-white/20 text-white ring-2 ring-white/30'
                    : isCurrentYearToday(year)
                      ? 'bg-blue-500/30 text-blue-200 hover:bg-blue-500/40'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                }`}
                type="button"
              >
                {year}
              </button>
            ))}
          </div>

          {/* Quick select buttons */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => handleYearSelect(new Date().getFullYear())}
              className="rounded-lg bg-blue-500/20 px-3 py-1 text-xs text-blue-200 hover:bg-blue-500/30"
              type="button"
            >
              Current Year
            </button>
            <button
              onClick={() => handleYearSelect(minYear)}
              className="rounded-lg bg-gray-500/20 px-3 py-1 text-xs text-gray-300 hover:bg-gray-500/30"
              type="button"
            >
              {minYear}
            </button>
          </div>

          {/* Rainbow bar at bottom */}
          <div className="mt-4 h-1 w-full rounded-full bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 via-blue-500 via-indigo-500 to-purple-500"></div>
        </div>
      )}
    </div>
  );
};

export default YearSelector;