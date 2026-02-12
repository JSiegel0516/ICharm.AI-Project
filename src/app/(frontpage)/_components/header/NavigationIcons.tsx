"use client";

import * as React from "react";
import { Eye, Globe, LayoutList, Monitor, RotateCcw, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import Link from "next/link";
import { ChartSplineIcon } from "@/components/ui/chart-spline";
import { SettingsGearIcon } from "@/components/ui/settings-gear";
import { Info } from "lucide-react";
import { ModeToggle } from "@/components/ui/modetoggle";
import { useAppState } from "@/context/HeaderContext";
import { COLOR_MAP_PRESETS } from "@/utils/colorScales";
import { Switch } from "@/components/ui/switch";

export default function NavigationIcons() {
  const {
    colorBarOrientation,
    setColorBarOrientation,
    selectedColorMap,
    setSelectedColorMap,
    selectedColorMapInverse,
    setSelectedColorMapInverse,
    lineColors,
    setLineColors,
    lineThickness,
    setLineThickness,
    globeSettings,
  } = useAppState();
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

  const viewMode = globeSettings?.viewMode ?? "3d";
  const defaultLineColors =
    viewMode === "3d" || viewMode === "2d" || viewMode === "ortho"
      ? {
          boundaryLines: "#000000",
          coastlines: "#000000",
          rivers: "#000000",
          lakes: "#000000",
          geographicLines: "#000000",
          geographicGrid: "#000000",
        }
      : {
          boundaryLines: "#9ca3af",
          coastlines: "#9ca3af",
          rivers: "#9ca3af",
          lakes: "#9ca3af",
          geographicLines: "#9ca3af",
          geographicGrid: "#9ca3af",
        };

  const [settings, setSettings] = React.useState(() => ({
    // Appearance
    theme: "dark",
    fontSize: "medium",
    colorContrast: "default",
    reduceAnimations: false,

    // Accessibility
    language: "en",
    keyboardNavigation: true,
    screenReader: false,
    focusIndicators: true,

    // Data Preferences
    autoRefresh: true,
    showDataPoints: true,
    highPrecision: false,

    // Performance
    animationQuality: "high",
    cacheDuration: "6 hours",
    colorBarOrientation,
    colorMapPreset: selectedColorMap ?? "dataset-default",
    colorMapInverse: selectedColorMapInverse ?? false,
    lineThickness: lineThickness ?? 1,
    lineColors: lineColors ?? defaultLineColors,
  }));

  const DEFAULT_COLOR_MAP_CATEGORY = "cb-zero";
  const [activeColorMapCategory, setActiveColorMapCategory] = React.useState(
    DEFAULT_COLOR_MAP_CATEGORY,
  );
  const [lineColorSelection, setLineColorSelection] = React.useState(() => ({
    boundaryLines: false,
    coastlines: false,
    rivers: false,
    lakes: false,
    geographicLines: false,
    geographicGrid: false,
  }));

  React.useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      colorBarOrientation,
      colorMapPreset: selectedColorMap ?? "dataset-default",
      colorMapInverse: selectedColorMapInverse ?? false,
      lineThickness: lineThickness ?? 1,
      lineColors: lineColors ?? prev.lineColors,
    }));
  }, [
    colorBarOrientation,
    selectedColorMap,
    selectedColorMapInverse,
    lineThickness,
    lineColors,
  ]);

  const updateSetting = (key: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleColorMapSelect = (preset: string) => {
    updateSetting("colorMapPreset", preset);
    setSelectedColorMap(preset);
  };

  const handleColorMapInverseToggle = (checked: boolean) => {
    updateSetting("colorMapInverse", checked);
    setSelectedColorMapInverse(checked);
  };

  const handleSave = () => {
    // Save settings logic here
    console.log("Saving settings:", settings);
    if (settings.lineColors) {
      setLineColors(settings.lineColors);
    }
    if (typeof settings.lineThickness === "number") {
      setLineThickness(settings.lineThickness);
    }
    setLineColorSelection({
      boundaryLines: false,
      coastlines: false,
      rivers: false,
      lakes: false,
      geographicLines: false,
      geographicGrid: false,
    });
    setIsSettingsOpen(false);
  };

  const resetToDefaults = () => {
    setSettings({
      theme: "dark",
      fontSize: "medium",
      colorContrast: "default",
      reduceAnimations: false,
      language: "en",
      keyboardNavigation: true,
      screenReader: false,
      focusIndicators: true,
      autoRefresh: true,
      showDataPoints: true,
      highPrecision: false,
      animationQuality: "high",
      cacheDuration: "6 hours",
      colorBarOrientation: "horizontal",
      colorMapPreset: "dataset-default",
      colorMapInverse: false,
      lineThickness: 1,
      lineColors: defaultLineColors,
    });
    setColorBarOrientation("horizontal");
    setSelectedColorMap("dataset-default");
    setSelectedColorMapInverse(false);
    setLineThickness(1);
    setActiveColorMapCategory(DEFAULT_COLOR_MAP_CATEGORY);
    setLineColors(defaultLineColors);
    setLineColorSelection({
      boundaryLines: false,
      coastlines: false,
      rivers: false,
      lakes: false,
      geographicLines: false,
      geographicGrid: false,
    });
  };

  const fontSizeOptions = [
    { value: "small", label: "Small", size: "text-sm" },
    { value: "medium", label: "Medium", size: "text-base" },
    { value: "large", label: "Large", size: "text-lg" },
    { value: "xlarge", label: "Extra Large", size: "text-xl" },
  ];

  const lineColorOptions = [
    { value: "#111827", label: "Black" },
    { value: "#ffffff", label: "White" },
    { value: "#9ca3af", label: "Gray" },
    { value: "#e5e7eb", label: "Light Gray" },
    { value: "#64748b", label: "Slate" },
    { value: "#3b82f6", label: "Blue" },
    { value: "#22d3ee", label: "Cyan" },
    { value: "#22c55e", label: "Green" },
    { value: "#eab308", label: "Yellow" },
    { value: "#ef4444", label: "Red" },
    { value: "#a855f7", label: "Purple" },
  ];

  const updateLineColor = (key: string, value: string) => {
    setSettings((prev) => ({
      ...prev,
      lineColors: {
        ...prev.lineColors,
        [key]: value,
      },
    }));
  };

  const resetLineColors = () => {
    const defaults = defaultLineColors;
    setSettings((prev) => ({
      ...prev,
      lineColors: defaults,
    }));
    setLineColorSelection({
      boundaryLines: false,
      coastlines: false,
      rivers: false,
      lakes: false,
      geographicLines: false,
      geographicGrid: false,
    });
  };

  const applyLineColor = (key: string, value: string) => {
    updateLineColor(key, value);
  };

  const languageOptions = [
    { value: "en", label: "English" },
    { value: "es", label: "Español" },
    { value: "fr", label: "Français" },
    { value: "de", label: "Deutsch" },
    { value: "zh", label: "中文" },
    { value: "ja", label: "日本語" },
    { value: "ko", label: "한국어" },
    { value: "ar", label: "العربية" },
  ];

  const colorMapCategories = React.useMemo(
    () => [
      {
        id: "anomaly",
        label: "Anomaly",
        match: (id: string) => id.startsWith("Anomaly|"),
      },
      {
        id: "cb-non",
        label: "Color Brewer 2.0 | Non-Centered",
        match: (id: string) =>
          id.includes("Color Brewer 2.0|Diverging|Non Centered"),
      },
      {
        id: "cb-zero",
        label: "Color Brewer 2.0 | Zero-Centered",
        match: (id: string) =>
          id.includes("Color Brewer 2.0|Diverging|Zero Centered"),
      },
      {
        id: "cb-multi",
        label: "Color Brewer 2.0 | Multi-hue",
        match: (id: string) =>
          id.includes("Color Brewer 2.0|Sequential|Multi-hue"),
      },
      {
        id: "cb-single",
        label: "Color Brewer 2.0 | Single-hue",
        match: (id: string) =>
          id.includes("Color Brewer 2.0|Sequential|Single-hue"),
      },
      {
        id: "matlab",
        label: "Matlab",
        match: (id: string) => id.startsWith("Matlab|"),
      },
      {
        id: "other",
        label: "Other",
        match: (id: string) =>
          id.startsWith("Other|") || id === "dataset-default",
      },
    ],
    [],
  );

  const visibleColorMapCategories = React.useMemo(
    () =>
      colorMapCategories.filter((cat) =>
        COLOR_MAP_PRESETS.some((preset) => cat.match(preset.id)),
      ),
    [colorMapCategories],
  );

  const buildLinearGradient = (colors: string[]) =>
    colors
      .map((color, index) => {
        const position =
          colors.length === 1
            ? 0
            : Math.round((index / (colors.length - 1)) * 100);
        return `${color} ${position}%`;
      })
      .join(", ");

  React.useEffect(() => {
    if (
      visibleColorMapCategories.length &&
      !visibleColorMapCategories.some(
        (cat) => cat.id === activeColorMapCategory,
      )
    ) {
      setActiveColorMapCategory(visibleColorMapCategories[0].id);
    }
  }, [activeColorMapCategory, visibleColorMapCategories]);

  const filteredPresets = React.useMemo(() => {
    const category =
      visibleColorMapCategories.find(
        (cat) => cat.id === activeColorMapCategory,
      ) ?? visibleColorMapCategories[0];
    if (!category) return [];
    return COLOR_MAP_PRESETS.filter((preset) => category.match(preset.id));
  }, [activeColorMapCategory, visibleColorMapCategories]);

  return (
    <ButtonGroup>
      <ButtonGroup className="hidden sm:flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/dashboard/timeseries"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center"
            >
              <Button
                variant="outline"
                size="icon"
                aria-label="Time Series Analysis"
                id="time-series-button"
              >
                <ChartSplineIcon />
              </Button>
            </Link>
          </TooltipTrigger>
          <TooltipContent>
            <p>Time Series Analysis</p>
          </TooltipContent>
        </Tooltip>
      </ButtonGroup>
      <ButtonGroup>
        <Dialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Info"
                  id="about-me-button"
                >
                  <Info />
                </Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>About</p>
            </TooltipContent>
          </Tooltip>
          <DialogContent className="sm:max-w-206">
            <DialogHeader>
              <DialogTitle className="text-center">About iCHARM</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              Interactive Climate and Atmospheric Research Model
            </div>
            <DialogDescription>
              To be written: information about the iCHARM project
            </DialogDescription>
            <DialogFooter>
              <div className="text-sm text-gray-400">© 2025 iCHARM</div>
              <div className="text-sm text-gray-400">Version 1.0.0</div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </ButtonGroup>
      <ButtonGroup>
        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Settings"
                  id="site-settings-button"
                >
                  <SettingsGearIcon />
                </Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>Settings</p>
            </TooltipContent>
          </Tooltip>
          <DialogContent className="max-h-[90vh] sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle className="text-center">Site Settings</DialogTitle>
              <DialogDescription className="text-center">
                Configure your iCHARM experience
              </DialogDescription>
            </DialogHeader>

            {/* Content */}
            <div className="max-h-[60vh] overflow-y-auto px-1">
              <div className="space-y-8">
                {/* Accessibility Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-blue-400" />
                    <h3 className="text-lg font-medium">Accessibility</h3>
                  </div>

                  {/* Language */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg bg-gray-800/30 p-4">
                      <div className="flex items-center gap-3">
                        <Globe className="h-4 w-4 text-gray-400" />
                        <div>
                          <span className="text-sm font-medium">Language</span>
                          <div className="text-xs text-gray-400">
                            Interface language
                          </div>
                        </div>
                      </div>
                      <select
                        value={settings.language}
                        onChange={(e) =>
                          updateSetting("language", e.target.value)
                        }
                        className="rounded-lg bg-gray-700 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      >
                        {languageOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Font Size */}
                    <div className="flex items-center justify-between rounded-lg bg-gray-800/30 p-4">
                      <div className="flex items-center gap-3">
                        <Monitor className="h-4 w-4 text-gray-400" />
                        <div>
                          <span className="text-sm font-medium">Font Size</span>
                          <div className="text-xs text-gray-400">
                            Adjust text size
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {fontSizeOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              updateSetting("fontSize", option.value)
                            }
                            className={`rounded-lg p-2 transition-colors duration-200 ${
                              settings.fontSize === option.value
                                ? "bg-blue-500 text-white"
                                : "bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white"
                            }`}
                          >
                            <span className={option.size}>A</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Color Contrast */}
                    <div className="rounded-lg bg-gray-800/30 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Eye className="h-4 w-4 text-gray-400" />
                          <div>
                            <span className="text-sm font-medium">
                              Color Contrast
                            </span>
                            <div className="text-xs text-gray-400">
                              Enhance color visibility
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              handleColorMapSelect("dataset-default");
                              setActiveColorMapCategory(
                                DEFAULT_COLOR_MAP_CATEGORY,
                              );
                              setSelectedColorMapInverse(false);
                              updateSetting("colorMapInverse", false);
                            }}
                            className="flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 transition-colors duration-200 hover:border-blue-500 hover:bg-blue-500/10"
                            title="Reset to dataset default colors"
                          >
                            <RotateCcw className="h-4 w-4" />
                            Reset
                          </button>
                          <select
                            value={activeColorMapCategory}
                            onChange={(e) =>
                              setActiveColorMapCategory(e.target.value)
                            }
                            className="rounded-lg bg-gray-700 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          >
                            {visibleColorMapCategories.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Custom Color Maps */}
                      <div className="mt-4 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-sm font-medium">
                            Color Maps (apply to colorbar and raster)
                          </div>
                          <label className="flex items-center gap-2 text-xs text-gray-300">
                            <span>Inverse Color Maps</span>
                            <Switch
                              checked={settings.colorMapInverse}
                              onCheckedChange={handleColorMapInverseToggle}
                            />
                          </label>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {visibleColorMapCategories.map((cat) => (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => setActiveColorMapCategory(cat.id)}
                              className={`rounded-lg border px-4 py-2 text-sm transition-all duration-200 ${
                                activeColorMapCategory === cat.id
                                  ? "border-blue-500 bg-blue-500/10 text-white shadow"
                                  : "border-gray-700 bg-gray-800/60 text-gray-200 hover:border-gray-500"
                              }`}
                            >
                              {cat.label}
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {filteredPresets.map((preset) => {
                            const displayColors = settings.colorMapInverse
                              ? [...preset.colors].reverse()
                              : preset.colors;
                            const gradient = buildLinearGradient(displayColors);
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => handleColorMapSelect(preset.id)}
                                className={`flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all duration-200 ${
                                  settings.colorMapPreset === preset.id
                                    ? "border-blue-500 bg-blue-500/10 shadow"
                                    : "border-transparent hover:border-gray-500"
                                }`}
                              >
                                <div
                                  className="h-10 w-10 rounded-full border border-gray-700"
                                  style={{
                                    background: `conic-gradient(${gradient})`,
                                  }}
                                />
                                <div className="flex-1">
                                  <div className="text-sm font-medium">
                                    {preset.label}
                                  </div>
                                  <div
                                    className="mt-1 h-2 rounded"
                                    style={{
                                      background: `linear-gradient(90deg, ${gradient})`,
                                    }}
                                  />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Additional Accessibility Options */}
                    <div className="space-y-2">
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-4 transition-colors duration-200 hover:bg-gray-700/40">
                        <input
                          type="checkbox"
                          checked={settings.reduceAnimations}
                          onChange={(e) =>
                            updateSetting("reduceAnimations", e.target.checked)
                          }
                          className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-sm">Reduce animations</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-4 transition-colors duration-200 hover:bg-gray-700/40">
                        <input
                          type="checkbox"
                          checked={settings.keyboardNavigation}
                          onChange={(e) =>
                            updateSetting(
                              "keyboardNavigation",
                              e.target.checked,
                            )
                          }
                          className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-sm">Keyboard navigation</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-4 transition-colors duration-200 hover:bg-gray-700/40">
                        <input
                          type="checkbox"
                          checked={settings.screenReader}
                          onChange={(e) =>
                            updateSetting("screenReader", e.target.checked)
                          }
                          className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-sm">Screen reader support</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-4 transition-colors duration-200 hover:bg-gray-700/40">
                        <input
                          type="checkbox"
                          checked={settings.focusIndicators}
                          onChange={(e) =>
                            updateSetting("focusIndicators", e.target.checked)
                          }
                          className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-sm">Focus indicators</span>
                      </label>
                    </div>
                  </div>
                </section>

                {/* Visualization Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <LayoutList className="h-5 w-5 text-blue-400" />
                    <h3 className="text-lg font-medium">Visualization</h3>
                  </div>

                  <div className="flex items-center justify-between rounded-lg bg-gray-800/30 p-4">
                    <div className="flex items-center gap-3">
                      <LayoutList className="h-4 w-4 text-gray-400" />
                      <div>
                        <span className="text-sm font-medium">
                          Color Bar Orientation
                        </span>
                        <div className="text-xs text-gray-400">
                          Choose how the temperature scale is displayed
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setColorBarOrientation("horizontal");
                          updateSetting("colorBarOrientation", "horizontal");
                        }}
                        className={`rounded-lg px-3 py-2 text-sm transition-colors duration-200 ${
                          colorBarOrientation === "horizontal"
                            ? "bg-blue-500 text-white"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white"
                        }`}
                      >
                        Horizontal
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setColorBarOrientation("vertical");
                          updateSetting("colorBarOrientation", "vertical");
                        }}
                        className={`rounded-lg px-3 py-2 text-sm transition-colors duration-200 ${
                          colorBarOrientation === "vertical"
                            ? "bg-blue-500 text-white"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white"
                        }`}
                      >
                        Vertical
                      </button>
                    </div>
                  </div>
                </section>

                {/* Appearance Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-5 w-5 text-blue-400" />
                    <h3 className="text-lg font-medium">Appearance</h3>
                  </div>

                  <div className="rounded-lg bg-gray-800/30 p-4">
                    <ModeToggle />
                  </div>
                </section>

                {/* Map Overlay Colors Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <LayoutList className="h-5 w-5 text-blue-400" />
                    <h3 className="text-lg font-medium">Map Overlay Colors</h3>
                  </div>

                  <div className="flex items-center justify-between rounded-lg bg-gray-800/30 p-4">
                    <div>
                      <span className="text-sm font-medium">Master Color</span>
                      <div className="text-xs text-gray-400">
                        Applies to checked rows (all if none selected)
                      </div>
                    </div>
                    <select
                      className="rounded-lg bg-gray-700 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!value) return;
                        const selectedKeys = Object.entries(lineColorSelection)
                          .filter(([, enabled]) => enabled)
                          .map(([k]) => k);
                        const keysToApply =
                          selectedKeys.length > 0
                            ? selectedKeys
                            : [
                                "boundaryLines",
                                "coastlines",
                                "rivers",
                                "lakes",
                                "geographicLines",
                                "geographicGrid",
                              ];
                        setSettings((prev) => {
                          const next = {
                            ...(prev.lineColors ?? {}),
                          } as Record<string, string>;
                          keysToApply.forEach((selectedKey) => {
                            next[selectedKey] = value;
                          });
                          return {
                            ...prev,
                            lineColors: next,
                          };
                        });
                        e.currentTarget.selectedIndex = 0;
                      }}
                    >
                      <option value="">Select color…</option>
                      {lineColorOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between rounded-lg bg-gray-800/30 p-4">
                    <span className="text-sm font-medium">
                      Reset all colors
                    </span>
                    <button
                      type="button"
                      onClick={resetLineColors}
                      className="rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-600"
                    >
                      {viewMode === "3d" ||
                      viewMode === "2d" ||
                      viewMode === "ortho"
                        ? "Reset to Black"
                        : "Reset to Gray"}
                    </button>
                  </div>

                  <div className="rounded-lg bg-gray-800/30 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium">
                          Line Thickness
                        </span>
                        <div className="text-xs text-gray-400">
                          Adjust overlay line weight
                        </div>
                      </div>
                      <span className="text-sm text-gray-300">
                        {Number(settings.lineThickness ?? 1).toFixed(1)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="3"
                      step="0.1"
                      value={settings.lineThickness ?? 1}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        updateSetting("lineThickness", value);
                        setLineThickness(value);
                      }}
                      className="mt-3 w-full accent-blue-500"
                    />
                  </div>

                  <div className="grid gap-3">
                    {[
                      { key: "boundaryLines", label: "Boundary Lines" },
                      { key: "coastlines", label: "Coastlines" },
                      { key: "rivers", label: "Rivers" },
                      { key: "lakes", label: "Lakes" },
                      { key: "geographicLines", label: "Geographic Lines" },
                      { key: "geographicGrid", label: "Geographic Grid" },
                    ].map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between rounded-lg bg-gray-800/30 p-4"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={
                              lineColorSelection[
                                item.key as keyof typeof lineColorSelection
                              ]
                            }
                            onChange={(e) =>
                              setLineColorSelection((prev) => ({
                                ...prev,
                                [item.key]: e.target.checked,
                              }))
                            }
                            className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                          />
                          <div
                            className="h-3 w-3 rounded-full border border-white/20"
                            style={{
                              backgroundColor:
                                settings.lineColors?.[
                                  item.key as keyof typeof settings.lineColors
                                ] ?? "#000000",
                            }}
                          />
                          <span className="text-sm font-medium">
                            {item.label}
                          </span>
                        </div>
                        <select
                          value={
                            settings.lineColors?.[
                              item.key as keyof typeof settings.lineColors
                            ] ?? "#000000"
                          }
                          onChange={(e) =>
                            applyLineColor(item.key, e.target.value)
                          }
                          className="rounded-lg bg-gray-700 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        >
                          {lineColorOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Data Preferences Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-blue-400" />
                    <h3 className="text-lg font-medium">Data Preferences</h3>
                  </div>

                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-4 transition-colors duration-200 hover:bg-gray-700/40">
                      <input
                        type="checkbox"
                        checked={settings.autoRefresh}
                        onChange={(e) =>
                          updateSetting("autoRefresh", e.target.checked)
                        }
                        className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm">Auto-refresh data</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-4 transition-colors duration-200 hover:bg-gray-700/40">
                      <input
                        type="checkbox"
                        checked={settings.showDataPoints}
                        onChange={(e) =>
                          updateSetting("showDataPoints", e.target.checked)
                        }
                        className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm">Show data points on hover</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-4 transition-colors duration-200 hover:bg-gray-700/40">
                      <input
                        type="checkbox"
                        checked={settings.highPrecision}
                        onChange={(e) =>
                          updateSetting("highPrecision", e.target.checked)
                        }
                        className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm">High precision mode</span>
                    </label>
                  </div>
                </section>

                {/* Performance Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-blue-400" />
                    <h3 className="text-lg font-medium">Performance</h3>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg bg-gray-800/30 p-4">
                      <span className="text-sm font-medium">
                        Animation Quality
                      </span>
                      <select
                        value={settings.animationQuality}
                        onChange={(e) =>
                          updateSetting("animationQuality", e.target.value)
                        }
                        className="rounded-lg bg-gray-700 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-gray-800/30 p-4">
                      <span className="text-sm font-medium">
                        Cache Duration
                      </span>
                      <select
                        value={settings.cacheDuration}
                        onChange={(e) =>
                          updateSetting("cacheDuration", e.target.value)
                        }
                        className="rounded-lg bg-gray-700 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      >
                        <option value="1 hour">1 hour</option>
                        <option value="6 hours">6 hours</option>
                        <option value="24 hours">24 hours</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* Reset Section */}
                <section className="border-t border-gray-700/50 pt-6">
                  <div className="flex items-center justify-between rounded-lg border border-red-600/20 bg-red-600/10 p-4">
                    <div className="flex items-center gap-3">
                      <RotateCcw className="h-4 w-4 text-red-400" />
                      <div>
                        <span className="text-sm font-medium text-white">
                          Reset to Defaults
                        </span>
                        <div className="text-xs text-red-400">
                          Restore all settings to factory defaults
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={resetToDefaults}
                      className="rounded-lg bg-red-600/20 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-600/30 hover:text-red-300"
                    >
                      Reset All
                    </button>
                  </div>
                </section>
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={handleSave}>Save Settings</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </ButtonGroup>
    </ButtonGroup>
  );
}
