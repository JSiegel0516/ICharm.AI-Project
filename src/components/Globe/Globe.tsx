'use client';

import React, {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
} from 'react';

// Types
interface GlobeProps {
  currentDataset?: { name: string };
  position?: { latitude: number; longitude: number; zoom: number };
  onPositionChange?: (pos: { latitude: number; longitude: number; zoom: number }) => void;
  onRegionClick?: (lat: number, lon: number, data: RegionData) => void;
  customDataUrl?: string; // URL to your self-hosted GeoJSON/custom data
  tileServerUrl?: string; // Optional custom tile server URL
}

interface RegionData {
  name: string;
  precipitation: number;
  temperature: number;
  dataset: string;
}

export interface GlobeRef {
  clearMarker: () => void;
}

// Cesium setup function for CDN loading
const loadCesiumFromCDN = async () => {
  if (window.Cesium) {
    return window.Cesium;
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cesium.com/downloads/cesiumjs/releases/1.95/Build/Cesium/Cesium.js';
    script.async = true;
    
    script.onload = () => {
      const link = document.createElement('link');
      link.href = 'https://cesium.com/downloads/cesiumjs/releases/1.95/Build/Cesium/Widgets/widgets.css';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
      
      window.CESIUM_BASE_URL = 'https://cesium.com/downloads/cesiumjs/releases/1.95/Build/Cesium/';
      resolve(window.Cesium);
    };
    
    script.onerror = () => reject(new Error('Failed to load Cesium'));
    document.head.appendChild(script);
  });
};

