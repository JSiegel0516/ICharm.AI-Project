'use client';

import React from 'react';
import { AppSidebar } from '@/app/dashboard/_components/app-sidebar';
import { SiteHeader } from '@/app/dashboard/_components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Download,
  Plus,
  Trash2,
  BarChart3,
  Eye,
  EyeOff,
  Activity,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Import Recharts components
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface Dataset {
  id: string;
  name: string;
  description: string;
  category: string;
  startDate: string;
  endDate: string;
  frequency: string;
  source: string;
  color: string;
}

interface TimeSeriesPoint {
  date: string;
  values: { [datasetId: string]: number };
}

interface AnalysisModel {
  id: string;
  name: string;
  description: string;
  icon: any;
}

const DATASETS: Dataset[] = [
  {
    id: 'temp-global',
    name: 'Global Temperature',
    description: 'Global average temperature anomalies',
    category: 'Climate',
    startDate: '1880-01-01',
    endDate: '2023-12-31',
    frequency: 'Monthly',
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
    source: 'NASA',
    color: '#8b5cf6',
  },
];

const ANALYSIS_MODELS: AnalysisModel[] = [
  {
    id: 'raw',
    name: 'Raw Data',
    description: 'Original data without processing',
    icon: Activity,
  },
  {
    id: 'moving-avg',
    name: 'Moving Average',
    description: '12-month moving average smoothing',
    icon: TrendingUp,
  },
  {
    id: 'trend',
    name: 'Trend Analysis',
    description: 'Linear trend line fitting',
    icon: TrendingUp,
  },
  {
    id: 'anomaly',
    name: 'Anomaly Detection',
    description: 'Statistical anomaly identification',
    icon: Zap,
  },
  {
    id: 'seasonal',
    name: 'Seasonal Decomposition',
    description: 'Separate seasonal patterns',
    icon: Activity,
  },
];

