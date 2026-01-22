import { buildColorStops, mapValueToRgba } from "./colorMapping";

type RasterImageOptions = {
  lat: Float64Array;
  lon: Float64Array;
  values: Float32Array;
  mask?: Uint8Array;
  min: number;
  max: number;
  colors: string[];
  opacity?: number;
};

export const buildRasterImage = ({
  lat,
  lon,
  values,
  mask,
  min,
  max,
  colors,
  opacity = 1,
}: RasterImageOptions): {
  dataUrl: string;
  rectangle: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
} | null => {
  const rows = lat.length;
  const cols = lon.length;
  if (!rows || !cols || !values.length) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  const imageData = ctx.createImageData(cols, rows);
  const out = imageData.data;
  const stops = buildColorStops(colors);

  for (let r = 0; r < rows; r += 1) {
    const flippedRow = rows - 1 - r;
    for (let c = 0; c < cols; c += 1) {
      const idx = r * cols + c;
      const outIdx = (flippedRow * cols + c) * 4;
      if (mask && mask[idx] === 0) {
        out[outIdx + 3] = 0;
        continue;
      }
      const value = values[idx];
      if (!Number.isFinite(value)) {
        out[outIdx + 3] = 0;
        continue;
      }
      const rgba = mapValueToRgba(value, min, max, stops);
      out[outIdx] = rgba[0];
      out[outIdx + 1] = rgba[1];
      out[outIdx + 2] = rgba[2];
      out[outIdx + 3] = Math.round(rgba[3] * opacity);
    }
  }

  ctx.putImageData(imageData, 0, 0);

  let west = lon[0];
  let east = lon[0];
  for (let i = 1; i < lon.length; i += 1) {
    if (lon[i] < west) west = lon[i];
    if (lon[i] > east) east = lon[i];
  }
  let south = lat[0];
  let north = lat[0];
  for (let i = 1; i < lat.length; i += 1) {
    if (lat[i] < south) south = lat[i];
    if (lat[i] > north) north = lat[i];
  }

  return {
    dataUrl: canvas.toDataURL("image/png"),
    rectangle: { west, east, south, north },
  };
};
