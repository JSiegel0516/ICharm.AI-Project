import React, { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GlobeSettings } from "@/types";
import { MAP_PROJECTIONS } from "@/components/Globe/projectionConfig";

interface GlobeSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  baseMapMode?: "satellite" | "street";
  onBaseMapModeChange?: (mode: "satellite" | "street") => void;
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

  // Reusable row for a switch toggle
  const ToggleRow = ({
    id,
    label,
    description,
    checked,
    onCheckedChange,
    disabled,
  }: {
    id: string;
    label: string;
    description?: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
  }) => (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        <Label
          htmlFor={id}
          className="text-card-foreground cursor-pointer text-sm font-medium"
        >
          {label}
        </Label>
        {description && (
          <p className="text-muted-foreground text-xs">{description}</p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );

  // Reusable row for a resolution select
  const ResolutionRow = ({
    label,
    value,
    onValueChange,
    disabled,
  }: {
    label: string;
    value: string;
    onValueChange: (value: string) => void;
    disabled?: boolean;
  }) => (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger className="h-7 w-[130px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {resolutionOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -100, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="pointer-events-auto fixed top-1/2 left-2 z-9999 w-[calc(100vw-1rem)] -translate-y-1/2 sm:left-4 sm:w-96"
        >
          <Card className="flex max-h-[70vh] flex-col">
            <CardContent
              className="flex-1 space-y-5 overflow-y-auto py-4"
              style={{
                touchAction: "pan-y",
                WebkitOverflowScrolling: "touch",
              }}
              onTouchMove={(e) => e.stopPropagation()}
            >
              {/* ── Layer Visibility ── */}
              {(isCesiumView || isProjectionView) && (
                <section className="space-y-3">
                  <h3 className="text-card-foreground text-xs font-semibold tracking-wider uppercase">
                    Layer Visibility
                  </h3>

                  {/* Basemap & Labels (3D / 2D, not ortho) */}
                  {isCesiumView && viewMode !== "ortho" && (
                    <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <Label className="text-card-foreground text-sm font-medium">
                          Basemap & Labels
                        </Label>
                        <p className="text-muted-foreground text-xs">
                          Control imagery, street view, and place names
                        </p>
                      </div>
                      <div className="space-y-2.5">
                        <ToggleRow
                          id="satellite-toggle"
                          label="Satellite Imagery"
                          description="Show/hide satellite base layer"
                          checked={satelliteLayerVisible}
                          onCheckedChange={onSatelliteLayerToggle}
                        />
                        <ToggleRow
                          id="basemap-toggle"
                          label="Street View"
                          description="Switch between satellite imagery and street maps"
                          checked={baseMapMode === "street"}
                          onCheckedChange={(checked) =>
                            onBaseMapModeChange?.(
                              checked ? "street" : "satellite",
                            )
                          }
                        />
                        <ToggleRow
                          id="labels-toggle"
                          label="Place Names"
                          description="Show/hide continent, country, and city labels"
                          checked={labelsVisible}
                          onCheckedChange={onLabelsToggle}
                          disabled={baseMapMode === "street"}
                        />
                      </div>
                    </div>
                  )}

                  {/* Ortho: place names only */}
                  {isCesiumView && viewMode === "ortho" && (
                    <div className="border-border bg-muted/30 rounded-lg border p-3">
                      <ToggleRow
                        id="labels-toggle-ortho"
                        label="Place Names"
                        description="Show/hide continent, country, and city labels"
                        checked={labelsVisible}
                        onCheckedChange={onLabelsToggle}
                      />
                    </div>
                  )}

                  {/* Natural Earth Detail */}
                  <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label className="text-card-foreground text-sm font-medium">
                        Natural Earth Detail
                      </Label>
                      <p className="text-muted-foreground text-xs">
                        Adjust boundary and line detail
                      </p>
                    </div>
                    <div className="space-y-2">
                      <ToggleRow
                        id="boundary-toggle"
                        label="Boundary Lines"
                        checked={boundaryLinesVisible}
                        onCheckedChange={onBoundaryLinesToggle}
                      />
                      <ResolutionRow
                        label="Coastlines"
                        value={coastlineResolution}
                        onValueChange={(v) =>
                          onCoastlineResolutionChange?.(
                            v as typeof coastlineResolution,
                          )
                        }
                        disabled={!boundaryLinesVisible}
                      />
                      <ResolutionRow
                        label="Rivers"
                        value={riverResolution}
                        onValueChange={(v) =>
                          onRiverResolutionChange?.(v as typeof riverResolution)
                        }
                        disabled={!boundaryLinesVisible}
                      />
                      <ResolutionRow
                        label="Lakes"
                        value={lakeResolution}
                        onValueChange={(v) =>
                          onLakeResolutionChange?.(v as typeof lakeResolution)
                        }
                        disabled={!boundaryLinesVisible}
                      />
                      <ToggleRow
                        id="ne-geographic-lines"
                        label="Geographic Lines"
                        checked={naturalEarthGeographicLinesVisible}
                        onCheckedChange={(checked) =>
                          onNaturalEarthGeographicLinesToggle?.(checked)
                        }
                        disabled={!boundaryLinesVisible}
                      />
                      <ToggleRow
                        id="geographic-lines-toggle"
                        label="Geographic Grid"
                        checked={geographicLinesVisible}
                        onCheckedChange={onGeographicLinesToggle}
                      />
                      <ToggleRow
                        id="timezone-lines-toggle"
                        label="Time Zone Lines"
                        checked={timeZoneLinesVisible}
                        onCheckedChange={onTimeZoneLinesToggle}
                      />
                    </div>
                  </div>

                  {/* Bump Mapping (ortho only) */}
                  {isCesiumView && viewMode === "ortho" && (
                    <div className="border-border bg-muted/30 flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <Label className="text-card-foreground text-sm font-medium">
                          Bump Mapping
                        </Label>
                        <p className="text-muted-foreground text-xs">
                          Normal map for orthographic relief
                        </p>
                      </div>
                      <Select
                        value={bumpMapMode}
                        onValueChange={(v) =>
                          onBumpMapModeChange(
                            v as "none" | "land" | "landBathymetry",
                          )
                        }
                      >
                        <SelectTrigger className="h-8 w-[150px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="land">Land</SelectItem>
                          <SelectItem value="landBathymetry">
                            Land + Bathymetry
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </section>
              )}

              {/* ── Map Orientation ── */}
              {(isCesiumView || isProjectionView) && (
                <>
                  <Separator />
                  <section className="space-y-3">
                    <h3 className="text-card-foreground text-xs font-semibold tracking-wider uppercase">
                      Map Orientation
                    </h3>
                    <div className="border-border bg-muted/30 rounded-lg border p-3">
                      <ToggleRow
                        id="pacific-centered-toggle"
                        label="Pacific Centered"
                        description="Shift the map seam so the Pacific sits at center"
                        checked={pacificCentered}
                        onCheckedChange={onPacificCenteredToggle}
                        disabled={!isProjectionView && viewMode !== "2d"}
                      />
                    </div>
                  </section>
                </>
              )}

              <Separator />

              {/* ── Raster Opacity ── */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-card-foreground text-xs font-semibold tracking-wider uppercase">
                    Raster Opacity
                  </h3>
                  <span className="text-muted-foreground text-sm font-medium">
                    {Math.round(rasterOpacity * 100)}%
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">
                  Adjust transparency of the climate data layer
                </p>

                <div className="border-border bg-muted/30 rounded-lg border p-3">
                  <Slider
                    id="raster-opacity"
                    min={0}
                    max={1}
                    step={0.05}
                    value={[rasterOpacity]}
                    onValueChange={([value]) => onRasterOpacityChange(value)}
                    className="w-full"
                  />
                  <div className="text-muted-foreground mt-2 flex justify-between text-xs">
                    <span>Transparent</span>
                    <span>Opaque</span>
                  </div>
                </div>

                <div className="border-border bg-muted/30 rounded-lg border p-3">
                  <ToggleRow
                    id="raster-blur-toggle"
                    label="Smoothed Gridboxes"
                    description="Blend the grid to reduce hard edges"
                    checked={rasterBlurEnabled}
                    onCheckedChange={onRasterBlurToggle}
                  />
                </div>
              </section>

              <Separator />

              {/* ── Precipitation Display ── */}
              <section className="space-y-3">
                <h3 className="text-card-foreground text-xs font-semibold tracking-wider uppercase">
                  Precipitation Display
                </h3>
                <div className="border-border bg-muted/30 rounded-lg border p-3">
                  <ToggleRow
                    id="precip-zero-toggle"
                    label="Only Display Nonzero Data"
                    description="Hide zero precipitation areas (CMORPH & local datasets)"
                    checked={hideZeroPrecipitation}
                    onCheckedChange={onHideZeroPrecipitationToggle}
                  />
                </div>
              </section>

              <Separator />

              {/* ── Colorbar Range ── */}
              <section className="space-y-3">
                <h3 className="text-card-foreground text-xs font-semibold tracking-wider uppercase">
                  Colorbar Range
                </h3>

                <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="colorbar-min"
                        className="text-muted-foreground text-xs font-medium"
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
                        placeholder="Auto"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="colorbar-max"
                        className="text-muted-foreground text-xs font-medium"
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
                        placeholder="Auto"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">
                      Leave blank for auto
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground h-7 text-xs"
                      onClick={onColorbarRangeReset}
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              </section>

              <Separator />

              {/* ── View Mode ── */}
              <section className="space-y-3">
                <h3 className="text-card-foreground text-xs font-semibold tracking-wider uppercase">
                  View Mode
                </h3>
                <div className="border-border bg-muted/30 space-y-2 rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">
                    Choose between the interactive 3D globe, orthographic, or a
                    flat 2D map view.
                  </p>
                  <Select
                    value={viewMode ?? "3d"}
                    onValueChange={(v) =>
                      onViewModeChange?.(
                        (v as GlobeSettings["viewMode"]) ?? "3d",
                      )
                    }
                  >
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3d">3D</SelectItem>
                      <SelectItem value="ortho">Orthographic (3D)</SelectItem>
                      <SelectItem value="2d">2D (Equirectangular)</SelectItem>
                      {MAP_PROJECTIONS.map((projection) => (
                        <SelectItem key={projection.id} value={projection.id}>
                          {projection.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </section>

              <Separator />

              {/* ── Visualization ── */}
              <section className="space-y-3">
                <h3 className="text-card-foreground text-xs font-semibold tracking-wider uppercase">
                  Visualization
                </h3>
                <p className="text-muted-foreground text-xs">
                  Build a multi-date visualization from the current dataset.
                </p>
                <Button
                  type="button"
                  className="w-full"
                  onClick={onShowVisualizationModal}
                >
                  Open Visualization Builder
                </Button>
              </section>

              {/* Tip */}
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                <p className="text-xs text-blue-300">
                  <strong>Tip:</strong> Disable satellite imagery to see pure
                  climate data, or adjust opacity to blend data with terrain
                  features.
                </p>
              </div>
            </CardContent>

            <div className="border-border shrink-0 border-t p-3">
              <Button variant="secondary" onClick={onClose} className="w-full">
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
