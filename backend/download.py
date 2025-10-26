import pandas as pd
import xarray as xr
from pathlib import Path
import requests
import shutil

# Path to CSV describing datasets
csv_file = Path("./metadata.csv")  # replace with your actual CSV path
datasets_dir = Path("./datasets")
datasets_dir.mkdir(exist_ok=True)

# Read the CSV
df = pd.read_csv(csv_file)

for _, row in df.iterrows():
    if row["Stored"] != "local":
        continue  # skip non-local datasets for now

    local_zarr_path = Path(row["inputFile"])  # e.g., datasets/global_precipitation.zarr
    source_url = row["origLocation"]

    print(f"\nProcessing dataset: {row['datasetName']}")
    print(f"Zarr path: {local_zarr_path}")
    print(f"Source URL: {source_url}")

    # Skip if Zarr already exists
    if local_zarr_path.exists():
        print("Zarr store already exists, skipping...")
        continue

    # Ensure parent directory exists
    local_zarr_path.parent.mkdir(parents=True, exist_ok=True)

    # Download NetCDF file to temporary location
    temp_nc_file = local_zarr_path.with_suffix(".nc")
    print(f"Downloading to temporary file: {temp_nc_file}")

    try:
        with requests.get(source_url, stream=True, timeout=60) as r:
            r.raise_for_status()
            with open(temp_nc_file, "wb") as f:
                shutil.copyfileobj(r.raw, f)
    except Exception as e:
        print(f"Failed to download {source_url}: {e}")
        continue

    # Open NetCDF and convert to consolidated Zarr
    print("Opening NetCDF and converting to Zarr...")
    try:
        ds = xr.open_dataset(temp_nc_file, engine="h5netcdf", decode_times=True, use_cftime=True)
        ds.to_zarr(local_zarr_path, mode="w", consolidated=True)
        print(f"Zarr store created: {local_zarr_path}")
    except Exception as e:
        print(f"Failed to convert {temp_nc_file} to Zarr: {e}")
        # Fallback: try decode_times=False
        try:
            ds = xr.open_dataset(temp_nc_file, engine="h5netcdf", decode_times=False)
            ds.to_zarr(local_zarr_path, mode="w", consolidated=True)
            print(f"Zarr store created with decode_times=False: {local_zarr_path}")
        except Exception as e2:
            print(f"Failed again: {e2}")
            continue
    finally:
        if temp_nc_file.exists():
            temp_nc_file.unlink()  # remove temporary NetCDF

print("\nAll datasets processed.")
