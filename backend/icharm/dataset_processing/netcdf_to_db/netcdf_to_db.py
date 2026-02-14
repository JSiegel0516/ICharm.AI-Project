# !/usr/bin/env python3
"""
Program for parsing NetCDF files into a database
"""

import argparse
import os

from icharm.dataset_processing.netcdf_to_db.netcdf_to_db_by_year import (
    NetCDFtoDbYearlyFiles,
)
from icharm.dataset_processing.netcdf_to_db.netcdf_to_db_simple import NetCDFtoDbSimple


def main(argv=None):
    # ------------------------
    # Parent parser (shared args)
    # ------------------------
    common = argparse.ArgumentParser(add_help=False)

    # DB Connection related
    common.add_argument("--db_host", default="localhost")
    common.add_argument("--db_port", type=int, default=5432)
    common.add_argument("--db_name", required=True)
    common.add_argument("--db_user", required=True)
    common.add_argument("--db_password", required=True)

    # NetCDF Related
    common.add_argument("-f", "--folder_root", required=True)
    common.add_argument("-t", "--time_variable_name", required=False, default=None)
    common.add_argument(
        "-lat", "--latitude_variable_name", required=False, default=None
    )
    common.add_argument(
        "-lon", "--longitude_variable_name", required=False, default=None
    )
    common.add_argument(
        "-i", "--variable_of_interest_name", required=False, default=None
    )

    parser = argparse.ArgumentParser(description=__doc__)

    subparsers = parser.add_subparsers(dest="command", required=True)

    # ------------------------
    # simple mode
    # ------------------------
    simple = subparsers.add_parser(
        name="simple",
        parents=[common],
        help="Run simple processing mode",
    )
    simple.add_argument("-lev", "--level_variable_name", required=False, default=None)

    # ------------------------
    # group_by_year mode
    # ------------------------
    group_by_year = subparsers.add_parser(
        name="group_by_year", help="Group data by year"
    )
    group_by_year.add_argument(
        "-min_y", "--year_min", type=int, required=True, default=None
    )
    group_by_year.add_argument(
        "-max_y", "--year_max", type=int, required=True, default=None
    )

    args = parser.parse_args(argv)

    # Dispatch based on subcommand
    if args.command == "simple":
        netcdf_to_db = NetCDFtoDbSimple(
            folder_root=args.folder_root,
            time_variable_name=args.time_variable_name,
            latitude_variable_name=args.latitude_variable_name,
            longitude_variable_name=args.longitude_variable_name,
            level_variable_name=args.level_variable_name,
            variable_of_interest_name=args.variable_of_interest_name,
        )
    elif args.command == "group_by_year":
        min_year = args.year_min
        max_year = args.year_max
        netcdf_to_db = NetCDFtoDbYearlyFiles(
            folder_root=args.folder_root,
            time_variable_name=args.time_variable_name,
            latitude_variable_name=args.latitude_variable_name,
            longitude_variable_name=args.longitude_variable_name,
            variable_of_interest_name=args.variable_of_interest_name,
            years=[str(i) for i in range(min_year, max_year)],
            level_variable_name="year",
        )
    else:
        raise ValueError(f"Unknown command: {args.command}")

    # netcdf_to_db.export_data_to_csv("/home/mrsharky/dev/sdsu/ICharm.AI-Project/backend/datasets/cmorph/daily/")
    netcdf_to_db.export_data_to_postgres(
        database_name=args.db_name,
        user=args.db_user,
        password=args.db_password,
        host=args.db_host,
        port=args.db_port,
    )

    return


if __name__ == "__main__":
    """
    This main is for debugging inside of the code editor
    """
    data_path = "/home/mrsharky/dev/sdsu/ICharm.AI-Project/backend/datasets/ncep"
    dataset_name = "ncep"
    variable_of_interest_name = "air"

    database_username = os.getenv("POSTGRES_USERNAME", "icharm_user")
    database_password = os.getenv("POSTGRES_PASSWORD")
    database_hostname = os.getenv("POSTGRES_HOSTNAME", "localhost")

    main(
        [
            "simple",
            "--db_name",
            dataset_name,
            "--db_user",
            database_username,
            "--db_password",
            database_password,
            "--folder_root",
            data_path,
            "--time_variable_name",
            "time",
            "--variable_of_interest_name",
            variable_of_interest_name,
        ]
    )
