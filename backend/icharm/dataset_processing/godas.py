import os
import xarray as xr


def main():
    base = "https://downloads.psl.noaa.gov/Datasets/godas"
    years = range(
        1980, 2026
    )  # adjust as needed (e.g., range(1980, 1989) for 1980–1988)

    # Use fsspec's simplecache so each .nc streams once and is cached locally
    urls = [f"simplecache::{base}/dzdt.{y}.nc" for y in years]

    # Combine along time; tweak chunks to your preference
    ds = xr.open_mfdataset(
        urls,
        engine="h5netcdf",  # works well with fsspec file objects
        combine="nested",  # concatenate strictly in listed order
        concat_dim="time",
        chunks={"time": 12},  # tune for performance
        parallel=True,
    )

    # Write a single consolidated Zarr
    curr_folder = os.path.dirname(os.path.abspath(__file__))
    output = f"{curr_folder}/../../datasets/godas_dzdt_all.zarr"
    ds.to_zarr(output, mode="w", consolidated=True)
    print("Wrote", output)
    ds.close()
    return


if __name__ == "__main__":
    main()
