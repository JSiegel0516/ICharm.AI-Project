import { NextRequest, NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL ??
  process.env.DATA_BACKEND_URL ??
  "http://localhost:8000";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ station_id: string }> }
) {
  try {
    const { station_id } = await context.params;
    const { searchParams } = new URL(request.url);
    const start_date = searchParams.get("start_date");
    const end_date = searchParams.get("end_date");

    // Build query params
    const queryParams = new URLSearchParams();
    if (start_date) queryParams.append("start_date", start_date);
    if (end_date) queryParams.append("end_date", end_date);

    const endpoint = `${DATA_SERVICE_URL}/api/v2/stations/${station_id}/timeseries${
      queryParams.toString() ? `?${queryParams}` : ""
    }`;

    console.log("[Station Timeseries API] Request:", {
      endpoint,
      station_id,
      start_date,
      end_date,
    });

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Station Timeseries API] Backend error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });

      return NextResponse.json(
        {
          error: `Backend error: ${response.statusText}`,
          details: errorText,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    console.log("[Station Timeseries API] Success:", {
      station_id: data.station_id,
      record_count: data.record_count,
    });

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[Station Timeseries API] Request failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const isTimeout =
      errorMessage.includes("timeout") || errorMessage.includes("aborted");

    return NextResponse.json(
      {
        error: isTimeout
          ? "Request timeout - backend may be processing data"
          : "Failed to fetch station timeseries",
        details: errorMessage,
      },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
