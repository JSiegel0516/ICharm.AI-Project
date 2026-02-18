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
  ColorScale,
} from "@/types";
import { SHARP_BANDS, resolveColorMapColors } from "@/utils/colorScales";
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

type DatasetAppState = {
  showSettings: boolean;
  showAbout: boolean;
  showTutorial: boolean;
  showChat: boolean;
  showColorbar: boolean;
  showRegionInfo: boolean;
  datasets: Dataset[];
  currentDataset: Dataset | null;
  regionInfoData: {
    latitude: number;
    longitude: number;
    regionData: RegionData;
  };
  currentLocationMarker: AppState["currentLocationMarker"];
  globePosition: AppState["globePosition"];
  locationFocusRequest?: AppState["locationFocusRequest"];
  isLoading: boolean;
  error: string | null;
  globeSettings: AppState["globeSettings"];
  colorScaleBaselines: Record<string, ColorScale | undefined>;
};

type DatasetContextType = ReturnType<typeof useDatasetInternal>;

const DatasetContext = createContext<DatasetContextType | undefined>(undefined);

const DEFAULT_COLOR_MAP_PRESET = "dataset-default";
const DEFAULT_COLOR_MAP_INVERSE = false;

const useDatasetInternal = () => {
  const [state, setState] = useState<DatasetAppState>({
    showSettings: false,
    showAbout: false,
    showTutorial: false,
    showChat: false,
    showColorbar: true,
    showRegionInfo: false,
    datasets: [],
    currentDataset: null,
    regionInfoData: {
      latitude: 0,
      longitude: 0,
      regionData: { name: "", dataset: "" },
    },
    currentLocationMarker: null,
    globePosition: { latitude: 0, longitude: 0, zoom: 1 },
    isLoading: true,
    error: null,
    globeSettings: {
      baseMapMode: "satellite",
      satelliteLayerVisible: true,
      boundaryLinesVisible: true,
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
    colorScaleBaselines: {},
  });

  const [appliedColorMap, setAppliedColorMap] = useState(
    DEFAULT_COLOR_MAP_PRESET,
  );
  const [appliedColorMapInverse, setAppliedColorMapInverse] = useState(
    DEFAULT_COLOR_MAP_INVERSE,
  );

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
    regionData: { name: "", dataset: "" },
  });

  // Re-apply color map to all datasets when it changes
  useEffect(() => {
    const preset = appliedColorMap;
    const invert = appliedColorMapInverse;
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
  }, [appliedColorMap, appliedColorMapInverse]);

  // Stable applyColorMap — called by SettingsContext when color map changes
  const applyColorMap = useCallback((preset: string, invert: boolean) => {
    setAppliedColorMap(preset);
    setAppliedColorMapInverse(invert);
  }, []);

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
      setState((prev) => ({ ...prev, currentLocationMarker: marker }));
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
      locationFocusRequest: { id: Date.now(), mode: "clear" },
      currentLocationMarker: null,
    }));
  }, []);

  const clearLocationFocusRequest = useCallback(() => {
    setState((prev) => ({ ...prev, locationFocusRequest: null }));
  }, []);

  // Accepts an optional color map override so dataset switch and color map
  // restoration happen atomically in a single setState call
  const setCurrentDataset = useCallback(
    (
      dataset: Dataset,
      colorMapOverride?: { preset: string; invert: boolean },
    ) => {
      const preset = colorMapOverride?.preset ?? appliedColorMap;
      const invert = colorMapOverride?.invert ?? appliedColorMapInverse;

      if (colorMapOverride) {
        setAppliedColorMap(preset);
        setAppliedColorMapInverse(invert);
      }

      setState((prev) => {
        const baselines = prev.colorScaleBaselines ?? {};
        return {
          ...prev,
          currentDataset: applyColorMapToDataset(
            dataset,
            preset,
            baselines,
            invert,
          ),
        };
      });
    },
    [appliedColorMap, appliedColorMapInverse],
  );

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

        const datasets: Dataset[] = rawDatasets.map(
          (record: ClimateDatasetRecord) => transformBackendDataset(record),
        );

        if (signal?.aborted) return false;

        const preset = appliedColorMap;
        const invert = appliedColorMapInverse;

        setState((prev) => {
          if (!datasets.length) {
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
        if (signal?.aborted) return false;

        console.error("Failed to fetch datasets from database:", error);

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
    [appliedColorMap, appliedColorMapInverse],
  );

  const refreshDatasets = useCallback(() => {
    return fetchDatasets();
  }, [fetchDatasets]);

  useEffect(() => {
    const controller = new AbortController();
    fetchDatasets(controller.signal);
    return () => controller.abort();
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
    setCurrentDataset,
    refreshDatasets,
    currentLocationMarker: state.currentLocationMarker,
    setCurrentLocationMarker,
    requestLocationFocus,
    requestLocationMarkerClear,
    clearLocationFocusRequest,
    applyColorMap,
  };
};

export const DatasetProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const datasetState = useDatasetInternal();
  return (
    <DatasetContext.Provider value={datasetState}>
      {children}
    </DatasetContext.Provider>
  );
};

export const useDataset = () => {
  const context = useContext(DatasetContext);
  if (!context) {
    throw new Error("useDataset must be used within a DatasetProvider");
  }
  return context;
};

export const useAppState = useDataset;
export const AppStateProvider = DatasetProvider;
