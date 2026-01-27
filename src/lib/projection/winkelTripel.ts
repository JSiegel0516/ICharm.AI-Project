// Winkel Tripel projection utilities: forward (lon/lat → x/y) and inverse (x/y → lon/lat)
// Designed as pure math helpers for rendering pipelines (canvas, WebGL, workers).
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
export const WINKEL_TRIPEL_STANDARD_PARALLEL = Math.acos(2 / Math.PI); // φ₁ ≈ 50.467°
const COS_STANDARD_PARALLEL = Math.cos(WINKEL_TRIPEL_STANDARD_PARALLEL); // 2/π

export type ProjectionPoint = { x: number; y: number };
export type GeoPoint = { lon: number; lat: number };

export type ProjectionSpaceBounds = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  width: number;
  height: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const safeAcos = (value: number) => Math.acos(clamp(value, -1, 1));
const HALF_PI = Math.PI / 2;

export function forward(lonDeg: number, latDeg: number): ProjectionPoint {
  const lon = clamp(lonDeg, -180, 180) * DEG2RAD;
  const lat = clamp(latDeg, -90, 90) * DEG2RAD;

  const cosLat = Math.cos(lat);
  const alpha = safeAcos(cosLat * Math.cos(lon / 2));
  const sinAlpha = Math.sin(alpha);
  const sinci = Math.abs(sinAlpha) > 1e-12 ? alpha / sinAlpha : 1;

  let xAitoff = 0;
  let yAitoff = 0;

  xAitoff = 2 * cosLat * Math.sin(lon / 2) * sinci;
  yAitoff = Math.sin(lat) * sinci;

  const xEqui = lon * COS_STANDARD_PARALLEL;
  const yEqui = lat;

  return {
    x: (xAitoff + xEqui) / 2,
    y: (yAitoff + yEqui) / 2,
  };
}

export function inverse(
  x: number,
  y: number,
  options?: { maxIterations?: number; tolerance?: number },
): { point: GeoPoint; converged: boolean; iterations: number; error: number } {
  const maxIterations = options?.maxIterations ?? 40;
  const tolerance = options?.tolerance ?? 1e-10;
  const step = 1e-6; // finite diff step in radians

  // Direct Newton-Raphson in radians.
  let lambda = clamp(x / COS_STANDARD_PARALLEL, -Math.PI, Math.PI); // rad
  let phi = clamp(y, -HALF_PI, HALF_PI); // rad
  let bestError = Number.POSITIVE_INFINITY;
  let iterations = 0;
  let converged = false;

  const forwardRad = (lam: number, ph: number) => {
    const cosLat = Math.cos(ph);
    const alpha = safeAcos(cosLat * Math.cos(lam / 2));
    const sinAlpha = Math.sin(alpha);
    const sinci = Math.abs(sinAlpha) > 1e-12 ? alpha / sinAlpha : 1;
    const xA = 2 * cosLat * Math.sin(lam / 2) * sinci;
    const yA = Math.sin(ph) * sinci;
    const xE = lam * COS_STANDARD_PARALLEL;
    const yE = ph;
    return { x: (xA + xE) / 2, y: (yA + yE) / 2 };
  };

  for (let i = 0; i < maxIterations; i += 1) {
    iterations = i + 1;
    const p = forwardRad(lambda, phi);
    const errX = p.x - x;
    const errY = p.y - y;
    const error = Math.max(Math.abs(errX), Math.abs(errY));
    bestError = Math.min(bestError, error);

    if (error <= tolerance) {
      converged = true;
      break;
    }

    const fLam = forwardRad(lambda + step, phi);
    const fPhi = forwardRad(lambda, phi + step);
    const dx_dLam = (fLam.x - p.x) / step;
    const dy_dLam = (fLam.y - p.y) / step;
    const dx_dPhi = (fPhi.x - p.x) / step;
    const dy_dPhi = (fPhi.y - p.y) / step;

    const det = dx_dLam * dy_dPhi - dx_dPhi * dy_dLam;
    if (Math.abs(det) < 1e-18) {
      break;
    }

    const dLam = (dy_dPhi * errX - dx_dPhi * errY) / det;
    const dPhi = (dx_dLam * errY - dy_dLam * errX) / det;

    lambda = clamp(lambda - dLam, -Math.PI, Math.PI);
    phi = clamp(phi - dPhi, -HALF_PI, HALF_PI);

    if (Math.abs(dLam) <= tolerance && Math.abs(dPhi) <= tolerance) {
      converged = true;
      break;
    }
  }

  return {
    point: {
      lon: clamp(lambda * RAD2DEG, -180, 180),
      lat: clamp(phi * RAD2DEG, -90, 90),
    },
    converged,
    iterations,
    error: bestError,
  };
}

