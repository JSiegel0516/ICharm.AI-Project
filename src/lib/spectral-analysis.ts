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
 * Compute periodogram from climate time series data
 * Returns power spectrum preserving variance interpretation
 */
export function computePeriodogram(
  data: number[],
  samplingRate: number = 1.0, // For daily data: 1.0, for monthly: 12.0
): PeriodogramData {
  const N = data.length;

  // 1. DETREND (not just remove mean) - Important for climate!
  const detrended = detrendLinear(data);

  // 2. Apply window (Hanning) to reduce spectral leakage
  const windowed = applyHanningWindow(detrended);

  // 3. Pad to next power of 2 for efficient FFT
  const n = Math.pow(2, Math.ceil(Math.log2(N)));
  const paddedData = new Array(n).fill(0);
  for (let i = 0; i < N; i++) {
    paddedData[i] = windowed[i];
  }

  // 4. Compute FFT
  const fft = new FFT(n);
  const out = fft.createComplexArray();
  fft.realTransform(out, paddedData);

  const power: number[] = [];
  const frequencies: number[] = [];
  const halfN = Math.floor(n / 2);

  // 5. Compute Power Spectral Density
  for (let i = 0; i < halfN; i++) {
    const real = out[2 * i];
    const imag = out[2 * i + 1];
    const magnitude = Math.sqrt(real * real + imag * imag);

    // Power Spectral Density (variance per frequency bin)
    // Correct normalization: 2 * |FFT|^2 / (N * W)
    // Factor of 2: because we only use positive frequencies
    // W: sum of squared window values (for Hanning: N * 3/8)
    const W = N * 0.375; // Hanning window correction factor
    const psd = (2 * magnitude * magnitude) / (N * W);

    power.push(psd); // Keep in linear scale (variance units)

    // Frequency in cycles per unit time
    const freq = (i * samplingRate) / n;
    frequencies.push(freq);
  }

  return { frequencies, power };
}

/**
 * Linear detrending - removes linear trend
 */
function detrendLinear(data: number[]): number[] {
  const N = data.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;

  for (let i = 0; i < N; i++) {
    sumX += i;
    sumY += data[i];
    sumXY += i * data[i];
    sumX2 += i * i;
  }

  const slope = (N * sumXY - sumX * sumY) / (N * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / N;

  return data.map((val, i) => val - (slope * i + intercept));
}

/**
 * Apply Hanning window
 */
function applyHanningWindow(data: number[]): number[] {
  const N = data.length;
  return data.map(
    (val, i) => val * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1))),
  );
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
  // 1. Linear Detrending (removes both mean and trend)
  const detrendedData = detrendLinear(data);

  const hopSize = windowSize - overlap;
  const numWindows = Math.floor((detrendedData.length - overlap) / hopSize);

  // 2. Window Function (Hanning) & Normalization Factor
  const hannWindow = new Array(windowSize);
  let windowSumSq = 0;
  for (let i = 0; i < windowSize; i++) {
    hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSize - 1)));
    windowSumSq += hannWindow[i] * hannWindow[i];
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

  for (let w = 0; w < numWindows; w++) {
    const start = w * hopSize;
    const end = start + windowSize;
    if (end > detrendedData.length) break;

    // 3. Apply Window and Zero-pad
    const windowData = new Array(nfft).fill(0);
    for (let i = 0; i < windowSize; i++) {
      windowData[i] = detrendedData[start + i] * hannWindow[i];
    }

    // 4. Perform FFT
    const out = fft.createComplexArray();
    fft.realTransform(out, windowData);

    const windowPower: number[] = [];
    for (let i = 0; i < numFreqs; i++) {
      const real = out[2 * i];
      const imag = out[2 * i + 1];

      const magnitudeSq = real * real + imag * imag;

      // 5. Compute Power Spectral Density (PSD)
      // One-sided spectrum (only positive frequencies)
      // Factor of 2 for all frequencies except DC (i=0) and Nyquist
      let powerValue: number;
      if (i === 0 || i === numFreqs - 1) {
        // DC and Nyquist: no factor of 2
        powerValue = magnitudeSq / (windowSumSq * samplingRate);
      } else {
        // All other frequencies: factor of 2 for one-sided spectrum
        powerValue = (2 * magnitudeSq) / (windowSumSq * samplingRate);
      }

      windowPower.push(powerValue);
    }

    power.push(windowPower);

    // Time center of window
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
  return (1.0 / avgDiff) * 86400000; // samples per day
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
