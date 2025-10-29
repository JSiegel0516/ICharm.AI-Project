import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';

interface GlobeSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  // Layer visibility controls
  satelliteLayerVisible: boolean;
  onSatelliteLayerToggle: (visible: boolean) => void;
  boundaryLinesVisible: boolean;
  onBoundaryLinesToggle: (visible: boolean) => void;
  // Raster opacity control
  rasterOpacity: number;
  onRasterOpacityChange: (opacity: number) => void;
}

export function GlobeSettingsPanel({
  isOpen,
  onClose,
  satelliteLayerVisible,
  onSatelliteLayerToggle,
  boundaryLinesVisible,
  onBoundaryLinesToggle,
  rasterOpacity,
  onRasterOpacityChange,
}: GlobeSettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Click-outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -100, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="pointer-events-auto fixed top-1/2 left-4 z-9999 w-96 -translate-y-1/2"
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Globe Settings</CardTitle>
              <CardDescription>
                Customize globe appearance and layers
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {/* Layer Manipulation Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white">Layer Visibility</h3>
                
                {/* Satellite Layer Toggle */}
                <div className="flex items-center justify-between rounded-lg border border-neutral-600 bg-neutral-700/50 p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="satellite-toggle" className="text-sm font-medium text-white cursor-pointer">
                      Satellite Imagery
                    </Label>
                    <p className="text-xs text-slate-400">
                      Show/hide satellite base layer
                    </p>
                  </div>
                  <Switch
                    id="satellite-toggle"
                    checked={satelliteLayerVisible}
                    onCheckedChange={onSatelliteLayerToggle}
                    className="data-[state=checked]:bg-rose-500"
                  />
                </div>

                {/* Boundary Lines Toggle */}
                <div className="flex items-center justify-between rounded-lg border border-neutral-600 bg-neutral-700/50 p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="boundary-toggle" className="text-sm font-medium text-white cursor-pointer">
                      Boundary Lines
                    </Label>
                    <p className="text-xs text-slate-400">
                      Show/hide coastlines, rivers, and lakes
                    </p>
                  </div>
                  <Switch
                    id="boundary-toggle"
                    checked={boundaryLinesVisible}
                    onCheckedChange={onBoundaryLinesToggle}
                    className="data-[state=checked]:bg-rose-500"
                  />
                </div>
              </div>

              {/* Raster Opacity Section */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="raster-opacity" className="text-sm font-semibold text-white">
                      Raster Opacity
                    </Label>
                    <span className="text-sm font-medium text-slate-400">
                      {Math.round(rasterOpacity * 100)}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Adjust transparency of the climate data layer
                  </p>
                </div>

                <div className="rounded-lg border border-neutral-600 bg-neutral-700/50 p-4">
                  <Slider
                    id="raster-opacity"
                    min={0}
                    max={1}
                    step={0.05}
                    value={[rasterOpacity]}
                    onValueChange={([value]) => onRasterOpacityChange(value)}
                    className="w-full"
                  />
                  <div className="mt-2 flex justify-between text-xs text-slate-500">
                    <span>Transparent</span>
                    <span>Opaque</span>
                  </div>
                </div>
              </div>

              {/* Info Section */}
              <div className="rounded-lg border border-blue-500/30 bg-blue-900/20 p-3">
                <p className="text-xs text-blue-200">
                  <strong>Tip:</strong> Disable satellite imagery to see pure climate data, 
                  or adjust opacity to blend data with terrain features.
                </p>
              </div>
            </CardContent>

            <div className="border-t border-slate-700 p-4">
              <Button
                onClick={onClose}
                className="w-full bg-rose-500 text-white hover:bg-rose-600"
              >
                Done
              </Button>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
export { Switch };