import { db } from "./index";
import { climateDataset } from "./schema";
import { randomUUID } from "crypto";
import * as fs from "fs";

async function seedDatasets() {
  console.log("🌱 Reading metadata.csv...");

  // Read the CSV file
  const csvContent = fs.readFileSync("./metadata.csv", "utf-8");
  
  // Split into lines and get headers
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  console.log(`📊 Found ${lines.length - 1} datasets to import`);

  // Parse each data row
  const datasets = lines.slice(1).map(line => {
    // Simple CSV parsing (handles quoted fields)
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim()); // Add last value
    
    // Create object from headers and values
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    // Transform to match schema
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
      stored: row.Stored, // Note: Capital S in CSV
      inputFile: row.inputFile,
      keyVariable: row.keyVariable,
      units: row.units,
      spatialResolution: row.spatialResolution,
      engine: row.engine,
      kerchunkPath: row.kerchunkPath === "None" ? null : row.kerchunkPath,
      origLocation: row.origLocation,
      startDate: row.startDate,
      endDate: row.endDate,
    };
  });

  try {
    console.log("💾 Inserting datasets into database...");
    await db.insert(climateDataset).values(datasets);
    console.log(`✅ Successfully seeded ${datasets.length} climate datasets`);
  } catch (error) {
    console.error("❌ Error seeding datasets:", error);
    throw error;
  }

  process.exit(0);
}

seedDatasets();