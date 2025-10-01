'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, MapPin } from 'lucide-react';
import { RegionInfoPanelProps } from '@/types';

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
  const getDefaultPosition = () => {
    if (typeof window !== 'undefined') {
      return { x: window.innerWidth - 350, y: 200 };
    }
    return { x: 1000, y: 200 };
  };
  
  const [position, setPosition] = useState(getDefaultPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [previousPosition, setPreviousPosition] = useState(getDefaultPosition);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (show && typeof window !== 'undefined') {
      const initialPos = { x: window.innerWidth - 350, y: 200 };
      setPosition(initialPos);
      setPreviousPosition(initialPos);
    }
  }, [show]);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === 'undefined') return;
      
      if (!isCollapsed && panelRef.current) {
        const panelWidth = panelRef.current.offsetWidth;
        const panelHeight = panelRef.current.offsetHeight;
        
        setPosition(prev => ({
          x: Math.min(prev.x, window.innerWidth - panelWidth),
          y: Math.min(prev.y, window.innerHeight - panelHeight)
        }));
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [isCollapsed]);

  const handleClose = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };

  // FIX: Simplified collapse toggle
  const handleCollapseToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    console.log('RegionPanel collapse clicked', { isDragging, isCollapsed });

    if (isDragging) {
      console.log('Blocked: currently dragging');
      return;
    }

    setIsCollapsed(prev => {
      console.log('RegionPanel toggle: from', prev, 'to', !prev);
      if (prev) {
        // Expanding
        setPosition(previousPosition);
        return false;
      } else {
        // Collapsing
        setPreviousPosition(position);
        if (typeof window !== 'undefined') {
          setPosition({ x: window.innerWidth - 200, y: window.innerHeight - 60 });
        }
        return true;
      }
    });
  };

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

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || isCollapsed) return;

      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;

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
  }, [isDragging, dragStart, isCollapsed]);

  if (!show) return null;

  return (
    <div
      ref={panelRef}
      className={`fixed z-20 pointer-events-auto ${className}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: isCollapsed ? 1000 : 20,
      }}
    >
      {isCollapsed ? (
        <div
          className="cursor-pointer rounded-lg border border-gray-600/30 bg-gray-800/95 backdrop-blur-sm transition-all duration-200 hover:shadow-lg hover:border-gray-500/50"
          onClick={(e) => {
            console.log('Collapsed RegionPanel div clicked');
            handleCollapseToggle(e);
          }}
          style={{ transform: 'scale(1)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <div className="px-3 py-2 pointer-events-none">
            <div className="flex items-center gap-2 text-gray-300 transition-colors hover:text-white">
              <MapPin className="h-4 w-4" />
              <span className="select-none text-sm font-medium">
                Region Info
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="min-w-60 rounded-lg border border-gray-600/30 bg-gray-800/95 px-4 py-4 text-gray-200 backdrop-blur-sm shadow-xl">
          <div className="-mt-1 mb-3 flex h-3 w-full items-center justify-between">
            <button
              onClick={handleCollapseToggle}
              className="z-10 -m-1 flex cursor-pointer items-center p-1 text-gray-400 transition-colors hover:text-gray-200 focus:outline-none"
              title="Collapse"
              type="button"
            >
              <ChevronDown className="h-3 w-3" />
            </button>

            <div
              className={`h-3 flex-1 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} mx-2 select-none`}
              onMouseDown={handleMouseDown}
              title="Drag to move"
            >
              <div className="flex h-full items-center justify-center gap-1">
                <div className="h-0.5 w-0.5 rounded-full bg-gray-500"></div>
                <div className="h-0.5 w-0.5 rounded-full bg-gray-500"></div>
                <div className="h-0.5 w-0.5 rounded-full bg-gray-500"></div>
              </div>
            </div>

            <button
              onClick={handleClose}
              className="z-10 -m-1 flex cursor-pointer items-center p-1 text-gray-400 transition-colors hover:text-gray-200 focus:outline-none"
              title="Close"
              type="button"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
              <div className="text-sm font-medium text-white">
                {latitude.toFixed(2)}°, {longitude.toFixed(2)}°
              </div>
            </div>

            <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-3">
              <div className="text-center">
                <div className="mb-1 font-mono text-2xl font-bold text-white">
                  {(regionData.precipitation ?? 0).toFixed(2)} <span className="text-base font-normal text-gray-400">mm</span>
                </div>
                <div className="text-sm text-gray-400">Precipitation</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-gray-700/30 bg-gray-900/30 p-2">
                <div className="mb-1 text-xs text-gray-400">Lat</div>
                <div className="font-mono text-sm font-medium text-white">
                  {Math.abs(latitude).toFixed(2)}° {latitude >= 0 ? 'N' : 'S'}
                </div>
              </div>
              <div className="rounded-lg border border-gray-700/30 bg-gray-900/30 p-2">
                <div className="mb-1 text-xs text-gray-400">Lon</div>
                <div className="font-mono text-sm font-medium text-white">
                  {Math.abs(longitude).toFixed(2)}° {longitude >= 0 ? 'E' : 'W'}
                </div>
              </div>
            </div>

            <div className="pt-1">
              <button className="w-full rounded-lg border border-gray-600/40 bg-gray-700/50 px-3 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-gray-500/60 hover:bg-gray-600/50 hover:text-white">
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