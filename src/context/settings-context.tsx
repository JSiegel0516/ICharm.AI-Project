"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { LineColorSettings } from "@/types";
import { useDataset } from "@/context/dataset-context";

const STORAGE_KEY = "icharm-settings";
const DEFAULT_COLOR_MAP_CATEGORY = "cb-zero";

const DEFAULT_LINE_COLORS_BLACK: LineColorSettings = {
  boundaryLines: "#000000",
  coastlines: "#000000",
  rivers: "#000000",
  lakes: "#000000",
  geographicLines: "#000000",
  geographicGrid: "#000000",
};

const DEFAULT_LINE_COLORS_GRAY: LineColorSettings = {
  boundaryLines: "#4b5563",
  coastlines: "#4b5563",
  rivers: "#4b5563",
  lakes: "#4b5563",
  geographicLines: "#4b5563",
  geographicGrid: "#4b5563",
};

interface SettingsState {
  colorBarOrientation: "horizontal" | "vertical";
  selectedColorMap: string;
  selectedColorMapInverse: boolean;
  lineColors: LineColorSettings;
  activeColorMapCategory: string;
  datasetColorMaps: Record<
    string,
    { colorMap: string; colorMapInverse: boolean }
  >;
  colorbarCustomMin: number | null;
  colorbarCustomMax: number | null;
  datasetColorbarRanges: Record<
    string,
    { min: number | null; max: number | null }
  >;
}

interface SettingsContextValue extends SettingsState {
  setColorBarOrientation: (orientation: "horizontal" | "vertical") => void;
  setSelectedColorMap: (preset: string) => void;
  setSelectedColorMapInverse: (inverse: boolean) => void;
  setLineColors: (colors: LineColorSettings) => void;
  setActiveColorMapCategory: (category: string) => void;
  resetToDefaults: (viewMode?: string) => void;
  getDefaultLineColors: (viewMode?: string) => LineColorSettings;
  setColorbarRange: (min: number | null, max: number | null) => void;
  resetColorbarRange: () => void;
}

const defaultState: SettingsState = {
  colorBarOrientation: "horizontal",
  selectedColorMap: "dataset-default",
  selectedColorMapInverse: false,
  lineColors: DEFAULT_LINE_COLORS_BLACK,
  activeColorMapCategory: DEFAULT_COLOR_MAP_CATEGORY,
  datasetColorMaps: {},
  colorbarCustomMin: null,
  colorbarCustomMax: null,
  datasetColorbarRanges: {},
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function loadFromStorage(): SettingsState {
  if (typeof window === "undefined") return defaultState;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultState;
    const parsed = JSON.parse(stored) as Partial<SettingsState>;
    return {
      ...defaultState,
      ...parsed,
      // Ensure these are always objects even if missing from stored data
      datasetColorMaps: parsed.datasetColorMaps ?? {},
      datasetColorbarRanges: parsed.datasetColorbarRanges ?? {},
    };
  } catch {
    return defaultState;
  }
}

