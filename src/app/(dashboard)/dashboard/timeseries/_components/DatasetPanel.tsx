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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type DatasetInfo } from "@/hooks/use-timeseries";

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
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Dataset Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
            <Input
              placeholder="Search datasets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Category Filter */}
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
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

          {/* Data Source Filter - All/Local/Cloud buttons */}
          <div className="flex gap-2">
            <Button
              variant={dataSourceFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setDataSourceFilter("all")}
              className="flex-1"
            >
              <Globe className="mr-2 h-4 w-4" />
              All
            </Button>
            <Button
              variant={dataSourceFilter === "local" ? "default" : "outline"}
              size="sm"
              onClick={() => setDataSourceFilter("local")}
              className="flex-1"
            >
              <Database className="mr-2 h-4 w-4" />
              Local
            </Button>
            <Button
              variant={dataSourceFilter === "cloud" ? "default" : "outline"}
              size="sm"
              onClick={() => setDataSourceFilter("cloud")}
              className="flex-1"
            >
              <Cloud className="mr-2 h-4 w-4" />
              Cloud
            </Button>
          </div>

          {/* Available Datasets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Available Datasets</label>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAllDatasets}
                  disabled={filteredDatasets.length === 0}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Select All
                </Button>
                {selectedDatasets.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={unselectAllDatasets}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Unselect All
                  </Button>
                )}
              </div>
            </div>

            <ScrollArea className="h-[300px] rounded-md border">
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
                                <Cloud className="h-3 w-3 flex-shrink-0 text-blue-500" />
                              ) : (
                                <Database className="h-3 w-3 flex-shrink-0 text-green-500" />
                              )}
                            </div>
                            <p className="text-muted-foreground text-xs">
                              {(dataset as any).sourceName ||
                                (dataset as any).source ||
                                "Unknown source"}{" "}
                              • {dataset.name}
                            </p>
                            <p className="text-muted-foreground text-xs">
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
        </CardContent>
      </Card>

      {/* Selected Datasets */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            Selected Datasets ({selectedDatasets.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
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
                            <Cloud className="h-3 w-3 flex-shrink-0 text-blue-500" />
                          ) : (
                            <Database className="h-3 w-3 flex-shrink-0 text-green-500" />
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
                                  onClick={() => toggleVisibility(dataset.id)}
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
        </CardContent>
      </Card>
    </div>
  );
}
