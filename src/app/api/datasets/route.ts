import { NextResponse } from "next/server";
import { db } from "@/lib/db/index";
import { climateDataset } from "@/lib/db/schema";
import { eq, or, like, and, sql, SQL } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const stored = searchParams.get("stored"); // 'local' | 'cloud' | 'all'
    const source = searchParams.get("source");
    const search = searchParams.get("search");
    const focusCoordinates = searchParams.get("focusCoordinates");

    console.log("API called with filters:", {
      stored,
      source,
      search,
      focusCoordinates,
    });

    // Build conditions array with proper typing
    const conditions: SQL[] = [];

    if (stored && stored !== "all") {
      console.log(`Filtering by stored: ${stored}`);
      conditions.push(eq(climateDataset.Stored, stored));
    } else {
      console.log("Returning all datasets (no storage filter)");
    }

    if (source) {
      conditions.push(like(climateDataset.sourceName, `%${source}%`));
    }

    if (search) {
      const searchCondition = or(
        like(climateDataset.datasetName, `%${search}%`),
        like(climateDataset.slug, `%${search}%`),
        like(climateDataset.layerParameter, `%${search}%`),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    // Use $dynamic() to enable dynamic query building
    let query = db.select().from(climateDataset).$dynamic();

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    let datasets = await query;

    // Process focus coordinates
    if (focusCoordinates && focusCoordinates.trim()) {
      console.log("Processing focus coordinates:", focusCoordinates);

      const coordinatePairs = focusCoordinates
        .split(";")
        .map((pair) => pair.trim())
        .filter((pair) => pair.length > 0)
        .map((pair) => {
          const [lat, lon] = pair
            .split(",")
            .map((coord) => parseFloat(coord.trim()));
          return { lat, lon };
        })
        .filter((coord) => !isNaN(coord.lat) && !isNaN(coord.lon));

      if (coordinatePairs.length > 0) {
        console.log("Parsed coordinates:", coordinatePairs);
        datasets = datasets.map((dataset) => ({
          ...dataset,
          _focusCoordinates: coordinatePairs,
        }));
      }
    }

    // Normalize the field name - Add lowercase 'stored' field
    const normalizedDatasets = datasets.map((dataset) => ({
      ...dataset,
      stored: dataset.Stored, // Add lowercase version
    }));

    const cloudCount = normalizedDatasets.filter(
      (d) => d.stored === "cloud",
    ).length;
    const localCount = normalizedDatasets.filter(
      (d) => d.stored === "local",
    ).length;

    console.log(`Returning ${normalizedDatasets.length} datasets:`);
    console.log(`   - Cloud: ${cloudCount}`);
    console.log(`   - Local: ${localCount}`);

    if (focusCoordinates) {
      console.log(`   - Focus coordinates applied`);
    }

    return NextResponse.json({
      total: normalizedDatasets.length,
      datasets: normalizedDatasets,
      focusCoordinates: focusCoordinates || null,
    });
  } catch (error) {
    console.error("Failed to fetch datasets:", error);
    return NextResponse.json(
      { error: "Failed to fetch datasets", details: String(error) },
      { status: 500 },
    );
  }
}