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
  colorGain?: number;
};

type RasterImageFromMeshOptions = {
  lat: Float64Array;
  lon: Float64Array;
  rows: number;
  cols: number;
  flatShading?: boolean;
  colors: Uint8Array;
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
  colorGain = 1,
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
      const gain = Number.isFinite(colorGain) ? Math.max(0, colorGain) : 1;
      out[outIdx] = Math.min(255, Math.round(rgba[0] * gain));
      out[outIdx + 1] = Math.min(255, Math.round(rgba[1] * gain));
      out[outIdx + 2] = Math.min(255, Math.round(rgba[2] * gain));
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
  const lonRange = east - west;
  if (lonRange > 300 && west >= 0) {
    west = -180;
    east = 180;
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

export const buildRasterImageFromMesh = ({
  lat,
  lon,
  rows,
  cols,
  flatShading = false,
  colors,
}: RasterImageFromMeshOptions): {
  dataUrl: string;
  rectangle: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
} | null => {
  if (!rows || !cols || !colors.length) return null;

  const imageRows = flatShading ? rows - 1 : rows;
  const imageCols = flatShading ? cols - 1 : cols;
  if (imageRows <= 0 || imageCols <= 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = imageCols;
  canvas.height = imageRows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const imageData = ctx.createImageData(imageCols, imageRows);
  const out = imageData.data;

  if (flatShading) {
    const cells = imageRows * imageCols;
    for (let i = 0; i < cells; i += 1) {
      const srcBase = i * 16;
      const r = colors[srcBase] ?? 0;
      const g = colors[srcBase + 1] ?? 0;
      const b = colors[srcBase + 2] ?? 0;
      const a = colors[srcBase + 3] ?? 0;
      const row = Math.floor(i / imageCols);
      const col = i - row * imageCols;
      const flippedRow = imageRows - 1 - row;
      const outIdx = (flippedRow * imageCols + col) * 4;
      out[outIdx] = r;
      out[outIdx + 1] = g;
      out[outIdx + 2] = b;
      out[outIdx + 3] = a;
    }
  } else {
    const verts = rows * cols;
    for (let i = 0; i < verts; i += 1) {
      const srcBase = i * 4;
      const r = colors[srcBase] ?? 0;
      const g = colors[srcBase + 1] ?? 0;
      const b = colors[srcBase + 2] ?? 0;
      const a = colors[srcBase + 3] ?? 0;
      const row = Math.floor(i / cols);
      const col = i - row * cols;
      const flippedRow = imageRows - 1 - row;
      const outIdx = (flippedRow * imageCols + col) * 4;
      out[outIdx] = r;
      out[outIdx + 1] = g;
      out[outIdx + 2] = b;
      out[outIdx + 3] = a;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  let west = lon[0];
  let east = lon[0];
  for (let i = 1; i < lon.length; i += 1) {
    if (lon[i] < west) west = lon[i];
    if (lon[i] > east) east = lon[i];
  }
  const lonRange = east - west;
  if (lonRange > 300 && west >= 0) {
    west = -180;
    east = 180;
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
