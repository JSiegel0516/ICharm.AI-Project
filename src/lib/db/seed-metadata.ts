import { fileURLToPath } from "url";
import { dirname, join } from "path";
import * as fs from "fs";
import { randomUUID } from "crypto";
import { db } from "./index";
import { climateDataset } from "./schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Abbreviation mapping for common terms
 */
const ABBREVIATIONS: Record<string, string> = {
  temperature: "temp",
  precipitation: "precip",
  surface: "sfc",
  global: "gbl",
  extended: "ext",
  reconstructed: "recon",
  reanalysis: "reanl",
  assimilation: "assim",
  system: "sys",
  climatology: "clim",
  project: "proj",
  analysis: "anl",
  product: "prod",
  optimum: "opt",
  interpolation: "interp",
  normalized: "norm",
  difference: "diff",
  vegetation: "veg",
  index: "idx",
  monthly: "mon",
  layer: "lyr",
};

/**
 * Generate a SHORT URL-friendly slug from a dataset name
 */
function generateSlug(name: string): string {
  let slug = name.toLowerCase().trim();

  // Apply abbreviations
  Object.entries(ABBREVIATIONS).forEach(([full, abbr]) => {
    slug = slug.replace(new RegExp(`\\b${full}\\b`, "g"), abbr);
  });

  // Remove common filler words
  slug = slug.replace(/\b(the|a|an|and|or|of|in|on|at|to|for|with|by)\b/g, "");

  // Remove parentheses and their contents
  slug = slug.replace(/\([^)]*\)/g, "");

  // Replace special characters and spaces with hyphens
  slug = slug.replace(/[^a-z0-9]+/g, "-");

  // Remove leading/trailing hyphens
  slug = slug.replace(/^-+|-+$/g, "");

  // Replace multiple consecutive hyphens with single hyphen
  slug = slug.replace(/-+/g, "-");

  // Limit to 25 characters max
  if (slug.length > 25) {
    // Try to cut at a hyphen boundary
    const truncated = slug.substring(0, 25);
    const lastHyphen = truncated.lastIndexOf("-");
    slug = lastHyphen > 15 ? truncated.substring(0, lastHyphen) : truncated;
  }

  return slug;
}

/**
 * Generate a unique slug by appending a number if necessary
 */
function generateUniqueSlug(name: string, existingSlugs: Set<string>): string {
  let slug = generateSlug(name);

  // If slug is too long and needs a counter, make room for it
  const maxBaseLength = 23; // Leave room for -99
  if (slug.length > maxBaseLength) {
    slug = slug.substring(0, maxBaseLength);
    // Remove trailing hyphen if cut mid-word
    slug = slug.replace(/-+$/, "");
  }

  let counter = 2;
  const originalSlug = slug;

  // If slug already exists, append a number
  while (existingSlugs.has(slug)) {
    slug = `${originalSlug}-${counter}`;
    counter++;
  }

  return slug;
}

async function seedDatasets() {
  console.log("🌱 Reading metadata.csv...");

  // Absolute path to the CSV
  const csvPath = join(__dirname, "metadata.csv");
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());

  console.log(`📊 Found ${lines.length - 1} datasets to import`);

  const usedSlugs = new Set<string>();

  const datasets = lines.slice(1).map((line) => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    // Manual CSV parsing to handle quoted commas
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = values[i] || "";
    });

    // Generate unique slug from datasetName
    const slug = generateUniqueSlug(row.datasetName, usedSlugs);
    usedSlugs.add(slug);

    console.log(`  → "${row.datasetName}"`);
    console.log(`     ${slug} (${slug.length} chars)`);

    // Map CSV columns to your schema exactly
    return {
      id: randomUUID(),
      slug,
      sourceName: row.sourceName,
      datasetName: row.datasetName,
      layerParameter: row.layerParameter,
      statistic: row.statistic,
      datasetType: row.datasetType,
      levels: row.levels,
      levelValues: row.levelValues === "None" ? null : row.levelValues,
      levelUnits: row.levelUnits === "None" ? null : row.levelUnits,
      Stored: row.Stored,
      inputFile: row.inputFile,
      keyVariable: row.keyVariable,
      units: row.units,
      spatialResolution: row.spatialResolution,
      engine: row.engine,
      kerchunkPath: row.kerchunkPath === "None" ? null : row.kerchunkPath,
      origLocation: row.origLocation,
      startDate: row.startDate,
      endDate: row.endDate,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  try {
    console.log("\nResetting climateDataset table from metadata.csv...");

    // dev-only: blow away existing rows, keep DB in sync with CSV
    await db.delete(climateDataset);

    await db.insert(climateDataset).values(datasets);
    console.log(`Successfully seeded ${datasets.length} datasets with slugs`);

    // Show all slugs and total URL length
    console.log("\n📝 All slugs generated:");
    const totalLength = datasets.reduce((sum, d) => sum + d.slug.length, 0);
    datasets.forEach((d) => {
      console.log(`   ${d.slug}`);
    });
    console.log(`\nTotal characters: ${totalLength}`);
    console.log(
      `Average per slug: ${(totalLength / datasets.length).toFixed(1)}`,
    );
    console.log(`\nExample URL with all datasets:`);
    console.log(
      `/timeseries?datasets=${datasets.map((d) => d.slug).join(",")}`,
    );
  } catch (error) {
    console.error("❌ Error seeding datasets:", error);
  }

  process.exit(0);
}

seedDatasets();
