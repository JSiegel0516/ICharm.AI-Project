import type { HTMLAttributes } from "react";

export interface DatasetBackendDetails {
  id?: string | null;
  slug?: string | null;
  sourceName: string | null;
  datasetName: string;
  layerParameter: string | null;
  statistic: string | null;
  datasetType: string | null;
  levels: string | null;
  levelValues: number[];
  levelUnits: string | null;
  stored: "local" | "cloud" | null;
  inputFile: string | null;
  keyVariable: string | null;
  units: string | null;
  spatialResolution: string | null;
  engine: string | null;
  kerchunkPath: string | null;
  origLocation: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface Dataset {
  id: string;
  backendId?: string | null;
  backendSlug?: string | null;
  name: string;
  description: string;
  units: string;
  colorScale: ColorScale;
  dataType: "temperature" | "precipitation" | "wind" | "pressure" | "humidity";
  temporalResolution: "hourly" | "daily" | "monthly" | "yearly";
  backend?: DatasetBackendDetails;
  startDate: Date;
  endDate: Date;
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
  rasterOpacity: number;
}

export interface AppState {
  showSettings: boolean;
  showAbout: boolean;
  showTutorial: boolean;
  showChat: boolean;
  showColorbar: boolean;
  showRegionInfo: boolean;
  regionInfoData?: {
    latitude: number;
    longitude: number;
    regionData: RegionData;
  };
  currentDataset: Dataset;
  datasets: Dataset[];
  globePosition: GlobePosition;
  isLoading: boolean;
  error: string | null;
  globeSettings?: GlobeSettings; // NEW
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
  rasterOpacity?: number;
}

export interface RegionData {
  name: string;
  precipitation: number;
  temperature: number;
  dataset: string;
  unit?: string;
}

export interface GlobeRef {
  clearMarker: () => void;
}

export type TemperatureUnit = "celsius" | "fahrenheit";

export type SidebarPanel = "datasets" | "history" | "about" | null;

export interface ColorBarProps {
  show: boolean;
  onToggle: () => void;
  dataset: Dataset;
  unit?: TemperatureUnit;
  onUnitChange?: (unit: TemperatureUnit) => void;
  onPositionChange?: (position: { x: number; y: number }) => void;
  collapsed?: boolean;
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
  selectedLevel?: PressureLevel;
  onLevelChange?: (level: PressureLevel) => void;
  className?: string;
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
  rasterOpacity: number;
  onRasterOpacityChange: (opacity: number) => void;
}
