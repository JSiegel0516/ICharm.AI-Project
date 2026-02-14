import type { HTMLAttributes } from "react";
import type { RasterLayerData } from "@/hooks/useRasterLayer";
import type { RasterGridData } from "@/hooks/useRasterGrid";
import type { UseRasterLayerResult } from "@/hooks/useRasterLayer";
import type { UseRasterGridResult } from "@/hooks/useRasterGrid";

// Raw database record - exactly as it comes from the database
export interface ClimateDatasetRecord {
  id: string;
  slug?: string | null;
  sourceName?: string | null;
  datasetName: string;
  layerParameter?: string | null;
  statistic?: string | null;
  datasetType?: string | null;
  levels?: string | null;
  levelValues?: string | null; // String from DB, will be parsed
  levelUnits?: string | null;
  stored?: string | null; // lowercase variant
  inputFile?: string | null;
  keyVariable?: string | null;
  units?: string | null;
  spatialResolution?: string | null;
  engine?: string | null;
  kerchunkPath?: string | null;
  origLocation?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  description: string | null;
}

// 2. Frontend dataset model - enriched and parsed
export interface Dataset {
  // Core identifiers
  id: string;
  slug?: string | null;

  // Display information
  name: string;
  description: string;

  // Data classification
  dataType: "temperature" | "precipitation" | "wind" | "pressure" | "humidity";
  units: string;

  // Visual representation
  colorScale: ColorScale;

  // Temporal information
  temporalResolution: "hourly" | "daily" | "monthly" | "yearly";
  startDate: Date;
  endDate: Date;

  // Backend/source details (flattened, not nested)
  sourceName?: string | null;
  layerParameter?: string | null;
  statistic?: string | null;

  // Level information (parsed)
  levels?: string | null;
  levelValues: number[]; // Parsed from string
  levelUnits?: string | null;

  // Storage and processing
  stored?: "local" | "cloud" | "postgres" | null;
  inputFile?: string | null;
  keyVariable?: string | null;
  spatialResolution?: string | null;
  engine?: string | null;
  kerchunkPath?: string | null;
  origLocation?: string | null;

  // Timestamps
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ControlPanelProps {
  onShowSettings: () => void;
}

export interface ColorScale {
  min: number;
  max: number;
  colors: string[];
  labels: string[];
}

export interface ChatMessage {
  id: string;
  type: "user" | "bot";
  message: string;
  timestamp: Date;
  sources?: Array<{
    id: string;
    title: string;
    score: number;
  }>;
}

export interface ConversationContextPayload {
  datasetId?: string | null;
  datasetName?: string;
  datasetUnits?: string | null;
  datasetDescription?: string | null;
  datasetStartDate?: string | null;
  datasetEndDate?: string | null;
  selectedDate?: string | null;
  location?: {
    latitude?: number | null;
    longitude?: number | null;
    name?: string | null;
    source?: "marker" | "search" | "region" | "unknown" | null;
  } | null;
}

export interface ChatMessageProps {
  message: ChatMessage;
}

export interface ChatPageProps {
  show: boolean;
  onClose: () => void;
}

export interface GlobePosition {
  latitude: number;
  longitude: number;
  zoom: number;
}

export interface WeatherData {
  lat: number;
  lng: number;
  value: number;
  timestamp: Date;
}

export interface RegionInfoPanelProps {
  show: boolean;
  onClose: () => void;
  latitude?: number;
  longitude?: number;
  regionData?: {
    name?: string;
    precipitation?: number;
    temperature?: number;
    dataset?: string;
    unit?: string;
  };
  colorBarPosition?: { x: number; y: number };
  colorBarCollapsed?: boolean;
  className?: string;
  currentDataset?: Dataset;
  selectedDate?: Date;
  temperatureUnit?: TemperatureUnit;
  colorBarOrientation?: ColorBarOrientation;
}

export interface SettingsIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

export interface SettingsIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

// NEW: Globe settings interface
export interface GlobeSettings {
  satelliteLayerVisible: boolean;
  boundaryLinesVisible: boolean;
  geographicLinesVisible: boolean;
  rasterOpacity: number;
  hideZeroPrecipitation: boolean;
  rasterBlurEnabled: boolean;
  colorbarCustomMin?: number | null;
  colorbarCustomMax?: number | null;
  viewMode?: GlobeViewMode;
}

export interface AppState {
  showSettings: boolean;
  showAbout: boolean;
  showTutorial: boolean;
  showChat: boolean;
  showColorbar: boolean;
  showRegionInfo: boolean;
  regionInfoData: {
    latitude: number;
    longitude: number;
    regionData: RegionData;
  };
  currentLocationMarker?: {
    latitude: number;
    longitude: number;
    name?: string | null;
    source?: "marker" | "search" | "region" | "unknown" | null;
  } | null;
  currentDataset: Dataset | null;
  datasets: Dataset[];
  globePosition: GlobePosition;
  isLoading: boolean;
  error: string | null;
  globeSettings?: GlobeSettings; // NEW
  colorBarOrientation: ColorBarOrientation;
  selectedColorMap?: string | null;
  colorScaleBaselines?: Record<string, ColorScale>;
  selectedColorMapInverse?: boolean;
  locationFocusRequest?: {
    id: number;
    latitude?: number;
    longitude?: number;
    name?: string;
    mode?: "focus" | "clear";
  } | null;
}

export interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
  disabled?: boolean;
  className?: string;
}

