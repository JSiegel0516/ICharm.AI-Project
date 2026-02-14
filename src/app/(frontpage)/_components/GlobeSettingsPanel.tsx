import React, { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import type { GlobeSettings } from "@/types";
import { MAP_PROJECTIONS } from "@/components/Globe/projectionConfig";

interface GlobeSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  baseMapMode?: "satellite" | "street";
  onBaseMapModeChange?: (mode: "satellite" | "street") => void;
  // Layer visibility controls
  satelliteLayerVisible: boolean;
  onSatelliteLayerToggle: (visible: boolean) => void;
  boundaryLinesVisible: boolean;
  onBoundaryLinesToggle: (visible: boolean) => void;
  geographicLinesVisible: boolean;
  onGeographicLinesToggle: (visible: boolean) => void;
  timeZoneLinesVisible: boolean;
  onTimeZoneLinesToggle: (visible: boolean) => void;
  pacificCentered: boolean;
  onPacificCenteredToggle: (enabled: boolean) => void;
  coastlineResolution?: "none" | "low" | "medium" | "high";
  onCoastlineResolutionChange?: (
    resolution: "none" | "low" | "medium" | "high",
  ) => void;
  riverResolution?: "none" | "low" | "medium" | "high";
  onRiverResolutionChange?: (
    resolution: "none" | "low" | "medium" | "high",
  ) => void;
  lakeResolution?: "none" | "low" | "medium" | "high";
  onLakeResolutionChange?: (
    resolution: "none" | "low" | "medium" | "high",
  ) => void;
  naturalEarthGeographicLinesVisible?: boolean;
  onNaturalEarthGeographicLinesToggle?: (visible: boolean) => void;
  labelsVisible: boolean;
  onLabelsToggle: (visible: boolean) => void;
  // Raster opacity control
  rasterOpacity: number;
  onRasterOpacityChange: (opacity: number) => void;
  hideZeroPrecipitation: boolean;
  onHideZeroPrecipitationToggle: (enabled: boolean) => void;
  rasterBlurEnabled: boolean;
  onRasterBlurToggle: (enabled: boolean) => void;
  bumpMapMode: "none" | "land" | "landBathymetry";
  onBumpMapModeChange: (mode: "none" | "land" | "landBathymetry") => void;
  colorbarCustomMin?: number | null;
  colorbarCustomMax?: number | null;
  onColorbarRangeChange: (payload: {
    min: number | null;
    max: number | null;
  }) => void;
  onColorbarRangeReset: () => void;
  viewMode?: GlobeSettings["viewMode"];
  onViewModeChange?: (mode: GlobeSettings["viewMode"]) => void;
  onShowVisualizationModal: () => void;
}

