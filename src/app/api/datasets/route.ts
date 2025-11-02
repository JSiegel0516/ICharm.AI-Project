import { NextResponse } from "next/server";
import { db } from "@/lib/db/index";
import { climateDataset } from "@/lib/db/schema";

export async function GET() {
  try {
    const datasets = await db.select().from(climateDataset);

    return NextResponse.json({ datasets });
  } catch (error) {
    console.error("Failed to fetch datasets:", error);
    return NextResponse.json(
      { error: "Failed to fetch datasets" },
      { status: 500 },
    );
  }
}
