// components/Graphs/TimeSeriesGraph.tsx
'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface TimeSeriesData {
  year: number;
  value: number;
  dataset: string;
  region: string;
  variable: string;
}

interface TimeSeriesGraphProps {
  data: TimeSeriesData[];
  selectedYear: number;
  onYearSelect: (year: number) => void;
  dataset: { id: string; name: string };
  region: { id: string; name: string };
  variable: { id: string; name: string };
}

const TimeSeriesGraph: React.FC<TimeSeriesGraphProps> = ({
  data,
  selectedYear,
  onYearSelect,
  dataset,
  region,
  variable,
}) => {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-gray-300 bg-white p-3 shadow-lg">
          <p className="font-semibold">{`Year: ${label}`}</p>
          <p className="text-blue-600">{`Value: ${payload[0].value.toFixed(2)}`}</p>
          <p className="text-sm text-gray-600">{dataset.name}</p>
          <p className="text-sm text-gray-600">{region.name}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-96 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          onClick={(e) => {
            const payload = (e as any).activePayload;
            if (payload && payload.length > 0) {
              onYearSelect(payload[0].payload.year);
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="year"
            interval="preserveStartEnd"
            tick={{ fontSize: 12 }}
            label={{ value: 'Year', position: 'insideBottom', offset: -10 }}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            label={{ value: 'Value', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
            activeDot={{
              r: 6,
              fill: '#ef4444',
              stroke: '#ef4444',
              strokeWidth: 2,
            }}
          />
          <ReferenceLine
            x={selectedYear}
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="3 3"
            label={{ value: 'Selected', position: 'top', fill: '#ef4444' }}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-4 text-center text-sm text-gray-600">
        Click on the graph to select a specific year
      </div>
    </div>
  );
};

export default TimeSeriesGraph;
