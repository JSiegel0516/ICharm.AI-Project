"use client";
import React, { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  computeSpectrogram,
  extractTimeSeriesValues,
  estimateSamplingRate,
} from "@/lib/spectral-analysis";
import type { DatasetInfo } from "@/hooks/use-timeseries";

interface SpectrogramPanelProps {
  chartData: any[];
  selectedDatasets: DatasetInfo[];
  visibleDatasets: Set<string>;
  metadata: Record<string, any> | null;
}

export function SpectrogramPanel({
  chartData,
  selectedDatasets,
  visibleDatasets,
  metadata,
}: SpectrogramPanelProps) {
  // Select which dataset to show spectrogram for
  const visibleDatasetIds = Array.from(visibleDatasets);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(
    visibleDatasetIds[0] || "",
  );

  // Spectrogram parameters
  const [windowSize, setWindowSize] = useState<number>(256);
  const [overlap, setOverlap] = useState<number>(128);

  // Compute spectrogram for selected dataset
  const spectrogramData = useMemo(() => {
    if (chartData.length === 0 || !selectedDatasetId) return null;

    const { dates, values } = extractTimeSeriesValues(
      chartData,
      selectedDatasetId,
    );

    if (values.length < windowSize) {
      return null; // Not enough data
    }

    // Estimate sampling rate
    const samplingRate = estimateSamplingRate(dates);

    // Compute spectrogram
    const nfft = Math.pow(2, Math.ceil(Math.log2(windowSize * 2)));
    const spectrogram = computeSpectrogram(
      values,
      samplingRate,
      windowSize,
      overlap,
      nfft,
    );

    return spectrogram;
  }, [chartData, selectedDatasetId, windowSize, overlap]);

  if (!spectrogramData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Spectrogram</CardTitle>
          <CardDescription>
            Time-frequency representation (not enough data)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex h-[400px] items-center justify-center text-sm">
            Select a dataset with sufficient data points
          </div>
        </CardContent>
      </Card>
    );
  }

  // Find min and max power for color scaling
  let minPower = Infinity;
  let maxPower = -Infinity;
  spectrogramData.power.forEach((timeSlice) => {
    timeSlice.forEach((powerValue) => {
      minPower = Math.min(minPower, powerValue);
      maxPower = Math.max(maxPower, powerValue);
    });
  });

  // Color mapping function (blue to red, like jet colormap in R)
  const getColor = (power: number): string => {
    // Normalize to 0-1
    const normalized = (power - minPower) / (maxPower - minPower);

    // Jet colormap approximation
    let r, g, b;
    if (normalized < 0.25) {
      r = 0;
      g = Math.floor(normalized * 4 * 255);
      b = 255;
    } else if (normalized < 0.5) {
      r = 0;
      g = 255;
      b = Math.floor((0.5 - normalized) * 4 * 255);
    } else if (normalized < 0.75) {
      r = Math.floor((normalized - 0.5) * 4 * 255);
      g = 255;
      b = 0;
    } else {
      r = 255;
      g = Math.floor((1 - normalized) * 4 * 255);
      b = 0;
    }

    return `rgb(${r}, ${g}, ${b})`;
  };

  const selectedDataset = selectedDatasets.find(
    (d) => d.id === selectedDatasetId,
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">Spectrogram</CardTitle>
            <CardDescription>
              Time-frequency heatmap showing how frequency content evolves over
              time
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            {/* Dataset selector */}
            {visibleDatasetIds.length > 1 && (
              <div className="flex items-center gap-2">
                <Label className="text-xs">Dataset:</Label>
                <Select
                  value={selectedDatasetId}
                  onValueChange={setSelectedDatasetId}
                >
                  <SelectTrigger className="h-8 w-[180px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleDatasetIds.map((id) => {
                      const dataset = selectedDatasets.find((d) => d.id === id);
                      return (
                        <SelectItem key={id} value={id}>
                          {(dataset as any)?.datasetName || dataset?.name || id}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Window size selector */}
            <div className="flex items-center gap-2">
              <Label className="text-xs">Window:</Label>
              <Select
                value={windowSize.toString()}
                onValueChange={(v) => setWindowSize(parseInt(v))}
              >
                <SelectTrigger className="h-8 w-[100px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="128">128</SelectItem>
                  <SelectItem value="256">256</SelectItem>
                  <SelectItem value="512">512</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Canvas for spectrogram */}
          <div
            className="rounded border"
            style={{
              width: "100%",
              height: "400px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${spectrogramData.times.length} ${spectrogramData.frequencies.length}`}
              preserveAspectRatio="none"
            >
              {spectrogramData.power.map((timeSlice, timeIdx) =>
                timeSlice.map((powerValue, freqIdx) => (
                  <rect
                    key={`${timeIdx}-${freqIdx}`}
                    x={timeIdx}
                    y={spectrogramData.frequencies.length - freqIdx - 1}
                    width={1}
                    height={1}
                    fill={getColor(powerValue)}
                  />
                )),
              )}
            </svg>
          </div>

          {/* Color scale legend */}
          <div className="mt-4 flex items-center justify-between text-xs">
            <div>
              <span className="text-muted-foreground">Power: </span>
              <span className="font-mono">{minPower.toFixed(1)} dB</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="h-4 w-32 rounded"
                style={{
                  background:
                    "linear-gradient(to right, rgb(0,0,255), rgb(0,255,255), rgb(0,255,0), rgb(255,255,0), rgb(255,0,0))",
                }}
              />
            </div>
            <div>
              <span className="font-mono">{maxPower.toFixed(1)} dB</span>
            </div>
          </div>

          {/* Axis labels */}
          <div className="text-muted-foreground mt-2 text-center text-xs">
            Time →
          </div>
          <div className="text-muted-foreground absolute top-1/2 left-0 -translate-y-1/2 -rotate-90 text-xs">
            Frequency →
          </div>
        </div>

        <div className="text-muted-foreground mt-4 text-xs">
          <p>
            <strong>Interpretation:</strong> The spectrogram shows how the
            frequency content of the signal changes over time. Brighter colors
            indicate stronger power at that frequency and time. Horizontal bands
            indicate sustained periodic behavior.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
