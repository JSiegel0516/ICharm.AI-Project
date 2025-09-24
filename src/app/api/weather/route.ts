import { NextRequest, NextResponse } from 'next/server';

export interface WeatherDataPoint {
  lat: number;
  lng: number;
  value: number;
  timestamp: string;
}

export interface WeatherApiResponse {
  success: boolean;
  data: WeatherDataPoint[];
  metadata: {
    dataset: string;
    units: string;
    timeRange: {
      start: string;
      end: string;
    };
    totalPoints: number;
  };
  error?: string;
}

// Mock weather data generator
function generateMockWeatherData(dataset: string): WeatherDataPoint[] {
  const data: WeatherDataPoint[] = [];
  const now = new Date();

  // Generate data points for a global grid
  for (let lat = -90; lat <= 90; lat += 10) {
    for (let lng = -180; lng <= 180; lng += 10) {
      let value: number;

      switch (dataset) {
        case 'air-temp-monthly':
          // Temperature varies with latitude and some randomness
          value = 30 * Math.cos((lat * Math.PI) / 180) + Math.random() * 10 - 5;
          break;
        case 'precipitation-monthly':
          // Higher precipitation near equator and mid-latitudes
          value = Math.max(
            0,
            200 * (1 - Math.abs(lat) / 90) + Math.random() * 100
          );
          break;
        case 'sea-surface-temp':
          // Ocean temperature, only for ocean areas (simplified)
          if (Math.abs(lng) > 20 || Math.abs(lat) < 60) {
            value = 25 * Math.cos((lat * Math.PI) / 180) + Math.random() * 5;
          } else {
            continue; // Skip land areas
          }
          break;
        default:
          value = Math.random() * 50 - 25;
      }

      data.push({
        lat,
        lng,
        value: Math.round(value * 10) / 10,
        timestamp: now.toISOString(),
      });
    }
  }

  return data;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dataset = searchParams.get('dataset') || 'air-temp-monthly';
    const format = searchParams.get('format') || 'json';

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    const data = generateMockWeatherData(dataset);

    const response: WeatherApiResponse = {
      success: true,
      data,
      metadata: {
        dataset,
        units: dataset.includes('temp')
          ? '°C'
          : dataset.includes('precipitation')
            ? 'mm'
            : 'units',
        timeRange: {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString(),
        },
        totalPoints: data.length,
      },
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error('Weather API error:', error);

    const errorResponse: WeatherApiResponse = {
      success: false,
      data: [],
      metadata: {
        dataset: 'unknown',
        units: '',
        timeRange: { start: '', end: '' },
        totalPoints: 0,
      },
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { dataset, dateRange, region } = body;

    // Handle POST requests for more complex queries
    // This would integrate with real weather APIs in production

    return NextResponse.json({
      success: true,
      message: 'Weather data request received',
      query: { dataset, dateRange, region },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400 }
    );
  }
}
