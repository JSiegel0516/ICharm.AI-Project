'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Gauge, ChevronDown, Check } from 'lucide-react';
import { PressureLevel } from '@/types';

interface PressureLevelsSelectorProps {
  selectedLevel?: PressureLevel;
  onLevelChange?: (level: PressureLevel) => void;
  className?: string;
}

// Predefined pressure levels based on standard atmospheric levels
const pressureLevels: PressureLevel[] = [
  { id: 'surface', value: 1000, label: 'Surface', unit: 'hPa' },
  { id: '925', value: 925, label: '925 hPa', unit: 'hPa' },
  { id: '850', value: 850, label: '850 hPa', unit: 'hPa' },
  { id: '700', value: 700, label: '700 hPa', unit: 'hPa' },
  { id: '500', value: 500, label: '500 hPa', unit: 'hPa' },
  { id: '300', value: 300, label: '300 hPa', unit: 'hPa' },
  { id: '200', value: 200, label: '200 hPa', unit: 'hPa' },
  { id: '100', value: 100, label: '100 hPa', unit: 'hPa' },
  { id: '50', value: 50, label: '50 hPa', unit: 'hPa' },
  { id: '10', value: 10, label: '10 hPa', unit: 'hPa' },
];

// Altitude descriptions for different pressure levels
const altitudeDescriptions: { [key: string]: string } = {
  'surface': '~Sea Level',
  '925': '~2,500 ft',
  '850': '~5,000 ft',
  '700': '~10,000 ft',
  '500': '~18,000 ft',
  '300': '~30,000 ft',
  '200': '~39,000 ft',
  '100': '~53,000 ft',
  '50': '~67,000 ft',
  '10': '~89,000 ft',
};

const PressureLevelsSelector: React.FC<PressureLevelsSelectorProps> = ({
  selectedLevel = pressureLevels[0],
  onLevelChange,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentLevel, setCurrentLevel] = useState(selectedLevel);
  const [searchTerm, setSearchTerm] = useState('');
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Filter levels based on search term
  const filteredLevels = pressureLevels.filter(level =>
    level.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    level.value.toString().includes(searchTerm)
  );

  // Handle level selection
  const handleLevelSelect = (level: PressureLevel) => {
    setCurrentLevel(level);
    setIsOpen(false);
    setSearchTerm('');
    onLevelChange?.(level);
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
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
    }
  };

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
        title="Select Pressure Level"
        type="button"
      >
        <Gauge size={14} />
        <span className="min-w-[70px] text-left">
          {currentLevel.label}
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
          className="absolute bottom-full right-0 z-50 mb-2 w-72 rounded-xl border border-white/20 bg-gray-800/95 p-4 shadow-2xl backdrop-blur-md"
          style={{
            transform: 'translateY(-8px)',
          }}
          onKeyDown={handleKeyDown}
        >
          {/* Header */}
          <div className="mb-3">
            <h3 className="mb-2 text-lg font-semibold text-white">
              Pressure Levels
            </h3>
            
            {/* Search Input */}
            <input
              ref={searchRef}
              type="text"
              placeholder="Search levels..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/50 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
          </div>

          {/* Levels List */}
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {filteredLevels.length > 0 ? (
              filteredLevels.map((level) => {
                const isSelected = level.id === currentLevel.id;
                const altitude = altitudeDescriptions[level.id] || '';
                
                return (
                  <button
                    key={level.id}
                    onClick={() => handleLevelSelect(level)}
                    className={`flex w-full items-center justify-between rounded-lg p-3 text-left transition-all duration-200 hover:scale-[1.02] focus:outline-none ${
                      isSelected
                        ? 'bg-white/20 text-white ring-2 ring-white/30'
                        : 'text-gray-300 hover:bg-white/10 hover:text-white'
                    }`}
                    type="button"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{level.label}</span>
                        {isSelected && <Check size={16} className="text-green-400" />}
                      </div>
                      {altitude && (
                        <span className="text-xs text-gray-400">{altitude}</span>
                      )}
                    </div>
                    <div className="text-right text-xs text-gray-400">
                      {level.value} {level.unit}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-center text-gray-400">
                No levels found matching "{searchTerm}"
              </div>
            )}
          </div>

          {/* Footer Info */}
          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="text-xs text-gray-400">
              <div className="mb-1">
                <strong className="text-gray-300">Current:</strong> {currentLevel.label}
              </div>
              <div>
                <strong className="text-gray-300">Altitude:</strong> {altitudeDescriptions[currentLevel.id] || 'N/A'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PressureLevelsSelector;