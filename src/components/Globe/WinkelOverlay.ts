import type { GeoProjection } from "d3-geo";
import type { RasterGridData } from "@/hooks/useRasterGrid";
import { buildColorStops, mapValueToRgba } from "@/lib/mesh/colorMapping";

type Rgba = [number, number, number, number];

const VERTEX_COLOR_GAIN = 1.2;

export class WinkelOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private projection: GeoProjection;

  constructor(projection: GeoProjection, width: number, height: number) {
    this.projection = projection;
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    const context = this.canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to initialize overlay canvas");
    }
    this.ctx = context;
  }

  setSize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  getCanvas() {
    return this.canvas;
  }

  render(options: {
    gridData: RasterGridData;
    colors: string[];
    hideZeroValues: boolean;
    smoothGridBoxValues: boolean;
    opacity: number;
  }) {
    const { gridData, colors, hideZeroValues, opacity } = options;
    this.ctx.imageSmoothingEnabled = options.smoothGridBoxValues;
    const rows = gridData.lat.length;
    const cols = gridData.lon.length;
    if (!rows || !cols || gridData.values.length < rows * cols) {
      return;
    }
    const min = gridData.min ?? 0;
    const max = gridData.max ?? 1;
    const stops = buildColorStops(colors);
    const imageData = this.ctx.createImageData(
      this.canvas.width,
      this.canvas.height,
    );
    const data = imageData.data;
    const values = gridData.values;
    const mask = gridData.mask;

    for (let row = 0; row < rows; row += 1) {
      const lat = gridData.lat[row];
      for (let col = 0; col < cols; col += 1) {
        const idx = row * cols + col;
        if (mask && mask[idx] === 0) continue;
        const baseValue = values[idx];
        const value =
          options.smoothGridBoxValues && gridData.sampleValue
            ? gridData.sampleValue(lat, gridData.lon[col])
            : baseValue;
        if (hideZeroValues && value === 0) continue;

        const coords = this.projection([gridData.lon[col], lat]);
        if (!coords) continue;
        const x = Math.round(coords[0]);
        const y = Math.round(coords[1]);
        if (
          x < 0 ||
          y < 0 ||
          x >= this.canvas.width ||
          y >= this.canvas.height
        ) {
          continue;
        }

        const rgba: Rgba =
          value == null || Number.isNaN(value)
            ? [0, 0, 0, 0]
            : mapValueToRgba(value, min, max, stops);
        const alpha = Math.round(rgba[3] * opacity);
        const base = (y * this.canvas.width + x) * 4;
        data[base] = Math.min(255, Math.round(rgba[0] * VERTEX_COLOR_GAIN));
        data[base + 1] = Math.min(255, Math.round(rgba[1] * VERTEX_COLOR_GAIN));
        data[base + 2] = Math.min(255, Math.round(rgba[2] * VERTEX_COLOR_GAIN));
        data[base + 3] = Math.min(255, alpha);
      }
    }

    this.ctx.putImageData(imageData, 0, 0);
  }
}
