"""
Enhanced FastAPI application for climate time series data extraction
Supports both local and cloud-based datasets with advanced processing capabilities
NOW WITH RASTER VISUALIZATION SUPPORT
"""

from fastapi import FastAPI, APIRouter, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any, Literal, Union
from datetime import datetime, timedelta
from enum import Enum
import xarray as xr
import pandas as pd
import numpy as np
import fsspec
import os
import json
import logging
import asyncio
from pathlib import Path
import re
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from concurrent.futures import ThreadPoolExecutor
import warnings
import kerchunk.hdf
import kerchunk.combine
from functools import lru_cache
import cftime

# Import raster visualization module
from .raster import serialize_raster_array


warnings.filterwarnings("ignore")

# Configure logging
logging.basicConfig(level=logging.INFO)
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

# Load environment variables from common locations inside the container volume
ROOT_DIR = Path(__file__).resolve().parent.parent
ENV_LOCATIONS = [
    ROOT_DIR / ".env.local",
    ROOT_DIR / ".env",
    Path("/app/.env.local"),
    Path("/app/.env"),
]
for env_path in ENV_LOCATIONS:
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=False)

# ============================================================================
# CONFIGURATION
# ============================================================================

# Database configuration (support both legacy POSTGRES_URL and DATABASE_URL)
DATABASE_URL = os.getenv("POSTGRES_URL") or os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError(
        f"DATABASE_URL not found in environment variables. "
        "Please set POSTGRES_URL or DATABASE_URL to a valid PostgreSQL connection string."
    )

# Normalize SQLAlchemy URL scheme (support legacy postgres:// URIs)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# File paths configuration
LOCAL_DATASETS_PATH = (ROOT_DIR / os.getenv("LOCAL_DATASETS_PATH", "datasets")).resolve()
KERCHUNK_PATH = (ROOT_DIR / os.getenv("KERCHUNK_PATH", "kerchunk")).resolve()
CACHE_DIR = Path(os.getenv("CACHE_DIR", "/tmp/climate_cache")).resolve()

# Ensure auxiliary directories exist
KERCHUNK_PATH.mkdir(parents=True, exist_ok=True)

# AWS S3 configuration (for cloud datasets)
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
S3_ANON = os.getenv("S3_ANONYMOUS", "true").lower() == "true"

# Create cache directory if it doesn't exist
Path(CACHE_DIR).mkdir(parents=True, exist_ok=True)

# Thread pool for parallel processing
executor = ThreadPoolExecutor(max_workers=4)

# ============================================================================
# DATABASE CONNECTION
# ============================================================================

# Create synchronous engine
engine = create_engine(DATABASE_URL, poolclass=NullPool)

def get_metadata_by_ids(dataset_ids: List[str]) -> pd.DataFrame:
    """Fetch metadata from database for specified dataset IDs (UUIDs)"""
    try:
        with engine.connect() as conn:
            placeholders = ', '.join([f':id{i}' for i in range(len(dataset_ids))])
            query = text(f"""
                SELECT * FROM metadata 
                WHERE id IN ({placeholders})
            """)
            
            params = {f'id{i}': dataset_id for i, dataset_id in enumerate(dataset_ids)}
            
            result = conn.execute(query, params)
            df = pd.DataFrame(result.fetchall(), columns=result.keys())
            
            if df.empty:
                logger.warning(f"No metadata found for dataset IDs: {dataset_ids}")
            
            return df
    except Exception as e:
        logger.error(f"Database query failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch metadata from database: {str(e)}"
        )

# ============================================================================
# ENUMS AND MODELS
# ============================================================================

class AnalysisModel(str, Enum):
    RAW = "raw"
    MOVING_AVG = "moving-avg"
    TREND = "trend"
    ANOMALY = "anomaly"
    SEASONAL = "seasonal"
    CUMULATIVE = "cumulative"
    DERIVATIVE = "derivative"

class ChartType(str, Enum):
    LINE = "line"
    BAR = "bar"
    AREA = "area"
    SCATTER = "scatter"
    HEATMAP = "heatmap"

class AggregationMethod(str, Enum):
    MEAN = "mean"
    MAX = "max"
    MIN = "min"
    SUM = "sum"
    MEDIAN = "median"
    STD = "std"

