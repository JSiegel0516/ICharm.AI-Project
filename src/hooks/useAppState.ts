import { useState, useCallback } from 'react';
import type { Dataset, AppState } from '@/types';
import { mockDatasets } from '@/utils/constants';

export const useAppState = () => {
  const [state, setState] = useState<AppState>({
  showSettings: false,
  showAbout: false,
  showTutorial: false,
  showChat: false,
  showColorbar: true,
  showRegionInfo: false, // ✅ Add this missing property
  currentDataset: mockDatasets[0], // make sure `dataset` is defined
  globePosition: {
    latitude: 0,
    longitude: 0,
    zoom: 1,
  },
  isLoading: false,
  error: null,
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
    setShowSettings,
    setShowAbout,
    setShowTutorial,
    setShowChat,
    toggleColorbar,
    setCurrentDataset,
  };
};
