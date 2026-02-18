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
  ClimateDatasetRecord,
  AppState,
  TemperatureUnit,
  RegionData,
  ColorBarOrientation,
  ColorScale,
} from "@/types";
import { getColorMapColors } from "@/utils/colorMaps";
import {
  AIR_TEMPERATURE_BASE,
  SHARP_BANDS,
  resolveColorMapColors,
} from "@/utils/colorScales";
import { transformBackendDataset } from "@/lib/datasets";

const reducePalette = (colors: string[], count: number): string[] => {
  if (!colors.length) return [];
  if (count <= 1) return [colors[0]];

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

type AppStateContextType = ReturnType<typeof useAppStateInternal>;

const AppStateContext = createContext<AppStateContextType | undefined>(
  undefined,
);

const COLOR_BAR_ORIENTATION_STORAGE_KEY = "icharm_colorBarOrientation";
const DEFAULT_COLOR_MAP_PRESET = "dataset-default";
const DEFAULT_COLOR_MAP_INVERSE = false;

const useAppStateInternal = () => {
  const [state, setState] = useState<AppState>({
    showSettings: false,
    showAbout: false,
    showTutorial: false,
    showChat: false,
    showColorbar: true,
    showRegionInfo: false,
    datasets: [], // Start with empty array
    currentDataset: null, // Start with null
    regionInfoData: {
      latitude: 0,
      longitude: 0,
      regionData: {
        name: "",
        dataset: "",
      },
    },
    currentLocationMarker: null,
    globePosition: {
      latitude: 0,
      longitude: 0,
      zoom: 1,
    },
    isLoading: true,
    error: null,
    colorBarOrientation: "horizontal",
    globeSettings: {
      baseMapMode: "satellite",
      satelliteLayerVisible: true,
      boundaryLinesVisible: true,
      countryBoundaryResolution: "low",
      stateBoundaryResolution: "low",
      geographicLinesVisible: false,
      timeZoneLinesVisible: false,
      pacificCentered: false,
      coastlineResolution: "low",
      riverResolution: "none",
      lakeResolution: "none",
      naturalEarthGeographicLinesVisible: false,
      labelsVisible: true,
      rasterOpacity: 0.9,
      hideZeroPrecipitation: false,
      rasterBlurEnabled: true,
      bumpMapMode: "none",
    },
    lineColors: {
      boundaryLines: "#000000",
      coastlines: "#000000",
      rivers: "#000000",
      lakes: "#000000",
      geographicLines: "#000000",
      geographicGrid: "#000000",
    },
    selectedColorMap: "dataset-default",
    selectedColorMapInverse: DEFAULT_COLOR_MAP_INVERSE,
    colorScaleBaselines: {},
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
    latitude: 0,
    longitude: 0,
    regionData: {
      name: "",
      dataset: "",
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
        currentDataset: prev.currentDataset ? apply(prev.currentDataset) : null,
      };
    });
  }, [state.selectedColorMap, state.selectedColorMapInverse]);

  const setShowSettings = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showSettings: show }));
  }, []);

  const setLineColors = useCallback((next: Partial<AppState["lineColors"]>) => {
    setState((prev) => ({
      ...prev,
      lineColors: {
        ...prev.lineColors,
        ...next,
      } as AppState["lineColors"],
    }));
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
        const rawDatasets = payload.datasets || [];

        console.log("Raw API response:", rawDatasets?.[0]);

        // Transform database datasets to app format
        const datasets: Dataset[] = rawDatasets.map(
          (record: ClimateDatasetRecord) => transformBackendDataset(record),
        );

        if (signal?.aborted) {
          return false;
        }

        const preset = state.selectedColorMap ?? DEFAULT_COLOR_MAP_PRESET;
        const invert =
          state.selectedColorMapInverse ?? DEFAULT_COLOR_MAP_INVERSE;

        setState((prev) => {
          if (!datasets.length) {
            // No mock data fallback - just show empty state
            return {
              ...prev,
              datasets: [],
              currentDataset: null,
              colorScaleBaselines: {},
              isLoading: false,
              error: "No datasets available",
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

        // No mock data fallback - just show error state
        setState((prev) => ({
          ...prev,
          datasets: [],
          currentDataset: null,
          colorScaleBaselines: {},
          isLoading: false,
          error:
            error instanceof Error ? error.message : "Failed to load datasets",
        }));

        return false;
      }
    },
    [state.selectedColorMap, state.selectedColorMapInverse],
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
    lineColors: state.lineColors,
    setLineColors,
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
