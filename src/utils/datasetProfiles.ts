import { ConversationContextPayload } from "@/types";

export type DatasetProfile = {
  id: string;
  name: string;
  aliases: string[];
  units: string;
  valueType: "absolute" | "anomaly";
  defaultAggregation: "monthly" | "annual";
  spatialResolution: string;
  coverage: { start: string; end: string | null };
  caveats: string[];
};

const profiles: DatasetProfile[] = [
  {
    id: "20crv3-air",
    name: "NOAA/CIRES/DOE 20th Century Reanalysis (V3)",
    aliases: ["20th century reanalysis", "20cr v3", "20crv3", "20cr"],
    units: "K",
    valueType: "absolute",
    defaultAggregation: "monthly",
    spatialResolution: "~1.0°",
    coverage: { start: "1806-01-01", end: "2015-12-31" },
    caveats: [
      "Ensemble mean; coarse resolution can smooth coastal/complex terrain signals",
      "Archive stops in 2015; do not extend beyond the end date",
      "Multi-level product; ensure the level matches the query intent",
    ],
  },
  {
    id: "noaaglobaltemp",
    name: "NOAA Global Surface Temperature (NOAAGlobalTemp)",
    aliases: ["noaa global temp", "noaa global surface temperature"],
    units: "°C anomaly",
    valueType: "anomaly",
    defaultAggregation: "monthly",
    spatialResolution: "~5.0°",
    coverage: { start: "1850-01-01", end: null },
    caveats: [
      "Reported as anomalies vs a 20th-century baseline",
      "Coarse grid; small coastal cities blend land/ocean cells",
    ],
  },
  {
    id: "ersst-v5",
    name: "NOAA ERSST V5",
    aliases: ["ersst", "ersst v5", "sea surface temperature", "sst"],
    units: "°C",
    valueType: "absolute",
    defaultAggregation: "monthly",
    spatialResolution: "~2.0°",
    coverage: { start: "1854-01-01", end: null },
    caveats: [
      "Ocean-only; coastal values may be interpolated",
      "Limited land coverage—use air temperature datasets over land",
    ],
  },
  {
    id: "gpcp-monthly",
    name: "GPCP Monthly",
    aliases: ["gpcp", "precipitation", "gpcp monthly"],
    units: "mm/day",
    valueType: "absolute",
    defaultAggregation: "monthly",
    spatialResolution: "~2.5°",
    coverage: { start: "1979-01-01", end: null },
    caveats: [
      "Satellite-gauge blend; polar regions have higher uncertainty",
      "Units are mm/day monthly means",
    ],
  },
  {
    id: "godas",
    name: "NCEP GODAS",
    aliases: ["godas", "ocean reanalysis"],
    units: "varies",
    valueType: "absolute",
    defaultAggregation: "monthly",
    spatialResolution: "~0.33° lon × 1.0° lat",
    coverage: { start: "1980-01-01", end: null },
    caveats: [
      "Ocean-only; select depth level as needed",
      "Some variables are currents/velocity rather than temperature",
    ],
  },
];

export const datasetProfiles = profiles;

export function findDatasetProfile(
  queryText?: string | null,
  context?: ConversationContextPayload | null,
): DatasetProfile | null {
  if (!queryText && !context) {
    return null;
  }

  const normalizedQuery = (queryText ?? "").toLowerCase();
  const candidates = profiles;

  // 1) Prefer the dataset from context if it matches by name or id.
  const contextName = context?.datasetName?.toLowerCase()?.trim();
  const contextId = context?.datasetId?.toLowerCase()?.trim();
  const contextHit =
    candidates.find(
      (p) =>
        (contextName && contextName.includes(p.name.toLowerCase())) ||
        (contextId && contextId === p.id) ||
        (contextName &&
          p.aliases.some((alias) => contextName.includes(alias.toLowerCase()))),
    ) ?? null;
  if (contextHit) {
    return contextHit;
  }

  // 2) Check for aliases mentioned in the query.
  const queryHit =
    candidates.find(
      (p) =>
        normalizedQuery.includes(p.name.toLowerCase()) ||
        p.aliases.some((alias) =>
          normalizedQuery.includes(alias.toLowerCase()),
        ),
    ) ?? null;
  if (queryHit) {
    return queryHit;
  }

  return null;
}

export function describeProfile(profile: DatasetProfile): string {
  const coverageEnd = profile.coverage.end ?? "present";
  return `${profile.name} (${profile.units}, ${profile.defaultAggregation} ${profile.valueType === "anomaly" ? "anomalies" : "means"}, ${profile.spatialResolution}, ${profile.coverage.start}–${coverageEnd})`;
}
