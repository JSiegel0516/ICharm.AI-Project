import { geoWinkel3 } from "d3-geo-projection";
import type { GeoProjection } from "d3-geo";
import type { WinkelOrientation } from "@/types";

const DEFAULT_PRECISION = 0.1;
const DEFAULT_ROTATE: [number, number, number] = [0, 0, 0];
const SPHERE = { type: "Sphere" } as const;

export class WinkelProjection {
  projection: GeoProjection;
  width: number;
  height: number;
  baseScale: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.baseScale = 1;
    this.projection = geoWinkel3()
      .precision(DEFAULT_PRECISION)
      .rotate(DEFAULT_ROTATE);
    this.projection.fitSize([width, height], SPHERE);
    this.baseScale = this.projection.scale();
  }

  setSize(width: number, height: number, resetScale = false) {
    this.width = width;
    this.height = height;
    const prevBaseScale = this.baseScale;
    const prevScale = this.projection.scale();
    this.projection.fitSize([width, height], SPHERE);
    this.baseScale = this.projection.scale();
    if (!resetScale && prevBaseScale > 0 && Number.isFinite(prevScale)) {
      const factor = prevScale / prevBaseScale;
      if (Number.isFinite(factor) && factor > 0) {
        this.projection.scale(this.baseScale * factor);
      }
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
      baseScale: this.baseScale,
    };
  }

  setOrientation(orientation: WinkelOrientation) {
    const targetScale = (() => {
      if (
        orientation.baseScale &&
        Number.isFinite(orientation.baseScale) &&
        orientation.baseScale > 0
      ) {
        const factor = orientation.scale / orientation.baseScale;
        if (Number.isFinite(factor) && factor > 0) {
          return this.baseScale * factor;
        }
      }
      return orientation.scale ?? this.baseScale;
    })();
    this.projection.rotate(orientation.rotate).scale(targetScale);
  }
}