class TimeSeriesRequest(BaseModel):
    """Enhanced request model for time series data extraction"""
    datasetIds: List[str] = Field(..., min_items=1, max_items=10)
    startDate: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    endDate: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    analysisModel: Optional[AnalysisModel] = AnalysisModel.RAW
    normalize: Optional[bool] = False
    chartType: Optional[ChartType] = ChartType.LINE
    spatialBounds: Optional[Dict[str, float]] = None
    aggregation: Optional[AggregationMethod] = AggregationMethod.MEAN
    resampleFreq: Optional[str] = None
    includeStatistics: Optional[bool] = True
    includeMetadata: Optional[bool] = True
    smoothingWindow: Optional[int] = None
    
    @validator('endDate')
    def validate_date_range(cls, v, values):
        if 'startDate' in values:
            start = datetime.strptime(values['startDate'], "%Y-%m-%d")
            end = datetime.strptime(v, "%Y-%m-%d")
            if end < start:
                raise ValueError("endDate must be after startDate")
            if (end - start).days > 365 * 50:
                raise ValueError("Date range cannot exceed 50 years")
        return v

class RasterRequest(BaseModel):
    """Request model for raster visualization"""
    datasetId: str = Field(..., description="Dataset UUID")
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="Date for visualization")
    level: Optional[float] = Field(None, description="Atmospheric level (if applicable)")

class DataPoint(BaseModel):
    """Individual data point in time series"""
    date: str
    values: Dict[str, Optional[float]]
    timestamp: Optional[int] = None

class Statistics(BaseModel):
    """Statistical summary for a dataset"""
    min: float
    max: float
    mean: float
    median: float
    std: float
    trend: float
    count: int
    missing: int
    percentiles: Dict[str, float]

class DatasetMetadata(BaseModel):
    """Metadata for a dataset"""
    id: str
    name: str
    source: str
    units: str
    spatialResolution: Optional[str]
    temporalResolution: str
    startDate: str
    endDate: str
    isLocal: bool
    level: Optional[str] = None
    description: Optional[str] = None

class TimeSeriesResponse(BaseModel):
    """Enhanced response model for time series data"""
    data: List[DataPoint]
    metadata: Optional[Dict[str, DatasetMetadata]] = None
    statistics: Optional[Dict[str, Statistics]] = None
    chartConfig: Optional[Dict[str, Any]] = None
    processingInfo: Dict[str, Any]

# ============================================================================
# CACHING
# ============================================================================

class DatasetCache:
    """Simple in-memory cache for opened datasets"""
    def __init__(self, max_size: int = 10):
        self.cache = {}
        self.max_size = max_size
        self.access_times = {}
    
    def get(self, key: str) -> Optional[xr.Dataset]:
        if key in self.cache:
            self.access_times[key] = datetime.now()
            return self.cache[key]
        return None
    
    def set(self, key: str, dataset: xr.Dataset):
        if len(self.cache) >= self.max_size:
            oldest = min(self.access_times, key=self.access_times.get)
            del self.cache[oldest]
            del self.access_times[oldest]
        
        self.cache[key] = dataset
        self.access_times[key] = datetime.now()
    
    def clear(self):
        for ds in self.cache.values():
            ds.close()
        self.cache.clear()
        self.access_times.clear()

# Global cache instance
dataset_cache = DatasetCache()

# ============================================================================
# DATA ACCESS FUNCTIONS
# ============================================================================

def _slugify(value: str) -> str:
    """
    Simplify strings to safe filesystem-friendly names.
    """
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "dataset"


def _normalize_s3_url(url: str) -> str:
    """
    Ensure S3 URIs include the s3:// prefix.
    """
    if not url:
        raise ValueError("Remote URL template is empty.")
    url = url.strip()
    if url.startswith(("s3://", "http://", "https://")):
        return url
    return f"s3://{url.lstrip('/')}"


