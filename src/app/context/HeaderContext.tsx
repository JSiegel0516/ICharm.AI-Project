'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
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
  };
};

export const AppStateProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const appState = useAppStateInternal();

  const value = useMemo(
    () => appState,
    [
      appState.showSettings,
      appState.showAbout,
      appState.showTutorial,
      appState.showChat,
      appState.showColorbar,
      appState.showRegionInfo,
      appState.currentDataset,
      appState.selectedYear,
      appState.temperatureUnit,
      appState.showRegionInfo,
      appState.regionInfoData,
    ]
  );

  return (
    <AppStateContext.Provider value={value}>
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
