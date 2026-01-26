import { NextRequest, NextResponse } from "next/server";

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    console.log("[Timeseries Extract] Request:", {
      datasetIds: payload.datasetIds,
      startDate: payload.startDate,
      endDate: payload.endDate,
      serviceUrl: DATA_SERVICE_URL,
    });

    const endpoint = `${DATA_SERVICE_URL}/api/v2/timeseries/extract`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Timeseries Extract] Backend error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });

      return NextResponse.json(
        { error: `Backend error: ${response.statusText}`, details: errorText, endpoint },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("[Timeseries Extract] Success:", {
      dataPoints: data.data?.length || 0,
      processingTime: data.processingInfo?.processingTime,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[Timeseries Extract] Request failed:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isTimeout = errorMessage.includes("timeout") || errorMessage.includes("aborted");

    return NextResponse.json(
      {
        error: isTimeout
          ? "Request timeout - processing large dataset may take longer"
          : "Failed to extract time series data",
        details: errorMessage,
        serviceUrl: DATA_SERVICE_URL,
      },
      { status: isTimeout ? 504 : 502 }
    );
  }
}