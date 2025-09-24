'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, X, BarChart3, MapPin } from 'lucide-react';

export interface RegionInfoPanelProps {
  show: boolean;
  onClose: () => void;
  latitude?: number;
  longitude?: number;
  regionData?: {
    name?: string;
    precipitation?: number;
    temperature?: number;
    dataset?: string;
  };
  colorBarPosition?: { x: number; y: number };
  colorBarCollapsed?: boolean;
  className?: string;
}

const RegionInfoPanel: React.FC<RegionInfoPanelProps> = ({
  show,
  onClose,
  latitude = 21.25,
  longitude = -71.25,
  regionData = {
    name: 'GPCP V2.3 Precipitation',
    precipitation: 0.9,
    temperature: 24.5,
    dataset: 'Global Precipitation Climatology Project',
  },
  colorBarPosition = { x: 24, y: 300 },
  colorBarCollapsed = false,
  className = '',
}) => {
  const [position, setPosition] = useState({ x: 400, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [previousPosition, setPreviousPosition] = useState({ x: 400, y: 100 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Calculate position relative to ColorBar
  const getPositionRelativeToColorBar = () => {
    if (colorBarCollapsed) {
      // Position to the right of collapsed ColorBar
      return {
        x: colorBarPosition.x + 150, // ColorBar collapsed width + margin
        y: colorBarPosition.y,
      };
    } else {
      // Position to the right of expanded ColorBar
      return {
        x: colorBarPosition.x + 350, // ColorBar expanded width + margin
        y: colorBarPosition.y,
      };
    }
  };

  // Initialize position when component shows
  useEffect(() => {
    if (show) {
      const initialPos = getPositionRelativeToColorBar();
      setPosition(initialPos);
      setPreviousPosition(initialPos);
    }
  }, [show, colorBarPosition, colorBarCollapsed]);

  // Handle close
  const handleClose = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };

  // Handle collapse toggle
  const handleCollapseToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isDragging) return;

    if (isCollapsed) {
      // Expanding - restore previous position
      setPosition(previousPosition);
      setIsCollapsed(false);
    } else {
      // Collapsing - save current position and move to a compact location
      setPreviousPosition(position);
      setPosition({ x: position.x, y: window.innerHeight - 60 });
      setIsCollapsed(true);
    }
  };

  // Handle drag start
  const handleMouseDown = (e: React.MouseEvent) => {
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

      // Keep within screen bounds
      const panelElement = panelRef.current;
      const panelWidth = panelElement ? panelElement.offsetWidth : 300;
      const panelHeight = panelElement ? panelElement.offsetHeight : 200;

      const maxX = window.innerWidth - panelWidth;
      const maxY = window.innerHeight - panelHeight;

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

  // Update position when ColorBar position changes - only on initial show
  useEffect(() => {
    if (!isDragging && !isCollapsed && show) {
      // Only auto-position if this is the initial show or if the panel hasn't been manually moved
      const currentDistance = Math.abs(
        position.x - getPositionRelativeToColorBar().x
      );
      if (currentDistance < 50) {
        // Only auto-adjust if still close to ColorBar
        const newPos = getPositionRelativeToColorBar();
        setPosition(newPos);
      }
    }
  }, [colorBarPosition, colorBarCollapsed]);

  if (!show) return null;

  return (
    <div
      ref={panelRef}
      className={`fixed z-40 ${className}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {isCollapsed ? (
        // Collapsed State - Small Tab
        <div
          className="cursor-pointer rounded-lg border border-purple-500/20 bg-gradient-to-br from-purple-900/95 to-blue-900/95 backdrop-blur-sm transition-all duration-200 hover:shadow-lg"
          onClick={handleCollapseToggle}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <div className="pointer-events-auto px-3 py-2">
            <div className="flex items-center gap-2 text-purple-100 transition-colors hover:text-white">
              <MapPin className="pointer-events-none h-4 w-4" />
              <span className="pointer-events-none select-none text-sm font-medium">
                Region Info
              </span>
            </div>
          </div>
        </div>
      ) : (
        // Expanded State - Full Panel (made 1/3 smaller)
        <div className="min-w-60 rounded-lg border border-purple-500/20 bg-gradient-to-br from-purple-900/95 to-blue-900/95 px-4 py-4 text-purple-100 backdrop-blur-sm">
          {/* Header with drag handle, collapse and close buttons */}
          <div className="-mt-1 mb-3 flex h-3 w-full items-center justify-between">
            <button
              onClick={handleCollapseToggle}
              className="z-10 -m-1 flex cursor-pointer items-center p-1 text-purple-300 transition-colors hover:text-purple-200 focus:outline-none"
              title="Collapse"
              type="button"
            >
              <ChevronDown className="h-2.5 w-2.5" />
            </button>

            <div
              className={`h-3 flex-1 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} mx-2 select-none`}
              onMouseDown={handleMouseDown}
              title="Drag to move"
            >
              {/* Drag indicators */}
              <div className="flex h-full items-center justify-center gap-1">
                <div className="h-0.5 w-0.5 rounded-full bg-purple-400"></div>
                <div className="h-0.5 w-0.5 rounded-full bg-purple-400"></div>
                <div className="h-0.5 w-0.5 rounded-full bg-purple-400"></div>
              </div>
            </div>

            <button
              onClick={handleClose}
              className="z-10 -m-1 flex cursor-pointer items-center p-1 text-purple-300 transition-colors hover:text-purple-200 focus:outline-none"
              title="Close"
              type="button"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>

          {/* Content */}
          <div className="space-y-3">
            {/* Dataset Title */}
            <div className="flex items-start gap-1.5">
              <BarChart3 className="mt-0.5 h-3 w-3 flex-shrink-0 text-purple-300" />
              <div>
                <h3 className="text-xs font-medium leading-tight text-white">
                  {regionData.name}
                </h3>
              </div>
            </div>

            {/* Data Value */}
            <div className="rounded-lg border border-purple-600/20 bg-purple-800/30 p-2">
              <div className="text-center">
                <div className="mb-0.5 font-mono text-lg font-bold text-white">
                  {regionData.precipitation} mm
                </div>
                <div className="text-xs text-purple-300">Precipitation</div>
              </div>
            </div>

            {/* Coordinates */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-purple-600/10 bg-purple-800/20 p-2">
                <div className="mb-0.5 text-xs text-purple-300">Lat</div>
                <div className="font-mono text-xs font-medium text-white">
                  {latitude.toFixed(2)}° {latitude >= 0 ? 'N' : 'S'}
                </div>
              </div>
              <div className="rounded-lg border border-purple-600/10 bg-purple-800/20 p-2">
                <div className="mb-0.5 text-xs text-purple-300">Lon</div>
                <div className="font-mono text-xs font-medium text-white">
                  {Math.abs(longitude).toFixed(2)}° {longitude >= 0 ? 'E' : 'W'}
                </div>
              </div>
            </div>

            {/* Time Series Button */}
            <div className="pt-1">
              <button className="w-full rounded-lg border border-purple-600/30 bg-purple-700/40 px-3 py-1.5 text-xs font-medium text-purple-100 transition-colors hover:border-purple-500/40 hover:bg-purple-600/40 hover:text-white">
                Time Series
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegionInfoPanel;
