import { NextResponse } from 'next/server';
import { normalizeDatasets, type BackendDatasetRecord } from '@/lib/datasets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL ?? process.env.DATA_BACKEND_URL ?? 'http://localhost:8000';

export async function GET() {
  if (!DATA_SERVICE_URL) {
    return NextResponse.json(
      { error: 'DATA_SERVICE_URL is not configured' },
      { status: 500 }
    );
  }

  const requestUrl = new URL('/datasets', DATA_SERVICE_URL);

  try {
    const response = await fetch(requestUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        {
          error: `Dataset service responded with ${response.status}`,
          details: text || null,
        },
        { status: 502 }
      );
    }

    const payload = await response.json();
    const records: BackendDatasetRecord[] = Array.isArray(payload)
      ? payload
      : payload?.datasets ?? [];

    const datasets = normalizeDatasets(records);
    return NextResponse.json({ datasets });
  } catch (error) {
    console.error('Failed to fetch datasets from backend', error);
    return NextResponse.json(
      {
        error: 'Failed to reach dataset backend',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
