export type BoundaryDataset = {
  name: string;
  kind: "boundary" | "geographicLines" | "timeZones";
  data: any;
};

const RESOLUTION_MAP = {
  low: "110m",
  medium: "50m",
  high: "10m",
} as const;

export const loadGeographicBoundaries = async (options: {
  coastlineResolution: "none" | "low" | "medium" | "high";
  riverResolution: "none" | "low" | "medium" | "high";
  lakeResolution: "none" | "low" | "medium" | "high";
  includeGeographicLines: boolean;
  includeBoundaries: boolean;
  includeTimeZones?: boolean;
}): Promise<BoundaryDataset[]> => {
  const files: Array<{
    name: string;
    kind: BoundaryDataset["kind"];
    path: string;
  }> = [];

  if (options.includeBoundaries && options.coastlineResolution !== "none") {
    const res = RESOLUTION_MAP[options.coastlineResolution];
    files.push({
      name: `ne_${res}_coastline.json`,
      kind: "boundary",
      path: `/_countries/ne_${res}_coastline.json`,
    });
  }
  if (options.includeBoundaries && options.lakeResolution !== "none") {
    const res = RESOLUTION_MAP[options.lakeResolution];
    files.push({
      name: `ne_${res}_lakes.json`,
      kind: "boundary",
      path: `/_countries/ne_${res}_lakes.json`,
    });
  }
  if (options.includeBoundaries && options.riverResolution !== "none") {
    const res = RESOLUTION_MAP[options.riverResolution];
    files.push({
      name: `ne_${res}_rivers_lake_centerlines.json`,
      kind: "boundary",
      path: `/_countries/ne_${res}_rivers_lake_centerlines.json`,
    });
  }
  if (options.includeGeographicLines) {
    files.push({
      name: "ne_110m_geographic_lines.json",
      kind: "geographicLines",
      path: "/_countries/ne_110m_geographic_lines.json",
    });
  }
  if (options.includeTimeZones) {
    files.push({
      name: "ne_10m_time_zones.json",
      kind: "timeZones",
      path: "/_countries/ne_10m_time_zones.json",
    });
  }

  const boundaryData: BoundaryDataset[] = [];

  for (const file of files) {
    try {
      const response = await fetch(file.path);
      if (response.ok) {
        const data = await response.json();
        boundaryData.push({ name: file.name, kind: file.kind, data });
      }
    } catch (error) {
      console.error(`Error loading ${file.name}:`, error);
    }
  }

  return boundaryData;
};

