"use client";
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Filter,
  Database,
  Cloud,
  Globe,
  Download,
  Activity,
  Loader2,
  RotateCcw,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  type DatasetInfo,
  type ProcessingInfo,
  ChartType,
  AnalysisModel,
  AggregationMethod,
} from "@/hooks/use-timeseries";

interface DatasetFilterProps {
  selectedDatasets: DatasetInfo[];
  setSelectedDatasets: React.Dispatch<React.SetStateAction<DatasetInfo[]>>;
  availableDatasets: DatasetInfo[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  visibleDatasets: Set<string>;
  setVisibleDatasets: React.Dispatch<React.SetStateAction<Set<string>>>;
  dataSourceFilter: "all" | "local" | "cloud";
  setDataSourceFilter: (filter: "all" | "local" | "cloud") => void;
  // Visualization controls
  chartType: ChartType;
  setChartType: (type: ChartType) => void;
  dateRange: { start: string; end: string };
  setDateRange: React.Dispatch<
    React.SetStateAction<{ start: string; end: string }>
  >;
  analysisModel: AnalysisModel;
  setAnalysisModel: (model: AnalysisModel) => void;
  aggregation: AggregationMethod;
  setAggregation: (method: AggregationMethod) => void;
  normalize: boolean;
  setNormalize: (normalize: boolean) => void;
  smoothingWindow: number;
  setSmoothingWindow: (window: number) => void;
  resampleFreq: string | undefined;
  setResampleFreq: (freq: string | undefined) => void;
  focusCoordinates: string;
  setFocusCoordinates: (coords: string) => void;
  showHistogram: boolean;
  setShowHistogram: (show: boolean) => void;
  showLinearTrend: boolean;
  setShowLinearTrend: (show: boolean) => void;
  // Action handlers
  onExtract: () => void;
  onExport: (format: "csv" | "json" | "png") => void;
  onReset: () => void;
  isLoading: boolean;
  hasData: boolean;
  // Processing state
  progress: number;
  processingInfo: ProcessingInfo | null;
  coordinateValidation: {
    isValid: boolean;
    errors: string[];
  };
}

export function DatasetFilter({
  selectedDatasets,
  setSelectedDatasets,
  availableDatasets,
  searchTerm,
  setSearchTerm,
  selectedCategory,
  setSelectedCategory,
  visibleDatasets,
  setVisibleDatasets,
  dataSourceFilter,
  setDataSourceFilter,
  chartType,
  setChartType,
  dateRange,
  setDateRange,
  analysisModel,
  setAnalysisModel,
  aggregation,
  setAggregation,
  normalize,
  setNormalize,
  smoothingWindow,
  setSmoothingWindow,
  resampleFreq,
  setResampleFreq,
  focusCoordinates,
  setFocusCoordinates,
  showHistogram,
  setShowHistogram,
  showLinearTrend,
  setShowLinearTrend,
  onExtract,
  onExport,
  onReset,
  isLoading,
  hasData,
  progress,
  processingInfo,
  coordinateValidation,
}: DatasetFilterProps) {
  // Get unique categories (sources)
  const categories = React.useMemo(() => {
    const sources = new Set(
      availableDatasets
        .map((d) => (d as any).sourceName || (d as any).source)
        .filter(Boolean),
    );
    return ["All", ...Array.from(sources)];
  }, [availableDatasets]);

  // Filter datasets
  const filteredDatasets = React.useMemo(() => {
    return availableDatasets.filter((dataset) => {
      const datasetName = (dataset as any).datasetName || dataset.name || "";
      const matchesSearch =
        datasetName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dataset.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ((dataset as any).slug || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase());
      const matchesCategory =
        selectedCategory === "All" ||
        (dataset as any).sourceName === selectedCategory ||
        (dataset as any).source === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [availableDatasets, searchTerm, selectedCategory]);

  const toggleDataset = (dataset: DatasetInfo) => {
    setSelectedDatasets((prev) => {
      const isSelected = prev.some((d) => d.id === dataset.id);
      if (isSelected) {
        return prev.filter((d) => d.id !== dataset.id);
      } else {
        return [...prev, dataset];
      }
    });

    setVisibleDatasets((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(dataset.id)) {
        newSet.delete(dataset.id);
      } else {
        newSet.add(dataset.id);
      }
      return newSet;
    });
  };

  const toggleVisibility = (datasetId: string) => {
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

  const removeDataset = (datasetId: string) => {
    setSelectedDatasets((prev) => prev.filter((d) => d.id !== datasetId));
    setVisibleDatasets((prev) => {
      const newSet = new Set(prev);
      newSet.delete(datasetId);
      return newSet;
    });
  };

  const selectAllDatasets = () => {
    setSelectedDatasets(filteredDatasets);
    setVisibleDatasets(new Set(filteredDatasets.map((d) => d.id)));
  };

  const unselectAllDatasets = () => {
    setSelectedDatasets([]);
    setVisibleDatasets(new Set());
  };

  return (
    <div className="space-y-4">
      {/* Dataset Filters */}
      <Card>
        <CardHeader className="">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="">
          {/* Date Range - Horizontal */}
          <div className="flex flex-row gap-6">
            <div className="">
              <label className="text-sm font-medium">Start Date</label>
              <Input
                type="date"
                className="w-[200px]"
                value={dateRange?.start || ""}
                onChange={(e) =>
                  setDateRange((prev) => ({
                    ...prev,
                    start: e.target.value,
                  }))
                }
              />
              <label className="text-sm font-medium">End Date</label>
              <Input
                type="date"
                className="w-[200px]"
                value={dateRange?.end || ""}
                onChange={(e) =>
                  setDateRange((prev) => ({
                    ...prev,
                    end: e.target.value,
                  }))
                }
              />
            </div>
            {/* Focus Coordinates */}
            <div className="items-center">
              <label className="text-sm font-medium">
                Focus Coordinates (Optional)
              </label>
              <Input
                type="text"
                placeholder="e.g., 40.7128,-74.0060"
                value={focusCoordinates}
                onChange={(e) => setFocusCoordinates(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Enter coordinates as latitude,longitude pairs. Separate multiple
                coordinates with semicolons (;)
              </p>
            </div>
          </div>

          {/* Data Source Filter */}
          <div className="flex gap-2">
            <Button
              variant={dataSourceFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setDataSourceFilter("all")}
              className="flex"
            >
              <Globe className="mr-2 h-4 w-4" />
              All
            </Button>
            <Button
              variant={dataSourceFilter === "local" ? "default" : "outline"}
              size="sm"
              onClick={() => setDataSourceFilter("local")}
              className="flex"
            >
              <Database className="mr-2 h-4 w-4" />
              Local
            </Button>
            <Button
              variant={dataSourceFilter === "cloud" ? "default" : "outline"}
              size="sm"
              onClick={() => setDataSourceFilter("cloud")}
              className="flex"
            >
              <Cloud className="mr-2 h-4 w-4" />
              Cloud
            </Button>
            {/* Category Filter */}
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Search */}
            <div className="relative w-full">
              <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
              <Input
                placeholder="Search datasets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex pl-8"
              />
            </div>
          </div>

          {/* Side-by-side: Available and Selected Datasets */}
          <div className="grid grid-cols-2 gap-4">
            {/* Available Datasets - Left */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Available Datasets
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAllDatasets}
                  disabled={filteredDatasets.length === 0}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  All
                </Button>
              </div>

              <ScrollArea className="h-[200px] rounded-md border">
                <div className="space-y-2 p-4">
                  {filteredDatasets.length === 0 ? (
                    <div className="text-muted-foreground text-center text-sm">
                      No datasets found
                    </div>
                  ) : (
                    filteredDatasets.map((dataset) => {
                      const isSelected = selectedDatasets.some(
                        (d) => d.id === dataset.id,
                      );
                      const isCloud =
                        (dataset as any).stored === "cloud" ||
                        (dataset as any).Stored === "cloud";
                      return (
                        <motion.div
                          key={dataset.id}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => toggleDataset(dataset)}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleDataset(dataset)}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-1"
                            />
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <h4 className="text-sm font-medium">
                                  {(dataset as any).datasetName || dataset.name}
                                </h4>
                                {isCloud ? (
                                  <Cloud className="h-3 w-3 shrink-0 text-blue-500" />
                                ) : (
                                  <Database className="h-3 w-3 shrink-0 text-green-500" />
                                )}
                              </div>
                              <p className="text-muted-foreground text-xs">
                                {(dataset as any).sourceName ||
                                  (dataset as any).source ||
                                  "Unknown source"}{" "}
                                • {dataset.name} •{" "}
                                {(dataset as any).units || "N/A"}
                              </p>
                              {(dataset as any).startDate &&
                                (dataset as any).endDate && (
                                  <p className="text-muted-foreground text-xs">
                                    {(dataset as any).startDate} to{" "}
                                    {(dataset as any).endDate}
                                  </p>
                                )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Selected Datasets - Right */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Selected ({selectedDatasets.length})
                </label>
                {selectedDatasets.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={unselectAllDatasets}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Clear
                  </Button>
                )}
              </div>

              <ScrollArea className="h-[200px] rounded-md border">
                <div className="space-y-2 p-4">
                  <AnimatePresence>
                    {selectedDatasets.length === 0 ? (
                      <div className="text-muted-foreground text-center text-sm">
                        No datasets selected
                      </div>
                    ) : (
                      selectedDatasets.map((dataset) => {
                        const isCloud =
                          (dataset as any).stored === "cloud" ||
                          (dataset as any).Stored === "cloud";
                        const displayName =
                          (dataset as any).datasetName || dataset.name;
                        return (
                          <motion.div
                            key={dataset.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="flex items-center justify-between rounded-md border p-2"
                          >
                            <div className="flex items-center gap-2">
                              {isCloud ? (
                                <Cloud className="h-3 w-3 shrink-0 text-blue-500" />
                              ) : (
                                <Database className="h-3 w-3 shrink-0 text-green-500" />
                              )}
                              <span className="text-sm">{displayName}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        toggleVisibility(dataset.id)
                                      }
                                    >
                                      {visibleDatasets.has(dataset.id) ? (
                                        <Eye className="h-4 w-4" />
                                      ) : (
                                        <EyeOff className="text-muted-foreground h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {visibleDatasets.has(dataset.id)
                                      ? "Hide"
                                      : "Show"}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeDataset(dataset.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </AnimatePresence>
                </div>
              </ScrollArea>
            </div>
          </div>
        </CardContent>

        <CardHeader className="">
          <CardTitle className="text-sm">Chart Options</CardTitle>
        </CardHeader>
        <CardContent className="">
          {/* Chart Type, Analysis Model, Aggregation - Horizontal */}
          <div className="flex flex-row gap-4">
            <label className="text-sm font-medium">Chart Type</label>
            <Select
              value={chartType}
              onValueChange={(v) => setChartType(v as ChartType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(ChartType).map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="text-sm font-medium">Analysis Model</label>
            <Select
              value={analysisModel}
              onValueChange={(v) => setAnalysisModel(v as AnalysisModel)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(AnalysisModel).map(([key, value]) => (
                  <SelectItem key={value} value={value}>
                    {key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="text-sm font-medium">Aggregation</label>
            <Select
              value={aggregation}
              onValueChange={(v) => setAggregation(v as AggregationMethod)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(AggregationMethod).map(([key, value]) => (
                  <SelectItem key={value} value={value}>
                    {key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Resample Frequency and Normalization - Horizontal */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Resample Frequency
                </label>
                <Select
                  value={resampleFreq || "none"}
                  onValueChange={(v) =>
                    setResampleFreq(v === "none" ? undefined : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No resampling" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No resampling</SelectItem>
                    <SelectItem value="D">Daily</SelectItem>
                    <SelectItem value="W">Weekly</SelectItem>
                    <SelectItem value="M">Monthly</SelectItem>
                    <SelectItem value="Q">Quarterly</SelectItem>
                    <SelectItem value="Y">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="">
                <label className="text-sm font-medium">Options</label>
                <div className="flex flex-row">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="normalize"
                      checked={normalize}
                      onCheckedChange={(checked) =>
                        setNormalize(checked as boolean)
                      }
                    />
                    <label htmlFor="normalize" className="text-sm">
                      Normalize
                    </label>
                  </div>
                  <Checkbox
                    id="show-histogram"
                    checked={showHistogram}
                    onCheckedChange={(checked) =>
                      setShowHistogram(checked as boolean)
                    }
                  />
                  <label htmlFor="show-histogram" className="text-sm">
                    Show Histogram
                  </label>
                  <Checkbox
                    id="show-trend"
                    checked={showLinearTrend}
                    onCheckedChange={(checked) =>
                      setShowLinearTrend(checked as boolean)
                    }
                  />
                  <label htmlFor="show-trend" className="text-sm">
                    Show Linear Trend
                  </label>
                </div>
              </div>
            </div>

            {/* Smoothing Window */}
            {analysisModel === AnalysisModel.MOVING_AVG && (
              <div className="space-y-2 border-t pt-4">
                <label className="text-sm font-medium">
                  Smoothing Window: {smoothingWindow} months
                </label>
                <Slider
                  value={[smoothingWindow]}
                  onValueChange={(value) => setSmoothingWindow(value[0])}
                  min={1}
                  max={24}
                  step={1}
                  className="w-full"
                />
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <div className="flex flex-row gap-2">
            <Button
              onClick={onExtract}
              disabled={selectedDatasets.length === 0 || isLoading}
              size="lg"
              className=""
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Activity className="mr-2 h-4 w-4" />
                  Extract Data
                </>
              )}
            </Button>

            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={!hasData}
                  size="lg"
                  className="ll"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Export Data</DialogTitle>
                  <DialogDescription>
                    Choose a format to download your time series data
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <Button
                    onClick={() => onExport("csv")}
                    className="w-full justify-start"
                    variant="outline"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export as CSV (Spreadsheet)
                  </Button>
                  <Button
                    onClick={() => onExport("json")}
                    className="w-full justify-start"
                    variant="outline"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export as JSON (Raw Data)
                  </Button>
                  <Button
                    onClick={() => onExport("png")}
                    className="w-full justify-start"
                    variant="outline"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export Chart as PNG (Image)
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Button variant="ghost" onClick={onReset} size="lg" className="">
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
          </div>
        </CardFooter>
      </Card>
      {/* Progress Bar */}
      {isLoading && progress > 0 && (
        <Card>
          <CardContent className="pt-6">
            <Progress value={progress} className="h-2" />
            <p className="text-muted-foreground mt-2 text-xs">
              Processing: {progress.toFixed(0)}%
            </p>
          </CardContent>
        </Card>
      )}

      {/* Processing Info Display */}
      {processingInfo && !isLoading && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-muted-foreground">
                  {processingInfo.datasetsProcessed} dataset(s) •{" "}
                  {processingInfo.totalPoints} points •{" "}
                  {processingInfo.processingTime}
                </span>
              </div>
              {processingInfo.extractionMode && (
                <div className="flex items-center gap-2">
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    {processingInfo.extractionMode === "point-based"
                      ? `Point-based (${processingInfo.focusCoordinates} coord${processingInfo.focusCoordinates !== 1 ? "s" : ""})`
                      : "Spatial aggregation"}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coordinate Validation Warning */}
      {focusCoordinates.trim() && !coordinateValidation.isValid && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Invalid Coordinates</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {coordinateValidation.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
