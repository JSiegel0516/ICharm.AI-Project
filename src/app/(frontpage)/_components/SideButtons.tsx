"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { SettingsIcon } from "@/components/ui/settings";
import { FileTextIcon } from "@/components/ui/file-text";
import { DownloadIcon } from "@/components/ui/download";
import { EarthIcon } from "@/components/ui/earth";
import { CalendarDaysIcon } from "@/components/ui/calendar-days";
import { Maximize2Icon } from "@/components/ui/maximize-2";
import { CircleHelpIcon } from "@/components/ui/circle-help";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { GlobeSettingsPanel } from "@/app/(frontpage)/_components/GlobeSettingsPanel";
import { useAppState } from "@/context/dataset-context";
import type { Dataset, GlobeSettings } from "@/types";
import { Database, Cloud, Server, Globe, X } from "lucide-react";
import type { GlobeLineResolution } from "@/types";

interface SideButtonsProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onShowTutorial: () => void;
  onShowSidebarPanel: (panel: "datasets" | "history" | "about" | null) => void;
  globeSettings: GlobeSettings;
  onBaseMapModeChange: (mode: "satellite" | "street") => void;
  onSatelliteToggle: (visible: boolean) => void;
  onBoundaryToggle: (visible: boolean) => void;
  onGeographicLinesToggle: (visible: boolean) => void;
  onTimeZoneLinesToggle: (visible: boolean) => void;
  onPacificCenteredToggle: (enabled: boolean) => void;
  onCoastlineResolutionChange: (resolution: GlobeLineResolution) => void;
  onRiverResolutionChange: (resolution: GlobeLineResolution) => void;
  onLakeResolutionChange: (resolution: GlobeLineResolution) => void;
  onNaturalEarthGeographicLinesToggle: (visible: boolean) => void;
  onLabelsToggle: (visible: boolean) => void;
  onRasterOpacityChange: (opacity: number) => void;
  onHideZeroPrecipToggle: (enabled: boolean) => void;
  onRasterBlurToggle: (enabled: boolean) => void;
  onBumpMapModeChange: (mode: "none" | "land" | "landBathymetry") => void;
  onColorbarRangeChange: (payload: {
    min: number | null;
    max: number | null;
  }) => void;
  onColorbarRangeReset: () => void;
  viewMode?: GlobeSettings["viewMode"];
  onViewModeChange?: (mode: GlobeSettings["viewMode"]) => void;
  onShowVisualizationModal: () => void;
}

