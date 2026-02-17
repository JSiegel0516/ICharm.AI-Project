import type { Dataset } from "@/types";

const getDatasetIdentifierText = (dataset?: Dataset | null) => {
  if (!dataset) return "";
  const fields: Array<string | null | undefined> = [
    dataset.name,
    dataset.layerParameter,
    dataset.slug,
    dataset.id,
    dataset.sourceName,
    dataset.datasetShortName,
  ];
  return fields
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase())
    .join(" ");
};

const containsSeaSurfaceKeywords = (value?: string | null) => {
  if (!value) {
    return false;
  }
  const normalized = value.toLowerCase();
  return (
    normalized.includes("sea surface temperature") ||
    normalized.includes("sea-surface temperature") ||
    normalized.includes("medsst") ||
    normalized.includes("sst")
  );
};

export const isSeaSurfaceTemperatureDataset = (
  dataset?: Dataset | null,
): boolean => {
  if (!dataset) {
    return false;
  }

  if (containsSeaSurfaceKeywords(dataset.name)) {
    return true;
  }

  const fields: Array<string | null | undefined> = [
    dataset.name,
    dataset.layerParameter,
    dataset.slug,
    dataset.id,
  ];

  return fields.some(containsSeaSurfaceKeywords);
};

export const isOceanOnlyDataset = (dataset?: Dataset | null): boolean => {
  if (!dataset) return false;
  const datasetText = getDatasetIdentifierText(dataset);
  if (!datasetText) return false;

  const oceanKeywords = [
    "sea surface",
    "sea-surface",
    "sst",
    "ersst",
    "godas",
    "ocean data assimilation",
    "global ocean data assimilation",
    "ncep global ocean data assimilation",
    "ocean reanalysis",
    "ocean temperature",
  ];

  const oceanExclusions = [
    "air temperature",
    "2m temperature",
    "t2m",
    "land surface",
    "skin temperature",
    "global surface temperature",
    "global temp",
  ];

  const hasOceanKeyword = oceanKeywords.some((keyword) =>
    datasetText.includes(keyword),
  );
  if (!hasOceanKeyword) return false;

  const hasExclusion = oceanExclusions.some((keyword) =>
    datasetText.includes(keyword),
  );
  return !hasExclusion;
};
