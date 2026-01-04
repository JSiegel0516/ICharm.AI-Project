from typing import Dict

from fastapi import HTTPException
import xarray as xr
import pandas as pd
import os
import json
import ujson
import asyncio
from pathlib import Path

from icharm.services.data.app.data_processing import DataProcessing
from icharm.services.data.app.dataset_cache import dataset_cache


import logging

from icharm.services.data.app.env_helpers import EnvHelpers

# Setup logging
logger = logging.getLogger(__name__)

LOCAL_DATASETS_PATH = EnvHelpers.resolve_env_path(
    os.getenv("LOCAL_DATASETS_PATH"), "datasets", ensure_exists=True
)


class DatasetLocal:
    @staticmethod
    async def open_local_dataset(metadata: pd.Series) -> xr.Dataset:
        """Open local dataset with caching"""

        cache_key = metadata["datasetName"]
        cached = dataset_cache.get(cache_key)
        if cached is not None:
            logger.info(f"Using cached dataset: {cache_key}")
            return cached

        try:
            input_file = metadata["inputFile"]
            if input_file.startswith("datasets/"):
                input_file = input_file.replace("datasets/", "", 1)

            file_path = os.path.join(LOCAL_DATASETS_PATH, input_file)
            logger.info(f"Attempting to open local dataset: {file_path}")

            if not os.path.exists(file_path):
                logger.error(f"Dataset file not found: {file_path}")
                raise FileNotFoundError(f"Local dataset not found: {file_path}")

            engine = (metadata.get("engine") or "h5netcdf").lower()
            path_obj = Path(file_path)
            dataset_name = metadata["datasetName"]

            if engine == "zarr":
                if path_obj.is_dir():
                    zmetadata = path_obj / ".zmetadata"
                    zarr_json = path_obj / "zarr.json"

                    # Check for REAL Zarr store (has consolidated metadata)
                    if zmetadata.exists():
                        logger.info(f"Opening real Zarr v2 store: {dataset_name}")
                        ds = await asyncio.to_thread(
                            xr.open_zarr, str(path_obj), consolidated=True
                        )

                    # Check for Zarr v3 or Kerchunk reference
                    elif zarr_json.exists():
                        try:
                            with open(zarr_json, "r") as f:
                                zarr_content = json.load(f)

                            # Kerchunk reference (Zarr v2 style with "refs")
                            if "refs" in zarr_content:
                                logger.info(
                                    f"Opening Kerchunk reference (v2 style): {dataset_name}"
                                )
                                ds = await asyncio.to_thread(
                                    xr.open_dataset,
                                    "reference://",
                                    engine="zarr",
                                    backend_kwargs={"consolidated": False},
                                    storage_options={
                                        "fo": str(zarr_json),
                                        "asynchronous": False,
                                    },
                                )
                            # Check if this is a true Zarr v3 store with consolidated metadata
                            elif (
                                zarr_content.get("node_type") == "group"
                                and zarr_content.get("zarr_format") == 3
                            ):
                                # Check if it has consolidated_metadata with actual data arrays
                                consolidated_meta = zarr_content.get(
                                    "consolidated_metadata", {}
                                )
                                metadata_info = consolidated_meta.get("metadata", {})

                                # If it has consolidated metadata with array definitions, it's a real store
                                if metadata_info and any(
                                    "shape" in arr_info
                                    for arr_info in metadata_info.values()
                                ):
                                    logger.info(
                                        f"Opening Zarr v3 store with consolidated metadata: {dataset_name}"
                                    )
                                    try:
                                        ds = await asyncio.to_thread(
                                            xr.open_zarr,
                                            str(path_obj),
                                            consolidated=True,
                                            decode_times=True,
                                        )
                                    except (ValueError, OSError) as time_error:
                                        if (
                                            "decode time" in str(time_error).lower()
                                            or "time units" in str(time_error).lower()
                                        ):
                                            logger.warning(
                                                f"Time decoding failed for {dataset_name}, "
                                                "retrying with decode_times=False"
                                            )
                                            ds = await asyncio.to_thread(
                                                xr.open_zarr,
                                                str(path_obj),
                                                consolidated=True,
                                                decode_times=False,
                                            )
                                            # Manually decode time if needed
                                            ds = DataProcessing.ensure_datetime_coordinates(
                                                ds
                                            )
                                        else:
                                            raise
                                else:
                                    # This is a metadata-only Kerchunk reference
                                    logger.warning(
                                        f"Detected Zarr v3 metadata-only file for {dataset_name}"
                                    )
                                    logger.warning(
                                        "This appears to be a Kerchunk reference without data arrays"
                                    )
                                    logger.info("Falling back to NetCDF file...")
                                    raise ValueError(
                                        "Zarr v3 metadata-only file (no data arrays)"
                                    )
                            else:
                                # Try as regular Zarr v3 store
                                logger.info(f"Attempting Zarr v3 store: {dataset_name}")
                                ds = await asyncio.to_thread(
                                    xr.open_zarr, str(path_obj), consolidated=False
                                )

                        except (json.JSONDecodeError, ValueError) as e:
                            logger.warning(f"Failed to open as Zarr/Kerchunk: {e}")
                            raise

                    else:
                        # No metadata files - try unconsolidated Zarr
                        logger.info(f"Attempting unconsolidated Zarr: {dataset_name}")
                        ds = await asyncio.to_thread(
                            xr.open_zarr, str(path_obj), consolidated=False
                        )

                    # Verify dataset has variables
                    if len(ds.data_vars) == 0:
                        logger.error(f"Zarr store {dataset_name} has no variables!")
                        raise ValueError("Empty Zarr store")

                    logger.info(f"✓ Successfully opened Zarr: {list(ds.data_vars)}")

                else:
                    logger.warning(f"Zarr path is not a directory: {path_obj}")
                    raise ValueError("Not a Zarr directory")
            else:
                # NetCDF engine - TRY WITH decode_times=True first, fallback to False
                try:
                    ds = await asyncio.to_thread(
                        xr.open_dataset, str(path_obj), engine=engine, decode_times=True
                    )
                    logger.info(
                        f"✓ Successfully opened with {engine} (decode_times=True): {list(ds.data_vars)}"
                    )
                except (ValueError, OSError) as time_error:
                    # Time decoding failed - try without decoding
                    if (
                        "decode time" in str(time_error).lower()
                        or "cftime" in str(time_error).lower()
                    ):
                        logger.warning(
                            f"Time decoding failed for {dataset_name}, retrying with decode_times=False"
                        )
                        ds = await asyncio.to_thread(
                            xr.open_dataset,
                            str(path_obj),
                            engine=engine,
                            decode_times=False,
                        )

                        # Manually decode time if needed
                        ds = DataProcessing.ensure_datetime_coordinates(ds)

                        logger.info(
                            f"✓ Successfully opened with {engine} (decode_times=False): {list(ds.data_vars)}"
                        )
                    else:
                        raise

            dataset_cache.set(cache_key, ds)
            return ds

        except (ValueError, FileNotFoundError, KeyError) as e:
            # FALLBACK: Try NetCDF file
            logger.warning(f"Primary method failed for {metadata['datasetName']}: {e}")

            # Find corresponding .nc file
            nc_path = path_obj.with_suffix(".nc")

            logger.info(f"🔄 Attempting NetCDF fallback: {nc_path}")

            if nc_path.exists():
                try:
                    # Try with time decoding first
                    ds = await asyncio.to_thread(
                        xr.open_dataset,
                        str(nc_path),
                        engine="h5netcdf",
                        decode_times=True,
                    )
                except (ValueError, OSError) as time_error:
                    # Fallback to no time decoding
                    if (
                        "decode time" in str(time_error).lower()
                        or "cftime" in str(time_error).lower()
                    ):
                        logger.warning(
                            "Time decoding failed for fallback, using decode_times=False"
                        )
                        ds = await asyncio.to_thread(
                            xr.open_dataset,
                            str(nc_path),
                            engine="h5netcdf",
                            decode_times=False,
                        )
                        ds = DataProcessing.ensure_datetime_coordinates(ds)
                    else:
                        raise

                logger.info(f"Fallback successful! Variables: {list(ds.data_vars)}")
                dataset_cache.set(cache_key, ds)
                return ds
            else:
                logger.error(f"❌ No NetCDF fallback found: {nc_path}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to open {metadata['datasetName']}: Zarr incomplete and no NetCDF fallback found",
                )

        except Exception as e:
            logger.error(f"❌ Unexpected error opening {metadata['datasetName']}: {e}")
            import traceback

            logger.error(traceback.format_exc())
            raise HTTPException(
                status_code=500,
                detail=f"Failed to access local dataset: {metadata['datasetName']} - {str(e)}",
            )

    @staticmethod
    async def load_kerchunk_reference(kerchunk_path: str) -> Dict:
        """Load kerchunk reference file with multiple fallback methods"""
        try:
            # Try ujson first (fastest)
            with open(kerchunk_path, "r") as f:
                refs = ujson.load(f)
                logger.info(
                    f"Loaded kerchunk reference with ujson: {len(refs.get('refs', {}))} refs"
                )
                return refs
        except Exception as ujson_error:
            logger.warning(f"ujson failed, trying standard json: {ujson_error}")
            try:
                # Fallback to standard json
                with open(kerchunk_path, "r") as f:
                    refs = json.load(f)
                    logger.info(
                        f"Loaded kerchunk reference with json: {len(refs.get('refs', {}))} refs"
                    )
                    return refs
            except Exception as e:
                logger.error(f"Failed to load kerchunk reference {kerchunk_path}: {e}")
                raise
