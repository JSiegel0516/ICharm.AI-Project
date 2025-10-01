'use client';

import React, {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { GlobeProps, RegionData } from '@/types';
import { loadCesiumFromCDN } from '@/utils/cesiumSetup';

// Add ref type for exposing methods
export interface GlobeRef {
  clearMarker: () => void;
}

const Globe = forwardRef<GlobeRef, GlobeProps>(
  ({ currentDataset, position, onPositionChange, onRegionClick }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Store reference to the current click marker (only one at a time)
    const currentMarkerRef = useRef<any>(null);

    // Function to clear the marker
    const clearMarker = () => {
      if (
        currentMarkerRef.current &&
        viewerRef.current &&
        !viewerRef.current.isDestroyed()
      ) {
        if (Array.isArray(currentMarkerRef.current)) {
          currentMarkerRef.current.forEach((marker) =>
            viewerRef.current.entities.remove(marker)
          );
        } else {
          viewerRef.current.entities.remove(currentMarkerRef.current);
        }
        currentMarkerRef.current = null;
      }
    };

    // Expose clearMarker method to parent via ref
    useImperativeHandle(ref, () => ({
      clearMarker,
    }));

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

    // Function to calculate appropriate radius based on camera height
    const calculateRadiusFromCameraHeight = (cameraHeight: number): number => {
      // Base radius at reference height (adjust these values to fine-tune scaling)
      const referenceHeight = 10000000; // 10,000 km reference height
      const baseRadius = 65000; // 65 km base radius - user's preferred size

      // Calculate scale factor based on camera height
      // Use square root to make scaling more gradual
      const scaleFactor = Math.sqrt(cameraHeight / referenceHeight);

      // Apply min/max bounds to prevent circles from being too small or large
      const minRadius = 8000; // 8 km minimum - very tight when zoomed in
      const maxRadius = 150000; // 150 km maximum - reasonable when zoomed out

      const calculatedRadius = baseRadius * scaleFactor;
      return Math.max(minRadius, Math.min(maxRadius, calculatedRadius));
    };

    // Function to add a circle marker at the clicked position (thick ring with hole using multiple outlines)
    const addClickMarker = (
      Cesium: any,
      latitude: number,
      longitude: number
    ) => {
      if (!viewerRef.current) return;

      // Remove existing markers if they exist
      clearMarker();

      // Get current camera height for scaling
      const cameraHeight = viewerRef.current.camera.positionCartographic.height;
      const baseRadius = calculateRadiusFromCameraHeight(cameraHeight);

      // Create multiple concentric circles to simulate thickness
      const markers = [];
      const numRings = 8; // Number of concentric circles for thickness
      const ringSpacing = baseRadius * 0.05; // 5% spacing between rings

      for (let i = 0; i < numRings; i++) {
        const radius = baseRadius - i * ringSpacing;
        if (radius <= 0) break;

        const circleEntity = viewerRef.current.entities.add({
          position: Cesium.Cartesian3.fromDegrees(
            longitude,
            latitude,
            1000 + i
          ), // Slight height variation
          ellipse: {
            semiMajorAxis: radius,
            semiMinorAxis: radius,
            material: Cesium.Color.TRANSPARENT, // Transparent fill to create hole
            outline: true,
            outlineColor: Cesium.Color.LIME.withAlpha(0.9 - i * 0.1), // Slightly fade outer rings
            outlineWidth: 3, // Thicker individual outlines
            height: 0,
            extrudedHeight: 0,
          },
        });

        markers.push(circleEntity);
      }

      // Store reference to all markers
      currentMarkerRef.current = markers;
    };

    // Function to update existing marker radius when camera changes
    const updateMarkerRadius = (Cesium: any) => {
      if (!currentMarkerRef.current || !viewerRef.current) return;

      const cameraHeight = viewerRef.current.camera.positionCartographic.height;
      const baseRadius = calculateRadiusFromCameraHeight(cameraHeight);
      const ringSpacing = baseRadius * 0.05;

      if (Array.isArray(currentMarkerRef.current)) {
        currentMarkerRef.current.forEach((marker, i) => {
          const radius = baseRadius - i * ringSpacing;
          if (radius > 0) {
            marker.ellipse.semiMajorAxis = radius;
            marker.ellipse.semiMinorAxis = radius;
          }
        });
      }
    };

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

          // Add Cesium Ion imagery layer with asset ID 2411391
          try {
            const layer = viewer.imageryLayers.addImageryProvider(
              await Cesium.IonImageryProvider.fromAssetId(2411391)
            );
            console.log('Cesium Ion imagery layer added successfully');
          } catch (ionError) {
            console.warn('Failed to load Cesium Ion imagery:', ionError);
            // Viewer will fall back to default imagery
          }

          // Configure globe appearance for responsive background
          viewer.scene.globe.enableLighting = false;
          viewer.scene.globe.showGroundAtmosphere = true;

          // Set background to transparent so container background shows through
          viewer.scene.backgroundColor = Cesium.Color.TRANSPARENT;

          // Enable skybox for better visual appearance
          viewer.scene.skyBox.show = true;
          viewer.scene.sun.show = true;
          viewer.scene.moon.show = true;

          // Configure canvas to be responsive
          viewer.canvas.style.width = '100%';
          viewer.canvas.style.height = '100%';

          // Set initial camera position
          viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(0, 20, 25000000),
          });

          // Add click handlers for left and right clicks
          viewer.cesiumWidget.screenSpaceEventHandler.setInputAction(
            (event: any) => {
              const pickedPosition = viewer.camera.pickEllipsoid(
                event.position,
                viewer.scene.globe.ellipsoid
              );
              if (pickedPosition) {
                const cartographic =
                  Cesium.Cartographic.fromCartesian(pickedPosition);
                const latitude = Cesium.Math.toDegrees(cartographic.latitude);
                const longitude = Cesium.Math.toDegrees(cartographic.longitude);

                // Add the circle marker at clicked position
                addClickMarker(Cesium, latitude, longitude);

                // Call the original callback if provided
                if (onRegionClick) {
                  const regionData: RegionData = {
                    name: `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`,
                    precipitation: Math.random() * 100,
                    temperature: -20 + Math.random() * 60,
                    dataset: currentDataset?.name || 'Sample Dataset',
                  };

                  onRegionClick(latitude, longitude, regionData);
                }
              }
            },
            Cesium.ScreenSpaceEventType.LEFT_CLICK
          );

          // Add right-click handler for 180-degree globe rotation
          viewer.cesiumWidget.screenSpaceEventHandler.setInputAction(
            (event: any) => {
              // Get current camera position
              const currentPosition = viewer.camera.positionCartographic;
              const currentLat = Cesium.Math.toDegrees(
                currentPosition.latitude
              );
              const currentLon = Cesium.Math.toDegrees(
                currentPosition.longitude
              );
              const currentHeight = currentPosition.height;

              // Calculate opposite longitude (add/subtract 180 degrees)
              let oppositeLon = currentLon + 180;
              if (oppositeLon > 180) {
                oppositeLon -= 360;
              }

              // Fly to the opposite side with smooth animation
              viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(
                  oppositeLon,
                  currentLat,
                  currentHeight
                ),
                duration: 2.0, // 2 second animation
                easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
              });
            },
            Cesium.ScreenSpaceEventType.RIGHT_CLICK
          );

          // Add camera change handler with radius updating
          viewer.camera.changed.addEventListener(() => {
            // Update marker radius when camera changes (zoom)
            if (window.Cesium) {
              updateMarkerRadius(window.Cesium);
            }

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
          // Clean up current markers
          clearMarker();
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
        className="absolute inset-0 z-0 h-full w-full"
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
          className="absolute inset-0 z-0 h-screen w-screen"
          style={{
            minHeight: '100vh',
            minWidth: '100vw',
            overflow: 'hidden',
          }}
        />

        {/* Dataset info overlay - higher z-index to appear above globe */}
        {currentDataset && (
          <div className="absolute inset-x-0 z-30 mx-auto max-w-max">
            <div className="rounded-lg py-6 text-2xl text-gray-300">
              <div className="font-semibold" id="dataset-title">
                {currentDataset.name}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

Globe.displayName = 'Globe';

export default Globe;