def _resolve_remote_asset(metadata: pd.Series, date_hint: datetime) -> str:
    """
    Resolve the remote asset (S3 object) for a metadata record and date.
    Handles template substitution and wildcard expansion.
    """
    template = (metadata.get("inputFile") or "").strip()
    if not template:
        raise ValueError(f"No inputFile configured for dataset {metadata.get('datasetName')}")

    formatted = template
    if "{" in formatted:
        formatted = formatted.format(
            year=date_hint.year,
            month=date_hint.month,
            day=date_hint.day,
            hour=getattr(date_hint, "hour", 0),
            minute=getattr(date_hint, "minute", 0),
            second=getattr(date_hint, "second", 0),
        )

    normalized = _normalize_s3_url(formatted)

    if normalized.endswith("/"):
        raise ValueError(
            f"Input file for dataset {metadata.get('datasetName')} resolves to a directory: {normalized}"
        )

    if "*" in normalized:
        fs = fsspec.filesystem("s3", anon=S3_ANON)
        glob_target = normalized[5:] if normalized.startswith("s3://") else normalized
        matches = fs.glob(glob_target)
        if not matches:
            raise ValueError(f"No files found matching pattern: {normalized}")
        candidate = matches[0]
        if not candidate.startswith("s3://"):
            candidate = f"s3://{candidate}"
        normalized = candidate

    return normalized


def _ensure_datetime_coordinates(ds: xr.Dataset) -> xr.Dataset:
    """
    Ensure time-like coordinates are converted to pandas-friendly datetime64.
    """
    for coord_name in ds.coords:
        if coord_name.lower() not in ("time", "date"):
            continue

        coord = ds.coords[coord_name]
        if np.issubdtype(coord.dtype, np.datetime64):
            continue

        units = coord.attrs.get("units")
        calendar = coord.attrs.get("calendar", "standard")
        if not units:
            logger.warning(
                "Skipping datetime conversion for coordinate '%s' due to missing units.",
                coord_name,
            )
            continue

        try:
            decoded = cftime.num2date(
                coord.values,
                units,
                calendar=calendar,
                only_use_cftime_datetimes=False,
            )
            ds = ds.assign_coords({coord_name: pd.to_datetime(decoded)})
        except Exception as exc:
            logger.warning(
                "Unable to convert coordinate '%s' to datetime: %s",
                coord_name,
                exc,
            )
    return ds


def _coerce_time_value(target: datetime, coord: xr.DataArray) -> Any:
    """
    Coerce a datetime to the same type as a time coordinate (handles cftime).
    """
    if coord.size == 0:
        return target

    sample = coord.values[0]
    if isinstance(sample, cftime.datetime):
        cls = sample.__class__
        calendar = getattr(sample, "calendar", coord.attrs.get("calendar", "standard"))
        try:
            return cls(
                target.year,
                target.month,
                target.day,
                target.hour,
                target.minute,
                target.second,
                calendar=calendar,
            )
        except Exception as exc:
            logger.warning("Failed to coerce datetime for cftime coordinate: %s", exc)
            return target

    return target

def create_kerchunk_reference(url: str, output_path: str) -> str:
    """Create kerchunk reference file for cloud NetCDF/HDF5 data"""
    try:
        normalized_url = _normalize_s3_url(url)
        destination = Path(output_path)
        destination.parent.mkdir(parents=True, exist_ok=True)

        fs = fsspec.filesystem("s3", anon=S3_ANON)
        with fs.open(normalized_url, "rb") as f:
            h5chunks = kerchunk.hdf.SingleHdf5ToZarr(f, normalized_url)
            refs = h5chunks.translate()
        
        with destination.open("w") as f:
            json.dump(refs, f)
        
        return str(destination)
    except Exception as e:
        logger.error(f"Failed to create kerchunk reference: {e}")
        raise

