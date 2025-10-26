import xarray as xr
import numpy as np
import cftime
import re
from pathlib import Path

def fix_global_surface_temperature():
    """
    Fix the time coordinate issue in the Global Surface Temperature dataset
    and create a properly working zarr file for FastAPI usage
    """
    
    # File paths
    nc_file = Path("datasets/air.mon.anom.v6.nc")
    zarr_file = Path("datasets/global_surface_temperature.zarr")
    backup_zarr = Path("datasets/global_surface_temperature_backup.zarr")
    
    print("🔧 Fixing Global Surface Temperature time coordinate for FastAPI")
    print("=" * 60)
    
    # Check if original NetCDF exists
    if not nc_file.exists():
        print(f"❌ Original NetCDF file not found: {nc_file}")
        print("Please make sure the file exists before running this script.")
        return False
    
    # Backup existing zarr if it exists
    if zarr_file.exists():
        print(f"📁 Backing up existing zarr to: {backup_zarr}")
        if backup_zarr.exists():
            import shutil
            shutil.rmtree(backup_zarr)
        zarr_file.rename(backup_zarr)
    
    try:
        # Step 1: Open with decode_times=False to avoid the error
        print("1️⃣ Opening NetCDF with decode_times=False...")
        ds = xr.open_dataset(nc_file, decode_times=False)
        
        print(f"   ✅ Dataset loaded successfully")
        print(f"   📊 Dimensions: {dict(ds.sizes)}")
        print(f"   📋 Variables: {list(ds.data_vars.keys())}")
        
        # Step 2: Examine the time coordinate
        print("\n2️⃣ Examining time coordinate...")
        if 'time' not in ds.coords:
            print("   ❌ No 'time' coordinate found")
            return False
            
        time_coord = ds.time
        original_units = time_coord.attrs.get('units', 'No units found')
        calendar = time_coord.attrs.get('calendar', 'gregorian')
        
        print(f"   📅 Original time units: '{original_units}'")
        print(f"   📅 Calendar: '{calendar}'")
        print(f"   📊 Time values shape: {time_coord.shape}")
        print(f"   🔢 First few time values: {time_coord.values[:5]}")
        
        # Step 3: Fix the time units string
        print("\n3️⃣ Fixing time units string...")
        
        # Pattern to fix: '1800-1-1 00:00:0.0' -> '1800-01-01 00:00:00'
        fixed_units = original_units
        
        # Fix date format (ensure 2-digit month/day)
        date_pattern = r'(\d{4})-(\d{1,2})-(\d{1,2})'
        def fix_date(match):
            year, month, day = match.groups()
            return f"{year}-{int(month):02d}-{int(day):02d}"
        
        fixed_units = re.sub(date_pattern, fix_date, fixed_units)
        
        # Fix time format (handle fractional seconds)
        time_pattern = r'(\d{2}):(\d{2}):(\d{1,2})\.(\d+)'
        def fix_time(match):
            hour, minute, second, fraction = match.groups()
            return f"{hour}:{minute}:{int(second):02d}"
        
        fixed_units = re.sub(time_pattern, fix_time, fixed_units)
        
        print(f"   🔧 Fixed time units: '{fixed_units}'")
        
        # Step 4: Decode time using fixed units
        print("\n4️⃣ Decoding time coordinate...")
        try:
            decoded_times = cftime.num2date(
                time_coord.values,
                fixed_units,
                calendar=calendar
            )
            print(f"   ✅ Time decoding successful!")
            print(f"   📅 First decoded time: {decoded_times[0]}")
            print(f"   📅 Last decoded time: {decoded_times[-1]}")
            print(f"   📊 Total time points: {len(decoded_times)}")
            
        except Exception as e:
            print(f"   ❌ Time decoding failed: {e}")
            return False
        
        # Step 5: Create new dataset using a different approach
        print("\n5️⃣ Creating dataset with properly decoded time...")
        
        # Convert cftime objects to pandas datetime for better compatibility
        try:
            import pandas as pd
            datetime_index = pd.to_datetime([str(dt) for dt in decoded_times])
            numpy_times = datetime_index.values
            print(f"   ✅ Converted to numpy datetime64")
            
        except Exception as e:
            print(f"   ⚠️  Using cftime objects directly: {e}")
            numpy_times = decoded_times
        
        # Method: Create a temporary NetCDF with fixed time, then convert to zarr
        temp_nc = nc_file.with_suffix('.temp.nc')
        
        print("\n6️⃣ Creating temporary NetCDF with fixed time...")
        
        # Create new time coordinate with minimal attributes - let xarray handle encoding
        new_time = xr.DataArray(
            numpy_times,
            dims=['time'],
            attrs={'long_name': 'time', 'standard_name': 'time'}  # No calendar or units!
        )
        
        # Create new dataset with the fixed time coordinate
        ds_fixed = ds.assign_coords(time=new_time)
        
        # Clean up all variables by removing encoding-related attributes
        for var_name in ds_fixed.data_vars:
            var = ds_fixed[var_name]
            clean_attrs = {k: v for k, v in var.attrs.items() 
                          if k not in ['_FillValue', 'missing_value', 'calendar', 'units'] 
                          or k == 'units'}  # Keep units for data variables, not time
            ds_fixed[var_name].attrs = clean_attrs
        
        # Clean up coordinate attributes too (except time which we already handled)
        for coord_name in ds_fixed.coords:
            if coord_name != 'time':
                coord = ds_fixed[coord_name]
                clean_attrs = {k: v for k, v in coord.attrs.items() 
                              if k not in ['_FillValue', 'missing_value', 'calendar']}
                ds_fixed[coord_name].attrs = clean_attrs
        
        print(f"   ✅ Created dataset with clean attributes")
        
        # Step 7: Save directly to zarr with minimal encoding
        print("\n7️⃣ Saving directly to zarr...")
        
        # Let xarray handle all encoding automatically
        ds_fixed.to_zarr(zarr_file, mode='w', consolidated=True)
        
        print(f"   ✅ Zarr file created: {zarr_file}")
        
        # Step 8: Verify the new zarr file works with your API pattern
        print("\n8️⃣ Verifying zarr file for FastAPI compatibility...")
        
        # Test opening normally (like your API would)
        ds_verify = xr.open_zarr(zarr_file)
        
        print(f"   ✅ Zarr opens successfully without decode_times=False!")
        print(f"   📅 Time coordinate type: {ds_verify.time.dtype}")
        print(f"   📅 First time value: {ds_verify.time.values[0]}")
        print(f"   📅 Last time value: {ds_verify.time.values[-1]}")
        
        # Test time selection (common API operation)
        test_slice = ds_verify.sel(time=slice('1850-01-01', '1850-12-31'))
        print(f"   ✅ Time slicing works: {len(test_slice.time)} points in 1850")
        
        # Test time formatting (for JSON response)
        sample_time = ds_verify.time.values[0]
        if hasattr(sample_time, 'strftime'):
            formatted = sample_time.strftime('%Y-%m-%d')
        else:
            # Handle numpy datetime64
            import pandas as pd
            formatted = pd.to_datetime(sample_time).strftime('%Y-%m-%d')
        print(f"   ✅ Time formatting works: {formatted}")
        
        # Test data access (what your API does)
        sample_data = ds_verify.air.isel(time=0, lat=0, lon=0).values
        print(f"   ✅ Data access works: sample value = {sample_data}")
        
        # Clean up
        ds.close()
        ds_fixed.close()
        ds_verify.close()
        
        # Remove temp file if it exists
        if temp_nc.exists():
            temp_nc.unlink()
        
        print(f"\n🎉 SUCCESS! Global Surface Temperature dataset ready for FastAPI!")
        print(f"   📁 New zarr file: {zarr_file}")
        print(f"   📁 Backup of old zarr: {backup_zarr}")
        print(f"   🚀 Your API can now use: xr.open_zarr('{zarr_file}')")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error during processing: {e}")
        import traceback
        traceback.print_exc()
        
        # Clean up temp file
        temp_nc = nc_file.with_suffix('.temp.nc')
        if temp_nc.exists():
            temp_nc.unlink()
        
        # Restore backup if something went wrong
        if backup_zarr.exists() and not zarr_file.exists():
            print(f"🔄 Restoring backup zarr file...")
            backup_zarr.rename(zarr_file)
            
        return False

if __name__ == "__main__":
    success = fix_global_surface_temperature()
    
    if success:
        print(f"\n✅ READY FOR PRODUCTION!")
        print(f"Your FastAPI can now use this dataset normally:")
        print(f"  ds = xr.open_zarr('datasets/global_surface_temperature.zarr')")
        print(f"  # No decode_times=False needed!")
        print(f"  time_series = ds.sel(time=slice(start_date, end_date))")
        print(f"  data = time_series.air.mean(['lat', 'lon']).values")
    else:
        print(f"\n❌ Fix failed. Check the error messages above.")