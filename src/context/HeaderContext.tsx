"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import type {
  Dataset,
  AppState,
  TemperatureUnit,
  RegionData,
  ColorBarOrientation,
} from "@/types";
import { mockDatasets } from "@/utils/constants";

type DatabaseDataset = {
  id: string;
  sourceName: string;
  datasetName: string;
  layerParameter: string;
  statistic: string;
  datasetType: string;
  levels: string;
  levelValues: string | null;
  levelUnits: string | null;
  stored: string;
  inputFile: string;
  keyVariable: string;
  units: string;
  spatialResolution: string;
  engine: string;
  kerchunkPath: string | null;
  origLocation: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
};

type DatabaseDataset = {
  id: string;
  sourceName: string;
  datasetName: string;
  layerParameter: string;
  statistic: string;
  datasetType: string;
  levels: string;
  levelValues: string | null;
  levelUnits: string | null;
  stored: string;
  inputFile: string;
  keyVariable: string;
  units: string;
  spatialResolution: string;
  engine: string;
  kerchunkPath: string | null;
  origLocation: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
};

type AppStateContextType = ReturnType<typeof useAppStateInternal>;

const AppStateContext = createContext<AppStateContextType | undefined>(
  undefined,
);

// Certain datasets report "present" in metadata even though archives stop earlier.
const DATASET_END_OVERRIDES: Record<string, string> = {
  "Sea Surface Temperature – Optimum Interpolation CDR": "2015-12-31",
};

// Parse date strings from database (handles formats like "1854/1/1" or "9/1/2025" or "present")
function parseDate(dateStr: string): Date {
  if (!dateStr || dateStr === "present" || dateStr.includes("present")) {
    return new Date();
  }

  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const [first, second, third] = parts.map((p) => parseInt(p));

    // Determine if it's YYYY/M/D or M/D/YYYY
    if (first > 1000) {
      // YYYY/M/D format
      return new Date(first, second - 1, third);
    } else {
      // M/D/YYYY format
      return new Date(third, first - 1, second);
    }
  }

  // Fallback to standard Date parsing
  return new Date(dateStr);
}

// Transform database dataset to app Dataset type
function transformDataset(db: DatabaseDataset): Dataset {
  return {
    id: db.id,
    name: db.datasetName,
    description: `${db.layerParameter} - ${db.statistic}`,
    dataType: db.datasetType,
    units: db.units,
    // Add default colorScale based on parameter type
    colorScale: generateColorScale(db.datasetName, db.layerParameter, db.units),
    // Store full backend data for reference
    backend: {
      ...db,
      startDate: db.startDate,
      endDate: DATASET_END_OVERRIDES[db.datasetName] ?? db.endDate,
      spatialResolution: db.spatialResolution,
      datasetName: db.datasetName,
      datasetType: db.datasetType,
    },
    // Parse dates for easy use
    startDate: parseDate(db.startDate),
    endDate: parseDate(DATASET_END_OVERRIDES[db.datasetName] ?? db.endDate),
  };
}

// Generate appropriate color scale based on dataset name and parameter type
function generateColorScale(
  datasetName: string,
  parameter: string,
  units: string,
) {
  const name = datasetName.toLowerCase();
  const param = parameter.toLowerCase();

  // Check for Sea Surface Temperature first (more specific)
  if (
    name.includes("sst") ||
    name.includes("sea surface temperature") ||
    name.includes("amsre") ||
    name.includes("modis") ||
    param.includes("sea surface")
  ) {
    return {
      labels: ["-2°C", "5°C", "12°C", "18°C", "25°C", "32°C"],
      colors: [
        "#08306b", // Very dark blue (coldest)
        "#2171b5", // Medium blue
        "#6baed6", // Light blue
        "#c6dbef", // Very pale blue
        "#fcbba1", // Pale pink
        "#fb6a4a", // Pink-red
        "#ef3b2c", // Red
        "#99000d", // Very dark red (warmest)
      ],
      min: -2,
      max: 35,
    };
  }

  // Air Temperature scales
  if (
    name.includes("air") ||
    name.includes("airtemp") ||
    param.includes("air temperature") ||
    param.includes("temperature") ||
    units.includes("degc") ||
    units.includes("kelvin")
  ) {
    return {
      labels: ["-40°C", "-20°C", "0°C", "20°C", "40°C"],
      colors: [
        "#313695", // Deep blue (coldest)
        "#4575b4", // Blue
        "#abd9e9", // Pale blue
        "#ffffbf", // Pale yellow (neutral)
        "#fdae61", // Orange
        "#f46d43", // Red-orange
        "#a50026", // Deep red (hottest)
      ],
      min: -40,
      max: 40,
    };
  }

  // Precipitation scales
  if (
    name.includes("precip") ||
    name.includes("precipitation") ||
    name.includes("rain") ||
    param.includes("precipitation") ||
    units.includes("mm")
  ) {
    return {
      labels: ["0", "100", "200", "300", "400", "500"],
      colors: [
        "#8B4513", // Saddle brown (very dry)
        "#CD853F", // Peru/tan (dry)
        "#F0E68C", // Khaki (slightly dry)
        "#90EE90", // Light green (moderate)
        "#00FA9A", // Medium spring green (wet)
        "#48D1CC", // Medium turquoise (wetter)
        "#4169E1", // Royal blue (extremely wet)
        "#0000CD", // Medium blue (wettest)
      ],
      min: 0,
      max: 500,
    };
  }

  // Wind/velocity scales
  if (
    param.includes("velocity") ||
    param.includes("wind") ||
    units.includes("m/s")
  ) {
    return {
      labels: ["0 m/s", "2 m/s", "4 m/s", "6 m/s", "8 m/s"],
      colors: ["#f0f0f0", "#90ee90", "#ffa500", "#ff4500", "#8b0000"],
      min: 0,
      max: 10,
    };
  }

  // Default scale
  return {
    labels: ["Low", "Medium-Low", "Medium", "Medium-High", "High"],
    colors: ["#440154", "#31688e", "#35b779", "#fde724", "#ff0000"],
    min: 0,
    max: 100,
  };
}