async def open_cloud_dataset(metadata: pd.Series, start_date: datetime, end_date: datetime) -> xr.Dataset:
    """Open cloud-based dataset with optimizations"""
    
    cache_key = f"{metadata['datasetName']}_{start_date}_{end_date}"
    cached = dataset_cache.get(cache_key)
    if cached is not None:
        return cached
    
    try:
        engine = (metadata.get("engine") or "h5netcdf").lower()
        dataset_slug = _slugify(metadata.get("slug") or metadata.get("datasetName") or metadata.get("id", "dataset"))

        if engine == "zarr" and metadata.get("kerchunkPath"):
            kerchunk_hint = Path(str(metadata["kerchunkPath"]))
            kerchunk_file = kerchunk_hint if kerchunk_hint.is_absolute() else (KERCHUNK_PATH / kerchunk_hint.name)
            if not kerchunk_file.exists():
                source_url = _resolve_remote_asset(metadata, start_date)
                kerchunk_file_path = await asyncio.to_thread(
                    create_kerchunk_reference,
                    source_url,
                    str(kerchunk_file),
                )
                kerchunk_file = Path(kerchunk_file_path)
            
            ds = await asyncio.to_thread(
                xr.open_zarr,
                "reference://",
                storage_options={
                    "fo": str(kerchunk_file),
                    "remote_protocol": "s3",
                    "remote_options": {"anon": S3_ANON},
                    "asynchronous": False
                },
                consolidated=False
            )
        
        elif engine == "h5netcdf":
            kerchunk_hint = metadata.get("kerchunkPath")
            if kerchunk_hint:
                hint_path = Path(str(kerchunk_hint))
                kerchunk_file = hint_path if hint_path.is_absolute() else (KERCHUNK_PATH / hint_path.name)
            else:
                kerchunk_file = KERCHUNK_PATH / f"{dataset_slug}.json"

            kerchunk_file.parent.mkdir(parents=True, exist_ok=True)

            if not os.path.exists(kerchunk_file):
                source_url = _resolve_remote_asset(metadata, start_date)
                kerchunk_file = await asyncio.to_thread(
                    create_kerchunk_reference,
                    source_url,
                    str(kerchunk_file)
                )
            else:
                kerchunk_file = str(kerchunk_file)
            
            ds = await asyncio.to_thread(
                xr.open_zarr,
                "reference://",
                storage_options={
                    "fo": kerchunk_file,
                    "remote_protocol": "s3",
                    "remote_options": {"anon": S3_ANON},
                    "asynchronous": False
                },
                consolidated=False
            )
        
        else:
            fs = fsspec.filesystem("s3", anon=S3_ANON)
            resolved_url = _resolve_remote_asset(metadata, start_date)
            object_key = resolved_url[5:] if resolved_url.startswith("s3://") else resolved_url
            with fs.open(object_key, "rb") as f:
                ds = await asyncio.to_thread(
                    xr.open_dataset,
                    f,
                    engine=metadata["engine"],
                    use_cftime=True,
                )
        
        dataset_cache.set(cache_key, ds)
        return ds
        
    except Exception as e:
        logger.error(f"Failed to open cloud dataset {metadata['datasetName']}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to access cloud dataset: {metadata['datasetName']}"
        )

async def open_local_dataset(metadata: pd.Series) -> xr.Dataset:
    """Open local dataset with caching"""
    
    cache_key = metadata['datasetName']
    cached = dataset_cache.get(cache_key)
    if cached is not None:
        logger.info(f"Using cached dataset: {cache_key}")
        return cached
    
    try:
        input_file = metadata["inputFile"]
        if input_file.startswith("datasets/"):
            input_file = input_file.replace("datasets/", "", 1)
        
        file_path = os.path.join(LOCAL_DATASETS_PATH, input_file)
        logger.info(f"Attempting to open local dataset: {file_path}")
        
        if not os.path.exists(file_path):
            logger.error(f"Dataset file not found: {file_path}")
            raise FileNotFoundError(f"Local dataset not found: {file_path}")
        
        engine = metadata.get("engine", "h5netcdf")
        logger.info(f"Opening dataset with engine: {engine}")
        
        if engine == "zarr":
            try:
                ds = await asyncio.to_thread(xr.open_zarr, file_path, consolidated=True)
            except Exception:
                ds = await asyncio.to_thread(xr.open_zarr, file_path, consolidated=False)
        else:
            open_kwargs = {"engine": engine, "use_cftime": True}
            try:
                ds = await asyncio.to_thread(xr.open_dataset, file_path, **open_kwargs)
            except Exception as exc:
                if "unable to decode time units" in str(exc).lower():
                    logger.warning(
                        "Falling back to decode_times=False for dataset %s due to: %s",
                        metadata["datasetName"],
                        exc,
                    )
                    open_kwargs["decode_times"] = False
                    ds = await asyncio.to_thread(xr.open_dataset, file_path, **open_kwargs)
                else:
                    raise
        
        ds = _ensure_datetime_coordinates(ds)
        
        ds = _ensure_datetime_coordinates(ds)
        
        dataset_cache.set(cache_key, ds)
        return ds
        
    except Exception as e:
        logger.error(f"Failed to open local dataset {metadata['datasetName']}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to access local dataset: {metadata['datasetName']} - {str(e)}"
        )

