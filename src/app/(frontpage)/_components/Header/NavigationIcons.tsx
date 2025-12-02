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
  } = useAppState();
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

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
  }));

  const DEFAULT_COLOR_MAP_CATEGORY = "cb-zero";
  const [activeColorMapCategory, setActiveColorMapCategory] = React.useState(
    DEFAULT_COLOR_MAP_CATEGORY,
  );

  React.useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      colorBarOrientation,
      colorMapPreset: selectedColorMap ?? "dataset-default",
      colorMapInverse: selectedColorMapInverse ?? false,
    }));
  }, [colorBarOrientation, selectedColorMap, selectedColorMapInverse]);

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
    });
    setColorBarOrientation("horizontal");
    setSelectedColorMap("dataset-default");
    setSelectedColorMapInverse(false);
    setActiveColorMapCategory(DEFAULT_COLOR_MAP_CATEGORY);
  };

  const fontSizeOptions = [
    { value: "small", label: "Small", size: "text-sm" },
    { value: "medium", label: "Medium", size: "text-base" },
    { value: "large", label: "Large", size: "text-lg" },
    { value: "xlarge", label: "Extra Large", size: "text-xl" },
  ];

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

  const colorMapCategories = [
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
  ];

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

  const filteredPresets = React.useMemo(() => {
    const category =
      colorMapCategories.find((cat) => cat.id === activeColorMapCategory) ??
      colorMapCategories[0];
    return COLOR_MAP_PRESETS.filter((preset) => category.match(preset.id));
  }, [activeColorMapCategory]);

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
          <DialogContent className="sm:max-w-[825px]">
            <DialogHeader>
              <DialogTitle className="text-center">About iCharm</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              Interactive Climate and Atmospheric Research Model
            </div>
            <DialogDescription>
              Everyone talks about global warming or climate change, but few
              have seen the climate data, because accessing climate data can be
              a technically challenging task. This 4-Dimensional Visual Delivery
              of Big Climate Data (4DVD) enables anyone to access climate data
              immediately as long as the person can navigate a website. 4DVD is
              a unique software developed at the Climate Informatics Lab, San
              Diego State University, for the instant delivery of big climate
              data to classrooms and households around the world in a convenient
              and visual way. It works like an Amazon audio book shopping
              experience. In fact, at one time 4DVD partnered with Amazon and
              used Amazon Web Services (AWS), which is a cloud service from
              Amazon, to store and deliver the climate data. 4DVD makes the
              climate data acquisition in the same way as one shops on Amazon
              for digital products, such as digital books or movies.{" "}
            </DialogDescription>
            <DialogFooter>
              <div className="text-sm text-gray-400">© 2025 iCharm</div>
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
                Configure your iCharm experience
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
                        <select
                          value={activeColorMapCategory}
                          onChange={(e) =>
                            setActiveColorMapCategory(e.target.value)
                          }
                          className="rounded-lg bg-gray-700 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        >
                          {colorMapCategories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.label}
                            </option>
                          ))}
                        </select>
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
                          {colorMapCategories.map((cat) => (
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
