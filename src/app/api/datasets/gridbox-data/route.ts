import { NextRequest, NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL ??
  process.env.DATA_BACKEND_URL ??
  "http://localhost:8000";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const datasetId = searchParams.get("datasetId");
  const timestampId = searchParams.get("timestampId");
  const levelId = searchParams.get("levelId");

  if (!datasetId || !timestampId || !levelId) {
    return NextResponse.json(
      {
        error: "Missing datasetId, timestampId, or levelId",
      },
      { status: 400 },
    );
  }

  const endpoint = `${DATA_SERVICE_URL}/api/v2/gridbox_data?datasetId=${encodeURIComponent(
    datasetId,
  )}&timestampId=${encodeURIComponent(timestampId)}&levelId=${encodeURIComponent(
    levelId,
  )}`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
    });

    const body = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        { error: response.statusText, details: body },
        { status: response.status },
      );
    }

    return new NextResponse(body, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch gridbox data", details: message },
      { status: 502 },
    );
  }
}
