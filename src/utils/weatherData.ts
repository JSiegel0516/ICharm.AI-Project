export interface WeatherDataPoint {
  lat: number;
  lon: number;
  value: number;
  timestamp?: Date;
}

export interface DataBounds {
  north: number;
  south: number;
  east: number;
  west: number;
  min: number;
  max: number;
}

export interface ProcessedWeatherData {
  points: WeatherDataPoint[];
  bounds: DataBounds;
  statistics: {
    mean: number;
    median: number;
    standardDeviation: number;
    count: number;
  };
  gridResolution: {
    lat: number;
    lon: number;
  };
}

// Utility functions for processing weather data
export class WeatherDataProcessor {
  /**
   * Process raw weather data into a standardized format
   */
  static processRawData(
    rawData: number[][], // [lat, lon, value]
    metadata?: {
      unit?: string;
      source?: string;
      timestamp?: Date;
    },
  ): ProcessedWeatherData {
    const points: WeatherDataPoint[] = rawData.map(([lat, lon, value]) => ({
      lat,
      lon,
      value,
      timestamp: metadata?.timestamp,
    }));

    const bounds = this.calculateBounds(points);
    const statistics = this.calculateStatistics(points.map((p) => p.value));
    const gridResolution = this.estimateGridResolution(points);

    return {
      points,
      bounds,
      statistics,
      gridResolution,
    };
  }

  /**
   * Calculate geographic and value bounds
   */
  private static calculateBounds(points: WeatherDataPoint[]): DataBounds {
    if (points.length === 0) {
      return { north: 0, south: 0, east: 0, west: 0, min: 0, max: 0 };
    }

    let north = -90,
      south = 90,
      east = -180,
      west = 180;
    let min = Infinity,
      max = -Infinity;

    for (const point of points) {
      north = Math.max(north, point.lat);
      south = Math.min(south, point.lat);
      east = Math.max(east, point.lon);
      west = Math.min(west, point.lon);
      min = Math.min(min, point.value);
      max = Math.max(max, point.value);
    }

    return { north, south, east, west, min, max };
  }

  /**
   * Calculate basic statistics for the dataset
   */
  private static calculateStatistics(values: number[]): {
    mean: number;
    median: number;
    standardDeviation: number;
    count: number;
  } {
    if (values.length === 0) {
      return { mean: 0, median: 0, standardDeviation: 0, count: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = values.length;
    const mean = values.reduce((sum, val) => sum + val, 0) / count;

    const median =
      count % 2 === 0
        ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
        : sorted[Math.floor(count / 2)];

    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / count;
    const standardDeviation = Math.sqrt(variance);

    return { mean, median, standardDeviation, count };
  }

  /**
   * Estimate grid resolution from data points
   */
  private static estimateGridResolution(points: WeatherDataPoint[]): {
    lat: number;
    lon: number;
  } {
    if (points.length < 2) {
      return { lat: 1, lon: 1 };
    }

    // Find minimum differences between adjacent points
    const latDiffs = new Set<number>();
    const lonDiffs = new Set<number>();

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < Math.min(points.length, i + 100); j++) {
        const latDiff = Math.abs(points[i].lat - points[j].lat);
        const lonDiff = Math.abs(points[i].lon - points[j].lon);

        if (latDiff > 0 && latDiff < 10) latDiffs.add(latDiff);
        if (lonDiff > 0 && lonDiff < 10) lonDiffs.add(lonDiff);
      }
    }

    const latRes = latDiffs.size > 0 ? Math.min(...Array.from(latDiffs)) : 1;
    const lonRes = lonDiffs.size > 0 ? Math.min(...Array.from(lonDiffs)) : 1;

    return { lat: latRes, lon: lonRes };
  }

  /**
   * Filter data points by geographic bounds
   */
  static filterByBounds(
    points: WeatherDataPoint[],
    bounds: { north: number; south: number; east: number; west: number },
  ): WeatherDataPoint[] {
    return points.filter(
      (point) =>
        point.lat >= bounds.south &&
        point.lat <= bounds.north &&
        point.lon >= bounds.west &&
        point.lon <= bounds.east,
    );
  }

