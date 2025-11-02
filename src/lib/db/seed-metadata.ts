import { fileURLToPath } from "url";
import { dirname, join } from "path";
import * as fs from "fs";
import { randomUUID } from "crypto";
import { db } from "./index";
import { climateDataset } from "./schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function seedDatasets() {
  console.log("🌱 Reading metadata.csv...");

  // Absolute path to the CSV
  const csvPath = join(__dirname, "metadata.csv");
  const csvContent = fs.readFileSync(csvPath, "utf-8");

  const lines = csvContent.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());

  console.log(`📊 Found ${lines.length - 1} datasets to import`);

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

    // Map CSV columns to your schema exactly
    return {
      id: randomUUID(),
      sourceName: row.sourceName,
      datasetName: row.datasetName,
      layerParameter: row.layerParameter,
      statistic: row.statistic,
      datasetType: row.datasetType,
      levels: row.levels,
      levelValues: row.levelValues === "None" ? null : row.levelValues,
      levelUnits: row.levelUnits === "None" ? null : row.levelUnits,
      Stored: row.Stored, // Capital S to match CSV header
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
    console.log("💾 Inserting datasets into database...");
    await db.insert(climateDataset).values(datasets);
    console.log(`✅ Successfully seeded ${datasets.length} datasets`);
  } catch (error) {
    console.error("❌ Error seeding datasets:", error);
  }

  process.exit(0);
}

seedDatasets();
