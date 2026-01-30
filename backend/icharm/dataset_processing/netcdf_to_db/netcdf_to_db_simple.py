import io
import os
import re
from datetime import datetime, timedelta
from pathlib import Path

import numpy
import pandas
from dotenv import load_dotenv
from netCDF4 import Dataset, num2date
from tqdm import tqdm
from typing import Any

from icharm.dataset_processing.netcdf_to_db.netcdf_to_db_base import NetCDFtoDbBase
from icharm.utils.benchmark import benchmark

load_dotenv()

TIME_VAR_CANDIDATES = ["time"]
LAT_VAR_CANDIDATES = ["lat", "latitude"]
LON_VAR_CANDIDATES = ["lon", "longitude"]
LEVEL_VAR_CANDIDATES = ["level"]


def _decode_time_months_since(times: numpy.ndarray, units: str) -> list[datetime]:
    """
    Decode time values when units are 'months since <reference_date>'.
    netCDF4.num2date does not support 'months since' with the standard calendar.
    """
    # Parse "months since 2005-01-01 00:00:00" or similar
    match = re.match(
        r"months\s+since\s+(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?",
        units,
        re.IGNORECASE,
    )
    if not match:
        raise ValueError(f"Cannot parse 'months since' reference from units: {units}")
    y, m, d = int(match.group(1)), int(match.group(2)), int(match.group(3))
    hh = int(match.group(4) or 0)
    mm = int(match.group(5) or 0)
    ss = int(match.group(6) or 0)
    ref = datetime(y, m, d, hh, mm, ss)

    result = []
    for val in numpy.atleast_1d(times):
        v = float(val)
        months_int = int(v)
        frac = v - months_int
        dt = ref
        # Add whole months
        for _ in range(months_int):
            if dt.month == 12:
                dt = dt.replace(month=1, year=dt.year + 1)
            else:
                dt = dt.replace(month=dt.month + 1)
        # Fractional month: approximate as fraction of 30 days
        if frac != 0:
            dt = dt + timedelta(days=frac * 30)
        result.append(dt)
    return result