export default function TimeSeriesPage() {
  const [selectedDatasets, setSelectedDatasets] = useState<Dataset[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [visibleDatasets, setVisibleDatasets] = useState<Set<string>>(
    new Set()
  );
  const [dateRange, setDateRange] = useState({
    start: '1950-01-01',
    end: '2023-12-31',
  });
  const [chartType, setChartType] = useState<'line' | 'bar' | 'area'>('line');
  const [normalize, setNormalize] = useState(false);
  const [analysisModel, setAnalysisModel] = useState('raw');
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const categories = useMemo(
    () => ['All', ...new Set(DATASETS.map((d) => d.category))],
    []
  );

  const filteredDatasets = useMemo(() => {
    return DATASETS.filter((dataset) => {
      const matchesSearch =
        dataset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dataset.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory =
        selectedCategory === 'All' || dataset.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory]);

  const addDatasetToComparison = (dataset: Dataset) => {
    if (selectedDatasets.find((d) => d.id === dataset.id)) return;
    setSelectedDatasets((prev) => [...prev, dataset]);
    setVisibleDatasets((prev) => new Set([...prev, dataset.id]));
  };

  const removeDatasetFromComparison = (datasetId: string) => {
    setSelectedDatasets((prev) => prev.filter((d) => d.id !== datasetId));
    setVisibleDatasets((prev) => {
      const newSet = new Set(prev);
      newSet.delete(datasetId);
      return newSet;
    });
  };

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

  const applyAnalysisModel = (data: number[], model: string): number[] => {
    switch (model) {
      case 'moving-avg':
        return data.map((val, idx, arr) => {
          const window = 12;
          const start = Math.max(0, idx - window + 1);
          const subset = arr.slice(start, idx + 1);
          return subset.reduce((a, b) => a + b, 0) / subset.length;
        });
      case 'trend':
        const n = data.length;
        const sumX = (n * (n - 1)) / 2;
        const sumY = data.reduce((a, b) => a + b, 0);
        const sumXY = data.reduce((acc, y, x) => acc + x * y, 0);
        const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        return data.map((_, x) => slope * x + intercept);
      case 'anomaly':
        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        const std = Math.sqrt(
          data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
            data.length
        );
        return data.map((val) => (Math.abs(val - mean) > 2 * std ? val : mean));
      case 'seasonal':
        const seasonality = 12;
        return data.map((val, idx) => {
          const seasonIdx = idx % seasonality;
          const seasonVals = data.filter(
            (_, i) => i % seasonality === seasonIdx
          );
          const seasonMean =
            seasonVals.reduce((a, b) => a + b, 0) / seasonVals.length;
          return val - seasonMean;
        });
      default:
        return data;
    }
  };

  const generateTimeSeriesData = () => {
    setIsLoading(true);
    setTimeout(() => {
      const data: TimeSeriesPoint[] = [];
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      let currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const point: TimeSeriesPoint = {
          date: currentDate.toISOString().split('T')[0],
          values: {},
        };

        selectedDatasets.forEach((dataset) => {
          const timeFactor =
            (currentDate.getTime() - startDate.getTime()) /
            (endDate.getTime() - startDate.getTime());
          let value = 0;

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
        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      setTimeSeriesData(data);
      setIsLoading(false);
    }, 800);
  };

  useEffect(() => {
    if (selectedDatasets.length > 0) {
      generateTimeSeriesData();
    } else {
      setTimeSeriesData([]);
    }
  }, [selectedDatasets, dateRange, analysisModel]);

  const normalizeData = (data: number[]): number[] => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    if (range === 0) return data.map(() => 0);
    return data.map((value) => ((value - min) / range) * 100);
  };

  // Transform data for Recharts
  const rechartsData = useMemo(() => {
    const visibleDatasetIds = selectedDatasets
      .filter((dataset) => visibleDatasets.has(dataset.id))
      .map((dataset) => dataset.id);

    return timeSeriesData.map((point) => {
      const dataPoint: any = { date: point.date };

      visibleDatasetIds.forEach((datasetId) => {
        const dataset = selectedDatasets.find((d) => d.id === datasetId);
        if (dataset) {
          let rawValue = point.values[datasetId] || 0;
          // Apply analysis model to individual dataset
          const datasetValues = timeSeriesData.map(
            (p) => p.values[datasetId] || 0
          );
          const processedValues = applyAnalysisModel(
            datasetValues,
            analysisModel
          );
          const value = normalize
            ? normalizeData(processedValues)[timeSeriesData.indexOf(point)]
            : processedValues[timeSeriesData.indexOf(point)];

          dataPoint[datasetId] = Number(value.toFixed(2));
          dataPoint[`${datasetId}Color`] = dataset.color;
        }
      });

      return dataPoint;
    });
  }, [
    timeSeriesData,
    selectedDatasets,
    visibleDatasets,
    analysisModel,
    normalize,
  ]);

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

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background rounded-lg border p-3 shadow-lg">
          <p className="text-foreground text-sm font-medium">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.dataKey}: {normalize ? `${entry.value}%` : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Render appropriate chart based on type
  const renderChart = () => {
    const visibleDatasetsList = selectedDatasets.filter((dataset) =>
      visibleDatasets.has(dataset.id)
    );

    const commonProps = {
      data: rechartsData,
      margin: { top: 20, right: 30, left: 20, bottom: 20 },
    };

    if (visibleDatasetsList.length === 0) {
      return (
        <div className="text-muted-foreground flex h-80 items-center justify-center">
          <p>No datasets visible. Toggle visibility to display data.</p>
        </div>
      );
    }

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                });
              }}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => (normalize ? `${value}%` : value)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {visibleDatasetsList.map((dataset) => (
              <Line
                key={dataset.id}
                type="monotone"
                dataKey={dataset.id}
                stroke={dataset.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                name={dataset.name}
              />
            ))}
          </LineChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                });
              }}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => (normalize ? `${value}%` : value)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {visibleDatasetsList.map((dataset) => (
              <Bar
                key={dataset.id}
                dataKey={dataset.id}
                fill={dataset.color}
                name={dataset.name}
              />
            ))}
          </BarChart>
        );

      case 'area':
        return (
          <AreaChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                });
              }}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => (normalize ? `${value}%` : value)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {visibleDatasetsList.map((dataset) => (
              <Area
                key={dataset.id}
                type="monotone"
                dataKey={dataset.id}
                stroke={dataset.color}
                fill={dataset.color}
                fillOpacity={0.3}
                strokeWidth={2}
                name={dataset.name}
              />
            ))}
          </AreaChart>
        );

      default:
        return null;
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <ResizablePanelGroup direction="horizontal">
                {/* Left Panel - Dataset Selection */}
                <ResizablePanel defaultSize={30} minSize={20} maxSize={40}>
                  <div className="h-full space-y-4 overflow-auto p-4">
                    {/* Dataset Browser */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Add Datasets</CardTitle>
                        <CardDescription>
                          Search and select datasets to compare
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Search */}
                        <div className="relative">
                          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <Input
                            type="text"
                            placeholder="Search datasets..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                          />
                        </div>

                        {/* Category Filter */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium">
                            Category
                          </label>
                          <Select
                            value={selectedCategory}
                            onValueChange={setSelectedCategory}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map((category) => (
                                <SelectItem key={category} value={category}>
                                  {category}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Available Datasets */}
                        <ScrollArea className="h-64">
                          <div className="space-y-2">
                            {filteredDatasets.map((dataset) => (
                              <motion.div
                                key={dataset.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                              >
                                <Card
                                  className={`cursor-pointer transition-all ${
                                    selectedDatasets.find(
                                      (d) => d.id === dataset.id
                                    )
                                      ? 'border-blue-500/50 bg-blue-600/10'
                                      : 'hover:bg-muted/50'
                                  }`}
                                  onClick={() =>
                                    addDatasetToComparison(dataset)
                                  }
                                >
                                  <CardContent className="p-3">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 space-y-1">
                                        <div className="flex items-center gap-2">
                                          <div
                                            className="h-3 w-3 rounded-full"
                                            style={{
                                              backgroundColor: dataset.color,
                                            }}
                                          />
                                          <h4 className="text-sm font-medium">
                                            {dataset.name}
                                          </h4>
                                        </div>
                                        <p className="text-muted-foreground line-clamp-2 text-xs">
                                          {dataset.description}
                                        </p>
                                        <div className="flex items-center gap-2 text-xs">
                                          <Badge variant="secondary">
                                            {dataset.category}
                                          </Badge>
                                          <span className="text-muted-foreground">
                                            {dataset.frequency}
                                          </span>
                                        </div>
                                      </div>
                                      <Plus size={16} className="mt-1" />
                                    </div>
                                  </CardContent>
                                </Card>
                              </motion.div>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>

                    {/* Selected Datasets */}
                    {selectedDatasets.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">
                            Selected Datasets ({selectedDatasets.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {selectedDatasets.map((dataset) => (
                              <motion.div
                                key={dataset.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                              >
                                <Card>
                                  <CardContent className="p-3">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            toggleDatasetVisibility(dataset.id)
                                          }
                                          className="h-6 w-6 p-0"
                                        >
                                          {visibleDatasets.has(dataset.id) ? (
                                            <Eye size={14} />
                                          ) : (
                                            <EyeOff size={14} />
                                          )}
                                        </Button>
                                        <div
                                          className="h-3 w-3 rounded-full"
                                          style={{
                                            backgroundColor: dataset.color,
                                          }}
                                        />
                                        <span className="text-sm font-medium">
                                          {dataset.name}
                                        </span>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          removeDatasetFromComparison(
                                            dataset.id
                                          )
                                        }
                                        className="text-destructive h-6 w-6 p-0"
                                      >
                                        <Trash2 size={14} />
                                      </Button>
                                    </div>
                                  </CardContent>
                                </Card>
                              </motion.div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Right Panel - Visualization */}
                <ResizablePanel defaultSize={70}>
                  <div className="h-full space-y-4 overflow-auto p-4">
                    {/* Configuration Panel */}
                    <Card>
                      <CardContent className="pt-6">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">
                              Start Date
                            </label>
                            <Input
                              type="date"
                              value={dateRange.start}
                              onChange={(e) =>
                                setDateRange((prev) => ({
                                  ...prev,
                                  start: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">
                              End Date
                            </label>
                            <Input
                              type="date"
                              value={dateRange.end}
                              onChange={(e) =>
                                setDateRange((prev) => ({
                                  ...prev,
                                  end: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">
                              Chart Type
                            </label>
                            <Select
                              value={chartType}
                              onValueChange={(value: any) =>
                                setChartType(value)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="line">Line Chart</SelectItem>
                                <SelectItem value="bar">Bar Chart</SelectItem>
                                <SelectItem value="area">Area Chart</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">
                              Analysis Model
                            </label>
                            <Select
                              value={analysisModel}
                              onValueChange={setAnalysisModel}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ANALYSIS_MODELS.map((model) => (
                                  <SelectItem key={model.id} value={model.id}>
                                    {model.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center space-x-2">
                          <Checkbox
                            id="normalize"
                            checked={normalize}
                            onCheckedChange={(checked) =>
                              setNormalize(checked as boolean)
                            }
                          />
                          <label
                            htmlFor="normalize"
                            className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            Normalize Data
                          </label>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Chart Area */}
                    <Card>
                      <CardContent className="p-6">
                        <AnimatePresence mode="wait">
                          {selectedDatasets.length === 0 ? (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="text-muted-foreground flex h-96 flex-col items-center justify-center"
                            >
                              <BarChart3
                                size={64}
                                className="mb-4 opacity-50"
                              />
                              <p className="text-lg font-medium">
                                No datasets selected
                              </p>
                              <p className="text-sm">
                                Add datasets from the sidebar to begin analysis
                              </p>
                            </motion.div>
                          ) : isLoading ? (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="flex h-96 items-center justify-center"
                            >
                              <div className="text-center">
                                <div className="border-muted border-t-primary mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4" />
                                <p className="text-muted-foreground">
                                  Loading data...
                                </p>
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                            >
                              <div className="mb-4 flex items-center justify-between">
                                <div>
                                  <h3 className="text-lg font-semibold">
                                    Time Series Comparison
                                  </h3>
                                  <p className="text-muted-foreground text-sm">
                                    {dateRange.start} to {dateRange.end} •{' '}
                                    {
                                      ANALYSIS_MODELS.find(
                                        (m) => m.id === analysisModel
                                      )?.name
                                    }
                                  </p>
                                </div>
                                <Button onClick={downloadData}>
                                  <Download size={16} className="mr-2" />
                                  Export CSV
                                </Button>
                              </div>

                              <div className="bg-muted/20 h-96 rounded-lg border p-4">
                                <ResponsiveContainer width="100%" height="100%">
                                  {renderChart()}
                                </ResponsiveContainer>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                {selectedDatasets.map((dataset) => (
                                  <Button
                                    key={dataset.id}
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      toggleDatasetVisibility(dataset.id)
                                    }
                                    className={
                                      !visibleDatasets.has(dataset.id)
                                        ? 'opacity-50'
                                        : ''
                                    }
                                  >
                                    <div
                                      className="mr-2 h-3 w-3 rounded-full"
                                      style={{
                                        backgroundColor: dataset.color,
                                      }}
                                    />
                                    {dataset.name}
                                  </Button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </CardContent>
                    </Card>

                    {/* Analysis Model Info */}
                    {selectedDatasets.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm">
                            Analysis Model Information
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-start gap-3">
                            {React.createElement(
                              ANALYSIS_MODELS.find(
                                (m) => m.id === analysisModel
                              )?.icon || Activity,
                              {
                                size: 20,
                                className: 'text-primary mt-1 flex-shrink-0',
                              }
                            )}
                            <div>
                              <p className="font-medium">
                                {
                                  ANALYSIS_MODELS.find(
                                    (m) => m.id === analysisModel
                                  )?.name
                                }
                              </p>
                              <p className="text-muted-foreground text-sm">
                                {
                                  ANALYSIS_MODELS.find(
                                    (m) => m.id === analysisModel
                                  )?.description
                                }
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Data Table */}
                    {selectedDatasets.length > 0 &&
                      timeSeriesData.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-lg">
                              Data Table
                            </CardTitle>
                            <CardDescription>
                              Raw time series data for selected datasets
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <ScrollArea className="h-64">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-32">Date</TableHead>
                                    {selectedDatasets.map((dataset) => (
                                      <TableHead key={dataset.id}>
                                        <div className="flex items-center gap-2">
                                          <div
                                            className="h-3 w-3 rounded-full"
                                            style={{
                                              backgroundColor: dataset.color,
                                            }}
                                          />
                                          {dataset.name}
                                        </div>
                                      </TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {timeSeriesData
                                    .slice(0, 50) // Limit to first 50 rows for performance
                                    .map((point, index) => (
                                      <TableRow key={index}>
                                        <TableCell className="font-mono text-xs">
                                          {point.date}
                                        </TableCell>
                                        {selectedDatasets.map((dataset) => (
                                          <TableCell key={dataset.id}>
                                            <div className="font-mono text-xs">
                                              {point.values[
                                                dataset.id
                                              ]?.toFixed(2) || '-'}
                                            </div>
                                          </TableCell>
                                        ))}
                                      </TableRow>
                                    ))}
                                  {timeSeriesData.length > 50 && (
                                    <TableRow>
                                      <TableCell
                                        colSpan={selectedDatasets.length + 1}
                                        className="text-muted-foreground text-center"
                                      >
                                        Showing first 50 of{' '}
                                        {timeSeriesData.length} rows
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </TableBody>
                              </Table>
                            </ScrollArea>
                          </CardContent>
                        </Card>
                      )}

                    {/* Statistics Summary */}
                    {selectedDatasets.length > 0 &&
                      timeSeriesData.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-lg">
                              Statistics Summary
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                              {selectedDatasets.map((dataset) => {
                                const values = timeSeriesData
                                  .map((point) => point.values[dataset.id])
                                  .filter((val) => val !== undefined);

                                if (values.length === 0) return null;

                                const min = Math.min(...values);
                                const max = Math.max(...values);
                                const avg =
                                  values.reduce((a, b) => a + b, 0) /
                                  values.length;
                                const trend =
                                  values[values.length - 1] - values[0];

                                return (
                                  <Card
                                    key={dataset.id}
                                    className="relative overflow-hidden"
                                  >
                                    <div
                                      className="absolute top-0 left-0 h-1 w-full"
                                      style={{ backgroundColor: dataset.color }}
                                    />
                                    <CardContent className="pt-6">
                                      <div className="mb-3 flex items-center gap-2">
                                        <div
                                          className="h-3 w-3 rounded-full"
                                          style={{
                                            backgroundColor: dataset.color,
                                          }}
                                        />
                                        <h4 className="font-semibold">
                                          {dataset.name}
                                        </h4>
                                      </div>
                                      <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">
                                            Min:
                                          </span>
                                          <span className="font-mono">
                                            {min.toFixed(2)}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">
                                            Max:
                                          </span>
                                          <span className="font-mono">
                                            {max.toFixed(2)}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">
                                            Average:
                                          </span>
                                          <span className="font-mono">
                                            {avg.toFixed(2)}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">
                                            Trend:
                                          </span>
                                          <span
                                            className={`font-mono ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}
                                          >
                                            {trend >= 0 ? '+' : ''}
                                            {trend.toFixed(2)}
                                          </span>
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
