import { useEffect, useRef, useCallback, useState } from 'react';
import * as Cesium from 'cesium';
import { Dataset, GlobePosition, RegionData } from '@/types';

// Configure CesiumJS
if (typeof window !== 'undefined') {
  // Set the access token
  Cesium.Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ACCESS_TOKEN || 
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIxY2I4YmViYi0zZTk4LTRjMGEtYThkZi0zYzU5ZWM0ODQ3OTEiLCJpZCI6MzQyNjc5LCJpYXQiOjE3NTgyMzkzNTR9.UEhf6smCV5FVMBolNxzmgkjYFraxf8TPnppDdJ6TmuY";
  
  // Set base URL for Cesium assets
  (window as any).CESIUM_BASE_URL = '/cesium/';
}

interface UseGlobeOptions {
  onRegionClick?: (latitude: number, longitude: number, data?: RegionData) => void;
  currentDataset?: Dataset;
  initialPosition?: GlobePosition;
}

interface UseGlobeReturn {
  viewerRef: React.RefObject<Cesium.Viewer | null>;
  isLoading: boolean;
  error: string | null;
  position: GlobePosition | null;
  updateDataset: (dataset: Dataset) => Promise<void>;
  flyToPosition: (position: GlobePosition) => void;
  resetView: () => void;
}

export const useGlobe = (options: UseGlobeOptions = {}): UseGlobeReturn => {
  const {
    onRegionClick,
    currentDataset,
    initialPosition = {
      latitude: 0,
      longitude: 0,
      zoom: 2000000
    }
  } = options;

  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<GlobePosition | null>(null);

  // Initialize Cesium viewer
  const initializeViewer = useCallback(async (container: HTMLDivElement) => {
    try {
      setIsLoading(true);
      setError(null);

      // Create viewer with optimized settings for weather data visualization
      const viewer = new Cesium.Viewer(container, {
        // UI controls
        homeButton: false,
        sceneModePicker: false,
        baseLayerPicker: false,
        navigationHelpButton: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        geocoder: false,
        
        // Performance optimizations
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
        
        // Terrain and imagery
        terrainProvider: undefined, // Use default ellipsoid for performance
      });

      // Configure scene for better weather visualization
      viewer.scene.globe.enableLighting = false;
      viewer.scene.globe.atmosphereSaturationShift = 0.0;
      viewer.scene.globe.atmosphereBrightnessShift = 0.0;
      
      // Set initial camera position
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          initialPosition.longitude,
          initialPosition.latitude,
          initialPosition.zoom
        ),
      });

      // Add base imagery layer
      const imageryLayer = viewer.imageryLayers.addImageryProvider(
        await Cesium.IonImageryProvider.fromAssetId(3) // Cesium World Imagery
      );

      // Set up click handler for region selection
      viewer.cesiumWidget.screenSpaceEventHandler.setInputAction((click: any) => {
        const pickedPosition = viewer.camera.pickEllipsoid(
          click.position,
          viewer.scene.globe.ellipsoid
        );
        
        if (pickedPosition && onRegionClick) {
          const cartographic = Cesium.Cartographic.fromCartesian(pickedPosition);
          const latitude = Cesium.Math.toDegrees(cartographic.latitude);
          const longitude = Cesium.Math.toDegrees(cartographic.longitude);
          
          // Generate sample data based on coordinates
          const sampleData: RegionData = {
            name: `Region ${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
            precipitation: Math.random() * 50,
            temperature: -10 + Math.random() * 50,
            dataset: currentDataset?.name || 'Unknown Dataset',
          };
          
          onRegionClick(latitude, longitude, sampleData);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      // Set up camera change handler to track position
      viewer.camera.changed.addEventListener(() => {
        const center = viewer.camera.positionCartographic;
        if (center) {
          setPosition({
            latitude: Cesium.Math.toDegrees(center.latitude),
            longitude: Cesium.Math.toDegrees(center.longitude),
            zoom: center.height,
          });
        }
      });

      viewerRef.current = viewer;
      setIsLoading(false);

      // Load initial dataset if provided
      if (currentDataset) {
        await updateDatasetInternal(viewer, currentDataset);
      }

    } catch (err) {
      console.error('Failed to initialize Cesium viewer:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize globe');
      setIsLoading(false);
    }
  }, [initialPosition, onRegionClick, currentDataset]);

  // Update dataset visualization
  const updateDatasetInternal = async (viewer: Cesium.Viewer, dataset: Dataset) => {
    try {
      // Remove existing weather data layers (keep base imagery)
      const layersToRemove = [];
      for (let i = viewer.imageryLayers.length - 1; i > 0; i--) {
        const layer = viewer.imageryLayers.get(i);
        if (layer && (layer as any).isWeatherLayer) {
          layersToRemove.push(layer);
        }
      }
      layersToRemove.forEach(layer => viewer.imageryLayers.remove(layer));

      // Add new dataset layer based on type
      let newLayer: Cesium.ImageryLayer | null = null;
      
      switch (dataset.dataType) {
        case 'temperature':
          // Example: Add temperature data layer
          // In a real implementation, you'd load actual weather data
          console.log('Loading temperature data for:', dataset.name);
          break;
          
        case 'precipitation':
          // Example: Add precipitation data layer
          console.log('Loading precipitation data for:', dataset.name);
          break;
          
        case 'wind':
          // Example: Add wind data layer
          console.log('Loading wind data for:', dataset.name);
          break;
          
        default:
          console.log('Loading generic weather data for:', dataset.name);
      }

      // Mark the layer as a weather layer for easy removal later
      if (newLayer) {
        (newLayer as any).isWeatherLayer = true;
      }

    } catch (err) {
      console.error('Failed to update dataset:', err);
      setError(`Failed to load dataset: ${dataset.name}`);
    }
  };

  // External API for updating dataset
  const updateDataset = useCallback(async (dataset: Dataset) => {
    if (!viewerRef.current) return;
    await updateDatasetInternal(viewerRef.current, dataset);
  }, []);

  // Fly to specific position
  const flyToPosition = useCallback((newPosition: GlobePosition) => {
    if (!viewerRef.current) return;
    
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        newPosition.longitude,
        newPosition.latitude,
        newPosition.zoom
      ),
      duration: 2.0,
    });
  }, []);

  // Reset to initial view
  const resetView = useCallback(() => {
    flyToPosition(initialPosition);
  }, [flyToPosition, initialPosition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
      }
    };
  }, []);

  return {
    viewerRef,
    isLoading,
    error,
    position,
    updateDataset,
    flyToPosition,
    resetView,
  };
};