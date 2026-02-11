import { geoWinkel3 } from "d3-geo-projection";

self.postMessage({ type: "debug", stage: "loaded" });

type RenderPayload = {
  width: number;
  height: number;
  lat: Float64Array;
  lon: Float64Array;
  values: Float32Array | Float64Array;
  mask?: Uint8Array;
  min: number;
  max: number;
  colors: string[];
  hideZeroValues: boolean;
  opacity: number;
  rotate: [number, number, number];
  scale: number;
  translate: [number, number];
};

type WorkerState = {
  canvas: OffscreenCanvas | null;
  ctx: OffscreenCanvasRenderingContext2D | null;
};

const state: WorkerState = {
  canvas: null,
  ctx: null,
};

type Rgba = [number, number, number, number];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const hexToRgba = (value: string): Rgba => {
  const hex = value.trim().replace("#", "");
  if (hex.length === 6) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return [r, g, b, 255];
  }
  if (hex.length === 8) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    const a = Number.parseInt(hex.slice(6, 8), 16);
    return [r, g, b, a];
  }
  return [0, 0, 0, 255];
};

const buildColorStops = (colors: string[]): Rgba[] => {
  if (!colors.length) return [[0, 0, 0, 255]];
  return colors.map(hexToRgba);
};

const interpolateColor = (stops: Rgba[], t: number): Rgba => {
  if (!stops.length) return [0, 0, 0, 255];
  if (stops.length === 1) return stops[0];
  const clamped = clamp01(t);
  const scaled = clamped * (stops.length - 1);
  const lower = Math.floor(scaled);
  const upper = Math.min(stops.length - 1, lower + 1);
  const localT = scaled - lower;
  const a = stops[lower];
  const b = stops[upper];
  return [
    Math.round(a[0] + (b[0] - a[0]) * localT),
    Math.round(a[1] + (b[1] - a[1]) * localT),
    Math.round(a[2] + (b[2] - a[2]) * localT),
    Math.round(a[3] + (b[3] - a[3]) * localT),
  ];
};

const normalizeValue = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return null;
  const range = max - min;
  if (range <= 0) return 0;
  return clamp01((value - min) / range);
};

const mapValueToRgba = (
  value: number,
  min: number,
  max: number,
  stops: Rgba[],
): Rgba => {
  const t = normalizeValue(value, min, max);
  if (t === null) return [0, 0, 0, 0];
  return interpolateColor(stops, t);
};

const normalizeLon = (lon: number, center: number) => {
  let value = lon;
  while (value - center > 180) value -= 360;
  while (value - center < -180) value += 360;
  return value;
};

const clampLat = (value: number) => Math.max(-90, Math.min(90, value));

const handleInit = (canvas: OffscreenCanvas) => {
  state.canvas = canvas;
  state.ctx = canvas.getContext("2d");
};

const handleResize = (width: number, height: number) => {
  if (!state.canvas) return;
  state.canvas.width = width;
  state.canvas.height = height;
};

const handleClear = () => {
  if (!state.canvas || !state.ctx) return;
  state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
};

