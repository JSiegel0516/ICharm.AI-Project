'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { ColorBarProps, TemperatureUnit } from '@/types';

const ColorBar: React.FC<ColorBarProps> = ({
  show,
  onToggle,
  dataset,
  unit = 'celsius',
  onUnitChange,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [position, setPosition] = useState({ x: 24, y: 24 }); // Safe initial position
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [previousPosition, setPreviousPosition] = useState({ x: 24, y: 24 });
  const colorBarRef = useRef<HTMLDivElement>(null);

  // Convert Celsius to Fahrenheit
  const celsiusToFahrenheit = (celsius: number) => {
    return Math.round((celsius * 9) / 5 + 32);
  };

  // Convert Fahrenheit to Celsius
  const fahrenheitToCelsius = (fahrenheit: number) => {
    return Math.round(((fahrenheit - 32) * 5) / 9);
  };

  // Calculate default position based on current window size
  const getDefaultPosition = () => {
    return { x: 24, y: window.innerHeight - 180 };
  };

  // Extract numeric values from labels
  const getNumericLabels = () => {
    return dataset.colorScale.labels.map((label) => {
      const numericValue = parseFloat(label.replace(/[^\d.-]/g, ''));
      return isNaN(numericValue) ? 0 : numericValue;
    });
  };

  const numericLabels = getNumericLabels();

  // Get display labels based on current unit
  const getDisplayLabels = () => {
    if (unit === 'fahrenheit') {
      return numericLabels.map((celsius) =>
        celsiusToFahrenheit(celsius).toString()
      );
    }
    return dataset.colorScale.labels;
  };

  // Get unit symbol
  const getUnitSymbol = () => {
    return unit === 'celsius' ? '°C' : '°F';
  };

  // Handle unit change
  const handleUnitChange = (newUnit: TemperatureUnit) => {
    if (onUnitChange) {
      onUnitChange(newUnit);
    }
    setShowDropdown(false);
  };

  // Handle reset to default position
  const handleResetPosition = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isCollapsed && !isDragging) {
      const defaultPos = getDefaultPosition();
      setPosition(defaultPos);
      setPreviousPosition(defaultPos);
    }
  };

  const handleCollapseToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    console.log('Collapse toggle clicked, current state:', {
      isCollapsed,
      isDragging,
    });

    // Make sure we're not in a dragging state
    if (isDragging) {
      console.log('Blocked due to dragging state');
      return;
    }

    if (isCollapsed) {
      console.log('Expanding from collapsed state');
      // Expanding - restore previous position
      setPosition(previousPosition);
      setIsCollapsed(false);
    } else {
      console.log('Collapsing to collapsed state');
      // Collapsing - save current position and move to bottom left
      setPreviousPosition(position);
      setPosition({ x: 24, y: window.innerHeight - 60 });
      setIsCollapsed(true);
    }
    setShowDropdown(false);
  };

  // Initialize position on mount
  useEffect(() => {
    const initialPosition = getDefaultPosition();
    setPosition(initialPosition);
    setPreviousPosition(initialPosition);
  }, []);

  // Handle drag start
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only allow dragging when not collapsed
    if (isCollapsed) return;

    e.preventDefault();
    e.stopPropagation();

    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  // Handle mouse move during drag
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || isCollapsed) return;

      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;

      // Keep within screen bounds using actual element dimensions
      const colorBarElement = colorBarRef.current;
      const colorBarWidth = colorBarElement ? colorBarElement.offsetWidth : 320;
      const colorBarHeight = colorBarElement
        ? colorBarElement.offsetHeight
        : 200;

      const maxX = window.innerWidth - colorBarWidth;
      const maxY = window.innerHeight - colorBarHeight;

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging && !isCollapsed) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, position, isCollapsed]);

  // Handle dropdown toggle
  const handleDropdownToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDragging && !isCollapsed) {
      setShowDropdown(!showDropdown);
    }
  };

  // Update position when window is resized
  useEffect(() => {
    const handleResize = () => {
      if (isCollapsed) {
        // Update collapsed position
        setPosition({ x: 24, y: window.innerHeight - 60 });
      } else {
        // Check if current position is still within bounds
        const colorBarElement = colorBarRef.current;
        const colorBarWidth = colorBarElement
          ? colorBarElement.offsetWidth
          : 320;
        const colorBarHeight = colorBarElement
          ? colorBarElement.offsetHeight
          : 200;

        const maxX = window.innerWidth - colorBarWidth;
        const maxY = window.innerHeight - colorBarHeight;

        setPosition((prevPosition) => ({
          x: Math.max(0, Math.min(prevPosition.x, maxX)),
          y: Math.max(0, Math.min(prevPosition.y, maxY)),
        }));
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isCollapsed]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        colorBarRef.current &&
        !colorBarRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  const displayLabels = getDisplayLabels();
  const unitSymbol = getUnitSymbol();

  return (
    <div
      ref={colorBarRef}
      className="fixed"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: isCollapsed ? 1000 : 35, // Higher z-index when collapsed
      }}
    >
      {isCollapsed ? (
        // Collapsed State - Small Tab with enhanced interactivity
        <div
          className="cursor-pointer rounded-lg border border-blue-500/20 bg-gradient-to-br from-blue-900/95 to-purple-900/95 backdrop-blur-sm transition-all duration-200 hover:shadow-lg"
          onClick={handleCollapseToggle}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <div className="pointer-events-auto px-3 py-2">
            <div className="flex items-center gap-2 text-blue-100 transition-colors hover:text-white">
              <ChevronUp className="pointer-events-none h-4 w-4" />
              <span className="pointer-events-none select-none text-sm font-medium">
                Color Scale
              </span>
            </div>
          </div>
        </div>
      ) : (
        // Expanded State - Full Color Bar
        <div className="rounded-lg border border-blue-500/20 bg-gradient-to-br from-blue-900/95 to-purple-900/95 px-6 py-6 text-blue-100 backdrop-blur-sm">
          {/* Drag Handle Area with Collapse Button and Reset Button */}
          <div className="-mt-2 mb-2 flex h-4 w-full items-center justify-between">
            <button
              onClick={handleCollapseToggle}
              className="z-10 -m-1 flex cursor-pointer items-center p-1 text-blue-300 transition-colors hover:text-blue-200 focus:outline-none"
              title="Collapse"
              type="button"
            >
              <ChevronDown className="h-3 w-3" />
            </button>

            <div
              className={`h-4 flex-1 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} mx-2 select-none`}
              onMouseDown={handleMouseDown}
              title="Drag to move"
            >
              {/* Drag indicators */}
              <div className="flex h-full items-center justify-center gap-1">
                <div className="h-1 w-1 rounded-full bg-blue-400"></div>
                <div className="h-1 w-1 rounded-full bg-blue-400"></div>
                <div className="h-1 w-1 rounded-full bg-blue-400"></div>
              </div>
            </div>

            <button
              onClick={handleResetPosition}
              className="z-10 -m-1 flex cursor-pointer items-center p-1 text-blue-300 transition-colors hover:text-blue-200 focus:outline-none"
              title="Reset to default position"
              type="button"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>

          {/* Unit Selector Header */}
          <div className="relative mb-12 mt-2">
            <button
              onClick={handleDropdownToggle}
              className="flex w-full items-center justify-between text-sm font-medium text-blue-200 transition-colors hover:text-white focus:outline-none"
              type="button"
            >
              <span>Unit of measurement</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Dropdown */}
            {showDropdown && !isDragging && (
              <div className="absolute left-0 top-8 z-50 w-full rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                <button
                  onClick={() => handleUnitChange('celsius')}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 focus:outline-none ${
                    unit === 'celsius'
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-700'
                  }`}
                  type="button"
                >
                  Celsius (°C)
                </button>
                <button
                  onClick={() => handleUnitChange('fahrenheit')}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 focus:outline-none ${
                    unit === 'fahrenheit'
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-700'
                  }`}
                  type="button"
                >
                  Fahrenheit (°F)
                </button>
              </div>
            )}
          </div>

          {/* Color Scale */}
          <div className="relative">
            <div
              className="mx-auto h-8 w-60 rounded-md"
              style={{
                background: `linear-gradient(to right, ${dataset.colorScale.colors.join(', ')})`,
              }}
            />

            {/* Unit Label (top center) */}
            <div className="absolute -top-[65px] right-6 text-xs">
              <span className="font-medium text-blue-200">{unitSymbol}</span>
            </div>

            {/* Temperature Labels */}
            <div className="absolute -top-4 left-0 flex w-60 justify-between text-xs">
              {displayLabels.map((label, index) => (
                <span key={index} className="leading-none text-blue-200">
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ColorBar;
