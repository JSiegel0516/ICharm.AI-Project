'use client';

import React, { useState } from 'react';
import { Download } from 'lucide-react';

const DatasetPanel: React.FC = () => {
  const [selectedPressure, setSelectedPressure] = useState('1000.0');

  const pressureLevels = [
    '1000.0',
    '950.0',
    '900.0',
    '850.0',
    '800.0',
    '750.0',
    '700.0',
    '650.0',
    '600.0',
    '550.0',
    '500.0',
    '450.0',
    '400.0',
    '350.0',
    '300.0',
    '250.0',
    '200.0',
    '150.0',
    '100.0',
    '70.0',
    '50.0',
    '30.0',
    '20.0',
    '10.0',
  ];

  return (
    <div className="px-6 py-4">
      <h2 className="mb-6 text-xl font-semibold text-white">Select Datasets</h2>

      {/* Climate Data Button */}
      <button className="mb-6 w-full rounded-xl border border-blue-500/30 bg-blue-700/50 px-4 py-3 font-medium text-white transition-all duration-200 hover:border-blue-400/50 hover:bg-blue-600/60">
        Climate Data
      </button>

      {/* Pressure Levels */}
      <div className="mb-6">
        <h3 className="mb-4 font-medium text-white">Pressure Levels</h3>
        <div className="custom-scrollbar max-h-64 space-y-2 overflow-y-auto">
          {pressureLevels.map((level) => (
            <button
              key={level}
              onClick={() => setSelectedPressure(level)}
              className={`group flex w-full items-center justify-between rounded-xl p-3 transition-all duration-200 ${
                selectedPressure === level
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                  : 'border border-blue-600/30 bg-blue-800/30 text-blue-100 hover:border-blue-500/50 hover:bg-blue-700/50 hover:text-white'
              }`}
            >
              <span className="font-medium">{level} millibar</span>
              <div
                className={`h-2 w-2 rounded-full transition-colors ${
                  selectedPressure === level ? 'bg-white' : 'bg-blue-400'
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Download Data Section */}
      <div className="border-t border-blue-500/30 pt-6">
        <div className="mb-4 flex items-center gap-2">
          <Download size={16} className="text-white" />
          <h3 className="font-medium text-white">Download Data</h3>
        </div>

        <div className="space-y-3">
          <button className="w-full transform rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 font-medium text-white shadow-lg transition-all duration-200 hover:scale-[1.02] hover:from-blue-700 hover:to-blue-800 hover:shadow-blue-500/25">
            Download as CSV
          </button>
          <button className="w-full transform rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 px-4 py-3 font-medium text-white shadow-lg transition-all duration-200 hover:scale-[1.02] hover:from-purple-700 hover:to-purple-800 hover:shadow-purple-500/25">
            Download as NetCDF
          </button>
          <button className="w-full transform rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-3 font-medium text-white shadow-lg transition-all duration-200 hover:scale-[1.02] hover:from-blue-600 hover:to-purple-700 hover:shadow-purple-500/25">
            Export Visualization
          </button>
        </div>

        {/* Current Selection */}
        <div className="mt-6 rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-800/30 to-purple-800/30 p-4 backdrop-blur-sm">
          <h4 className="mb-3 flex items-center gap-2 font-medium text-white">
            <div className="h-2 w-2 rounded-full bg-blue-400"></div>
            Current Selection
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-blue-200">Dataset:</span>
              <span className="text-white">Temperature</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-200">Pressure:</span>
              <span className="text-white">{selectedPressure} mbar</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-200">Date:</span>
              <span className="text-white">1951-01</span>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Scrollbar Styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(30, 58, 138, 0.4);
          border-radius: 4px;
          margin: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(147, 197, 253, 0.9);
          border-radius: 4px;
          border: 1px solid rgba(59, 130, 246, 0.6);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(147, 197, 253, 1);
          border-color: rgba(59, 130, 246, 0.9);
        }
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(147, 197, 253, 0.9) rgba(30, 58, 138, 0.4);
        }
      `}</style>
    </div>
  );
};

export default DatasetPanel;
