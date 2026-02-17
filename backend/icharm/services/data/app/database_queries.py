import os
from pathlib import Path
from datetime import datetime

import numpy
import pandas
import xarray as xr

from fastapi import HTTPException
from typing import List, Optional, Literal, Any
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool


import logging

from icharm.services.data.app.models import (
    DatasetRequest,
    Metadata,
    GridboxDataRequest,
    TimeseriesDataRequest,
)
from icharm.services.data.app.dataset_local import DatasetLocal
from icharm.services.data.app.dataset_cloud import DatasetCloud
from icharm.services.data.app.data_processing import DataProcessing

logger = logging.getLogger(__name__)

# ============================================================================
# DATABASE CONNECTION
# ============================================================================
ROOT_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = ROOT_DIR.parent.parent
env_path = ROOT_DIR / ".env.local"

# Database configuration
POSTRGRES_URL = os.getenv("POSTGRES_URL")
if not POSTRGRES_URL:
    raise ValueError(
        f"POSTRGRES_URL not found in environment variables. "
        f"Please create a .env file at {env_path} with POSTRGRES_URL=postgresql://..."
    )

# Create synchronous engine
engine = create_engine(POSTRGRES_URL, poolclass=NullPool)


class DatabaseQueries:
    _local_cloud_time_cache: dict[str, list[datetime]] = {}
    _local_cloud_level_cache: dict[str, list[float | str]] = {}
    _local_cloud_grid_cache: dict[str, dict[str, Any]] = {}

    ##############################
    # Helper methods
    ##############################
    @staticmethod
    def get_engine(database_name: str):
        base_url = POSTRGRES_URL.rsplit("/", 1)[0] if POSTRGRES_URL else None
        if not base_url:
            raise ValueError("Cannot construct database URL")
        db_url = f"{base_url}/{database_name}"
        logger.info(f"Database connection: {database_name}")
        db_engine = create_engine(db_url, poolclass=NullPool)
        return db_engine

    @staticmethod
    def _parse_date(value: Any, fallback: datetime) -> datetime:
        if value is None:
            return fallback
        try:
            parsed = pandas.to_datetime(value, errors="coerce")
            if pandas.isna(parsed):
                return fallback
            return parsed.to_pydatetime()
        except Exception:
            return fallback

    @staticmethod
    def _metadata_row_for_id(dataset_id: str) -> pandas.Series:
        df = DatabaseQueries.get_metadata_by_ids([dataset_id])
        if df.empty:
            raise HTTPException(
                status_code=404, detail=f"Dataset not found: {dataset_id}"
            )
        return df.iloc[0]

    @staticmethod
    async def _open_dataset_for_metadata(meta_row: pandas.Series) -> xr.Dataset:
        stored = str(meta_row.get("stored") or meta_row.get("Stored") or "").lower()
        if stored == "local":
            return await DatasetLocal.open_local_dataset(meta_row)

        # Default to cloud if not local/postgres
        fallback = datetime.utcnow()
        start = DatabaseQueries._parse_date(meta_row.get("startDate"), fallback)
        end = DatabaseQueries._parse_date(meta_row.get("endDate"), fallback)
        return await DatasetCloud.open_cloud_dataset(meta_row, start, end)

    @staticmethod
    def _get_level_values(ds: xr.Dataset, meta_row: pandas.Series) -> list[float | str]:
        var_name = meta_row.get("keyVariable") or meta_row.get("key_variable")
        if not var_name or var_name not in ds:
            raise ValueError("Dataset variable not found for levels")
        lat_name, lon_name, time_name = DataProcessing.normalize_coordinates(ds)
        var = ds[var_name]
        level_dims = [d for d in var.dims if d not in (time_name, lat_name, lon_name)]
        if not level_dims:
            return ["surface"]
        level_dim = level_dims[0]
        coord_values = ds[level_dim].values if level_dim in ds.coords else None
        if coord_values is None or len(coord_values) == 0:
            return [str(i + 1) for i in range(var.sizes.get(level_dim, 1))]
        return [v.item() if hasattr(v, "item") else v for v in coord_values]

    @staticmethod
    def _get_time_values(ds: xr.Dataset, meta_row: pandas.Series) -> list[datetime]:
        lat_name, lon_name, time_name = DataProcessing.normalize_coordinates(ds)
        if not time_name or time_name not in ds.coords:
            fallback = datetime.utcnow()
            start = DatabaseQueries._parse_date(meta_row.get("startDate"), fallback)
            return [start]
        raw = ds[time_name].values
        if raw is None or len(raw) == 0:
            fallback = datetime.utcnow()
            start = DatabaseQueries._parse_date(meta_row.get("startDate"), fallback)
            return [start]
        try:
            parsed = pandas.to_datetime(raw)
        except Exception:
            parsed = pandas.to_datetime([str(v) for v in raw], errors="coerce")
        parsed = [v.to_pydatetime() for v in parsed if not pandas.isna(v)]
        return parsed

    @staticmethod
    def _get_grid_definition(ds: xr.Dataset, meta_row: pandas.Series) -> dict[str, Any]:
        cache_key = str(meta_row.get("id") or meta_row.get("datasetId") or "")
        cached = DatabaseQueries._local_cloud_grid_cache.get(cache_key)
        if cached:
            return cached

        lat_name, lon_name, _ = DataProcessing.normalize_coordinates(ds)
        if not lat_name or not lon_name:
            raise ValueError("Dataset missing lat/lon coordinates")
        lat_values = numpy.asarray(ds[lat_name].values, dtype=float)
        lon_values = numpy.asarray(ds[lon_name].values, dtype=float)
        if lat_values.ndim != 1 or lon_values.ndim != 1:
            raise ValueError("Only 1D lat/lon grids are supported")

        rows = int(lat_values.shape[0])
        cols = int(lon_values.shape[0])
        gridbox_id = numpy.arange(rows * cols, dtype=int) + 1
        lat = numpy.repeat(lat_values, cols)
        lon = numpy.tile(lon_values, rows)

        payload = {
            "rows": rows,
            "cols": cols,
            "lat_values": lat_values,
            "lon_values": lon_values,
            "gridbox_id": gridbox_id,
            "lat": lat,
            "lon": lon,
        }
        DatabaseQueries._local_cloud_grid_cache[cache_key] = payload
        return payload

    @staticmethod
    async def get_all_metadata(
        stored: Optional[Literal["local", "cloud", "all"]] = "all",
        source: Optional[str] = None,
        search: Optional[str] = None,
    ) -> dict[str, Any]:
        """Fetch metadata from database for specified dataset IDs (UUIDs)"""
        try:
            with engine.connect() as conn:
                query = """
                    SELECT
                            *
                        FROM metadata
                        WHERE 1 = 1
                """
                parameters = {}
                if stored != "all" and stored is not None:
                    query += "AND LOWER(stored) = :stored\n"
                    parameters["stored"] = stored.lower()

                if source:
                    query += 'AND LOWER("sourceName") ILIKE :source\n'
                    parameters["source"] = source.lower()

                if search:
                    query += """AND (
                        LOWER("datasetName") ILIKE :search OR
                        LOWER("layerParameter") ILIKE :search OR
                        LOWER("slug") ILIKE :search
                        )
                    """
                    parameters["search"] = f"%{search.lower()}%"

                # Add ORDER BY to the query
                query += '\nORDER BY "datasetName" ASC'

                # Query by UUID id column instead of datasetName
                results = conn.execute(
                    statement=text(query),
                    parameters=parameters,
                ).fetchall()
                metadata = [Metadata(**r._mapping) for r in results]

                if metadata is None:
                    raise Exception("Query failed")
                elif len(metadata) == 0:
                    return {"total": 0, "datasets": []}
                else:
                    return {"total": len(metadata), "datasets": metadata}

        except Exception as e:
            logger.error(f"Database query failed: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch metadata from database: {str(e)}",
            )

    @staticmethod
    def get_metadata(
        request: DatasetRequest | GridboxDataRequest | TimeseriesDataRequest,
    ) -> Metadata:
        """Fetch metadata from database for specified dataset IDs (UUIDs)"""
        dataset_id = request.dataset_id
        try:
            with engine.connect() as conn:
                # Query by UUID id column instead of datasetName
                results = conn.execute(
                    statement=text("""
                        SELECT * FROM metadata
                        WHERE id = :dataset_id
                    """),
                    parameters={"dataset_id": dataset_id},
                ).fetchone()
                metadata = Metadata(**results._mapping)

                if not metadata:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Dataset not found: {request.datasetId}",
                    )

                return metadata
        except Exception as e:
            logger.error(f"Database query failed: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch metadata from database: {str(e)}",
            )

    ##############################
    # Dataset specific methods
    ##############################
    @staticmethod
    async def get_timestamps(request: DatasetRequest) -> dict[str, Any]:
        metadata = DatabaseQueries.get_metadata(request)
        stored = (metadata.stored or metadata.storage_type or "").lower()
        if stored == "postgres" or "postgres" in stored:
            with DatabaseQueries.get_engine(
                metadata.dataset_short_name
            ).connect() as conn:
                query = text("SELECT * FROM get_timestamps()")
                rows = conn.execute(query).fetchall()
                return {
                    "timestamp_id": [r[0] for r in rows],
                    "timestamp_value": [r[1] for r in rows],
                }

        cache_key = str(metadata.id)
        cached = DatabaseQueries._local_cloud_time_cache.get(cache_key)
        if cached is None:
            meta_row = DatabaseQueries._metadata_row_for_id(metadata.id)
            ds = await DatabaseQueries._open_dataset_for_metadata(meta_row)
            cached = DatabaseQueries._get_time_values(ds, meta_row)
            DatabaseQueries._local_cloud_time_cache[cache_key] = cached

        return {
            "timestamp_id": list(range(1, len(cached) + 1)),
            "timestamp_value": [ts.isoformat() for ts in cached],
        }

    @staticmethod
    async def get_levels(request: DatasetRequest) -> dict[str, Any]:
        metadata = DatabaseQueries.get_metadata(request)
        stored = (metadata.stored or metadata.storage_type or "").lower()
        if stored == "postgres" or "postgres" in stored:
            with DatabaseQueries.get_engine(
                metadata.dataset_short_name
            ).connect() as conn:
                query = text("SELECT * FROM get_levels()")
                rows = conn.execute(query).fetchall()
                return {
                    "level_id": [r[0] for r in rows],
                    "name": [r[1] for r in rows],
                }

        cache_key = str(metadata.id)
        cached = DatabaseQueries._local_cloud_level_cache.get(cache_key)
        if cached is None:
            meta_row = DatabaseQueries._metadata_row_for_id(metadata.id)
            ds = await DatabaseQueries._open_dataset_for_metadata(meta_row)
            cached = DatabaseQueries._get_level_values(ds, meta_row)
            DatabaseQueries._local_cloud_level_cache[cache_key] = cached

        return {
            "level_id": list(range(1, len(cached) + 1)),
            "name": [str(value) for value in cached],
        }

    @staticmethod
    async def get_gridboxes(request: DatasetRequest) -> dict[str, Any]:
        metadata = DatabaseQueries.get_metadata(request)
        stored = (metadata.stored or metadata.storage_type or "").lower()
        if stored == "postgres" or "postgres" in stored:
            with DatabaseQueries.get_engine(
                metadata.dataset_short_name
            ).connect() as conn:
                query = text("SELECT * FROM get_gridboxes()")
                rows = conn.execute(query).fetchall()
                return {
                    "gridbox_id": [r[0] for r in rows],
                    "lat_id": [r[1] for r in rows],
                    "lon_id": [r[2] for r in rows],
                    "lat": [r[3] for r in rows],
                    "lon": [r[4] for r in rows],
                }

        meta_row = DatabaseQueries._metadata_row_for_id(metadata.id)
        ds = await DatabaseQueries._open_dataset_for_metadata(meta_row)
        grid = DatabaseQueries._get_grid_definition(ds, meta_row)

        rows = grid["rows"]
        cols = grid["cols"]
        lat_ids = numpy.repeat(numpy.arange(rows, dtype=int) + 1, cols)
        lon_ids = numpy.tile(numpy.arange(cols, dtype=int) + 1, rows)

        return {
            "gridbox_id": grid["gridbox_id"].tolist(),
            "lat_id": lat_ids.tolist(),
            "lon_id": lon_ids.tolist(),
            "lat": grid["lat"].tolist(),
            "lon": grid["lon"].tolist(),
        }

    @staticmethod
    async def get_gridbox_data(request: GridboxDataRequest) -> dict[str, Any]:
        metadata = DatabaseQueries.get_metadata(request)
        stored = (metadata.stored or metadata.storage_type or "").lower()
        if stored == "postgres" or "postgres" in stored:
            with DatabaseQueries.get_engine(
                metadata.dataset_short_name
            ).connect() as conn:
                rows = conn.execute(
                    statement=text("""
                        SELECT * FROM get_gridbox_data(:timestamp_id, :level_id)
                    """),
                    parameters={
                        "timestamp_id": request.timestamp_id,
                        "level_id": request.level_id,
                    },
                ).fetchall()
                return {
                    "gridbox_id": [r[0] for r in rows],
                    "lat": [r[1] for r in rows],
                    "lon": [r[2] for r in rows],
                    "value": [r[3] for r in rows],
                }

        meta_row = DatabaseQueries._metadata_row_for_id(metadata.id)
        ds = await DatabaseQueries._open_dataset_for_metadata(meta_row)
        var_name = meta_row.get("keyVariable") or meta_row.get("key_variable")
        if not var_name or var_name not in ds:
            raise HTTPException(status_code=500, detail="Dataset variable not found")

        lat_name, lon_name, time_name = DataProcessing.normalize_coordinates(ds)
        if not lat_name or not lon_name:
            raise HTTPException(
                status_code=500, detail="Dataset missing lat/lon coords"
            )

        data_array = ds[var_name]

        if time_name and time_name in data_array.dims:
            times = DatabaseQueries._local_cloud_time_cache.get(str(metadata.id))
            if times is None:
                times = DatabaseQueries._get_time_values(ds, meta_row)
                DatabaseQueries._local_cloud_time_cache[str(metadata.id)] = times
            time_idx = max(0, min(len(times) - 1, request.timestamp_id - 1))
            data_array = data_array.isel({time_name: time_idx})

        level_values = DatabaseQueries._local_cloud_level_cache.get(str(metadata.id))
        if level_values is None:
            level_values = DatabaseQueries._get_level_values(ds, meta_row)
            DatabaseQueries._local_cloud_level_cache[str(metadata.id)] = level_values

        level_dims = [
            d for d in data_array.dims if d not in (time_name, lat_name, lon_name)
        ]
        if level_dims:
            level_dim = level_dims[0]
            level_idx = max(0, min(len(level_values) - 1, request.level_id - 1))
            data_array = data_array.isel({level_dim: level_idx})

        if lat_name in data_array.dims and lon_name in data_array.dims:
            data_array = data_array.transpose(lat_name, lon_name)

        data = numpy.asarray(data_array.values, dtype=float)

        grid = DatabaseQueries._get_grid_definition(ds, meta_row)
        flat_values = data.reshape(-1)

        return {
            "gridbox_id": grid["gridbox_id"].tolist(),
            "lat": grid["lat"].tolist(),
            "lon": grid["lon"].tolist(),
            "value": flat_values.tolist(),
        }

    @staticmethod
    async def get_timeseries_data(request: TimeseriesDataRequest) -> dict[str, Any]:
        metadata = DatabaseQueries.get_metadata(request)
        stored = (metadata.stored or metadata.storage_type or "").lower()
        if stored == "postgres" or "postgres" in stored:
            with DatabaseQueries.get_engine(
                metadata.dataset_short_name
            ).connect() as conn:
                rows = conn.execute(
                    statement=text("""
                        SELECT * FROM get_timeseries(:gridbox_id, :level_id)
                    """),
                    parameters={
                        "gridbox_id": request.gridbox_id,
                        "level_id": request.level_id,
                    },
                ).fetchall()
                return {
                    "timestamp_id": [r[0] for r in rows],
                    "timestamp_value": [r[1] for r in rows],
                    "level_id": [r[2] for r in rows],
                    "value": [r[3] for r in rows],
                }

        meta_row = DatabaseQueries._metadata_row_for_id(metadata.id)
        ds = await DatabaseQueries._open_dataset_for_metadata(meta_row)
        var_name = meta_row.get("keyVariable") or meta_row.get("key_variable")
        if not var_name or var_name not in ds:
            raise HTTPException(status_code=500, detail="Dataset variable not found")

        lat_name, lon_name, time_name = DataProcessing.normalize_coordinates(ds)
        if not lat_name or not lon_name:
            raise HTTPException(
                status_code=500, detail="Dataset missing lat/lon coords"
            )

        grid = DatabaseQueries._get_grid_definition(ds, meta_row)
        rows = grid["rows"]
        cols = grid["cols"]
        idx = max(0, request.gridbox_id - 1)
        row_idx = idx // cols
        col_idx = idx % cols

        data_array = ds[var_name]
        level_values = DatabaseQueries._local_cloud_level_cache.get(str(metadata.id))
        if level_values is None:
            level_values = DatabaseQueries._get_level_values(ds, meta_row)
            DatabaseQueries._local_cloud_level_cache[str(metadata.id)] = level_values

        level_dims = [
            d for d in data_array.dims if d not in (time_name, lat_name, lon_name)
        ]
        if level_dims:
            level_dim = level_dims[0]
            level_idx = max(0, min(len(level_values) - 1, request.level_id - 1))
            data_array = data_array.isel({level_dim: level_idx})

        if lat_name in data_array.dims:
            data_array = data_array.isel({lat_name: row_idx})
        if lon_name in data_array.dims:
            data_array = data_array.isel({lon_name: col_idx})

        if time_name and time_name in data_array.dims:
            values = numpy.asarray(data_array.values, dtype=float).reshape(-1)
            times = DatabaseQueries._local_cloud_time_cache.get(str(metadata.id))
            if times is None:
                times = DatabaseQueries._get_time_values(ds, meta_row)
                DatabaseQueries._local_cloud_time_cache[str(metadata.id)] = times
            length = min(len(times), len(values))
            return {
                "timestamp_id": list(range(1, length + 1)),
                "timestamp_value": [ts.isoformat() for ts in times[:length]],
                "level_id": [request.level_id] * length,
                "value": values[:length].tolist(),
            }

        value = float(data_array.values) if numpy.size(data_array.values) == 1 else None
        ts_fallback = DatabaseQueries._get_time_values(ds, meta_row)[0]
        return {
            "timestamp_id": [1],
            "timestamp_value": [ts_fallback.isoformat()],
            "level_id": [request.level_id],
            "value": [value],
        }

    @staticmethod
    def get_datasets(
        stored: Optional[Literal["local", "cloud", "all"]] = "all",
        source: Optional[str] = None,
        search: Optional[str] = None,
    ):
        # Load metadata from database using 'metadata' table
        with engine.connect() as conn:
            query = text("SELECT * FROM metadata")
            result = conn.execute(query)
            df = pandas.DataFrame(result.fetchall(), columns=result.keys())

        if df.empty:
            return {"total": 0, "datasets": []}

        # Apply filters
        if stored != "all" and stored is not None:
            stored_series = df.get("stored")
            if stored_series is None:
                stored_series = df.get("Stored")
            if stored_series is not None:
                df = df[stored_series.str.lower() == stored.lower()]

        if source:
            df = df[df["sourceName"].str.contains(source, case=False, na=False)]

        if search:
            df = df[
                df["datasetName"].str.contains(search, case=False, na=False)
                | df["layerParameter"].str.contains(search, case=False, na=False)
                | df.get("slug", pandas.Series(dtype=str)).str.contains(
                    search, case=False, na=False
                )
            ]

        # Convert to list of dicts
        datasets = []
        for _, row in df.iterrows():
            datasets.append(
                {
                    "id": str(row["id"]),
                    "slug": row.get("slug"),
                    "name": row["layerParameter"],
                    "datasetName": row["datasetName"],
                    "sourceName": row["sourceName"],
                    "source": row["sourceName"],
                    "type": row["datasetType"],
                    "stored": row.get("stored") or row.get("Stored"),
                    "startDate": row["startDate"],
                    "endDate": row["endDate"],
                    "units": row["units"],
                    "spatialResolution": row.get("spatialResolution"),
                    "levels": row.get("levels"),
                    "levelValues": row.get("levelValues"),
                    "levelUnits": row.get("levelUnits"),
                    "statistic": row.get("statistic"),
                    "inputFile": row.get("inputFile"),
                    "keyVariable": row.get("keyVariable"),
                    "colorMap": row.get("colorMap"),
                    "valueMin": row.get("valueMin"),
                    "valueMax": row.get("valueMax"),
                }
            )

        return {"total": len(datasets), "datasets": datasets}

    @staticmethod
    def get_metadata_by_ids(dataset_ids: List[str]) -> pandas.DataFrame:
        """Fetch metadata from database for specified dataset IDs (UUIDs)"""
        try:
            with engine.connect() as conn:
                placeholders = ", ".join([f":id{i}" for i in range(len(dataset_ids))])
                # Query by UUID id column instead of datasetName
                query = text(f"""
                    SELECT * FROM metadata
                    WHERE id IN ({placeholders})
                """)
                params = {
                    f"id{i}": dataset_id for i, dataset_id in enumerate(dataset_ids)
                }

                result = conn.execute(query, params)
                df = pandas.DataFrame(result.fetchall(), columns=result.keys())

                if df.empty:
                    logger.warning(f"No metadata found for dataset IDs: {dataset_ids}")

                return df
        except Exception as e:
            logger.error(f"Database query failed: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch metadata from database: {str(e)}",
            )

    @staticmethod
    def extract_timeseries_from_postgres(
        start_date: datetime,
        end_date: datetime,
        lat: float,
        lon: float,
        database_name: str = "cmorph_daily_by_year",
    ) -> pandas.Series:
        """
        Extract time series data for a specific point from PostgreSQL database.

        Queries the pre-processed PostgreSQL database created by netcdf_to_db_by_year.py
        for a specific lat/lon coordinate. Much faster than loading NetCDF files.

        Args:
            start_date: Start date for extraction
            end_date: End date for extraction
            lat: Latitude of point to extract
            lon: Longitude of point to extract
            database_name: Name of the PostgreSQL database (default: cmorph_daily_by_year)

        Returns:
            pd.Series with datetime index and values for the nearest gridbox
        """

        # Build connection URL
        # if CMORPH_DB_URL:
        #     db_url = CMORPH_DB_URL
        # Extract base connection info from main postgres URL and change database name
        base_url = POSTRGRES_URL.rsplit("/", 1)[0] if POSTRGRES_URL else None
        if not base_url:
            raise ValueError("Cannot construct CMORPH database URL")
        db_url = f"{base_url}/{database_name}"

        logger.info(
            f"[PostgresExtractor] Connecting to PostgreSQL database: {database_name}"
        )
        logger.info(
            f"[PostgresExtractor] Date range: {start_date.date()} to {end_date.date()}"
        )

        # Create engine for the CMORPH database
        cmorph_engine = create_engine(db_url, poolclass=NullPool)

        try:
            with cmorph_engine.connect() as conn:
                # Discover what value columns exist in grid_data table
                column_query = text("""
                                    SELECT column_name
                                    FROM information_schema.columns
                                    WHERE table_name = 'grid_data'
                                      AND column_name LIKE 'value_%'
                                    ORDER BY column_name
                                    """)
                column_results = conn.execute(column_query).fetchall()
                value_columns = [row[0] for row in column_results]

                if not value_columns:
                    raise ValueError("No value columns found in grid_data table")

                logger.info(
                    f"[PostgresExtractor] Found {len(value_columns)} value columns"
                )

                # Determine if we have year-based columns (value_1998, value_1999, etc.)
                is_year_based = any(
                    col.startswith("value_")
                    and col.replace("value_", "").isdigit()
                    and len(col.replace("value_", "")) == 4
                    for col in value_columns
                )

                logger.info(
                    f"[PostgresExtractor] Point extraction: lat={lat}, lon={lon}"
                )

                # Find nearest lat/lon indices
                lat_query = text("""
                                 SELECT lat_id, lat, ABS(lat - :target_lat) as dist
                                 FROM lat
                                 ORDER BY dist LIMIT 1
                                 """)
                lat_result = conn.execute(lat_query, {"target_lat": lat}).fetchone()

                lon_query = text("""
                                 SELECT lon_id, lon, ABS(lon - :target_lon) as dist
                                 FROM lon
                                 ORDER BY dist LIMIT 1
                                 """)
                lon_result = conn.execute(lon_query, {"target_lon": lon}).fetchone()

                if not lat_result or not lon_result:
                    raise ValueError("Could not find nearest lat/lon in database")

                lat_id = lat_result[0]
                lon_id = lon_result[0]
                actual_lat = lat_result[1]
                actual_lon = lon_result[1]

                logger.info(
                    f"[PostgresExtractor] Nearest point: lat={actual_lat} (id={lat_id}), lon={actual_lon} (id={lon_id})"
                )

                # Get gridbox_id for this lat/lon
                gridbox_query = text("""
                                     SELECT gridbox_id
                                     FROM gridbox
                                     WHERE lat_id = :lat_id
                                       AND lon_id = :lon_id
                                     """)
                gridbox_result = conn.execute(
                    gridbox_query, {"lat_id": lat_id, "lon_id": lon_id}
                ).fetchone()

                if not gridbox_result:
                    raise ValueError(
                        f"No gridbox found for lat_id={lat_id}, lon_id={lon_id}"
                    )

                gridbox_id = gridbox_result[0]
                logger.info(f"[PostgresExtractor] Using gridbox_id: {gridbox_id}")

                # Build query based on whether we have year-based columns or not
                if is_year_based:
                    # Extract time series for this gridbox with year-based columns
                    year_columns_sql = ", ".join([f"g.{col}" for col in value_columns])

                    data_query = text(f"""
                        SELECT
                            t.timestamp_val,
                            {year_columns_sql}
                        FROM grid_data g
                        JOIN timestamp_dim t ON g.timestamp_id = t.timestamp_id
                        WHERE g.gridbox_id = :gridbox_id
                        ORDER BY t.timestamp_id
                    """)

                    results = conn.execute(
                        data_query, {"gridbox_id": gridbox_id}
                    ).fetchall()
                    logger.info(
                        f"[PostgresExtractor] Retrieved {len(results)} records from database"
                    )

                    # Build year to column index mapping
                    year_to_col_idx = {}
                    for idx, col in enumerate(value_columns):
                        year = int(col.replace("value_", ""))
                        year_to_col_idx[year] = (
                            idx + 1
                        )  # +1 because timestamp_val is index 0

                    data_dict = {}
                    current_year = start_date.year
                    end_year = end_date.year

                    logger.info(
                        f"[PostgresExtractor] Processing year range: {current_year} to {end_year}"
                    )
                    logger.info(
                        f"[PostgresExtractor] Available year columns: {sorted(year_to_col_idx.keys())}"
                    )

                    points_added = 0
                    skipped_invalid_dates = 0
                    for row in results:
                        mmdd = row[0]

                        try:
                            month = int(mmdd[:2])
                            day = int(mmdd[2:])

                            # For each year in range, get the value from the corresponding column
                            for year in range(current_year, end_year + 1):
                                if year in year_to_col_idx:
                                    try:
                                        timestamp = datetime(year, month, day)

                                        if start_date <= timestamp <= end_date:
                                            value = row[year_to_col_idx[year]]
                                            if value is not None:
                                                data_dict[timestamp] = value
                                                points_added += 1
                                    except ValueError:
                                        # Invalid date (e.g., Feb 30, Sep 31) - skip it
                                        skipped_invalid_dates += 1
                                        continue
                        except (ValueError, IndexError) as e:
                            logger.warning(
                                f"[PostgresExtractor] Could not parse timestamp: {mmdd}, error: {e}"
                            )
                            continue

                    logger.info(
                        f"[PostgresExtractor] Added {points_added} data points from year-based columns"
                    )
                    if skipped_invalid_dates > 0:
                        logger.info(
                            f"[PostgresExtractor] Skipped {skipped_invalid_dates} invalid dates (e.g., Feb 30)"
                        )

                    logger.info(
                        f"[PostgresExtractor] Added {points_added} data points from year-based columns"
                    )
                else:
                    # Simple/level-based case: columns are value_0, value_1, etc. (depth levels)
                    # Timestamps are stored as full ISO datetimes, not MMDD
                    # Default to first level (surface/index 0) for now
                    value_col = value_columns[0]
                    data_query = text(f"""
                        SELECT
                            t.timestamp_val,
                            g.{value_col}
                        FROM grid_data g
                        JOIN timestamp_dim t ON g.timestamp_id = t.timestamp_id
                        WHERE g.gridbox_id = :gridbox_id
                        ORDER BY t.timestamp_id
                    """)

                    results = conn.execute(
                        data_query, {"gridbox_id": gridbox_id}
                    ).fetchall()
                    logger.info(
                        f"[PostgresExtractor] Retrieved {len(results)} records from database"
                    )

                    data_dict = {}
                    for row in results:
                        timestamp_val = row[0]
                        value = row[1]

                        # Handle timestamp_val which may be datetime or string
                        if isinstance(timestamp_val, datetime):
                            timestamp = timestamp_val
                        elif isinstance(timestamp_val, str):
                            try:
                                # Try ISO format first
                                timestamp = datetime.fromisoformat(timestamp_val)
                            except ValueError:
                                logger.warning(
                                    f"[PostgresExtractor] Could not parse timestamp: {timestamp_val}"
                                )
                                continue
                        else:
                            logger.warning(
                                f"[PostgresExtractor] Unexpected timestamp type: {type(timestamp_val)}"
                            )
                            continue

                        # Check if within date range
                        if start_date <= timestamp <= end_date:
                            if value is not None:
                                data_dict[timestamp] = value

                # Convert to pandas Series
                series = pandas.Series(data_dict)
                series.index = pandas.to_datetime(series.index)
                series = series.sort_index()

                if len(series) > 0:
                    logger.info(
                        f"[PostgresExtractor] Extracted {len(series)} data points"
                    )
                    logger.info(
                        "[PostgresExtractor] Date range in result: "
                        f"{series.index[0].date()} to {series.index[-1].date()}"
                    )
                else:
                    logger.warning("[PostgresExtractor] No data points extracted!")

                return series

        except Exception as e:
            logger.error(
                f"[PostgresExtractor] Error extracting data from PostgreSQL: {e}"
            )
            raise
        finally:
            cmorph_engine.dispose()

    @staticmethod
    def open_postgres_raster_dataset(
        metadata: pandas.Series, target_date: datetime
    ) -> xr.Dataset:
        """
        Reconstruct a spatial grid for a single date from PostgreSQL database.
        Optimized with single JOIN query for fast retrieval.
        """
        database_name = str(metadata.get("inputFile", ""))
        base_url = POSTRGRES_URL.rsplit("/", 1)[0] if POSTRGRES_URL else None
        if not base_url:
            raise ValueError("Cannot construct database URL")
        db_url = f"{base_url}/{database_name}"

        logger.info(f"[PostgresRaster] Opening raster from database: {database_name}")
        logger.info(f"[PostgresRaster] Date: {target_date.date()}")

        db_engine = create_engine(db_url, poolclass=NullPool)

        try:
            with db_engine.connect() as conn:
                # Detect timestamp_val type: date/timestamp vs MMDD string (CHAR(4))
                ts_type_query = text("""
                    SELECT data_type
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'timestamp_dim'
                      AND column_name = 'timestamp_val'
                """)
                ts_type_row = conn.execute(ts_type_query).fetchone()
                timestamp_is_date_type = False
                if ts_type_row:
                    data_type = (ts_type_row[0] or "").lower()
                    timestamp_is_date_type = data_type in (
                        "timestamp without time zone",
                        "timestamp with time zone",
                        "date",
                    )

                # Get value columns to determine structure
                column_query = text("""
                                    SELECT column_name
                                    FROM information_schema.columns
                                    WHERE table_name = 'grid_data'
                                      AND column_name LIKE 'value_%'
                                    ORDER BY column_name LIMIT 5
                                    """)
                column_results = conn.execute(column_query).fetchall()
                value_columns = [row[0] for row in column_results]

                if not value_columns:
                    raise ValueError("No value columns found in grid_data table")

                # Check if year-based columns
                is_year_based = any(
                    col.startswith("value_")
                    and col.replace("value_", "").isdigit()
                    and len(col.replace("value_", "")) == 4
                    for col in value_columns
                )

                # Determine which column to query
                if is_year_based:
                    year_col = f"value_{target_date.year}"
                    value_col = year_col
                else:
                    value_col = value_columns[0]

                # Use actual date for timestamp/date columns (e.g. ocean_heat_content);
                # use MMDD string for CHAR(4) (e.g. CMORPH daily)
                ts_param: Any
                if timestamp_is_date_type:
                    # Monthly data is typically stored on the 16th of each month
                    ts_param = target_date.replace(day=16)
                    ts_param_name = "ts_val"
                else:
                    ts_param = f"{target_date.month:02d}{target_date.day:02d}"
                    ts_param_name = "mmdd"

                combined_query = text(f"""
                    SELECT
                        lat.lat,
                        lon.lon,
                        g.{value_col} as value
                    FROM grid_data g
                    JOIN timestamp_dim t ON g.timestamp_id = t.timestamp_id
                    JOIN gridbox gb ON g.gridbox_id = gb.gridbox_id
                    JOIN lat ON gb.lat_id = lat.lat_id
                    JOIN lon ON gb.lon_id = lon.lon_id
                    WHERE t.timestamp_val = :{ts_param_name}
                    ORDER BY lat.lat, lon.lon
                """)

                results = conn.execute(
                    combined_query, {ts_param_name: ts_param}
                ).fetchall()

                if not results:
                    raise ValueError(f"No data found for date {target_date.date()}")

                logger.info(
                    f"[PostgresRaster] Retrieved {len(results)} gridpoints in single query"
                )

                # Convert to pandas DataFrame for faster processing
                df = pandas.DataFrame(results, columns=["lat", "lon", "value"])

                # Get unique sorted coordinates
                lat_array = numpy.sort(df["lat"].unique())
                lon_array = numpy.sort(df["lon"].unique())

                # Create coordinate to index mapping
                lat_to_idx = {lat: idx for idx, lat in enumerate(lat_array)}
                lon_to_idx = {lon: idx for idx, lon in enumerate(lon_array)}

                # Initialize grid
                data_grid = numpy.full(
                    (len(lat_array), len(lon_array)), numpy.nan, dtype=numpy.float32
                )

                # Vectorized assignment using numpy indexing
                lat_indices = df["lat"].map(lat_to_idx).values
                lon_indices = df["lon"].map(lon_to_idx).values
                data_grid[lat_indices, lon_indices] = df["value"].values

                # Create xarray Dataset
                var_name = metadata.get("keyVariable", "value")
                ds = xr.Dataset(
                    {var_name: (["lat", "lon"], data_grid)},
                    coords={"lat": lat_array, "lon": lon_array, "time": target_date},
                )

                logger.info(f"[PostgresRaster] Reconstructed grid: {data_grid.shape}")
                return ds

        except Exception as e:
            logger.error(f"[PostgresRaster] Error: {e}")
            raise
        finally:
            db_engine.dispose()
