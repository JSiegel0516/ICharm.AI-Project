import React, { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

interface GlobeSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  // Layer visibility controls
  satelliteLayerVisible: boolean;
  onSatelliteLayerToggle: (visible: boolean) => void;
  boundaryLinesVisible: boolean;
  onBoundaryLinesToggle: (visible: boolean) => void;
  geographicLinesVisible: boolean;
  onGeographicLinesToggle: (visible: boolean) => void;
  // Raster opacity control
  rasterOpacity: number;
  onRasterOpacityChange: (opacity: number) => void;
  rasterTransitionMs: number;
  onRasterTransitionChange: (ms: number) => void;
  hideZeroPrecipitation: boolean;
  onHideZeroPrecipitationToggle: (enabled: boolean) => void;
  rasterBlurEnabled: boolean;
  onRasterBlurToggle: (enabled: boolean) => void;
  colorbarCustomMin?: number | null;
  colorbarCustomMax?: number | null;
  onColorbarRangeChange: (payload: {
    min: number | null;
    max: number | null;
  }) => void;
  onColorbarRangeReset: () => void;
  viewMode?: GlobeSettings["viewMode"];
  onViewModeChange?: (mode: GlobeSettings["viewMode"]) => void;
}

export function GlobeSettingsPanel({
  isOpen,
  onClose,
  satelliteLayerVisible,
  onSatelliteLayerToggle,
  boundaryLinesVisible,
  onBoundaryLinesToggle,
  geographicLinesVisible,
  onGeographicLinesToggle,
  rasterOpacity,
  onRasterOpacityChange,
  rasterTransitionMs,
  onRasterTransitionChange,
  hideZeroPrecipitation,
  onHideZeroPrecipitationToggle,
  rasterBlurEnabled,
  onRasterBlurToggle,
  colorbarCustomMin,
  colorbarCustomMax,
  onColorbarRangeChange,
  onColorbarRangeReset,
  viewMode = "3d",
  onViewModeChange,
}: GlobeSettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Click-outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -100, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="pointer-events-auto fixed top-1/2 left-4 z-9999 w-96 -translate-y-1/2"
        >
          <Card className="flex max-h-[600px] flex-col">
            <CardContent className="flex-1 space-y-4 overflow-y-auto py-4">
              {/* Layer Manipulation Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-white">
                  Layer Visibility
                </h3>

                {/* Satellite Layer Toggle */}
                <div className="flex items-center justify-between rounded-lg border border-neutral-600 bg-neutral-700/50 p-2.5">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="satellite-toggle"
                      className="cursor-pointer text-sm font-medium text-white"
                    >
                      Satellite Imagery
                    </Label>
                    <p className="text-xs text-slate-400">
                      Show/hide satellite base layer
                    </p>
                  </div>
                  <Switch
                    id="satellite-toggle"
                    checked={satelliteLayerVisible}
                    onCheckedChange={onSatelliteLayerToggle}
                    className="data-[state=checked]:bg-rose-500"
                  />
                </div>

                {/* Boundary Lines Toggle */}
                <div className="flex items-center justify-between rounded-lg border border-neutral-600 bg-neutral-700/50 p-2.5">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="boundary-toggle"
                      className="cursor-pointer text-sm font-medium text-white"
                    >
                      Boundary Lines
                    </Label>
                    <p className="text-xs text-slate-400">
                      Show/hide coastlines, rivers, and lakes
                    </p>
                  </div>
                  <Switch
                    id="boundary-toggle"
                    checked={boundaryLinesVisible}
                    onCheckedChange={onBoundaryLinesToggle}
                    className="data-[state=checked]:bg-rose-500"
                  />
                </div>

                {/* Geographic Grid Lines Toggle */}
                <div className="flex items-center justify-between rounded-lg border border-neutral-600 bg-neutral-700/50 p-2.5">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="geographic-lines-toggle"
                      className="cursor-pointer text-sm font-medium text-white"
                    >
                      Geographic Grid
                    </Label>
                    <p className="text-xs text-slate-400">
                      Show/hide latitude & longitude reference lines
                    </p>
                  </div>
                  <Switch
                    id="geographic-lines-toggle"
                    checked={geographicLinesVisible}
                    onCheckedChange={onGeographicLinesToggle}
                    className="data-[state=checked]:bg-rose-500"
                  />
                </div>
              </div>

              {/* Raster Opacity Section */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="raster-opacity"
                      className="text-sm font-semibold text-white"
                    >
                      Raster Opacity
                    </Label>
                    <span className="text-sm font-medium text-slate-400">
                      {Math.round(rasterOpacity * 100)}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Adjust transparency of the climate data layer
                  </p>
                </div>

                <div className="rounded-lg border border-neutral-600 bg-neutral-700/50 p-3">
                  <Slider
                    id="raster-opacity"
                    min={0}
                    max={1}
                    step={0.05}
                    value={[rasterOpacity]}
                    onValueChange={([value]) => onRasterOpacityChange(value)}
                    className="w-full"
                  />
                  <div className="mt-2 flex justify-between text-xs text-slate-500">
                    <span>Transparent</span>
                    <span>Opaque</span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-neutral-600 bg-neutral-700/50 p-2.5">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="raster-blur-toggle"
                      className="cursor-pointer text-sm font-medium text-white"
                    >
                      Raster Blur
                    </Label>
                    <p className="text-xs text-slate-400">
                      Smooth or sharpen raster tile edges
                    </p>
                  </div>
                  <Switch
                    id="raster-blur-toggle"
                    checked={rasterBlurEnabled}
                    onCheckedChange={onRasterBlurToggle}
                    className="data-[state=checked]:bg-rose-500"
                  />
                </div>

                {/* Raster Transition Speed */}
                <div className="space-y-1 rounded-lg border border-neutral-600 bg-neutral-700/50 p-3">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="raster-transition"
                      className="text-sm font-semibold text-white"
                    >
                      Raster Frame Duration
                    </Label>
                    <span className="text-sm font-medium text-slate-400">
                      {rasterTransitionMs} ms
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Minimum time each raster stays fully visible before the next
                    one starts fading in.
                  </p>
                  <Slider
                    id="raster-transition"
                    min={100}
                    max={2000}
                    step={50}
                    value={[rasterTransitionMs]}
                    onValueChange={([value]) =>
                      onRasterTransitionChange(Math.round(value))
                    }
                    className="w-full"
                  />
                </div>
              </div>

              {/* Precipitation Display */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-white">
                  Precipitation Display
                </h3>
                <div className="flex items-center justify-between rounded-lg border border-neutral-600 bg-neutral-700/50 p-2.5">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="precip-zero-toggle"
                      className="cursor-pointer text-sm font-medium text-white"
                    >
                      Only Display Nonzero Data
                    </Label>
                    <p className="text-xs text-slate-400">
                      Hide zero precipitation areas (CMORPH & local datasets)
                    </p>
                  </div>
                  <Switch
                    id="precip-zero-toggle"
                    checked={hideZeroPrecipitation}
                    onCheckedChange={onHideZeroPrecipitationToggle}
                    className="data-[state=checked]:bg-rose-500"
                  />
                </div>
              </div>

              {/* Colorbar Range */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-white">
                  Colorbar Range
                </h3>

                <div className="space-y-2 rounded-lg border border-neutral-600 bg-neutral-700/50 p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="colorbar-min"
                        className="text-xs font-medium text-slate-300"
                      >
                        Min
                      </Label>
                      <Input
                        id="colorbar-min"
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={
                          Number.isFinite(colorbarCustomMin as number)
                            ? (colorbarCustomMin as number)
                            : ""
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          const parsed =
                            raw === "" ? null : Number.parseFloat(raw);
                          if (raw === "" || Number.isFinite(parsed)) {
                            onColorbarRangeChange({
                              min: raw === "" ? null : parsed,
                              max:
                                Number.isFinite(colorbarCustomMax as number) &&
                                colorbarCustomMax !== null
                                  ? (colorbarCustomMax as number)
                                  : null,
                            });
                          }
                        }}
                        className="bg-neutral-800 text-white"
                        placeholder="Auto"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="colorbar-max"
                        className="text-xs font-medium text-slate-300"
                      >
                        Max
                      </Label>
                      <Input
                        id="colorbar-max"
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={
                          Number.isFinite(colorbarCustomMax as number)
                            ? (colorbarCustomMax as number)
                            : ""
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          const parsed =
                            raw === "" ? null : Number.parseFloat(raw);
                          if (raw === "" || Number.isFinite(parsed)) {
                            onColorbarRangeChange({
                              min:
                                Number.isFinite(colorbarCustomMin as number) &&
                                colorbarCustomMin !== null
                                  ? (colorbarCustomMin as number)
                                  : null,
                              max: raw === "" ? null : parsed,
                            });
                          }
                        }}
                        className="bg-neutral-800 text-white"
                        placeholder="Auto"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Leave blank for auto; scale stays centered on 0</span>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-slate-600 bg-transparent px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
                      onClick={onColorbarRangeReset}
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              </div>

              {/* Globe View */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-white">View Mode</h3>
                <div className="space-y-2 rounded-lg border border-neutral-600 bg-neutral-700/50 p-3">
                  <p className="text-xs text-slate-400">
                    Choose between the interactive 3D globe or a flat 2D map
                    view.
                  </p>
                  <select
                    className="w-full rounded-md border border-slate-600 bg-neutral-800 px-3 py-2 text-sm text-white shadow-sm focus:border-white focus:outline-none"
                    value={viewMode ?? "3d"}
                    onChange={(e) =>
                      onViewModeChange?.(e.target.value === "2d" ? "2d" : "3d")
                    }
                  >
                    <option value="3d">3D</option>
                    <option value="2d">2D</option>
                  </select>
                </div>
              </div>

              {/* Info Section */}
              <div className="rounded-lg border border-blue-500/30 bg-blue-900/20 p-2.5">
                <p className="text-xs text-blue-200">
                  <strong>Tip:</strong> Disable satellite imagery to see pure
                  climate data, or adjust opacity to blend data with terrain
                  features.
                </p>
              </div>
            </CardContent>

            <div className="border-border shrink-0 border-t p-3">
              <Button
                onClick={onClose}
                className="text-card-foreground bg-muted-foreground/20 w-full"
              >
                Done
              </Button>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
export { Switch };
