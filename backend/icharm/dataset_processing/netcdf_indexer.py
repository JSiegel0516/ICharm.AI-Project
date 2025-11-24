import pickle
from pathlib import Path

from datetime import datetime
from netCDF4 import Dataset, num2date
from tqdm import tqdm
from typing import Any

from icharm.utils.benchmark import benchmark

TIME_VAR_CANDIDATES = ["time"]
LAT_VAR_CANDIDATES = ["lat", "latitude"]
LON_VAR_CANDIDATES = ["lon", "longitude"]


class NetCDFIndexer:
    def __init__(
        self,
        folder_root: str | Path,
        time_variable_name: str | None = None,
        latitude_variable_name: str | None = None,
        longitude_variable_name: str | None = None,
        variable_of_interest_name: str | None = None,
    ) -> None:
        if isinstance(folder_root, str):
            folder_path = Path(folder_root)
        elif isinstance(folder_root, Path):
            folder_path = folder_root
        else:
            raise TypeError("Folder path must be either a string or a Path object.")
        self.folder_path = folder_path
        self.time_variable_name = time_variable_name
        self.longitude_variable_name = longitude_variable_name
        self.latitude_variable_name = latitude_variable_name
        self.variable_of_interest_name = variable_of_interest_name

        # Values to fill in later
        self.longitudes: dict[float, int] = {}
        self.latitudes: dict[float, int] = {}
        self.timestamps: dict[str, Any] = {}
        self.times_to_filename: dict[datetime, tuple[str, int]] = {}
        return

    def _guess_varible_name(self, nc: Dataset, candidates: list[str]) -> str:
        var_names = set(nc.variables.keys())
        for c in candidates:
            if c in var_names:
                return c
        raise RuntimeError(f"Could not find any of {candidates} in {var_names}")

    def _get_metadata_from_file(self, example_path: Path):
        with Dataset(example_path, "r") as nc:
            if self.time_variable_name is None:
                self.time_variable_name = self._guess_varible_name(
                    nc, TIME_VAR_CANDIDATES
                )
            if self.latitude_variable_name is None:
                self.latitude_variable_name = self._guess_varible_name(
                    nc, LAT_VAR_CANDIDATES
                )
            if self.longitude_variable_name is None:
                self.longitude_variable_name = self._guess_varible_name(
                    nc, LON_VAR_CANDIDATES
                )

            # If we don't know the variable of interest (it's a bit harder to get
            if self.variable_of_interest_name is None:
                potential_variables = list(nc.variables.keys())
                potential_variables.remove(self.time_variable_name)
                potential_variables.remove(self.latitude_variable_name)
                potential_variables.remove(self.longitude_variable_name)

                # We "should" be able to throw out values with "_bounds" in them
                # TODO: This needs further testing with more netcdf files
                potential_variables = [
                    i for i in potential_variables if "_BOUNDS" not in i.upper()
                ]
                if len(potential_variables) == 1:
                    self.variable_of_interest_name = potential_variables[0]
                else:
                    raise RuntimeError(
                        f"Could not find the variable of interest in {potential_variables}"
                    )

            # Now get all lot/lon variable values based off index
            raw_longitudes = nc.variables[self.longitude_variable_name][:]
            longitudes = {}
            for idx, value in enumerate(list(raw_longitudes)):
                longitudes[float(value)] = idx
            self.longitudes = longitudes

            raw_latitudes = nc.variables[self.latitude_variable_name][:]
            latitudes = {}
            for idx, value in enumerate(list(raw_latitudes)):
                latitudes[float(value)] = idx
            self.latitudes = latitudes

        return

    def _associate_dates_with_files(
        self, files: list[Path]
    ) -> dict[str, tuple[str, int]]:
        times_to_filename = {}
        for file in tqdm(files):
            filename_path = str(file)
            with Dataset(file, "r") as nc:
                # Get all dates in the current file (there can be more than 1)
                time_variable = nc.variables[self.time_variable_name]
                # time_values = nc.variables[self.time_variable_name][:]
                times_dt = num2date(
                    times=time_variable[:],
                    units=time_variable.units,
                    calendar=getattr(time_variable, "calendar", "standard"),
                )
                # it's possible there are multiple dates per file. If there are
                # get the idx so we know which index to grab from the file.
                for idx, time_dt in enumerate(times_dt):
                    # iso_formatted_time = time_dt.isoformat()
                    times_to_filename[time_dt] = (filename_path, idx)
        return times_to_filename

    def create_index(self):
        # Data should be organized under the folder
        files = sorted(self.folder_path.rglob("*.nc"))
        if not files:
            raise SystemExit(f"No .nc files found under {self.folder_path}")

        print(f"Found {len(files)} NetCDF files")

        # Inspect first file to determine:
        # - variable names
        # - latitude values and indexes
        # - longitude values and indexes
        self._get_metadata_from_file(files[0])
        print("Detected variable names:")
        print(f"  time:     {self.time_variable_name}")
        print(f"  lat:      {self.latitude_variable_name}")
        print(f"  lon:      {self.longitude_variable_name}")
        print(f"  interest: {self.variable_of_interest_name}")

        # Scan each file to get the dates in all of them
        self.times_to_filename = self._associate_dates_with_files(files)

        return

    def save(self, path: str | Path | None = None) -> None:
        """
        Pickle this indexer to disk.
        Default: store next to the folder_root as '.netcdf_index.pkl'.
        """
        if path is None:
            path = self.folder_path / ".netcdf_index.pkl"
        else:
            path = Path(path)

        path.parent.mkdir(parents=True, exist_ok=True)

        with path.open("wb") as f:
            pickle.dump(self, f, protocol=pickle.HIGHEST_PROTOCOL)

        print(f"Saved NetCDFIndexer to {path}")

    @classmethod
    def load(cls, path: str | Path):
        """
        Load a previously pickled NetCDFIndexer.
        """
        path = Path(path)
        with path.open("rb") as f:
            obj = pickle.load(f)
        if not isinstance(obj, cls):
            raise TypeError(f"Pickle at {path} is not a {cls.__name__} instance")
        return obj

    def load_grid_data(self, lat_idx, lon_idx, filename_and_index: tuple[str, int]):
        path = Path(filename_and_index[0])
        time_idx = filename_and_index[1]
        results_data = []
        with Dataset(path, "r") as nc:
            variable = nc[self.variable_of_interest_name]
            val = float(variable[time_idx, lat_idx, lon_idx])
            results_data.append(val)
        return results_data

    @benchmark
    def get_grid_data(
        self,
        lat_idx: int,
        lon_idx: int,
        date_lower_bound: datetime,
        date_upper_bound: datetime,
    ):
        # Get all the dates that need to be loaded
        data_files_to_load = []
        for curr_timestamp in self.times_to_filename:
            # curr_timestamp = datetime.datetime(timestamp_str
            if date_lower_bound <= curr_timestamp <= date_upper_bound:
                data_files_to_load.append(self.times_to_filename[curr_timestamp])

        # Load it
        all_data = []
        for data_file_to_load in tqdm(data_files_to_load):
            curr_data = self.load_grid_data(lat_idx, lon_idx, data_file_to_load)
            all_data.append(curr_data)

        return all_data


def main():
    data_path = (
        "/home/mrsharky/dev/sdsu/ICharm.AI-Project/backend/datasets/cmorph/daily"
    )

    cache_path = Path(data_path) / Path(".netcdf_index.pkl")

    if cache_path.exists():
        print(f"Loading existing index from {cache_path}")
        netcdf_indexer = NetCDFIndexer.load(cache_path)
    else:
        print("No existing index found; building a new one...")
        netcdf_indexer = NetCDFIndexer(data_path)
        netcdf_indexer.create_index()
        netcdf_indexer.save(cache_path)

    # Grab a LOT of data
    date_lower_bound = datetime(2000, 1, 1)
    date_upper_bound = datetime(2020, 1, 1)
    netcdf_indexer.get_grid_data(
        lat_idx=123,
        lon_idx=45,
        date_lower_bound=date_lower_bound,
        date_upper_bound=date_upper_bound,
    )


if __name__ == "__main__":
    main()