export const addGeographicBoundaries = (
  Cesium: any,
  viewer: any,
  boundaryData: BoundaryDataset[],
  lineColors?: {
    boundaryLines?: string;
    coastlines?: string;
    rivers?: string;
    lakes?: string;
    geographicLines?: string;
    geographicGrid?: string;
  },
  includeTimeZoneLines = false,
) => {
  const thickness = 1;
  const boundaryEntities: any[] = [];
  const geographicLineEntities: any[] = [];
  const timeZoneLineEntities: any[] = [];
  const naturalEarthLineEntities: any[] = [];
  const coastlineColorCss =
    lineColors?.coastlines ?? lineColors?.boundaryLines ?? "#000000";
  const riversColorCss =
    lineColors?.rivers ?? lineColors?.boundaryLines ?? "#000000";
  const lakesColorCss =
    lineColors?.lakes ?? lineColors?.boundaryLines ?? "#000000";
  const geographicLineColorCss =
    lineColors?.geographicLines ?? lineColors?.geographicGrid ?? "#000000";
  const geographicGridColorCss = lineColors?.geographicGrid ?? "#000000";
  const surfaceOffset = 50;
  const toCartesian = (lon: number, lat: number) =>
    Cesium.Cartesian3.fromDegrees(lon, lat, surfaceOffset);
  const addWrappedPolyline = (
    positions: any[],
    width: number,
    material: any,
    target: any[],
  ) => {
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
          width,
          material,
          clampToGround: false,
          arcType: Cesium.ArcType.GEODESIC,
        },
      });
      target.push(entity);
    });
  };

  boundaryData.forEach(({ name, kind, data }) => {
    const isGeographicLines =
      kind === "geographicLines" || name.includes("geographic_lines");
    const isTimeZones = kind === "timeZones" || name.includes("time_zones");

    const targetCollection = isTimeZones
      ? timeZoneLineEntities
      : isGeographicLines
        ? naturalEarthLineEntities
        : boundaryEntities;

    if (Array.isArray(data?.Lon) && Array.isArray(data?.Lat)) {
      let color = Cesium.Color.fromCssColorString("#f8fafc").withAlpha(0.8);
      let width = 2;

      if (name.includes("coastline")) {
        color =
          Cesium.Color.fromCssColorString(coastlineColorCss).withAlpha(0.7);
        width = 1.2;
      } else if (name.includes("rivers")) {
        color = Cesium.Color.fromCssColorString(riversColorCss).withAlpha(0.7);
        width = 1;
      } else if (name.includes("lakes")) {
        color = Cesium.Color.fromCssColorString(lakesColorCss).withAlpha(0.7);
        width = 1.2;
      } else if (isGeographicLines) {
        color = Cesium.Color.fromCssColorString(
          geographicLineColorCss,
        ).withAlpha(0.6);
        width = 1;
      } else if (isTimeZones) {
        color = Cesium.Color.fromCssColorString(
          geographicGridColorCss,
        ).withAlpha(0.55);
        width = 1.1;
      }

      const positions: any[] = [];
      let segments = 0;
      for (let i = 0; i < data.Lon.length; i += 1) {
        const lon = data.Lon[i];
        const lat = data.Lat[i];
        if (lon == null || lat == null) {
          if (positions.length >= 2) {
            addWrappedPolyline(positions, width, color, targetCollection);
            segments += 1;
          }
          positions.length = 0;
          continue;
        }
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        positions.push(toCartesian(lon, lat));
      }
      if (positions.length >= 2) {
        addWrappedPolyline(positions, width, color, targetCollection);
        segments += 1;
      }

      return;
    }

    if (data.type === "FeatureCollection" && data.features) {
      let color = Cesium.Color.fromCssColorString("#f8fafc").withAlpha(0.8);
      let width = 2 * thickness;

      if (name.includes("coastline")) {
        color =
          Cesium.Color.fromCssColorString(coastlineColorCss).withAlpha(0.7);
        width = 1.2 * thickness;
      } else if (name.includes("rivers")) {
        color = Cesium.Color.fromCssColorString(riversColorCss).withAlpha(0.7);
        width = 1 * thickness;
      } else if (name.includes("lakes")) {
        color = Cesium.Color.fromCssColorString(lakesColorCss).withAlpha(0.7);
        width = 1.2 * thickness;
      } else if (isGeographicLines) {
        color = Cesium.Color.fromCssColorString(
          geographicLineColorCss,
        ).withAlpha(0.6);
        width = 1 * thickness;
      } else if (isTimeZones) {
        color = Cesium.Color.fromCssColorString(
          geographicGridColorCss,
        ).withAlpha(0.55);
        width = 1.1 * thickness;
      }

      data.features.forEach((feature: any) => {
        const geometry = feature.geometry;
        if (!geometry) return;

        const processCoordinates = (coords: any[]) => {
          const positions = coords.map((coord: number[]) =>
            toCartesian(coord[0], coord[1]),
          );
          addWrappedPolyline(positions, width, color, targetCollection);
        };

        if (geometry.type === "LineString") {
          processCoordinates(geometry.coordinates);
        } else if (geometry.type === "MultiLineString") {
          geometry.coordinates.forEach(processCoordinates);
        } else if (geometry.type === "Polygon") {
          geometry.coordinates.forEach(processCoordinates);
        } else if (geometry.type === "MultiPolygon") {
          geometry.coordinates.forEach((poly: any[]) => {
            poly.forEach(processCoordinates);
          });
        }
      });
    }
  });

  const gridMaterial = Cesium.Color.fromCssColorString(
    geographicGridColorCss,
  ).withAlpha(0.3);
  const gridWidth = 0.7 * thickness;

  const addLatLine = (latitude: number) => {
    const positions: any[] = [];
    for (let lon = -180; lon <= 180; lon += 5) {
      positions.push(toCartesian(lon, latitude));
    }
    const entity = viewer.entities.add({
      polyline: {
        positions,
        width: gridWidth,
        material: gridMaterial,
        clampToGround: false,
        arcType: Cesium.ArcType.GEODESIC,
      },
    });
    geographicLineEntities.push(entity);
  };

  const addLonLine = (longitude: number) => {
    const positions: any[] = [];
    for (let lat = -85; lat <= 85; lat += 5) {
      positions.push(toCartesian(longitude, lat));
    }
    const entity = viewer.entities.add({
      polyline: {
        positions,
        width: gridWidth,
        material: gridMaterial,
        clampToGround: false,
        arcType: Cesium.ArcType.GEODESIC,
      },
    });
    geographicLineEntities.push(entity);
  };

  for (let lat = -80; lat <= 80; lat += 20) {
    addLatLine(lat);
  }
  for (let lon = -180; lon <= 180; lon += 20) {
    addLonLine(lon);
  }

  if (includeTimeZoneLines && timeZoneLineEntities.length === 0) {
    // No time zone dataset available.
  }

  return {
    boundaryEntities,
    geographicLineEntities,
    timeZoneLineEntities,
    naturalEarthLineEntities,
  };
};
