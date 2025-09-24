'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const HistoryPanel: React.FC = () => {
  const [selectedYear, setSelectedYear] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState('January');

  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  return (
    <div className="px-6 py-4">
      <h2 className="mb-6 text-xl font-semibold text-white">Date</h2>

      {/* Year Section */}
      <div className="mb-8">
        <h3 className="mb-4 font-medium text-white">Year</h3>
        <div className="mb-4">
          <input
            type="range"
            min="0"
            max="100"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="slider h-2 w-full cursor-pointer appearance-none rounded-lg bg-blue-800/50"
          />
          <div className="mt-2 flex justify-between text-sm text-blue-200">
            <span>0</span>
            <span>{selectedYear}</span>
          </div>
        </div>
      </div>

      {/* Month Section */}
      <div>
        <h3 className="mb-4 font-medium text-white">Month</h3>
        <div className="relative">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full cursor-pointer appearance-none rounded-lg border border-blue-500/30 bg-blue-800/50 px-4 py-3 text-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          >
            {months.map((month) => (
              <option key={month} value={month} className="bg-blue-800">
                {month}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 transform text-blue-200"
            size={20}
          />
        </div>
      </div>

      {/* Custom Slider Styles */}
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          border-radius: 50%;
          cursor: pointer;
        }
        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          border-radius: 50%;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
};

export default HistoryPanel;