# ============================================================================
# DATA PROCESSING FUNCTIONS
# ============================================================================

def normalize_coordinates(ds: xr.Dataset) -> tuple:
    """Find and normalize coordinate names"""
    coord_map = {c.lower(): c for c in ds.coords}
    
    lat_name = (
        coord_map.get("lat") or 
        coord_map.get("latitude") or 
        coord_map.get("lattitude") or
        coord_map.get("ylat")
    )
    lon_name = (
        coord_map.get("lon") or 
        coord_map.get("longitude") or 
        coord_map.get("long") or
        coord_map.get("xlon")
    )
    time_name = coord_map.get("time") or coord_map.get("date")
    
    return lat_name, lon_name, time_name

async def extract_time_series(
    ds: xr.Dataset,
    metadata: pd.Series,
    start_date: datetime,
    end_date: datetime,
    spatial_bounds: Optional[Dict[str, float]] = None,
    aggregation: AggregationMethod = AggregationMethod.MEAN,
    level_value: Optional[float] = None
) -> pd.Series:
    """Extract time series with advanced spatial selection"""
    
    lat_name, lon_name, time_name = normalize_coordinates(ds)
    
    ds_time = ds.sel({time_name: slice(start_date, end_date)})
    
    if spatial_bounds:
        if lat_name and lon_name:
            ds_spatial = ds_time.sel({
                lat_name: slice(spatial_bounds.get("lat_min", -90), 
                               spatial_bounds.get("lat_max", 90)),
                lon_name: slice(spatial_bounds.get("lon_min", -180), 
                               spatial_bounds.get("lon_max", 180))
            })
        else:
            ds_spatial = ds_time
    else:
        ds_spatial = ds_time
    
    var_name = metadata["keyVariable"]
    var = ds_spatial[var_name]
    
    if level_value is not None:
        level_dims = [d for d in var.dims if d not in (time_name, lat_name, lon_name)]
        if level_dims:
            var = var.sel({level_dims[0]: level_value}, method="nearest")
    
    spatial_dims = [d for d in var.dims if d != time_name]
    
    if aggregation == AggregationMethod.MEAN:
        result = var.mean(dim=spatial_dims)
    elif aggregation == AggregationMethod.MAX:
        result = var.max(dim=spatial_dims)
    elif aggregation == AggregationMethod.MIN:
        result = var.min(dim=spatial_dims)
    elif aggregation == AggregationMethod.SUM:
        result = var.sum(dim=spatial_dims)
    elif aggregation == AggregationMethod.MEDIAN:
        result = var.median(dim=spatial_dims)
    elif aggregation == AggregationMethod.STD:
        result = var.std(dim=spatial_dims)
    
    series = result.to_pandas()
    
    if not isinstance(series.index, pd.DatetimeIndex):
        series.index = pd.to_datetime(series.index)
    
    return series

def apply_analysis_model(
    series: pd.Series, 
    model: AnalysisModel,
    window: Optional[int] = None
) -> pd.Series:
    """Apply advanced analysis transformations"""
    
    if model == AnalysisModel.RAW:
        return series
    
    elif model == AnalysisModel.MOVING_AVG:
        window = window or 12
        return series.rolling(window=window, center=True, min_periods=1).mean()
    
    elif model == AnalysisModel.TREND:
        x = np.arange(len(series))
        y = series.values
        valid_mask = ~np.isnan(y)
        
        if valid_mask.sum() < 2:
            return series
        
        coeffs = np.polyfit(x[valid_mask], y[valid_mask], 1)
        trend = np.polyval(coeffs, x)
        return pd.Series(trend, index=series.index)
    
    elif model == AnalysisModel.ANOMALY:
        climatology = series.groupby([series.index.month, series.index.day]).mean()
        anomalies = series.copy()
        
        for idx in series.index:
            clim_key = (idx.month, idx.day)
            if clim_key in climatology:
                anomalies[idx] = series[idx] - climatology[clim_key]
        
        return anomalies
    
    elif model == AnalysisModel.SEASONAL:
        if len(series) < 24:
            return series
        
        from statsmodels.tsa.seasonal import seasonal_decompose
        try:
            decomposition = seasonal_decompose(series.dropna(), model='additive', period=12)
            return decomposition.seasonal
        except:
            return series
    
    elif model == AnalysisModel.CUMULATIVE:
        return series.cumsum()
    
    elif model == AnalysisModel.DERIVATIVE:
        return series.diff()
    
    return series

