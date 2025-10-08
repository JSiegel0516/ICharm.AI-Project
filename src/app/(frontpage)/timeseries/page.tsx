'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Filter,
  Download,
  Plus,
  X,
  Trash2,
  BarChart3,
  LineChart,
  Activity,
  Calendar,
  ChevronDown,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Types
interface Dataset {
  id: string;
  name: string;
  description: string;
  category: string;
  startDate: string;
  endDate: string;
  frequency: string;
  variables: string[];
  source: string;
  color: string;
}

interface TimeSeriesPoint {
  date: string;
  values: { [datasetId: string]: number };
}

interface ComparisonConfig {
  datasets: string[];
  dateRange: { start: string; end: string };
  variables: string[];
  chartType: 'line' | 'bar' | 'area';
  normalize: boolean;
}

// Mock data - replace with your actual data
const mockDatasets: Dataset[] = [
  {
    id: 'temp-global',
    name: 'Global Temperature',
    description: 'Global average temperature anomalies',
    category: 'Climate',
    startDate: '1880-01-01',
    endDate: '2023-12-31',
    frequency: 'Monthly',
    variables: ['temperature'],
    source: 'NASA GISS',
    color: '#ef4444',
  },
  {
    id: 'co2-mauna-loa',
    name: 'CO2 Concentration',
    description: 'Atmospheric CO2 measurements from Mauna Loa',
    category: 'Atmosphere',
    startDate: '1958-03-01',
    endDate: '2023-12-31',
    frequency: 'Monthly',
    variables: ['co2'],
    source: 'NOAA',
    color: '#3b82f6',
  },
  {
    id: 'arctic-ice',
    name: 'Arctic Sea Ice',
    description: 'Arctic sea ice extent measurements',
    category: 'Cryosphere',
    startDate: '1979-01-01',
    endDate: '2023-12-31',
    frequency: 'Monthly',
    variables: ['ice_extent'],
    source: 'NSIDC',
    color: '#06b6d4',
  },
  {
    id: 'precipitation-global',
    name: 'Global Precipitation',
    description: 'Global precipitation anomalies',
    category: 'Hydrology',
    startDate: '1900-01-01',
    endDate: '2023-12-31',
    frequency: 'Monthly',
    variables: ['precipitation'],
    source: 'GPCC',
    color: '#10b981',
  },
  {
    id: 'sea-level',
    name: 'Global Sea Level',
    description: 'Global mean sea level rise',
    category: 'Oceans',
    startDate: '1993-01-01',
    endDate: '2023-12-31',
    frequency: 'Monthly',
    variables: ['sea_level'],
    source: 'NASA',
    color: '#8b5cf6',
  },
];

