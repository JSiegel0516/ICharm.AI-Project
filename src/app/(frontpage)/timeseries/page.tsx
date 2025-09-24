'use client';

import React, { useState } from 'react';
import Globe from '@/components/Globe/Globe';
import ControlPanel from '@/components/UI/ControlPanel';
import ColorBar from '@/components/UI/ColorBar';
import ChatBot from '@/components/Chat/ChatBot';
import SettingsModal from '@/components/Modals/SettingsModal';
import AboutModal from '@/components/Modals/AboutModal';
import TutorialModal from '@/components/Modals/TutorialModal';
import TimeSeriesGraph from './_components/TimeSeriesGraph';
import { useAppState } from '@/app/context/HeaderContext';

// Mock data for demonstration
const DATASET_OPTIONS = [
  {
    id: 'temperature',
    name: 'Global Temperature',
    description: 'Average surface temperature anomalies',
  },
  {
    id: 'co2',
    name: 'CO2 Concentrations',
    description: 'Atmospheric carbon dioxide levels',
  },
  {
    id: 'sea-level',
    name: 'Sea Level Rise',
    description: 'Global mean sea level changes',
  },
  {
    id: 'precipitation',
    name: 'Precipitation',
    description: 'Annual precipitation patterns',
  },
];

const REGION_OPTIONS = [
  { id: 'global', name: 'Global' },
  { id: 'north-america', name: 'North America' },
  { id: 'europe', name: 'Europe' },
  { id: 'asia', name: 'Asia' },
  { id: 'africa', name: 'Africa' },
  { id: 'south-america', name: 'South America' },
  { id: 'oceania', name: 'Oceania' },
];

const VARIABLE_OPTIONS = [
  { id: 'mean', name: 'Mean' },
  { id: 'anomaly', name: 'Anomaly' },
  { id: 'trend', name: 'Trend' },
  { id: 'seasonal', name: 'Seasonal Cycle' },
];

// Mock time series data
const generateTimeSeriesData = (
  dataset: string,
  region: string,
  variable: string
) => {
  const baseYear = 1950;
  const data = [];

  for (let year = baseYear; year <= 2023; year++) {
    let value;

    // Different patterns for different datasets
    switch (dataset) {
      case 'temperature':
        value =
          Math.sin((year - baseYear) * 0.1) * 2 + (year - baseYear) * 0.02;
        break;
      case 'co2':
        value = 300 + Math.exp((year - baseYear) * 0.03);
        break;
      case 'sea-level':
        value = (year - baseYear) * 0.3 + Math.random() * 0.5;
        break;
      case 'precipitation':
        value =
          1000 +
          Math.sin((year - baseYear) * 0.15) * 200 +
          (year - baseYear) * 0.5;
        break;
      default:
        value = Math.random() * 100;
    }

    // Add some regional variation
    const regionMultiplier =
      region === 'global' ? 1 : 0.8 + Math.random() * 0.4;
    value *= regionMultiplier;

    data.push({
      year,
      value: parseFloat(value.toFixed(2)),
      dataset,
      region,
      variable,
    });
  }

  return data;
};

export default function TimeSeries() {
  const {
    showSettings,
    showAbout,
    showTutorial,
    showChat,
    showColorbar,
    currentDataset,
    setShowSettings,
    setShowAbout,
    setShowTutorial,
    setShowChat,
    toggleColorbar,
    setCurrentDataset,
  } = useAppState();

  // Selection states
  const [selectedDataset, setSelectedDataset] = useState(DATASET_OPTIONS[0]);
  const [selectedRegion, setSelectedRegion] = useState(REGION_OPTIONS[0]);
  const [selectedVariable, setSelectedVariable] = useState(VARIABLE_OPTIONS[0]);
  const [selectedYear, setSelectedYear] = useState(2020);

  // Generate data based on selections
  const timeSeriesData = generateTimeSeriesData(
    selectedDataset.id,
    selectedRegion.id,
    selectedVariable.id
  );

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
  };

  return <div>asd</div>;
}
