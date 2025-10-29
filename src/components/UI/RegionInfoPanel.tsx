'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, X, MapPin } from 'lucide-react';
import { RegionInfoPanelProps } from '@/types';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';

type SeriesPoint = {
  date: string;
  value: number | null;
};

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
    unit: 'mm/day',
  },
  colorBarPosition = { x: 24, y: 300 },
  colorBarCollapsed = false,
  className = '',
  currentDataset,
  selectedDate,
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

  const [timeseriesOpen, setTimeseriesOpen] = useState(false);
  const [timeseriesLoading, setTimeseriesLoading] = useState(false);
  const [timeseriesError, setTimeseriesError] = useState<string | null>(null);
  const [timeseriesSeries, setTimeseriesSeries] = useState<SeriesPoint[]>([]);
  const [timeseriesUnits, setTimeseriesUnits] = useState<string | null>(null);

  const datasetUnit = regionData.unit ?? currentDataset?.units ?? 'units';

  const datasetIdentifier =
    currentDataset?.backend?.datasetName ??
    currentDataset?.name ??
    regionData.dataset ??
    '';

  // Get the dataset ID - try multiple possible locations
  const datasetId = useMemo(() => {
    return (
      currentDataset?.backend?.id ??
      currentDataset?.backendId ??
      currentDataset?.id ??
      null
    );
  }, [currentDataset]);

  const datasetStart = useMemo(() => {
    if (!currentDataset?.backend?.startDate && !currentDataset?.startDate) return null;
    const dateStr = currentDataset.backend?.startDate ?? currentDataset.startDate;
    const parsed = new Date(dateStr);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [currentDataset]);

  const datasetEnd = useMemo(() => {
    if (!currentDataset?.backend?.endDate && !currentDataset?.endDate) return null;
    const dateStr = currentDataset.backend?.endDate ?? currentDataset.endDate;
    const parsed = new Date(dateStr);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [currentDataset]);

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

        setPosition((prev) => ({
          x: Math.min(prev.x, window.innerWidth - panelWidth),
          y: Math.min(prev.y, window.innerHeight - panelHeight),
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

  const handleCollapseToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isDragging) {
      return;
    }

    setIsCollapsed((prev) => {
      if (prev) {
        setPosition(previousPosition);
        return false;
      } else {
        setPreviousPosition(position);
        if (typeof window !== 'undefined') {
          setPosition({
            x: window.innerWidth - 200,
            y: window.innerHeight - 60,
          });
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
        x: Math.min(Math.max(0, newX), maxX),
        y: Math.min(Math.max(0, newY), maxY),
      });
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, isCollapsed]);

  const chartData = useMemo(() => {
    return timeseriesSeries.map((entry) => ({
      date: entry.date,
      value:
        entry.value != null && Number.isFinite(entry.value)
          ? Number(entry.value.toFixed(2))
          : null,
    }));
  }, [timeseriesSeries]);

  // Dynamic timeseries handler using your backend API
  const handleTimeseriesClick = async () => {
  setTimeseriesOpen(true);

  // Check if we have a valid dataset ID
  if (!datasetId) {
    console.error('[Timeseries] No dataset ID found');
    console.log('[Timeseries] currentDataset:', currentDataset);
    setTimeseriesError('No dataset selected. Please select a dataset from the sidebar.');
    setTimeseriesSeries([]);
    setTimeseriesUnits(null);
    return;
  }

  // Use selectedDate or fallback to dataset end date
  let targetDate = selectedDate ?? datasetEnd ?? new Date();

  if (datasetStart && targetDate < datasetStart) {
    targetDate = datasetStart;
  }
  if (datasetEnd && targetDate > datasetEnd) {
    targetDate = datasetEnd;
  }

  // Calculate date range (e.g., full month for the selected date)
  const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
  const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);

  setTimeseriesLoading(true);
  setTimeseriesError(null);

  try {
    // Format coordinates string for focusCoordinates parameter
    const focusCoords = `${latitude},${longitude}`;

    const payload = {
      datasetIds: [datasetId],
      startDate: startOfMonth.toISOString().split('T')[0],
      endDate: endOfMonth.toISOString().split('T')[0],
      focusCoordinates: focusCoords,
      aggregation: 'mean',
      includeStatistics: false,
      includeMetadata: true,
    };

    console.log('[Timeseries] Request payload:', payload);
    console.log('[Timeseries] Fetching from: /api/v2/timeseries/extract');

    const response = await fetch('http://localhost:8000/api/v2/timeseries/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log('[Timeseries] Response status:', response.status);
    console.log('[Timeseries] Response headers:', response.headers);

    // Check content type before parsing
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('[Timeseries] Non-JSON response:', text.substring(0, 500));
      throw new Error(`Server returned ${response.status}: ${response.statusText}. Expected JSON but got ${contentType}`);
    }

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData?.detail || `Request failed with status ${response.status}`);
    }

    const result = await response.json();
    console.log('[Timeseries] Response:', result);

    // Extract data from API response
    if (!result?.data || !Array.isArray(result.data)) {
      throw new Error('Invalid response format');
    }
    
    // Transform API response to SeriesPoint format
    const series: SeriesPoint[] = result.data.map((point: any) => ({
      date: point.date,
      value: point.values?.[datasetId] ?? null,
    }));

    // Get units from metadata
    const units = result.metadata?.[datasetId]?.units ?? datasetUnit;

    setTimeseriesSeries(series);
    setTimeseriesUnits(units);

    console.log(`[Timeseries] Loaded ${series.length} data points for ${currentDataset?.name}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load timeseries';
    console.error('[Timeseries] Error:', message);
    setTimeseriesError(message);
    setTimeseriesSeries([]);
    setTimeseriesUnits(null);
  } finally {
    setTimeseriesLoading(false);
  }
};
  // Add this right before "if (!show) return null;"
  console.log('[RegionInfoPanel] Debug info:', {
  currentDataset: currentDataset,
  datasetId: datasetId,
  hasBackend: !!currentDataset?.backend,
  backendId: currentDataset?.backend?.id,
  directId: currentDataset?.id,
});

  if (!show) return null;

  return (
    <div
      ref={panelRef}
      className={`pointer-events-auto fixed z-20 ${className}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: isCollapsed ? 1000 : 20,
      }}
    >
      {isCollapsed ? (
        <div
          className="cursor-pointer rounded-xl border border-gray-600/30 bg-gray-800/95 backdrop-blur-sm transition-all duration-200 hover:border-gray-500/50 hover:shadow-lg"
          onClick={handleCollapseToggle}
          style={{ transform: 'scale(1)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <div className="pointer-events-none px-3 py-2">
            <div className="flex items-center gap-2 text-gray-300 transition-colors hover:text-white">
              <MapPin className="h-4 w-4" />
              <span className="select-none text-sm font-medium">
                Region Info
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="min-w-60 rounded-xl border border-gray-600/30 bg-gray-800/95 px-4 py-4 text-gray-200 shadow-xl backdrop-blur-sm">
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
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <div className="text-sm font-medium text-white">
                {latitude.toFixed(2)}°, {longitude.toFixed(2)}°
              </div>
            </div>

            <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-3">
              <div className="text-center">
                <div className="mb-1 font-mono text-2xl font-bold text-white">
                  {(regionData.precipitation ?? 0).toFixed(2)}{' '}
                  <span className="text-base font-normal text-gray-400">
                    {datasetUnit}
                  </span>
                </div>
                <div className="text-sm text-gray-400">
                  {currentDataset?.name || regionData.name || datasetIdentifier || 'Value'}
                </div>
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
              <button
                className="w-full rounded-lg border border-gray-600/40 bg-gray-700/50 px-3 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-gray-500/60 hover:bg-gray-600/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                onClick={handleTimeseriesClick}
                disabled={!datasetId}
                title={!datasetId ? 'Select a dataset first' : 'View time series for this location'}
              >
                Time Series
              </button>
            </div>
          </div>
        </div>
      )}

      {timeseriesOpen && (
        <div
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-6"
          onClick={() => setTimeseriesOpen(false)}
        >
          <div
            className="relative w-full max-w-3xl rounded-xl border border-gray-700 bg-gray-900/95 p-6 text-gray-200 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setTimeseriesOpen(false)}
              className="absolute right-4 top-4 rounded-full border border-gray-600/40 p-1 text-gray-400 transition-colors hover:border-gray-500/60 hover:text-white"
              title="Close"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white">
                {currentDataset?.name || 'Time Series'}
              </h2>
              <p className="text-sm text-gray-400">
                {latitude.toFixed(2)}°, {longitude.toFixed(2)}° ·{' '}
                {selectedDate
                  ? `${selectedDate.getFullYear()}-${String(
                      selectedDate.getMonth() + 1
                    ).padStart(2, '0')}`
                  : 'Select a date'}
              </p>
            </div>

            <div className="relative h-72 w-full overflow-hidden rounded-lg border border-gray-700/50 bg-gray-900/50">
              {timeseriesLoading ? (
                <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
                  Loading timeseries...
                </div>
              ) : timeseriesError ? (
                <div className="flex h-full w-full items-center justify-center p-4 text-center text-sm text-red-400">
                  {timeseriesError}
                </div>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#94a3b8"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tick={{ fontSize: 12 }}
                      label={{
                        value: timeseriesUnits ?? datasetUnit,
                        angle: -90,
                        position: 'insideLeft',
                        fill: '#94a3b8',
                        fontSize: 12,
                      }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1f2937', 
                        border: '1px solid #374151',
                        borderRadius: '0.5rem'
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="value"
                      name={currentDataset?.name || 'Value'}
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
                  No timeseries data available.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    
  );
  
};


export default RegionInfoPanel;