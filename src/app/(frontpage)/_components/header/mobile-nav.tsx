"use client";

import * as React from "react";
import {
  Menu,
  Eye,
  LayoutList,
  Monitor,
  Palette,
  RotateCcw,
  ExternalLink,
  HelpCircle,
  FileText,
  Calendar,
  Download,
  Globe as GlobeIcon,
} from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { ModeToggle } from "@/components/ui/modetoggle";
import { useAppState } from "@/context/dataset-context";
import { useSettings } from "@/context/settings-context";
import { useSidebar } from "@/context/sidebar-context";
import type { LineColorSettings } from "@/types";
import { COLOR_MAP_PRESETS } from "@/utils/colorScales";

export default function MobileNav() {
  const { currentDataset, globeSettings } = useAppState();
  const {
    colorBarOrientation,
    setColorBarOrientation,
    selectedColorMap,
    setSelectedColorMap,
    selectedColorMapInverse,
    setSelectedColorMapInverse,
    lineColors,
    setLineColors,
  } = useSettings();

  const { openPanel, actions, isDownloading } = useSidebar();

  const [open, setOpen] = React.useState(false);

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
          boundaryLines: "#4b5563",
          coastlines: "#4b5563",
          rivers: "#4b5563",
          lakes: "#4b5563",
          geographicLines: "#4b5563",
          geographicGrid: "#4b5563",
        };

  const [settings, setSettings] = React.useState(() => ({
    colorBarOrientation,
    colorMapPreset: selectedColorMap ?? "dataset-default",
    colorMapInverse: selectedColorMapInverse ?? false,
    lineColors: lineColors ?? defaultLineColors,
  }));

  const DEFAULT_COLOR_MAP_CATEGORY = "cb-zero";
  const [activeColorMapCategory, setActiveColorMapCategory] = React.useState(
    DEFAULT_COLOR_MAP_CATEGORY,
  );
  const [lineColorSelection, setLineColorSelection] = React.useState({
    boundaryLines: false,
    coastlines: false,
    rivers: false,
    lakes: false,
    geographicLines: false,
    geographicGrid: false,
  });

  React.useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      colorBarOrientation,
      colorMapPreset: selectedColorMap ?? "dataset-default",
      colorMapInverse: selectedColorMapInverse ?? false,
      lineColors: lineColors ?? prev.lineColors,
    }));
  }, [
    colorBarOrientation,
    selectedColorMap,
    selectedColorMapInverse,
    lineColors,
  ]);

  const updateSetting = (key: string, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleColorMapSelect = (preset: string) => {
    updateSetting("colorMapPreset", preset);
    setSelectedColorMap(preset);
  };

  const handleColorMapInverseToggle = (checked: boolean) => {
    updateSetting("colorMapInverse", checked);
    setSelectedColorMapInverse(checked);
  };

  const resetToDefaults = () => {
    setSettings({
      colorBarOrientation: "horizontal",
      colorMapPreset: "dataset-default",
      colorMapInverse: false,
      lineColors: defaultLineColors,
    });
    setColorBarOrientation("horizontal");
    setSelectedColorMap("dataset-default");
    setSelectedColorMapInverse(false);
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

  const resetLineColors = () => {
    setSettings((prev) => ({ ...prev, lineColors: defaultLineColors }));
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
        label: "CB Non-Centered",
        match: (id: string) =>
          id.includes("Color Brewer 2.0|Diverging|Non Centered"),
      },
      {
        id: "cb-zero",
        label: "CB Zero-Centered",
        match: (id: string) =>
          id.includes("Color Brewer 2.0|Diverging|Zero Centered"),
      },
      {
        id: "cb-multi",
        label: "CB Multi-hue",
        match: (id: string) =>
          id.includes("Color Brewer 2.0|Sequential|Multi-hue"),
      },
      {
        id: "cb-single",
        label: "CB Single-hue",
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

  const handleSave = () => {
    if (settings.lineColors) setLineColors(settings.lineColors);
    setLineColorSelection({
      boundaryLines: false,
      coastlines: false,
      rivers: false,
      lakes: false,
      geographicLines: false,
      geographicGrid: false,
    });
    setOpen(false);
  };

  // Sidebar action button helpers — close the sheet then trigger the action
  const handleActionButton = (action: () => void) => {
    setOpen(false);
    action();
  };

  const sidebarButtons = [
    {
      id: "tutorial",
      icon: <HelpCircle className="h-4 w-4" />,
      label: "Show Tutorial",
      onClick: () => handleActionButton(actions.onShowTutorial),
      disabled: false,
    },
    {
      id: "dataset",
      icon: <FileText className="h-4 w-4" />,
      label: "Select Datasets",
      onClick: () => {
        setOpen(false);
        openPanel("datasets");
        actions.onShowSidebarPanel("datasets");
      },
      disabled: false,
    },
    {
      id: "calendar",
      icon: <Calendar className="h-4 w-4" />,
      label: "Set Date",
      onClick: () => {
        setOpen(false);
        openPanel("calendar");
      },
      disabled: false,
    },
    {
      id: "download",
      icon: <Download className="h-4 w-4" />,
      label: isDownloading ? "Downloading..." : "Download Dataset",
      onClick: () => handleActionButton(actions.onDownload),
      disabled: isDownloading || !currentDataset,
    },
    {
      id: "preferences",
      icon: <GlobeIcon className="h-4 w-4" />,
      label: "Globe Settings",
      onClick: () => {
        setOpen(false);
        openPanel("globeSettings");
      },
      disabled: false,
    },
  ];

  return (
    <div className="lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-80 flex-col gap-0 p-0">
          <SheetHeader className="border-b px-4 py-4">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>

          <div
            className="flex-1 overflow-y-auto p-4"
            style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
            onTouchMove={(e) => e.stopPropagation()}
          >
            {/* Quick Actions — sidebar buttons for mobile */}
            <Card className="mb-4 w-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 px-3 pb-3">
                {sidebarButtons.map((btn) => (
                  <Button
                    key={btn.id}
                    variant="outline"
                    size="sm"
                    className="flex items-center justify-start gap-2 text-xs"
                    onClick={btn.onClick}
                    disabled={btn.disabled}
                  >
                    {btn.icon}
                    <span className="truncate">{btn.label}</span>
                  </Button>
                ))}
              </CardContent>
            </Card>

            <Card className="w-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">iCHARM</CardTitle>
                <CardDescription className="text-xs">
                  Navigate, configure, and explore climate data.
                  <Link
                    href="/dashboard/timeseries"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                    className="text-primary my-2 flex items-center gap-1.5 underline-offset-2 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open Data Analysis Dashboard
                  </Link>
                </CardDescription>
              </CardHeader>
              <CardContent className="px-2 pb-2">
                <Accordion type="multiple" className="w-full">
                  {/* About */}
                  <AccordionItem value="about">
                    <AccordionTrigger className="px-2 text-sm">
                      <div className="flex items-center gap-2">
                        About iCHARM
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-2 pb-3">
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        Interactive Climate and Atmospheric Research Model
                      </p>
                      <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                        To be written: information about the iCHARM project.
                      </p>
                      <Separator className="my-3" />
                      <div className="text-muted-foreground flex justify-between text-xs">
                        <span>&copy; 2025 iCHARM</span>
                        <span>Version 1.0.0</span>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Settings */}
                  <AccordionItem value="settings">
                    <AccordionTrigger className="px-2 text-sm">
                      <div className="flex items-center gap-2">Settings</div>
                    </AccordionTrigger>
                    <AccordionContent className="px-0 pb-0">
                      <Accordion type="multiple" className="w-full">
                        {/* Color Maps */}
                        <AccordionItem
                          value="colormaps"
                          className="border-dashed"
                        >
                          <AccordionTrigger className="px-4 py-2.5 text-xs font-medium">
                            <div className="flex items-center gap-2">
                              <Eye className="h-3.5 w-3.5" />
                              Color Maps
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-2 pb-4">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <Label
                                  htmlFor="mobile-inverse-toggle"
                                  className="text-muted-foreground text-xs"
                                >
                                  Inverse
                                </Label>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    id="mobile-inverse-toggle"
                                    checked={settings.colorMapInverse}
                                    onCheckedChange={
                                      handleColorMapInverseToggle
                                    }
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      handleColorMapSelect("dataset-default");
                                      setActiveColorMapCategory(
                                        DEFAULT_COLOR_MAP_CATEGORY,
                                      );
                                      setSelectedColorMapInverse(false);
                                      updateSetting("colorMapInverse", false);
                                    }}
                                    className="text-muted-foreground h-6 gap-1 text-xs"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                    Reset
                                  </Button>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-1">
                                {visibleColorMapCategories.map((cat) => (
                                  <Badge
                                    key={cat.id}
                                    variant={
                                      activeColorMapCategory === cat.id
                                        ? "default"
                                        : "outline"
                                    }
                                    className="cursor-pointer text-xs"
                                    onClick={() =>
                                      setActiveColorMapCategory(cat.id)
                                    }
                                  >
                                    {cat.label}
                                  </Badge>
                                ))}
                              </div>

                              <div className="space-y-1.5">
                                {filteredPresets.map((preset) => {
                                  const displayColors = settings.colorMapInverse
                                    ? [...preset.colors].reverse()
                                    : preset.colors;
                                  const gradient =
                                    buildLinearGradient(displayColors);
                                  const isActive =
                                    settings.colorMapPreset === preset.id;
                                  return (
                                    <button
                                      key={preset.id}
                                      type="button"
                                      onClick={() =>
                                        handleColorMapSelect(preset.id)
                                      }
                                      className={`flex w-full items-center gap-3 rounded-lg border-2 p-2 text-left transition-all ${
                                        isActive
                                          ? "border-primary bg-primary/5"
                                          : "hover:border-muted-foreground/20 hover:bg-muted/50 border-transparent"
                                      }`}
                                    >
                                      <div
                                        className="border-border h-6 w-6 shrink-0 rounded-full border"
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
                            </div>
                          </AccordionContent>
                        </AccordionItem>

                        {/* Visualization */}
                        <AccordionItem
                          value="visualization"
                          className="border-dashed"
                        >
                          <AccordionTrigger className="px-4 py-2.5 text-xs font-medium">
                            <div className="flex items-center gap-2">
                              <LayoutList className="h-3.5 w-3.5" />
                              Visualization
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-2 pb-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-xs font-medium">
                                  Color Bar
                                </Label>
                                <p className="text-muted-foreground text-xs">
                                  Orientation
                                </p>
                              </div>
                              <div className="border-border flex overflow-hidden rounded-lg border">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setColorBarOrientation("horizontal");
                                    updateSetting(
                                      "colorBarOrientation",
                                      "horizontal",
                                    );
                                  }}
                                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${colorBarOrientation === "horizontal" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                                >
                                  H
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setColorBarOrientation("vertical");
                                    updateSetting(
                                      "colorBarOrientation",
                                      "vertical",
                                    );
                                  }}
                                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${colorBarOrientation === "vertical" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                                >
                                  V
                                </button>
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>

                        {/* Appearance */}
                        <AccordionItem
                          value="appearance"
                          className="border-dashed"
                        >
                          <AccordionTrigger className="px-4 py-2.5 text-xs font-medium">
                            <div className="flex items-center gap-2">
                              <Monitor className="h-3.5 w-3.5" />
                              Appearance
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-2 pb-4">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-medium">
                                Theme
                              </Label>
                              <ModeToggle />
                            </div>
                          </AccordionContent>
                        </AccordionItem>

                        {/* Map Overlay Colors */}
                        <AccordionItem
                          value="overlays"
                          className="border-dashed"
                        >
                          <AccordionTrigger className="px-4 py-2.5 text-xs font-medium">
                            <div className="flex items-center gap-2">
                              <Palette className="h-3.5 w-3.5" />
                              Map Overlay Colors
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-2 pb-4">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <Label className="text-xs font-medium">
                                  Master Color
                                </Label>
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
                                      setSettings((prev) => {
                                        const next: LineColorSettings = {
                                          ...prev.lineColors,
                                        };
                                        keysToApply.forEach((k) => {
                                          next[k] = value;
                                        });
                                        return { ...prev, lineColors: next };
                                      });
                                    }}
                                  >
                                    <SelectTrigger className="h-7 w-[100px] text-xs">
                                      <SelectValue placeholder="Select..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {lineColorOptions.map((opt) => (
                                        <SelectItem
                                          key={opt.value}
                                          value={opt.value}
                                        >
                                          <div className="flex items-center gap-2">
                                            <div
                                              className="border-border h-3 w-3 rounded-full border"
                                              style={{
                                                backgroundColor: opt.value,
                                              }}
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
                                    className="text-muted-foreground h-6 gap-1 text-xs"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>

                              <div className="border-border divide-border divide-y rounded-lg border">
                                {lineColorItems.map((item) => (
                                  <div
                                    key={item.key}
                                    className="flex items-center justify-between px-3 py-2"
                                  >
                                    <div className="flex items-center gap-2">
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
                                            settings.lineColors?.[
                                              item.key as keyof typeof settings.lineColors
                                            ] ?? "#000000",
                                        }}
                                      />
                                      <span className="text-xs">
                                        {item.label}
                                      </span>
                                    </div>
                                    <Select
                                      value={
                                        settings.lineColors?.[
                                          item.key as keyof typeof settings.lineColors
                                        ] ?? "#000000"
                                      }
                                      onValueChange={(value) =>
                                        setSettings((prev) => ({
                                          ...prev,
                                          lineColors: {
                                            ...prev.lineColors,
                                            [item.key]: value,
                                          },
                                        }))
                                      }
                                    >
                                      <SelectTrigger className="h-6 w-[90px] text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {lineColorOptions.map((opt) => (
                                          <SelectItem
                                            key={opt.value}
                                            value={opt.value}
                                          >
                                            <div className="flex items-center gap-2">
                                              <div
                                                className="border-border h-3 w-3 rounded-full border"
                                                style={{
                                                  backgroundColor: opt.value,
                                                }}
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
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>

                      {/* Reset All */}
                      <div className="px-2 py-3">
                        <div className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                          <div className="flex items-center gap-2">
                            <RotateCcw className="h-3.5 w-3.5 text-red-400" />
                            <span className="text-xs font-medium">
                              Reset to Defaults
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={resetToDefaults}
                            className="h-6 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                          >
                            Reset All
                          </Button>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              Save
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
