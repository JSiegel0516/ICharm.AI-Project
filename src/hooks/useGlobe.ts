import { useEffect, useRef, useCallback, useState } from 'react';
import * as Cesium from 'cesium';
import { Dataset, GlobePosition, RegionData } from '@/types';

// Configure CesiumJS for self-hosted assets
if (typeof window !== 'undefined') {
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
      zoom: 2000000,
    },
  } = options;

  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<GlobePosition | null>(null);

  // Initialize Cesium viewer
  const initializeViewer = useCallback(
    async (container: HTMLDivElement) => {
      try {
        setIsLoading(true);
        setError(null);

        const viewer = new Cesium.Viewer(container, {
          homeButton: false,
          sceneModePicker: false,
          baseLayerPicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          geocoder: false,
          requestRenderMode: true,
          maximumRenderTimeChange: Infinity,
          terrainProvider: undefined,
        });

        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.atmosphereSaturationShift = 0.0;
        viewer.scene.globe.atmosphereBrightnessShift = 0.0;

        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(
            initialPosition.longitude,
            initialPosition.latitude,
            initialPosition.zoom
          ),
        });

        // Add open imagery layer via OpenStreetMap tiles
        const imageryProvider = new Cesium.OpenStreetMapImageryProvider({
          url: 'https://tile.openstreetmap.org/',
        });
        viewer.imageryLayers.addImageryProvider(imageryProvider);

        viewer.cesiumWidget.screenSpaceEventHandler.setInputAction(
          (click: any) => {
            const pickedPosition = viewer.camera.pickEllipsoid(
              click.position,
              viewer.scene.globe.ellipsoid
            );

            if (pickedPosition && onRegionClick) {
              const cartographic =
                Cesium.Cartographic.fromCartesian(pickedPosition);
              const latitude = Cesium.Math.toDegrees(cartographic.latitude);
              const longitude = Cesium.Math.toDegrees(cartographic.longitude);

              const sampleData: RegionData = {
                name: `Region ${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
                precipitation: Math.random() * 50,
                temperature: -10 + Math.random() * 50,
                dataset: currentDataset?.name || 'Unknown Dataset',
              };

              onRegionClick(latitude, longitude, sampleData);
            }
          },
          Cesium.ScreenSpaceEventType.LEFT_CLICK
        );

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

        if (currentDataset) {
          await updateDatasetInternal(viewer, currentDataset);
        }
      } catch (err) {
        console.error('Failed to initialize Cesium viewer:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to initialize globe'
        );
        setIsLoading(false);
      }
    },
    [initialPosition, onRegionClick, currentDataset]
  );

  const updateDatasetInternal = async (viewer: Cesium.Viewer, dataset: Dataset) => {
    try {
      const layersToRemove: Cesium.ImageryLayer[] = [];
      for (let i = viewer.imageryLayers.length - 1; i > 0; i--) {
        const layer = viewer.imageryLayers.get(i);
        if (layer && (layer as any).isWeatherLayer) {
          layersToRemove.push(layer);
        }
      }
      layersToRemove.forEach((layer) => viewer.imageryLayers.remove(layer));

      let newLayer: Cesium.ImageryLayer | null = null;

      switch (dataset.dataType) {
        case 'temperature':
          console.log('Loading temperature data for:', dataset.name);
          break;
        case 'precipitation':
          console.log('Loading precipitation data for:', dataset.name);
          break;
        case 'wind':
          console.log('Loading wind data for:', dataset.name);
          break;
        default:
          console.log('Loading generic weather data for:', dataset.name);
      }

      if (newLayer) {
        (newLayer as any).isWeatherLayer = true;
      }
    } catch (err) {
      console.error('Failed to update dataset:', err);
      setError(`Failed to load dataset: ${dataset.name}`);
    }
  };

  const updateDataset = useCallback(async (dataset: Dataset) => {
    if (!viewerRef.current) return;
    await updateDatasetInternal(viewerRef.current, dataset);
  }, []);

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

  const resetView = useCallback(() => {
    flyToPosition(initialPosition);
  }, [flyToPosition, initialPosition]);

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
