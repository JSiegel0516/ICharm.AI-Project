import os
import xarray as xr
from pathlib import Path
import logging
import requests
from tqdm import tqdm
import zarr

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def download_file(url, output_path):
    """Download a single file with progress bar."""
    response = requests.get(url, stream=True)
    response.raise_for_status()
    
    total_size = int(response.headers.get('content-length', 0))
    
    with open(output_path, 'wb') as f, tqdm(
        desc=output_path.name,
        total=total_size,
        unit='iB',
        unit_scale=True,
        unit_divisor=1024,
    ) as pbar:
        for chunk in response.iter_content(chunk_size=8192):
            size = f.write(chunk)
            pbar.update(size)

def main():
    base = "https://downloads.psl.noaa.gov/Datasets/godas"
    years = range(1980, 2026)
    
    curr_folder = Path(__file__).parent
    datasets_dir = curr_folder / "../../datasets"
    temp_dir = datasets_dir / "godas_temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    zarr_output = datasets_dir / "godas_dzdt_all.zarr"
    
    # Step 1: Download all files sequentially
    logger.info(f"Step 1: Downloading {len(list(years))} files...")
    local_files = []
    
    for year in years:
        url = f"{base}/dzdt.{year}.nc"
        local_file = temp_dir / f"dzdt.{year}.nc"
        
        if local_file.exists():
            logger.info(f"  ✓ Already exists: {local_file.name}")
        else:
            logger.info(f"  Downloading: {url}")
            try:
                download_file(url, local_file)
            except Exception as e:
                logger.error(f"  ✗ Failed to download {url}: {e}")
                continue
        
        local_files.append(str(local_file))
    
    logger.info(f"✅ Downloaded {len(local_files)} files")
    
    # Step 2: Open all files locally (no parallel, no remote)
    logger.info("\nStep 2: Opening local files...")
    
    try:
        ds = xr.open_mfdataset(
            local_files,
            engine="netcdf4",
            combine="nested",
            concat_dim="time",
            chunks={"time": 12, "lat": 50, "lon": 50, "level": 10},  # Important: set chunks!
            parallel=False,
        )
        
        logger.info(f"  Dataset dims: {dict(ds.dims)}")
        logger.info(f"  Variables: {list(ds.data_vars)}")
        
        # Step 3: Write to Zarr v2 with actual data
        logger.info("\nStep 3: Writing to Zarr v2...")

        if zarr_output.exists():
            import shutil
            shutil.rmtree(zarr_output)
            logger.info(f"  Removed existing {zarr_output}")

        # Simple write with zarr v2
        ds.to_zarr(
            zarr_output,
            mode="w",
            consolidated=True,
            zarr_version=2,
        )

        logger.info(f"✅ Wrote {zarr_output}")
        
       
        
        ds.close()
        
        # Step 4: Verify
        logger.info("\nStep 4: Verifying...")
        
        # Check Zarr version
        zarr_group = zarr.open(zarr_output, mode='r')
        logger.info(f"  Zarr format version: {zarr_group.store.__class__.__name__}")
        logger.info(f"  Arrays in store: {list(zarr_group.array_keys())}")
        
        # Open with xarray
        test_ds = xr.open_zarr(zarr_output)
        logger.info(f"  Variables: {list(test_ds.data_vars)}")
        logger.info(f"  Dimensions: {dict(test_ds.sizes)}")
        
        if 'time' in test_ds.dims:
            logger.info(f"  Time range: {test_ds.time.min().values} to {test_ds.time.max().values}")
        
        # Verify data is actually there
        first_var = list(test_ds.data_vars)[0]
        sample_data = test_ds[first_var].isel(time=0, level=0).values
        logger.info(f"  Sample data shape: {sample_data.shape}")
        logger.info(f"  Sample data has values: {sample_data.size > 0 and not all(sample_data.flat == 0)}")
        
        test_ds.close()
        
        # Step 5: Cleanup (optional)
        logger.info("\nStep 5: Cleanup...")
        cleanup = input("Delete temporary NetCDF files? (y/n): ")
        if cleanup.lower() == 'y':
            import shutil
            shutil.rmtree(temp_dir)
            logger.info("  ✓ Temporary files deleted")
        else:
            logger.info(f"  Temporary files kept in {temp_dir}")
        
        logger.info("\n🎉 All done!")
        
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        raise

if __name__ == "__main__":
    main()