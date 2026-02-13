// Utility to transform database climate dataset records into UI Dataset format

interface DatabaseDataset {
  id: string;
  slug: string; // ⭐ ADD THIS
  sourceName: string;
  datasetName: string;
  layerParameter: string;
  statistic: string;
  datasetType: string;
  levels: string;
  levelValues: string | null;
  levelUnits: string | null;
  stored: string;
  inputFile: string;
  keyVariable: string;
  units: string;
  spatialResolution: string;
  engine: string;
  kerchunkPath: string | null;
  origLocation: string;
  startDate: string;
  endDate: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Dataset {
  id: string;
  slug: string; // ⭐ ADD THIS
  name: string;
  description: string;
  category: string;
  startDate: string;
  endDate: string;
  frequency: string;
  source: string;
  color: string;
}

// Color palette for categories
const CATEGORY_COLORS: { [key: string]: string } = {
  Temperature: "#ef4444", // red
  Climate: "#f97316", // orange
  Atmosphere: "#3b82f6", // blue
  Oceans: "#06b6d4", // cyan
  Precipitation: "#10b981", // green
  Hydrology: "#14b8a6", // teal
  Cryosphere: "#8b5cf6", // purple
  Vegetation: "#22c55e", // light green
  Wind: "#6366f1", // indigo
  Pressure: "#a855f7", // violet
  Other: "#64748b", // slate
};

// Fallback colors for datasets if category color is already used
const FALLBACK_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
];

/**
 * Convert date from "1854/1/1" or "9/1/2025" format to ISO "1854-01-01"
 */
function convertDate(dateStr: string): string {
  if (dateStr.toLowerCase() === "present") {
    return new Date().toISOString().split("T")[0];
  }

  // Handle "1854/1/1" or "9/1/2025" format
  const parts = dateStr.split("/");

  if (parts.length === 3) {
    let [part1, part2, part3] = parts;

    // Determine if format is M/D/YYYY or YYYY/M/D
    if (part1.length === 4) {
      // YYYY/M/D format
      const year = part1;
      const month = part2.padStart(2, "0");
      const day = part3.padStart(2, "0");
      return `${year}-${month}-${day}`;
    } else {
      // M/D/YYYY format
      const month = part1.padStart(2, "0");
      const day = part2.padStart(2, "0");
      const year = part3;
      return `${year}-${month}-${day}`;
    }
  }

  // Fallback - return as is
  return dateStr;
}

/**
 * Determine category based on layer parameter and dataset type
 */
function determineCategory(
  layerParameter: string,
  datasetType: string,
  levels: string,
): string {
  const param = layerParameter.toLowerCase();

  if (param.includes("temperature") || param.includes("temp")) {
    if (param.includes("sea") || param.includes("sst")) {
      return "Oceans";
    }
    return "Temperature";
  }

  if (param.includes("precipitation") || param.includes("precip")) {
    return "Precipitation";
  }

  if (param.includes("wind") || param.includes("velocity")) {
    return "Wind";
  }

  if (param.includes("pressure")) {
    return "Pressure";
  }

  if (param.includes("vegetation") || param.includes("ndvi")) {
    return "Vegetation";
  }

  if (param.includes("ice") || levels.toLowerCase().includes("ice")) {
    return "Cryosphere";
  }

  if (
    levels.toLowerCase().includes("ocean") ||
    levels.toLowerCase().includes("sea")
  ) {
    return "Oceans";
  }

  if (
    levels.toLowerCase().includes("atmosphere") ||
    levels.toLowerCase().includes("stratosphere")
  ) {
    return "Atmosphere";
  }

  return "Climate";
}

/**
 * Map statistic to frequency
 */
function mapFrequency(statistic: string): string {
  const stat = statistic.toLowerCase();

  if (stat.includes("monthly")) return "Monthly";
  if (stat.includes("daily")) return "Daily";
  if (stat.includes("annual") || stat.includes("yearly")) return "Annual";
  if (stat.includes("hourly")) return "Hourly";

  return "Variable";
}

/**
 * Get color for a dataset based on category
 */
function getColorForDataset(category: string, index: number): string {
  // Try to use category color first
  if (CATEGORY_COLORS[category]) {
    return CATEGORY_COLORS[category];
  }

  // Fallback to indexed color
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

/**
 * Transform a database climate dataset record into UI Dataset format
 */
export function transformDataset(
  dbDataset: DatabaseDataset,
  index: number,
): Dataset {
  const category = determineCategory(
    dbDataset.layerParameter,
    dbDataset.datasetType,
    dbDataset.levels,
  );

  return {
    id: dbDataset.id,
    slug: dbDataset.slug, // ⭐ PRESERVE THE SLUG
    name: dbDataset.layerParameter,
    description: `${dbDataset.datasetName} - ${dbDataset.statistic}`,
    category,
    startDate: convertDate(dbDataset.startDate),
    endDate: convertDate(dbDataset.endDate),
    frequency: mapFrequency(dbDataset.statistic),
    source: dbDataset.sourceName,
    color: getColorForDataset(category, index),
  };
}

/**
 * Transform an array of database datasets
 */
export function transformDatasets(dbDatasets: DatabaseDataset[]): Dataset[] {
  return dbDatasets.map((dataset, index) => transformDataset(dataset, index));
}
