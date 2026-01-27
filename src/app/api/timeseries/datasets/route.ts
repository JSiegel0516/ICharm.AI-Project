import { NextRequest, NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL ?? "http://localhost:8000";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = `${DATA_SERVICE_URL}/api/v2/timeseries/datasets?${searchParams}`;

    console.log("[FastAPI Datasets] Calling:", endpoint);

    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`FastAPI error: ${response.status}`);
    }

    const data = await response.json();
    console.log(
      "[FastAPI Datasets] Success:",
      Array.isArray(data) ? data.length : "unknown",
      "datasets",
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("[FastAPI Datasets] Failed:", error);
    return NextResponse.json(
      {
        error:
          "Failed to fetch FastAPI datasets: " +
          (error instanceof Error ? error.message : "Network Error"),
      },
      { status: 500 },
    );
  }
}
