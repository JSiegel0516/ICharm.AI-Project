import type { GeoProjection } from "d3-geo";
import { geoConicEquidistant, geoStereographic } from "d3-geo";
import {
  geoMollweide,
  geoPatterson,
  geoPolyhedralWaterman,
  geoWinkel3,
} from "d3-geo-projection";
import type { MapProjectionId } from "@/types";

const ATLANTIS_ROTATE: [number, number, number] = [30, -30, 0];

export const MAP_PROJECTIONS: Array<{ id: MapProjectionId; label: string }> = [
  { id: "winkel", label: "Winkel Tripel (2D)" },
  { id: "atlantis", label: "Atlantis (2D)" },
  { id: "conicEquidistant", label: "Conic Equidistant (2D)" },
  { id: "patterson", label: "Patterson (2D)" },
  { id: "stereographic", label: "Stereographic (2D)" },
  { id: "waterman", label: "Waterman Butterfly (2D)" },
];

export const createProjection = (id: MapProjectionId): GeoProjection => {
  switch (id) {
    case "atlantis":
      return geoMollweide().rotate(ATLANTIS_ROTATE);
    case "conicEquidistant":
      return geoConicEquidistant();
    case "patterson":
      return geoPatterson();
    case "stereographic":
      return geoStereographic();
    case "waterman":
      return geoPolyhedralWaterman();
    case "winkel":
    default:
      return geoWinkel3();
  }
};