class NetCDFtoDbSimple(NetCDFtoDbBase):
    longitudes: dict[int, float] = {}
    latitudes: dict[int, float] = {}
    timestamps: dict[str, Any] = {}
    levels: dict[Any, Any] = {}
    times_to_filename: dict[datetime, tuple[str, int]] = {}
    gridboxes: dict[int, tuple[int, int]] = {}
    gridbox_ids: list[int] = []
    all_variable_locations: dict[str, int] = {}

    def __init__(
        self,
        folder_root: str | Path,
        time_variable_name: str | None = None,
        latitude_variable_name: str | None = None,
        longitude_variable_name: str | None = None,
        level_variable_name: str | None = None,
        variable_of_interest_name: str | None = None,
    ) -> None:
        super().__init__(
            folder_root=folder_root,
            time_variable_name=time_variable_name,
            latitude_variable_name=latitude_variable_name,
            longitude_variable_name=longitude_variable_name,
            level_variable_name=level_variable_name,
            variable_of_interest_name=variable_of_interest_name,
        )

        # Find all the important required feature names
        self._find_features()
        return

    @benchmark
    def _populate_postgres_data_tables(self, conn):
        files = sorted(self.folder_path.rglob("*.nc"))

        time_idx = 0
        with conn.cursor() as cur:
            # For speed increase
            cur.execute("SET synchronous_commit TO OFF;")

            for file_idx, file in enumerate(tqdm(files)):
                # filename_path = str(file)
                with Dataset(file, "r") as nc:
                    # Get all dates in the current file (there can be more than 1)
                    time_variable = nc.variables[self.time_variable_name]
                    units = time_variable.units or ""
                    if "months since" in units.lower():
                        # num2date does not support "months since" with standard calendar
                        times_dt = _decode_time_months_since(time_variable[:], units)
                    else:
                        times_dt = num2date(
                            times=time_variable[:],
                            units=time_variable.units,
                            calendar=getattr(time_variable, "calendar", "standard"),
                        )
                    # it's possible there are multiple dates per file. If there are
                    # get the idx so we know which index to grab from the file.

                    variable = nc[self.variable_of_interest_name]

                    full_dims = variable.dimensions
                    spatial_dims = [
                        d for d in full_dims if d != self.time_variable_name
                    ]

                    fill_value = None
                    if hasattr(variable, "_FillValue"):
                        fill_value = float(variable._FillValue)
                    elif hasattr(variable, "missing_value"):
                        fill_value = float(variable.missing_value)

                    for idx, time_dt in enumerate(tqdm(times_dt)):
                        iso_formatted_time = time_dt.isoformat()

                        # Insert the datetime into the datetime_dim table
                        timestamp_rows = [(time_idx, iso_formatted_time)]
                        cur.executemany(
                            """
                            INSERT INTO timestamp_dim (timestamp_id, timestamp_val)
                            VALUES (%s, %s) ON CONFLICT (timestamp_id) DO NOTHING
                            """,
                            timestamp_rows,
                        )

                        # The time variable could be in many places, slice the data in the correct one
                        time_idx_loc = self.all_variable_locations[
                            self.time_variable_name
                        ]
                        indexer = tuple(
                            (idx if axis == time_idx_loc else slice(None))
                            for axis in range(variable.ndim)
                        )
                        data = variable[indexer]

                        self._process_multi_level_gridbox_data(
                            data=data,
                            dim_names=spatial_dims,
                            fill_value=fill_value,
                            time_id=time_idx,
                            cur=cur,
                        )

                        time_idx += 1
        return

    def _process_multi_level_gridbox_data(
        self, data, dim_names, fill_value, time_id, cur
    ):
        n_lat = len(self.latitudes.keys())
        n_lon = len(self.longitudes.keys())
        n_levels = len(self.levels.keys())

        # If it's a masked array, fill masked with NaN
        if numpy.ma.isMaskedArray(data):
            data = data.filled(numpy.nan)

        # Replace values with fill_value with numpy.nan
        if fill_value is not None:
            data = numpy.where(data == fill_value, numpy.nan, data)

        # Map dim names -> axis indices in `data`
        name_to_axis = {name: i for i, name in enumerate(dim_names)}

        # Find lat & lon axes
        try:
            lat_axis = name_to_axis[self.latitude_variable_name]  # e.g. 'lat'
            lon_axis = name_to_axis[self.longitude_variable_name]  # e.g. 'lon'
        except KeyError as e:
            raise ValueError(
                f"Could not find lat/lon dims in {dim_names}. "
                f"lat name={self.latitude_variable_name}, lon name={self.longitude_variable_name}"
            ) from e

        # Does this dataset have levels?
        level_axis = (
            name_to_axis.get(self.level_variable_name) if n_levels > 0 else None
        )

        if level_axis is None:
            data_lat_lon = numpy.transpose(data, (lat_axis, lon_axis))
            assert data_lat_lon.shape == (n_lat, n_lon)

            flat_values = data_lat_lon.reshape(-1)
            value_cols = ["value_0"]

        else:
            data_lat_lon_level = numpy.transpose(data, (lat_axis, lon_axis, level_axis))
            assert data_lat_lon_level.shape == (n_lat, n_lon, n_levels)

            flat_values = data_lat_lon_level.reshape(-1, n_levels)
            value_cols = [f"value_{k}" for k in list(self.levels.keys())]

        df_griddata = pandas.DataFrame(flat_values, columns=value_cols)
        df_griddata.insert(0, "gridbox_id", self.gridbox_ids)
        df_griddata.insert(1, "timestamp_id", time_id)

        # Reshape data to gridbox_id, timestamp_id, value
        with io.StringIO() as csv_buffer_grid_date:
            df_griddata.to_csv(csv_buffer_grid_date, index=False)
            csv_buffer_grid_date.seek(0)
            values_str = ",".join(value_cols)
            cur.copy_expert(
                f"""
                COPY grid_data (gridbox_id, timestamp_id, {values_str})
                FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')
                """,
                csv_buffer_grid_date,
            )
        return

    def _create_sql_functions(self, conn):
        with conn.cursor() as cur:
            ###############################
            # get_dates()
            ###############################
            # Function used by the front-end to get list of all valid dates
            cur.execute("DROP FUNCTION IF EXISTS get_dates();")
            get_dates_sql = """
                CREATE FUNCTION get_dates()
                RETURNS TABLE (
                    date_id     INT
                    , date_val  TIMESTAMP
                )
                LANGUAGE sql
                AS $$
                    SELECT
                        timestamp_id AS date_id
                        , timestamp_val AS date_val
                    FROM timestamp_dim
                    ORDER BY timestamp_id ASC
                $$;
            """
            cur.execute(get_dates_sql)

            ###############################
            # get_levels()
            ###############################
            # Function used by the front-end to get list of all valid dates
            cur.execute("DROP FUNCTION IF EXISTS get_levels();")
            get_levels_sql = """
                CREATE FUNCTION get_levels()
                RETURNS TABLE (
                    level_id  INT
                    , name VARCHAR(255)
                )
                LANGUAGE sql
                AS $$
                    SELECT
                        level_id
                        , "name"
                    FROM level
                    ORDER BY level_id ASC
                $$;
            """
            cur.execute(get_levels_sql)

            ###############################
            # get_gridboxes()
            ###############################
            # Function used by the front-end to get all the valid gridboxes and locations
            # Hard-coding this as a single level
            cur.execute("DROP FUNCTION IF EXISTS get_gridboxes();")
            get_gridboxes_sql = """
                CREATE FUNCTION get_gridboxes()
                RETURNS TABLE (
                    gridbox_id  INT
                    , lat_id    DOUBLE PRECISION
                    , lon_id    DOUBLE PRECISION
                    , lat       DOUBLE PRECISION
                    , lon       DOUBLE PRECISION
                )
                LANGUAGE sql
                AS $$
                    SELECT
                            g.gridbox_id
                            , lat.lat_id
                            , lon.lon_id
                            , lat.lat
                            , lon.lon
                        FROM gridbox g
                        JOIN lat ON lat.lat_id = g.lat_id
                        JOIN lon ON lon.lon_id = g.lon_id
                        ORDER BY lat ASC, lon ASC;
                $$;
            """
            cur.execute(get_gridboxes_sql)

            ###############################
            # get_gridbox_data()
            ###############################
            # Function used by the front-end to get all all the gridboxes at a date_id
            cur.execute("""
                DROP FUNCTION IF EXISTS get_gridbox_data(
                    in_date_id INTEGER
                    , in_level_id INTEGER
                );
            """)
            get_gridbox_data_sql = """
                CREATE FUNCTION get_gridbox_data(
                    in_date_id    INTEGER
                    , in_level_id INTEGER
                )
                RETURNS TABLE (
                    gridbox_id    INT
                    , lat         DOUBLE PRECISION
                    , lon         DOUBLE PRECISION
                    , value       DOUBLE PRECISION
                )
                LANGUAGE sql
                AS $$
                    SELECT
                        gd.gridbox_id
                        , lat.lat
                        , lon.lon
                        , (to_jsonb(gd) ->> ('value_' || in_level_id))::double precision AS value
                    FROM grid_data gd
                    JOIN gridbox gb ON
                        gd.gridbox_id = gb.gridbox_id
                    JOIN lat ON lat.lat_id = gb.lat_id
                    JOIN lon ON lon.lon_id = gb.lon_id
                    WHERE
                        gd.timestamp_id = in_date_id
                    ORDER BY gridbox_id ASC
                $$;
            """
            cur.execute(get_gridbox_data_sql)

            ###############################
            # get_timeseries()
            ###############################
            # Function used by the front-end to get all the timeseries elements for a given gridbox
            # - p_gridbox_id: id of the gridbox that data is requested for
            # - p_level_id: id of the level
            cur.execute("""
                DROP FUNCTION IF EXISTS get_timeseries(
                    in_gridbox_id INTEGER
                    , in_level_id INTEGER
                );
            """)
            sql_get_timeseries_sql = """
                CREATE FUNCTION get_timeseries(
                    in_gridbox_id INTEGER
                    , in_level_id INTEGER
                )
                RETURNS TABLE (
                    date_val     DATE
                    , value      DOUBLE PRECISION
                )
                LANGUAGE sql
                AS $$
                    SELECT
                        timestamp_val AS date_val
                        -- Convert the row to a json to grab the column name dynamically
                        , (to_jsonb(gd) ->> ('value_' || in_level_id))::double precision AS value
                    FROM timestamp_dim AS d
                    JOIN grid_data gd ON
                        d.timestamp_id = gd.timestamp_id
                    WHERE gd.gridbox_id = in_gridbox_id
                $$;
            """
            cur.execute(sql_get_timeseries_sql)
            conn.commit()
        return


