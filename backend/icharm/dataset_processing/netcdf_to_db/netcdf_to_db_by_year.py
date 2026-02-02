from icharm.dataset_processing.netcdf_to_db.infer_cadence import (
    infer_cadence,
    GroupFilesByCadence,
)

import numpy
import os

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
                    timestamp_val  CHAR(14) NOT NULL,
                    PRIMARY KEY (timestamp_id),
                    UNIQUE (timestamp_val)
                );
            """
            cur.execute(create_gridbox_table_sql)
            conn.commit()

        return

    def _create_sql_functions(self, conn):
        self.logger.info("Creating SQL functions")
        with conn.cursor() as cur:
            ###############################
            # get_timestamps_internal()
            ###############################
            # For internal use only (the front-end shouldn't use this)
            # This is a helper function to get valid only dates from the dataset
            cur.execute("DROP FUNCTION IF EXISTS get_timestamps_internal();")
            get_timestamps_internal_sql = """
                CREATE FUNCTION get_timestamps_internal()
                RETURNS TABLE (
                    usable_timestamp_id INT
                    , timestamp_id      INT
                    , timestamp_val     TIMESTAMP
                    , year              CHAR(4)
                    , month_day_time    CHAR(4)
                )
                LANGUAGE sql
                AS $$
                    -- Create all of the dates from the year and month_day pairs
                    -- Also grab all the data for gridbox = 1 (so we can then remove dates that
                    -- do not have values later
                    WITH SubTable AS (
                        SELECT
                                td.timestamp_id
                                , TO_TIMESTAMP(
                                    l.name || '-' || td.timestamp_val
                                    , 'YYYY-MM-DD"T"HH24:MI:SS'
                                ) AS timestamp_value
                                , l.name AS year
                                , td.timestamp_val AS month_day_time
                            FROM level l
                            CROSS JOIN timestamp_dim td
                            WHERE
                                SUBSTRING(td.timestamp_val, 4, 2)::INTEGER <= EXTRACT(
                                    DAY FROM (
                                        DATE_TRUNC(
                                            'month'
                                            , MAKE_DATE(
                                                l.name::INTEGER
                                                , SUBSTRING(td.timestamp_val, 1, 2)::INTEGER
                                                , 1
                                            )
                                        ) + INTERVAL '1 month - 1 day'
                                    )
                                )
                    )
                    SELECT
                            ROW_NUMBER() OVER (ORDER BY timestamp_value ASC) AS usable_timestamp_id
                            , timestamp_id
                            , timestamp_value
                            , "year"
                            , month_day_time
                        FROM SubTable
                        ORDER BY timestamp_value ASC
                $$;
            """
            cur.execute(get_timestamps_internal_sql)

            ###############################
            # get_timestamps()
            ###############################
            # Function used by the front-end to get list of all valid timestamps
            cur.execute("DROP FUNCTION IF EXISTS get_timestamps();")
            get_dates_sql = """
                CREATE FUNCTION get_timestamps()
                RETURNS TABLE (
                    timestamp_id       INT
                    , timestamp_value  TIMESTAMP
                )
                LANGUAGE sql
                AS $$
                    SELECT usable_timestamp_id, timestamp_val FROM get_timestamps_internal()
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
            # Function used by the front-end to get all the gridboxes at a timestamp_id
            cur.execute("""
                DROP FUNCTION IF EXISTS get_gridbox_data(
                    in_timestamp_id INTEGER
                    , in_level_id INTEGER  -- Throw away value (we don't need it)
                );
            """)
            get_gridbox_data_sql = """
                CREATE OR REPLACE FUNCTION get_gridbox_data(
                    in_timestamp_id INTEGER
                    , in_level_id   INTEGER
                )
                RETURNS TABLE (
                    gridbox_id INT
                    , lat        DOUBLE PRECISION
                    , lon        DOUBLE PRECISION
                    , value      DOUBLE PRECISION
                )
                LANGUAGE plpgsql
                AS $$
                DECLARE
                    yr TEXT;
                    colname TEXT;
                BEGIN
                    SELECT d.year INTO yr
                    FROM get_timestamps_internal() d
                    WHERE d.usable_timestamp_id = in_timestamp_id
                    LIMIT 1;

                    -- This is how we get the correct column name
                    -- and avoid doing the slow "to_jsonb()" method
                    colname := 'value_' || yr;

                    RETURN QUERY EXECUTE format($q$
                        WITH s AS (
                            SELECT timestamp_id
                            FROM get_timestamps_internal() d
                            WHERE d.usable_timestamp_id = $1
                        )
                        SELECT
                            gd.gridbox_id
                            , lat.lat::double precision AS lat
                            , lon.lon::double precision AS lon
                            , gd.%I::double precision AS value
                        FROM s
                        JOIN grid_data gd ON s.timestamp_id = gd.timestamp_id
                        JOIN gridbox gb ON gd.gridbox_id = gb.gridbox_id
                        JOIN lat ON lat.lat_id = gb.lat_id
                        JOIN lon ON lon.lon_id = gb.lon_id
                        ORDER BY gd.gridbox_id
                    $q$, colname)
                    USING in_timestamp_id;
                END;
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
                CREATE OR REPLACE FUNCTION get_timeseries(
                    in_gridbox_id INTEGER
                    , in_level_id INTEGER  -- unused
                )
                RETURNS TABLE (
                    timestamp_id       INT
                    , timestamp_value  TIMESTAMP
                    , level_id         INT
                    , value            DOUBLE PRECISION
                )
                LANGUAGE plpgsql
                AS $$
                DECLARE
                    yr TEXT;
                    colname TEXT;
                    lvl_id INT;
                BEGIN
                    FOR yr, lvl_id IN
                        SELECT DISTINCT
                            "year"
                            , 1 AS level_id
                        FROM get_timestamps_internal() d
                        ORDER BY "year"
                    LOOP
                        colname := 'value_' || yr;

                        RETURN QUERY EXECUTE format($q$
                            SELECT
                                d.usable_timestamp_id AS timestamp_id
                                , d.timestamp_val
                                , %s::int AS level_id
                                , gd.%I::double precision AS value
                            FROM get_timestamps_internal() d
                            JOIN grid_data gd
                              ON d.timestamp_id = gd.timestamp_id
                            WHERE gd.gridbox_id = $1
                              AND d.year = %L
                            ORDER BY d.timestamp_val
                        $q$, lvl_id, colname, yr)
                        USING in_gridbox_id;
                    END LOOP;
                END;
                $$;
            """
            cur.execute(sql_get_timeseries_sql)
            conn.commit()
        return

    @benchmark
    def _populate_postgres_data_tables(self, conn):
        self.logger.info("Populating postgres data tables")
        with conn.cursor() as cur:
            # For speed increase
            cur.execute("SET synchronous_commit TO OFF;")

            # Go through all the files and get all the distinct month+day+extras
            self.logger.info("Scanning all files to determine all months + days")
            files = sorted(self.folder_path.rglob("*.nc"))
            all_timestamps = set()
            for file_idx, file in enumerate(tqdm(files)):
                # filename_path = str(file)
                with Dataset(file, "r") as nc:
                    # Get all dates in the current file (there can be more than 1)
                    time_variable = nc.variables[self.time_variable_name]
                    times_dt = num2date(
                        times=time_variable[:],
                        units=time_variable.units,
                        calendar=getattr(time_variable, "calendar", "standard"),
                    )
                    for idx, time_dt in enumerate(times_dt):
                        iso_formatted_time = time_dt.isoformat()
                        # Remove the year
                        iso_formatted_time = iso_formatted_time[5:]
                        all_timestamps.add(iso_formatted_time)

            self.logger.info(f"Unique dates discovered: {len(all_timestamps)}")
            all_dates = {t: idx for idx, t in enumerate(sorted(all_timestamps))}

            timestamp_rows = [(idx, timestamp) for timestamp, idx in all_dates.items()]
            cur.executemany(
                """
                INSERT INTO timestamp_dim (timestamp_id, timestamp_val)
                VALUES (%s, %s) ON CONFLICT (timestamp_id) DO NOTHING
                """,
                timestamp_rows,
            )

            # Infer cadence
            self.logger.info("Inferring file cadence")
            cadence = infer_cadence(files)

            if cadence.cadence == "single_file":
                self.process_year()
            if cadence.cadence == "year":
                self.logger.info("Yearly cadence discovered")
                self.process_year(cur, all_dates)
            elif cadence.cadence == "year_month":
                self.logger.info("Year + Monthly cadence discovered")
                self.process_year_month(cur, all_dates)
            elif cadence.cadence == "year_month_day":
                self.logger.info("Year + Month + Daily cadence discovered")
                self.process_year_month_day(cur, all_dates)
            else:
                raise ValueError(f"Unknown cadence: {cadence.cadence}")
        return

    def process_year(self, cur, all_dates):
        yearly_files = sorted(self.folder_path.rglob("*.nc"))
        total_files = len(yearly_files)

        self.logger.info(f"Processing NetCDF Files with Year files: {total_files}")

        for db_time_value, db_time_index in tqdm(all_dates.items()):
            data_slices = []
            for file_idx, yearly_file in enumerate(tqdm(yearly_files)):
                fill_value = None
                with Dataset(yearly_file, "r") as nc:
                    # Get all dates in the current file (there can be more than 1)
                    time_variable = nc.variables[self.time_variable_name]

                    # Get the specific date we want to process
                    times_dt = num2date(
                        times=time_variable[:],
                        units=time_variable.units,
                        calendar=getattr(time_variable, "calendar", "standard"),
                    )
                    found_timestamp = False
                    for time_idx, time_dt in enumerate(times_dt):
                        iso_formatted_time = time_dt.isoformat()
                        # Remove the year
                        iso_formatted_time = iso_formatted_time[5:]
                        if iso_formatted_time == db_time_value:
                            found_timestamp = True
                            break

                    if found_timestamp:
                        # Get the specific variables at given date
                        data = nc[self.variable_of_interest_name][time_idx]

                        full_dims = ["year"] + list(
                            nc[self.variable_of_interest_name].dimensions
                        )
                        spatial_dims = [
                            d for d in full_dims if d != self.time_variable_name
                        ]

                        if hasattr(data, "_FillValue"):
                            fill_value = float(data._FillValue)
                        elif hasattr(data, "missing_value"):
                            fill_value = float(data.missing_value)
                    else:
                        data = numpy.full(
                            (len(self.latitudes), len(self.longitudes)), numpy.nan
                        )
                    data_slices.append(data)

            # Stack into (n_years_for_this_md, n_lat, n_lon)
            data_year_lat_lon = numpy.stack(data_slices, axis=0)

            self._process_multi_level_gridbox_data(
                data=data_year_lat_lon,
                dim_names=spatial_dims,
                fill_value=fill_value,
                time_id=db_time_index,
                cur=cur,
            )
        return

    def process_year_month(self, cur, all_dates):
        raise NotImplementedError("Haven't implemented this yet")

    def process_year_month_day(self, cur, all_dates):
        # Get all the files to process
        files = sorted(self.folder_path.rglob("*.nc"))
        file_groupings = GroupFilesByCadence.group_files_by_month_day_with_year(files)

        self.logger.info("Processing NetCDF Files with Year, Month, Day files")

        with tqdm(
            sorted(file_groupings.keys()), desc="Processing MMDD"
        ) as progress_bar:
            for month_day_str in progress_bar:
                progress_bar.set_postfix(mmdd=month_day_str)

                data_slices = []
                for file_idx, year in enumerate(self.years):
                    # Grab the file for this year + month_day combination
                    file = file_groupings[month_day_str].get(year)

                    # Handle no file exists (ie: Feb 29)
                    if not file:
                        self.logger.info(f"Skipping {year}{month_day_str} (YYYYMMDD)")
                        data = numpy.full(
                            (len(self.latitudes), len(self.longitudes)), numpy.nan
                        )
                        data_slices.append(data)
                    else:
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

                            if len(times_dt) > 1:
                                raise Exception(
                                    "Cannot process a year_month_day file with multiple time stamps yet!!!"
                                )

                            for idx, time_dt in enumerate(times_dt):
                                iso_formatted_time = time_dt.isoformat()
                                # Remove the year
                                iso_formatted_time = iso_formatted_time[5:]

                                db_time_index = all_dates[iso_formatted_time]

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
                    time_id=db_time_index,
                    cur=cur,
                )
        return


def main():
    if True:
        data_path = "/var/www/html/icharm/backend/datasets/cmorph/daily"
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
        years=[str(i) for i in range(1996, 2026)],
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
