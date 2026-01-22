"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp } from "lucide-react";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface Station {
  station_id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
}

interface TimeseriesData {
  date: string;
  value: number | null;
}

interface StationModalProps {
  station: Station | null;
  selectedDate?: Date | null;
  open: boolean;
  onClose: () => void;
}

export const StationModal: React.FC<StationModalProps> = ({
  station,
  selectedDate,
  open,
  onClose,
}) => {
  const [showTimeseries, setShowTimeseries] = useState(false);
  const [timeseriesData, setTimeseriesData] = useState<TimeseriesData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentValue, setCurrentValue] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statistics, setStatistics] = useState<any>(null);

  useEffect(() => {
    if (!station || !open) {
      setShowTimeseries(false);
      setTimeseriesData([]);
      setCurrentValue(null);
      setError(null);
      setStatistics(null);
      return;
    }

    if (!station.station_id) {
      setError("Missing station id");
      return;
    }

    // Fetch current value for the selected date
    if (selectedDate) {
      fetchCurrentValue();
    }
  }, [station, selectedDate, open]);

  const fetchCurrentValue = async () => {
    if (!station || !selectedDate || !station.station_id) return;

    try {
      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth() + 1;
      
      // For monthly data, request by year/month only (not a date range)
      const response = await fetch(
        `/api/stations/${station.station_id}/timeseries?year=${year}&month=${month}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch station data");
      }

      const data = await response.json();
      if (data.timeseries && data.timeseries.length > 0) {
        setCurrentValue(data.timeseries[0].value);
      } else {
        setCurrentValue(null);
      }
    } catch (err) {
      console.error("Error fetching current value:", err);
      setCurrentValue(null);
    }
  };

  const fetchTimeseries = async () => {
    if (!station || !station.station_id) {
      setError("Missing station id");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/stations/${station.station_id}/timeseries`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch timeseries data");
      }

      const data = await response.json();
      setTimeseriesData(data.timeseries || []);
      setStatistics(data.statistics || null);
      setShowTimeseries(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error fetching timeseries:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const chartConfig = {
    value: {
      label: "Temperature (°C)",
      color: "hsl(221, 83%, 53%)",
    },
  } as const;

  const chartData = timeseriesData.map((d) => ({
    date: d.date,
    value: d.value,
  }));

  if (!station) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[1000px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {station.name}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-base space-y-2">
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <span className="font-medium">Station ID:</span> {station.station_id}
                </div>
                <div>
                  <span className="font-medium">Elevation:</span> {station.elevation}m
                </div>
                <div>
                  <span className="font-medium">Latitude:</span>{" "}
                  {station.latitude.toFixed(4)}°
                </div>
                <div>
                  <span className="font-medium">Longitude:</span>{" "}
                  {station.longitude.toFixed(4)}°
                </div>
              </div>

              {selectedDate && (
                <div className="mt-4 p-4 bg-gray-50 rounded-md">
                  <div className="font-medium mb-1">
                    {selectedDate.toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                    })}
                  </div>
                  <div className="text-2xl font-bold text-blue-600">
                    {currentValue !== null
                      ? `${currentValue.toFixed(1)}°C`
                      : "No data available"}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    Monthly Average Temperature (TAVG)
                  </div>
                </div>
              )}

              {!showTimeseries && !isLoading && (
                <Button
                  onClick={fetchTimeseries}
                  className="mt-4 w-full"
                  variant="default"
                >
                  <TrendingUp className="mr-2 h-4 w-4" />
                  View Complete Timeseries
                </Button>
              )}

              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                </div>
              )}

              {error && (
                <div className="text-red-600 text-sm mt-2">
                  Error: {error}
                </div>
              )}

              {showTimeseries && timeseriesData.length > 0 && (
                <div className="mt-4 space-y-4">
                  <div className="mb-1 text-sm text-gray-600">
                    {timeseriesData.length} records from {timeseriesData[0]?.date} to {timeseriesData[timeseriesData.length - 1]?.date}
                  </div>

                  <ChartContainer
                    config={chartConfig}
                    className="h-[400px] w-full"
                  >
                    <LineChart
                      data={chartData}
                      margin={{ top: 12, right: 16, bottom: 12, left: 12 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        minTickGap={28}
                        tickFormatter={(value: string) => value.slice(0, 7)}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        width={48}
                        tickFormatter={(v: number) => `${v.toFixed?.(1) ?? v}`}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value) =>
                              value !== null && value !== undefined && typeof value === 'number'
                                ? `${value.toFixed(2)}°C`
                                : typeof value === 'string'
                                  ? `${value}°C`
                                  : "N/A"
                            }
                            hideLabel
                          />
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="var(--color-value)"
                        strokeWidth={2.2}
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                      />
                    </LineChart>
                  </ChartContainer>

                  <div className="p-4 bg-blue-50 rounded-md">
                    <h3 className="font-semibold mb-2">Statistics</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {statistics && (
                        <>
                          <div>
                            <span className="font-medium">Mean:</span> {statistics.mean?.toFixed(2)}°C
                          </div>
                          <div>
                            <span className="font-medium">Std Dev:</span> {statistics.std?.toFixed(2)}°C
                          </div>
                          <div>
                            <span className="font-medium">Min:</span> {statistics.min?.toFixed(2)}°C
                          </div>
                          <div>
                            <span className="font-medium">Max:</span> {statistics.max?.toFixed(2)}°C
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
};
