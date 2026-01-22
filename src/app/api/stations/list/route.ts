import { NextRequest, NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL ??
  process.env.DATA_BACKEND_URL ??
  "http://localhost:8000";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bbox = searchParams.get("bbox");
    const limit = searchParams.get("limit");
    const year = searchParams.get("year");
    const month = searchParams.get("month");

    // Build query params
    const params = new URLSearchParams();
    if (bbox) params.append("bbox", bbox);
    if (limit) params.append("limit", limit);
    if (year) params.append("year", year);
    if (month) params.append("month", month);

    const endpoint = `${DATA_SERVICE_URL}/api/v2/stations/list${params.toString() ? `?${params}` : ""}`;

    console.log("[Stations API] Request:", {
      endpoint,
      bbox,
      limit,
      year,
      month,
      serviceUrl: DATA_SERVICE_URL,
    });

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Stations API] Backend error:", {
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

    // Validate response structure
    if (!data.stations || !Array.isArray(data.stations)) {
      console.error("[Stations API] Invalid response structure:", data);
      return NextResponse.json(
        { error: "Invalid response structure from backend" },
        { status: 500 },
      );
    }

    console.log("[Stations API] Success:", {
      stationCount: data.stations.length,
      totalAvailable: data.total_available,
      year,
      month,
    });

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[Stations API] Request failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const isTimeout =
      errorMessage.includes("timeout") || errorMessage.includes("aborted");

    return NextResponse.json(
      {
        error: isTimeout
          ? "Request timeout - backend may be processing large dataset"
          : "Failed to fetch stations",
        details: errorMessage,
        serviceUrl: DATA_SERVICE_URL,
      },
      { status: isTimeout ? 504 : 502 },
    );
  }
}
