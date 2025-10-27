import { NextRequest, NextResponse } from 'next/server';

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL ??
  process.env.DATA_BACKEND_URL ??
  'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();

    const candidatePaths = [
      '/api/v2/raster/visualize',
      '/api/raster/visualize',
      '/raster/visualize',
    ];

    let response: Response | null = null;

    for (const suffix of candidatePaths) {
      const endpoint = `${DATA_SERVICE_URL}${suffix}`;
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: payload,
      });

      if (response.ok || response.status !== 404) {
        break;
      }
    }

    if (!response) {
      throw new Error('Failed to reach raster visualization service');
    }

    const contentType =
      response.headers.get('content-type') ?? 'application/json';
    const responseBody = await response.text();

    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    console.error('Failed to reach raster visualization service', error);
    return NextResponse.json(
      { error: 'Failed to generate raster visualization' },
      { status: 502 }
    );
  }
}
