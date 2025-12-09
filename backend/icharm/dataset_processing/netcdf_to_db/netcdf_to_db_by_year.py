import numpy
import os
import itertools

from pathlib import Path

from netCDF4 import Dataset, num2date
from tqdm import tqdm
from typing import Any

from icharm.dataset_processing.netcdf_to_db.netcdf_to_db_base import NetCDFtoDbBase
from icharm.utils.benchmark import benchmark

from dotenv import load_dotenv

load_dotenv()


class NetCDFtoDbYearlyFiles(NetCDFtoDbBase):
    def __init__(
        self,
        folder_root: str | Path,
        time_variable_name: str | None = None,
        latitude_variable_name: str | None = None,
        longitude_variable_name: str | None = None,
        level_variable_name: str | None = None,
        variable_of_interest_name: str | None = None,
        years: list[str] | None = None,
    ) -> None:
        super().__init__(
            folder_root=folder_root,
            time_variable_name=time_variable_name,
            latitude_variable_name=latitude_variable_name,
            longitude_variable_name=longitude_variable_name,
            level_variable_name=level_variable_name,
            variable_of_interest_name=variable_of_interest_name,
        )
        self.years = years

        # Find all the important required feature names
        self._find_features()
        return

    def _set_metadata_levels_from_netcdf(self, nc: Dataset):
        """
        For this class, we're overriding the levels
        """
        return

    def _hardcode_year_as_level(self) -> None:
        files = sorted(self.folder_path.rglob("*.nc"))
        if not files:
            raise SystemExit(f"No .nc files found under {self.folder_path}")

        with Dataset(files[0], "r") as nc:
            # Hard code the year as the "level"
            levels: dict[Any, Any] = {}
            if (
                self.level_variable_name is not None
                and self.years is not None
                and self.level_variable_name == "year"
            ):
                for value in list(self.years):
                    levels[value] = value
                self.levels = levels
            elif self.level_variable_name is not None:
                raw_levels = nc.variables[self.level_variable_name][:]
                for idx, value in enumerate(list(raw_levels)):
                    levels[idx] = str(value)
                self.levels = levels
        return

    def _find_features(self):
        # Call the base class to find the basic features
        super()._find_features()

        # Hardcode the year as the level
        self._hardcode_year_as_level()
        return

    def _generate_postgres_tables(self, conn):
        # First call the base class to create tables there
        super()._generate_postgres_tables(conn)

        # The gridbox table is going to be changed since it needs a
        # different timestamp_val compared to the default
        with conn.cursor() as cur:
            cur.execute("DROP TABLE IF EXISTS timestamp_dim")
            create_gridbox_table_sql = """
                CREATE TABLE timestamp_dim (
                    timestamp_id   INTEGER NOT NULL,
                    timestamp_val  CHAR(4) NOT NULL,
                    PRIMARY KEY (timestamp_id),
                    UNIQUE (timestamp_val)
                );
            """
            cur.execute(create_gridbox_table_sql)
            conn.commit()

        return

    def _create_sql_functions(self, conn):
        with conn.cursor() as cur:
            ###############################
            # get_dates_internal()
            ###############################
            # For internal use only (the front-end shouldn't use this)
            # This is a helper function to get valid only dates from the dataset
            cur.execute("DROP FUNCTION IF EXISTS get_dates_internal();")
            get_dates_internal_sql = """
                CREATE FUNCTION get_dates_internal()
                RETURNS TABLE (
                    date_id         INT
                    , timestamp_id  INT
                    , date_val      DATE
                    , year          CHAR(4)
                    , month_day     CHAR(4)
                )
                LANGUAGE sql
                AS $$
                    -- Create all of the dates from the year and month_day pairs
                    -- Also grab all the data for gridbox = 1 (so we can then remove dates that
                    -- do not have values later
                    WITH SubTable AS (
                      SELECT
                            td.timestamp_id
                            , MAKE_DATE(
                              l.name::INTEGER  -- year
                              , SUBSTRING(td.timestamp_val, 1, 2)::INTEGER  -- month
                              , SUBSTRING(td.timestamp_val, 3, 2)::INTEGER  -- day
                            ) AS date_val
                            , l.name AS year
                            , td.timestamp_val AS month_day
                            , (to_jsonb(gd) ->> ('value_' || l.name))::double precision AS value
                        FROM level l
                        CROSS JOIN timestamp_dim td
                        JOIN grid_data gd ON
                            td.timestamp_id = gd.timestamp_id
                            AND gd.gridbox_id = 1
                        WHERE
                          -- Don't include invalid (non-leap year) dates
                          SUBSTRING(td.timestamp_val, 3, 2)::INTEGER -- day
                          <=
                          EXTRACT(
                            DAY FROM (
                              DATE_TRUNC(
                                'month'
                                , MAKE_DATE(
                                  l.name::INTEGER  -- year
                                  , SUBSTRING(td.timestamp_val, 1, 2)::INTEGER -- month
                                  , 1  -- day
                                )
                              ) + INTERVAL '1 month - 1 day'
                            )
                          )
                        ORDER BY l.Level_ID ASC, td.timestamp_val ASC
                    )
                    -- Remove rows (newer dates) that don't have data
                    SELECT
                        ROW_NUMBER() OVER (ORDER BY date_val ASC) AS date_id
                        , timestamp_id
                        , date_val
                        , "year"
                        , month_day
                    FROM SubTable
                    WHERE value IS NOT NULL
                    ORDER BY date_val ASC
                $$;
            """
            cur.execute(get_dates_internal_sql)

            ###############################
            # get_dates()
            ###############################
            # Function used by the front-end to get list of all valid dates
            cur.execute("DROP FUNCTION IF EXISTS get_dates();")
            get_dates_sql = """
                CREATE FUNCTION get_dates()
                RETURNS TABLE (
                    date_id     INT
                    , date_val  DATE
                )
                LANGUAGE sql
                AS $$
                    SELECT date_id, date_val FROM get_dates_internal()
                $$;
            """
            cur.execute(get_dates_sql)

            ###############################
            # get_levels()
            ###############################
            # Function used by the front-end to get list of all valid dates
            # Hard-coding this as a single level
            cur.execute("DROP FUNCTION IF EXISTS get_levels();")
            get_levels_sql = f"""
                CREATE FUNCTION get_levels()
                RETURNS TABLE (
                    level_id  INT
                    , name    VARCHAR(255)
                )
                LANGUAGE sql
                AS $$
                    SELECT
                        1 AS level_id
                        , '{self.variable_of_interest_name}' AS "name"
                $$;
            """
            cur.execute(get_levels_sql)

            ###############################
            # get_gridboxes()
            ###############################
            # Function used by the front-end to get all the valid gridboxes and locations
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
                    , in_level_id INTEGER  -- Throw away value (we don't need it)
                );
            """)
            get_gridbox_data_sql = """
                CREATE FUNCTION get_gridbox_data(
                    in_date_id    INTEGER
                    , in_level_id INTEGER  -- Throw away value (we don't need it)
                )
                RETURNS TABLE (
                    gridbox_id    INT
                    , lat         DOUBLE PRECISION
                    , lon         DOUBLE PRECISION
                    , value       DOUBLE PRECISION
                )
                LANGUAGE sql
                AS $$
                    WITH SubTable AS (
                        SELECT
                            timestamp_id
                            , "year"
                        FROM get_dates_internal() d
                        WHERE d.date_id = in_date_id
                    )
                    SELECT
                            gd.gridbox_id
                            , lat.lat
                            , lon.lon
                            , (to_jsonb(gd) ->> ('value_' || s.year))::double precision AS value
                        FROM SubTable s
                        JOIN grid_data gd ON
                            s.timestamp_id = gd.timestamp_id
                        JOIN gridbox gb ON
                            gd.gridbox_id = gb.gridbox_id
                        JOIN lat ON lat.lat_id = gb.lat_id
                        JOIN lon ON lon.lon_id = gb.lon_id
                        ORDER BY gd.gridbox_id
                $$;
            """
            cur.execute(get_gridbox_data_sql)

            ###############################
            # get_timeseries()
            ###############################
            # Function used by the front-end to get all the timeseries elements for a given gridbox
            # - p_gridbox_id: id of the gridbox that data is requested for
            # - p_level_id: Isn't needed for the input, but is there to stay consistent
            #               with other databases that do have it.
            cur.execute("""
                DROP FUNCTION IF EXISTS get_timeseries(
                    in_gridbox_id INTEGER
                    , in_level_id INTEGER  -- Throw away value (we don't need it)
                );
            """)
            sql_get_timeseries_sql = """
                CREATE FUNCTION get_timeseries(
                    in_gridbox_id INTEGER
                    , in_level_id INTEGER  -- Throw away value (we don't need it)
                )
                RETURNS TABLE (
                    date_val     DATE
                    , level_id   INT
                    , value      DOUBLE PRECISION
                )
                LANGUAGE sql
                AS $$
                    SELECT
                        d.date_val
                        , 1 AS level_id
                        -- Convert the row to a json to grab the column name dynamically
                        , (to_jsonb(gd) ->> ('value_' || d.year))::double precision AS value
                    FROM get_dates_internal() AS d
                    JOIN grid_data gd ON
                        d.timestamp_id = gd.timestamp_id
                    WHERE gd.gridbox_id = in_gridbox_id
                $$;
            """
            cur.execute(sql_get_timeseries_sql)

            conn.commit()
        return

    @benchmark
    def _populate_postgres_data_tables(self, conn):
        months = [str(i).zfill(2) for i in range(1, 13)]
        days = [str(i).zfill(2) for i in range(1, 32)]

        with conn.cursor() as cur:
            # For speed increase
            cur.execute("SET synchronous_commit TO OFF;")

            time_idx = 0
            total_days = len(months) * len(days)
            for month, day in tqdm(itertools.product(months, days), total=total_days):
                month_day_str = f"{month}{day}"

                data_slices = []
                for file_idx, year in enumerate(self.years):
                    yearly_files = sorted(
                        self.folder_path.rglob(f"*{year}*{month_day_str}.nc")
                    )

                    if len(yearly_files) > 1:
                        raise Exception("Too many files for year")
                    elif len(yearly_files) == 0:
                        # Generate empty data
                        data = numpy.full(
                            (len(self.latitudes), len(self.longitudes)), numpy.nan
                        )
                        data_slices.append(data)
                        continue
                    elif len(yearly_files) == 1:
                        file = yearly_files[0]

                        # filename_path = str(file)
                        with Dataset(file, "r") as nc:
                            # Get all dates in the current file (there can be more than 1)
                            time_variable = nc.variables[self.time_variable_name]

                            times_dt = num2date(
                                times=time_variable[:],
                                units=time_variable.units,
                                calendar=getattr(time_variable, "calendar", "standard"),
                            )
                            # it's possible there are multiple dates per file. If there are
                            # get the idx so we know which index to grab from the file.

                            variable = nc[self.variable_of_interest_name]

                            full_dims = ["year"] + list(variable.dimensions)
                            spatial_dims = [
                                d for d in full_dims if d != self.time_variable_name
                            ]

                            fill_value = None
                            if hasattr(variable, "_FillValue"):
                                fill_value = float(variable._FillValue)
                            elif hasattr(variable, "missing_value"):
                                fill_value = float(variable.missing_value)

                            for idx, time_dt in enumerate(times_dt):
                                dt = f"{month}{day}"

                                # Insert the datetime into the datetime_dim table
                                timestamp_rows = [(time_idx, dt)]
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

                                data_slices.append(data)

                # Some dates (ie: Feb 30th) don't exist in the dataset
                if len(data_slices) == 0:
                    continue

                # Stack into (n_years_for_this_md, n_lat, n_lon)
                data_year_lat_lon = numpy.stack(data_slices, axis=0)

                self._process_multi_level_gridbox_data(
                    data=data_year_lat_lon,
                    dim_names=spatial_dims,
                    fill_value=fill_value,
                    time_id=time_idx,
                    cur=cur,
                )

                time_idx += 1
        return


def main():
    if True:
        data_path = (
            "/home/mrsharky/dev/sdsu/ICharm.AI-Project/backend/datasets/cmorph/daily"
        )
        dataset_name = "cmorph_daily_by_year"
        variable_of_interest_name = "cmorph"
    else:
        data_path = "/datasets/ncep"
        dataset_name = "ncep"
        variable_of_interest_name = "air"

    database_username = os.getenv("POSTGRES_USERNAME", "icharm_user")
    database_password = os.getenv("POSTGRES_PASSWORD")
    database_hostname = os.getenv("POSTGRES_HOSTNAME", "localhost")

    if database_password is None:
        raise ValueError("POSTGRES_PASSWORD environment variable not set")

    netcdf_to_db = NetCDFtoDbYearlyFiles(
        folder_root=data_path,
        variable_of_interest_name=variable_of_interest_name,
        years=[str(i) for i in range(1998, 2026)],
        level_variable_name="year",
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