const formatDisplayDate = (value?: string | null | Date) => {
  if (!value) {
    return "Unknown";
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return String(value);
};

export function SideButtons({
  selectedDate,
  onDateChange,
  onShowTutorial,
  onShowSidebarPanel,
  globeSettings,
  onBaseMapModeChange,
  onSatelliteToggle,
  onBoundaryToggle,
  onGeographicLinesToggle,
  onTimeZoneLinesToggle,
  onPacificCenteredToggle,
  onCoastlineResolutionChange,
  onRiverResolutionChange,
  onLakeResolutionChange,
  onNaturalEarthGeographicLinesToggle,
  onLabelsToggle,
  onRasterOpacityChange,
  onHideZeroPrecipToggle,
  onRasterBlurToggle,
  onBumpMapModeChange,
  onColorbarRangeChange,
  onColorbarRangeReset,
  viewMode,
  onViewModeChange,
  onShowVisualizationModal,
}: SideButtonsProps) {
  const { datasets, currentDataset, setCurrentDataset, isLoading, error } =
    useAppState();

  const [isExpanded, setIsExpanded] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showDatasetCard, setShowDatasetCard] = useState(false);
  const [showGlobeSettings, setShowGlobeSettings] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedDatasets, setSelectedDatasets] = useState<Set<string>>(() =>
    currentDataset ? new Set([currentDataset.id]) : new Set(),
  );
  const [calendarMonth, setCalendarMonth] = useState(selectedDate);
  const [dataSourceFilter, setDataSourceFilter] = useState<
    "all" | "local" | "cloud" | "postgres"
  >("all");

  // Refs for click-outside detection
  const calendarRef = useRef<HTMLDivElement>(null);
  const datasetCardRef = useRef<HTMLDivElement>(null);

  // Filter datasets based on source
  const filteredDatasets = useMemo(() => {
    console.log("=== FILTER DEBUG ===");
    console.log("Filter selected:", dataSourceFilter);
    console.log("Total datasets:", datasets.length);

    // Check what stored values actually exist
    const storedValues = datasets.map((d) => ({
      name: d.name,
      stored: d.stored,
      backendExists: !!d,
    }));
    console.log("Dataset stored values:", storedValues);

    const filtered = datasets.filter((dataset) => {
      if (dataSourceFilter === "all") return true;

      const storedValue = dataset.stored?.toLowerCase();
      console.log(
        `Checking ${dataset.name}: stored="${storedValue}", filter="${dataSourceFilter}"`,
      );

      if (dataSourceFilter === "local") {
        return storedValue === "local" || storedValue === "postgres";
      }

      if (dataSourceFilter === "cloud") {
        return storedValue === "cloud";
      }

      return true;
    });

    console.log("Filtered count:", filtered.length);
    console.log("===================");

    return filtered;
  }, [datasets, dataSourceFilter]);

  // Get date range from current dataset
  const dateRange = useMemo(() => {
    if (!currentDataset) {
      return {
        minDate: new Date(1979, 0, 1),
        maxDate: new Date(),
      };
    }
    return {
      minDate: currentDataset.startDate,
      maxDate: currentDataset.endDate,
    };
  }, [currentDataset]);

  // Event Handlers
  const toggleMenu = useCallback(() => setIsExpanded((prev) => !prev), []);

  const handleFileTextClick = useCallback(() => {
    setShowDatasetCard(true);
    onShowSidebarPanel("datasets");
  }, [onShowSidebarPanel]);

  const handleDownloadClick = useCallback(() => {
    if (!currentDataset) {
      alert("Please select a dataset first");
      return;
    }

    const origLocation = currentDataset.origLocation;

    if (!origLocation) {
      alert("This dataset does not have a download location available.");
      return;
    }

    // Open the download link in a new tab
    window.open(origLocation, "_blank");
  }, [currentDataset]);

  const handlePreferencesClick = useCallback(() => {
    setShowGlobeSettings(true);
  }, []);

  const handleFullscreenClick = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  const handleCalendarClick = useCallback(() => {
    setShowCalendar(true);
    setCalendarMonth(selectedDate);
  }, [selectedDate]);

  const closeCalendar = useCallback(() => {
    setShowCalendar(false);
  }, []);

  const closeDatasetCard = useCallback(() => {
    setShowDatasetCard(false);
    onShowSidebarPanel(null);
  }, [onShowSidebarPanel]);

  const closeGlobeSettings = useCallback(() => {
    setShowGlobeSettings(false);
  }, []);

  const toggleDatasetSelection = useCallback(
    (datasetId: string) => {
      const dataset = datasets.find((item) => item.id === datasetId);
      if (!dataset) {
        console.error("Dataset not found:", datasetId);
        return;
      }

      // Update selected datasets (single selection only)
      setSelectedDatasets(new Set([datasetId]));

      // Only adjust date if it's outside the new dataset's valid range
      let newDate = selectedDate;
      let needsDateChange = false;

      if (selectedDate < dataset.startDate) {
        newDate = dataset.startDate;
        needsDateChange = true;
      } else if (selectedDate > dataset.endDate) {
        newDate = dataset.endDate;
        needsDateChange = true;
      }

      // Only update date if it actually needs to change
      if (needsDateChange) {
        onDateChange(newDate);
      }

      // Set the dataset in a microtask to ensure date state is updated first
      Promise.resolve().then(() => {
        setCurrentDataset(dataset);
      });
    },
    [datasets, setCurrentDataset, selectedDate, onDateChange],
  );

  const handleDateSelect = useCallback(
    (date: Date | undefined) => {
      if (date) {
        let clampedDate = date;
        if (date < dateRange.minDate) {
          clampedDate = dateRange.minDate;
        } else if (date > dateRange.maxDate) {
          clampedDate = dateRange.maxDate;
        }

        const newDate = new Date(
          clampedDate.getFullYear(),
          clampedDate.getMonth(),
          clampedDate.getDate(),
          selectedDate.getHours(),
          selectedDate.getMinutes(),
          selectedDate.getSeconds(),
        );
        onDateChange(newDate);
        closeCalendar();
      }
    },
    [selectedDate, onDateChange, closeCalendar, dateRange],
  );

  const handleMonthChange = useCallback((newMonth: Date) => {
    setCalendarMonth(newMonth);
  }, []);

  // Click-outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Check if we're clicking on specific safe zones
      const isCalendarClick = calendarRef.current?.contains(target);
      const isCalendarButton = target.closest("#calendar");
      const isDatasetCardClick = datasetCardRef.current?.contains(target);
      const isDatasetButton = target.closest("#dataset");
      const isSideButton = target.closest(".sidebtn"); // Any side button
      const isInsideModal = target.closest('[role="dialog"]'); // Any modal/dialog

      // If clicking on any of these safe zones, don't close anything
      if (
        isCalendarClick ||
        isCalendarButton ||
        isDatasetCardClick ||
        isDatasetButton ||
        isSideButton ||
        isInsideModal
      ) {
        return;
      }

      // Otherwise, close everything
      if (showCalendar) {
        closeCalendar();
      }
      if (showDatasetCard) {
        closeDatasetCard();
      }
    };

    // Use both mousedown and click events
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("click", handleClickOutside, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("click", handleClickOutside, true);
    };
  }, [showCalendar, showDatasetCard, closeCalendar, closeDatasetCard]);

  useEffect(() => {
    if (showCalendar) {
      setCalendarMonth(selectedDate);
    }
  }, [showCalendar, selectedDate]);

  useEffect(() => {
    if (!datasets.length) {
      setSelectedDatasets(new Set());
      return;
    }

    setSelectedDatasets((prev) => {
      const validIds = Array.from(prev).filter((id) =>
        datasets.some((dataset) => dataset.id === id),
      );

      if (currentDataset && !validIds.includes(currentDataset.id)) {
        validIds.unshift(currentDataset.id);
      }

      if (!validIds.length) {
        const fallback = currentDataset?.id ?? datasets[0].id;
        return new Set([fallback]);
      }

      if (
        validIds.length === prev.size &&
        validIds.every((id) => prev.has(id))
      ) {
        return prev;
      }

      return new Set(validIds);
    });
  }, [datasets, currentDataset]);

  const buttonConfigs = useMemo(
    () => [
      {
        id: "tutorial",
        icon: <CircleHelpIcon size={18} />,
        label: "Show Tutorial",
        onClick: onShowTutorial,
        delay: 0.15,
        disabled: false,
      },
      {
        id: "dataset",
        icon: <FileTextIcon size={18} />,
        label: "Select Datasets",
        onClick: handleFileTextClick,
        delay: 0,
        disabled: false,
      },
      {
        id: "calendar",
        icon: <CalendarDaysIcon size={18} />,
        label: "Set Date",
        onClick: handleCalendarClick,
        delay: 0.05,
        disabled: false,
      },
      {
        id: "download",
        icon: <DownloadIcon size={18} />,
        label: isDownloading ? "Downloading..." : "Download Dataset",
        onClick: handleDownloadClick,
        delay: 0.1,
        disabled: isDownloading || !currentDataset,
      },
      {
        id: "preferences",
        icon: <EarthIcon size={18} />,
        label: "Globe Settings",
        onClick: handlePreferencesClick,
        delay: 0.2,
        disabled: false,
      },
      {
        id: "fullscreen",
        icon: <Maximize2Icon size={18} />,
        label: "Fullscreen",
        onClick: handleFullscreenClick,
        delay: 0.25,
        disabled: false,
      },
    ],
    [
      onShowTutorial,
      handleFileTextClick,
      handleCalendarClick,
      handleDownloadClick,
      handlePreferencesClick,
      handleFullscreenClick,
      isDownloading,
      currentDataset,
    ],
  );

  return (
    <>
      {/* Side Menu */}
      <AnimatePresence>
        {!showCalendar && !showDatasetCard && !showGlobeSettings && (
          <motion.div
            initial={{ x: 0 }}
            exit={{ x: -100, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="pointer-events-auto fixed top-0 left-4 z-50 flex h-screen flex-col items-center justify-center gap-2"
          >
            {buttonConfigs.map(
              ({ id, icon, label, onClick, delay, disabled }) => (
                <motion.div
                  key={id}
                  id={id}
                  initial={false}
                  animate={{
                    opacity: isExpanded ? 1 : 0,
                    scale: isExpanded ? 1 : 0.8,
                    y: isExpanded ? 0 : 10,
                  }}
                  transition={{ duration: 0.2, delay }}
                >
                  <Button
                    size="icon"
                    className="sidebtn hover:sidebtn-hover group"
                    onClick={onClick}
                    disabled={disabled}
                  >
                    {icon}
                    <div className="btn-hover group-hover:opacity-100">
                      {label}
                    </div>
                  </Button>
                </motion.div>
              ),
            )}

            <motion.div
              initial={false}
              animate={{ opacity: isExpanded ? 1 : 0.8, scale: 1, y: 1 }}
              transition={{ duration: 0.2, delay: 0.25 }}
            >
              <Button
                size="icon"
                className="sidebtn hover:sidebtn-hover group"
                onClick={toggleMenu}
              >
                <SettingsIcon size={18} />
                <div className="btn-hover group-hover:opacity-100">
                  {isExpanded ? "Hide Settings" : "Show Settings"}
                </div>
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Calendar Window */}
      <AnimatePresence>
        {showCalendar && (
          <motion.div
            ref={calendarRef}
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -100, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="pointer-events-auto fixed top-1/2 left-4 z-50 w-80 -translate-y-1/2"
          >
            <Calendar
              mode="single"
              captionLayout="dropdown"
              selected={selectedDate}
              onSelect={handleDateSelect}
              month={calendarMonth}
              onMonthChange={handleMonthChange}
              disabled={(date) =>
                date < dateRange.minDate || date > dateRange.maxDate
              }
              className="bg-card rounded-md border shadow-sm select-none"
              autoFocus
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dataset Selection Card */}
      <AnimatePresence>
        {showDatasetCard && (
          <motion.div
            ref={datasetCardRef}
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -100, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="pointer-events-auto fixed top-1/2 left-2 z-50 w-[calc(100vw-1rem)] -translate-y-1/2 sm:left-4 sm:w-96"
          >
            <Card className="gap-3 py-3 lg:gap-4 lg:py-4">
              <CardHeader className="px-3 pb-3 lg:px-4">
                <CardTitle className="flex items-center justify-between text-base lg:text-lg">
                  <span>Select Dataset</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={closeDatasetCard}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </CardTitle>
                <CardDescription className="text-xs lg:text-sm">
                  Choose a dataset to visualize on the globe
                </CardDescription>

                {/* Source Filter Buttons */}
                <div className="flex gap-1.5 pt-2 sm:gap-2 sm:pt-3">
                  <Button
                    variant={dataSourceFilter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDataSourceFilter("all")}
                    className="flex-1 text-xs sm:text-sm"
                  >
                    <Globe className="mr-1 h-3 w-3 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
                    All
                  </Button>
                  <Button
                    variant={
                      dataSourceFilter === "local" ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => setDataSourceFilter("local")}
                    className="flex-1 text-xs sm:text-sm"
                  >
                    <Database className="mr-1 h-3 w-3 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
                    Local
                  </Button>
                  <Button
                    variant={
                      dataSourceFilter === "cloud" ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => setDataSourceFilter("cloud")}
                    className="flex-1 text-xs sm:text-sm"
                  >
                    <Cloud className="mr-1 h-3 w-3 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
                    Cloud
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="max-h-[40vh] space-y-2 overflow-y-auto px-3 sm:space-y-3 lg:max-h-96 lg:px-4">
                {isLoading && (
                  <div className="rounded border border-neutral-600 bg-neutral-800/50 p-2 text-xs text-slate-300 sm:p-3 sm:text-sm">
                    Loading datasets...
                  </div>
                )}

                {!isLoading && error && (
                  <div className="rounded border border-rose-500/40 bg-rose-900/20 p-2 text-xs text-rose-200 sm:p-3 sm:text-sm">
                    Failed to load datasets: {error}
                  </div>
                )}

                {!isLoading && !error && filteredDatasets.length === 0 && (
                  <div className="rounded border border-slate-600 bg-slate-800/50 p-2 text-xs text-slate-300 sm:p-3 sm:text-sm">
                    No datasets available. Please try again later.
                  </div>
                )}

                {filteredDatasets.map((dataset: Dataset) => {
                  const isSelected = selectedDatasets.has(dataset.id);
                  const category = dataset.dataType ?? dataset.dataType;
                  const resolution = dataset.spatialResolution ?? "";
                  const lastUpdated = formatDisplayDate(dataset.endDate);

                  return (
                    <div
                      key={dataset.id}
                      className={`cursor-pointer rounded-lg border p-2 transition-all sm:p-3 ${
                        isSelected
                          ? "border-neutral-300/50 bg-neutral-300/20"
                          : "border-neutral-600 bg-neutral-700/50 hover:bg-neutral-700/70"
                      }`}
                      onClick={() => toggleDatasetSelection(dataset.id)}
                    >
                      <div className="flex items-start justify-between gap-2 sm:gap-3">
                        <div className="min-w-0 flex-1 space-y-1.5 sm:space-y-2">
                          <h3 className="text-primary truncate text-xs font-medium sm:text-sm">
                            {dataset.name}
                          </h3>
                          <p className="truncate text-[10px] text-slate-400 sm:text-xs">
                            {dataset?.layerParameter} - {dataset?.statistic}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <Badge
                              variant="outline"
                              className="flex items-center gap-1 text-[10px] sm:text-xs"
                            >
                              {dataset.stored === "local" ? (
                                <Database className="text-chart-2 h-2.5 w-2.5 sm:h-3 sm:w-3" />
                              ) : dataset.stored === "cloud" ? (
                                <Cloud className="text-chart-1 h-2.5 w-2.5 sm:h-3 sm:w-3" />
                              ) : dataset.stored === "postgres" ? (
                                <Server className="text-chart-3 h-2.5 w-2.5 sm:h-3 sm:w-3" />
                              ) : (
                                <Globe className="text-chart-3 h-2.5 w-2.5 sm:h-3 sm:w-3" />
                              )}
                              {dataset.stored === "postgres"
                                ? "PostgreSQL"
                                : dataset.stored}
                            </Badge>
                            <span className="hidden text-xs text-slate-500 sm:inline">
                              {dataset.startDate && dataset.endDate
                                ? `${new Date(
                                    dataset.startDate,
                                  ).toLocaleDateString("en-US", {
                                    year: "numeric",
                                    month: "numeric",
                                    day: "numeric",
                                  })} to ${new Date(
                                    dataset.endDate,
                                  ).toLocaleDateString("en-US", {
                                    year: "numeric",
                                    month: "numeric",
                                    day: "numeric",
                                  })}`
                                : "Date information not available"}
                            </span>
                          </div>
                        </div>
                        <div
                          className={`ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border sm:ml-2 ${
                            isSelected
                              ? "border-rose-500 bg-rose-500"
                              : "border-slate-400"
                          }`}
                        >
                          {isSelected && (
                            <svg
                              className="h-3 w-3 text-white"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Globe Settings Panel */}
      <GlobeSettingsPanel
        isOpen={showGlobeSettings}
        onClose={closeGlobeSettings}
        baseMapMode={globeSettings.baseMapMode ?? "satellite"}
        onBaseMapModeChange={onBaseMapModeChange}
        satelliteLayerVisible={globeSettings.satelliteLayerVisible}
        onSatelliteLayerToggle={onSatelliteToggle}
        boundaryLinesVisible={globeSettings.boundaryLinesVisible}
        onBoundaryLinesToggle={onBoundaryToggle}
        geographicLinesVisible={globeSettings.geographicLinesVisible}
        onGeographicLinesToggle={onGeographicLinesToggle}
        timeZoneLinesVisible={globeSettings.timeZoneLinesVisible}
        onTimeZoneLinesToggle={onTimeZoneLinesToggle}
        pacificCentered={globeSettings.pacificCentered}
        onPacificCenteredToggle={onPacificCenteredToggle}
        coastlineResolution={globeSettings.coastlineResolution}
        onCoastlineResolutionChange={onCoastlineResolutionChange}
        riverResolution={globeSettings.riverResolution}
        onRiverResolutionChange={onRiverResolutionChange}
        lakeResolution={globeSettings.lakeResolution}
        onLakeResolutionChange={onLakeResolutionChange}
        naturalEarthGeographicLinesVisible={
          globeSettings.naturalEarthGeographicLinesVisible
        }
        onNaturalEarthGeographicLinesToggle={
          onNaturalEarthGeographicLinesToggle
        }
        labelsVisible={globeSettings.labelsVisible}
        onLabelsToggle={onLabelsToggle}
        rasterOpacity={globeSettings.rasterOpacity}
        onRasterOpacityChange={onRasterOpacityChange}
        hideZeroPrecipitation={globeSettings.hideZeroPrecipitation}
        onHideZeroPrecipitationToggle={onHideZeroPrecipToggle}
        rasterBlurEnabled={globeSettings.rasterBlurEnabled}
        onRasterBlurToggle={onRasterBlurToggle}
        bumpMapMode={globeSettings.bumpMapMode}
        onBumpMapModeChange={onBumpMapModeChange}
        colorbarCustomMin={globeSettings.colorbarCustomMin}
        colorbarCustomMax={globeSettings.colorbarCustomMax}
        onColorbarRangeChange={onColorbarRangeChange}
        onColorbarRangeReset={onColorbarRangeReset}
        viewMode={viewMode ?? "3d"}
        onViewModeChange={onViewModeChange ?? (() => {})}
        onShowVisualizationModal={onShowVisualizationModal}
      />
    </>
  );
}
