/**
 * Spectral Analysis Utilities
 * Based on R code for periodogram and spectrogram generation
 */

import FFT from "fft.js";

export interface PeriodogramData {
  frequencies: number[];
  power: number[]; // in dB
}

export interface SpectrogramData {
  times: number[];
  frequencies: number[];
  power: number[][]; // 2D array: [time][frequency] in dB
}

/**
 * Compute periodogram from time series data
 * Based on R code: FF = abs(fft(x)/sqrt(length(x)))^2
 */
export function computePeriodogram(
  data: number[],
  samplingRate: number = 1.0,
): PeriodogramData {
  // Remove mean (anomaly data)
  const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
  const anomalyData = data.map((val) => val - mean);

  // Find next power of 2 for FFT efficiency
  const n = Math.pow(2, Math.ceil(Math.log2(anomalyData.length)));
  
  // Pad with zeros if necessary
  const paddedData = new Array(n).fill(0);
  for (let i = 0; i < anomalyData.length; i++) {
    paddedData[i] = anomalyData[i];
  }

  // Perform FFT
  const fft = new FFT(n);
  const out = fft.createComplexArray();
  fft.realTransform(out, paddedData);

  // Compute power: abs(fft(x)/sqrt(length(x)))^2
  const power: number[] = [];
  const frequencies: number[] = [];
  
  // Only need first half of FFT (Nyquist)
  const halfN = Math.floor(n / 2);
  
  for (let i = 0; i < halfN; i++) {
    const real = out[2 * i];
    const imag = out[2 * i + 1];
    
    // Magnitude squared, normalized
    const magnitude = Math.sqrt(real * real + imag * imag) / Math.sqrt(n);
    const powerValue = magnitude * magnitude;
    
    // Convert to dB: 10 * log10(power)
    const powerDB = powerValue > 0 ? 10 * Math.log10(powerValue) : -100;
    
    power.push(powerDB);
    
    // Frequency corresponding to this bin
    const freq = (i * samplingRate) / n;
    frequencies.push(freq);
  }

  return { frequencies, power };
}

/**
 * Compute spectrogram (time-frequency representation)
 * Based on R code using specgram with overlapping windows
 */
export function computeSpectrogram(
  data: number[],
  samplingRate: number = 1.0,
  windowSize: number = 256,
  overlap: number = 128,
  nfft: number = 1024,
): SpectrogramData {
  // Remove mean
  const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
  const anomalyData = data.map((val) => val - mean);

  const hopSize = windowSize - overlap;
  const numWindows = Math.floor((anomalyData.length - overlap) / hopSize);

  // Hanning window function
  const hannWindow = new Array(windowSize);
  for (let i = 0; i < windowSize; i++) {
    hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSize - 1)));
  }

  const fft = new FFT(nfft);
  const times: number[] = [];
  const power: number[][] = [];
  
  // Frequencies (only up to Nyquist)
  const frequencies: number[] = [];
  const numFreqs = Math.floor(nfft / 2);
  for (let i = 0; i < numFreqs; i++) {
    frequencies.push((i * samplingRate) / nfft);
  }

  // Process each window
  for (let w = 0; w < numWindows; w++) {
    const start = w * hopSize;
    const end = start + windowSize;
    
    if (end > anomalyData.length) break;

    // Extract window and apply Hanning
    const windowData = new Array(nfft).fill(0);
    for (let i = 0; i < windowSize; i++) {
      windowData[i] = anomalyData[start + i] * hannWindow[i];
    }

    // Perform FFT
    const out = fft.createComplexArray();
    fft.realTransform(out, windowData);

    // Compute power for this window
    const windowPower: number[] = [];
    for (let i = 0; i < numFreqs; i++) {
      const real = out[2 * i];
      const imag = out[2 * i + 1];
      
      const magnitude = Math.sqrt(real * real + imag * imag);
      const powerValue = magnitude * magnitude;
      
      // Convert to dB: 10 * log10(power)
      const powerDB = powerValue > 0 ? 10 * Math.log10(powerValue) : -100;
      windowPower.push(powerDB);
    }

    power.push(windowPower);
    
    // Time for this window (center of window)
    const timeCenter = (start + windowSize / 2) / samplingRate;
    times.push(timeCenter);
  }

  return { times, frequencies, power };
}

/**
 * Estimate sampling rate from time series data with date strings
 * Assumes dates are in chronological order
 */
export function estimateSamplingRate(dates: string[]): number {
  if (dates.length < 2) return 1.0;

  // Calculate average time difference between consecutive points
  const diffs: number[] = [];
  for (let i = 1; i < Math.min(dates.length, 100); i++) {
    const t1 = new Date(dates[i - 1]).getTime();
    const t2 = new Date(dates[i]).getTime();
    const diff = t2 - t1;
    if (diff > 0) diffs.push(diff);
  }

  if (diffs.length === 0) return 1.0;

  // Average diff in milliseconds
  const avgDiff = diffs.reduce((sum, d) => sum + d, 0) / diffs.length;
  
  // Convert to sampling rate (samples per day, or per month, etc.)
  // For daily data: ~86400000 ms
  // For monthly data: ~2592000000 ms
  
  // Return samples per unit time (normalized)
  // For visualization purposes, we can just use 1/avgDiff
  return 1.0 / avgDiff * 86400000; // samples per day
}

/**
 * Extract time series values from chart data for a specific dataset
 */
export function extractTimeSeriesValues(
  chartData: any[],
  datasetId: string,
): { dates: string[]; values: number[] } {
  const dates: string[] = [];
  const values: number[] = [];

  chartData.forEach((point) => {
    const value = point[datasetId];
    if (
      typeof value === "number" &&
      !isNaN(value) &&
      value !== null &&
      point.date
    ) {
      dates.push(point.date);
      values.push(value);
    }
  });

  return { dates, values };
}