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

  const handleDatasetChange = (datasetId: string) => {
    const dataset =
      DATASET_OPTIONS.find((d) => d.id === datasetId) || DATASET_OPTIONS[0];
    setSelectedDataset(dataset);
    setCurrentDataset(dataset);
  };

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
  };

  return (
    <section className="flex-1 overflow-auto pt-20">
      {' '}
      {/* Added pt-20 for header spacing */}
      {/* Main Content Area */}
      <div className="container mx-auto px-6 py-8">
        {/* Control Bar - Dark theme compatible */}
        <div className="mb-8 rounded-2xl border border-gray-700/50 bg-gray-800/50 p-6 backdrop-blur-sm">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
            {/* Dataset Selection */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Dataset
              </label>
              <select
                value={selectedDataset.id}
                onChange={(e) => handleDatasetChange(e.target.value)}
                className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {DATASET_OPTIONS.map((option) => (
                  <option
                    key={option.id}
                    value={option.id}
                    className="bg-gray-800"
                  >
                    {option.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Region Selection */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Region
              </label>
              <select
                value={selectedRegion.id}
                onChange={(e) =>
                  setSelectedRegion(
                    REGION_OPTIONS.find((r) => r.id === e.target.value) ||
                      REGION_OPTIONS[0]
                  )
                }
                className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {REGION_OPTIONS.map((option) => (
                  <option
                    key={option.id}
                    value={option.id}
                    className="bg-gray-800"
                  >
                    {option.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Variable Selection */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Variable
              </label>
              <select
                value={selectedVariable.id}
                onChange={(e) =>
                  setSelectedVariable(
                    VARIABLE_OPTIONS.find((v) => v.id === e.target.value) ||
                      VARIABLE_OPTIONS[0]
                  )
                }
                className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {VARIABLE_OPTIONS.map((option) => (
                  <option
                    key={option.id}
                    value={option.id}
                    className="bg-gray-800"
                  >
                    {option.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Year Display */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Selected Year
              </label>
              <div className="rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2">
                <span className="text-lg font-semibold text-blue-400">
                  {selectedYear}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Graph Section */}
          <div className="rounded-2xl border border-gray-700/50 bg-gray-800/30 p-6 backdrop-blur-sm">
            <h2 className="mb-4 text-xl font-semibold text-white">
              Time Series: {selectedDataset.name} in {selectedRegion.name}
            </h2>
            <TimeSeriesGraph
              data={timeSeriesData}
              selectedYear={selectedYear}
              onYearSelect={setSelectedYear}
              dataset={selectedDataset}
              region={selectedRegion}
              variable={selectedVariable}
            />
          </div>
        </div>

        {/* Statistics Panel */}
        <div className="mt-8 rounded-2xl border border-gray-700/50 bg-gray-800/30 p-6 backdrop-blur-sm">
          <h2 className="mb-4 text-xl font-semibold text-white">
            Dataset Statistics
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/20 p-4 text-center">
              <div className="text-2xl font-bold text-blue-400">
                {timeSeriesData.length}
              </div>
              <div className="text-sm text-gray-300">Years of Data</div>
            </div>
            <div className="rounded-lg border border-green-500/30 bg-green-500/20 p-4 text-center">
              <div className="text-2xl font-bold text-green-400">
                {Math.min(...timeSeriesData.map((d) => d.value)).toFixed(1)}
              </div>
              <div className="text-sm text-gray-300">Minimum Value</div>
            </div>
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/20 p-4 text-center">
              <div className="text-2xl font-bold text-yellow-400">
                {Math.max(...timeSeriesData.map((d) => d.value)).toFixed(1)}
              </div>
              <div className="text-sm text-gray-300">Maximum Value</div>
            </div>
            <div className="rounded-lg border border-red-500/30 bg-red-500/20 p-4 text-center">
              <div className="text-2xl font-bold text-red-400">
                {selectedYear}
              </div>
              <div className="text-sm text-gray-300">Selected Year</div>
            </div>
          </div>
        </div>
      </div>
      {/* Left Control Panel */}
      <ControlPanel onShowSettings={() => setShowSettings(true)} />
      {/* Chat Bot */}
      <ChatBot show={showChat} onClose={() => setShowChat(false)} />
      {/* Modals */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showAbout && (
        <AboutModal
          onClose={() => setShowAbout(false)}
          onShowTutorial={() => {
            setShowAbout(false);
            setShowTutorial(true);
          }}
        />
      )}
      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
    </section>
  );
}
