import xarray as xr
import numpy as np
from pathlib import Path
import pandas as pd

def inspect_godas_zarr():
    """
    Inspect the existing GODAS zarr file to understand its structure and identify any issues
    """
    
    zarr_file = Path("datasets/godas_dzdt_all.zarr")
    
    print("🔍 Inspecting GODAS zarr file")
    print("=" * 60)
    
    if not zarr_file.exists():
        print(f"❌ GODAS zarr file not found: {zarr_file}")
        print("Available zarr files in datasets/:")
        datasets_dir = Path("datasets")
        if datasets_dir.exists():
            zarr_files = list(datasets_dir.glob("*.zarr"))
            for f in zarr_files:
                print(f"  - {f}")
        return False
    
    try:
        print(f"📁 File: {zarr_file}")
        print(f"📊 File size: {sum(f.stat().st_size for f in zarr_file.rglob('*') if f.is_file()) / (1024*1024):.1f} MB")
        
        # Try to open the zarr file
        print("\n1️⃣ Opening GODAS zarr file...")
        try:
            ds = xr.open_zarr(zarr_file)
            print("   ✅ Zarr file opens successfully!")
        except Exception as e:
            print(f"   ❌ Failed to open zarr: {e}")
            
            # Try with consolidated=False
            try:
                print("   🔄 Trying without consolidated metadata...")
                ds = xr.open_zarr(zarr_file, consolidated=False)
                print("   ✅ Opened without consolidated metadata!")
            except Exception as e2:
                print(f"   ❌ Still failed: {e2}")
                return False
        
        # Examine dataset structure
        print(f"\n2️⃣ Dataset Overview:")
        print(f"   📊 Dimensions: {dict(ds.sizes)}")
        print(f"   📋 Data variables: {list(ds.data_vars.keys())}")
        print(f"   🗺️ Coordinates: {list(ds.coords.keys())}")
        print(f"   📝 Global attributes: {list(ds.attrs.keys())}")
        
        # Examine coordinates in detail
        print(f"\n3️⃣ Coordinate Analysis:")
        for coord_name, coord in ds.coords.items():
            print(f"   {coord_name}:")
            print(f"     Shape: {coord.shape}")
            print(f"     Data type: {coord.dtype}")
            print(f"     Range: {coord.values.min()} to {coord.values.max()}")
            if coord.attrs:
                print(f"     Attributes: {list(coord.attrs.keys())}")
            
            # Special handling for time coordinate
            if coord_name.lower() in ['time', 't']:
                print(f"     First few values: {coord.values[:5]}")
                print(f"     Last few values: {coord.values[-5:]}")
                
                # Check if time is properly decoded
                if np.issubdtype(coord.dtype, np.datetime64):
                    print(f"     ✅ Time is properly decoded (datetime64)")
                    # Test time slicing
                    try:
                        test_slice = ds.sel({coord_name: slice(coord.values[0], coord.values[10])})
                        print(f"     ✅ Time slicing works")
                    except Exception as e:
                        print(f"     ⚠️ Time slicing issue: {e}")
                elif np.issubdtype(coord.dtype, np.number):
                    print(f"     ⚠️ Time is numeric (may need decode_times=True)")
                    if 'units' in coord.attrs:
                        print(f"     Time units: {coord.attrs['units']}")
                else:
                    print(f"     ❓ Unknown time format: {coord.dtype}")
        
        # Examine data variables
        print(f"\n4️⃣ Data Variable Analysis:")
        for var_name, var in ds.data_vars.items():
            print(f"   {var_name}:")
            print(f"     Shape: {var.shape}")
            print(f"     Data type: {var.dtype}")
            print(f"     Dimensions: {var.dims}")
            
            # Check for missing values
            if hasattr(var.values, 'size') and var.values.size > 0:
                try:
                    # Get a small sample to check
                    sample = var.isel({dim: 0 for dim in var.dims}).values
                    if np.isfinite(sample):
                        print(f"     Sample value: {sample}")
                    else:
                        print(f"     Sample value: {sample} (NaN/Inf)")
                        
                    # Check for fill values or missing data
                    if hasattr(var.values, 'flatten'):
                        flat_vals = var.values.flatten()[:1000]  # First 1000 values
                        finite_count = np.isfinite(flat_vals).sum()
                        print(f"     Finite values in sample: {finite_count}/1000")
                except Exception as e:
                    print(f"     Could not sample data: {e}")
            
            # Show attributes
            if var.attrs:
                important_attrs = ['units', 'long_name', 'standard_name', '_FillValue', 'missing_value']
                shown_attrs = {k: v for k, v in var.attrs.items() if k in important_attrs}
                if shown_attrs:
                    print(f"     Key attributes: {shown_attrs}")
        
        # Test data access patterns (common for APIs)
        print(f"\n5️⃣ API Compatibility Tests:")
        
        # Test 1: Basic data access
        try:
            first_var = list(ds.data_vars.keys())[0]
            sample_data = ds[first_var].isel({dim: 0 for dim in ds[first_var].dims}).values
            print(f"   ✅ Basic data access works (sample: {sample_data})")
        except Exception as e:
            print(f"   ❌ Basic data access failed: {e}")
        
        # Test 2: Time-based selection (if time coordinate exists)
        time_coords = [c for c in ds.coords.keys() if c.lower() in ['time', 't']]
        if time_coords:
            time_coord = time_coords[0]
            try:
                if len(ds[time_coord]) > 10:
                    # Try selecting a time range
                    time_slice = ds.sel({time_coord: slice(ds[time_coord].values[0], ds[time_coord].values[9])})
                    print(f"   ✅ Time slicing works ({len(time_slice[time_coord])} time points)")
                else:
                    print(f"   ⚠️ Time coordinate too short for range testing ({len(ds[time_coord])} points)")
            except Exception as e:
                print(f"   ❌ Time slicing failed: {e}")
        else:
            print(f"   ⚠️ No time coordinate found for time-based testing")
        
        # Test 3: Spatial selection (if lat/lon coordinates exist)
        spatial_coords = {
            'lat': [c for c in ds.coords.keys() if c.lower() in ['lat', 'latitude', 'y']],
            'lon': [c for c in ds.coords.keys() if c.lower() in ['lon', 'longitude', 'x']]
        }
        
        if spatial_coords['lat'] and spatial_coords['lon']:
            try:
                lat_coord = spatial_coords['lat'][0]
                lon_coord = spatial_coords['lon'][0]
                
                # Try selecting a spatial point
                spatial_point = ds.sel({
                    lat_coord: ds[lat_coord].values[len(ds[lat_coord])//2],
                    lon_coord: ds[lon_coord].values[len(ds[lon_coord])//2]
                }, method='nearest')
                print(f"   ✅ Spatial selection works (lat: {spatial_point[lat_coord].values}, lon: {spatial_point[lon_coord].values})")
            except Exception as e:
                print(f"   ❌ Spatial selection failed: {e}")
        else:
            print(f"   ⚠️ No lat/lon coordinates found for spatial testing")
        
        # Test 4: JSON serialization (for API responses)
        try:
            first_var = list(ds.data_vars.keys())[0]
            sample_array = ds[first_var].isel({dim: 0 for dim in ds[first_var].dims})
            sample_value = float(sample_array.values)
            
            # Test if value is JSON-serializable
            import json
            json.dumps(sample_value)
            print(f"   ✅ JSON serialization works")
        except Exception as e:
            print(f"   ❌ JSON serialization issue: {e}")
        
        # Summary
        print(f"\n6️⃣ Summary for FastAPI Usage:")
        if time_coords:
            time_coord = time_coords[0]
            time_type = ds[time_coord].dtype
            if np.issubdtype(time_type, np.datetime64):
                print(f"   ✅ Time coordinate is properly formatted for API use")
            else:
                print(f"   ⚠️ Time coordinate may need fixing (currently: {time_type})")
        else:
            print(f"   ⚠️ No time coordinate - may not be suitable for time series API")
        
        print(f"   📊 Dataset size: {dict(ds.sizes)}")
        print(f"   📋 Variables available: {len(ds.data_vars)}")
        print(f"   🎯 Recommended for API: {'✅ Yes' if time_coords and len(ds.data_vars) > 0 else '⚠️ With modifications'}")
        
        # Close dataset
        ds.close()
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error inspecting GODAS zarr: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("🌊 GODAS Dataset Inspector")
    print("This will check your GODAS zarr file for FastAPI compatibility\n")
    
    success = inspect_godas_zarr()
    
    if success:
        print(f"\n✅ Inspection complete!")
        print(f"Check the analysis above to see if the GODAS dataset is ready for your API.")
    else:
        print(f"\n❌ Could not inspect GODAS dataset.")
        print(f"Make sure the zarr file exists in datasets/godas_dzdt_all.zarr")