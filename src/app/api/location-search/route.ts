"use server";

import { NextRequest } from "next/server";

const LLM_SERVICE_URL = (
  process.env.LLM_SERVICE_URL ?? "http://localhost:8001"
).replace(/\/$/, "");

type LocationSearchRequestPayload = {
  query?: string;
  limit?: number;
};

const DEFAULT_LIMIT = 5;

const normalizeLimit = (value: unknown) => {
  if (typeof value !== "number" && typeof value !== "string") {
    return DEFAULT_LIMIT;
  }
  const parsed =
    typeof value === "number" ? value : Number.parseInt(value, 10) || 0;
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(10, Math.max(1, parsed));
};

export async function POST(req: NextRequest) {
  let payload: LocationSearchRequestPayload;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = (payload.query ?? "").trim();
  if (!query) {
    return Response.json({ error: "Query is required" }, { status: 400 });
  }

  const limit = normalizeLimit(payload.limit);

  const url = `${LLM_SERVICE_URL}/v1/geocode/search`;
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    });
  } catch (error) {
    console.error("Location search proxy error:", error);
    return Response.json(
      { error: "Location service unavailable" },
      { status: 502 },
    );
  }

  if (!upstreamResponse.ok) {
    const detail = await upstreamResponse.text();
    console.error("Location search upstream error:", detail);
    return Response.json(
      { error: "Location search failed", detail },
      { status: upstreamResponse.status || 502 },
    );
  }

  const data = await upstreamResponse.json();
  return Response.json(data, { status: 200 });
}
