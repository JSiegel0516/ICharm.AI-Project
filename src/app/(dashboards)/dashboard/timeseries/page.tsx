'use client';

import React from 'react';
import { AppSidebar } from '@/app/(dashboards)/dashboard/_components/app-sidebar';
import { SiteHeader } from '@/app/(dashboards)/dashboard/_components/site-header';
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
import { useRouter, useSearchParams } from 'next/navigation';
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
import { useDatasets } from '@/hooks/use-datasets';

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
  slug: string; // ⭐ NEW: URL-friendly identifier
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
  const router = useRouter();
  const searchParams = useSearchParams();

  // Fetch datasets from API using SWR
  const {
    datasets: DATASETS,
    isLoading: isDatasetsLoading,
    isError: isDatasetsError,
  } = useDatasets();

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
  const [validDateRange, setValidDateRange] = useState({
    start: '1950-01-01',
    end: '2023-12-31',
  });
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<'line' | 'bar' | 'area'>('line');
  const [normalize, setNormalize] = useState(false);
  const [analysisModel, setAnalysisModel] = useState('raw');
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize state from URL parameters on component mount
  useEffect(() => {
    if (!DATASETS.length || isInitialized) return;

    const datasetSlugs =
      searchParams.get('datasets')?.split(',').filter(Boolean) || [];
    const startDate = searchParams.get('start') || '1950-01-01';
    const endDate = searchParams.get('end') || '2023-12-31';
    const chartTypeParam =
      (searchParams.get('chart') as 'line' | 'bar' | 'area') || 'line';
    const normalizeParam = searchParams.get('normalize') === 'true';
    const modelParam = searchParams.get('model') || 'raw';
    const categoryParam = searchParams.get('category') || 'All';
    const searchParam = searchParams.get('search') || '';

    // Restore selected datasets from URL using slugs
    if (datasetSlugs.length > 0) {
      const datasetsToSelect = DATASETS.filter((d) =>
        datasetSlugs.includes(d.slug)
      );
      if (datasetsToSelect.length > 0) {
        setSelectedDatasets(datasetsToSelect);
        setVisibleDatasets(new Set(datasetsToSelect.map((d) => d.id)));
      }
    }

    // Restore other filters
    setDateRange({ start: startDate, end: endDate });
    setChartType(chartTypeParam);
    setNormalize(normalizeParam);
    setAnalysisModel(modelParam);
    setSelectedCategory(categoryParam);
    setSearchTerm(searchParam);

    setIsInitialized(true);
  }, [DATASETS, searchParams, isInitialized]);

  // Update URL when state changes (using slugs instead of IDs)
  useEffect(() => {
    if (!isInitialized) return;

    const params = new URLSearchParams();

    // Add selected datasets using slugs
    if (selectedDatasets.length > 0) {
      params.set('datasets', selectedDatasets.map((d) => d.slug).join(','));
    }

    // Add date range (use shorter param names)
    if (dateRange.start !== '1950-01-01') {
      params.set('start', dateRange.start);
    }
    if (dateRange.end !== '2023-12-31') {
      params.set('end', dateRange.end);
    }

    // Add chart type (use shorter param name)
    if (chartType !== 'line') {
      params.set('chart', chartType);
    }

    // Add normalize
    if (normalize) {
      params.set('normalize', 'true');
    }

    // Add analysis model
    if (analysisModel !== 'raw') {
      params.set('model', analysisModel);
    }

    // Add category filter
    if (selectedCategory !== 'All') {
      params.set('category', selectedCategory);
    }

    // Add search term
    if (searchTerm) {
      params.set('search', searchTerm);
    }

    // Update URL without reloading the page
    const newUrl = params.toString()
      ? `?${params.toString()}`
      : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  }, [
    selectedDatasets,
    dateRange,
    chartType,
    normalize,
    analysisModel,
    selectedCategory,
    searchTerm,
    isInitialized,
    router,
  ]);

  // Update valid date range when selected datasets change
  useEffect(() => {
    if (selectedDatasets.length === 0) {
      setValidDateRange({
        start: '1950-01-01',
        end: new Date().toISOString().split('T')[0],
      });
      setDateRangeError(null);
      return;
    }

    // Calculate overlapping date range
    let overallStart = new Date(selectedDatasets[0].startDate);
    let overallEnd = new Date(selectedDatasets[0].endDate);

    for (let i = 1; i < selectedDatasets.length; i++) {
      const dsStart = new Date(selectedDatasets[i].startDate);
      const dsEnd = new Date(selectedDatasets[i].endDate);

      if (dsStart > overallStart) {
        overallStart = dsStart;
      }
      if (dsEnd < overallEnd) {
        overallEnd = dsEnd;
      }
    }

    // Check if there's overlap
    if (overallStart > overallEnd) {
      setDateRangeError('Selected datasets have no overlapping time period');
      return;
    }

    const newValidRange = {
      start: overallStart.toISOString().split('T')[0],
      end: overallEnd.toISOString().split('T')[0],
    };

    setValidDateRange(newValidRange);
    setDateRangeError(null);

    // Update current date range to fit within valid range
    setDateRange((prev) => ({
      start:
        prev.start < newValidRange.start ? newValidRange.start : prev.start,
      end: prev.end > newValidRange.end ? newValidRange.end : prev.end,
    }));
  }, [selectedDatasets]);

  const categories = useMemo(
    () => ['All', ...new Set(DATASETS.map((d) => d.category))],
    [DATASETS]
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
  }, [DATASETS, searchTerm, selectedCategory]);

  const toggleDatasetSelection = (dataset: Dataset) => {
    // Check if dataset is already selected
    const isSelected = selectedDatasets.find((d) => d.id === dataset.id);

    if (isSelected) {
      // Remove dataset
      setSelectedDatasets((prev) => prev.filter((d) => d.id !== dataset.id));
      setVisibleDatasets((prev) => {
        const newSet = new Set(prev);
        newSet.delete(dataset.id);
        return newSet;
      });
    } else {
      // Add dataset
      setSelectedDatasets((prev) => [...prev, dataset]);
      setVisibleDatasets((prev) => new Set([...prev, dataset.id]));
    }
  };

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

  const generateTimeSeriesData = async () => {
    if (dateRangeError) {
      console.error('Cannot load data: ' + dateRangeError);
      return;
    }

    setIsLoading(true);

    try {
      // Call FastAPI backend to get real time series data
      const response = await fetch('/api/timeseries/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          datasetIds: selectedDatasets.map((d) => d.id),
          startDate: dateRange.start,
          endDate: dateRange.end,
          analysisModel: analysisModel,
          normalize: normalize,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to load data');
      }

      const result = await response.json();

      // Transform API response to match component's data structure
      setTimeSeriesData(result.data);

      setIsLoading(false);
    } catch (error) {
      console.error('Error loading time series data:', error);
      setIsLoading(false);

      // Fallback to mock data for development
      console.warn('Using mock data as fallback');
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
          // Generate mock data based on dataset ID
          const value =
            50 +
            timeFactor * 30 +
            Math.sin(timeFactor * Math.PI * 4) * 10 +
            Math.random() * 5;
          point.values[dataset.id] = Number(value.toFixed(2));
        });

        data.push(point);
        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      setTimeSeriesData(data);
    }
  };

  // Removed auto-loading useEffect - user must click "Load Data" button

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
          {payload.map((entry: any, index: number) => {
            // Find the dataset by ID to get its name
            const dataset = selectedDatasets.find((d) => d.id === entry.name);
            const displayName = dataset ? dataset.name : entry.name;

            return (
              <p key={index} className="text-sm" style={{ color: entry.color }}>
                {displayName}: {normalize ? `${entry.value}%` : entry.value}
              </p>
            );
          })}
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
              {/* Loading State */}
              {isDatasetsLoading && (
                <div className="flex h-96 items-center justify-center">
                  <div className="space-y-4 text-center">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
                    <p className="text-muted-foreground">Loading datasets...</p>
                  </div>
                </div>
              )}

              {/* Error State */}
              {isDatasetsError && (
                <div className="flex h-96 items-center justify-center">
                  <div className="space-y-4 text-center">
                    <div className="text-destructive mx-auto h-12 w-12">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                        />
                      </svg>
                    </div>
                    <p className="text-destructive font-medium">
                      Failed to load datasets
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Please try refreshing the page
                    </p>
                  </div>
                </div>
              )}

              {/* Main Content - Only show when datasets are loaded */}
              {!isDatasetsLoading && !isDatasetsError && (
                <ResizablePanelGroup direction="horizontal">
                  {/* Left Panel - Dataset Selection */}
                  <ResizablePanel defaultSize={30} minSize={20} maxSize={40}>
                    <div className="h-full space-y-4 overflow-auto p-4">
                      {/* Dataset Browser */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">
                            Add Datasets
                          </CardTitle>
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
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-muted-foreground text-sm">
                              {filteredDatasets.length} dataset(s) available
                            </p>
                          </div>
                          <ScrollArea className="h-96">
                            <div className="space-y-2">
                              {filteredDatasets.length === 0 ? (
                                <div className="text-muted-foreground flex h-32 items-center justify-center text-center text-sm">
                                  <p>
                                    No datasets found.
                                    {searchTerm && (
                                      <span className="mt-1 block">
                                        Try a different search term.
                                      </span>
                                    )}
                                  </p>
                                </div>
                              ) : (
                                filteredDatasets.map((dataset) => (
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
                                        toggleDatasetSelection(dataset)
                                      }
                                    >
                                      <CardContent className="p-3">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex-1 space-y-1">
                                            <div className="flex items-center gap-2">
                                              <div
                                                className="h-3 w-3 rounded-full"
                                                style={{
                                                  backgroundColor:
                                                    dataset.color,
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
                                ))
                              )}
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
                                              toggleDatasetVisibility(
                                                dataset.id
                                              )
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
                                min={validDateRange.start}
                                max={validDateRange.end}
                                onChange={(e) =>
                                  setDateRange((prev) => ({
                                    ...prev,
                                    start: e.target.value,
                                  }))
                                }
                                disabled={selectedDatasets.length === 0}
                              />
                              {selectedDatasets.length > 0 && (
                                <p className="text-muted-foreground text-xs">
                                  Min: {validDateRange.start}
                                </p>
                              )}
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">
                                End Date
                              </label>
                              <Input
                                type="date"
                                value={dateRange.end}
                                min={validDateRange.start}
                                max={validDateRange.end}
                                onChange={(e) =>
                                  setDateRange((prev) => ({
                                    ...prev,
                                    end: e.target.value,
                                  }))
                                }
                                disabled={selectedDatasets.length === 0}
                              />
                              {selectedDatasets.length > 0 && (
                                <p className="text-muted-foreground text-xs">
                                  Max: {validDateRange.end}
                                </p>
                              )}
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
                                  <SelectItem value="line">
                                    Line Chart
                                  </SelectItem>
                                  <SelectItem value="bar">Bar Chart</SelectItem>
                                  <SelectItem value="area">
                                    Area Chart
                                  </SelectItem>
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
                          <div className="mt-4 flex items-center justify-between gap-4">
                            <div className="flex items-center space-x-2">
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

                            {/* Load Data Button */}
                            <Button
                              onClick={() => generateTimeSeriesData()}
                              disabled={
                                selectedDatasets.length === 0 ||
                                !!dateRangeError ||
                                isLoading
                              }
                              className="min-w-[120px]"
                            >
                              {isLoading ? (
                                <>
                                  <svg
                                    className="mr-2 h-4 w-4 animate-spin"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                    />
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                  </svg>
                                  Loading...
                                </>
                              ) : (
                                <>
                                  <BarChart3 className="mr-2 h-4 w-4" />
                                  Load Data
                                </>
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Date Range Error Alert */}
                      {dateRangeError && (
                        <Card className="border-destructive bg-destructive/10">
                          <CardContent className="pt-6">
                            <div className="flex items-start gap-3">
                              <div className="bg-destructive/20 mt-0.5 rounded-full p-2">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  strokeWidth={2}
                                  stroke="currentColor"
                                  className="text-destructive h-4 w-4"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                                  />
                                </svg>
                              </div>
                              <div className="flex-1">
                                <h4 className="text-destructive text-sm font-semibold">
                                  Date Range Issue
                                </h4>
                                <p className="text-muted-foreground mt-1 text-sm">
                                  {dateRangeError}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

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
                                  Click datasets from the sidebar to select them
                                </p>
                              </motion.div>
                            ) : timeSeriesData.length === 0 && !isLoading ? (
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
                                  Ready to visualize
                                </p>
                                <p className="text-sm">
                                  {selectedDatasets.length} dataset
                                  {selectedDatasets.length > 1 ? 's' : ''}{' '}
                                  selected
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
                                  <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                  >
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
                                      <TableHead className="w-32">
                                        Date
                                      </TableHead>
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
                                        style={{
                                          backgroundColor: dataset.color,
                                        }}
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
              )}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