function saveToStorage(state: SettingsState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable, fail silently
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SettingsState>(loadFromStorage);
  const { applyColorMap, setCurrentDataset, currentDataset } = useDataset();

  // Restore per-dataset color map and colorbar range when dataset changes
  useEffect(() => {
    if (!currentDataset?.id) return;
    const datasetId = currentDataset.id;

    setState((prev) => {
      const savedColorMap = prev.datasetColorMaps[datasetId];
      const savedRange = prev.datasetColorbarRanges[datasetId];
      const colorMap = savedColorMap?.colorMap ?? "dataset-default";
      const colorMapInverse = savedColorMap?.colorMapInverse ?? false;
      const newMin = savedRange?.min ?? null;
      const newMax = savedRange?.max ?? null;

      if (
        prev.selectedColorMap === colorMap &&
        prev.selectedColorMapInverse === colorMapInverse &&
        prev.colorbarCustomMin === newMin &&
        prev.colorbarCustomMax === newMax
      ) {
        return prev;
      }

      return {
        ...prev,
        selectedColorMap: colorMap,
        selectedColorMapInverse: colorMapInverse,
        colorbarCustomMin: newMin,
        colorbarCustomMax: newMax,
      };
    });
  }, [currentDataset?.id]);

  // Persist to localStorage on every state change
  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  // Keep DatasetContext in sync when color map settings change
  useEffect(() => {
    applyColorMap(state.selectedColorMap, state.selectedColorMapInverse);
  }, [state.selectedColorMap, state.selectedColorMapInverse, applyColorMap]);

  const getDefaultLineColors = useCallback(
    (viewMode?: string): LineColorSettings => {
      return viewMode === "3d" ||
        viewMode === "2d" ||
        viewMode === "ortho" ||
        !viewMode
        ? DEFAULT_LINE_COLORS_BLACK
        : DEFAULT_LINE_COLORS_GRAY;
    },
    [],
  );

  const setSelectedColorMap = useCallback(
    (preset: string) => {
      setState((prev) => {
        const datasetId = currentDataset?.id;
        return {
          ...prev,
          selectedColorMap: preset,
          datasetColorMaps: datasetId
            ? {
                ...prev.datasetColorMaps,
                [datasetId]: {
                  colorMap: preset,
                  colorMapInverse: prev.selectedColorMapInverse,
                },
              }
            : prev.datasetColorMaps,
        };
      });
    },
    [currentDataset?.id],
  );

  const setSelectedColorMapInverse = useCallback(
    (inverse: boolean) => {
      setState((prev) => {
        const datasetId = currentDataset?.id;
        return {
          ...prev,
          selectedColorMapInverse: inverse,
          datasetColorMaps: datasetId
            ? {
                ...prev.datasetColorMaps,
                [datasetId]: {
                  colorMap: prev.selectedColorMap,
                  colorMapInverse: inverse,
                },
              }
            : prev.datasetColorMaps,
        };
      });
    },
    [currentDataset?.id],
  );

  const setColorBarOrientation = useCallback(
    (orientation: "horizontal" | "vertical") => {
      setState((prev) => ({ ...prev, colorBarOrientation: orientation }));
    },
    [],
  );

  const setLineColors = useCallback((colors: LineColorSettings) => {
    setState((prev) => ({ ...prev, lineColors: colors }));
  }, []);

  const setActiveColorMapCategory = useCallback((category: string) => {
    setState((prev) => ({ ...prev, activeColorMapCategory: category }));
  }, []);

  const setColorbarRange = useCallback(
    (min: number | null, max: number | null) => {
      setState((prev) => {
        const datasetId = currentDataset?.id;
        return {
          ...prev,
          colorbarCustomMin: min,
          colorbarCustomMax: max,
          datasetColorbarRanges: datasetId
            ? {
                ...prev.datasetColorbarRanges,
                [datasetId]: { min, max },
              }
            : prev.datasetColorbarRanges,
        };
      });
    },
    [currentDataset?.id],
  );

  const resetColorbarRange = useCallback(() => {
    setState((prev) => {
      const datasetId = currentDataset?.id;
      const nextRanges = { ...prev.datasetColorbarRanges };
      if (datasetId) delete nextRanges[datasetId];
      return {
        ...prev,
        colorbarCustomMin: null,
        colorbarCustomMax: null,
        datasetColorbarRanges: nextRanges,
      };
    });
  }, [currentDataset?.id]);

  const resetToDefaults = useCallback(
    (viewMode?: string) => {
      setState((prev) => ({
        colorBarOrientation: "horizontal",
        selectedColorMap: "dataset-default",
        selectedColorMapInverse: false,
        lineColors: getDefaultLineColors(viewMode),
        activeColorMapCategory: DEFAULT_COLOR_MAP_CATEGORY,
        datasetColorMaps: prev.datasetColorMaps,
        colorbarCustomMin: null,
        colorbarCustomMax: null,
        datasetColorbarRanges: prev.datasetColorbarRanges,
      }));
    },
    [getDefaultLineColors],
  );

  return (
    <SettingsContext.Provider
      value={{
        ...state,
        setColorBarOrientation,
        setSelectedColorMap,
        setSelectedColorMapInverse,
        setLineColors,
        setActiveColorMapCategory,
        resetToDefaults,
        getDefaultLineColors,
        setColorbarRange,
        resetColorbarRange,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
