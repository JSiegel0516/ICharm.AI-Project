import { NextRequest, NextResponse } from 'next/server';

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL ?? process.env.DATA_BACKEND_URL ?? 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    const response = await fetch(`${DATA_SERVICE_URL}/cdr/precip_timeseries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get('content-type') ?? 'application/json';
    const bodyText = await response.text();

    return new NextResponse(bodyText, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    console.error('Failed to reach data API for CMORPH timeseries', error);
    return NextResponse.json(
      { error: 'Failed to reach dataset service' },
      { status: 502 }
    );
  }
}
