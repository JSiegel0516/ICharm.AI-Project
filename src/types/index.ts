import type { HTMLAttributes } from 'react';

export interface Dataset {
  id: string;
  name: string;
  description: string;
  units: string;
  colorScale: ColorScale;
  dataType: 'temperature' | 'precipitation' | 'wind' | 'pressure' | 'humidity';
  temporalResolution: 'hourly' | 'daily' | 'monthly' | 'yearly';
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
  type: 'user' | 'bot';
  message: string;
  timestamp: Date;
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
  };
  colorBarPosition?: { x: number; y: number };
  colorBarCollapsed?: boolean;
  className?: string;
}

export interface SettingsIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}


export interface SettingsIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
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
  globePosition: GlobePosition;
  isLoading: boolean;
  error: string | null;
}

// Component Props
export interface HeaderProps {
  currentDataset: Dataset;
  onShowSettings: () => void;
  onShowAbout: () => void;
  onShowChat: () => void;
  onSetDataset: (dataset: Dataset) => void;
  onShowSidebarPanel?: (panel: 'datasets' | 'history' | 'about') => void;
  activeSidebarPanel?: 'datasets' | 'history' | 'about' | null;
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
  onShowSidebarPanel?: (panel: 'datasets' | 'history' | 'about') => void;
  activeSidebarPanel?: 'datasets' | 'history' | 'about' | null;
}

export interface CollapsibleSidebarProps {
  onShowSettings: () => void;
  activePanel?: 'datasets' | 'history' | 'about' | null;
  onPanelChange?: (panel: 'datasets' | 'history' | 'about' | null) => void;
}

export interface GlobeProps {
  currentDataset: Dataset;
  position?: GlobePosition;
  onPositionChange?: (position: GlobePosition) => void;
  onRegionClick?: (
    latitude: number,
    longitude: number,
    data?: RegionData
  ) => void;
}

export type TemperatureUnit = 'celsius' | 'fahrenheit';

export type SidebarPanel = 'datasets' | 'history' | 'about' | null;

export interface ColorBarProps {
  show: boolean;
  onToggle: () => void;
  dataset: Dataset;
  unit?: TemperatureUnit; // Add unit prop
  onUnitChange?: (unit: TemperatureUnit) => void; // Add unit change handler
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

export interface RegionData {
  name?: string;
  precipitation?: number;
  temperature?: number;
  dataset?: string;
  windSpeed?: number;
  pressure?: number;
  humidity?: number;
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
  };
  colorBarPosition?: { x: number; y: number };
  colorBarCollapsed?: boolean;
  className?: string;
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