def calculate_statistics(series: pd.Series) -> Statistics:
    """Calculate comprehensive statistics for a time series"""
    
    valid_data = series.dropna()
    
    if len(valid_data) == 0:
        return Statistics(
            min=0, max=0, mean=0, median=0, std=0,
            trend=0, count=0, missing=len(series),
            percentiles={"25": 0, "50": 0, "75": 0}
        )
    
    x = np.arange(len(valid_data))
    y = valid_data.values
    if len(y) > 1:
        coeffs = np.polyfit(x, y, 1)
        trend = coeffs[0]
    else:
        trend = 0
    
    return Statistics(
        min=float(valid_data.min()),
        max=float(valid_data.max()),
        mean=float(valid_data.mean()),
        median=float(valid_data.median()),
        std=float(valid_data.std()),
        trend=float(trend),
        count=len(valid_data),
        missing=len(series) - len(valid_data),
        percentiles={
            "25": float(valid_data.quantile(0.25)),
            "50": float(valid_data.quantile(0.50)),
            "75": float(valid_data.quantile(0.75))
        }
    )

def generate_chart_config(
    datasets: List[str],
    chart_type: ChartType,
    metadata: Dict[str, DatasetMetadata]
) -> Dict[str, Any]:
    """Generate chart configuration for frontend visualization"""
    
    colors = [
        "#8884d8", "#82ca9d", "#ffc658", "#ff7c7c", "#8dd1e1",
        "#d084d0", "#ffb347", "#67b7dc", "#a4de6c", "#ffd93d"
    ]
    
    config = {
        "type": chart_type.value,
        "datasets": [],
        "options": {
            "responsive": True,
            "maintainAspectRatio": False,
            "interaction": {
                "mode": "index",
                "intersect": False
            },
            "scales": {
                "x": {
                    "type": "time",
                    "time": {
                        "displayFormats": {
                            "day": "MMM DD",
                            "month": "MMM YYYY",
                            "year": "YYYY"
                        }
                    }
                },
                "y": {
                    "beginAtZero": False
                }
            }
        }
    }
    
    for i, dataset_id in enumerate(datasets):
        if dataset_id in metadata:
            meta = metadata[dataset_id]
            config["datasets"].append({
                "id": dataset_id,
                "label": meta.name,
                "color": colors[i % len(colors)],
                "units": meta.units,
                "borderWidth": 2 if chart_type == ChartType.LINE else 0,
                "fill": chart_type == ChartType.AREA
            })
    
    return config

# ============================================================================
# API ENDPOINTS
# ============================================================================

