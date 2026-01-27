import type { Dataset } from "@/types";

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
    dataset.description,
    dataset?.units,
    dataset.name,
    dataset.layerParameter,
    dataset.dataType,
  ];

  return fields.some(containsSeaSurfaceKeywords);
};