def main():
    data_path = "/Users/willruff/Desktop/Github/ICharm.AI-Project/backend/datasets/temperature_anomaly_monthly"
    dataset_name = "ocean_heat_content"
    variable_of_interest_name = "t_an"

    database_username = os.getenv("POSTGRES_USERNAME", "icharm_user")
    database_password = os.getenv("POSTGRES_PASSWORD")
    database_hostname = os.getenv("POSTGRES_HOSTNAME", "localhost")

    if database_password is None:
        raise ValueError("POSTGRES_PASSWORD environment variable not set")

    netcdf_to_db = NetCDFtoDbSimple(
        folder_root=data_path,
        variable_of_interest_name=variable_of_interest_name,
    )
    # netcdf_to_db.export_data_to_csv("/home/mrsharky/dev/sdsu/ICharm.AI-Project/backend/datasets/cmorph/daily/")
    netcdf_to_db.export_data_to_postgres(
        database_name=dataset_name,
        user=database_username,
        password=database_password,
        host=database_hostname,
    )
    # netcdf_indexer.create_index()

    # Grab a LOT of data
    # date_lower_bound = datetime(2000, 1, 1)
    # date_upper_bound = datetime(2020, 1, 1)
    # netcdf_indexer.get_grid_data(
    #     lat_idx=123,
    #     lon_idx=45,
    #     date_lower_bound=date_lower_bound,
    #     date_upper_bound=date_upper_bound,
    # )
    return


if __name__ == "__main__":
    main()
