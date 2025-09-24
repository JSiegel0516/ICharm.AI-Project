'use client';

import React, { useState } from 'react';
import { Search } from 'lucide-react';

interface DatasetDropdownProps {
  onSelectDataset: (dataset: any) => void;
  isVisible: boolean;
}

const DatasetDropdown: React.FC<DatasetDropdownProps> = ({
  onSelectDataset,
  isVisible,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Mock climate datasets based on your weather data types
  const climateDatasets = [
    {
      id: '1',
      name: 'Temperature',
      unit: '°C',
      description: 'Air temperature measurements',
    },
    {
      id: '2',
      name: 'Precipitation',
      unit: 'mm',
      description: 'Rainfall and precipitation data',
    },
    {
      id: '3',
      name: 'Humidity',
      unit: '%',
      description: 'Relative humidity measurements',
    },
    {
      id: '4',
      name: 'Wind Speed',
      unit: 'm/s',
      description: 'Wind velocity measurements',
    },
    {
      id: '5',
      name: 'Sea Level',
      unit: 'mm',
      description: 'Sea level pressure data',
    },
    {
      id: '6',
      name: 'Solar Radiation',
      unit: 'W/m²',
      description: 'Solar energy measurements',
    },
    {
      id: '7',
      name: 'Cloud Cover',
      unit: '%',
      description: 'Cloud coverage percentage',
    },
    {
      id: '8',
      name: 'Evaporation',
      unit: 'mm',
      description: 'Evaporation rate data',
    },
    {
      id: '9',
      name: 'Snow Depth',
      unit: 'cm',
      description: 'Snow accumulation measurements',
    },
    {
      id: '10',
      name: 'Pressure',
      unit: 'hPa',
      description: 'Atmospheric pressure data',
    },
    {
      id: '11',
      name: 'UV Index',
      unit: 'index',
      description: 'Ultraviolet radiation index',
    },
    {
      id: '12',
      name: 'Visibility',
      unit: 'km',
      description: 'Atmospheric visibility range',
    },
  ];

  const filteredDatasets = climateDatasets.filter(
    (dataset) =>
      dataset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dataset.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDatasetSelect = (dataset: any) => {
    onSelectDataset(dataset);
    setSearchQuery(''); // Clear search after selection
  };

  if (!isVisible) return null;

  return (
    <div className="animate-fade-in absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-slate-600/50 bg-slate-800/95 shadow-2xl backdrop-blur-sm">
      {/* Rainbow border effect */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-red-400 via-blue-400 via-green-400 via-yellow-400 to-purple-400 p-px">
        <div className="h-full w-full rounded-2xl bg-slate-800">
          {/* Search Bar */}
          <div className="border-b border-slate-600/50 p-4">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 transform text-gray-400"
                size={16}
              />
              <input
                type="text"
                placeholder="Search datasets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-700/60 py-2 pl-10 pr-4 text-white placeholder-gray-400 outline-none transition-colors focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Dataset List */}
          <div className="custom-scrollbar max-h-80 overflow-y-auto">
            {filteredDatasets.length > 0 ? (
              <div className="p-2">
                {filteredDatasets.map((dataset) => (
                  <button
                    key={dataset.id}
                    onClick={() => handleDatasetSelect(dataset)}
                    className="group w-full rounded-xl p-3 text-left transition-all duration-200 hover:bg-slate-700/60"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-white transition-colors group-hover:text-blue-300">
                          {dataset.name}
                        </h4>
                        <p className="mt-1 text-xs text-gray-400 transition-colors group-hover:text-gray-300">
                          {dataset.description}
                        </p>
                      </div>
                      <span className="ml-3 font-mono text-xs text-gray-500 transition-colors group-hover:text-blue-400">
                        {dataset.unit}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center">
                <p className="text-sm text-gray-400">No datasets found</p>
                <p className="mt-1 text-xs text-gray-500">
                  Try a different search term
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Custom Scrollbar Styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #475569;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #64748b;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
};

export default DatasetDropdown;
