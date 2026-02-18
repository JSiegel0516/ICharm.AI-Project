"use client";

import * as React from "react";
import { Eye, LayoutList, Monitor, Palette, RotateCcw } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import Link from "next/link";
import { ChartSplineIcon } from "@/components/ui/chart-spline";
import { SettingsGearIcon } from "@/components/ui/settings-gear";
import { Info } from "lucide-react";
import { ModeToggle } from "@/components/ui/modetoggle";
import { useAppState } from "@/context/dataset-context";
import { useSettings } from "@/context/settings-context";
import type { LineColorSettings } from "@/types";
import { COLOR_MAP_PRESETS } from "@/utils/colorScales";

export default function NavigationIcons() {
  const { globeSettings } = useAppState();
  const {
    colorBarOrientation,
    setColorBarOrientation,
    selectedColorMap,
    setSelectedColorMap,
    selectedColorMapInverse,
    setSelectedColorMapInverse,
    lineColors,
    setLineColors,
    activeColorMapCategory,
    setActiveColorMapCategory,
    resetToDefaults,
    getDefaultLineColors,
  } = useSettings();

  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [lineColorSelection, setLineColorSelection] = React.useState({
    boundaryLines: false,
    coastlines: false,
    rivers: false,
    lakes: false,
    geographicLines: false,
    geographicGrid: false,
  });

  const viewMode = globeSettings?.viewMode ?? "3d";

  const handleColorMapSelect = (preset: string) => {
    setSelectedColorMap(preset);
  };

  const handleColorMapInverseToggle = (checked: boolean) => {
    setSelectedColorMapInverse(checked);
  };

  const handleSave = () => {
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

  const handleResetToDefaults = () => {
    resetToDefaults(viewMode);
    setActiveColorMapCategory("cb-zero");
    setLineColorSelection({
      boundaryLines: false,
      coastlines: false,
      rivers: false,
      lakes: false,
      geographicLines: false,
      geographicGrid: false,
    });
  };

  const resetLineColors = () => {
    setLineColors(getDefaultLineColors(viewMode));
    setLineColorSelection({
      boundaryLines: false,
      coastlines: false,
      rivers: false,
      lakes: false,
      geographicLines: false,
      geographicGrid: false,
    });
  };

  const lineColorOptions = [
    { value: "#111827", label: "Black" },
    { value: "#ffffff", label: "White" },
    { value: "#4b5563", label: "Gray" },
    { value: "#e5e7eb", label: "Light Gray" },
    { value: "#64748b", label: "Slate" },
    { value: "#3b82f6", label: "Blue" },
    { value: "#22d3ee", label: "Cyan" },
    { value: "#22c55e", label: "Green" },
    { value: "#eab308", label: "Yellow" },
    { value: "#ef4444", label: "Red" },
    { value: "#a855f7", label: "Purple" },
  ];

  const lineColorItems = [
    { key: "boundaryLines", label: "Boundary Lines" },
    { key: "coastlines", label: "Coastlines" },
    { key: "rivers", label: "Rivers" },
    { key: "lakes", label: "Lakes" },
    { key: "geographicLines", label: "Geographic Lines" },
    { key: "geographicGrid", label: "Geographic Grid" },
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
        label: "CB 2.0 | Non-Centered",
        match: (id: string) =>
          id.includes("Color Brewer 2.0|Diverging|Non Centered"),
      },
      {
        id: "cb-zero",
        label: "CB 2.0 | Zero-Centered",
        match: (id: string) =>
          id.includes("Color Brewer 2.0|Diverging|Zero Centered"),
      },
      {
        id: "cb-multi",
        label: "CB 2.0 | Multi-hue",
        match: (id: string) =>
          id.includes("Color Brewer 2.0|Sequential|Multi-hue"),
      },
      {
        id: "cb-single",
        label: "CB 2.0 | Single-hue",
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

  const filteredPresets = React.useMemo(() => {
    const category =
      visibleColorMapCategories.find(
        (cat) => cat.id === activeColorMapCategory,
      ) ?? visibleColorMapCategories[0];
    if (!category) return [];
    return COLOR_MAP_PRESETS.filter((preset) => category.match(preset.id));
  }, [activeColorMapCategory, visibleColorMapCategories]);

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
  }, [
    activeColorMapCategory,
    visibleColorMapCategories,
    setActiveColorMapCategory,
  ]);

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
                aria-label="Data Analysis Dashboard"
                id="time-series-button"
              >
                <ChartSplineIcon />
              </Button>
            </Link>
          </TooltipTrigger>
          <TooltipContent>
            <p>Data Analysis Dashboard</p>
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
          <DialogContent className="sm:max-w-lg">
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
              <div className="text-muted-foreground text-sm">
                &copy; 2025 iCHARM
              </div>
              <div className="text-muted-foreground text-sm">Version 1.0.0</div>
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

          <DialogContent className="max-h-[90vh] gap-0 p-0 sm:max-w-2xl">
            <DialogHeader className="border-b px-4 py-4 sm:px-6">
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription>
                Configure your iCHARM experience
              </DialogDescription>
            </DialogHeader>

            <div
              className="overflow-y-auto px-4 py-6 sm:px-6"
              style={{
                touchAction: "pan-y",
                WebkitOverflowScrolling: "touch",
                maxHeight: "calc(90vh - 140px)",
              }}
              onTouchMove={(e) => e.stopPropagation()}
            >
              <div className="space-y-8">
                {/* Color Maps */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Eye className="text-primary h-4 w-4" />
                    <h3 className="text-sm font-semibold">Color Maps</h3>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Label
                        htmlFor="inverse-toggle"
                        className="text-muted-foreground text-xs"
                      >
                        Inverse
                      </Label>
                      <Switch
                        id="inverse-toggle"
                        checked={selectedColorMapInverse}
                        onCheckedChange={handleColorMapInverseToggle}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          handleColorMapSelect("dataset-default");
                          setActiveColorMapCategory("cb-zero");
                          setSelectedColorMapInverse(false);
                        }}
                        className="text-muted-foreground h-7 gap-1.5 text-xs"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reset
                      </Button>
                      <Select
                        value={activeColorMapCategory}
                        onValueChange={setActiveColorMapCategory}
                      >
                        <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {visibleColorMapCategories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {visibleColorMapCategories.map((cat) => (
                      <Badge
                        key={cat.id}
                        variant={
                          activeColorMapCategory === cat.id
                            ? "default"
                            : "outline"
                        }
                        className="cursor-pointer text-xs transition-colors"
                        onClick={() => setActiveColorMapCategory(cat.id)}
                      >
                        {cat.label}
                      </Badge>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {filteredPresets.map((preset) => {
                      const displayColors = selectedColorMapInverse
                        ? [...preset.colors].reverse()
                        : preset.colors;
                      const gradient = buildLinearGradient(displayColors);
                      const isActive = selectedColorMap === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleColorMapSelect(preset.id)}
                          className={`flex items-center gap-3 rounded-lg border-2 p-2.5 text-left transition-all ${
                            isActive
                              ? "border-primary bg-primary/5"
                              : "hover:border-muted-foreground/20 hover:bg-muted/50 border-transparent"
                          }`}
                        >
                          <div
                            className="border-border h-8 w-8 shrink-0 rounded-full border"
                            style={{
                              background: `conic-gradient(${gradient})`,
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium">
                              {preset.label}
                            </div>
                            <div
                              className="mt-1 h-1.5 rounded-full"
                              style={{
                                background: `linear-gradient(90deg, ${gradient})`,
                              }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <Separator />

                {/* Visualization */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <LayoutList className="text-primary h-4 w-4" />
                    <h3 className="text-sm font-semibold">Visualization</h3>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">
                        Color Bar Orientation
                      </Label>
                      <p className="text-muted-foreground text-xs">
                        How the temperature scale is displayed
                      </p>
                    </div>
                    <div className="border-border flex overflow-hidden rounded-lg border">
                      <button
                        type="button"
                        onClick={() => setColorBarOrientation("horizontal")}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${colorBarOrientation === "horizontal" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                      >
                        Horizontal
                      </button>
                      <button
                        type="button"
                        onClick={() => setColorBarOrientation("vertical")}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${colorBarOrientation === "vertical" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                      >
                        Vertical
                      </button>
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Appearance */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Monitor className="text-primary h-4 w-4" />
                    <h3 className="text-sm font-semibold">Appearance</h3>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Theme</Label>
                      <p className="text-muted-foreground text-xs">
                        Switch between light and dark mode
                      </p>
                    </div>
                    <ModeToggle />
                  </div>
                </section>

                <Separator />

                {/* Map Overlay Colors */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Palette className="text-primary h-4 w-4" />
                    <h3 className="text-sm font-semibold">
                      Map Overlay Colors
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <Label className="text-sm font-medium">
                        Master Color
                      </Label>
                      <p className="text-muted-foreground text-xs">
                        Applies to checked rows (all if none selected)
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        onValueChange={(value) => {
                          const selectedKeys = Object.entries(
                            lineColorSelection,
                          )
                            .filter(([, enabled]) => enabled)
                            .map(([k]) => k);
                          const keysToApply = (
                            selectedKeys.length > 0
                              ? selectedKeys
                              : lineColorItems.map((i) => i.key)
                          ) as Array<keyof LineColorSettings>;
                          const next: LineColorSettings = { ...lineColors };
                          keysToApply.forEach((k) => {
                            next[k] = value;
                          });
                          setLineColors(next);
                        }}
                      >
                        <SelectTrigger className="h-8 w-[120px] text-xs">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {lineColorOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <div className="flex items-center gap-2">
                                <div
                                  className="border-border h-3 w-3 rounded-full border"
                                  style={{ backgroundColor: opt.value }}
                                />
                                {opt.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={resetLineColors}
                        className="text-muted-foreground h-7 gap-1.5 text-xs"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reset
                      </Button>
                    </div>
                  </div>
                  <div className="border-border divide-border divide-y rounded-lg border">
                    {lineColorItems.map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between px-3 py-2.5"
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
                            className="border-border rounded"
                          />
                          <div
                            className="border-border h-3 w-3 rounded-full border"
                            style={{
                              backgroundColor:
                                lineColors?.[
                                  item.key as keyof LineColorSettings
                                ] ?? "#000000",
                            }}
                          />
                          <span className="text-xs font-medium">
                            {item.label}
                          </span>
                        </div>
                        <Select
                          value={
                            lineColors?.[item.key as keyof LineColorSettings] ??
                            "#000000"
                          }
                          onValueChange={(value) =>
                            setLineColors({ ...lineColors, [item.key]: value })
                          }
                        >
                          <SelectTrigger className="h-7 w-[110px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {lineColorOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <div className="flex items-center gap-2">
                                  <div
                                    className="border-border h-3 w-3 rounded-full border"
                                    style={{ backgroundColor: opt.value }}
                                  />
                                  {opt.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </section>

                <Separator />

                {/* Reset All */}
                <section>
                  <div className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                    <div className="flex items-center gap-3">
                      <RotateCcw className="h-4 w-4 text-red-400" />
                      <div>
                        <span className="text-sm font-medium">
                          Reset to Defaults
                        </span>
                        <p className="text-muted-foreground text-xs">
                          Restore all settings to factory defaults
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleResetToDefaults}
                      className="text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    >
                      Reset All
                    </Button>
                  </div>
                </section>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-4 py-3 sm:px-6">
              <DialogClose asChild>
                <Button variant="outline" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button size="sm" onClick={handleSave}>
                Save Settings
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </ButtonGroup>
    </ButtonGroup>
  );
}
