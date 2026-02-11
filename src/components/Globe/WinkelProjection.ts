import { geoWinkel3 } from "d3-geo-projection";
import type { GeoProjection } from "d3-geo";
import type { WinkelOrientation } from "@/types";

const DEFAULT_PRECISION = 0.1;
const DEFAULT_SCALE_FACTOR = 0.45;
const DEFAULT_ROTATE: [number, number, number] = [0, 0, 0];

export class WinkelProjection {
  projection: GeoProjection;
  width: number;
  height: number;
  baseScale: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.baseScale = Math.max(
      1,
      Math.min(width, height) * DEFAULT_SCALE_FACTOR,
    );
    this.projection = geoWinkel3()
      .scale(this.baseScale)
      .translate([width / 2, height / 2])
      .precision(DEFAULT_PRECISION)
      .rotate(DEFAULT_ROTATE);
  }

  setSize(width: number, height: number, resetScale = false) {
    this.width = width;
    this.height = height;
    this.baseScale = Math.max(
      1,
      Math.min(width, height) * DEFAULT_SCALE_FACTOR,
    );
    this.projection.translate([width / 2, height / 2]);
    if (resetScale) {
      this.projection.scale(this.baseScale);
    }
  }

  createManipulator(startMouse: [number, number], startScale: number) {
    const startRotate = this.projection.rotate() as [number, number, number];
    return {
      move: (mouse: [number, number]) => {
        const dx = mouse[0] - startMouse[0];
        const dy = mouse[1] - startMouse[1];
        const sensitivity = 0.25;
        this.projection.rotate([
          startRotate[0] + dx * sensitivity,
          startRotate[1] - dy * sensitivity,
          startRotate[2],
        ]);
        this.projection.scale(startScale);
      },
    };
  }

  getOrientation(): WinkelOrientation {
    return {
      rotate: this.projection.rotate() as [number, number, number],
      scale: this.projection.scale(),
    };
  }

  setOrientation(orientation: WinkelOrientation) {
    this.projection
      .rotate(orientation.rotate)
      .scale(orientation.scale ?? this.baseScale);
  }
}
