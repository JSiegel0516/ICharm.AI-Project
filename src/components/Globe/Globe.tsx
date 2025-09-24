'use client';

import React, { useEffect, useRef, useState } from 'react';
import { GlobeProps, RegionData } from '@/types';
import { loadCesiumFromCDN } from '@/utils/cesiumSetup';

const Globe: React.FC<GlobeProps> = ({
  currentDataset,
  position,
  onPositionChange,
  onRegionClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize Cesium viewer
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const initViewer = async () => {
      const container = containerRef.current;
      if (!container) return;

      try {
        setIsLoading(true);
        setError(null);

        console.log('Loading Cesium from CDN...');

        // Load Cesium from CDN
        const Cesium = await loadCesiumFromCDN();

        console.log('Creating Cesium viewer...');

        // Create Cesium viewer with basic configuration
        const viewer = new Cesium.Viewer(container, {
          homeButton: false,
          sceneModePicker: false,
          baseLayerPicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          geocoder: false,
          vrButton: false,
          infoBox: false,
          selectionIndicator: false,
        });

        // Configure globe appearance
        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.showGroundAtmosphere = true;

        // Set background color
        viewer.scene.backgroundColor =
          Cesium.Color.fromCssColorString('#1a1a1a');

        // Set initial camera position
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(0, 20, 15000000),
        });

        // Add click handler
        viewer.cesiumWidget.screenSpaceEventHandler.setInputAction(
          (event: any) => {
            const pickedPosition = viewer.camera.pickEllipsoid(
              event.position,
              viewer.scene.globe.ellipsoid
            );
            if (pickedPosition && onRegionClick) {
              const cartographic =
                Cesium.Cartographic.fromCartesian(pickedPosition);
              const latitude = Cesium.Math.toDegrees(cartographic.latitude);
              const longitude = Cesium.Math.toDegrees(cartographic.longitude);

              const regionData: RegionData = {
                name: `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`,
                precipitation: Math.random() * 100,
                temperature: -20 + Math.random() * 60,
                dataset: currentDataset?.name || 'Sample Dataset',
              };

              onRegionClick(latitude, longitude, regionData);
            }
          },
          Cesium.ScreenSpaceEventType.LEFT_CLICK
        );

        // Add camera change handler
        viewer.camera.changed.addEventListener(() => {
          if (onPositionChange) {
            const center = viewer.camera.positionCartographic;
            if (center) {
              onPositionChange({
                latitude: Cesium.Math.toDegrees(center.latitude),
                longitude: Cesium.Math.toDegrees(center.longitude),
                zoom: center.height,
              });
            }
          }
        });

        viewerRef.current = viewer;
        setIsLoading(false);

        console.log('Cesium viewer initialized successfully');
      } catch (err) {
        console.error('Failed to initialize Cesium:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to initialize globe'
        );
        setIsLoading(false);
      }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(initViewer, 100);
    return () => clearTimeout(timer);
  }, [onRegionClick, onPositionChange, currentDataset]);

  // Handle position changes
  useEffect(() => {
    if (position && viewerRef.current && window.Cesium) {
      const Cesium = window.Cesium;
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          position.longitude,
          position.latitude,
          position.zoom
        ),
        duration: 1.5,
      });
    }
  }, [position]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  // Loading and error states
  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="mb-4 text-6xl">🌍</div>
          <h3 className="mb-2 text-lg font-semibold">Failed to Load Globe</h3>
          <p className="mb-2 text-sm text-gray-400">{error}</p>
          <p className="mb-4 text-xs text-gray-500">
            Check your internet connection and try again
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen">
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900 bg-opacity-75">
          <div className="text-center text-white">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
            <p>Loading Globe from CDN...</p>
            <p className="mt-1 text-xs text-gray-400">
              This may take a moment on first load
            </p>
          </div>
        </div>
      )}

      {/* Cesium container */}
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ minHeight: '400px' }}
      />

      {/* Dataset info overlay */}
      {currentDataset && (
        <div className="absolute bottom-4 left-4 z-20">
          <div className="rounded-lg bg-black bg-opacity-70 px-3 py-2 text-xs text-white">
            <div className="font-semibold">{currentDataset.name}</div>
            <div className="opacity-75">{currentDataset.units}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Globe;
