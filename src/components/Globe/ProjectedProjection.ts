import type { GeoProjection } from "d3-geo";
import type { MapOrientation } from "@/types";

const DEFAULT_PRECISION = 0.1;
const SPHERE = { type: "Sphere" } as const;

type ProjectionFactory = () => GeoProjection;

export class ProjectedProjection {
  projection: GeoProjection;
  width: number;
  height: number;
  baseScale: number;

  constructor(
    width: number,
    height: number,
    createProjection: ProjectionFactory,
  ) {
    this.width = width;
    this.height = height;
    this.baseScale = 1;
    this.projection = createProjection().precision(DEFAULT_PRECISION);
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

  getOrientation(): MapOrientation {
    return {
      rotate: this.projection.rotate() as [number, number, number],
      scale: this.projection.scale(),
      baseScale: this.baseScale,
    };
  }

  setOrientation(orientation: MapOrientation) {
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
