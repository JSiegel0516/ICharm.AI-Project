import os
import pandas
import xarray as xr
from pathlib import Path
import requests
import shutil
from typing import Any, Dict


def _prepare_for_zarr(ds: xr.Dataset) -> xr.Dataset:
    """
    Xarray can persist stale chunk metadata from the original NetCDF file
    (e.g. chunksizes=None) which triggers zarr's normalisation step to blow up
    with ``Expected an integer or an iterable of integers. Got None instead``.
    Normalising the encodings keeps the metadata simple before writing.
    """
    for name, var in ds.variables.items():
        encoding = var.encoding
        for key in ("chunksizes", "chunks", "preferred_chunks"):
            value = encoding.get(key)
            if value is None:
                encoding.pop(key, None)
            elif isinstance(value, (tuple, list)) and any(ch is None for ch in value):
                encoding.pop(key, None)
            elif key == "preferred_chunks":
                # Always drop preferred_chunks – let zarr determine the chunks.
                encoding.pop(key, None)
    return ds


def _open_dataset(path: Path, decode_times: bool) -> xr.Dataset:
    open_kwargs: Dict[str, Any] = {"engine": "h5netcdf", "decode_times": decode_times}
    if decode_times:
        try:
            import cftime  # noqa: F401
        except ImportError:
            # Fall back to numpy datetimes; further handling happens upstream.
            print("cftime is not installed; continuing without it.")
        else:
            open_kwargs["use_cftime"] = True
    return xr.open_dataset(path, **open_kwargs)


# Path to CSV describing datasets


def main():
    curr_folder = os.path.dirname(os.path.abspath(__file__))
    csv_file = Path(
        f"{curr_folder}/../../datasets/metadata.csv"
    )  # replace with your actual CSV path
    datasets_dir = Path(f"{curr_folder}/../../datasets")
    datasets_dir.mkdir(exist_ok=True)

    # Read the CSV
    df = pandas.read_csv(csv_file)

    for _, row in df.iterrows():
        if row["Stored"] != "local":
            continue  # skip non-local datasets for now

        local_zarr_path = Path(
            row["inputFile"]
        )  # e.g., datasets/global_precipitation.zarr
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
            with _open_dataset(temp_nc_file, decode_times=True) as ds:
                _prepare_for_zarr(ds)
                ds.to_zarr(local_zarr_path, mode="w", consolidated=True)
            print(f"Zarr store created: {local_zarr_path}")
        except Exception as e:
            print(f"Failed to convert {temp_nc_file} to Zarr: {e}")
            # Fallback: try decode_times=False
            try:
                with _open_dataset(temp_nc_file, decode_times=False) as ds:
                    _prepare_for_zarr(ds)
                    ds.to_zarr(local_zarr_path, mode="w", consolidated=True)
                print(f"Zarr store created with decode_times=False: {local_zarr_path}")
            except Exception as e2:
                print(f"Failed again: {e2}")
                continue
        finally:
            if temp_nc_file.exists():
                temp_nc_file.unlink()  # remove temporary NetCDF

    print("\nAll datasets processed.")


if __name__ == "__main__":
    main()
