import xarray as xr
import fsspec

BASE = "https://downloads.psl.noaa.gov/Datasets/godas"
YEARS = range(1980, 2026)          # adjust as needed (e.g., range(1980, 1989) for 1980–1988)

# Use fsspec's simplecache so each .nc streams once and is cached locally
urls = [f"simplecache::{BASE}/dzdt.{y}.nc" for y in YEARS]

# Combine along time; tweak chunks to your preference
ds = xr.open_mfdataset(
    urls,
    engine="h5netcdf",             # works well with fsspec file objects
    combine="nested",              # concatenate strictly in listed order
    concat_dim="time",
    chunks={"time": 12},           # tune for performance
    parallel=True
)

# Write a single consolidated Zarr
OUT = "godas_dzdt_all.zarr"
ds.to_zarr(OUT, mode="w", consolidated=True)
print("Wrote", OUT)

ds.close()