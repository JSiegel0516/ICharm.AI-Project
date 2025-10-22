import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL ?? process.env.DATA_BACKEND_URL ?? 'http://localhost:8000';

export async function POST(request: NextRequest) {
  if (!DATA_SERVICE_URL) {
    return NextResponse.json(
      { error: 'DATA_SERVICE_URL is not configured' },
      { status: 500 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid JSON payload', details: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  const requestUrl = new URL('/datasets/raster', DATA_SERVICE_URL);

  try {
    const response = await fetch(requestUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get('content-type') ?? 'application/json';
    const bodyText = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Raster request failed with status ${response.status}`,
          details: bodyText || null,
        },
        { status: response.status === 404 ? 404 : 502 },
      );
    }

    return new NextResponse(bodyText, {
      status: 200,
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    console.error('Failed to fetch raster data from backend', error);
    return NextResponse.json(
      {
        error: 'Failed to reach dataset backend',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
