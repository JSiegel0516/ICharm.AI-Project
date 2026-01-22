"""
GHCN-M (Global Historical Climatology Network - Monthly) Parser

This script parses GHCN-M station data files:
- .inv file: Station inventory (metadata, coordinates)
- .dat file: Monthly temperature data

File format specifications:
.inv file (fixed width):
    Position  Field         Description
    1-11      ID            Station identification code
    13-20     LATITUDE      Latitude (degrees, -90 to 90, negative = South)
    22-30     LONGITUDE     Longitude (degrees, -180 to 180, negative = West)
    32-37     ELEVATION     Elevation (meters, -999 = missing)
    39-68     NAME          Station name

.dat file (fixed width):
    Position  Field         Description
    1-11      ID            Station identification code
    12-15     YEAR          Year of record
    16-19     ELEMENT       Element type (TAVG = Temperature Average)
    21-24     VALUE1        Monthly value for January (hundredths of degrees C)
    ...       ...           (12 monthly values total, each with flags)
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Dict, List, Tuple
import json


class GHCNMParser:
    """Parser for GHCN-M station data files."""
    
    def __init__(self, inv_file: Path, dat_file: Path):
        self.inv_file = Path(inv_file)
        self.dat_file = Path(dat_file)
        self.stations: Dict = {}
        self.data: Dict = {}
    
    def parse_inventory(self) -> pd.DataFrame:
        """
        Parse the .inv station inventory file.
        
        Returns:
            DataFrame with columns: station_id, latitude, longitude, elevation, name
        """
        print(f"Parsing inventory file: {self.inv_file}")
        
        stations = []
        with open(self.inv_file, 'r', encoding='utf-8') as f:
            for line in f:
                if len(line) < 38:
                    continue
                    
                station_id = line[0:11].strip()
                longitude = float(line[12:20].strip())
                latitude = float(line[21:30].strip())
                elevation = float(line[31:37].strip())
                name = line[38:].strip()
                
                stations.append({
                    'station_id': station_id,
                    'latitude': latitude,
                    'longitude': longitude,
                    'elevation': elevation,
                    'name': name
                })
        
        df = pd.DataFrame(stations)
        print(f"Parsed {len(df)} stations")
        return df
    
    def parse_data(self, element: str = 'TAVG', max_stations: int = None) -> pd.DataFrame:
        """
        Parse the .dat monthly data file.
        
        Args:
            element: Element type to extract (default: 'TAVG' for temperature average)
            max_stations: Maximum number of stations to parse (for testing)
        
        Returns:
            DataFrame with columns: station_id, year, month, value
        """
        print(f"Parsing data file: {self.dat_file}")
        
        records = []
        stations_processed = set()
        
        with open(self.dat_file, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                if len(line) < 20:
                    continue
                
                station_id = line[0:11].strip()
                year = int(line[11:15])
                elem = line[15:19].strip()
                
                # Only process specified element type
                if elem != element:
                    continue
                
                # Limit stations for testing
                if max_stations and len(stations_processed) >= max_stations:
                    if station_id not in stations_processed:
                        continue
                
                stations_processed.add(station_id)
                
                # Parse 12 monthly values
                for month in range(1, 13):
                    # Each monthly value is 8 characters (5 for value, 3 for flags)
                    pos = 19 + (month - 1) * 8
                    if pos + 5 <= len(line):
                        value_str = line[pos:pos+5].strip()
                        if value_str and value_str != '-9999':
                            try:
                                # Value is in hundredths of degrees C
                                value = float(value_str) / 100.0
                                records.append({
                                    'station_id': station_id,
                                    'year': year,
                                    'month': month,
                                    'value': value
                                })
                            except ValueError:
                                continue
                
                if line_num % 100000 == 0:
                    print(f"Processed {line_num} lines, {len(stations_processed)} stations, {len(records)} records")
        
        df = pd.DataFrame(records)
        print(f"Parsed {len(records)} temperature records from {len(stations_processed)} stations")
        return df
    
    def merge_stations_and_data(self, stations_df: pd.DataFrame, data_df: pd.DataFrame) -> pd.DataFrame:
        """
        Merge station metadata with temperature data.
        
        Returns:
            DataFrame with station info and data
        """
        merged = data_df.merge(stations_df, on='station_id', how='left')
        return merged
    
    def export_to_json(self, stations_df: pd.DataFrame, data_df: pd.DataFrame, output_path: Path):
        """
        Export station data to JSON format for easy frontend consumption.
        
        Creates two files:
        - stations.json: Station metadata with coordinates
        - timeseries/{station_id}.json: Individual station timeseries
        """
        output_path = Path(output_path)
        output_path.mkdir(exist_ok=True, parents=True)
        
        # Export stations metadata
        stations_json = stations_df.to_dict('records')
        with open(output_path / 'stations.json', 'w') as f:
            json.dump(stations_json, f, indent=2)
        print(f"Exported {len(stations_json)} stations to {output_path / 'stations.json'}")
        
        # Export timeseries for each station
        timeseries_dir = output_path / 'timeseries'
        timeseries_dir.mkdir(exist_ok=True)
        
        for station_id in data_df['station_id'].unique():
            station_data = data_df[data_df['station_id'] == station_id].copy()
            station_data['date'] = pd.to_datetime(
                station_data[['year', 'month']].assign(day=1)
            ).dt.strftime('%Y-%m-%d')
            
            timeseries = station_data[['date', 'value']].to_dict('records')
            
            with open(timeseries_dir / f'{station_id}.json', 'w') as f:
                json.dump(timeseries, f)
        
        print(f"Exported timeseries for {len(data_df['station_id'].unique())} stations")
    
    def export_to_parquet(self, stations_df: pd.DataFrame, data_df: pd.DataFrame, output_path: Path):
        """
        Export to efficient Parquet format for database ingestion.
        """
        output_path = Path(output_path)
        output_path.mkdir(exist_ok=True, parents=True)
        
        stations_df.to_parquet(output_path / 'stations.parquet', index=False)
        data_df.to_parquet(output_path / 'data.parquet', index=False)
        
        print(f"Exported to Parquet: {output_path}")


def main():
    """Main function to parse GHCN-M data."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Parse GHCN-M station data')
    parser.add_argument('--inv', required=True, help='Path to .inv inventory file')
    parser.add_argument('--dat', required=True, help='Path to .dat data file')
    parser.add_argument('--output', required=True, help='Output directory')
    parser.add_argument('--format', choices=['json', 'parquet', 'both'], default='both',
                       help='Output format (default: both)')
    parser.add_argument('--max-stations', type=int, help='Maximum stations to process (for testing)')
    
    args = parser.parse_args()
    
    # Initialize parser
    ghcnm = GHCNMParser(args.inv, args.dat)
    
    # Parse inventory
    stations_df = ghcnm.parse_inventory()
    
    # Parse data
    data_df = ghcnm.parse_data(max_stations=args.max_stations)
    
    # Export
    output_path = Path(args.output)
    if args.format in ['json', 'both']:
        ghcnm.export_to_json(stations_df, data_df, output_path / 'json')
    
    if args.format in ['parquet', 'both']:
        ghcnm.export_to_parquet(stations_df, data_df, output_path / 'parquet')
    
    # Print summary statistics
    print("\n=== Summary ===")
    print(f"Total stations: {len(stations_df)}")
    print(f"Stations with data: {data_df['station_id'].nunique()}")
    print(f"Total records: {len(data_df)}")
    print(f"Date range: {data_df['year'].min()}-{data_df['year'].max()}")
    print(f"Temperature range: {data_df['value'].min():.1f}°C to {data_df['value'].max():.1f}°C")


if __name__ == '__main__':
    main()
