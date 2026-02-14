const UPSTREAM_TILE_URL =
  "https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/{z}/{x}/{y}.mvt";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z, x, y } = await params;
  const upstreamUrl = UPSTREAM_TILE_URL.replace("{z}", z)
    .replace("{x}", x)
    .replace("{y}", y);

  const upstream = await fetch(upstreamUrl, {
    signal: request.signal,
  });

  if (!upstream.ok) {
    return new Response(null, { status: upstream.status });
  }

  const buffer = await upstream.arrayBuffer();
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/x-protobuf",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