app = FastAPI(
    title="Enhanced Climate Time Series API with Raster Visualization",
    description="Advanced API for extracting and processing climate time series data with 3D globe visualization",
    version="2.1.0",
    default_response_class=CustomJSONResponse
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js dev server
        "http://127.0.0.1:3000",  # Alternative localhost
        "*"  # Allow all in development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

router = APIRouter(prefix="/api/v2")

@router.post("/timeseries/extract", response_model=TimeSeriesResponse, response_class=CustomJSONResponse)
async def extract_timeseries(request: TimeSeriesRequest):
    """Extract and process time series data from multiple datasets"""
    
    start_time = datetime.now()
    
    try:
        start_date = datetime.strptime(request.startDate, "%Y-%m-%d")
        end_date = datetime.strptime(request.endDate, "%Y-%m-%d")
        
        metadata_df = get_metadata_by_ids(request.datasetIds)
        
        if len(metadata_df) == 0:
            raise HTTPException(
                status_code=404,
                detail="No datasets found with provided IDs"
            )
        
        tasks = []
        for _, meta_row in metadata_df.iterrows():
            is_local = meta_row["Stored"] == "local"
            
            if is_local:
                task = open_local_dataset(meta_row)
            else:
                task = open_cloud_dataset(meta_row, start_date, end_date)
            
            tasks.append((meta_row, task))
        
        all_series = {}
        dataset_metadata = {}
        statistics = {} if request.includeStatistics else None
        
        for meta_row, task in tasks:
            try:
                ds = await task
                
                level_value = None
                if meta_row.get("levelValues") and str(meta_row["levelValues"]).lower() != "none":
                    level_vals = [float(x) for x in str(meta_row["levelValues"]).split(",")]
                    level_value = np.median(level_vals)
                
                series = await extract_time_series(
                    ds, meta_row, start_date, end_date,
                    spatial_bounds=request.spatialBounds,
                    aggregation=request.aggregation,
                    level_value=level_value
                )
                
                series = apply_analysis_model(
                    series, 
                    request.analysisModel,
                    request.smoothingWindow
                )
                
                if request.normalize:
                    series_min = series.min()
                    series_max = series.max()
                    if series_max > series_min:
                        series = (series - series_min) / (series_max - series_min)
                
                if request.resampleFreq:
                    series = series.resample(request.resampleFreq).mean()
                
                dataset_id = meta_row["keyVariable"]
                all_series[dataset_id] = series
                
                if request.includeMetadata:
                    dataset_metadata[dataset_id] = DatasetMetadata(
                        id=meta_row["id"],
                        name=meta_row["datasetName"],
                        source=meta_row["sourceName"],
                        units=meta_row["units"],
                        spatialResolution=meta_row.get("spatialResolution"),
                        temporalResolution=meta_row.get("statistic", "Monthly"),
                        startDate=meta_row["startDate"],
                        endDate=meta_row["endDate"],
                        isLocal=meta_row["Stored"] == "local",
                        level=f"{level_value} {meta_row.get('levelUnits', '')}" if level_value else None,
                        description=meta_row.get("description")
                    )
                
                if request.includeStatistics:
                    statistics[dataset_id] = calculate_statistics(series)
                
            except Exception as e:
                logger.error(f"Error processing dataset {meta_row['datasetName']}: {e}")
                continue
        
        if not all_series:
            raise HTTPException(
                status_code=500,
                detail="Failed to extract data from any dataset"
            )
        
        common_index = None
        for series in all_series.values():
            if common_index is None:
                common_index = series.index
            else:
                common_index = common_index.intersection(series.index)
        
        data_points = []
        for timestamp in common_index:
            point = DataPoint(
                date=timestamp.strftime("%Y-%m-%d"),
                values={},
                timestamp=int(timestamp.timestamp())
            )
            
            for dataset_id, series in all_series.items():
                if timestamp in series.index:
                    value = series[timestamp]
                    point.values[dataset_id] = float(value) if not pd.isna(value) else None
            
            data_points.append(point)
        
        chart_config = None
        if request.chartType and dataset_metadata:
            chart_config = generate_chart_config(
                list(all_series.keys()),
                request.chartType,
                dataset_metadata
            )
        
        processing_time = (datetime.now() - start_time).total_seconds()
        processing_info = {
            "processingTime": f"{processing_time:.2f}s",
            "totalPoints": len(data_points),
            "datasetsProcessed": len(all_series),
            "dateRange": {
                "start": common_index[0].strftime("%Y-%m-%d") if len(common_index) > 0 else None,
                "end": common_index[-1].strftime("%Y-%m-%d") if len(common_index) > 0 else None
            },
            "analysisModel": request.analysisModel.value,
            "aggregation": request.aggregation.value
        }
        
        return TimeSeriesResponse(
            data=data_points,
            metadata=dataset_metadata if request.includeMetadata else None,
            statistics=statistics,
            chartConfig=chart_config,
            processingInfo=processing_info
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in extract_timeseries: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )

@router.post("/raster/visualize", response_class=CustomJSONResponse)
async def visualize_raster(request: RasterRequest):
    """
    Generate raster visualization for 3D globe display
    
    Returns base64-encoded PNG textures and metadata for Cesium rendering
    """
    start_time = datetime.now()
    
    try:
        # Parse date
        target_date = datetime.strptime(request.date, "%Y-%m-%d")
        
        # Get metadata
        metadata_df = get_metadata_by_ids([request.datasetId])
        
        if len(metadata_df) == 0:
            raise HTTPException(
                status_code=404,
                detail=f"Dataset not found: {request.datasetId}"
            )
        
        meta_row = metadata_df.iloc[0]
        
        # Open dataset
        is_local = meta_row["Stored"] == "local"
        
        if is_local:
            ds = await open_local_dataset(meta_row)
        else:
            ds = await open_cloud_dataset(meta_row, target_date, target_date)
        
        # Get the variable
        var_name = meta_row["keyVariable"]
        var = ds[var_name]
        
        # Find time dimension
        lat_name, lon_name, time_name = normalize_coordinates(ds)
        
        # Select the specific time
        if time_name in var.dims:
            selector_value = _coerce_time_value(target_date, ds[time_name])
            var = var.sel({time_name: selector_value}, method="nearest")
        
        # Select level if specified
        if request.level is not None:
            level_dims = [d for d in var.dims if d not in (time_name, lat_name, lon_name)]
            if level_dims:
                var = var.sel({level_dims[0]: request.level}, method="nearest")
        
        # Call raster serialization
        logger.info(f"Generating raster visualization for {meta_row['datasetName']}")
        raster_data = serialize_raster_array(var, meta_row, meta_row["datasetName"])
        
        # Add processing info
        processing_time = (datetime.now() - start_time).total_seconds()
        raster_data["processingInfo"] = {
            "processingTime": f"{processing_time:.2f}s",
            "date": request.date,
            "level": request.level,
            "datasetId": request.datasetId
        }
        
        logger.info(f"Raster visualization generated successfully in {processing_time:.2f}s")
        
        return raster_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating raster visualization: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate raster visualization: {str(e)}"
        )

