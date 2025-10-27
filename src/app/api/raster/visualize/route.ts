import { NextRequest, NextResponse } from 'next/server';

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL ??
  process.env.DATA_BACKEND_URL ??
  'http://localhost:8002';  // UPDATED: Backend runs on port 8002

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    
    // Log the request for debugging
    console.log('[Raster API] Request:', {
      datasetId: payload.datasetId,
      date: payload.date,
      level: payload.level,
      serviceUrl: DATA_SERVICE_URL
    });

    // Try the correct endpoint first (based on your FastAPI main.py)
    const endpoint = `${DATA_SERVICE_URL}/api/v2/raster/visualize`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Raster API] Backend error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      
      return NextResponse.json(
        { 
          error: `Backend error: ${response.statusText}`,
          details: errorText,
          endpoint 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Validate response structure
    if (!data.textures || !Array.isArray(data.textures)) {
      console.error('[Raster API] Invalid response structure:', data);
      return NextResponse.json(
        { error: 'Invalid response structure from backend' },
        { status: 500 }
      );
    }
    
    console.log('[Raster API] Success:', {
      textureCount: data.textures.length,
      valueRange: data.valueRange,
      units: data.units
    });

    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('[Raster API] Request failed:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('aborted');
    
    return NextResponse.json(
      { 
        error: isTimeout 
          ? 'Request timeout - backend may be processing large dataset'
          : 'Failed to generate raster visualization',
        details: errorMessage,
        serviceUrl: DATA_SERVICE_URL
      },
      { status: isTimeout ? 504 : 502 }
    );
  }
}