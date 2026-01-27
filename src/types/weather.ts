// services/weather.ts

export interface WeatherData {
  id: string;
  name: string;
  description: string;
  unit: string;
  values: number[][]; // [lat, lon, value]
  bounds: {
    min: number;
    max: number;
  };
  timestamp: Date;
}

export interface DatasetInfo {
  id: string;
  name: string;
  description: string;
  unit: string;
  type: "temperature" | "precipitation" | "pressure" | "wind" | "humidity";
  temporalResolution: "hourly" | "daily" | "monthly" | "annual";
  spatialResolution: string;
  source: string;
  lastUpdated: Date;
}

class WeatherService {
  private static instance: WeatherService;
  private cache = new Map<string, WeatherData>();

  static getInstance(): WeatherService {
    if (!WeatherService.instance) {
      WeatherService.instance = new WeatherService();
    }
    return WeatherService.instance;
  }

  // Available datasets
  private datasets: DatasetInfo[] = [
    {
      id: "air-temp-monthly",
      name: "Air Temperature",
      description: "Global air temperature data with monthly averages",
      unit: "°C",
      type: "temperature",
      temporalResolution: "monthly",
      spatialResolution: "1° x 1°",
      source: "ERA5 Reanalysis",
      lastUpdated: new Date(),
    },
    {
      id: "precipitation-monthly",
      name: "Precipitation",
      description: "Monthly precipitation totals worldwide",
      unit: "mm",
      type: "precipitation",
      temporalResolution: "monthly",
      spatialResolution: "1° x 1°",
      source: "GPCP",
      lastUpdated: new Date(),
    },
    {
      id: "sea-surface-temp",
      name: "Sea Surface Temperature",
      description: "Ocean surface temperature measurements",
      unit: "°C",
      type: "temperature",
      temporalResolution: "daily",
      spatialResolution: "0.25° x 0.25°",
      source: "NOAA OI SST",
      lastUpdated: new Date(),
    },
    {
      id: "wind-speed-10m",
      name: "Wind Speed (10m)",
      description: "Wind speed at 10 meters above surface",
      unit: "m/s",
      type: "wind",
      temporalResolution: "daily",
      spatialResolution: "1° x 1°",
      source: "ERA5 Reanalysis",
      lastUpdated: new Date(),
    },
  ];

  async getAvailableDatasets(): Promise<DatasetInfo[]> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 300));
    return [...this.datasets];
  }

  async getDatasetInfo(datasetId: string): Promise<DatasetInfo | null> {
    const dataset = this.datasets.find((d) => d.id === datasetId);
    return dataset || null;
  }

  async getClimateData(datasetId: string): Promise<WeatherData> {
    // Check cache first
    if (this.cache.has(datasetId)) {
      return this.cache.get(datasetId)!;
    }

    // Simulate API loading delay
    await new Promise((resolve) =>
      setTimeout(resolve, 1000 + Math.random() * 1500),
    );

    const dataset = this.datasets.find((d) => d.id === datasetId);
    if (!dataset) {
      throw new Error(`Dataset ${datasetId} not found`);
    }

    // Generate mock data based on dataset type
    const mockData = this.generateMockData(dataset);

    // Cache the result
    this.cache.set(datasetId, mockData);

    return mockData;
  }

  private generateMockData(dataset: DatasetInfo): WeatherData {
    const values: number[][] = [];
    let min = Infinity;
    let max = -Infinity;

    // Generate data points for a global grid
    for (let lat = -90; lat <= 90; lat += 2) {
      for (let lon = -180; lon <= 180; lon += 2) {
        let value = 0;

        switch (dataset.type) {
          case "temperature":
            // Temperature varies with latitude and adds some randomness
            value =
              Math.cos((lat * Math.PI) / 180) * 30 + Math.random() * 10 - 5;
            if (dataset.id === "sea-surface-temp") {
              // Ocean temperatures are more moderate
              value = Math.cos((lat * Math.PI) / 180) * 25 + Math.random() * 5;
            }
            break;

          case "precipitation":
            // More precipitation near equator and in certain regions
            const latEffect = Math.max(0, 1 - Math.abs(lat) / 60);
            const seasonalEffect = Math.random() * 0.5 + 0.5;
            value = latEffect * 200 * seasonalEffect + Math.random() * 50;
            break;

          case "wind":
            // Higher wind speeds at certain latitudes
            const windBelt =
              Math.abs(Math.abs(lat) - 30) < 10 ||
              Math.abs(Math.abs(lat) - 60) < 10;
            value = (windBelt ? 15 : 5) + Math.random() * 10;
            break;

          case "pressure":
            // Standard atmospheric pressure with variations
            value = 1013.25 + (Math.random() - 0.5) * 50;
            break;

          default:
            value = Math.random() * 100;
        }

        values.push([lat, lon, value]);
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }

    return {
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      unit: dataset?.unit,
      values,
      bounds: { min, max },
      timestamp: new Date(),
    };
  }

  async getRegionalData(
    datasetId: string,
    bounds: {
      north: number;
      south: number;
      east: number;
      west: number;
    },
  ): Promise<WeatherData> {
    const fullData = await this.getClimateData(datasetId);

    // Filter data to regional bounds
    const regionalValues = fullData.values.filter(
      ([lat, lon]) =>
        lat >= bounds.south &&
        lat <= bounds.north &&
        lon >= bounds.west &&
        lon <= bounds.east,
    );

    const regionalBounds = regionalValues.reduce(
      (acc, [, , value]) => ({
        min: Math.min(acc.min, value),
        max: Math.max(acc.max, value),
      }),
      { min: Infinity, max: -Infinity },
    );

    return {
      ...fullData,
      values: regionalValues,
      bounds: regionalBounds,
    };
  }

  // Get data for a specific point (nearest neighbor)
  async getPointData(
    datasetId: string,
    lat: number,
    lon: number,
  ): Promise<{
    value: number;
    unit: string;
    coordinates: { lat: number; lon: number };
  }> {
    const data = await this.getClimateData(datasetId);

    // Find nearest data point
    let nearestDistance = Infinity;
    let nearestValue = 0;
    let nearestCoords = { lat: 0, lon: 0 };

    for (const [dataLat, dataLon, value] of data.values) {
      const distance = Math.sqrt(
        Math.pow(lat - dataLat, 2) + Math.pow(lon - dataLon, 2),
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestValue = value;
        nearestCoords = { lat: dataLat, lon: dataLon };
      }
    }

    return {
      value: nearestValue,
      unit: data.unit,
      coordinates: nearestCoords,
    };
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const weatherDataService = WeatherService.getInstance();
