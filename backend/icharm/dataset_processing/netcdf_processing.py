import time
from datetime import datetime, timezone

import os
import xarray as xr

from icharm.utils.benchmark import benchmark

from netCDF4 import Dataset


@benchmark
def erddap_speed_test():
    """
    Me playing around with an ERDDAP dataset to see how fast it is:
        - Speed is meh - it can get 1488 points in ~38 seconds (not great)
        - This is just "getting" the individual point, no data processing happening
        - Cmorph doesn't support this (at least not yet)

    What's interesting, is we can see how big the entire dataset is: 453GB
    Returns:

    """
    # 1) ERDDAP dataset (NetCDF via griddap)
    base_url = "https://erddap.aoml.noaa.gov/hdb/erddap/griddap/precipitation_2023"

    # 2) Open the dataset lazily (just metadata + coordinate info at first)
    t0 = time.perf_counter()
    ds = xr.open_dataset(base_url)
    t1 = time.perf_counter()
    print(f"Opened dataset (metadata only) in {t1 - t0:.3f} s")

    print(ds)

    # 3) Choose a point (on the 0.1° grid or near it)
    #    Example: San Diego-ish
    lat0 = 32.7
    lon0 = -117.2

    # 4) Build a selection (ERDDAP will serve an OPeNDAP subset)
    #    - Use method='nearest' to snap to the nearest grid cell
    #    - Limit to a time window so you can test speed
    time_start = "2023-01-01"
    time_end = "2023-01-31"

    da = ds["precipitationCal"]

    # 1) Slice time range (no method needed here)
    da_time = da.sel(time=slice(time_start, time_end))

    # 2) Now do nearest-neighbor for the point
    point = da_time.sel(latitude=lat0, longitude=lon0, method="nearest")

    # 5) Actually trigger the data download and time it
    t2 = time.perf_counter()
    point_data = point.load()  # this is where data are fetched
    t3 = time.perf_counter()

    print(f"Downloaded {point_data.size} values in {t3 - t2:.3f} s")
    print(point_data)

    return


def netcd4_direct_data_testing():
    """
    This was just trying to read th file with netCDF4 directly.

    It seems fast if you know the indexes of what you want.
    Returns:

    """

    # Get current path
    current_file_path = os.path.dirname(os.path.abspath(__file__))
    cmorph_file = (
        current_file_path
        + "/../../datasets/cmorph/daily/0.25deg/1998/01/air.mon.anom.v6.nc"
    )

    with Dataset(cmorph_file, mode="r") as ds:
        # Inspect dims / vars once
        print(ds.dimensions.keys())
        print(ds.variables.keys())

        times = ds.variables["time"]

        # Convert to datetime (UTC)
        _ = datetime.fromtimestamp(
            timestamp=times[0],
            tz=timezone.utc,
        )

        precip = ds.variables["cmorph"]  # or whatever the name is

        # Suppose you already know the i,j index for your grid box
        i = 123  # lon index
        j = 45  # lat index

        # Time series (all time steps at that grid box)
        test = precip[:, j, i]  # this is a numpy array
        print(test)

        # It loads pretty fast
        return


def main() -> None:
    erddap_speed_test()

    # netcd4_direct_data_testing()

    return


if __name__ == "__main__":
    main()