const computeBounds = (): ProjectionSpaceBounds => {
  // Probe a grid to derive practical extents
  const probes: Array<ProjectionPoint> = [];
  for (let lat = -90; lat <= 90; lat += 10) {
    probes.push(forward(-180, lat));
    probes.push(forward(180, lat));
  }
  for (let lon = -180; lon <= 180; lon += 10) {
    probes.push(forward(lon, -90));
    probes.push(forward(lon, 90));
  }
  const xs = probes.map((p) => p.x);
  const ys = probes.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  return { xMin, xMax, yMin, yMax, width: xMax - xMin, height: yMax - yMin };
};

export const WINKEL_TRIPEL_BOUNDS = computeBounds();

export const projectionToNormalized = (
  point: ProjectionPoint,
  bounds: ProjectionSpaceBounds = WINKEL_TRIPEL_BOUNDS,
): { nx: number; ny: number } => {
  const nx = bounds.width ? (point.x - bounds.xMin) / bounds.width : 0.5;
  // Flip Y so north (yMax) maps to ny=0 (top of canvas)
  const ny = bounds.height ? (bounds.yMax - point.y) / bounds.height : 0.5;
  return { nx, ny };
};

export const normalizedToProjection = (
  nx: number,
  ny: number,
  bounds: ProjectionSpaceBounds = WINKEL_TRIPEL_BOUNDS,
): ProjectionPoint => ({
  x: bounds.xMin + clamp(nx, 0, 1) * bounds.width,
  // Invert Y back to projection coordinates
  y: bounds.yMax - clamp(ny, 0, 1) * bounds.height,
});

export const projectionToPixel = (
  point: ProjectionPoint,
  canvasWidth: number,
  canvasHeight: number,
  options?: {
    bounds?: ProjectionSpaceBounds;
    offsetX?: number;
    offsetY?: number;
    scale?: number;
  },
): { px: number; py: number } => {
  const bounds = options?.bounds ?? WINKEL_TRIPEL_BOUNDS;
  const scale = options?.scale ?? 1;
  const offsetX = options?.offsetX ?? 0;
  const offsetY = options?.offsetY ?? 0;
  const { nx, ny } = projectionToNormalized(point, bounds);
  const px = nx * canvasWidth * scale + offsetX;
  const py = ny * canvasHeight * scale + offsetY;
  return { px, py };
};

export const pixelToProjection = (
  px: number,
  py: number,
  canvasWidth: number,
  canvasHeight: number,
  options?: {
    bounds?: ProjectionSpaceBounds;
    offsetX?: number;
    offsetY?: number;
    scale?: number;
  },
): ProjectionPoint => {
  const bounds = options?.bounds ?? WINKEL_TRIPEL_BOUNDS;
  const scale = options?.scale ?? 1;
  const offsetX = options?.offsetX ?? 0;
  const offsetY = options?.offsetY ?? 0;

  const nx = (px - offsetX) / (canvasWidth * scale) || 0;
  const ny = (py - offsetY) / (canvasHeight * scale) || 0;
  return normalizedToProjection(nx, ny, bounds);
};

export const pixelToGeographic = (
  px: number,
  py: number,
  canvasWidth: number,
  canvasHeight: number,
  options?: {
    bounds?: ProjectionSpaceBounds;
    offsetX?: number;
    offsetY?: number;
    scale?: number;
  },
): GeoPoint | null => {
  const proj = pixelToProjection(px, py, canvasWidth, canvasHeight, options);
  const result = inverse(proj.x, proj.y);
  // Allow slightly loose fallback to avoid rendering holes; reject only if error is large.
  if (!result.converged && result.error > 1e-3) {
    return null;
  }
  return result.point;
};

export const geographicToPixel = (
  lon: number,
  lat: number,
  canvasWidth: number,
  canvasHeight: number,
  options?: {
    bounds?: ProjectionSpaceBounds;
    offsetX?: number;
    offsetY?: number;
    scale?: number;
  },
): { px: number; py: number } => {
  const proj = forward(lon, lat);
  return projectionToPixel(proj, canvasWidth, canvasHeight, options);
};
