"use client";
import React, { useMemo, useState, useRef, useEffect } from "react";
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Hover state
  const [hoverInfo, setHoverInfo] = useState<{
    time: number;
    frequency: number;
    power: number;
    powerDB: number;
    x: number;
    y: number;
    timeUnit: string;
    freqUnit: string;
  } | null>(null);

  // Select which dataset to show spectrogram for
  const visibleDatasetIds = Array.from(visibleDatasets);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(
    visibleDatasetIds[0] || "",
  );

  // Spectrogram parameters
  const [windowSize, setWindowSize] = useState<number>(256);
  const [overlap, setOverlap] = useState<number>(128);

  // Store plot dimensions for hover calculations
  const plotDimensions = useRef({
    marginLeft: 60,
    marginBottom: 50,
    marginTop: 10,
    marginRight: 80,
    plotWidth: 0,
    plotHeight: 0,
    timeDuration: 0,
    maxFreq: 0,
    timeUnit: "days",
    freqUnit: "cycles/day",
    timeScale: 1,
    freqScale: 1,
  });

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
    const samplingInfo = estimateSamplingRate(dates);

    // Compute spectrogram
    const nfft = Math.pow(2, Math.ceil(Math.log2(windowSize * 2)));
    const spectrogram = computeSpectrogram(
      values,
      samplingInfo.samplingRate,
      windowSize,
      overlap,
      nfft,
    );

    return spectrogram;
  }, [chartData, selectedDatasetId, windowSize, overlap]);

  // Convert power to dB and find range
  const spectrogramDB = useMemo(() => {
    if (!spectrogramData) return null;

    // Convert to dB
    const powerDB = spectrogramData.power.map((timeSlice) =>
      timeSlice.map((powerValue) =>
        powerValue > 0 ? 10 * Math.log10(powerValue) : -100,
      ),
    );

    // Find min/max for color scaling
    let minDB = Infinity;
    let maxDB = -Infinity;
    powerDB.forEach((timeSlice) => {
      timeSlice.forEach((db) => {
        if (db > -100) {
          // Ignore floor values
          minDB = Math.min(minDB, db);
          maxDB = Math.max(maxDB, db);
        }
      });
    });

    return { powerDB, minDB, maxDB };
  }, [spectrogramData]);

  // Handle mouse move
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (
      !canvasRef.current ||
      !spectrogramData ||
      !spectrogramDB ||
      !containerRef.current
    ) {
      setHoverInfo(null);
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const { marginLeft, marginTop, plotWidth, plotHeight } =
      plotDimensions.current;

    // Check if mouse is within plot area
    if (
      x < marginLeft ||
      x > marginLeft + plotWidth ||
      y < marginTop ||
      y > marginTop + plotHeight
    ) {
      setHoverInfo(null);
      return;
    }

    // Calculate which time and frequency bin
    const relX = x - marginLeft;
    const relY = y - marginTop;

    const timeIdx = Math.floor(
      (relX / plotWidth) * spectrogramData.times.length,
    );
    const freqIdx = Math.floor(
      (1 - relY / plotHeight) * spectrogramData.frequencies.length,
    );

    // Bounds check
    if (
      timeIdx < 0 ||
      timeIdx >= spectrogramData.times.length ||
      freqIdx < 0 ||
      freqIdx >= spectrogramData.frequencies.length
    ) {
      setHoverInfo(null);
      return;
    }

    // Get values
    const timeStart = spectrogramData.times[0];
    const relativeTime = spectrogramData.times[timeIdx] - timeStart;
    const frequency = spectrogramData.frequencies[freqIdx];
    const power = spectrogramData.power[timeIdx][freqIdx];
    const powerDB = spectrogramDB.powerDB[timeIdx][freqIdx];

    // Convert to display units
    const { timeUnit, freqUnit, timeScale, freqScale } = plotDimensions.current;
    const displayTime = relativeTime * timeScale;
    const displayFreq = frequency * freqScale;

    setHoverInfo({
      time: displayTime,
      frequency: displayFreq,
      power,
      powerDB,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      timeUnit,
      freqUnit,
    });
  };

  const handleMouseLeave = () => {
    setHoverInfo(null);
  };

  // Render canvas when data changes
  useEffect(() => {
    if (!canvasRef.current || !spectrogramData || !spectrogramDB) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { powerDB, minDB, maxDB } = spectrogramDB;
    const numTimes = spectrogramData.times.length;
    const numFreqs = spectrogramData.frequencies.length;

    // Set canvas size to match container
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Margins for axes and colorbar
    const marginLeft = 60;
    const marginBottom = 50;
    const marginTop = 10;
    const marginRight = 80; // Space for colorbar

    canvas.width = rect.width * dpr;
    canvas.height = 400 * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = "400px";

    ctx.scale(dpr, dpr);

    const plotWidth = rect.width - marginLeft - marginRight;
    const plotHeight = 400 - marginTop - marginBottom;

    // Store dimensions for hover calculations
    plotDimensions.current.marginLeft = marginLeft;
    plotDimensions.current.marginTop = marginTop;
    plotDimensions.current.marginRight = marginRight;
    plotDimensions.current.marginBottom = marginBottom;
    plotDimensions.current.plotWidth = plotWidth;
    plotDimensions.current.plotHeight = plotHeight;

    const imageData = ctx.createImageData(numTimes, numFreqs);

    // Fill image data with colors
    for (let t = 0; t < numTimes; t++) {
      for (let f = 0; f < numFreqs; f++) {
        const db = powerDB[t][f];
        const normalized = (db - minDB) / (maxDB - minDB);

        // Get RGB color (jet colormap)
        const [r, g, b] = getJetColor(normalized);

        // Image data is stored bottom-to-top for spectrograms
        // Flip frequency axis so low freq is at bottom
        const imgIdx = ((numFreqs - 1 - f) * numTimes + t) * 4;
        imageData.data[imgIdx] = r;
        imageData.data[imgIdx + 1] = g;
        imageData.data[imgIdx + 2] = b;
        imageData.data[imgIdx + 3] = 255; // Alpha
      }
    }

    // Create temporary canvas at native resolution
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = numTimes;
    tempCanvas.height = numFreqs;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;

    tempCtx.putImageData(imageData, 0, 0);

    // Clear canvas
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, rect.width, 400);

    // Scale and draw spectrogram with margins
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(tempCanvas, marginLeft, marginTop, plotWidth, plotHeight);

    // Draw black border around spectrogram
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.strokeRect(marginLeft, marginTop, plotWidth, plotHeight);

    // Draw axis lines (thinner than border)
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;

    // X-axis labels (Time - START FROM 0!)
    ctx.fillStyle = "#000";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";

    // Calculate time duration (relative time starting from 0)
    const timeStart = spectrogramData.times[0];
    const timeEnd = spectrogramData.times[spectrogramData.times.length - 1];
    const timeDurationDays = timeEnd - timeStart;

    // Automatically choose time units based on duration
    let timeUnit: string;
    let timeScale: number;
    let timeDuration: number;

    if (timeDurationDays < 1) {
      // Less than 1 day: use seconds
      timeUnit = "s";
      timeScale = 86400; // Convert days to seconds
      timeDuration = timeDurationDays * timeScale;
    } else if (timeDurationDays < 365) {
      // Less than 1 year: use days
      timeUnit = "days";
      timeScale = 1;
      timeDuration = timeDurationDays;
    } else {
      // 1+ years: use years
      timeUnit = "years";
      timeScale = 1 / 365.25; // Convert days to years
      timeDuration = timeDurationDays * timeScale;
    }

    // Store for hover
    plotDimensions.current.timeDuration = timeDuration;
    plotDimensions.current.timeUnit = timeUnit;
    plotDimensions.current.timeScale = timeScale;

    const numXTicks = 6;
    for (let i = 0; i <= numXTicks; i++) {
      const x = marginLeft + (i / numXTicks) * plotWidth;
      // Show relative time from 0 in appropriate units
      const relativeTime = (i / numXTicks) * timeDuration;

      // Draw tick
      ctx.beginPath();
      ctx.moveTo(x, marginTop + plotHeight);
      ctx.lineTo(x, marginTop + plotHeight + 5);
      ctx.stroke();

      // Draw label - format based on magnitude
      let label: string;
      if (timeUnit === "s") {
        label = relativeTime.toFixed(0);
      } else if (relativeTime >= 100) {
        label = relativeTime.toFixed(0);
      } else if (relativeTime >= 1) {
        label = relativeTime.toFixed(1);
      } else {
        label = relativeTime.toFixed(2);
      }
      ctx.fillText(label, x, marginTop + plotHeight + 20);
    }

    // X-axis title with appropriate units
    ctx.textAlign = "center";
    ctx.font = "12px sans-serif";
    const timeAxisLabel =
      timeUnit === "s"
        ? "Time (seconds)"
        : timeUnit === "days"
          ? "Time (days)"
          : "Time (years)";
    ctx.fillText(timeAxisLabel, marginLeft + plotWidth / 2, 400 - 10);

    // Y-axis labels (Frequency)
    ctx.textAlign = "right";
    ctx.font = "11px sans-serif";

    // Automatically choose frequency units based on max frequency
    const maxFreq =
      spectrogramData.frequencies[spectrogramData.frequencies.length - 1];
    let freqUnit: string;
    let freqScale: number;

    if (maxFreq > 1) {
      // High frequency (audio data): use Hz
      freqUnit = "Hz";
      freqScale = 1;
    } else if (maxFreq > 0.01) {
      // Medium frequency (daily climate data): use cycles/day
      freqUnit = "cycles/day";
      freqScale = 1;
    } else {
      // Low frequency (monthly/annual climate data): use cycles/year
      freqUnit = "cycles/year";
      freqScale = 365.25; // Convert cycles/day to cycles/year
    }

    // Store for hover
    plotDimensions.current.maxFreq = maxFreq;
    plotDimensions.current.freqUnit = freqUnit;
    plotDimensions.current.freqScale = freqScale;

    const numYTicks = 5;
    for (let i = 0; i <= numYTicks; i++) {
      const y = marginTop + plotHeight - (i / numYTicks) * plotHeight;
      const freqValue = (i / numYTicks) * maxFreq * freqScale;

      // Draw tick
      ctx.beginPath();
      ctx.moveTo(marginLeft - 5, y);
      ctx.lineTo(marginLeft, y);
      ctx.stroke();

      // Draw label - format based on magnitude
      let label: string;
      if (freqValue >= 100) {
        label = freqValue.toFixed(0);
      } else if (freqValue >= 1) {
        label = freqValue.toFixed(1);
      } else if (freqValue >= 0.01) {
        label = freqValue.toFixed(2);
      } else {
        label = freqValue.toFixed(3);
      }
      ctx.fillText(label, marginLeft - 10, y + 4);
    }

    // Y-axis title (rotated) with appropriate units
    ctx.save();
    ctx.translate(15, marginTop + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.font = "12px sans-serif";
    const freqAxisLabel = `Frequency (${freqUnit})`;
    ctx.fillText(freqAxisLabel, 0, 0);
    ctx.restore();

    // Draw colorbar on the right
    const colorbarX = marginLeft + plotWidth + 20;
    const colorbarWidth = 20;
    const colorbarHeight = plotHeight;

    // Draw colorbar gradient
    for (let i = 0; i < colorbarHeight; i++) {
      const normalized = 1 - i / colorbarHeight; // Top = max, bottom = min
      const [r, g, b] = getJetColor(normalized);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(colorbarX, marginTop + i, colorbarWidth, 1);
    }

    // Draw colorbar border
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.strokeRect(colorbarX, marginTop, colorbarWidth, colorbarHeight);

    // Draw colorbar ticks and labels
    ctx.textAlign = "left";
    ctx.font = "11px sans-serif";
    const numColorTicks = 5;
    for (let i = 0; i <= numColorTicks; i++) {
      const y = marginTop + (i / numColorTicks) * colorbarHeight;
      const dbValue = maxDB - (i / numColorTicks) * (maxDB - minDB);

      // Draw tick
      ctx.beginPath();
      ctx.moveTo(colorbarX + colorbarWidth, y);
      ctx.lineTo(colorbarX + colorbarWidth + 5, y);
      ctx.stroke();

      // Draw label
      ctx.fillText(dbValue.toFixed(0), colorbarX + colorbarWidth + 8, y + 4);
    }
  }, [spectrogramData, spectrogramDB]);

  // Jet colormap function
  const getJetColor = (normalized: number): [number, number, number] => {
    const clamp = (val: number) => Math.max(0, Math.min(255, Math.floor(val)));

    let r, g, b;
    if (normalized < 0.25) {
      r = 0;
      g = normalized * 4 * 255;
      b = 255;
    } else if (normalized < 0.5) {
      r = 0;
      g = 255;
      b = (0.5 - normalized) * 4 * 255;
    } else if (normalized < 0.75) {
      r = (normalized - 0.5) * 4 * 255;
      g = 255;
      b = 0;
    } else {
      r = 255;
      g = (1 - normalized) * 4 * 255;
      b = 0;
    }

    return [clamp(r), clamp(g), clamp(b)];
  };

  if (!spectrogramData || !spectrogramDB) {
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
            Select a dataset with sufficient data points (need at least{" "}
            {windowSize} points)
          </div>
        </CardContent>
      </Card>
    );
  }

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
                  <SelectTrigger className="h-8 w-[350px] text-xs">
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
        <div
          ref={containerRef}
          className="relative"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Canvas for spectrogram - MUCH faster than SVG */}
          <canvas
            ref={canvasRef}
            className="w-full rounded border"
            style={{ height: "400px" }}
          />

          {/* Hover tooltip */}
          {hoverInfo && (
            <div
              className="pointer-events-none absolute z-10 rounded bg-black/90 px-3 py-2 text-xs text-white shadow-lg"
              style={{
                left: hoverInfo.x + 15,
                top: hoverInfo.y - 10,
                transform:
                  hoverInfo.x > containerRef.current!.clientWidth - 200
                    ? "translateX(-100%) translateX(-30px)"
                    : "none",
              }}
            >
              <div className="space-y-1">
                <div>
                  <span className="font-semibold">Time:</span>{" "}
                  {hoverInfo.time.toFixed(2)} {hoverInfo.timeUnit}
                </div>
                <div>
                  <span className="font-semibold">Frequency:</span>{" "}
                  {hoverInfo.frequency.toFixed(3)} {hoverInfo.freqUnit}
                </div>
                <div>
                  <span className="font-semibold">Power:</span>{" "}
                  {hoverInfo.powerDB.toFixed(1)} dB
                </div>
                <div className="text-xs opacity-75">
                  ({hoverInfo.power.toExponential(2)} linear)
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="text-muted-foreground mt-4 text-xs">
          <p>
            <strong>Interpretation:</strong> The spectrogram shows how the
            frequency content of the signal changes over time. Brighter
            (red/yellow) colors indicate stronger power at that frequency and
            time. Horizontal bands indicate sustained periodic behavior. Power
            is displayed in decibels (dB). Hover over the plot to see values.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