  /**
   * Find nearest data point to given coordinates
   */
  static findNearestPoint(
    points: WeatherDataPoint[],
    targetLat: number,
    targetLon: number,
  ): WeatherDataPoint | null {
    if (points.length === 0) return null;

    let nearestPoint = points[0];
    let minDistance = this.calculateDistance(
      targetLat,
      targetLon,
      nearestPoint.lat,
      nearestPoint.lon,
    );

    for (const point of points) {
      const distance = this.calculateDistance(
        targetLat,
        targetLon,
        point.lat,
        point.lon,
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = point;
      }
    }

    return nearestPoint;
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  private static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Interpolate value at specific coordinates using inverse distance weighting
   */
  static interpolateValue(
    points: WeatherDataPoint[],
    targetLat: number,
    targetLon: number,
    power: number = 2,
    maxDistance: number = 5, // degrees
  ): number | null {
    const nearbyPoints = points.filter((point) => {
      const distance = this.calculateDistance(
        targetLat,
        targetLon,
        point.lat,
        point.lon,
      );
      return distance <= maxDistance * 111; // Convert degrees to km approximately
    });

    if (nearbyPoints.length === 0) return null;
    if (nearbyPoints.length === 1) return nearbyPoints[0].value;

    let numerator = 0;
    let denominator = 0;

    for (const point of nearbyPoints) {
      const distance = this.calculateDistance(
        targetLat,
        targetLon,
        point.lat,
        point.lon,
      );

      if (distance === 0) {
        return point.value; // Exact match
      }

      const weight = 1 / Math.pow(distance, power);
      numerator += point.value * weight;
      denominator += weight;
    }

    return denominator > 0 ? numerator / denominator : null;
  }

  /**
   * Create a regular grid from scattered data points
   */
  static createGrid(
    points: WeatherDataPoint[],
    bounds: DataBounds,
    resolution: { lat: number; lon: number },
  ): WeatherDataPoint[] {
    const gridPoints: WeatherDataPoint[] = [];

    for (let lat = bounds.south; lat <= bounds.north; lat += resolution.lat) {
      for (let lon = bounds.west; lon <= bounds.east; lon += resolution.lon) {
        const interpolatedValue = this.interpolateValue(points, lat, lon);

        if (interpolatedValue !== null) {
          gridPoints.push({
            lat: Math.round(lat * 100) / 100, // Round to 2 decimal places
            lon: Math.round(lon * 100) / 100,
            value: interpolatedValue,
          });
        }
      }
    }

    return gridPoints;
  }

  /**
   * Apply smoothing filter to reduce noise in data
   */
  static smoothData(
    points: WeatherDataPoint[],
    radius: number = 2, // degrees
  ): WeatherDataPoint[] {
    return points.map((point) => {
      const nearbyPoints = points.filter((p) => {
        const distance = this.calculateDistance(
          point.lat,
          point.lon,
          p.lat,
          p.lon,
        );
        return distance <= radius * 111; // Convert to km
      });

      if (nearbyPoints.length <= 1) {
        return point;
      }

      const averageValue =
        nearbyPoints.reduce((sum, p) => sum + p.value, 0) / nearbyPoints.length;

      return {
        ...point,
        value: averageValue,
      };
    });
  }

  /**
   * Detect and remove outliers using statistical methods
   */
  static removeOutliers(
    points: WeatherDataPoint[],
    method: "iqr" | "zscore" = "iqr",
    threshold: number = 1.5,
  ): WeatherDataPoint[] {
    if (points.length === 0) return points;

    const values = points.map((p) => p.value);
    let outlierIndices: Set<number>;

    if (method === "iqr") {
      // Interquartile Range method
      const sorted = [...values].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1;
      const lowerBound = q1 - threshold * iqr;
      const upperBound = q3 + threshold * iqr;

      outlierIndices = new Set(
        values
          .map((value, index) =>
            value < lowerBound || value > upperBound ? index : -1,
          )
          .filter((index) => index !== -1),
      );
    } else {
      // Z-score method
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
      const stdDev = Math.sqrt(
        values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
          values.length,
      );

      outlierIndices = new Set(
        values
          .map((value, index) =>
            Math.abs((value - mean) / stdDev) > threshold ? index : -1,
          )
          .filter((index) => index !== -1),
      );
    }

    return points.filter((_, index) => !outlierIndices.has(index));
  }

  /**
   * Convert coordinates between different formats
   */
  static convertCoordinates(
    lat: number,
    lon: number,
    fromFormat: "decimal" | "dms",
    toFormat: "decimal" | "dms",
  ): { lat: number | string; lon: number | string } {
    if (fromFormat === toFormat) {
      return { lat, lon };
    }

    if (fromFormat === "decimal" && toFormat === "dms") {
      return {
        lat: this.decimalToDMS(lat, true),
        lon: this.decimalToDMS(lon, false),
      };
    } else if (fromFormat === "dms" && toFormat === "decimal") {
      // This would need DMS input parsing - simplified for now
      return { lat, lon };
    }

    return { lat, lon };
  }

  private static decimalToDMS(decimal: number, isLatitude: boolean): string {
    const absolute = Math.abs(decimal);
    const degrees = Math.floor(absolute);
    const minutes = Math.floor((absolute - degrees) * 60);
    const seconds =
      Math.round(((absolute - degrees) * 60 - minutes) * 60 * 100) / 100;

    const direction = isLatitude
      ? decimal >= 0
        ? "N"
        : "S"
      : decimal >= 0
        ? "E"
        : "W";

    return `${degrees}°${minutes}'${seconds.toFixed(2)}"${direction}`;
  }

  /**
   * Calculate gradient (rate of change) between neighboring points
   */
  static calculateGradient(points: WeatherDataPoint[]): WeatherDataPoint[] {
    return points.map((point) => {
      const neighbors = points.filter((p) => {
        const distance = this.calculateDistance(
          point.lat,
          point.lon,
          p.lat,
          p.lon,
        );
        return distance > 0 && distance <= 200; // Within 200km
      });

      if (neighbors.length === 0) {
        return { ...point, value: 0 };
      }

      // Calculate average gradient magnitude
      let gradientSum = 0;
      for (const neighbor of neighbors) {
        const distance = this.calculateDistance(
          point.lat,
          point.lon,
          neighbor.lat,
          neighbor.lon,
        );
        const gradient = Math.abs(neighbor.value - point.value) / distance;
        gradientSum += gradient;
      }

      return {
        ...point,
        value: gradientSum / neighbors.length,
      };
    });
  }
}

// Export utility functions for common operations
export function formatCoordinates(
  lat: number,
  lon: number,
  precision: number = 2,
): string {
  const latStr = `${Math.abs(lat).toFixed(precision)}°${lat >= 0 ? "N" : "S"}`;
  const lonStr = `${Math.abs(lon).toFixed(precision)}°${lon >= 0 ? "E" : "W"}`;
  return `${latStr}, ${lonStr}`;
}

export function formatValue(
  value: number,
  unit: string,
  precision: number = 1,
): string {
  return `${value.toFixed(precision)} ${unit}`;
}

export function isValidCoordinate(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function normalizeValue(
  value: number,
  min: number,
  max: number,
): number {
  if (max === min) return 0;
  return (value - min) / (max - min);
}

export function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
