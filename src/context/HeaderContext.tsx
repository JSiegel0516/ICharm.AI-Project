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
  ColorScale,
} from "@/types";
import { mockDatasets } from "@/utils/constants";
import { getColorMapColors } from "@/utils/colorMaps";
import {
  AIR_TEMPERATURE_BASE,
  SHARP_BANDS,
  resolveColorMapColors,
  ANOMALY_PALETTE_BASE,
} from "@/utils/colorScales";

const reducePalette = (colors: string[], count: number): string[] => {
  if (!colors.length) return [];
  if (count <= 1) return [colors[0]];

  // Resample to a fixed band count for consistent sharp gradients.
  const result: string[] = [];
  const step = (colors.length - 1) / (count - 1);

  const hexToRgb = (hex: string) => {
    const clean = hex.replace("#", "");
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  };

  const rgbToHex = (r: number, g: number, b: number) =>
    `#${[r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;

  for (let i = 0; i < count; i += 1) {
    const position = i * step;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.min(colors.length - 1, lowerIndex + 1);
    const t = position - lowerIndex;

    if (upperIndex === lowerIndex || t === 0) {
      result.push(colors[lowerIndex]);
    } else {
      const lower = hexToRgb(colors[lowerIndex]);
      const upper = hexToRgb(colors[upperIndex]);
      const r = lower.r + (upper.r - lower.r) * t;
      const g = lower.g + (upper.g - lower.g) * t;
      const b = lower.b + (upper.b - lower.b) * t;
      result.push(rgbToHex(r, g, b));
    }
  }

  return result;
};

const applyColorMapToDataset = (
  dataset: Dataset,
  presetName: string | null,
  baselines: Record<string, ColorScale | undefined>,
  invert: boolean,
): Dataset => {
  if (!presetName || presetName === "dataset-default") {
    const baseline = baselines[dataset.id];
    if (!baseline) return dataset;
    const baseColors = invert
      ? [...baseline.colors].reverse()
      : [...baseline.colors];
    return {
      ...dataset,
      colorScale: {
        ...baseline,
        colors: baseColors,
        labels: [...baseline.labels],
      },
    };
  }

  const base = resolveColorMapColors(presetName);
  const colors = reducePalette(
    invert ? [...base].reverse() : base,
    SHARP_BANDS,
  );

  return {
    ...dataset,
    colorScale: {
      ...dataset.colorScale,
      colors,
    },
  };
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

const COLOR_BAR_ORIENTATION_STORAGE_KEY = "icharm_colorBarOrientation";
const DEFAULT_COLOR_MAP_PRESET = "dataset-default";
const DEFAULT_COLOR_MAP_INVERSE = false;

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
  console.log("Transforming dataset:", db.datasetName, "stored:", db.stored);

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
      id: db.id,
      sourceName: db.sourceName,
      datasetName: db.datasetName,
      layerParameter: db.layerParameter,
      statistic: db.statistic,
      datasetType: db.datasetType,
      levels: db.levels,
      levelValues: db.levelValues,
      levelUnits: db.levelUnits,
      stored: db.stored, // <-- Make sure this is explicitly here
      inputFile: db.inputFile,
      keyVariable: db.keyVariable,
      units: db.units,
      spatialResolution: db.spatialResolution,
      engine: db.engine,
      kerchunkPath: db.kerchunkPath,
      origLocation: db.origLocation,
      startDate: db.startDate,
      endDate: DATASET_END_OVERRIDES[db.datasetName] ?? db.endDate,
      createdAt: db.createdAt,
      updatedAt: db.updatedAt,
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
  const unitsLower = (units || "").toLowerCase();

  const buildScale = (
    colors: string[],
    labels: string[],
    min: number,
    max: number,
  ) => ({
    labels,
    colors: reducePalette(colors, SHARP_BANDS),
    min,
    max,
  });

  const SST_COLORS = getColorMapColors("Matlab|Jet");
  const ANOMALY_COLORS = reducePalette(ANOMALY_PALETTE_BASE, SHARP_BANDS);
  const AIR_COLORS = AIR_TEMPERATURE_BASE;
  const PRECIP_COLORS = getColorMapColors(
    "Color Brewer 2.0|Sequential|Multi-hue|9-class YlGnBu",
  );
  const WIND_COLORS = getColorMapColors(
    "Color Brewer 2.0|Sequential|Single-hue|9-class Greys",
  );
  const PRESSURE_COLORS = getColorMapColors("Matlab|Bone");
  const DIVERGING_RD_BU_COLORS = getColorMapColors(
    "Color Brewer 2.0|Diverging|Zero Centered|11-class RdBu",
  );
  const DEFAULT_COLORS = getColorMapColors("Other|Gray scale");

  // Check for Sea Surface Temperature first (more specific)
  if (
    name.includes("sst") ||
    name.includes("sea surface temperature") ||
    name.includes("amsre") ||
    name.includes("modis") ||
    param.includes("sea surface")
  ) {
    return buildScale(
      SST_COLORS,
      ["-2°C", "5°C", "12°C", "18°C", "25°C", "32°C"],
      -2,
      35,
    );
  }

  // Air Temperature scales
  if (
    name.includes("noaaglobaltemp") ||
    name.includes("noaa global surface temperature") ||
    name.includes("noaa global temp") ||
    name.includes("noaa global temperature")
  ) {
    // NOAA Global Surface Temperature anomalies: custom anomaly palette
    return buildScale(
      ANOMALY_COLORS,
      ["-2°C", "-1°C", "0°C", "1°C", "2°C"],
      -2,
      2,
    );
  }

  if (
    name.includes("air") ||
    name.includes("airtemp") ||
    param.includes("air temperature") ||
    param.includes("temperature") ||
    unitsLower.includes("degc") ||
    unitsLower.includes("kelvin")
  ) {
    return buildScale(
      AIR_COLORS,
      ["-40°C", "-20°C", "0°C", "20°C", "40°C"],
      -40,
      40,
    );
  }

  // GODAS vertical velocity and similar ocean reanalysis fields:
  if (
    name.includes("godas") ||
    name.includes("global ocean data assimilation system") ||
    name.includes("ncep global ocean data assimilation") ||
    param.includes("dzdt")
  ) {
    // Purple → teal diverging palette matching requested bar
    const GODAS_COLORS = [
      "#6b00b5",
      "#8a4bcc",
      "#a777dd",
      "#c8b6ea",
      "#e7e7ee",
      "#b8e2e6",
      "#7dc9cc",
      "#3ea3a8",
      "#137b80",
    ];
    return buildScale(
      GODAS_COLORS,
      ["-0.000005", "0", "0.000005"],
      -0.000005,
      0.000005,
    );
  }

  // Precipitation scales
  if (
    name.includes("precip") ||
    name.includes("precipitation") ||
    name.includes("rain") ||
    param.includes("precipitation") ||
    unitsLower.includes("mm")
  ) {
    return buildScale(
      PRECIP_COLORS,
      ["0", "100", "200", "300", "400", "500"],
      0,
      500,
    );
  }

  // Wind/velocity scales
  if (
    param.includes("velocity") ||
    param.includes("wind") ||
    unitsLower.includes("m/s")
  ) {
    return buildScale(
      WIND_COLORS,
      ["0 m/s", "5 m/s", "10 m/s", "15 m/s", "20 m/s", "25 m/s"],
      0,
      25,
    );
  }

  if (param.includes("pressure")) {
    return buildScale(
      PRESSURE_COLORS,
      ["900", "940", "980", "1020", "1050"],
      900,
      1050,
    );
  }

  // Default scale
  return buildScale(
    DEFAULT_COLORS,
    ["Low", "Medium-Low", "Medium", "Medium-High", "High"],
    0,
    100,
  );
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
    regionInfoData: {
      latitude: 21.25,
      longitude: -71.25,
      regionData: {
        name: "GPCP V2.3 Precipitation",
        precipitation: 0.9,
        temperature: 24.5,
        dataset: "Global Precipitation Climatology Project",
      },
    },
    currentLocationMarker: {
      latitude: 21.25,
      longitude: -71.25,
      name: "GPCP V2.3 Precipitation",
      source: "region",
    },
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
      rasterOpacity: 1,
      rasterTransitionMs: 320,
      hideZeroPrecipitation: false,
      rasterBlurEnabled: true,
    },
    selectedColorMap: "dataset-default",
    selectedColorMapInverse: DEFAULT_COLOR_MAP_INVERSE,
    colorScaleBaselines: mockDatasets.reduce<Record<string, ColorScale>>(
      (acc, dataset) => {
        acc[dataset.id] = {
          ...dataset.colorScale,
          colors: [...dataset.colorScale.colors],
          labels: [...dataset.colorScale.labels],
        };
        return acc;
      },
      {},
    ),
  });

  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear(),
  );
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storedOrientation = window.localStorage.getItem(
        COLOR_BAR_ORIENTATION_STORAGE_KEY,
      );
      if (
        storedOrientation === "horizontal" ||
        storedOrientation === "vertical"
      ) {
        const normalizedOrientation = storedOrientation as ColorBarOrientation;
        setState((prev) => {
          if (prev.colorBarOrientation === normalizedOrientation) {
            return prev;
          }
          return {
            ...prev,
            colorBarOrientation: normalizedOrientation,
          };
        });
      }
    } catch (error) {
      console.warn("Failed to load color bar orientation preference:", error);
    }
  }, []);

  // Re-apply selected color map to datasets and current dataset
  useEffect(() => {
    const preset = state.selectedColorMap ?? DEFAULT_COLOR_MAP_PRESET;
    const invert = state.selectedColorMapInverse ?? DEFAULT_COLOR_MAP_INVERSE;
    setState((prev) => {
      const baselines = prev.colorScaleBaselines ?? {};
      const apply = (dataset: Dataset) =>
        applyColorMapToDataset(dataset, preset, baselines, invert);

      return {
        ...prev,
        datasets: prev.datasets.map(apply),
        currentDataset: prev.currentDataset
          ? apply(prev.currentDataset)
          : prev.currentDataset,
      };
    });
  }, [state.selectedColorMap, state.selectedColorMapInverse]);

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

  const setCurrentLocationMarker = useCallback(
    (
      marker: {
        latitude: number;
        longitude: number;
        name?: string | null;
        source?: "marker" | "search" | "region" | "unknown" | null;
      } | null,
    ) => {
      setState((prev) => ({
        ...prev,
        currentLocationMarker: marker,
      }));
    },
    [],
  );

  const toggleColorbar = useCallback(() => {
    setState((prev) => ({ ...prev, showColorbar: !prev.showColorbar }));
  }, []);

  const requestLocationFocus = useCallback(
    (target: { latitude: number; longitude: number; name?: string }) => {
      setState((prev) => ({
        ...prev,
        locationFocusRequest: {
          id: Date.now(),
          mode: "focus",
          ...target,
        },
        currentLocationMarker: {
          latitude: target.latitude,
          longitude: target.longitude,
          name: target.name ?? null,
          source: "search",
        },
      }));
    },
    [],
  );

  const requestLocationMarkerClear = useCallback(() => {
    setState((prev) => ({
      ...prev,
      locationFocusRequest: {
        id: Date.now(),
        mode: "clear",
      },
      currentLocationMarker: null,
    }));
  }, []);

  const clearLocationFocusRequest = useCallback(() => {
    setState((prev) => ({ ...prev, locationFocusRequest: null }));
  }, []);

  const setColorBarOrientation = useCallback(
    (orientation: ColorBarOrientation) => {
      setState((prev) => ({ ...prev, colorBarOrientation: orientation }));
    },
    [],
  );

  const setSelectedColorMap = useCallback((preset: string | null) => {
    setState((prev) => ({
      ...prev,
      selectedColorMap: preset ?? DEFAULT_COLOR_MAP_PRESET,
    }));
  }, []);

  const setSelectedColorMapInverse = useCallback((invert: boolean) => {
    setState((prev) => ({
      ...prev,
      selectedColorMapInverse: invert,
    }));
  }, []);

  const setCurrentDataset = useCallback((dataset: Dataset) => {
    setState((prev) => {
      const baselines = prev.colorScaleBaselines ?? {};
      const colorMap = prev.selectedColorMap ?? DEFAULT_COLOR_MAP_PRESET;
      return {
        ...prev,
        currentDataset: applyColorMapToDataset(
          dataset,
          colorMap,
          baselines,
          prev.selectedColorMapInverse ?? DEFAULT_COLOR_MAP_INVERSE,
        ),
      };
    });
  }, []);

  const fetchDatasets = useCallback(
    async (signal?: AbortSignal) => {
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

        console.log("Raw API response:", payload.datasets?.[0]);

        // Transform database datasets to app format
        const datasets: Dataset[] = Array.isArray(payload.datasets)
          ? payload.datasets.map(transformDataset)
          : [];

        if (signal?.aborted) {
          return false;
        }

        const preset = state.selectedColorMap ?? DEFAULT_COLOR_MAP_PRESET;
        const invert =
          state.selectedColorMapInverse ?? DEFAULT_COLOR_MAP_INVERSE;

        setState((prev) => {
          if (!datasets.length) {
            console.warn("No datasets returned from database, using mock data");
            const baselines = { ...(prev.colorScaleBaselines ?? {}) };
            mockDatasets.forEach((ds) => {
              if (!baselines[ds.id]) {
                baselines[ds.id] = {
                  ...ds.colorScale,
                  colors: [...ds.colorScale.colors],
                  labels: [...ds.colorScale.labels],
                };
              }
            });

            const apply = (dataset: Dataset) =>
              applyColorMapToDataset(dataset, preset, baselines, invert);

            return {
              ...prev,
              datasets: mockDatasets.map(apply),
              currentDataset: apply(mockDatasets[0]),
              colorScaleBaselines: baselines,
              isLoading: false,
              error: "No datasets found in database",
            };
          }

          const baselines = { ...(prev.colorScaleBaselines ?? {}) };
          datasets.forEach((ds) => {
            if (!baselines[ds.id]) {
              baselines[ds.id] = {
                ...ds.colorScale,
                colors: [...ds.colorScale.colors],
                labels: [...ds.colorScale.labels],
              };
            }
          });

          const currentId = prev.currentDataset?.id;
          const rawNextCurrent =
            datasets.find((item) => item.id === currentId) ?? datasets[0];

          const apply = (dataset: Dataset) =>
            applyColorMapToDataset(dataset, preset, baselines, invert);

          return {
            ...prev,
            datasets: datasets.map(apply),
            currentDataset: apply(rawNextCurrent),
            colorScaleBaselines: baselines,
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
        const preset = state.selectedColorMap ?? DEFAULT_COLOR_MAP_PRESET;
        const invert =
          state.selectedColorMapInverse ?? DEFAULT_COLOR_MAP_INVERSE;
        setState((prev) => {
          const baselines = { ...(prev.colorScaleBaselines ?? {}) };
          mockDatasets.forEach((ds) => {
            if (!baselines[ds.id]) {
              baselines[ds.id] = {
                ...ds.colorScale,
                colors: [...ds.colorScale.colors],
                labels: [...ds.colorScale.labels],
              };
            }
          });
          const apply = (dataset: Dataset) =>
            applyColorMapToDataset(dataset, preset, baselines, invert);

          return {
            ...prev,
            datasets: mockDatasets.map(apply),
            currentDataset: apply(mockDatasets[0]),
            colorScaleBaselines: baselines,
            isLoading: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to load datasets",
          };
        });

        return false;
      }
    },
    [state.selectedColorMap],
  );

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
    selectedDate,
    setSelectedDate,
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
    setSelectedColorMap,
    setSelectedColorMapInverse,
    setCurrentDataset,
    refreshDatasets,
    currentLocationMarker: state.currentLocationMarker,
    setCurrentLocationMarker,
    requestLocationFocus,
    requestLocationMarkerClear,
    clearLocationFocusRequest,
    selectedColorMap: state.selectedColorMap,
    selectedColorMapInverse: state.selectedColorMapInverse,
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
