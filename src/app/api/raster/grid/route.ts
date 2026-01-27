import { NextRequest, NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL ??
  process.env.DATA_BACKEND_URL ??
  "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    console.log("[Raster Grid API] Request:", {
      datasetId: payload.datasetId,
      date: payload.date,
      level: payload.level,
      minValue: payload.minValue ?? payload.min,
      maxValue: payload.maxValue ?? payload.max,
      serviceUrl: DATA_SERVICE_URL,
    });

    const endpoint = `${DATA_SERVICE_URL}/api/v2/raster/grid`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Raster Grid API] Backend error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });

      return NextResponse.json(
        {
          error: `Backend error: ${response.statusText}`,
          details: errorText,
          endpoint,
        },
        { status: response.status },
      );
    }

    const data = await response.json();

    if (!data.values || !Array.isArray(data.lat) || !Array.isArray(data.lon)) {
      console.error("[Raster Grid API] Invalid response structure:", data);
      return NextResponse.json(
        { error: "Invalid response structure from backend" },
        { status: 500 },
      );
    }

    console.log("[Raster Grid API] Success:", {
      shape: data.shape,
      valueRange: data.valueRange,
      units: data.units,
    });

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[Raster Grid API] Request failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const isTimeout =
      errorMessage.includes("timeout") || errorMessage.includes("aborted");

    return NextResponse.json(
      {
        error: isTimeout
          ? "Request timeout - backend may be processing large dataset"
          : "Failed to generate raster grid",
        details: errorMessage,
        serviceUrl: DATA_SERVICE_URL,
      },
      { status: isTimeout ? 504 : 502 },
    );
  }
}
