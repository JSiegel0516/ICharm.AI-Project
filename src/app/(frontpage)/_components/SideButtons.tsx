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
import { useAppState } from "@/context/HeaderContext";
import type { Dataset, GlobeSettings } from "@/types";

interface SideButtonsProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onShowTutorial: () => void;
  onShowSidebarPanel: (panel: "datasets" | "history" | "about" | null) => void;
  globeSettings: GlobeSettings;
  onSatelliteToggle: (visible: boolean) => void;
  onBoundaryToggle: (visible: boolean) => void;
  onGeographicLinesToggle: (visible: boolean) => void;
  onRasterOpacityChange: (opacity: number) => void;
  onHideZeroPrecipToggle: (enabled: boolean) => void;
  onRasterBlurToggle: (enabled: boolean) => void;
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
  onSatelliteToggle,
  onBoundaryToggle,
  onGeographicLinesToggle,
  onRasterOpacityChange,
  onHideZeroPrecipToggle,
  onRasterBlurToggle,
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

  // Refs for click-outside detection
  const calendarRef = useRef<HTMLDivElement>(null);
  const datasetCardRef = useRef<HTMLDivElement>(null);

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

    const origLocation = currentDataset.backend?.origLocation;

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
      setSelectedDatasets((prev) => {
        if (!datasets.some((dataset) => dataset.id === datasetId)) {
          return prev;
        }

        if (prev.has(datasetId)) {
          return new Set();
        } else {
          return new Set([datasetId]);
        }
      });
    },
    [datasets],
  );

  const handleApplyDatasets = useCallback(() => {
    const [firstSelection] = Array.from(selectedDatasets);
    if (firstSelection) {
      const dataset = datasets.find((item) => item.id === firstSelection);
      if (dataset) {
        setCurrentDataset(dataset);

        let newDate = selectedDate;
        if (selectedDate < dataset.startDate) {
          newDate = dataset.startDate;
        } else if (selectedDate > dataset.endDate) {
          newDate = dataset.endDate;
        }

        if (newDate !== selectedDate) {
          onDateChange(newDate);
        }
      }
    }
    closeDatasetCard();
  }, [
    selectedDatasets,
    datasets,
    setCurrentDataset,
    closeDatasetCard,
    selectedDate,
    onDateChange,
  ]);

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
      if (
        calendarRef.current &&
        !calendarRef.current.contains(event.target as Node)
      ) {
        closeCalendar();
      }
      if (
        datasetCardRef.current &&
        !datasetCardRef.current.contains(event.target as Node)
      ) {
        closeDatasetCard();
      }
    };

    if (showCalendar || showDatasetCard) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
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
        label: "Select Dataset",
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
            className="pointer-events-auto fixed top-0 left-4 z-9999 flex h-screen flex-col items-center justify-center gap-2"
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
            className="pointer-events-auto fixed top-1/2 left-4 z-9999 w-80 -translate-y-1/2"
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
            className="pointer-events-auto fixed top-1/2 left-4 z-9999 w-96 -translate-y-1/2"
          >
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-lg">
                  <span>Select Dataset</span>
                  <Badge variant="secondary">
                    {selectedDatasets.size} selected
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Choose a dataset to visualize on the globe
                </CardDescription>
              </CardHeader>
              <CardContent className="max-h-96 space-y-3 overflow-y-auto">
                {isLoading && (
                  <div className="rounded border border-neutral-600 bg-neutral-800/50 p-3 text-sm text-slate-300">
                    Loading datasets...
                  </div>
                )}

                {!isLoading && error && (
                  <div className="rounded border border-rose-500/40 bg-rose-900/20 p-3 text-sm text-rose-200">
                    Failed to load datasets: {error}
                  </div>
                )}

                {!isLoading && !error && datasets.length === 0 && (
                  <div className="rounded border border-slate-600 bg-slate-800/50 p-3 text-sm text-slate-300">
                    No datasets available. Please try again later.
                  </div>
                )}

                {datasets.map((dataset: Dataset) => {
                  const isSelected = selectedDatasets.has(dataset.id);
                  const category =
                    dataset.backend?.datasetType ?? dataset.dataType;
                  const resolution = dataset.backend?.spatialResolution ?? "";
                  const lastUpdated = formatDisplayDate(
                    dataset.backend?.endDate,
                  );

                  return (
                    <div
                      key={dataset.id}
                      className={`cursor-pointer rounded-lg border p-3 transition-all ${
                        isSelected
                          ? "border-neutral-300/50 bg-neutral-300/20"
                          : "border-neutral-600 bg-neutral-700/50 hover:bg-neutral-700/70"
                      }`}
                      onClick={() => toggleDatasetSelection(dataset.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h3 className="text-sm font-medium text-white">
                            {dataset.name}
                          </h3>
                          <p className="mt-1 text-xs text-slate-400">
                            {dataset.description}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <Badge variant="outline" className="text-xs">
                              {category}
                            </Badge>
                            {resolution && (
                              <span className="text-xs text-slate-500">
                                Resolution: {resolution}
                              </span>
                            )}
                            <span className="text-xs text-slate-500">
                              Updated: {lastUpdated}
                            </span>
                          </div>
                        </div>
                        <div
                          className={`ml-2 flex h-4 w-4 items-center justify-center rounded border ${
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
              <div className="flex gap-2 border-t border-slate-700 p-4">
                <Button
                  variant="outline"
                  onClick={closeDatasetCard}
                  className="flex-1 border-slate-600 bg-transparent text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleApplyDatasets}
                  disabled={selectedDatasets.size === 0}
                  className="flex-1 bg-rose-500 text-white hover:bg-rose-600 disabled:bg-slate-700 disabled:text-slate-500"
                >
                  Apply Datasets
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Globe Settings Panel */}
      <GlobeSettingsPanel
        isOpen={showGlobeSettings}
        onClose={closeGlobeSettings}
        satelliteLayerVisible={globeSettings.satelliteLayerVisible}
        onSatelliteLayerToggle={onSatelliteToggle}
        boundaryLinesVisible={globeSettings.boundaryLinesVisible}
        onBoundaryLinesToggle={onBoundaryToggle}
        geographicLinesVisible={globeSettings.geographicLinesVisible}
        onGeographicLinesToggle={onGeographicLinesToggle}
        rasterOpacity={globeSettings.rasterOpacity}
        onRasterOpacityChange={onRasterOpacityChange}
        hideZeroPrecipitation={globeSettings.hideZeroPrecipitation}
        onHideZeroPrecipitationToggle={onHideZeroPrecipToggle}
        rasterBlurEnabled={globeSettings.rasterBlurEnabled}
        onRasterBlurToggle={onRasterBlurToggle}
      />
    </>
  );
}
