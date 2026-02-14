import { geoGraticule, geoPath } from "d3-geo";
import { select, type Selection } from "d3-selection";
import type { GeoProjection } from "d3-geo";
import type { GlobeLineResolution, LineColorSettings } from "@/types";

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

export const loadNaturalEarthBoundaries = async (options: {
  coastlineResolution: GlobeLineResolution;
  riverResolution: GlobeLineResolution;
  lakeResolution: GlobeLineResolution;
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
        const raw = await response.json();
        const data = lonLatToGeoJson(raw);
        boundaryData.push({ name: file.name, kind: file.kind, data });
      }
    } catch (error) {
      console.error(`Error loading ${file.name}:`, error);
    }
  }

  return boundaryData;
};

const lonLatToGeoJson = (raw: any) => {
  const lon = Array.isArray(raw?.Lon) ? raw.Lon : [];
  const lat = Array.isArray(raw?.Lat) ? raw.Lat : [];
  const lines: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  const length = Math.min(lon.length, lat.length);
  for (let i = 0; i < length; i += 1) {
    const lonValue = lon[i];
    const latValue = lat[i];
    if (
      lonValue == null ||
      latValue == null ||
      Number.isNaN(lonValue) ||
      Number.isNaN(latValue)
    ) {
      if (current.length > 1) {
        lines.push(current);
      }
      current = [];
      continue;
    }
    current.push([Number(lonValue), Number(latValue)]);
  }
  if (current.length > 1) {
    lines.push(current);
  }
  return {
    type: "MultiLineString",
    coordinates: lines,
  };
};

export class WinkelBoundaries {
  private pathGenerator: ReturnType<typeof geoPath>;
  private svg: Selection | null = null;
  private showGraticule = false;
  private lineColors?: LineColorSettings;
  private boundaryData: BoundaryDataset[] = [];
  private static clipIdCounter = 0;

  constructor(projection: GeoProjection) {
    this.pathGenerator = geoPath(projection);
  }

  renderToSVG(
    svgElement: SVGSVGElement,
    boundaryData: BoundaryDataset[],
    options: {
      showGraticule: boolean;
      showTimeZoneLines: boolean;
      lineColors?: LineColorSettings;
    },
  ) {
    const svg = select(svgElement);
    svg.selectAll("*").remove();
    this.svg = svg;
    this.showGraticule = options.showGraticule;
    this.lineColors = options.lineColors;
    const lineThickness = 1;
    this.boundaryData = boundaryData;

    const clipId = `winkel-clip-${WinkelBoundaries.clipIdCounter++}`;

    const coastlineColor =
      this.lineColors?.coastlines ??
      this.lineColors?.boundaryLines ??
      "#4b5563";
    const riverColor =
      this.lineColors?.rivers ?? this.lineColors?.boundaryLines ?? "#4b5563";
    const lakeColor =
      this.lineColors?.lakes ?? this.lineColors?.boundaryLines ?? "#4b5563";
    const geographicLineColor = this.lineColors?.geographicLines ?? "#4b5563";
    const graticuleColor =
      this.lineColors?.geographicGrid ??
      this.lineColors?.geographicLines ??
      "#4b5563";

    if (!this.svg) return;
    const svgSel = this.svg as any;
    const defs = svgSel.append("defs");
    defs
      .append("clipPath")
      .attr("id", clipId)
      .append("path")
      .datum({ type: "Sphere" })
      .attr("d", this.pathGenerator);

    svgSel
      .append("path")
      .datum({ type: "Sphere" })
      .attr("class", "winkel-sphere")
      .attr("fill", "none")
      .attr("stroke", coastlineColor)
      .attr("stroke-width", 0.8 * lineThickness)
      .attr("d", this.pathGenerator);

    if (this.showGraticule) {
      const graticule = geoGraticule();
      svgSel
        .append("path")
        .datum(graticule())
        .attr("class", "winkel-graticule")
        .attr("fill", "none")
        .attr("stroke", graticuleColor)
        .attr("stroke-width", 0.4 * lineThickness)
        .attr("opacity", 0.7)
        .attr("clip-path", `url(#${clipId})`)
        .attr("d", this.pathGenerator);
    }

    boundaryData.forEach((dataset) => {
      if (dataset.kind === "timeZones" && !options.showTimeZoneLines) {
        return;
      }
      let stroke = coastlineColor;
      if (dataset.name.includes("rivers")) stroke = riverColor;
      if (dataset.name.includes("lakes")) stroke = lakeColor;
      if (dataset.kind === "geographicLines") stroke = geographicLineColor;
      if (dataset.kind === "timeZones") stroke = graticuleColor;
      const isTimeZones = dataset.kind === "timeZones";
      const isGeographic = dataset.kind === "geographicLines";
      svgSel
        .append("path")
        .datum(dataset.data)
        .attr("class", "winkel-boundary")
        .attr("fill", "none")
        .attr("stroke", stroke)
        .attr(
          "stroke-width",
          (isGeographic ? 0.5 : isTimeZones ? 0.55 : 0.7) * lineThickness,
        )
        .attr("opacity", isGeographic ? 0.8 : isTimeZones ? 0.6 : 0.9)
        .attr("clip-path", `url(#${clipId})`)
        .attr("d", this.pathGenerator);
    });
  }

  update() {
    if (!this.svg) return;
    const svgSel = this.svg as any;
    svgSel.selectAll("path").attr("d", this.pathGenerator as any);
  }
}