// Component Props
export interface HeaderProps {
  currentDataset: Dataset;
  onShowSettings: () => void;
  onShowAbout: () => void;
  onShowChat: () => void;
  onSetDataset: (dataset: Dataset) => void;
  onShowSidebarPanel?: (panel: "datasets" | "history" | "about") => void;
  activeSidebarPanel?: "datasets" | "history" | "about" | null;
}

export interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export interface NavigationIconsProps {
  onShowSettings: () => void;
  onShowAbout: () => void;
  onShowChat: () => void;
  onSetDataset: (dataset: any) => void;
  onShowSidebarPanel?: (panel: "datasets" | "history" | "about") => void;
  activeSidebarPanel?: "datasets" | "history" | "about" | null;
}

export interface CollapsibleSidebarProps {
  onShowSettings: () => void;
  activePanel?: "datasets" | "history" | "about" | null;
  onPanelChange?: (panel: "datasets" | "history" | "about" | null) => void;
}

// UPDATED: GlobeProps with new settings
export interface GlobeProps {
  currentDataset?: Dataset;
  selectedDate?: Date;
  selectedLevel?: number | null;
  colorbarRange?: {
    enabled?: boolean;
    min?: number | null;
    max?: number | null;
  };
  viewMode?: GlobeViewMode;
  position?: { latitude: number; longitude: number; zoom: number };
  onPositionChange?: (pos: {
    latitude: number;
    longitude: number;
    zoom: number;
  }) => void;
  onRegionClick?: (lat: number, lon: number, data: RegionData) => void;
  customDataUrl?: string;
  tileServerUrl?: string;
  // NEW: Globe settings props
  satelliteLayerVisible?: boolean;
  boundaryLinesVisible?: boolean;
  geographicLinesVisible?: boolean;
  rasterOpacity?: number;
  hideZeroPrecipitation?: boolean;
  rasterBlurEnabled?: boolean;
  useMeshRaster?: boolean;
  rasterState: UseRasterLayerResult;
  rasterGridState: UseRasterGridResult;
  // Disable loading overlays during timeline playback
  isPlaying?: boolean;
  prefetchedRasters?:
    | Map<string, RasterLayerData>
    | Record<string, RasterLayerData>;
  prefetchedRasterGrids?:
    | Map<string, RasterGridData>
    | Record<string, RasterGridData>;
  meshFadeDurationMs?: number;
  onRasterMetadataChange?: (
    meta: {
      units?: string | null;
      min?: number | null;
      max?: number | null;
    } | null,
  ) => void;
}

export type GlobeViewMode = "3d" | "ortho" | "2d" | "winkel";

export interface RegionData {
  name: string;
  precipitation?: number;
  temperature?: number;
  dataset: string;
  unit?: string;
}

export interface GlobeRef {
  clearMarker: () => void;
  focusOnLocation: (target: {
    latitude: number;
    longitude: number;
    name?: string;
  }) => void;
  clearSearchMarker: () => void;
}

export type TemperatureUnit = "celsius" | "fahrenheit";
export type ColorBarOrientation = "horizontal" | "vertical";

export type SidebarPanel = "datasets" | "history" | "about" | null;

export interface ColorBarProps {
  show: boolean;
  onToggle: () => void;
  onToggleCollapse?: (collapsed: boolean) => void;
  dataset: Dataset;
  unit?: TemperatureUnit;
  onUnitChange?: (unit: TemperatureUnit) => void;
  onRangeChange?: (range: { min: number | null; max: number | null }) => void;
  onRangeReset?: () => void;
  onPositionChange?: (position: { x: number; y: number }) => void;
  collapsed?: boolean;
  rasterMeta?: {
    units?: string | null;
    min?: number | null;
    max?: number | null;
  } | null;
  orientation?: ColorBarOrientation;
  customRange?: {
    enabled?: boolean;
    min?: number | null;
    max?: number | null;
  };
}

export interface TimeBarProps {
  selectedYear?: number;
  onYearChange?: (year: number) => void;
  onPlayPause?: (isPlaying: boolean) => void;
  className?: string;
}

export interface ChatBotProps {
  show: boolean;
  onClose: () => void;
  onToggle?: () => void;
}

export interface PressureLevel {
  id: string;
  value: number;
  label: string;
  unit: string;
}

export interface PressureLevelsDropdownProps {
  selectedLevel?: PressureLevel;
  onLevelChange?: (level: PressureLevel) => void;
  className?: string;
}

export interface PressureLevelsSelectorProps {
  selectedLevel?: PressureLevel | null;
  onLevelChange?: (level: PressureLevel) => void;
  className?: string;
  levels?: PressureLevel[];
  disabled?: boolean;
  label?: string;
  helperText?: string;
}

export interface YearSelectorProps {
  selectedYear?: number;
  onYearChange?: (year: number) => void;
  className?: string;
}

export interface TutorialSection {
  id: string;
  title: string;
  content: string;
  embedding: number[];
  category?: string;
}

export interface RetrievalResult {
  id: string;
  title: string;
  content: string;
  score: number;
  category?: string;
}

// Base modal props
export interface ModalProps {
  onClose: () => void;
}

export interface AboutModalProps extends ModalProps {
  onShowTutorial: () => void;
}

export interface SettingsModalProps extends ModalProps {}

export interface TutorialModalProps extends ModalProps {}

// NEW: Globe settings panel props
export interface GlobeSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  satelliteLayerVisible: boolean;
  onSatelliteLayerToggle: (visible: boolean) => void;
  boundaryLinesVisible: boolean;
  onBoundaryLinesToggle: (visible: boolean) => void;
  geographicLinesVisible: boolean;
  onGeographicLinesToggle: (visible: boolean) => void;
  rasterOpacity: number;
  onRasterOpacityChange: (opacity: number) => void;
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
}
