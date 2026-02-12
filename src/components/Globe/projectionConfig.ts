import type { GeoProjection } from "d3-geo";
import {
  geoConicEquidistant,
  geoNaturalEarth1,
  geoStereographic,
} from "d3-geo";
import {
  geoArmadillo,
  geoAugust,
  geoBaker,
  geoBerghaus,
  geoCraig,
  geoFoucaut,
  geoHammerRetroazimuthal,
  geoHomolosine,
  geoLoximuthal,
  geoMollweide,
  geoPatterson,
  geoPeirceQuincuncial,
  geoPolyconic,
  geoPolyhedralWaterman,
  geoSinuMollweide,
  geoSinusoidal,
  geoWinkel3,
} from "d3-geo-projection";
import type { MapProjectionId } from "@/types";

const ATLANTIS_ROTATE: [number, number, number] = [30, -30, 0];
const STEREOGRAPHIC_ROTATE: [number, number, number] = [0, -15, 0];

export const MAP_PROJECTIONS: Array<{ id: MapProjectionId; label: string }> = [
  { id: "winkel", label: "Winkel Tripel (2D)" },
  { id: "atlantis", label: "Atlantis (2D)" },
  { id: "armadillo", label: "Armadillo (2D)" },
  { id: "august", label: "August (2D)" },
  { id: "baker", label: "Baker (2D)" },
  { id: "berghaus", label: "Berghaus (2D)" },
  { id: "craig", label: "Craig (2D)" },
  { id: "foucaut", label: "Foucaut (2D)" },
  { id: "hammerRetroazimuthal", label: "Hammer Retroazimuthal (2D)" },
  { id: "homolosine", label: "Homolosine (2D)" },
  { id: "loximuthal", label: "Loximuthal (2D)" },
  { id: "naturalEarth", label: "Natural Earth (2D)" },
  { id: "peirceQuincuncial", label: "Peirce Quincuncial (2D)" },
  { id: "polyconic", label: "Polyconic (2D)" },
  { id: "sinuMollweide", label: "Sinu-Mollweide (2D)" },
  { id: "conicEquidistant", label: "Conic Equidistant (2D)" },
  { id: "patterson", label: "Patterson (2D)" },
  { id: "stereographic", label: "Stereographic (2D)" },
  { id: "sinusoidal", label: "Sinusoidal (2D)" },
  { id: "waterman", label: "Waterman Butterfly (2D)" },
];

export const createProjection = (id: MapProjectionId): GeoProjection => {
  switch (id) {
    case "atlantis":
      return geoMollweide().rotate(ATLANTIS_ROTATE);
    case "armadillo":
      return geoArmadillo();
    case "august":
      return geoAugust();
    case "baker":
      return geoBaker();
    case "berghaus":
      return geoBerghaus();
    case "craig":
      return geoCraig();
    case "foucaut":
      return geoFoucaut();
    case "hammerRetroazimuthal":
      return geoHammerRetroazimuthal();
    case "homolosine":
      return geoHomolosine();
    case "loximuthal":
      return geoLoximuthal();
    case "naturalEarth":
      return geoNaturalEarth1();
    case "peirceQuincuncial":
      return geoPeirceQuincuncial();
    case "polyconic":
      return geoPolyconic();
    case "sinuMollweide":
      return geoSinuMollweide();
    case "conicEquidistant":
      return geoConicEquidistant();
    case "patterson":
      return geoPatterson();
    case "stereographic":
      return geoStereographic().rotate(STEREOGRAPHIC_ROTATE).clipAngle(90);
    case "sinusoidal":
      return geoSinusoidal();
    case "waterman":
      return geoPolyhedralWaterman();
    case "winkel":
    default:
      return geoWinkel3();
  }
};
