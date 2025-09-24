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

  // Handle window resize to ensure proper scaling
  useEffect(() => {
    const handleResize = () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        // Force Cesium to recalculate canvas dimensions
        viewerRef.current.resize();
        viewerRef.current.forceResize();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

        // Configure globe appearance for responsive background
        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.showGroundAtmosphere = true;

        // Set background to transparent so container background shows through
        viewer.scene.backgroundColor = Cesium.Color.TRANSPARENT;

        // Enable skybox for better visual appearance
        viewer.scene.skyBox.show = false;
        viewer.scene.sun.show = false;
        viewer.scene.moon.show = false;

        // Configure canvas to be responsive
        viewer.canvas.style.width = '100%';
        viewer.canvas.style.height = '100%';

        // Set initial camera position
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(0, 20, 25000000),
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

        // Ensure proper sizing after initialization
        setTimeout(() => {
          viewer.resize();
          viewer.forceResize();
        }, 100);

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
      <div className="absolute inset-0 z-0 flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 text-white">
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
    <div
      className="absolute inset-0 z-0 h-full w-full bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900"
      style={{
        background:
          'radial-gradient(ellipse at center, #1e3a8a 0%, #0f172a 50%, #000000 100%)',
        minHeight: '100vh',
        minWidth: '100vw',
      }}
    >
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900 bg-opacity-75">
          <div className="text-center text-white">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
            <p>Loading Globe from CDN...</p>
            <p className="mt-1 text-xs text-gray-400">
              This may take a moment on first load
            </p>
          </div>
        </div>
      )}

      {/* Cesium container - positioned to fill entire viewport but stay behind other elements */}
      <div
        ref={containerRef}
        className="absolute inset-0 z-0 h-full w-full"
        style={{
          minHeight: '100vh',
          minWidth: '100vw',
          overflow: 'hidden',
        }}
      />

      {/* Dataset info overlay - higher z-index to appear above globe */}
      {currentDataset && (
        <div className="absolute inset-x-0 z-30 mx-auto max-w-max">
          <div className="rounded-lg bg-black bg-opacity-70 py-6 text-2xl text-gray-400 backdrop-blur-sm">
            <div className="font-semibold">{currentDataset.name}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Globe;
