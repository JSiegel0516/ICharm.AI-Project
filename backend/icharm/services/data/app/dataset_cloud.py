import json
import logging

from fastapi import HTTPException
from typing import List, Optional
from datetime import datetime, timedelta
import xarray as xr
import pandas as pd
import fsspec
import os
import asyncio
from pathlib import Path
import s3fs
import kerchunk.hdf
import kerchunk.combine

from icharm.services.data.app.dataset_cache import dataset_cache
from icharm.services.data.app.env_helpers import EnvHelpers

# Setup logging
logger = logging.getLogger(__name__)

KERCHUNK_PATH = EnvHelpers.resolve_env_path(
    os.getenv("KERCHUNK_PATH"), "kerchunk", ensure_exists=True
)

CACHE_DIR = EnvHelpers.resolve_env_path(
    os.getenv("CACHE_DIR"), "/tmp/climate_cache", ensure_exists=True
)
# Create cache directory if it doesn't exist
Path(CACHE_DIR).mkdir(parents=True, exist_ok=True)

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
S3_ANON = os.getenv("S3_ANONYMOUS", "true").lower() == "true"


class DatasetCloud:
    @staticmethod
    async def open_cloud_dataset(
        metadata: pd.Series, start_date: datetime, end_date: datetime
    ) -> xr.Dataset:
        """Open cloud-based dataset using direct S3 access (simplified from working example)"""

        cache_key = f"{metadata['id']}_{start_date.date()}_{end_date.date()}"
        cached = dataset_cache.get(cache_key)
        if cached is not None:
            logger.info(f"Using cached cloud dataset: {cache_key}")
            return cached

        try:
            input_file = str(metadata["inputFile"])
            engine = str(metadata.get("engine", "h5netcdf")).lower()

            if engine == "zarr" and input_file.lower().endswith(".nc"):
                logger.warning(
                    "Dataset %s declares engine=zarr but input is NetCDF; switching to h5netcdf",
                    metadata.get("datasetName"),
                )
                engine = "h5netcdf"

            logger.info(f"Opening cloud dataset: {metadata['datasetName']}")
            logger.info(f"Input file: {input_file}")
            logger.info(f"Engine: {engine}")
            dataset_name = str(metadata.get("datasetName") or "")
            normalized_name = dataset_name.lower()

            if normalized_name == "mean layer temperature - noaa cdr":
                logger.info(
                    "Using HDF5 loader for Mean Layer Temperature - NOAA CDR dataset"
                )
                engine = "h5netcdf"

            if normalized_name == "precipitation - cmorph cdr":
                logger.info("Using CMORPH-specific loader")
                ds = await asyncio.to_thread(
                    DatasetCloud.open_cmorph_dataset, metadata, start_date, end_date
                )
                dataset_cache.set(cache_key, ds)
                return ds
            if normalized_name == "normalized difference vegetation index cdr":
                logger.info("Using NDVI-specific loader")
                ds = await asyncio.to_thread(
                    DatasetCloud.open_ndvi_dataset, metadata, start_date
                )
                dataset_cache.set(cache_key, ds)
                return ds

            # Resolve concrete object keys for the requested date range
            candidate_urls: List[str] = []
            if "{" in input_file:
                expanded = DatasetCloud.expand_date_pattern(
                    input_file, start_date, end_date
                )
            else:
                expanded = [input_file]

            fs = fsspec.filesystem("s3", anon=S3_ANON)
            for candidate in expanded:
                normalized = DatasetCloud.normalize_s3_url(candidate)
                if "*" in normalized or "?" in normalized:
                    glob_target = (
                        normalized[5:] if normalized.startswith("s3://") else normalized
                    )
                    matches = fs.glob(glob_target)
                    candidate_urls.extend(
                        [
                            match if match.startswith("s3://") else f"s3://{match}"
                            for match in matches
                        ]
                    )
                else:
                    candidate_urls.append(normalized)

            if not candidate_urls:
                raise FileNotFoundError(
                    f"No remote assets resolved for dataset {metadata['datasetName']} between "
                    f"{start_date.date()} and {end_date.date()}"
                )

            # Deduplicate while preserving order
            seen = set()
            unique_urls = []
            for url in candidate_urls:
                if url not in seen:
                    seen.add(url)
                    unique_urls.append(url)
            candidate_urls = unique_urls

            # Verify remote assets exist; drop any stale entries
            verified_urls: List[str] = []
            for url in candidate_urls:
                check_path = url[5:] if url.startswith("s3://") else url
                try:
                    fs.info(check_path)
                    verified_urls.append(url)
                except FileNotFoundError:
                    logger.warning("Remote asset not found: %s", url)

            candidate_urls = verified_urls

            if (
                not candidate_urls
                and normalized_name == "mean layer temperature - noaa cdr"
            ):
                logger.info(
                    "No valid TLS assets resolved; listing bucket for latest available file"
                )
                try:
                    prefix = "noaa-cdr-mean-layer-temp-pds/data/"
                    entries = fs.ls(prefix)
                    tls_candidates = sorted(
                        entry
                        for entry in entries
                        if entry.lower().endswith(".nc") and "tls" in entry.lower()
                    )
                    if tls_candidates:
                        latest = tls_candidates[-1]
                        logger.info(f"Using latest TLS asset: {latest}")
                        candidate_urls = [
                            latest if latest.startswith("s3://") else f"s3://{latest}"
                        ]
                except Exception as e:
                    logger.warning("Failed to enumerate TLS assets in bucket: %s", e)

            if not candidate_urls:
                raise FileNotFoundError(
                    f"No accessible remote assets located for dataset {metadata['datasetName']}"
                )

            # Keep processing manageable
            max_files = 12
            if len(candidate_urls) > max_files:
                logger.warning(
                    f"Resolved {len(candidate_urls)} files for {metadata['datasetName']}; "
                    f"limiting to first {max_files}"
                )
                candidate_urls = candidate_urls[:max_files]

            kerchunk_hint = (metadata.get("kerchunkPath") or "").strip()

            def _kerchunk_local_path() -> Optional[Path]:
                if not kerchunk_hint or kerchunk_hint.lower() in ("none", "null"):
                    return None
                cleaned = kerchunk_hint.lstrip("/\\")
                if cleaned.startswith("kerchunk/"):
                    cleaned = cleaned[len("kerchunk/") :]  # noqa E203

                # TRY KERCHUNK_PATH first, fallback to CACHE_DIR if not writable
                try:
                    # Check if KERCHUNK_PATH exists and is writable
                    if KERCHUNK_PATH.exists():
                        path = KERCHUNK_PATH / cleaned
                        # Test write access
                        path.parent.mkdir(parents=True, exist_ok=True)
                        if os.access(path.parent, os.W_OK):
                            logger.info(f"Using KERCHUNK_PATH: {path}")
                            return path
                except (OSError, PermissionError) as e:
                    logger.warning(f"KERCHUNK_PATH not writable: {e}")

                # Fallback to writable cache directory
                path = CACHE_DIR / "kerchunk" / cleaned
                logger.info(f"Using CACHE_DIR for kerchunk: {path}")
                path.parent.mkdir(parents=True, exist_ok=True)
                return path

            if engine == "zarr":
                asset_url = candidate_urls[0]
                local_ref = _kerchunk_local_path()

                if local_ref:
                    if not local_ref.exists():
                        logger.info(
                            f"Kerchunk reference missing for {metadata['datasetName']}, creating: {local_ref}"
                        )
                        try:
                            await asyncio.to_thread(
                                DatasetCloud.create_kerchunk_reference,
                                asset_url,
                                str(local_ref),
                            )
                        except (OSError, PermissionError) as e:
                            logger.error(f"Failed to create kerchunk reference: {e}")
                            logger.info(
                                "Falling back to direct S3 access without kerchunk"
                            )
                            local_ref = None  # Disable kerchunk, use direct access

                    if local_ref and local_ref.exists():
                        ds = await asyncio.to_thread(
                            xr.open_dataset,
                            "reference://",
                            engine="zarr",
                            backend_kwargs={"consolidated": False},
                            storage_options={
                                "fo": str(local_ref),
                                "remote_protocol": "s3",
                                "remote_options": {"anon": S3_ANON},
                                "asynchronous": False,
                            },
                        )
                    else:
                        # Fallback to direct zarr access
                        logger.warning("Kerchunk unavailable, using direct zarr access")
                        ds = await asyncio.to_thread(
                            xr.open_zarr,
                            asset_url,
                            consolidated=True,
                            storage_options={"anon": S3_ANON},
                        )
                else:
                    ds = await asyncio.to_thread(
                        xr.open_zarr,
                        asset_url,
                        consolidated=True,
                        storage_options={"anon": S3_ANON},
                    )

            elif engine == "h5netcdf":
                local_ref = _kerchunk_local_path()

                if local_ref:
                    if not local_ref.exists():
                        logger.info(
                            f"Generating kerchunk reference for {metadata['datasetName']} at {local_ref}"
                        )
                        try:
                            # Use first resolved asset as representative for reference
                            await asyncio.to_thread(
                                DatasetCloud.create_kerchunk_reference,
                                candidate_urls[0],
                                str(local_ref),
                            )
                        except (OSError, PermissionError) as e:
                            logger.error(f"Failed to create kerchunk reference: {e}")
                            logger.info(
                                "Falling back to direct S3 access without kerchunk"
                            )
                            local_ref = None

                    if local_ref and local_ref.exists():
                        ds = await asyncio.to_thread(
                            xr.open_dataset,
                            "reference://",
                            engine="zarr",
                            backend_kwargs={"consolidated": False},
                            storage_options={
                                "fo": str(local_ref),
                                "remote_protocol": "s3",
                                "remote_options": {"anon": S3_ANON},
                                "asynchronous": False,
                            },
                        )
                    else:
                        # Fallback to direct NetCDF access
                        logger.warning(
                            "Kerchunk unavailable, using direct NetCDF access"
                        )
                        datasets = []
                        for url in candidate_urls:
                            logger.info(f"Opening S3 object {url}")
                            url_clean = url[5:] if url.startswith("s3://") else url

                            def _load():
                                with fs.open(url_clean, mode="rb") as s3_file:
                                    ds_single = xr.open_dataset(
                                        s3_file, engine="h5netcdf"
                                    )
                                    return ds_single.load()

                            ds_single = await asyncio.to_thread(_load)
                            datasets.append(ds_single)

                        if len(datasets) == 1:
                            ds = datasets[0]
                        else:
                            logger.info(
                                f"Concatenating {len(datasets)} netCDF parts for {metadata['datasetName']}"
                            )
                            ds = await asyncio.to_thread(
                                xr.concat,
                                datasets,
                                dim="time",
                                combine_attrs="override",
                            )
                else:
                    datasets = []
                    for url in candidate_urls:
                        logger.info(f"Opening S3 object {url}")
                        url_clean = url[5:] if url.startswith("s3://") else url

                        def _load():
                            with fs.open(url_clean, mode="rb") as s3_file:
                                ds_single = xr.open_dataset(s3_file, engine="h5netcdf")
                                return ds_single.load()

                        ds_single = await asyncio.to_thread(_load)
                        datasets.append(ds_single)

                    if len(datasets) == 1:
                        ds = datasets[0]
                    else:
                        logger.info(
                            f"Concatenating {len(datasets)} netCDF parts for {metadata['datasetName']}"
                        )
                        ds = await asyncio.to_thread(
                            xr.concat, datasets, dim="time", combine_attrs="override"
                        )

            else:
                asset_url = candidate_urls[0]
                ds = await asyncio.to_thread(
                    xr.open_dataset,
                    asset_url,
                    engine=engine,
                    storage_options={"anon": S3_ANON},
                )

            logger.info(f"Successfully opened: {metadata['datasetName']}")
            logger.info(f"   Dimensions: {dict(ds.dims)}")
            logger.info(f"   Variables: {list(ds.data_vars)}")

            # Cache the dataset
            dataset_cache.set(cache_key, ds)
            return ds

        except Exception as e:
            logger.error(f"Failed to open cloud dataset {metadata['datasetName']}: {e}")
            logger.error(f"Error type: {type(e).__name__}")
            import traceback

            logger.error(f"Traceback: {traceback.format_exc()}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to access cloud dataset '{metadata['datasetName']}': {str(e)}",
            )

    @staticmethod
    def open_cmorph_dataset(
        metadata: pd.Series, start_date: datetime, end_date: datetime
    ) -> xr.Dataset:
        """
        Open CMORPH precipitation data by mirroring the reference implementation in cmorph_test.py.
        Aggregates all daily NetCDF files for the requested month(s) and returns an in-memory dataset.
        """
        base_path = str(metadata.get("inputFile") or "").rstrip("/")
        if not base_path:
            raise ValueError("CMORPH dataset inputFile is missing.")

        if base_path.startswith("s3://"):
            glob_base = base_path[len("s3://") :]  # noqa E203
        else:
            glob_base = base_path

        fs = s3fs.S3FileSystem(anon=S3_ANON)

        month_keys: List[tuple[int, int]] = []
        cursor = datetime(start_date.year, start_date.month, 1)
        end_marker = datetime(end_date.year, end_date.month, 1)
        while cursor <= end_marker:
            month_keys.append((cursor.year, cursor.month))
            # advance to first day next month
            if cursor.month == 12:
                cursor = datetime(cursor.year + 1, 1, 1)
            else:
                cursor = datetime(cursor.year, cursor.month + 1, 1)

        file_urls: List[str] = []
        for year, month in month_keys:
            pattern = f"{glob_base}/{year:04d}/{month:02d}/*.nc"
            matches = fs.glob(pattern)
            if matches:
                for match in matches:
                    file_urls.append(
                        match if match.startswith("s3://") else f"s3://{match}"
                    )

        if not file_urls:
            raise FileNotFoundError(
                f"No CMORPH NetCDF files found for {metadata['datasetName']} between "
                f"{start_date.date()} and {end_date.date()} (searched under {glob_base})."
            )

        engine = (metadata.get("engine") or "h5netcdf").lower()
        open_files = [fs.open(url, mode="rb") for url in file_urls]

        ds: Optional[xr.Dataset] = None
        try:
            ds = xr.open_mfdataset(
                open_files,
                engine=engine,
                combine="by_coords",
                parallel=False,
                chunks={"time": 1},
            )
            loaded = ds.load()
            return loaded
        finally:
            if ds is not None:
                try:
                    ds.close()
                except Exception:
                    pass
            for handle in open_files:
                try:
                    handle.close()
                except Exception:
                    pass

    @staticmethod
    def open_ndvi_dataset(metadata: pd.Series, target_date: datetime) -> xr.Dataset:
        """
        Open NDVI CDR data for a specific day using the same approach as the reference cmorph loader.
        """
        template = (metadata.get("inputFile") or "").strip()
        if not template:
            raise ValueError("NDVI dataset inputFile is missing.")

        filled = template.format(
            year=target_date.year,
            month=target_date.month,
            day=target_date.day,
        )

        if filled.startswith("s3://"):
            glob_path = filled[len("s3://") :]  # noqa E203
        else:
            glob_path = filled

        fs = s3fs.S3FileSystem(anon=S3_ANON)
        matches = sorted(fs.glob(glob_path))
        if not matches:
            raise FileNotFoundError(
                f"No NDVI files found for {target_date.strftime('%Y-%m-%d')} using pattern {glob_path}"
            )

        key = matches[0]
        engine = (metadata.get("engine") or "h5netcdf").lower()

        with fs.open(key, mode="rb") as handle:
            ds = xr.open_dataset(handle, engine=engine)
            loaded = ds.load()

        if "time" in loaded.coords:
            try:
                loaded = loaded.sel(time=target_date, method="nearest")
            except Exception:
                pass

        return loaded

    @staticmethod
    def expand_date_pattern(
        url_pattern: str, start_date: datetime, end_date: datetime
    ) -> List[str]:
        """Expand URL pattern with date wildcards into list of URLs"""
        urls = []
        current = start_date

        while current <= end_date:
            url = url_pattern.format(
                year=current.year, month=current.month, day=current.day
            )
            urls.append(url)

            # Increment based on pattern granularity
            if "{day" in url_pattern:
                current += timedelta(days=1)
            elif "{month" in url_pattern:
                # Move to first day of next month
                if current.month == 12:
                    current = datetime(current.year + 1, 1, 1)
                else:
                    current = datetime(current.year, current.month + 1, 1)
            else:
                current = datetime(current.year + 1, 1, 1)

        return urls

    @staticmethod
    def normalize_s3_url(url: str) -> str:
        """
        Ensure S3 URIs include the s3:// prefix.
        """
        if not url:
            raise ValueError("Remote URL template is empty.")
        url = url.strip()
        if url.startswith(("s3://", "http://", "https://")):
            return url
        return f"s3://{url.lstrip('/')}"

    @staticmethod
    def resolve_remote_asset(metadata: pd.Series, date_hint: datetime) -> str:
        """
        Resolve the remote asset (S3 object) for a metadata record and date.
        Handles template substitution and wildcard expansion.
        """
        template = (metadata.get("inputFile") or "").strip()
        if not template:
            raise ValueError(
                f"No inputFile configured for dataset {metadata.get('datasetName')}"
            )

        formatted = template
        if "{" in formatted:
            formatted = formatted.format(
                year=date_hint.year,
                month=date_hint.month,
                day=date_hint.day,
                hour=getattr(date_hint, "hour", 0),
                minute=getattr(date_hint, "minute", 0),
                second=getattr(date_hint, "second", 0),
            )

        normalized = DatasetCloud.normalize_s3_url(formatted)

        if normalized.endswith("/"):
            raise ValueError(
                f"Input file for dataset {metadata.get('datasetName')} resolves to a directory: {normalized}"
            )

        if "*" in normalized:
            fs = fsspec.filesystem("s3", anon=S3_ANON)
            glob_target = (
                normalized[5:] if normalized.startswith("s3://") else normalized
            )
            matches = fs.glob(glob_target)
            if not matches:
                raise ValueError(f"No files found matching pattern: {normalized}")
            candidate = matches[0]
            if not candidate.startswith("s3://"):
                candidate = f"s3://{candidate}"
            normalized = candidate

        return normalized

    @staticmethod
    def create_kerchunk_reference(url: str, output_path: str) -> str:
        """Create kerchunk reference file for cloud NetCDF/HDF5 data"""
        try:
            normalized_url = DatasetCloud.normalize_s3_url(url)
            destination = Path(output_path)
            destination.parent.mkdir(parents=True, exist_ok=True)

            fs = fsspec.filesystem("s3", anon=S3_ANON)
            with fs.open(normalized_url, "rb") as f:
                h5chunks = kerchunk.hdf.SingleHdf5ToZarr(f, normalized_url)
                refs = h5chunks.translate()

            with destination.open("w") as f:
                json.dump(refs, f)

            return str(destination)
        except Exception as e:
            logger.error(f"Failed to create kerchunk reference: {e}")
            raise