export function GlobeSettingsPanel({
  isOpen,
  onClose,
  baseMapMode = "satellite",
  onBaseMapModeChange,
  satelliteLayerVisible,
  onSatelliteLayerToggle,
  boundaryLinesVisible,
  onBoundaryLinesToggle,
  geographicLinesVisible,
  onGeographicLinesToggle,
  timeZoneLinesVisible,
  onTimeZoneLinesToggle,
  pacificCentered,
  onPacificCenteredToggle,
  coastlineResolution = "low",
  onCoastlineResolutionChange,
  riverResolution = "none",
  onRiverResolutionChange,
  lakeResolution = "none",
  onLakeResolutionChange,
  naturalEarthGeographicLinesVisible = false,
  onNaturalEarthGeographicLinesToggle,
  labelsVisible,
  onLabelsToggle,
  rasterOpacity,
  onRasterOpacityChange,
  hideZeroPrecipitation,
  onHideZeroPrecipitationToggle,
  rasterBlurEnabled,
  onRasterBlurToggle,
  bumpMapMode,
  onBumpMapModeChange,
  colorbarCustomMin,
  colorbarCustomMax,
  onColorbarRangeChange,
  onColorbarRangeReset,
  viewMode = "3d",
  onViewModeChange,
  onShowVisualizationModal,
}: GlobeSettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isCesiumView = ["3d", "ortho", "2d"].includes(viewMode ?? "3d");
  const isProjectionView = MAP_PROJECTIONS.some(
    (projection) => projection.id === viewMode,
  );
  const resolutionOptions = [
    { value: "none", label: "None" },
    { value: "low", label: "Low (110m)" },
    { value: "medium", label: "Medium (50m)" },
    { value: "high", label: "High (10m)" },
  ] as const;

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
              {(isCesiumView || isProjectionView) && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-white">
                    Layer Visibility
                  </h3>

                  {isCesiumView && viewMode !== "ortho" && (
                    <div className="space-y-2 rounded-lg border border-neutral-600 bg-neutral-700/50 p-2.5">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium text-white">
                          Basemap & Labels
                        </Label>
                        <p className="text-xs text-slate-400">
                          Control imagery, street view, and place names
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        <div className="flex items-center justify-between">
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
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label
                              htmlFor="basemap-toggle"
                              className="cursor-pointer text-sm font-medium text-white"
                            >
                              Street View
                            </Label>
                            <p className="text-xs text-slate-400">
                              Switch between satellite imagery and street maps
                            </p>
                          </div>
                          <Switch
                            id="basemap-toggle"
                            checked={baseMapMode === "street"}
                            onCheckedChange={(checked) =>
                              onBaseMapModeChange?.(
                                checked ? "street" : "satellite",
                              )
                            }
                            className="data-[state=checked]:bg-rose-500"
                          />
                        </div>
                        {baseMapMode !== "street" && (
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label
                                htmlFor="labels-toggle"
                                className="cursor-pointer text-sm font-medium text-white"
                              >
                                Place Names
                              </Label>
                              <p className="text-xs text-slate-400">
                                Show/hide continent, country, and city labels
                              </p>
                            </div>
                            <Switch
                              id="labels-toggle"
                              checked={labelsVisible}
                              onCheckedChange={onLabelsToggle}
                              className="data-[state=checked]:bg-rose-500"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {isCesiumView && viewMode === "ortho" && (
                    <div className="flex items-center justify-between rounded-lg border border-neutral-600 bg-neutral-700/50 p-2.5">
                      <div className="space-y-0.5">
                        <Label
                          htmlFor="labels-toggle-ortho"
                          className="cursor-pointer text-sm font-medium text-white"
                        >
                          Place Names
                        </Label>
                        <p className="text-xs text-slate-400">
                          Show/hide continent, country, and city labels
                        </p>
                      </div>
                      <Switch
                        id="labels-toggle-ortho"
                        checked={labelsVisible}
                        onCheckedChange={onLabelsToggle}
                        className="data-[state=checked]:bg-rose-500"
                      />
                    </div>
                  )}

                  <div className="space-y-2 rounded-lg border border-neutral-600 bg-neutral-700/50 p-2.5">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium text-white">
                        Natural Earth Detail
                      </Label>
                      <p className="text-xs text-slate-400">
                        Adjust boundary and line detail
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs text-slate-300">
                          Boundary Lines
                        </Label>
                        <Switch
                          id="boundary-toggle"
                          checked={boundaryLinesVisible}
                          onCheckedChange={onBoundaryLinesToggle}
                          className="data-[state=checked]:bg-rose-500"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs text-slate-300">
                          Coastlines
                        </Label>
                        <select
                          className="rounded-md border border-slate-600 bg-neutral-800 px-2 py-1 text-xs text-white"
                          value={coastlineResolution}
                          onChange={(e) =>
                            onCoastlineResolutionChange?.(
                              e.target.value as typeof coastlineResolution,
                            )
                          }
                          disabled={!boundaryLinesVisible}
                        >
                          {resolutionOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs text-slate-300">Rivers</Label>
                        <select
                          className="rounded-md border border-slate-600 bg-neutral-800 px-2 py-1 text-xs text-white"
                          value={riverResolution}
                          onChange={(e) =>
                            onRiverResolutionChange?.(
                              e.target.value as typeof riverResolution,
                            )
                          }
                          disabled={!boundaryLinesVisible}
                        >
                          {resolutionOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs text-slate-300">Lakes</Label>
                        <select
                          className="rounded-md border border-slate-600 bg-neutral-800 px-2 py-1 text-xs text-white"
                          value={lakeResolution}
                          onChange={(e) =>
                            onLakeResolutionChange?.(
                              e.target.value as typeof lakeResolution,
                            )
                          }
                          disabled={!boundaryLinesVisible}
                        >
                          {resolutionOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs text-slate-300">
                          Geographic Lines
                        </Label>
                        <Switch
                          checked={naturalEarthGeographicLinesVisible}
                          onCheckedChange={(checked) =>
                            onNaturalEarthGeographicLinesToggle?.(checked)
                          }
                          className="data-[state=checked]:bg-rose-500"
                          disabled={!boundaryLinesVisible}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs text-slate-300">
                          Geographic Grid
                        </Label>
                        <Switch
                          id="geographic-lines-toggle"
                          checked={geographicLinesVisible}
                          onCheckedChange={onGeographicLinesToggle}
                          className="data-[state=checked]:bg-rose-500"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs text-slate-300">
                          Time Zone Lines
                        </Label>
                        <Switch
                          id="timezone-lines-toggle"
                          checked={timeZoneLinesVisible}
                          onCheckedChange={onTimeZoneLinesToggle}
                          className="data-[state=checked]:bg-rose-500"
                        />
                      </div>
                    </div>
                  </div>

                  {isCesiumView && viewMode === "ortho" && (
                    <div className="flex items-center justify-between rounded-lg border border-neutral-600 bg-neutral-700/50 p-2.5">
                      <div className="space-y-0.5">
                        <Label
                          htmlFor="bump-map-select"
                          className="text-sm font-medium text-white"
                        >
                          Bump Mapping
                        </Label>
                        <p className="text-xs text-slate-400">
                          Choose a normal map for orthographic relief
                        </p>
                      </div>
                      <select
                        id="bump-map-select"
                        className="rounded-md border border-slate-600 bg-neutral-800 px-2 py-1 text-xs text-white"
                        value={bumpMapMode}
                        onChange={(e) =>
                          onBumpMapModeChange(
                            e.target.value as
                              | "none"
                              | "land"
                              | "landBathymetry",
                          )
                        }
                      >
                        <option value="none">None</option>
                        <option value="land">Land</option>
                        <option value="landBathymetry">
                          Land + Bathymetry
                        </option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Map Orientation */}
              {(isCesiumView || isProjectionView) && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-white">
                    Map Orientation
                  </h3>
                  <div className="flex items-center justify-between rounded-lg border border-neutral-600 bg-neutral-700/50 p-2.5">
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="pacific-centered-toggle"
                        className="cursor-pointer text-sm font-medium text-white"
                      >
                        Pacific Centered
                      </Label>
                      <p className="text-xs text-slate-400">
                        Shift the map seam so the Pacific sits at center
                      </p>
                    </div>
                    <Switch
                      id="pacific-centered-toggle"
                      checked={pacificCentered}
                      onCheckedChange={onPacificCenteredToggle}
                      className="data-[state=checked]:bg-rose-500"
                      disabled={!isProjectionView && viewMode !== "2d"}
                    />
                  </div>
                </div>
              )}

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
                      Smoothed Gridboxes
                    </Label>
                    <p className="text-xs text-slate-400">
                      Blend the grid to reduce hard edges
                    </p>
                  </div>
                  <Switch
                    id="raster-blur-toggle"
                    checked={rasterBlurEnabled}
                    onCheckedChange={onRasterBlurToggle}
                    className="data-[state=checked]:bg-rose-500"
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
                    Choose between the interactive 3D globe, orthographic, or a
                    flat 2D map view.
                  </p>
                  <select
                    className="w-full rounded-md border border-slate-600 bg-neutral-800 px-3 py-2 text-sm text-white shadow-sm focus:border-white focus:outline-none"
                    value={viewMode ?? "3d"}
                    onChange={(e) =>
                      onViewModeChange?.(
                        (e.target.value as GlobeSettings["viewMode"]) ?? "3d",
                      )
                    }
                  >
                    <option value="3d">3D</option>
                    <option value="ortho">Orthographic (3D)</option>
                    <option value="2d">2D (Equirectangular)</option>
                    {MAP_PROJECTIONS.map((projection) => (
                      <option key={projection.id} value={projection.id}>
                        {projection.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Visualization */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-white">
                  Visualization
                </h3>
                <p className="text-xs text-slate-400">
                  Build a multi-date visualization from the current dataset.
                </p>
                <Button
                  type="button"
                  className="w-full bg-rose-500 text-white hover:bg-rose-600"
                  onClick={onShowVisualizationModal}
                >
                  Open Visualization Builder
                </Button>
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
