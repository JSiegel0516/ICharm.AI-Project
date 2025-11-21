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
import {
  type DatasetInfo,
  type ProcessingInfo,
  AnalysisModel,
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
  // Kept in this panel - server-side only
  dateRange: { start: string; end: string };
  setDateRange: React.Dispatch<
    React.SetStateAction<{ start: string; end: string }>
  >;
  analysisModel: AnalysisModel;
  setAnalysisModel: (model: AnalysisModel) => void;
  focusCoordinates: string;
  setFocusCoordinates: (coords: string) => void;
  // NOTE: chartType, normalize, smoothing, resample, aggregation, histogram, trend
  // have been moved to ChartOptionsPanel in VisualizationPanel

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
  dateRange,
  setDateRange,
  analysisModel,
  setAnalysisModel,
  focusCoordinates,
  setFocusCoordinates,
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
    <div className="">
      {/* Dataset Filters */}
      <Card>
        <CardContent className="space-y-2">
          {/* Dataset Selection & Search - Horizontal */}
          <div className="flex flex-row items-center gap-3">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="Search datasets..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={dataSourceFilter}
              onValueChange={(v: "all" | "local" | "cloud") =>
                setDataSourceFilter(v)
              }
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    <Globe className="h-3 w-3" />
                    All Sources
                  </div>
                </SelectItem>
                <SelectItem value="local">
                  <div className="flex items-center gap-2">
                    <Database className="h-3 w-3" />
                    Local
                  </div>
                </SelectItem>
                <SelectItem value="cloud">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-3 w-3" />
                    Cloud
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Available Datasets */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Available Datasets</h4>
            <ScrollArea className="h-[200px] rounded-md border">
              <div className="space-y-2 p-4">
                <AnimatePresence mode="popLayout">
                  {filteredDatasets.map((dataset) => {
                    const isSelected = selectedDatasets.some(
                      (d) => d.id === dataset.id,
                    );
                    return (
                      <motion.div
                        key={dataset.id}
                        layout
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div
                          className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => toggleDataset(dataset)}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleDataset(dataset)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium">
                                  {(dataset as any).datasetName ||
                                    dataset.name}{" "}
                                </p>
                                <p className="text-muted-foreground truncate text-xs">
                                  • {dataset.name} •{(dataset as any).startDate}{" "}
                                  to {(dataset as any).endDate} •{" "}
                                  {(dataset as any).units || "N/A"}
                                </p>
                                <Badge variant="outline" className="text-xs">
                                  {(dataset as any).sourceName ||
                                    (dataset as any).source ||
                                    "Unknown source"}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {dataset.stored === "local" ? (
                                    <Database className="text-chart-2 mr-1 h-3 w-3" />
                                  ) : (
                                    <Cloud className="text-chart-1 mr-1 h-3 w-3" />
                                  )}
                                  {dataset.stored}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {filteredDatasets.length === 0 && (
                  <div className="text-muted-foreground py-8 text-center text-sm">
                    No datasets found matching your criteria
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Selected Datasets Display */}
          {selectedDatasets.length > 0 && (
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-medium">
                  Selected Datasets ({selectedDatasets.length})
                </h4>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectAllDatasets}
                    disabled={filteredDatasets.length === 0}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={unselectAllDatasets}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedDatasets.map((dataset) => (
                  <Badge
                    key={dataset.id}
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    <button
                      onClick={() => toggleVisibility(dataset.id)}
                      className="mr-1"
                    >
                      {visibleDatasets.has(dataset.id) ? (
                        <Eye className="h-3 w-3" />
                      ) : (
                        <EyeOff className="h-3 w-3 opacity-50" />
                      )}
                    </button>
                    {(dataset as any).datasetName || dataset.name}
                    <button
                      onClick={() => removeDataset(dataset.id)}
                      className="hover:text-destructive ml-1"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Server-side Analysis Options */}
          <div className="flex flex-row gap-6">
            <div className="space-y-2">
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
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date</label>
              <Input
                type="date"
                value={dateRange?.start || ""}
                onChange={(e) =>
                  setDateRange((prev) => ({
                    ...prev,
                    start: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">End Date</label>
              <Input
                type="date"
                value={dateRange?.end || ""}
                onChange={(e) =>
                  setDateRange((prev) => ({ ...prev, end: e.target.value }))
                }
              />
            </div>

            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">
                Focus Coordinates (Optional)
              </label>
              <Input
                className="w-full"
                placeholder="Extract data for specific lat,lon points. Leave empty for spatial aggregation. e.g., 40.7128,-74.0060;51.5074,-0.1278"
                value={focusCoordinates}
                onChange={(e) => setFocusCoordinates(e.target.value)}
              />
              <p className="text-muted-foreground text-xs"></p>
            </div>
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
