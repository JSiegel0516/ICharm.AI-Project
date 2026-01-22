#!/usr/bin/env python3
"""
Load GHCN-M data into PostgreSQL database.
Creates ghcnm_tavg_timeseries table and loads station data.
"""

import argparse
import os
import sys
from pathlib import Path
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from icharm.dataset_processing.ghcnm_parser import GHCNMParser


def create_table(conn):
    """Create the ghcnm_tavg_timeseries table if it doesn't exist."""
    
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS ghcnm_tavg_timeseries (
        id TEXT NOT NULL,
        year INTEGER NOT NULL,
        element TEXT NOT NULL,
        month INTEGER NOT NULL,
        value DOUBLE PRECISION,
        mflag TEXT,
        qflag TEXT,
        sflag TEXT,
        date TIMESTAMP NOT NULL,
        PRIMARY KEY (id, date)
    );
    
    -- Create indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_ghcnm_id ON ghcnm_tavg_timeseries(id);
    CREATE INDEX IF NOT EXISTS idx_ghcnm_date ON ghcnm_tavg_timeseries(date);
    CREATE INDEX IF NOT EXISTS idx_ghcnm_id_date ON ghcnm_tavg_timeseries(id, date);
    """
    
    create_stations_sql = """
    CREATE TABLE IF NOT EXISTS ghcnm_stations (
        station_id TEXT PRIMARY KEY,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        elevation DOUBLE PRECISION,
        name TEXT NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_ghcnm_stations_coords ON ghcnm_stations(latitude, longitude);
    """
    
    with conn.cursor() as cur:
        cur.execute(create_table_sql)
        cur.execute(create_stations_sql)
        conn.commit()
    
    print("✓ Tables created successfully")


def load_stations(conn, stations_df):
    """Load station metadata into the database."""
    
    print(f"Loading {len(stations_df)} stations...")
    
    # Clear existing stations
    with conn.cursor() as cur:
        cur.execute("DELETE FROM ghcnm_stations")
        conn.commit()
    
    # Prepare data for insertion (swap lat/lon since parser reads them swapped from file)
    stations_data = [
        (
            row['station_id'],
            row['longitude'],  # Parser has longitude, but it's actually latitude from file
            row['latitude'],   # Parser has latitude, but it's actually longitude from file
            row['elevation'],
            row['name']
        )
        for _, row in stations_df.iterrows()
    ]
    
    # Batch insert
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO ghcnm_stations (station_id, latitude, longitude, elevation, name)
            VALUES %s
            ON CONFLICT (station_id) DO UPDATE SET
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                elevation = EXCLUDED.elevation,
                name = EXCLUDED.name
            """,
            stations_data
        )
        conn.commit()
    
    print(f"✓ Loaded {len(stations_df)} stations")


def load_timeseries_data(conn, data_df, batch_size=10000):
    """Load timeseries data into the database in batches."""
    
    print(f"Loading {len(data_df)} timeseries records...")
    
    # Clear existing data
    with conn.cursor() as cur:
        cur.execute("DELETE FROM ghcnm_tavg_timeseries")
        conn.commit()
    
    # Process in batches
    total_rows = len(data_df)
    for i in range(0, total_rows, batch_size):
        batch = data_df.iloc[i:i + batch_size]
        
        # Prepare data for insertion
        records = [
            (
                row['station_id'],
                row['year'],
                'TAVG',  # element type
                row['month'],
                None if pd.isna(row['value']) else row['value'],
                None,  # mflag
                None,  # qflag
                None,  # sflag
                datetime(row['year'], row['month'], 1)  # date
            )
            for _, row in batch.iterrows()
        ]
        
        # Batch insert
        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO ghcnm_tavg_timeseries 
                (id, year, element, month, value, mflag, qflag, sflag, date)
                VALUES %s
                ON CONFLICT (id, date) DO UPDATE SET
                    value = EXCLUDED.value,
                    year = EXCLUDED.year,
                    month = EXCLUDED.month,
                    element = EXCLUDED.element
                """,
                records
            )
            conn.commit()
        
        print(f"  Loaded {min(i + batch_size, total_rows)}/{total_rows} records...")
    
    print(f"✓ Loaded {total_rows} timeseries records")


def main():
    parser = argparse.ArgumentParser(
        description='Load GHCN-M data into PostgreSQL database'
    )
    parser.add_argument('--inv', required=True, help='Path to .inv inventory file')
    parser.add_argument('--dat', required=True, help='Path to .dat data file')
    parser.add_argument('--db-url', help='PostgreSQL connection URL (or use POSTGRES_URL env var)')
    parser.add_argument('--max-stations', type=int, help='Limit number of stations (for testing)')
    
    args = parser.parse_args()
    
    # Get database URL
    db_url = args.db_url or os.getenv('POSTGRES_URL')
    if not db_url:
        print("Error: Database URL not provided. Use --db-url or set POSTGRES_URL environment variable")
        sys.exit(1)
    
    print("=" * 60)
    print("GHCN-M PostgreSQL Loader")
    print("=" * 60)
    print(f"Inventory file: {args.inv}")
    print(f"Data file: {args.dat}")
    print(f"Max stations: {args.max_stations or 'All'}")
    print("=" * 60)
    
    # Parse GHCN-M files
    print("\n[1/4] Parsing GHCN-M files...")
    ghcnm = GHCNMParser(args.inv, args.dat)
    
    stations_df = ghcnm.parse_inventory()
    data_df = ghcnm.parse_data(element='TAVG', max_stations=args.max_stations)
    
    print(f"  Parsed {len(stations_df)} stations")
    print(f"  Parsed {len(data_df)} data records")
    
    # Connect to database
    print(f"\n[2/4] Connecting to PostgreSQL...")
    try:
        conn = psycopg2.connect(db_url)
        print("  ✓ Connected to database")
    except Exception as e:
        print(f"  ✗ Failed to connect: {e}")
        sys.exit(1)
    
    try:
        # Create tables
        print("\n[3/4] Creating tables...")
        create_table(conn)
        
        # Load data
        print("\n[4/4] Loading data...")
        load_stations(conn, stations_df)
        load_timeseries_data(conn, data_df)
        
        print("\n" + "=" * 60)
        print("SUCCESS! Data loaded into PostgreSQL")
        print("=" * 60)
        print(f"Stations table: {len(stations_df)} records")
        print(f"Timeseries table: {len(data_df)} records")
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    main()
