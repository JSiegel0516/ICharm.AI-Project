import io
import os
import pandas
import itertools

from pathlib import Path

from datetime import datetime
from netCDF4 import Dataset
from typing import Any

from icharm.dataset_processing.postgres_common import PostgresCommon

TIME_VAR_CANDIDATES = ["time"]
LAT_VAR_CANDIDATES = ["lat", "latitude"]
LON_VAR_CANDIDATES = ["lon", "longitude"]
LEVEL_VAR_CANDIDATES = ["level", "depth"]


class NetCDFtoDbBase:
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
        self.level_variable_name = level_variable_name
        self.variable_of_interest_name = variable_of_interest_name
        return

    def _guess_variable_name(
        self, nc: Dataset, candidates: list[str], raise_error: bool = True
    ) -> str | None:
        var_names = set(nc.variables.keys())
        for c in candidates:
            if c in var_names:
                return c
        if raise_error:
            raise RuntimeError(f"Could not find any of {candidates} in {var_names}")
        return None

    def _set_metadata_levels_from_netcdf(self, nc: Dataset):
        if self.level_variable_name is not None:
            levels = {}
            raw_levels = nc.variables[self.level_variable_name][:]
            for idx, value in enumerate(list(raw_levels)):
                levels[idx] = str(value)
            self.levels = levels

    def _get_metadata_from_file(self, example_path: Path):
        with Dataset(example_path, "r") as nc:
            # Required base variables
            if self.time_variable_name is None:
                self.time_variable_name = self._guess_variable_name(
                    nc, TIME_VAR_CANDIDATES
                )
            if self.latitude_variable_name is None:
                self.latitude_variable_name = self._guess_variable_name(
                    nc, LAT_VAR_CANDIDATES
                )
            if self.longitude_variable_name is None:
                self.longitude_variable_name = self._guess_variable_name(
                    nc, LON_VAR_CANDIDATES
                )

            # Level is optional (not all datasets are multi-level)
            if self.level_variable_name is None:
                self.level_variable_name = self._guess_variable_name(
                    nc, LEVEL_VAR_CANDIDATES, False
                )

            # If we don't know the variable of interest (it's a bit harder to get
            if self.variable_of_interest_name is None:
                potential_variables = list(nc.variables.keys())
                potential_variables.remove(self.time_variable_name)
                potential_variables.remove(self.latitude_variable_name)
                potential_variables.remove(self.longitude_variable_name)
                if self.level_variable_name is not None:
                    potential_variables.remove(self.level_variable_name)

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
                longitudes[idx] = float(value)
            self.longitudes = longitudes

            raw_latitudes = nc.variables[self.latitude_variable_name][:]
            latitudes = {}
            for idx, value in enumerate(list(raw_latitudes)):
                latitudes[idx] = float(value)
            self.latitudes = latitudes

            self._set_metadata_levels_from_netcdf(nc)

            # Then create grid box ids based off of this
            gridboxes: dict[int, tuple[int, int]] = {}
            for gridbox_id, (lat_idx, lon_idx) in enumerate(
                itertools.product(latitudes.keys(), longitudes.keys())
            ):
                gridboxes[gridbox_id] = (lat_idx, lon_idx)
            self.gridboxes = gridboxes
            self.gridbox_ids = list(self.gridboxes.keys())

            # Create a lookup of which features are where
            variable = nc[self.variable_of_interest_name]

            all_variables = [
                self.latitude_variable_name,
                self.longitude_variable_name,
                self.time_variable_name,
            ]
            if self.level_variable_name is not None:
                all_variables.append(self.level_variable_name)

            all_variable_locations = {}
            for idx, variable_name in enumerate(variable.dimensions):
                if variable_name in all_variables:
                    all_variable_locations[variable_name] = idx
                else:
                    raise Exception(
                        f"Variable {variable_name} not found in {all_variables}"
                    )
            self.all_variable_locations = all_variable_locations
        return

    def _find_features(self):
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
        print(f"  level:    {self.level_variable_name}")
        print(f"  interest: {self.variable_of_interest_name}")

        return

    def _generate_postgres_tables(self, conn):
        with conn.cursor() as cur:
            # Latitude table creation
            cur.execute("DROP TABLE IF EXISTS lat")
            create_lat_table_sql = """
                CREATE TABLE lat (
                    lat_id   SMALLINT         NOT NULL,
                    lat      REAL NOT NULL,
                    PRIMARY KEY (lat_id),
                    UNIQUE (lat)
                );
            """
            cur.execute(create_lat_table_sql)

            # Longitude table creation
            cur.execute("DROP TABLE IF EXISTS lon")
            create_lon_table_sql = """
                CREATE TABLE lon (
                    lon_id   SMALLINT         NOT NULL,
                    lon      REAL NOT NULL,
                    PRIMARY KEY (lon_id),
                    UNIQUE (lon)
                );
            """
            cur.execute(create_lon_table_sql)

            # Gridbox table creation
            cur.execute("DROP TABLE IF EXISTS gridbox")
            create_gridbox_table_sql = """
                CREATE TABLE gridbox (
                    gridbox_id INTEGER        NOT NULL,
                    lat_id   SMALLINT         NOT NULL,
                    lon_id   SMALLINT         NOT NULL,
                    PRIMARY KEY (gridbox_id),
                    UNIQUE (lat_id, lon_id)
                );
            """
            cur.execute(create_gridbox_table_sql)

            # timestamp table creation
            cur.execute("DROP TABLE IF EXISTS timestamp_dim")
            create_gridbox_table_sql = """
                CREATE TABLE timestamp_dim (
                    timestamp_id   INTEGER NOT NULL,
                    timestamp_val  TIMESTAMP WITHOUT TIME ZONE NOT NULL UNIQUE,
                    PRIMARY KEY (timestamp_id),
                    UNIQUE (timestamp_val)
                );
            """
            cur.execute(create_gridbox_table_sql)

            # Levels (if applicable)
            if len(self.levels.keys()) > 0:
                cur.execute("DROP TABLE IF EXISTS level")
                create_level_table_sql = """
                    CREATE TABLE level  (
                        level_id            SMALLINT NOT NULL,
                        name                VARCHAR(500) NOT NULL,
                        description			VARCHAR(2000) NULL,
                        PRIMARY KEY (level_id),
                        UNIQUE (name)
                    )
                """
                cur.execute(create_level_table_sql)

            # Generate grid_data table
            cur.execute("DROP TABLE IF EXISTS grid_data")
            if len(self.levels.keys()) == 0:
                create_grid_data_table_sql = """
                    -- Table is unlogged for now, will add log back in later
                    CREATE UNLOGGED TABLE grid_data (
                        gridbox_id		   INTEGER NOT NULL,
                        timestamp_id       INTEGER NOT NULL,
                        value_0            REAL
                        -- We will add keys back in after insertion is done
                        --PRIMARY KEY (gridbox_id, timestamp_id)
                    );
                    -- We will add the indexes later (after insertion is completed)
                    --CREATE INDEX IF NOT EXISTS grid_data_gridbox_idx ON grid_data (gridbox_id);
                    --CREATE INDEX IF NOT EXISTS grid_data_ts_idx      ON grid_data (timestamp_id);
                    """
            else:
                values = [
                    f"""
                        value_{i}          REAL"""
                    for i in list(self.levels.keys())
                ]
                values_str = ",\n".join(values)
                create_grid_data_table_sql = f"""
                    -- Table is unlogged for now, will add log back in later
                    CREATE UNLOGGED TABLE grid_data (
                        gridbox_id		   INTEGER NOT NULL,
                        timestamp_id       INTEGER NOT NULL,
                        {values_str}
                        -- We will add keys back in after insertion is done
                        --PRIMARY KEY (gridbox_id, timestamp_id)
                    );
                    -- We will add the indexes later (after insertion is completed)
                    --CREATE INDEX IF NOT EXISTS grid_data_gridbox_idx ON grid_data (gridbox_id);
                    --CREATE INDEX IF NOT EXISTS grid_data_ts_idx      ON grid_data (timestamp_id);
                    """

            cur.execute(create_grid_data_table_sql)
            conn.commit()
        return

    def _update_grid_box_table(self, conn) -> None:
        """
        Need to add logging back in and keys.
        Args:
            conn:

        Returns:

        """
        with conn.cursor() as cur:
            statements = [
                "ALTER TABLE grid_data ADD PRIMARY KEY (gridbox_id, timestamp_id);",
                "CREATE INDEX grid_data_gridbox_idx ON grid_data (gridbox_id);",
                "CREATE INDEX grid_data_ts_idx      ON grid_data (timestamp_id);",
                "ALTER TABLE grid_data SET LOGGED;",
            ]
            for statement in statements:
                print(statement)
                cur.execute(statement)
        return

    def _create_sql_functions(self, conn):
        raise NotImplementedError

    def _truncate_postgres_tables(self, conn):
        with conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE lat;")
            cur.execute("TRUNCATE TABLE lon;")
            cur.execute("TRUNCATE TABLE gridbox;")
            cur.execute("TRUNCATE TABLE timestamp_dim;")
            cur.execute("TRUNCATE TABLE grid_data;")
            if len(self.levels.keys()) > 0:
                cur.execute("TRUNCATE TABLE level;")
            conn.commit()
        return

    def _populate_postgres_common_tables(self, conn):
        """
        Notes:
            - Trying to do INSERT INTO statements is terribly slow
            - It's much faster to insert CSV data into the Postgres
            - So, we use streams to write the CSV data to and then insert it
        Args:
            conn:

        Returns:

        """
        with conn.cursor() as cur:
            # Insert latitudes
            with io.StringIO() as csv_buffer_latitudes:
                df_lat = pandas.DataFrame(
                    [{"lat_id": idx, "lat": val} for idx, val in self.latitudes.items()]
                )
                df_lat.to_csv(csv_buffer_latitudes, index=False)
                csv_buffer_latitudes.seek(0)
                cur.copy_expert(
                    "COPY lat (lat_id, lat) FROM STDIN WITH (FORMAT csv, HEADER true)",
                    csv_buffer_latitudes,
                )

            # Insert longitudes
            with io.StringIO() as csv_buffer_longitudes:
                df_lon = pandas.DataFrame(
                    [
                        {"lon_id": idx, "lon": val}
                        for idx, val in self.longitudes.items()
                    ]
                )
                df_lon.to_csv(csv_buffer_longitudes, index=False)
                csv_buffer_longitudes.seek(0)
                cur.copy_expert(
                    "COPY lon (lon_id, lon) FROM STDIN WITH (FORMAT csv, HEADER true)",
                    csv_buffer_longitudes,
                )

            # Insert gridboxes
            with io.StringIO() as csv_buffer_gridboxes:
                df_gridbox = pandas.DataFrame(
                    [
                        {"gridbox_id": grid_idx, "lat_id": lat_idx, "lon_id": lon_idx}
                        for grid_idx, (lat_idx, lon_idx) in self.gridboxes.items()
                    ]
                )
                df_gridbox.to_csv(csv_buffer_gridboxes, index=False)
                csv_buffer_gridboxes.seek(0)
                cur.copy_expert(
                    "COPY gridbox (gridbox_id, lat_id, lon_id) FROM STDIN WITH (FORMAT csv, HEADER true)",
                    csv_buffer_gridboxes,
                )

            if len(self.levels.keys()) > 0:
                with io.StringIO() as csv_buffer_levels:
                    df_level = pandas.DataFrame(
                        [
                            {"level_id": idx, "name": val}
                            for idx, val in self.levels.items()
                        ]
                    )
                    df_level.to_csv(csv_buffer_levels, index=False)
                    csv_buffer_levels.seek(0)
                    cur.copy_expert(
                        "COPY level (level_id, name) FROM STDIN WITH (FORMAT csv, HEADER true)",
                        csv_buffer_levels,
                    )

        return

    def _populate_postgres_data_tables(self, conn):
        raise NotImplementedError

    def _process_multi_level_gridbox_data(
        self, data, dim_names, fill_value, time_id, cur
    ):
        raise NotImplementedError

    def export_data_to_postgres(
        self,
        database_name: str,
        user: str,
        password: str,
        host="localhost",
        port=5432,
    ):
        # Create Database
        PostgresCommon.create_database(
            database_name=database_name,
            user=user,
            password=password,
            host=host,
            port=port,
        )

        # Create the connection
        conn = PostgresCommon.create_connection(
            database_name=database_name,
            user=user,
            password=password,
            host=host,
            port=port,
        )

        # Generate the required tables
        self._generate_postgres_tables(conn)

        # Truncate the required tables
        self._truncate_postgres_tables(conn)

        # Populate the non-data tables
        self._populate_postgres_common_tables(conn)

        # Populate the data tables
        self._populate_postgres_data_tables(conn)

        # Modify gridbox table to add indexes
        self._update_grid_box_table(conn)

        # Add the sql methods
        self._create_sql_functions(conn)

        return


def main():
    if True:
        data_path = (
            "/home/mrsharky/dev/sdsu/ICharm.AI-Project/backend/datasets/cmorph/daily"
        )
        dataset_name = "cmorph_daily"
        variable_of_interest_name = None
    else:
        data_path = "/datasets/ncep"
        dataset_name = "ncep"
        variable_of_interest_name = "air"

    database_username = os.getenv("POSTGRES_USERNAME", "icharm_user")
    database_password = os.getenv("POSTGRES_PASSWORD")
    database_hostname = os.getenv("POSTGRES_HOSTNAME", "localhost")

    if database_password is None:
        raise ValueError("POSTGRES_PASSWORD environment variable not set")

    netcdf_to_db = NetCDFtoDbBase(
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
