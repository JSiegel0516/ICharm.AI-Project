// app/api/datasets/route.ts
// Updated to properly handle filtering and focus coordinates
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/index';
import { climateDataset } from '@/lib/db/schema';
import { eq, or, like, and, sql } from 'drizzle-orm';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const stored = searchParams.get('stored'); // 'local' | 'cloud' | 'all'
    const source = searchParams.get('source');
    const search = searchParams.get('search');
    const focusCoordinates = searchParams.get('focusCoordinates'); // New parameter
    
    console.log('API called with filters:', { stored, source, search, focusCoordinates });

    // Start with base query
    let query = db.select().from(climateDataset);
    const conditions = [];

    // Filter by storage type - IMPORTANT: only filter if NOT 'all'
    if (stored && stored !== 'all') {
      console.log(`Filtering by stored: ${stored}`);
      conditions.push(eq(climateDataset.Stored, stored));
    } else {
      console.log('Returning all datasets (no storage filter)');
    }

    // Filter by source
    if (source) {
      conditions.push(like(climateDataset.sourceName, `%${source}%`));
    }

    // Search across multiple fields
    if (search) {
      conditions.push(
        or(
          like(climateDataset.datasetName, `%${search}%`),
          like(climateDataset.slug, `%${search}%`),
          like(climateDataset.layerParameter, `%${search}%`)
        )
      );
    }

    // Apply filters if any
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    let datasets = await query;

    // Process focus coordinates if provided
    if (focusCoordinates && focusCoordinates.trim()) {
      console.log('Processing focus coordinates:', focusCoordinates);
      
      // Parse the coordinates string
      // Format: "lat1,lon1; lat2,lon2" or "lat1,lon1"
      const coordinatePairs = focusCoordinates
        .split(';')
        .map(pair => pair.trim())
        .filter(pair => pair.length > 0)
        .map(pair => {
          const [lat, lon] = pair.split(',').map(coord => parseFloat(coord.trim()));
          return { lat, lon };
        })
        .filter(coord => !isNaN(coord.lat) && !isNaN(coord.lon));

      if (coordinatePairs.length > 0) {
        console.log('Parsed coordinates:', coordinatePairs);
        
        // TODO: Implement spatial filtering based on coordinates
        // This could involve:
        // 1. Filtering datasets that have spatial coverage near these coordinates
        // 2. Ranking datasets by proximity to the coordinates
        // 3. Adding a 'distance' field to each dataset
        
        // For now, we'll add the parsed coordinates to the response
        datasets = datasets.map(dataset => ({
          ...dataset,
          _focusCoordinates: coordinatePairs
        }));
      }
    }

    // Log results for debugging
    const cloudCount = datasets.filter(d => d.Stored === 'cloud').length;
    const localCount = datasets.filter(d => d.Stored === 'local').length;
    console.log(`✅ Returning ${datasets.length} datasets:`);
    console.log(`   - Cloud: ${cloudCount}`);
    console.log(`   - Local: ${localCount}`);
    
    if (focusCoordinates) {
      console.log(`   - Focus coordinates applied`);
    }

    // Return in format expected by frontend
    return NextResponse.json({ 
      total: datasets.length,
      datasets: datasets,
      focusCoordinates: focusCoordinates || null
    });
  } catch (error) {
    console.error('❌ Failed to fetch datasets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch datasets', details: String(error) },
      { status: 500 }
    );
  }
}