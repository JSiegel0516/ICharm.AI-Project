export const VERTEX_COLOR_GAIN = 1.2;

export const MESH_TO_IMAGERY_HEIGHT = 2_200_000;
export const IMAGERY_TO_MESH_HEIGHT = 3_000_000;
export const IMAGERY_OVERLAP_HEIGHT = MESH_TO_IMAGERY_HEIGHT * 1.15;
export const IMAGERY_HIDE_HEIGHT = IMAGERY_TO_MESH_HEIGHT * 1.1;
export const IMAGERY_PRELOAD_HEIGHT = MESH_TO_IMAGERY_HEIGHT * 1.15;

export const LABEL_TILE_URL = "/tiles/labels/{z}/{x}/{y}.pbf";
export const LABEL_MIN_VISIBLE = 3;
export const LABEL_HIDE_HEIGHT = 15_000_000;
export const LABEL_FADE_MS = 160;
export const LABEL_VISIBILITY_THROTTLE_MS = 60;
