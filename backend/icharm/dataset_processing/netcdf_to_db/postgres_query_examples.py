import os
import random

from icharm.dataset_processing.postgres_common import PostgresCommon
from dotenv import load_dotenv

from icharm.utils.benchmark import benchmark

load_dotenv()


class PostgresQueryExamples:
    def __init__(
        self,
        database_name: str,
        database_user: str,
        database_password: str,
        database_host: str = "localhost",
        database_port: str = "5432",
    ):
        self.database_name = database_name
        self.database_user = database_user
        self.database_password = database_password
        self.database_host = database_host
        self.database_port = database_port

    def get_all_timestamps(self):
        with PostgresCommon.create_connection(
            database_name=self.database_name,
            user=self.database_user,
            password=self.database_password,
            host=self.database_host,
            port=self.database_port,
        ) as conn:
            with conn.cursor() as cur:
                get_dates_sql = """
                    SELECT * FROM get_dates()
                """
                cur.execute(get_dates_sql)
                data = cur.fetchall()
                return data

    def get_all_gridboxes(self):
        with PostgresCommon.create_connection(
            database_name=self.database_name,
            user=self.database_user,
            password=self.database_password,
            host=self.database_host,
            port=self.database_port,
        ) as conn:
            with conn.cursor() as cur:
                get_gridboxes_sql = """
                    SELECT * FROM get_gridboxes()
                """

                cur.execute(get_gridboxes_sql)
                data = cur.fetchall()
                return data

    @benchmark
    def get_all_gridboxes_at_date(self, timestamp_id: int, level_id: int):
        with PostgresCommon.create_connection(
            database_name=self.database_name,
            user=self.database_user,
            password=self.database_password,
            host=self.database_host,
            port=self.database_port,
        ) as conn:
            with conn.cursor() as cur:
                get_gridboxes_at_date_sql = """
                    SELECT * FROM get_gridbox_data(%(timestamp_id)s, %(level_id)s)
                    """
                cur.execute(
                    get_gridboxes_at_date_sql,
                    {
                        "timestamp_id": timestamp_id,
                        "level_id": level_id,
                    },
                )
                data = cur.fetchall()
                return data

    @benchmark
    def get_all_times_at_gridbox(self, gridbox_id: int, level_id: int):
        with PostgresCommon.create_connection(
            database_name=self.database_name,
            user=self.database_user,
            password=self.database_password,
            host=self.database_host,
            port=self.database_port,
        ) as conn:
            with conn.cursor() as cur:
                get_times_sql = """
                SELECT * FROM get_timeseries(%(gridbox_id)s, %(level_id)s)
                """
                cur.execute(
                    get_times_sql,
                    {
                        "gridbox_id": gridbox_id,
                        "level_id": level_id,
                    },
                )
                data = cur.fetchall()
                return data


def main():
    database_username = os.getenv("POSTGRES_USERNAME", "icharm_user")
    database_password = os.getenv("POSTGRES_PASSWORD")
    database_hostname = os.getenv("POSTGRES_HOSTNAME", "localhost")

    examples = PostgresQueryExamples(
        database_name="cmorph_daily_by_year",
        database_user=database_username,
        database_password=database_password,
        database_host=database_hostname,
    )

    # Get dates
    dates = examples.get_all_timestamps()
    random_date = random.choice(dates)
    date_id = random_date[0]

    # Get gridbox
    gridboxes = examples.get_all_gridboxes()
    random_gridbox = random.choice(gridboxes)
    gridbox_id = random_gridbox[0]

    # Get all_grids_at_date (can be a lot of data, so sometimes takes a few seconds)
    gridbox_data = examples.get_all_gridboxes_at_date(date_id, 1)
    print(len(gridbox_data))

    # Get all times for a gridbox (should be fast)
    timeseries_data = examples.get_all_times_at_gridbox(gridbox_id, 1)
    print(len(timeseries_data))
    return


if __name__ == "__main__":
    main()