const Globe = forwardRef<GlobeRef, GlobeProps>(
  ({ 
    currentDataset, 
    position, 
    onPositionChange, 
    onRegionClick,
    customDataUrl,
    tileServerUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' // Default to OSM
  }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const currentMarkerRef = useRef<any>(null);
    const customDataLayerRef = useRef<any>(null);

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

    // Handle window resize
    useEffect(() => {
      const handleResize = () => {
        if (viewerRef.current && !viewerRef.current.isDestroyed()) {
          viewerRef.current.resize();
          viewerRef.current.forceResize();
        }
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Calculate marker radius based on camera height
    const calculateRadiusFromCameraHeight = (cameraHeight: number): number => {
      const referenceHeight = 10000000;
      const baseRadius = 65000;
      const scaleFactor = Math.sqrt(cameraHeight / referenceHeight);
      const minRadius = 8000;
      const maxRadius = 150000;
      const calculatedRadius = baseRadius * scaleFactor;
      return Math.max(minRadius, Math.min(maxRadius, calculatedRadius));
    };

    // Add click marker
    const addClickMarker = (
      Cesium: any,
      latitude: number,
      longitude: number
    ) => {
      if (!viewerRef.current) return;

      clearMarker();

      const cameraHeight = viewerRef.current.camera.positionCartographic.height;
      const baseRadius = calculateRadiusFromCameraHeight(cameraHeight);

      const markers = [];
      const numRings = 8;
      const ringSpacing = baseRadius * 0.05;

      for (let i = 0; i < numRings; i++) {
        const radius = baseRadius - i * ringSpacing;
        if (radius <= 0) break;

        const circleEntity = viewerRef.current.entities.add({
          position: Cesium.Cartesian3.fromDegrees(
            longitude,
            latitude,
            1000 + i
          ),
          ellipse: {
            semiMajorAxis: radius,
            semiMinorAxis: radius,
            material: Cesium.Color.TRANSPARENT,
            outline: true,
            outlineColor: Cesium.Color.LIME.withAlpha(0.9 - i * 0.1),
            outlineWidth: 3,
            height: 0,
            extrudedHeight: 0,
          },
        });

        markers.push(circleEntity);
      }

      currentMarkerRef.current = markers;
    };

    // Update marker radius on zoom
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

    // Load custom data from your server
    const loadCustomData = async (Cesium: any, viewer: any) => {
      if (!customDataUrl) return;

      try {
        console.log('Loading custom data from:', customDataUrl);
        
        // Load GeoJSON or custom format
        const response = await fetch(customDataUrl);
        const data = await response.json();

        // Remove existing custom data layer if present
        if (customDataLayerRef.current) {
          viewer.dataSources.remove(customDataLayerRef.current);
        }

        // Add GeoJSON data source
        const dataSource = await Cesium.GeoJsonDataSource.load(data, {
          stroke: Cesium.Color.YELLOW,
          fill: Cesium.Color.YELLOW.withAlpha(0.3),
          strokeWidth: 3,
          clampToGround: true,
        });

        viewer.dataSources.add(dataSource);
        customDataLayerRef.current = dataSource;

        console.log('Custom data loaded successfully');
      } catch (error) {
        console.warn('Failed to load custom data:', error);
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
          const Cesium = await loadCesiumFromCDN();

          console.log('Creating self-hosted Cesium viewer...');

          // Create Cesium viewer with minimal UI
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
            imageryProvider: false, // Don't use default imagery
          });

          // Layer 1: USGS imagery as base (satellite/aerial photos)
          const usgsProvider = new Cesium.ArcGisMapServerImageryProvider({
            url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer',
            credit: 'USGS National Map'
          });
          viewer.imageryLayers.addImageryProvider(usgsProvider);

          // Layer 2: Stamen Toner Lines - ONLY borders and boundaries, no labels or roads
          const boundariesProvider = new Cesium.UrlTemplateImageryProvider({
            url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_lines/{z}/{x}/{y}.png',
            credit: '© Stamen Design, © OpenStreetMap contributors',
            alpha: 0.5, // Semi-transparent overlay
            maximumLevel: 18
          });
          viewer.imageryLayers.addImageryProvider(boundariesProvider);

          // Configure globe appearance
          viewer.scene.globe.enableLighting = false;
          viewer.scene.globe.showGroundAtmosphere = true;
          viewer.scene.backgroundColor = Cesium.Color.TRANSPARENT;
          viewer.scene.skyBox.show = true;
          viewer.scene.sun.show = true;
          viewer.scene.moon.show = true;

          // Configure canvas
          viewer.canvas.style.width = '100%';
          viewer.canvas.style.height = '100%';

          // Hide Cesium branding/watermark
          const cesiumCredit = container.querySelector('.cesium-viewer-bottom');
          if (cesiumCredit) {
            (cesiumCredit as HTMLElement).style.display = 'none';
          }

          // Set initial camera position
          viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(0, 20, 25000000),
          });

          // Load custom data if URL provided
          if (customDataUrl) {
            await loadCustomData(Cesium, viewer);
          }

          // Left click handler
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

                addClickMarker(Cesium, latitude, longitude);

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

          // Right click handler (rotate 180°)
          viewer.cesiumWidget.screenSpaceEventHandler.setInputAction(
            (event: any) => {
              const currentPosition = viewer.camera.positionCartographic;
              const currentLat = Cesium.Math.toDegrees(
                currentPosition.latitude
              );
              const currentLon = Cesium.Math.toDegrees(
                currentPosition.longitude
              );
              const currentHeight = currentPosition.height;

              let oppositeLon = currentLon + 180;
              if (oppositeLon > 180) {
                oppositeLon -= 360;
              }

              viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(
                  oppositeLon,
                  currentLat,
                  currentHeight
                ),
                duration: 2.0,
                easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
              });
            },
            Cesium.ScreenSpaceEventType.RIGHT_CLICK
          );

          // Camera change handler
          viewer.camera.changed.addEventListener(() => {
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

          setTimeout(() => {
            viewer.resize();
            viewer.forceResize();
          }, 100);

          viewerRef.current = viewer;
          setIsLoading(false);

          console.log('Self-hosted Cesium viewer initialized successfully');
        } catch (err) {
          console.error('Failed to initialize Cesium:', err);
          setError(
            err instanceof Error ? err.message : 'Failed to initialize globe'
          );
          setIsLoading(false);
        }
      };

      const timer = setTimeout(initViewer, 100);
      return () => clearTimeout(timer);
    }, [onRegionClick, onPositionChange, currentDataset, customDataUrl, tileServerUrl]);

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
          clearMarker();
          if (customDataLayerRef.current) {
            viewerRef.current.dataSources.remove(customDataLayerRef.current);
          }
          viewerRef.current.destroy();
          viewerRef.current = null;
        }
      };
    }, []);

    if (error) {
      return (
        <div className="absolute inset-0 z-0 flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 text-white">
          <div className="text-center">
            <div className="mb-4 text-6xl">🌍</div>
            <h3 className="mb-2 text-lg font-semibold">Failed to Load Globe</h3>
            <p className="mb-2 text-sm text-gray-400">{error}</p>
            <p className="mb-4 text-xs text-gray-500">
              Check your tile server and try again
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
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900 bg-opacity-75">
            <div className="text-center text-white">
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              <p>Loading Self-Hosted Globe...</p>
              <p className="mt-1 text-xs text-gray-400">
                Loading custom data sources
              </p>
            </div>
          </div>
        )}

        <div
          ref={containerRef}
          className="absolute inset-0 z-0 h-screen w-screen"
          style={{
            minHeight: '100vh',
            minWidth: '100vw',
            overflow: 'hidden',
          }}
        />

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