const handleRender = (payload: RenderPayload) => {
  if (!state.canvas || !state.ctx) {
    self.postMessage({ type: "debug", stage: "render-missing-canvas" });
    return;
  }
  const {
    width,
    height,
    lat,
    lon,
    values,
    mask,
    min,
    max,
    colors,
    hideZeroValues,
    opacity,
    rotate,
    scale,
    translate,
  } = payload;

  state.canvas.width = width;
  state.canvas.height = height;
  const ctx = state.ctx;
  ctx.clearRect(0, 0, width, height);

  let projection;
  try {
    projection = geoWinkel3()
      .rotate(rotate)
      .scale(scale)
      .translate(translate)
      .precision(0.1);
  } catch (err) {
    self.postMessage({
      type: "debug",
      stage: "projection-error",
      err: String(err),
    });
    return;
  }

  const rows = lat.length;
  const cols = lon.length;
  const lonCenter = -rotate[0];
  const lonNorm = new Array<number>(cols);
  for (let i = 0; i < cols; i += 1) {
    lonNorm[i] = normalizeLon(lon[i], lonCenter);
  }
  const lonEdges = new Array<number>(cols + 1);
  for (let i = 1; i < cols; i += 1) {
    lonEdges[i] = (lonNorm[i - 1] + lonNorm[i]) * 0.5;
  }
  if (cols > 1) {
    lonEdges[0] = lonNorm[0] - (lonEdges[1] - lonNorm[0]);
    lonEdges[cols] =
      lonNorm[cols - 1] + (lonNorm[cols - 1] - lonEdges[cols - 1]);
  } else {
    lonEdges[0] = lonNorm[0] - 0.5;
    lonEdges[1] = lonNorm[0] + 0.5;
  }
  const latEdges = new Array<number>(rows + 1);
  for (let i = 1; i < rows; i += 1) {
    latEdges[i] = clampLat((lat[i - 1] + lat[i]) * 0.5);
  }
  if (rows > 1) {
    latEdges[0] = clampLat(lat[0] - (latEdges[1] - lat[0]));
    latEdges[rows] = clampLat(
      lat[rows - 1] + (lat[rows - 1] - latEdges[rows - 1]),
    );
  } else {
    latEdges[0] = clampLat(lat[0] - 0.5);
    latEdges[1] = clampLat(lat[0] + 0.5);
  }
  const stops = buildColorStops(colors);
  const alphaScale = clamp01(opacity);

  let plotted = 0;
  for (let row = 0; row < rows - 1; row += 1) {
    const latValue = latEdges[row];
    const latNext = latEdges[row + 1];
    for (let col = 0; col < cols - 1; col += 1) {
      const idx = row * cols + col;
      if (mask && mask[idx] === 0) continue;
      const value = values[idx];
      if (hideZeroValues && value === 0) continue;
      const lonValue = lonEdges[col];
      const lonNext = lonEdges[col + 1];
      const lonDelta = Math.abs(lonNext - lonValue);
      if (lonDelta > 180) continue;
      const p00 = projection([lonValue, latValue]);
      const p10 = projection([lonNext, latValue]);
      const p11 = projection([lonNext, latNext]);
      const p01 = projection([lonValue, latNext]);
      if (!p00 || !p10 || !p11 || !p01) continue;
      const maxDx = Math.max(
        Math.abs(p00[0] - p10[0]),
        Math.abs(p10[0] - p11[0]),
        Math.abs(p11[0] - p01[0]),
        Math.abs(p01[0] - p00[0]),
      );
      const maxDy = Math.max(
        Math.abs(p00[1] - p10[1]),
        Math.abs(p10[1] - p11[1]),
        Math.abs(p11[1] - p01[1]),
        Math.abs(p01[1] - p00[1]),
      );
      if (maxDx > width * 0.75 || maxDy > height * 0.75) continue;
      const rgba =
        value == null || Number.isNaN(value)
          ? [0, 0, 0, 0]
          : mapValueToRgba(value, min, max, stops);
      const alpha = (rgba[3] / 255) * alphaScale;
      if (alpha <= 0) continue;
      ctx.fillStyle = `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(p00[0], p00[1]);
      ctx.lineTo(p10[0], p10[1]);
      ctx.lineTo(p11[0], p11[1]);
      ctx.lineTo(p01[0], p01[1]);
      ctx.closePath();
      ctx.fill();
      plotted += 1;
    }
  }

  const latMin = Math.min(...lat);
  const latMax = Math.max(...lat);
  const lonMin = Math.min(...lon);
  const lonMax = Math.max(...lon);
  self.postMessage({
    type: "debug",
    stage: "render-complete",
    plotted,
    width,
    height,
    rows,
    cols,
    latMin,
    latMax,
    lonMin,
    lonMax,
  });
  self.postMessage({ type: "rendered" });
};

self.onmessage = (event: MessageEvent) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;
  if (message.type === "ping") {
    self.postMessage({ type: "debug", stage: "pong" });
    return;
  }
  if (message.type === "init") {
    self.postMessage({ type: "debug", stage: "init" });
    handleInit(message.canvas as OffscreenCanvas);
    return;
  }
  if (message.type === "resize") {
    self.postMessage({
      type: "debug",
      stage: "resize",
      width: message.width,
      height: message.height,
    });
    handleResize(message.width, message.height);
    return;
  }
  if (message.type === "render") {
    self.postMessage({ type: "debug", stage: "render" });
    handleRender(message.payload as RenderPayload);
    return;
  }
  if (message.type === "clear") {
    self.postMessage({ type: "debug", stage: "clear" });
    handleClear();
    return;
  }
  self.postMessage({ type: "debug", stage: "unknown", message });
};
