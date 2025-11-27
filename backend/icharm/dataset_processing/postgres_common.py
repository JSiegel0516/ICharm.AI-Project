import psycopg2


class PostgresCommon:
    @staticmethod
    def create_connection(
        user: str,
        password: str,
        database_name: str = "postgres",
        host="localhost",
        port=5432,
    ):
        conn = psycopg2.connect(
            dbname=database_name,
            user=user,
            password=password,
            host=host,
            port=port,
        )
        conn.autocommit = True  # MUST be enabled for CREATE DATABASE
        return conn

    @staticmethod
    def create_database(
        database_name: str,
        user: str,
        password: str,
        host="localhost",
        port=5432,
    ):
        # Connect to existing DB
        conn = psycopg2.connect(
            dbname="postgres",
            user=user,
            password=password,
            host=host,
            port=port,
        )
        conn.autocommit = True  # MUST be enabled for CREATE DATABASE
        cur = conn.cursor()

        # Create the database
        try:
            cur.execute(f"CREATE DATABASE {database_name};")
            print(f"Database '{database_name}' created successfully!")
        except psycopg2.errors.DuplicateDatabase:
            print(f"Database '{database_name}' already exists — skipping.")
        finally:
            cur.close()
            conn.close()

        return
