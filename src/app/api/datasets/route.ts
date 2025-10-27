// app/api/datasets/route.ts
// Updated to properly handle filtering and return all datasets

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
    
    console.log('API called with filters:', { stored, source, search });
    
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
    
    const datasets = await query;
    
    // Log results for debugging
    const cloudCount = datasets.filter(d => d.Stored === 'cloud').length;
    const localCount = datasets.filter(d => d.Stored === 'local').length;
    
    console.log(`✅ Returning ${datasets.length} datasets:`);
    console.log(`   - Cloud: ${cloudCount}`);
    console.log(`   - Local: ${localCount}`);
    
    // Return in format expected by frontend
    return NextResponse.json({ 
      total: datasets.length,
      datasets: datasets 
    });
    
  } catch (error) {
    console.error('❌ Failed to fetch datasets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch datasets', details: String(error) },
      { status: 500 }
    );
  }
}