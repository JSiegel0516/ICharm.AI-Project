import { geoWinkel3 } from "d3-geo-projection";
import { geoPath } from "d3-geo";

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
  smoothGridBoxValues: boolean;
  opacity: number;
  rotate: [number, number, number];
  scale: number;
  translate: [number, number];
};

type WorkerState = {
  canvas: OffscreenCanvas | null;
  ctx: OffscreenCanvasRenderingContext2D | null;
  tempCanvas: OffscreenCanvas | null;
  tempCtx: OffscreenCanvasRenderingContext2D | null;
};

const state: WorkerState = {
  canvas: null,
  ctx: null,
  tempCanvas: null,
  tempCtx: null,
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

const findBracket = (arr: Float64Array, value: number) => {
  const ascending = arr[0] < arr[arr.length - 1];
  let lo = 0;
  let hi = arr.length - 1;
  if (ascending) {
    if (value <= arr[0]) return 0;
    if (value >= arr[hi]) return hi - 1;
  } else {
    if (value >= arr[0]) return 0;
    if (value <= arr[hi]) return hi - 1;
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const v = arr[mid];
    if (ascending) {
      if (value >= v) {
        lo = mid;
      } else {
        hi = mid;
      }
    } else {
      if (value <= v) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
  }
  return lo;
};

const handleInit = (canvas: OffscreenCanvas) => {
  state.canvas = canvas;
  state.ctx = canvas.getContext("2d");
  state.tempCanvas = null;
  state.tempCtx = null;
};

const handleResize = (width: number, height: number) => {
  if (!state.canvas) return;
  state.canvas.width = width;
  state.canvas.height = height;
  if (state.tempCanvas) {
    state.tempCanvas.width = width;
    state.tempCanvas.height = height;
  }
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
    smoothGridBoxValues,
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
  const stops = buildColorStops(colors);
  const alphaScale = clamp01(opacity);
  const lonMin = Math.min(...lon);
  const lonMax = Math.max(...lon);
  const latMin = Math.min(...lat);
  const latMax = Math.max(...lat);
  const lonCenter = (lonMin + lonMax) * 0.5;
  const lonSpan = lonMax - lonMin;
  const useZero360 = lonMin >= 0 && lonMax > 180;
  const useNeg180 = lonMin < 0 && lonMax <= 180;
  const useWrap = lonSpan > 300;

  const wrap360 = (value: number) => ((value % 360) + 360) % 360;
  const wrap180 = (value: number) =>
    ((((value + 180) % 360) + 360) % 360) - 180;

  let plotted = 0;

  if (smoothGridBoxValues) {
    const renderScale = 0.5;
    const renderWidth = Math.max(1, Math.round(width * renderScale));
    const renderHeight = Math.max(1, Math.round(height * renderScale));

    if (!state.tempCanvas || !state.tempCtx) {
      state.tempCanvas = new OffscreenCanvas(renderWidth, renderHeight);
      state.tempCtx = state.tempCanvas.getContext("2d");
    }
    const tempCanvas = state.tempCanvas!;
    const tempCtx = state.tempCtx!;
    if (
      tempCanvas.width !== renderWidth ||
      tempCanvas.height !== renderHeight
    ) {
      tempCanvas.width = renderWidth;
      tempCanvas.height = renderHeight;
    }

    const imageData = tempCtx.createImageData(renderWidth, renderHeight);
    const data = imageData.data;

    for (let y = 0; y < renderHeight; y += 1) {
      for (let x = 0; x < renderWidth; x += 1) {
        const px = (x + 0.5) * (width / renderWidth);
        const py = (y + 0.5) * (height / renderHeight);
        const inv = projection.invert([px, py]);
        if (!inv) continue;
        let lonValue = inv[0];
        const latValue = clampLat(inv[1]);
        if (useZero360) {
          lonValue = wrap360(lonValue);
        } else if (useNeg180) {
          lonValue = wrap180(lonValue);
        } else {
          lonValue = normalizeLon(lonValue, lonCenter);
        }
        if (!useWrap) {
          if (lonValue < lonMin || lonValue > lonMax) continue;
        } else if (useZero360) {
          if (lonValue < 0 || lonValue > 360) continue;
        } else if (useNeg180) {
          if (lonValue < -180 || lonValue > 180) continue;
        }
        if (latValue < latMin || latValue > latMax) continue;

        const lonIdx = findBracket(lon, lonValue);
        const latIdx = findBracket(lat, latValue);
        const lon0 = lon[lonIdx];
        const lon1 = lon[lonIdx + 1];
        const lat0 = lat[latIdx];
        const lat1 = lat[latIdx + 1];
        const lonT = lon1 === lon0 ? 0 : (lonValue - lon0) / (lon1 - lon0);
        const latT = lat1 === lat0 ? 0 : (latValue - lat0) / (lat1 - lat0);

        const idx00 = latIdx * cols + lonIdx;
        const idx10 = latIdx * cols + (lonIdx + 1);
        const idx01 = (latIdx + 1) * cols + lonIdx;
        const idx11 = (latIdx + 1) * cols + (lonIdx + 1);

        if (mask) {
          if (
            mask[idx00] === 0 &&
            mask[idx10] === 0 &&
            mask[idx01] === 0 &&
            mask[idx11] === 0
          ) {
            continue;
          }
        }

        const v00 = values[idx00];
        const v10 = values[idx10];
        const v01 = values[idx01];
        const v11 = values[idx11];
        const v0 = v00 + (v10 - v00) * lonT;
        const v1 = v01 + (v11 - v01) * lonT;
        const value = v0 + (v1 - v0) * latT;
        if (hideZeroValues && value === 0) continue;

        const rgba = mapValueToRgba(value, min, max, stops);
        const alpha = Math.round(rgba[3] * alphaScale);
        if (alpha <= 0) continue;
        const base = (y * renderWidth + x) * 4;
        data[base] = rgba[0];
        data[base + 1] = rgba[1];
        data[base + 2] = rgba[2];
        data[base + 3] = alpha;
        plotted += 1;
      }
    }

    tempCtx.putImageData(imageData, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.save();
    const path = geoPath(projection).context(ctx);
    ctx.beginPath();
    path({ type: "Sphere" } as GeoJSON.Geometry);
    ctx.clip();
    ctx.drawImage(tempCanvas, 0, 0, width, height);
    ctx.restore();
  } else {
    const lonNorm = new Array<number>(cols);
    let lonOffset = 0;
    lonNorm[0] = lon[0];
    for (let i = 1; i < cols; i += 1) {
      const delta = lon[i] - lon[i - 1];
      if (delta < -180) {
        lonOffset += 360;
      } else if (delta > 180) {
        lonOffset -= 360;
      }
      lonNorm[i] = lon[i] + lonOffset;
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

    const stepRow = Math.max(1, Math.round(rows / 60));
    const stepCol = Math.max(1, Math.round(cols / 120));

    ctx.save();
    const path = geoPath(projection).context(ctx);
    ctx.beginPath();
    path({ type: "Sphere" } as GeoJSON.Geometry);
    ctx.clip();

    const renderCell = (
      lonValue: number,
      lonNext: number,
      latValue: number,
      latNext: number,
      value: number,
    ) => {
      const avgLon = (lonValue + lonNext) * 0.5;
      const centerLon = -rotate[0];
      const shift = Math.round((centerLon - avgLon) / 360) * 360;
      lonValue += shift;
      lonNext += shift;
      const p00 = projection([lonValue, latValue]);
      const p10 = projection([lonNext, latValue]);
      const p11 = projection([lonNext, latNext]);
      const p01 = projection([lonValue, latNext]);
      if (!p00 || !p10 || !p11 || !p01) return;
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
      if (maxDx > width * 0.75 || maxDy > height * 0.75) return;
      const rgba =
        value == null || Number.isNaN(value)
          ? [0, 0, 0, 0]
          : mapValueToRgba(value, min, max, stops);
      const alpha = (rgba[3] / 255) * alphaScale;
      if (alpha <= 0) return;
      ctx.fillStyle = `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${alpha})`;
      const minCellPx = 3;
      if (maxDx < minCellPx && maxDy < minCellPx) {
        const cx = (p00[0] + p10[0] + p11[0] + p01[0]) / 4;
        const cy = (p00[1] + p10[1] + p11[1] + p01[1]) / 4;
        ctx.fillRect(
          Math.round(cx - minCellPx / 2),
          Math.round(cy - minCellPx / 2),
          minCellPx,
          minCellPx,
        );
        plotted += 1;
        return;
      }
      ctx.beginPath();
      ctx.moveTo(p00[0], p00[1]);
      ctx.lineTo(p10[0], p10[1]);
      ctx.lineTo(p11[0], p11[1]);
      ctx.lineTo(p01[0], p01[1]);
      ctx.closePath();
      ctx.fill();
      plotted += 1;
    };

    for (let row = 0; row < rows - 1; row += stepRow) {
      const rowNext = Math.min(row + stepRow, rows - 1);
      const latValue = latEdges[row];
      const latNext = latEdges[rowNext];
      for (let col = 0; col < cols - 1; col += stepCol) {
        const colNext = Math.min(col + stepCol, cols - 1);
        const idx = row * cols + col;
        if (mask && mask[idx] === 0) continue;
        const value = values[idx];
        if (hideZeroValues && value === 0) continue;
        let lonValue = lonEdges[col];
        let lonNext = lonEdges[colNext];
        renderCell(lonValue, lonNext, latValue, latNext, value);
      }

      if (useWrap) {
        const idx = row * cols + (cols - 1);
        if (mask && mask[idx] === 0) continue;
        const value = values[idx];
        if (hideZeroValues && value === 0) continue;
        let lonValue = lonEdges[cols - 1];
        let lonNext = lonEdges[0] + 360;
        if (lonNext < lonValue) {
          lonNext += 360;
        }
        renderCell(lonValue, lonNext, latValue, latNext, value);
      }
    }

    ctx.restore();
  }

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