@router.get("/timeseries/datasets", response_class=CustomJSONResponse)
async def list_available_datasets(
    stored: Optional[Literal["local", "cloud", "all"]] = "all",
    source: Optional[str] = None,
    search: Optional[str] = None
):
    """List all available datasets with filtering options"""
    try:
        with engine.connect() as conn:
            query = text("SELECT * FROM metadata")
            result = conn.execute(query)
            df = pd.DataFrame(result.fetchall(), columns=result.keys())
        
        if df.empty:
            return {
                "total": 0,
                "datasets": []
            }
        
        if stored != "all":
            if stored == "local":
                df = df[df["Stored"] == "local"]
            else:
                df = df[df["Stored"] == "cloud"]
        
        if source:
            df = df[df["sourceName"].str.contains(source, case=False, na=False)]
        
        if search:
            df = df[
                df["datasetName"].str.contains(search, case=False, na=False) |
                df["layerParameter"].str.contains(search, case=False, na=False) |
                df["slug"].str.contains(search, case=False, na=False)
            ]
        
        datasets = []
        for _, row in df.iterrows():
            datasets.append({
                "id": row["id"],
                "slug": row.get("slug"),
                "name": row["layerParameter"],
                "datasetName": row["datasetName"],
                "sourceName": row["sourceName"],
                "source": row["sourceName"],
                "type": row["datasetType"],
                "stored": row["Stored"],
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
                "valueMax": row.get("valueMax")
            })
        
        return {
            "total": len(datasets),
            "datasets": datasets
        }
        
    except Exception as e:
        logger.error(f"Error listing datasets: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list datasets: {str(e)}"
        )

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
            "cloudDatasets": True
        }
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
    logger.info("Starting Enhanced Climate Time Series API with Raster Visualization")
    logger.info(f"Local datasets path: {LOCAL_DATASETS_PATH}")
    logger.info(f"Cache directory: {CACHE_DIR}")
    logger.info(f"Database connected: {DATABASE_URL is not None}")
    logger.info("Features enabled: Time Series Extraction, Raster Visualization")

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
    print("🚀 Starting Enhanced Climate Time Series API with Raster Visualization...")
    print("📍 API will be available at: http://localhost:8000")
    print("📚 API docs at: http://localhost:8000/docs")
    print("🔧 Features:")
    print("   - Local and cloud dataset support")
    print("   - Advanced analysis models (trend, anomaly, seasonal)")
    print("   - Spatial filtering and aggregation")
    print("   - Multiple chart types")
    print("   - Data caching for performance")
    print("   - 🌍 Raster visualization for 3D globe display")
    print("   - Base64-encoded PNG textures for Cesium")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
