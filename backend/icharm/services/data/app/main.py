"""
Enhanced FastAPI application for climate time series data extraction
Supports both local and cloud-based datasets with advanced processing capabilities
NOW WITH RASTER VISUALIZATION SUPPORT
"""

from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional, Any, Literal
from datetime import datetime
import pandas as pd
import numpy as np
import os
import json
import re
from concurrent.futures import ThreadPoolExecutor
import warnings
import logging


from icharm.services.data.app.database_queries import DatabaseQueries
from icharm.services.data.app.dataset_cache import dataset_cache
from icharm.services.data.app.env_helpers import EnvHelpers
from icharm.services.data.app.extract_timeseries import ExtractTimeseries
from icharm.services.data.app.models import (
    TimeSeriesResponse,
    TimeSeriesRequest,
    RasterRequest,
)

# Import raster visualization module
from icharm.services.data.app.visualize_raster import VisualizeRaster
from icharm.utils.logger import setup_logging

warnings.filterwarnings("ignore")

logger = logging.getLogger(__name__)

# ============================================================================
# CUSTOM JSON ENCODER FOR NaN/Inf VALUES
# ============================================================================


def clean_for_json(obj):
    """Recursively clean data structures to be JSON-compliant"""
    if isinstance(obj, dict):
        return {k: clean_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_for_json(item) for item in obj]
    elif isinstance(obj, float):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return obj
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return clean_for_json(obj.tolist())
    elif pd.isna(obj):
        return None
    return obj


class CustomJSONResponse(JSONResponse):
    """Custom JSON response that handles NaN and Inf values"""

    def render(self, content: Any) -> bytes:
        cleaned_content = clean_for_json(content)
        return json.dumps(
            cleaned_content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
        ).encode("utf-8")


# ============================================================================
# CONFIGURATION
# ============================================================================

# File paths configuration
LOCAL_DATASETS_PATH = EnvHelpers.resolve_env_path(
    os.getenv("LOCAL_DATASETS_PATH"), "datasets", ensure_exists=True
)


# Thread pool for parallel processing
executor = ThreadPoolExecutor(max_workers=4)


# ============================================================================
# DATA ACCESS FUNCTIONS
# ============================================================================


def _slugify(value: str) -> str:
    """
    Simplify strings to safe filesystem-friendly names.
    """
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "dataset"


# ============================================================================
# API ENDPOINTS
# ============================================================================

