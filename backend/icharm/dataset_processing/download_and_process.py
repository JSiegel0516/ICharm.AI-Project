from datetime import datetime
import os
import pandas
import logging
import xarray as xr
from pathlib import Path
import requests
import shutil
from typing import Any, Dict

from icharm.dataset_processing.downloaders.downloaders import Downloaders
from icharm.dataset_processing.downloaders.ftp_globber import FtpGlobber
from icharm.dataset_processing.netcdf_to_db.netcdf_to_db_by_year import (
    NetCDFtoDbYearlyFiles,
)
from icharm.dataset_processing.netcdf_to_db.netcdf_to_db_simple import NetCDFtoDbSimple
from icharm.utils.logger import setup_logging


class DownloadAndProcess:
    def __init__(
        self,
        database_username: str,
        database_password: str,
        database_hostname: str,
        database_port: int = 5432,
    ):
        self.logger = logging.getLogger(self.__class__.__name__)
        self.database_username = database_username
        self.database_password = database_password
        self.database_hostname = database_hostname
        self.database_port = database_port
        return

    def process_metadata_file(self, metadata_file: Path, datasets_root_dir: Path):
        """
        args:
        - metadata_file: CSV metadata file path
        - datasets_root_dir: Where to store all the downloaded datasets
        """
        # Read the CSV
        df = pandas.read_csv(metadata_file)

        for _, row in df.iterrows():
            dataset_details = row.to_dict()

            storage_type = dataset_details.get("StorageType").lower()
            # Find out how we want to process the dataset

            if storage_type == "local_zarr":
                self.logger.info("Processing zarr dataset")
                self._process_zarr(row)
            elif storage_type == "local_postgres_netcdf":
                self.logger.info("Processing Postgres NetCDF dataset")
                self._process_netcdf_to_db(dataset_details, datasets_root_dir)

        self.logger.info("All datasets processed.")

    def _prepare_for_zarr(self, ds: xr.Dataset) -> xr.Dataset:
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
                elif isinstance(value, (tuple, list)) and any(
                    ch is None for ch in value
                ):
                    encoding.pop(key, None)
                elif key == "preferred_chunks":
                    # Always drop preferred_chunks – let zarr determine the chunks.
                    encoding.pop(key, None)
        return ds

    def _open_dataset(self, path: Path, decode_times: bool) -> xr.Dataset:
        open_kwargs: Dict[str, Any] = {
            "engine": "h5netcdf",
            "decode_times": decode_times,
        }
        if decode_times:
            try:
                import cftime  # noqa: F401
            except ImportError:
                # Fall back to numpy datetimes; further handling happens upstream.
                self.logger.info("cftime is not installed; continuing without it.")
            else:
                open_kwargs["use_cftime"] = True
        return xr.open_dataset(path, **open_kwargs)

    def _process_zarr(self, row):
        if row["Stored"] != "local":
            self.logger.info("Incorrect Storage Type")
            return

        local_zarr_path = Path(
            row["inputFile"]
        )  # e.g., datasets/global_precipitation.zarr
        source_url = row["origLocation"]

        self.logger.info(f"\nProcessing dataset: {row['datasetName']}")
        self.logger.info(f"Zarr path: {local_zarr_path}")
        self.logger.info(f"Source URL: {source_url}")

        # Skip if Zarr already exists
        if local_zarr_path.exists():
            self.logger.info("Zarr store already exists, skipping...")
            return

        # Ensure parent directory exists
        local_zarr_path.parent.mkdir(parents=True, exist_ok=True)

        # Download NetCDF file to temporary location
        temp_nc_file = local_zarr_path.with_suffix(".nc")
        self.logger.info(f"Downloading to temporary file: {temp_nc_file}")

        try:
            with requests.get(source_url, stream=True, timeout=60) as r:
                r.raise_for_status()
                with open(temp_nc_file, "wb") as f:
                    shutil.copyfileobj(r.raw, f)
        except Exception as e:
            self.logger.info(f"Failed to download {source_url}: {e}")
            return

        # Open NetCDF and convert to consolidated Zarr
        self.logger.info("Opening NetCDF and converting to Zarr...")
        try:
            with self._open_dataset(temp_nc_file, decode_times=True) as ds:
                self._prepare_for_zarr(ds)
                ds.to_zarr(local_zarr_path, mode="w", consolidated=True)
            self.logger.info(f"Zarr store created: {local_zarr_path}")
        except Exception as e:
            self.logger.info(f"Failed to convert {temp_nc_file} to Zarr: {e}")
            # Fallback: try decode_times=False
            try:
                with self._open_dataset(temp_nc_file, decode_times=False) as ds:
                    self._prepare_for_zarr(ds)
                    ds.to_zarr(local_zarr_path, mode="w", consolidated=True)
                self.logger.info(
                    f"Zarr store created with decode_times=False: {local_zarr_path}"
                )
            except Exception as e2:
                self.logger.info(f"Failed again: {e2}")
                return
        finally:
            if temp_nc_file.exists():
                temp_nc_file.unlink()  # remove temporary NetCDF
        return

    def _process_netcdf_to_db(
        self, dataset_details: dict[str, Any], datasets_root_dir: Path
    ):
        dataset_short_name = dataset_details["datasetShortName"]
        input_file = dataset_details["inputFile"]
        key_variable = dataset_details.get("keyVariable")
        level_variable = dataset_details.get("levelVariable", None)
        start_date_str = dataset_details.get("startDate", None)
        end_date_str = dataset_details.get("endDate", None)

        dataset_download_location = datasets_root_dir / dataset_short_name

        self.logger.info(f"Processing dataset: {dataset_short_name}")

        if input_file.startswith("s3://"):
            # Download the dataset
            self.logger.info("Downloading all files from S3")
            Downloaders.s3_download(input_file, dataset_download_location)

        elif input_file.startswith("ftp://"):
            # First get all the urls if globbing
            self.logger.info("Getting FTP URLs to download")
            urls = FtpGlobber.get_urls_from_glob(input_file)

            # Download the URLs
            if len(urls) > 0:
                # Download the dataset
                self.logger.info(f"Downloading all FTP files: {len(urls)} files")
                Downloaders.wget_download(urls, dataset_download_location, quiet=True)

        # Insert into DB
        postgres_processor = dataset_details.get("PostgresProcessor", "simple")
        if postgres_processor == "simple":
            netcdf_to_db = NetCDFtoDbSimple(
                folder_root=dataset_download_location,
                level_variable_name=level_variable,
                variable_of_interest_name=key_variable,
            )
        elif postgres_processor == "group_by_year":
            if start_date_str is None or end_date_str is None:
                raise ValueError("start_date_str and/or end_date_str cannot be None")
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()

            netcdf_to_db = NetCDFtoDbYearlyFiles(
                folder_root=dataset_download_location,
                variable_of_interest_name=key_variable,
                years=[str(i) for i in range(start_date.year, end_date.year + 1)],
                level_variable_name="year",
            )
        else:
            raise ValueError(f"Unknown postgres processor: {postgres_processor}")

        # Run it
        self.logger.info(f"Importing into DB: {dataset_short_name}")
        netcdf_to_db.export_data_to_postgres(
            database_name=dataset_short_name,
            user=self.database_username,
            password=self.database_password,
            host=self.database_hostname,
            port=self.database_port,
        )
        return


# Path to CSV describing datasets
def main():
    setup_logging()

    curr_folder = os.path.dirname(os.path.abspath(__file__))
    csv_file = Path(
        f"{curr_folder}/../../datasets/metadata.csv"
    )  # replace with your actual CSV path

    datasets_root_dir = Path(f"{curr_folder}/../../datasets")
    datasets_root_dir.mkdir(exist_ok=True)

    database_username = os.getenv("POSTGRES_USERNAME", "icharm_user")
    database_password = os.getenv("POSTGRES_PASSWORD")
    database_hostname = os.getenv("POSTGRES_HOSTNAME", "localhost")
    database_port = int(os.getenv("POSTGRES_PORT", 5432))

    download_and_process = DownloadAndProcess(
        database_username=database_username,
        database_password=database_password,
        database_hostname=database_hostname,
        database_port=database_port,
    )

    download_and_process.process_metadata_file(
        metadata_file=csv_file,
        datasets_root_dir=datasets_root_dir,
    )
    return


if __name__ == "__main__":
    main()
