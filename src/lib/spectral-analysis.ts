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

export type FrequencyScale =
  | "k"
  | "cycles-per-year"
  | "cycles-per-month"
  | "period-months";

/**
 * Compute periodogram from climate time series data
 * Returns power spectrum preserving variance interpretation
 */
export function computePeriodogram(
  data: number[],
  samplingInfo: { samplingRate: number; isDaily: boolean; isMonthly: boolean },
): {
  k: number[];
  frequencies: number[];
  power: number[];
  samplingInfo: {
    samplingRate: number;
    totalPoints: number;
    isDaily: boolean;
    isMonthly: boolean;
  };
} {
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
  const k: number[] = [];
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

    // Frequency index
    k.push(i);

    // Frequency in cycles per day (base unit)
    const freq = (i * samplingInfo.samplingRate) / n;
    frequencies.push(freq);
  }

  return {
    k,
    frequencies,
    power,
    samplingInfo: {
      samplingRate: samplingInfo.samplingRate,
      totalPoints: N,
      isDaily: samplingInfo.isDaily,
      isMonthly: samplingInfo.isMonthly,
    },
  };
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
  const numFreqs = Math.floor(nfft / 2) + 1; // Include Nyquist
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
      // Parseval's theorem: sum of |X[k]|^2 = sum of |x[n]|^2
      // For one-sided spectrum: multiply by 2 (except DC and Nyquist)
      // Normalize by: N (FFT length) and window energy
      let powerValue: number;
      if (i === 0 || i === numFreqs - 1) {
        // DC and Nyquist: no factor of 2
        powerValue = magnitudeSq / (windowSumSq * nfft);
      } else {
        // All other frequencies: factor of 2 for one-sided spectrum
        powerValue = (2 * magnitudeSq) / (windowSumSq * nfft);
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
 * Returns sampling info including data type detection
 */
export function estimateSamplingRate(dates: string[]): {
  samplingRate: number;
  isDaily: boolean;
  isMonthly: boolean;
} {
  if (dates.length < 2)
    return { samplingRate: 1.0, isDaily: false, isMonthly: false };

  // Calculate median time difference between consecutive points
  const diffs: number[] = [];
  for (let i = 1; i < Math.min(dates.length, 100); i++) {
    const t1 = new Date(dates[i - 1]).getTime();
    const t2 = new Date(dates[i]).getTime();
    const diff = t2 - t1;
    if (diff > 0) diffs.push(diff);
  }

  if (diffs.length === 0)
    return { samplingRate: 1.0, isDaily: false, isMonthly: false };

  // Calculate median diff
  diffs.sort((a, b) => a - b);
  const medianDiff = diffs[Math.floor(diffs.length / 2)];

  // Convert to days
  const medianDiffDays = medianDiff / (1000 * 60 * 60 * 24);

  // Determine if data is daily or monthly
  const isDaily = medianDiffDays >= 0.8 && medianDiffDays <= 1.2; // ~1 day
  const isMonthly = medianDiffDays >= 28 && medianDiffDays <= 31; // ~30 days

  // Return sampling rate in samples per day
  return {
    samplingRate: 1.0 / medianDiffDays,
    isDaily,
    isMonthly,
  };
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

/**
 * Convert frequency scale for climate data visualization
 */
export function convertFrequencyScale(
  baseFrequencies: number[],
  scale: FrequencyScale,
  isDaily: boolean,
  isMonthly: boolean,
): number[] {
  switch (scale) {
    case "k":
      // Return frequency indices
      return baseFrequencies.map((_, i) => i);

    case "cycles-per-year":
      // Convert cycles/day to cycles/year
      return baseFrequencies.map((f) => f * 365.25);

    case "cycles-per-month":
      // Convert cycles/day to cycles/month
      return baseFrequencies.map((f) => f * 30.4375); // Average days per month

    case "period-months":
      // Period in months (1/frequency, converted to months)
      return baseFrequencies.map((f) => {
        if (f === 0) return Infinity;
        // Convert from cycles/day to period in months
        const periodDays = 1 / f;
        return periodDays / 30.4375; // Convert days to months
      });

    default:
      return baseFrequencies;
  }
}

/**
 * Get label for frequency scale
 */
export function getFrequencyLabel(scale: FrequencyScale): string {
  switch (scale) {
    case "k":
      return "Frequency Index (k)";
    case "cycles-per-year":
      return "Cycles per Year";
    case "cycles-per-month":
      return "Cycles per Month";
    case "period-months":
      return "Period (Months)";
    default:
      return "Frequency";
  }
}