# Create FastAPI app and router
app = FastAPI(
    title="Enhanced Climate Time Series API",
    description="Advanced API for extracting and processing climate time series data",
    version="2.0.0",
    default_response_class=CustomJSONResponse,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js dev server
        "http://127.0.0.1:3000",  # Alternative localhost
        "*",  # Allow all in development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

router = APIRouter(prefix="/api/v2")


@router.post(
    "/timeseries/extract",
    response_model=TimeSeriesResponse,
    response_class=CustomJSONResponse,
)
async def extract_timeseries(request: TimeSeriesRequest):
    """
    Extract and process time series data from multiple datasets

    NEW: Supports focusCoordinates parameter for point-based extraction
    Format: "lat1,lon1; lat2,lon2"
    Example: "40.7128,-74.0060; 34.0522,-118.2437"

    When focusCoordinates are provided:
    - Extracts data from specific lat/lon points instead of spatial aggregation
    - If multiple coordinates provided, averages the values
    - Ignores spatialBounds and aggregation parameters
    """
    return await ExtractTimeseries.extract_timeseries(request)


@router.post("/raster/visualize", response_class=CustomJSONResponse)
async def visualize_raster(request: RasterRequest):
    """
    Generate raster visualization for 3D globe display
    Now supports custom min/max range for color mapping
    """
    return await VisualizeRaster.visualize_raster(request)


@router.get("/timeseries/datasets", response_class=CustomJSONResponse)
async def list_available_datasets(
    stored: Optional[Literal["local", "cloud", "all"]] = "all",
    source: Optional[str] = None,
    search: Optional[str] = None,
):
    """
    List all available datasets with filtering options
    """
    try:
        datasets = DatabaseQueries.get_datasets(stored, source, search)

    except Exception as e:
        logger.error(f"Error listing datasets: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to list datasets: {str(e)}"
        )
    return datasets


@router.get("/stations/list", response_class=CustomJSONResponse)
async def get_stations_list(
    year: Optional[int] = None,
    month: Optional[int] = None,
    limit: Optional[int] = None
):
    """
    Get list of GHCN-M stations with data for a specific month
    
    Args:
        year: Year (YYYY)
        month: Month (1-12)
        limit: Optional limit on number of stations returned
    
    Returns:
        List of stations with data for the specified month
    """
    try:
        from sqlalchemy import text, create_engine
        import os
        import pandas as pd
        
        db_url = os.getenv("POSTGRES_URL", "postgresql://icharm_user:icharm_dev_password@localhost:5432/icharm")
        engine = create_engine(db_url)
        
        with engine.connect() as conn:
            # Build query to get unique stations with data for the month
            query = """
            SELECT DISTINCT 
                t.id as station_id,
                s.latitude,
                s.longitude,
                s.elevation,
                s.name,
                COUNT(*) as value_count
            FROM ghcnm_tavg_timeseries t
            JOIN ghcnm_stations s ON t.id = s.station_id
            WHERE t.value IS NOT NULL
            """
            
            params = {}
            if year is not None and month is not None:
                if month < 1 or month > 12:
                    raise HTTPException(status_code=400, detail="Invalid month: must be 1-12")
                query += " AND t.year = :year AND t.month = :month"
                params["year"] = year
                params["month"] = month
            
            query += " GROUP BY t.id, s.latitude, s.longitude, s.elevation, s.name"
            query += " ORDER BY s.name"
            
            if limit:
                query += f" LIMIT {limit}"
            
            result = conn.execute(text(query), params)
            columns = result.keys()
            rows = result.fetchall()
            
            stations = [dict(zip(columns, row)) for row in rows]
            
            return {
                "status": "success",
                "record_count": len(stations),
                "stations": stations
            }
    
    except Exception as e:
        logger.error(f"Error fetching stations: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch stations: {str(e)}")


@router.get("/stations/{station_id}/timeseries", response_class=CustomJSONResponse)
async def get_station_timeseries(
    station_id: str,
    year: Optional[int] = None,
    month: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """
    Get temperature timeseries for a specific station
    
    Args:
        station_id: Station identification code
        year: Optional year filter (with month for monthly data)
        month: Optional month filter (1-12) (with year for monthly data)
        start_date: Optional start date (YYYY-MM-DD) for date range queries
        end_date: Optional end date (YYYY-MM-DD) for date range queries
    
    Returns:
        Timeseries data with dates and temperature values
    """
    try:
        from sqlalchemy import text, create_engine
        import os
        import pandas as pd
        from datetime import datetime
        
        db_url = os.getenv("POSTGRES_URL", "postgresql://icharm_user:icharm_dev_password@localhost:5432/icharm")
        engine = create_engine(db_url)
        
        with engine.connect() as conn:
            # Get station metadata
            station_query = """
            SELECT station_id, latitude, longitude, elevation, name 
            FROM ghcnm_stations 
            WHERE station_id = :station_id
            """
            
            result = conn.execute(text(station_query), {"station_id": station_id})
            station_row = result.fetchone()
            
            if station_row is None:
                raise HTTPException(status_code=404, detail=f"Station {station_id} not found")
            
            station_data = dict(zip(result.keys(), station_row))
            
            # Build timeseries query
            ts_query = """
            SELECT date, value, element, year, month
            FROM ghcnm_tavg_timeseries
            WHERE id = :station_id AND value IS NOT NULL
            """
            params = {"station_id": station_id}
            
            # Apply year/month filter for monthly data
            if year is not None and month is not None:
                if month < 1 or month > 12:
                    raise HTTPException(status_code=400, detail="Invalid month: must be 1-12")
                ts_query += " AND year = :year AND month = :month"
                params["year"] = year
                params["month"] = month
            # Apply date range filters for date-based queries
            else:
                if start_date:
                    ts_query += " AND date >= :start_date"
                    params["start_date"] = start_date
                
                if end_date:
                    ts_query += " AND date <= :end_date"
                    params["end_date"] = end_date
            
            ts_query += " ORDER BY date"
            
            df = pd.read_sql(text(ts_query), conn, params=params)
            
            if df.empty:
                return {
                    "status": "success",
                    "station": station_data,
                    "record_count": 0,
                    "date_range": {"start": None, "end": None},
                    "timeseries": []
                }
            
            # Format timeseries data
            df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
            timeseries_list = df[["date", "value"]].to_dict("records")
            
            return {
                "status": "success",
                "station": station_data,
                "record_count": len(timeseries_list),
                "date_range": {
                    "start": timeseries_list[0]["date"] if timeseries_list else None,
                    "end": timeseries_list[-1]["date"] if timeseries_list else None
                },
                "timeseries": timeseries_list
            }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching timeseries for station {station_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch timeseries: {str(e)}")


@router.get("/health")
async def health_check():
    """Health check endpoint with system status"""
    return {
        "status": "healthy",
        "service": "climate-timeseries-api-v2",
        "cache_size": len(dataset_cache.cache),
        "timestamp": datetime.now().isoformat(),
        "features": {
            "timeseries": True,
            "rasterVisualization": True,
            "localDatasets": True,
            "cloudDatasets": True,
        },
    }


@router.post("/cache/clear")
async def clear_cache():
    """Clear the dataset cache"""
    dataset_cache.clear()
    return {"message": "Cache cleared successfully"}


# Include router in app
app.include_router(router)

# ============================================================================
# STARTUP AND SHUTDOWN
# ============================================================================


@app.on_event("startup")
async def startup_event():
    """Initialize resources on startup"""
    logger.info("Starting Enhanced Climate Time Series API")
    logger.info(f"Local datasets path: {LOCAL_DATASETS_PATH}")
    # logger.info(f"Kerchunk directory: {KERCHUNK_PATH}")
    # logger.info(f"Cache directory: {CACHE_DIR}")
    # logger.info(f"Database connected: {POSTRGRES_URL is not None}")
    # logger.info(f"S3 Anonymous access: {S3_ANON}")
    logger.info("=" * 60)
    logger.info("PostgreSQL Direct Extraction:")
    logger.info("  Datasets with Stored='postgres' use direct database queries")
    logger.info("  Database names read from metadata.inputFile column")
    logger.info("  Supports: CMORPH, SST, and any future PostgreSQL datasets")
    logger.info("=" * 60)

    # Check if kerchunk directory exists
    # if KERCHUNK_PATH.exists():
    #     kerchunk_files = list(KERCHUNK_PATH.glob("**/*.json"))
    #     logger.info(f"Found {len(kerchunk_files)} kerchunk file(s)")
    # else:
    #     logger.warning(f"Kerchunk directory not found: {KERCHUNK_PATH}")
    #     logger.warning("Cloud datasets will use direct S3 access (slower)")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup resources on shutdown"""
    logger.info("Shutting down API")
    dataset_cache.clear()
    executor.shutdown(wait=True)


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    setup_logging()

    print("🚀 Starting Enhanced Climate Time Series API...")
    print("📍 API will be available at: http://localhost:8000")
    print("📚 API docs at: http://localhost:8000/docs")
    print("🔧 Features:")
    print("   - Local and cloud dataset support")
    print("   - PostgreSQL-based extraction (CMORPH, SST, etc.) - FAST!")
    print("   - Kerchunk optimized cloud access")
    print("   - Multi-file cloud dataset support")
    print("   - Advanced analysis models (trend, anomaly, seasonal)")
    print("   - Spatial filtering and aggregation")
    print("   - Multiple chart types")
    print("   - Data caching for performance")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)