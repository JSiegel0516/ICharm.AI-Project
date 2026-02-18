type GeoJsonFeature = {
  geometry?: {
    type: string;
    coordinates: any;
  };
};

type GeoJsonCollection = {
  type: string;
  features?: GeoJsonFeature[];
};

export const addGeoJsonLines = (
  Cesium: any,
  viewer: any,
  data: GeoJsonCollection,
  options: {
    color: string;
    width: number;
    dashed?: boolean;
    dashLength?: number;
    height?: number;
  },
) => {
  if (!data || !Array.isArray(data.features)) return [] as any[];
  const entities: any[] = [];
  const color = Cesium.Color.fromCssColorString(options.color);
  const material = options.dashed
    ? new Cesium.PolylineDashMaterialProperty({
        color,
        dashLength: options.dashLength ?? 16,
        gapColor: Cesium.Color.TRANSPARENT,
      })
    : color;
  const surfaceOffset = options.height ?? 50;
  const toCartesian = (lon: number, lat: number) =>
    Cesium.Cartesian3.fromDegrees(lon, lat, surfaceOffset);

  const addWrappedPolyline = (positions: any[]) => {
    if (positions.length < 2) return;
    const wrapped = Cesium.PolylinePipeline.wrapLongitude(positions);
    const wrappedPositions = wrapped.positions ?? positions;
    const lengths = wrapped.lengths ?? [wrappedPositions.length];
    let offset = 0;
    lengths.forEach((length: number) => {
      const segment = wrappedPositions.slice(offset, offset + length);
      offset += length;
      if (segment.length < 2) return;
      const entity = viewer.entities.add({
        polyline: {
          positions: segment,
          width: options.width,
          material,
          clampToGround: false,
          arcType: Cesium.ArcType.GEODESIC,
        },
      });
      entities.push(entity);
    });
  };

  const processLine = (coords: number[][]) => {
    if (!coords || coords.length < 2) return;
    const positions = coords.map((coord: number[]) =>
      toCartesian(coord[0], coord[1]),
    );
    addWrappedPolyline(positions);
  };

  const processGeometry = (geometry: any) => {
    if (!geometry) return;
    if (geometry.type === "LineString") {
      processLine(geometry.coordinates);
    } else if (geometry.type === "MultiLineString") {
      geometry.coordinates.forEach(processLine);
    } else if (geometry.type === "Polygon") {
      geometry.coordinates.forEach(processLine);
    } else if (geometry.type === "MultiPolygon") {
      geometry.coordinates.forEach((poly: any[]) => {
        poly.forEach(processLine);
      });
    }
  };

  data.features.forEach((feature) => {
    processGeometry(feature?.geometry);
  });

  return entities;
};
