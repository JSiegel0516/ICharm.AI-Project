'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import type { Dataset, AppState, TemperatureUnit, RegionData } from '@/types';
import { mockDatasets } from '@/utils/constants';

type AppStateContextType = ReturnType<typeof useAppStateInternal>;

const AppStateContext = createContext<AppStateContextType | undefined>(
  undefined
);

const useAppStateInternal = () => {
  const [state, setState] = useState<AppState>({
    showSettings: false,
    showAbout: false,
    showTutorial: false,
    showChat: false,
    showColorbar: true,
    showRegionInfo: false,
    datasets: mockDatasets,
    currentDataset: mockDatasets[0],
    globePosition: {
      latitude: 0,
      longitude: 0,
      zoom: 1,
    },
    isLoading: false,
    error: null,
  });

  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear()
  );
  const [temperatureUnit, setTemperatureUnit] =
    useState<TemperatureUnit>('celsius');
  const [showRegionInfo, setShowRegionInfo] = useState<boolean>(false);
  const [regionInfoData, setRegionInfoData] = useState<{
    latitude: number;
    longitude: number;
    regionData: RegionData;
  }>({
    latitude: 21.25,
    longitude: -71.25,
    regionData: {
      name: 'GPCP V2.3 Precipitation',
      precipitation: 0.9,
      temperature: 24.5,
      dataset: 'Global Precipitation Climatology Project',
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

  const setCurrentDataset = useCallback((dataset: Dataset) => {
    setState((prev) => ({ ...prev, currentDataset: dataset }));
  }, []);

  const fetchDatasets = useCallback(async (signal?: AbortSignal) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch('/api/datasets', {
        cache: 'no-store',
        signal,
      });

      if (!response.ok) {
        throw new Error(`Dataset request failed with status ${response.status}`);
      }

      const payload = await response.json();
      const datasets: Dataset[] = Array.isArray(payload.datasets)
        ? payload.datasets
        : [];

      if (signal?.aborted) {
        return false;
      }

      setState((prev) => {
        if (!datasets.length) {
          return {
            ...prev,
            datasets,
            isLoading: false,
            error: null,
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
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load datasets',
      }));
      return false;
    }
  }, []);

  const refreshDatasets = useCallback(() => {
    return fetchDatasets();
  }, [fetchDatasets]);

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
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
};
