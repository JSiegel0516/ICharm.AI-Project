import xarray as xr
from pathlib import Path

# Local NetCDF file
local_file = Path("./datasets/precip.mon.mean.nc")

# Output Zarr path
zarr_path = Path("./datasets/global_precipitation.zarr")

# Open the NetCDF dataset
ds = xr.open_dataset(local_file, engine="h5netcdf")  # make sure h5netcdf is installed

# Convert to Zarr with consolidated metadata
ds.to_zarr(zarr_path, mode="w", consolidated=True)

print(f"Zarr store created at: {zarr_path}")