const useAppStateInternal = () => {
  const [state, setState] = useState<AppState>({
    showSettings: false,
    showAbout: false,
    showTutorial: false,
    showChat: false,
    showColorbar: true,
    showRegionInfo: false,
    datasets: mockDatasets, // Start with mock, will be replaced by DB data
    currentDataset: mockDatasets[0],
    globePosition: {
      latitude: 0,
      longitude: 0,
      zoom: 1,
    },
    isLoading: true, // Start as loading
    error: null,
    colorBarOrientation: "horizontal",
    globeSettings: {
      satelliteLayerVisible: true,
      boundaryLinesVisible: true,
      geographicLinesVisible: false,
      rasterOpacity: 0.65,
      hideZeroPrecipitation: false,
    },
  });

  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear(),
  );
  const [temperatureUnit, setTemperatureUnit] =
    useState<TemperatureUnit>("celsius");
  const [showRegionInfo, setShowRegionInfo] = useState<boolean>(false);
  const [regionInfoData, setRegionInfoData] = useState<{
    latitude: number;
    longitude: number;
    regionData: RegionData;
  }>({
    latitude: 21.25,
    longitude: -71.25,
    regionData: {
      name: "GPCP V2.3 Precipitation",
      precipitation: 0.9,
      temperature: 24.5,
      dataset: "Global Precipitation Climatology Project",
    },
  });

  const setShowSettings = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showSettings: show }));
  }, []);

  const setShowAbout = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showAbout: show }));
  }, []);

  const setShowTutorial = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showTutorial: show }));
  }, []);

  const setShowChat = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showChat: show }));
  }, []);

  const toggleColorbar = useCallback(() => {
    setState((prev) => ({ ...prev, showColorbar: !prev.showColorbar }));
  }, []);

  const setColorBarOrientation = useCallback(
    (orientation: ColorBarOrientation) => {
      setState((prev) => ({ ...prev, colorBarOrientation: orientation }));
    },
    [],
  );

  const setCurrentDataset = useCallback((dataset: Dataset) => {
    setState((prev) => ({ ...prev, currentDataset: dataset }));
  }, []);

  const fetchDatasets = useCallback(async (signal?: AbortSignal) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch("/api/datasets", {
        cache: "no-store",
        signal,
      });

      if (!response.ok) {
        throw new Error(
          `Dataset request failed with status ${response.status}`,
        );
      }

      const payload = await response.json();

      // Transform database datasets to app format
      const datasets: Dataset[] = Array.isArray(payload.datasets)
        ? payload.datasets.map(transformDataset)
        : [];

      if (signal?.aborted) {
        return false;
      }

      setState((prev) => {
        if (!datasets.length) {
          console.warn("No datasets returned from database, using mock data");
          return {
            ...prev,
            datasets: mockDatasets,
            currentDataset: mockDatasets[0],
            isLoading: false,
            error: "No datasets found in database",
          };
        }

        const currentId = prev.currentDataset?.id;
        const nextCurrent =
          datasets.find((item) => item.id === currentId) ?? datasets[0];

        return {
          ...prev,
          datasets,
          currentDataset: nextCurrent,
          isLoading: false,
          error: null,
        };
      });

      return true;
    } catch (error) {
      if (signal?.aborted) {
        return false;
      }

      console.error("Failed to fetch datasets from database:", error);

      // Fallback to mock data on error
      setState((prev) => ({
        ...prev,
        datasets: mockDatasets,
        currentDataset: mockDatasets[0],
        isLoading: false,
        error:
          error instanceof Error ? error.message : "Failed to load datasets",
      }));

      return false;
    }
  }, []);

  const refreshDatasets = useCallback(() => {
    return fetchDatasets();
  }, [fetchDatasets]);

  // Fetch datasets on mount
  useEffect(() => {
    const controller = new AbortController();
    fetchDatasets(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchDatasets]);

  return {
    ...state,
    selectedYear,
    setSelectedYear,
    temperatureUnit,
    setTemperatureUnit,
    showRegionInfo,
    setShowRegionInfo,
    regionInfoData,
    setRegionInfoData,
    setShowSettings,
    setShowAbout,
    setShowTutorial,
    setShowChat,
    toggleColorbar,
    setColorBarOrientation,
    setCurrentDataset,
    refreshDatasets,
  };
};

export const AppStateProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const appState = useAppStateInternal();

  return (
    <AppStateContext.Provider value={appState}>
      {children}
    </AppStateContext.Provider>
  );
};

export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return context;
};