export default function TimeSeriesPage() {
  // State
  const [selectedDatasets, setSelectedDatasets] = useState<Dataset[]>([]);
  const [availableDatasets, setAvailableDatasets] =
    useState<Dataset[]>(mockDatasets);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [comparisonConfig, setComparisonConfig] = useState<ComparisonConfig>({
    datasets: [],
    dateRange: { start: '1950-01-01', end: '2023-12-31' },
    variables: [],
    chartType: 'line',
    normalize: false,
  });
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [visibleDatasets, setVisibleDatasets] = useState<Set<string>>(
    new Set()
  );

  // Filter datasets based on search and category
  const filteredDatasets = availableDatasets.filter((dataset) => {
    const matchesSearch =
      dataset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dataset.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === 'All' || dataset.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Categories for filter
  const categories = ['All', ...new Set(mockDatasets.map((d) => d.category))];

  // Add dataset to comparison
  const addDatasetToComparison = (dataset: Dataset) => {
    if (selectedDatasets.find((d) => d.id === dataset.id)) return;

    setSelectedDatasets((prev) => [...prev, dataset]);
    setVisibleDatasets((prev) => new Set([...prev, dataset.id]));
    setComparisonConfig((prev) => ({
      ...prev,
      datasets: [...prev.datasets, dataset.id],
      variables: [...new Set([...prev.variables, ...dataset.variables])],
    }));
  };

  // Remove dataset from comparison
  const removeDatasetFromComparison = (datasetId: string) => {
    setSelectedDatasets((prev) => prev.filter((d) => d.id !== datasetId));
    setVisibleDatasets((prev) => {
      const newSet = new Set(prev);
      newSet.delete(datasetId);
      return newSet;
    });
    setComparisonConfig((prev) => ({
      ...prev,
      datasets: prev.datasets.filter((id) => id !== datasetId),
    }));
  };

  // Toggle dataset visibility
  const toggleDatasetVisibility = (datasetId: string) => {
    setVisibleDatasets((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(datasetId)) {
        newSet.delete(datasetId);
      } else {
        newSet.add(datasetId);
      }
      return newSet;
    });
  };

  // Generate mock time series data
  const generateTimeSeriesData = () => {
    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      const data: TimeSeriesPoint[] = [];
      const startDate = new Date(comparisonConfig.dateRange.start);
      const endDate = new Date(comparisonConfig.dateRange.end);

      let currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const point: TimeSeriesPoint = {
          date: currentDate.toISOString().split('T')[0],
          values: {},
        };

        selectedDatasets.forEach((dataset) => {
          // Generate realistic-looking mock data based on dataset type
          let value = 0;
          const timeFactor =
            (currentDate.getTime() - startDate.getTime()) /
            (endDate.getTime() - startDate.getTime());

          switch (dataset.id) {
            case 'temp-global':
              value = 14 + timeFactor * 1.2 + Math.random() * 0.5;
              break;
            case 'co2-mauna-loa':
              value = 310 + timeFactor * 100 + Math.random() * 2;
              break;
            case 'arctic-ice':
              value = 12 - timeFactor * 4 + Math.random() * 1;
              break;
            case 'precipitation-global':
              value =
                100 +
                Math.sin(timeFactor * Math.PI * 2) * 20 +
                Math.random() * 10;
              break;
            case 'sea-level':
              value = timeFactor * 100 + Math.random() * 2;
              break;
            default:
              value = Math.random() * 100;
          }

          point.values[dataset.id] = Number(value.toFixed(2));
        });

        data.push(point);

        // Move to next month
        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      setTimeSeriesData(data);
      setIsLoading(false);
    }, 1000);
  };

  // Load data when selected datasets or date range changes
  useEffect(() => {
    if (selectedDatasets.length > 0) {
      generateTimeSeriesData();
    } else {
      setTimeSeriesData([]);
    }
  }, [selectedDatasets, comparisonConfig.dateRange]);

  // Normalize data if needed
  const normalizeData = (data: number[]): number[] => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    if (range === 0) return data.map(() => 0);
    return data.map((value) => ((value - min) / range) * 100);
  };

  // Prepare chart data
  const chartData = {
    labels: timeSeriesData.map((point) => point.date),
    datasets: selectedDatasets
      .filter((dataset) => visibleDatasets.has(dataset.id))
      .map((dataset) => {
        const rawData = timeSeriesData.map(
          (point) => point.values[dataset.id] || 0
        );
        const data = comparisonConfig.normalize
          ? normalizeData(rawData)
          : rawData;

        return {
          label: dataset.name,
          data: data,
          borderColor: dataset.color,
          backgroundColor:
            comparisonConfig.chartType === 'area'
              ? `${dataset.color}33`
              : dataset.color,
          borderWidth: 2,
          fill: comparisonConfig.chartType === 'area',
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
        };
      }),
  };

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          label: function (context: any) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += comparisonConfig.normalize
                ? context.parsed.y.toFixed(2) + '%'
                : context.parsed.y.toFixed(2);
            }
            return label;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.05)',
        },
        ticks: {
          color: '#9ca3af',
          maxTicksLimit: 10,
        },
      },
      y: {
        grid: {
          color: 'rgba(255, 255, 255, 0.05)',
        },
        ticks: {
          color: '#9ca3af',
          callback: function (value: any) {
            return comparisonConfig.normalize ? value + '%' : value;
          },
        },
      },
    },
  };

  // Download data as CSV
  const downloadData = () => {
    if (timeSeriesData.length === 0) return;

    const headers = ['Date', ...selectedDatasets.map((d) => d.name)];
    const csvContent = [
      headers.join(','),
      ...timeSeriesData.map((point) =>
        [
          point.date,
          ...selectedDatasets.map((dataset) => point.values[dataset.id] || ''),
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timeseries-comparison.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 pt-20 text-white">
      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          {/* Sidebar - Dataset Selection */}
          <div className="space-y-6 lg:col-span-1">
            {/* Search and Filter */}
            <div className="rounded-xl bg-slate-800/50 p-6 backdrop-blur-sm">
              <h3 className="mb-4 text-lg font-semibold">Add Datasets</h3>

              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search datasets..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg bg-slate-700/50 py-2 pl-10 pr-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Category Filter */}
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full rounded-lg bg-slate-700/50 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              {/* Available Datasets List */}
              <div className="max-h-96 space-y-3 overflow-y-auto">
                {filteredDatasets.map((dataset) => (
                  <motion.div
                    key={dataset.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`cursor-pointer rounded-lg p-3 transition-all ${
                      selectedDatasets.find((d) => d.id === dataset.id)
                        ? 'border border-blue-500/50 bg-blue-600/20'
                        : 'bg-slate-700/30 hover:bg-slate-700/50'
                    }`}
                    onClick={() => addDatasetToComparison(dataset)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: dataset.color }}
                          />
                          <h4 className="text-sm font-medium">
                            {dataset.name}
                          </h4>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-gray-400">
                          {dataset.description}
                        </p>
                        <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                          <span>{dataset.category}</span>
                          <span>{dataset.frequency}</span>
                        </div>
                      </div>
                      <Plus size={16} className="text-gray-400" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Selected Datasets */}
            {selectedDatasets.length > 0 && (
              <div className="rounded-xl bg-slate-800/50 p-6 backdrop-blur-sm">
                <h3 className="mb-4 text-lg font-semibold">
                  Selected Datasets ({selectedDatasets.length})
                </h3>
                <div className="space-y-3">
                  {selectedDatasets.map((dataset) => (
                    <motion.div
                      key={dataset.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="rounded-lg bg-slate-700/30 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleDatasetVisibility(dataset.id)}
                            className="text-gray-400 transition-colors hover:text-white"
                          >
                            {visibleDatasets.has(dataset.id) ? (
                              <Eye size={16} />
                            ) : (
                              <EyeOff size={16} />
                            )}
                          </button>
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: dataset.color }}
                          />
                          <span className="text-sm font-medium">
                            {dataset.name}
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            removeDatasetFromComparison(dataset.id)
                          }
                          className="text-gray-400 transition-colors hover:text-red-400"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="space-y-6 lg:col-span-3">
            {/* Configuration Panel */}
            <div className="rounded-xl bg-slate-800/50 p-6 backdrop-blur-sm">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {/* Date Range */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-300">
                    Date Range
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={comparisonConfig.dateRange.start}
                      onChange={(e) =>
                        setComparisonConfig((prev) => ({
                          ...prev,
                          dateRange: {
                            ...prev.dateRange,
                            start: e.target.value,
                          },
                        }))
                      }
                      className="flex-1 rounded-lg bg-slate-700/50 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="date"
                      value={comparisonConfig.dateRange.end}
                      onChange={(e) =>
                        setComparisonConfig((prev) => ({
                          ...prev,
                          dateRange: { ...prev.dateRange, end: e.target.value },
                        }))
                      }
                      className="flex-1 rounded-lg bg-slate-700/50 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Chart Type */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-300">
                    Chart Type
                  </label>
                  <select
                    value={comparisonConfig.chartType}
                    onChange={(e) =>
                      setComparisonConfig((prev) => ({
                        ...prev,
                        chartType: e.target.value as 'line' | 'bar' | 'area',
                      }))
                    }
                    className="w-full rounded-lg bg-slate-700/50 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="line">Line Chart</option>
                    <option value="bar">Bar Chart</option>
                    <option value="area">Area Chart</option>
                  </select>
                </div>

                {/* Options */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-300">
                    Options
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="normalize"
                      checked={comparisonConfig.normalize}
                      onChange={(e) =>
                        setComparisonConfig((prev) => ({
                          ...prev,
                          normalize: e.target.checked,
                        }))
                      }
                      className="rounded bg-slate-700/50 text-blue-500 focus:ring-blue-500"
                    />
                    <label
                      htmlFor="normalize"
                      className="text-sm text-gray-300"
                    >
                      Normalize Data
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Visualization Area */}
            <div className="rounded-xl bg-slate-800/50 p-6 backdrop-blur-sm">
              <AnimatePresence>
                {selectedDatasets.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex h-64 flex-col items-center justify-center text-gray-400"
                  >
                    <BarChart3 size={48} className="mb-4" />
                    <p className="text-lg">No datasets selected</p>
                    <p className="text-sm">
                      Add datasets from the sidebar to start comparing
                    </p>
                  </motion.div>
                ) : isLoading ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex h-64 items-center justify-center"
                  >
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-4"
                  >
                    {/* Chart */}
                    <div className="rounded-lg bg-slate-700/30 p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-lg font-semibold">
                          Time Series Comparison
                        </h3>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2 text-sm text-gray-400">
                            <Calendar size={16} />
                            <span>
                              {comparisonConfig.dateRange.start} to{' '}
                              {comparisonConfig.dateRange.end}
                            </span>
                          </div>
                          <button
                            onClick={downloadData}
                            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-blue-700"
                          >
                            <Download size={16} />
                            Export CSV
                          </button>
                        </div>
                      </div>

                      {/* Chart */}
                      <div className="h-80">
                        {comparisonConfig.chartType === 'line' ||
                        comparisonConfig.chartType === 'area' ? (
                          <Line data={chartData} options={chartOptions} />
                        ) : (
                          <Bar data={chartData} options={chartOptions} />
                        )}
                      </div>

                      {/* Custom Legend */}
                      <div className="mt-4 flex flex-wrap gap-3">
                        {selectedDatasets.map((dataset) => (
                          <button
                            key={dataset.id}
                            onClick={() => toggleDatasetVisibility(dataset.id)}
                            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all ${
                              visibleDatasets.has(dataset.id)
                                ? 'bg-slate-600/50'
                                : 'bg-slate-700/30 opacity-50'
                            }`}
                          >
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: dataset.color }}
                            />
                            <span>{dataset.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Data Table Preview */}
                    <div className="rounded-lg bg-slate-700/30 p-4">
                      <h4 className="mb-3 text-sm font-semibold">
                        Data Preview
                      </h4>
                      <div className="max-h-48 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="px-3 py-2 text-left">Date</th>
                              {selectedDatasets.map((dataset) => (
                                <th
                                  key={dataset.id}
                                  className="px-3 py-2 text-right"
                                >
                                  {dataset.name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {timeSeriesData.slice(0, 10).map((point, index) => (
                              <tr
                                key={index}
                                className="border-b border-white/5"
                              >
                                <td className="px-3 py-2">{point.date}</td>
                                {selectedDatasets.map((dataset) => (
                                  <td
                                    key={dataset.id}
                                    className="px-3 py-2 text-right"
                                  >
                                    {point.values[dataset.id]?.toFixed(2) ||
                                      '-'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
