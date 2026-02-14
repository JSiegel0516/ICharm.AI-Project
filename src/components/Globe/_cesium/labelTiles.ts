import { latToTileY, lonToTileX } from "./labelUtils";

export const getTileKeysForView = (params: {
  Cesium: any;
  viewer: any;
  zoom: number;
}) => {
  const { Cesium, viewer, zoom } = params;
  if (!Cesium || !viewer) return null;
  const rectangle = viewer.camera.computeViewRectangle(
    viewer.scene.globe.ellipsoid,
  );
  if (!rectangle) return null;

  const west = Cesium.Math.toDegrees(rectangle.west);
  const east = Cesium.Math.toDegrees(rectangle.east);
  const south = Cesium.Math.toDegrees(rectangle.south);
  const north = Cesium.Math.toDegrees(rectangle.north);
  const buffer = 1;
  const tileCount = 2 ** zoom;

  const collectRange = (rangeWest: number, rangeEast: number) => {
    const xStart = lonToTileX(rangeWest, zoom);
    const xEnd = lonToTileX(rangeEast, zoom);
    const yStart = latToTileY(north, zoom);
    const yEnd = latToTileY(south, zoom);
    const keys: string[] = [];
    for (
      let x = Math.max(0, xStart - buffer);
      x <= Math.min(tileCount - 1, xEnd + buffer);
      x += 1
    ) {
      for (
        let y = Math.max(0, yStart - buffer);
        y <= Math.min(tileCount - 1, yEnd + buffer);
        y += 1
      ) {
        keys.push(`${zoom}/${x}/${y}`);
      }
    }
    return keys;
  };

  const centerLat = (south + north) / 2;
  let centerLon = 0;
  if (west <= east) {
    centerLon = (west + east) / 2;
  } else {
    const span = 180 - west + (east + 180);
    centerLon = west + span / 2;
    if (centerLon > 180) centerLon -= 360;
  }

  const keys =
    west <= east
      ? collectRange(west, east)
      : [...collectRange(west, 180), ...collectRange(-180, east)];
  return { keys, centerLon, centerLat };
};
