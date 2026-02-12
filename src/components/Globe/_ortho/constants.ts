import * as THREE from "three";

export const BASE_TEXTURE_URL = "/images/world_imagery_arcgis.png";
export const NORMAL_MAP_LAND_URL = "/_land/earth_normalmap_flat_8192x4096.jpg";
export const NORMAL_MAP_LAND_BATHY_URL = "/_land/earth_normalmap_8192x4096.jpg";

export const BASE_RADIUS = 1;
export const OVERLAY_RADIUS = 1.005;

export const DEFAULT_MIN_ZOOM = 0.2;
export const DEFAULT_MAX_ZOOM = 20.0;

export const MESH_TO_RASTER_ZOOM = 1.35;
export const RASTER_TO_MESH_ZOOM = 1.2;

export const DEFAULT_NORMAL_MAP_MODE = "none" as const;

export const VERTEX_COLOR_GAIN = 1.2;

export const BASE_FILL_COLOR = new THREE.Color("#0b1e2f");
export const BASE_FILL_COLOR_SRGB =
  BASE_FILL_COLOR.clone().convertLinearToSRGB();

export const DEFAULT_GLOBE_ROTATION = new THREE.Euler(
  0,
  -Math.PI / 2,
  0,
  "XYZ",
);
export const DEFAULT_LIGHT_DIRECTION = new THREE.Vector3(3, 2, 4).normalize();

export const LABEL_TILE_URL = "/tiles/labels/{z}/{x}/{y}.pbf";
export const LABEL_MIN_VISIBLE = 3;
export const LABEL_MAX_VISIBLE = 50;
export const LABEL_FADE_MS = 160;
export const LABEL_VISIBILITY_THROTTLE_MS = 33;
