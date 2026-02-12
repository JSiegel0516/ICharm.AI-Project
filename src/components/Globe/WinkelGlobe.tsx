import React from "react";
import type { MapOrientation, MapProjectionId } from "@/types";
import type { RasterGridData } from "@/hooks/useRasterGrid";
import type {
  Dataset,
  GlobeLineResolution,
  LineColorSettings,
  RegionData,
} from "@/types";
import ProjectedGlobe from "./ProjectedGlobe";

type Props = {
  rasterGridData?: RasterGridData;
  rasterGridKey?: string;
  rasterGridDataKey?: string;
  currentDataset?: Dataset;
  rasterOpacity?: number;
  hideZeroValues: boolean;
  smoothGridBoxValues: boolean;
  boundaryLinesVisible: boolean;
  geographicLinesVisible: boolean;
  coastlineResolution?: GlobeLineResolution;
  riverResolution?: GlobeLineResolution;
  lakeResolution?: GlobeLineResolution;
  naturalEarthGeographicLinesVisible?: boolean;
  lineColors?: LineColorSettings;
  orientation?: MapOrientation;
  onOrientationChange?: (orientation: MapOrientation) => void;
  onRegionClick?: (lat: number, lon: number, data: RegionData) => void;
  clearMarkerSignal?: number;
};

const WinkelGlobe: React.FC<Props> = (props) => {
  const projectionId: MapProjectionId = "winkel";
  return <ProjectedGlobe projectionId={projectionId} {...props} />;
};

export default WinkelGlobe;
