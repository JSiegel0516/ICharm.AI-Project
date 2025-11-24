"""
Enhanced FastAPI application for climate time series data extraction
Supports both local and cloud-based datasets with advanced processing capabilities
NOW WITH RASTER VISUALIZATION SUPPORT
"""

from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any, Literal
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
import time
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from concurrent.futures import ThreadPoolExecutor
import warnings
import ujson
import kerchunk.hdf
import kerchunk.combine
import cftime
import s3fs

# Import raster visualization module
from icharm.services.data.app.raster import serialize_raster_array

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


# Load environment variables from .env file in root folder
ROOT_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = ROOT_DIR.parent.parent
env_path = ROOT_DIR / ".env.local"
load_dotenv(dotenv_path=env_path)


def _resolve_env_path(
    value: Optional[str],
    default: str,
    ensure_exists: bool = False,
) -> Path:
    """Resolve environment paths relative to project structure when needed."""

    candidate_str = (value or default).strip()
    candidate = Path(candidate_str).expanduser()

    if not candidate.is_absolute():
        search_roots = [PROJECT_ROOT, ROOT_DIR, ROOT_DIR.parent]
        resolved = None
        for base in search_roots:
            attempt = (base / candidate).resolve()
            if attempt.exists():
                resolved = attempt
                break
        if resolved is None:
            resolved = (PROJECT_ROOT / candidate).resolve()
        candidate = resolved

    if ensure_exists:
        candidate.mkdir(parents=True, exist_ok=True)

    return candidate


# ============================================================================
# CONFIGURATION
# ============================================================================

# Database configuration
POSTRGRES_URL = os.getenv("POSTGRES_URL")
if not POSTRGRES_URL:
    raise ValueError(
        f"POSTRGRES_URL not found in environment variables. "
        f"Please create a .env file at {env_path} with POSTRGRES_URL=postgresql://..."
    )

# File paths configuration
LOCAL_DATASETS_PATH = _resolve_env_path(
    os.getenv("LOCAL_DATASETS_PATH"), "datasets", ensure_exists=True
)
KERCHUNK_PATH = _resolve_env_path(
    os.getenv("KERCHUNK_PATH"), "kerchunk", ensure_exists=True
)
CACHE_DIR = _resolve_env_path(
    os.getenv("CACHE_DIR"), "/tmp/climate_cache", ensure_exists=True
)

# AWS S3 configuration (for cloud datasets)
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
S3_ANON = os.getenv("S3_ANONYMOUS", "true").lower() == "true"

# Create cache directory if it doesn't exist
Path(CACHE_DIR).mkdir(parents=True, exist_ok=True)

# Thread pool for parallel processing
executor = ThreadPoolExecutor(max_workers=4)

try:
    ZERO_PRECIP_MASK_TOLERANCE = float(os.getenv("ZERO_PRECIP_MASK_TOLERANCE", "1e-6"))
except ValueError:
    ZERO_PRECIP_MASK_TOLERANCE = 1e-6

# ============================================================================
# DATABASE CONNECTION
# ============================================================================

# Create synchronous engine
engine = create_engine(POSTRGRES_URL, poolclass=NullPool)


def get_metadata_by_ids(dataset_ids: List[str]) -> pd.DataFrame:
    """Fetch metadata from database for specified dataset IDs (UUIDs)"""
    try:
        with engine.connect() as conn:
            placeholders = ", ".join([f":id{i}" for i in range(len(dataset_ids))])
            # Query by UUID id column instead of datasetName
            query = text(f"""
                SELECT * FROM metadata
                WHERE id IN ({placeholders})
            """)

            params = {f"id{i}": dataset_id for i, dataset_id in enumerate(dataset_ids)}

            result = conn.execute(query, params)
            df = pd.DataFrame(result.fetchall(), columns=result.keys())

            if df.empty:
                logger.warning(f"No metadata found for dataset IDs: {dataset_ids}")

            return df
    except Exception as e:
        logger.error(f"Database query failed: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch metadata from database: {str(e)}"
        )


def dataset_supports_zero_mask(metadata: pd.Series) -> bool:
    """Return True when dataset represents precipitation-style fields (e.g., CMORPH)."""
    target_fields = [
        str(metadata.get("datasetName") or ""),
        str(metadata.get("datasetType") or ""),
        str(metadata.get("layerParameter") or ""),
        str(metadata.get("keyVariable") or ""),
        str(metadata.get("slug") or ""),
    ]
    combined = " ".join(target_fields).lower()
    return "cmorph" in combined or "precip" in combined


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

    datasetIds: List[str] = Field(..., min_length=1, max_length=10)
    startDate: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    endDate: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    analysisModel: AnalysisModel = AnalysisModel.RAW
    normalize: Optional[bool] = False
    chartType: Optional[ChartType] = ChartType.LINE
    spatialBounds: Optional[Dict[str, float]] = None
    aggregation: AggregationMethod = AggregationMethod.MEAN
    resampleFreq: Optional[str] = None
    includeStatistics: Optional[bool] = True
    includeMetadata: Optional[bool] = True
    smoothingWindow: Optional[int] = None
    focusCoordinates: Optional[str] = (
        None  # NEW: e.g., "40.7128,-74.0060; 34.0522,-118.2437"
    )

    @validator("endDate")
    def validate_date_range(cls, v, values):
        if "startDate" in values:
            start = datetime.strptime(values["startDate"], "%Y-%m-%d")
            end = datetime.strptime(v, "%Y-%m-%d")
            if end < start:
                raise ValueError("endDate must be after startDate")
            if (end - start).days > 365 * 50:  # Max 50 years
                raise ValueError("Date range cannot exceed 50 years")
        return v


class RasterRequest(BaseModel):
    """Request model for raster visualization"""

    datasetId: str = Field(..., description="Dataset UUID")
    date: str = Field(
        ..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="Date for visualization"
    )
    level: Optional[float] = Field(
        None, description="Atmospheric level (if applicable)"
    )
    cssColors: Optional[List[str]] = Field(
        None, description="CSS color strings from frontend ColorBar"
    )
    maskZeroValues: bool = Field(
        False,
        description="Hide exact zero values (used for CMORPH/local precipitation datasets)",
    )


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
    slug: Optional[str] = None
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
        self.cache: dict[str, Any] = {}
        self.max_size = max_size
        self.access_times: dict[Any, Any] = {}

    def get(self, key: str) -> Optional[xr.Dataset]:
        if key in self.cache:
            self.access_times[key] = datetime.now()
            return self.cache[key]
        return None

    def set(self, key: str, dataset: xr.Dataset):
        if len(self.cache) >= self.max_size:
            # Remove least recently used
            oldest = min(self.access_times, key=self.access_times.__getitem__)
            del self.cache[oldest]
            del self.access_times[oldest]

        self.cache[key] = dataset
        self.access_times[key] = datetime.now()

    def clear(self):
        for ds in self.cache.values():
            try:
                ds.close()
            except:  # noqa E722
                pass
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
        raise ValueError(
            f"No inputFile configured for dataset {metadata.get('datasetName')}"
        )

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


def parse_focus_coordinates(coord_string: Optional[str]) -> List[Dict[str, float]]:
    """
    Parse focus coordinates string into list of lat/lon dicts

    Format: "lat1,lon1; lat2,lon2; lat3,lon3"
    Example: "40.7128,-74.0060; 34.0522,-118.2437"

    Returns: [{"lat": 40.7128, "lon": -74.0060}, {"lat": 34.0522, "lon": -118.2437}]
    """
    if not coord_string or not coord_string.strip():
        return []

    coordinates = []

    try:
        # Split by semicolon for multiple coordinate pairs
        pairs = coord_string.split(";")

        for pair in pairs:
            pair = pair.strip()
            if not pair:
                continue

            # Split by comma for lat,lon
            parts = pair.split(",")
            if len(parts) != 2:
                logger.warning(f"Invalid coordinate pair format: {pair}")
                continue

            try:
                lat = float(parts[0].strip())
                lon = float(parts[1].strip())

                # Validate ranges
                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    coordinates.append({"lat": lat, "lon": lon})
                else:
                    logger.warning(f"Coordinate out of range: lat={lat}, lon={lon}")
            except ValueError:
                logger.warning(f"Could not parse coordinates: {pair}")
                continue

        logger.info(f"Parsed {len(coordinates)} valid coordinate pairs")
        return coordinates

    except Exception as e:
        logger.error(f"Error parsing focus coordinates: {e}")
        return []


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


def expand_date_pattern(
    url_pattern: str, start_date: datetime, end_date: datetime
) -> List[str]:
    """Expand URL pattern with date wildcards into list of URLs"""
    urls = []
    current = start_date

    while current <= end_date:
        url = url_pattern.format(
            year=current.year, month=current.month, day=current.day
        )
        urls.append(url)

        # Increment based on pattern granularity
        if "{day" in url_pattern:
            current += timedelta(days=1)
        elif "{month" in url_pattern:
            # Move to first day of next month
            if current.month == 12:
                current = datetime(current.year + 1, 1, 1)
            else:
                current = datetime(current.year, current.month + 1, 1)
        else:
            current = datetime(current.year + 1, 1, 1)

    return urls


async def load_kerchunk_reference(kerchunk_path: str) -> Dict:
    """Load kerchunk reference file with multiple fallback methods"""
    try:
        # Try ujson first (fastest)
        with open(kerchunk_path, "r") as f:
            refs = ujson.load(f)
            logger.info(
                f"Loaded kerchunk reference with ujson: {len(refs.get('refs', {}))} refs"
            )
            return refs
    except Exception as ujson_error:
        logger.warning(f"ujson failed, trying standard json: {ujson_error}")
        try:
            # Fallback to standard json
            with open(kerchunk_path, "r") as f:
                refs = json.load(f)
                logger.info(
                    f"Loaded kerchunk reference with json: {len(refs.get('refs', {}))} refs"
                )
                return refs
        except Exception as e:
            logger.error(f"Failed to load kerchunk reference {kerchunk_path}: {e}")
            raise


def _open_cmorph_dataset(
    metadata: pd.Series, start_date: datetime, end_date: datetime
) -> xr.Dataset:
    """
    Open CMORPH precipitation data by mirroring the reference implementation in cmorph_test.py.
    Aggregates all daily NetCDF files for the requested month(s) and returns an in-memory dataset.
    """
    base_path = str(metadata.get("inputFile") or "").rstrip("/")
    if not base_path:
        raise ValueError("CMORPH dataset inputFile is missing.")

    if base_path.startswith("s3://"):
        glob_base = base_path[len("s3://") :]  # noqa E203
    else:
        glob_base = base_path

    fs = s3fs.S3FileSystem(anon=S3_ANON)

    month_keys: List[tuple[int, int]] = []
    cursor = datetime(start_date.year, start_date.month, 1)
    end_marker = datetime(end_date.year, end_date.month, 1)
    while cursor <= end_marker:
        month_keys.append((cursor.year, cursor.month))
        # advance to first day next month
        if cursor.month == 12:
            cursor = datetime(cursor.year + 1, 1, 1)
        else:
            cursor = datetime(cursor.year, cursor.month + 1, 1)

    file_urls: List[str] = []
    for year, month in month_keys:
        pattern = f"{glob_base}/{year:04d}/{month:02d}/*.nc"
        matches = fs.glob(pattern)
        if matches:
            for match in matches:
                file_urls.append(
                    match if match.startswith("s3://") else f"s3://{match}"
                )

    if not file_urls:
        raise FileNotFoundError(
            f"No CMORPH NetCDF files found for {metadata['datasetName']} between "
            f"{start_date.date()} and {end_date.date()} (searched under {glob_base})."
        )

    engine = (metadata.get("engine") or "h5netcdf").lower()
    open_files = [fs.open(url, mode="rb") for url in file_urls]

    ds: Optional[xr.Dataset] = None
    try:
        ds = xr.open_mfdataset(
            open_files,
            engine=engine,
            combine="by_coords",
            parallel=False,
            chunks={"time": 1},
        )
        loaded = ds.load()
        return loaded
    finally:
        if ds is not None:
            try:
                ds.close()
            except Exception:
                pass
        for handle in open_files:
            try:
                handle.close()
            except Exception:
                pass


def _open_ndvi_dataset(metadata: pd.Series, target_date: datetime) -> xr.Dataset:
    """
    Open NDVI CDR data for a specific day using the same approach as the reference cmorph loader.
    """
    template = (metadata.get("inputFile") or "").strip()
    if not template:
        raise ValueError("NDVI dataset inputFile is missing.")

    filled = template.format(
        year=target_date.year,
        month=target_date.month,
        day=target_date.day,
    )

    if filled.startswith("s3://"):
        glob_path = filled[len("s3://") :]  # noqa E203
    else:
        glob_path = filled

    fs = s3fs.S3FileSystem(anon=S3_ANON)
    matches = sorted(fs.glob(glob_path))
    if not matches:
        raise FileNotFoundError(
            f"No NDVI files found for {target_date.strftime('%Y-%m-%d')} using pattern {glob_path}"
        )

    key = matches[0]
    engine = (metadata.get("engine") or "h5netcdf").lower()

    with fs.open(key, mode="rb") as handle:
        ds = xr.open_dataset(handle, engine=engine)
        loaded = ds.load()

    if "time" in loaded.coords:
        try:
            loaded = loaded.sel(time=target_date, method="nearest")
        except Exception:
            pass

    return loaded


def _apply_monthly_sampling(
    ds: xr.Dataset, start_date: datetime, end_date: datetime
) -> xr.Dataset:
    """If date range > 1 year, filter dataset to same day of month for each month."""
    date_range = end_date - start_date
    logger.debug(
        f"[DEBUG] _apply_monthly_sampling called: date_range={date_range.days} days, "
        f"has_time_dim={'time' in ds.dims}"
    )
    if date_range <= timedelta(days=390) or "time" not in ds.dims:
        logger.debug(
            "[DEBUG] _apply_monthly_sampling: skipping (range <= 365 days or no time dim)"
        )
        return ds

    logger.info(
        f"[MONTHLY_SAMPLING] Date range > 1 year ({date_range.days} days), sampling same day of month for each month"
    )
    sample_day = start_date.day
    sample_dates = []
    current = datetime(start_date.year, start_date.month, 1)

    while current <= end_date:
        try:
            sample_date = current.replace(day=sample_day)
            if sample_date < start_date:
                if current.month == 12:
                    current = datetime(current.year + 1, 1, 1)
                else:
                    current = datetime(current.year, current.month + 1, 1)
                continue
            if sample_date <= end_date:
                sample_dates.append(sample_date)
        except ValueError:
            if current.month == 12:
                next_month = datetime(current.year + 1, 1, 1)
            else:
                next_month = datetime(current.year, current.month + 1, 1)
            sample_date = next_month - timedelta(days=1)
            if start_date <= sample_date <= end_date:
                sample_dates.append(sample_date)

        if current.month == 12:
            current = datetime(current.year + 1, 1, 1)
        else:
            current = datetime(current.year, current.month + 1, 1)

    if not sample_dates:
        return ds

    logger.info(f"Filtering dataset to {len(sample_dates)} monthly sample dates")
    time_coord = ds.time
    time_mask = np.zeros(len(time_coord), dtype=bool)

    for sample_date in sample_dates:
        try:
            if hasattr(time_coord.values[0], "year"):
                time_diffs = [
                    abs(
                        (t - sample_date).total_seconds()
                        if hasattr(t, "total_seconds")
                        else abs(t.year - sample_date.year) * 365
                        + abs(t.month - sample_date.month) * 30
                        + abs(t.day - sample_date.day)
                    )
                    for t in time_coord.values
                ]
            else:
                time_diffs = [
                    abs((pd.Timestamp(t) - pd.Timestamp(sample_date)).total_seconds())
                    for t in time_coord.values
                ]
            closest_idx = np.argmin(time_diffs)
            time_mask[closest_idx] = True
        except Exception as e:
            logger.warning(f"Could not match sample date {sample_date}: {e}")

    if time_mask.any():
        ds = ds.isel(time=time_mask)
        logger.info(
            f"[MONTHLY_SAMPLING] Filtered dataset to {np.sum(time_mask)} time points"
        )
        logger.debug(
            f"[DEBUG] Monthly sampling applied: {np.sum(time_mask)}/{len(time_mask)} time points selected"
        )
    else:
        logger.warning("[MONTHLY_SAMPLING] No time points matched for monthly sampling")

    return ds


async def open_cloud_dataset(
    metadata: pd.Series, start_date: datetime, end_date: datetime
) -> xr.Dataset:
    """Open cloud-based dataset using S3 or pre-built kerchunk references."""
    start_time = time.perf_counter()
    dataset_name = metadata.get("datasetName", "Unknown")
    logger.info(
        f"[TIMING] open_cloud_dataset START: {dataset_name}, "
        f"date range: {start_date.date()} to {end_date.date()}"
    )

    cache_key = f"{metadata['id']}_{start_date.date()}_{end_date.date()}"
    cache_check_start = time.perf_counter()
    cached = dataset_cache.get(cache_key)
    cache_check_time = time.perf_counter()
    if cached is not None:
        logger.info(f"Using cached cloud dataset: {cache_key}")
        logger.info(
            f"[TIMING] open_cloud_dataset TOTAL (cached): {cache_check_time - start_time:.3f}s"
        )
        return cached
    logger.info(
        f"[TIMING] Cache check took {cache_check_time - cache_check_start:.3f}s"
    )

    try:
        input_file = str(metadata["inputFile"])
        engine = str(metadata.get("engine", "h5netcdf")).lower()

        if engine == "zarr" and input_file.lower().endswith(".nc"):
            logger.warning(
                "Dataset %s declares engine=zarr but input is NetCDF; switching to h5netcdf",
                metadata.get("datasetName"),
            )
            engine = "h5netcdf"

        logger.info(f"Opening cloud dataset: {metadata['datasetName']}")
        logger.info(f"Input file: {input_file}")
        logger.info(f"Engine: {engine}")

        dataset_name = str(metadata.get("datasetName") or "")
        normalized_name = dataset_name.lower().strip()

        # TLS keeps its special-case loader behaviour (bucket listing + kerchunk)
        if normalized_name == "mean layer temperature - noaa cdr":
            logger.info(
                "Using HDF5 loader for Mean Layer Temperature - NOAA CDR dataset"
            )
            engine = "h5netcdf"

        # NDVI keeps its own loader (very custom pattern)
        if normalized_name == "normalized difference vegetation index cdr":
            logger.info("Using NDVI-specific loader")
            ndvi_start = time.perf_counter()
            ds = await asyncio.to_thread(_open_ndvi_dataset, metadata, start_date)
            ndvi_open_time = time.perf_counter()
            logger.info(
                f"[TIMING] NDVI dataset open took {ndvi_open_time - ndvi_start:.3f}s"
            )
            # keep monthly-sampling behavior for NDVI
            sampling_start = time.perf_counter()
            ds = _apply_monthly_sampling(ds, start_date, end_date)
            sampling_time = time.perf_counter()
            logger.info(
                f"[TIMING] Monthly sampling took {sampling_time - sampling_start:.3f}s"
            )
            dataset_cache.set(cache_key, ds)
            total_time = time.perf_counter() - start_time
            logger.info(
                f"[TIMING] open_cloud_dataset TOTAL (NDVI path): {total_time:.3f}s"
            )
            return ds

        # ------------------------------------------------------------------
        # Kerchunk hint (now fully driven by DB metadata)
        # ------------------------------------------------------------------
        kerchunk_hint = (metadata.get("kerchunkPath") or "").strip()

        def _kerchunk_local_path() -> Optional[Path]:
            """Resolve kerchunkPath -> local JSON inside container."""
            if not kerchunk_hint or kerchunk_hint.lower() in ("none", "null"):
                return None

            cleaned = kerchunk_hint.lstrip("/\\")
            if cleaned.startswith("kerchunk/"):
                cleaned = cleaned[len("kerchunk/") :]  # noqa: E203

            # Try KERCHUNK_PATH first
            try:
                if KERCHUNK_PATH.exists():
                    path = KERCHUNK_PATH / cleaned
                    path.parent.mkdir(parents=True, exist_ok=True)
                    if os.access(path.parent, os.W_OK):
                        logger.info(f"Using KERCHUNK_PATH for kerchunk: {path}")
                        return path
            except (OSError, PermissionError) as e:
                logger.warning(f"KERCHUNK_PATH not writable: {e}")

            # Fallback to CACHE_DIR/kerchunk
            path = CACHE_DIR / "kerchunk" / cleaned
            logger.info(f"Using CACHE_DIR for kerchunk: {path}")
            path.parent.mkdir(parents=True, exist_ok=True)
            return path

        # ------------------------------------------------------------------
        # Generic cloud logic (for everything, incl. TLS fallback)
        # ------------------------------------------------------------------
        # Resolve concrete S3 object keys for requested date range
        if "{" in input_file:
            expanded = expand_date_pattern(input_file, start_date, end_date)
        else:
            expanded = [input_file]

        fs = fsspec.filesystem("s3", anon=S3_ANON)

        candidate_urls: List[str] = []
        for candidate in expanded:
            normalized = _normalize_s3_url(candidate)
            if "*" in normalized or "?" in normalized:
                glob_target = (
                    normalized[5:] if normalized.startswith("s3://") else normalized
                )
                matches = fs.glob(glob_target)
                candidate_urls.extend(
                    [m if m.startswith("s3://") else f"s3://{m}" for m in matches]
                )
            else:
                candidate_urls.append(normalized)

        # TLS special case: if nothing resolved, try to list bucket
        if (
            not candidate_urls
            and normalized_name == "mean layer temperature - noaa cdr"
        ):
            logger.info(
                "No valid TLS assets resolved; listing bucket for latest available file"
            )
            try:
                prefix = "noaa-cdr-mean-layer-temp-pds/data/"
                entries = fs.ls(prefix)
                tls_candidates = sorted(
                    entry
                    for entry in entries
                    if entry.lower().endswith(".nc") and "tls" in entry.lower()
                )
                if tls_candidates:
                    latest = tls_candidates[-1]
                    logger.info(f"Using latest TLS asset: {latest}")
                    candidate_urls = [
                        latest if latest.startswith("s3://") else f"s3://{latest}"
                    ]
            except Exception as e:
                logger.warning("Failed to enumerate TLS assets in bucket: %s", e)

        if not candidate_urls:
            raise FileNotFoundError(
                f"No remote assets resolved for dataset {metadata['datasetName']} between "
                f"{start_date.date()} and {end_date.date()}"
            )

        # Deduplicate while preserving order
        seen = set()
        unique_urls: List[str] = []
        for url in candidate_urls:
            if url not in seen:
                seen.add(url)
                unique_urls.append(url)
        candidate_urls = unique_urls

        # Verify assets exist; drop stale entries
        verified_urls: List[str] = []
        for url in candidate_urls:
            check_path = url[5:] if url.startswith("s3://") else url
            try:
                fs.info(check_path)
                verified_urls.append(url)
            except FileNotFoundError:
                logger.warning("Remote asset not found: %s", url)

        candidate_urls = verified_urls

        if not candidate_urls:
            raise FileNotFoundError(
                f"No accessible remote assets located for dataset {metadata['datasetName']}"
            )

        # Keep processing manageable when using direct NetCDF access
        max_files = 12
        if len(candidate_urls) > max_files:
            logger.warning(
                f"Resolved {len(candidate_urls)} files for {metadata['datasetName']}; "
                f"limiting to first {max_files}"
            )
            candidate_urls = candidate_urls[:max_files]

        # ------------------------------------------------------------------
        # Engine-specific handling (zarr / NetCDF via h5netcdf / other)
        # This will automatically use pre-built kerchunk JSON if kerchunkPath is set
        # ------------------------------------------------------------------
        if engine == "zarr":
            asset_url = candidate_urls[0]
            local_ref = _kerchunk_local_path()

            if local_ref:
                if not local_ref.exists():
                    logger.info(
                        f"Kerchunk reference missing for {metadata['datasetName']}, creating: {local_ref}"
                    )
                    try:
                        await asyncio.to_thread(
                            create_kerchunk_reference, asset_url, str(local_ref)
                        )
                    except (OSError, PermissionError) as e:
                        logger.error(f"Failed to create kerchunk reference: {e}")
                        logger.info("Falling back to direct S3 access without kerchunk")
                        local_ref = None

                if local_ref and local_ref.exists():
                    ds = await asyncio.to_thread(
                        xr.open_dataset,
                        "reference://",
                        engine="zarr",
                        backend_kwargs={"consolidated": False},
                        storage_options={
                            "fo": str(local_ref),
                            "remote_protocol": "s3",
                            "remote_options": {"anon": S3_ANON},
                            "asynchronous": False,
                        },
                    )
                else:
                    logger.warning("Kerchunk unavailable, using direct zarr access")
                    ds = await asyncio.to_thread(
                        xr.open_zarr,
                        asset_url,
                        consolidated=True,
                        storage_options={"anon": S3_ANON},
                    )

        elif engine == "h5netcdf":
            local_ref = _kerchunk_local_path()

            if local_ref:
                if not local_ref.exists():
                    logger.info(
                        f"Generating kerchunk reference for {metadata['datasetName']} at {local_ref}"
                    )
                    try:
                        await asyncio.to_thread(
                            create_kerchunk_reference, candidate_urls[0], str(local_ref)
                        )
                    except (OSError, PermissionError) as e:
                        logger.error(f"Failed to create kerchunk reference: {e}")
                        logger.info("Falling back to direct S3 access without kerchunk")
                        local_ref = None

                if local_ref and local_ref.exists():
                    ds = await asyncio.to_thread(
                        xr.open_dataset,
                        "reference://",
                        engine="zarr",
                        backend_kwargs={"consolidated": False},
                        storage_options={
                            "fo": str(local_ref),
                            "remote_protocol": "s3",
                            "remote_options": {"anon": S3_ANON},
                            "asynchronous": False,
                        },
                    )
                else:
                    logger.warning("Kerchunk unavailable, using direct NetCDF access")
                    datasets = []
                    for url in candidate_urls:
                        logger.info(f"Opening S3 object {url}")
                        url_clean = url[5:] if url.startswith("s3://") else url

                        def _load():
                            with fs.open(url_clean, mode="rb") as s3_file:
                                ds_single = xr.open_dataset(s3_file, engine="h5netcdf")
                                return ds_single.load()

                        ds_single = await asyncio.to_thread(_load)
                        datasets.append(ds_single)

                    if len(datasets) == 1:
                        ds = datasets[0]
                    else:
                        logger.info(
                            f"Concatenating {len(datasets)} netCDF parts for {metadata['datasetName']}"
                        )
                        ds = await asyncio.to_thread(
                            xr.concat, datasets, dim="time", combine_attrs="override"
                        )
        else:
            asset_url = candidate_urls[0]
            ds = await asyncio.to_thread(
                xr.open_dataset,
                asset_url,
                engine=engine,
                storage_options={"anon": S3_ANON},
            )

        logger.info(f"✅ Successfully opened: {metadata['datasetName']}")
        logger.info(f"   Dimensions: {dict(ds.dims)}")
        logger.info(f"   Variables: {list(ds.data_vars)}")

        # keep monthly sampling behavior for all generic cloud datasets
        sampling_start = time.perf_counter()
        ds = _apply_monthly_sampling(ds, start_date, end_date)
        sampling_time = time.perf_counter()
        logger.info(
            f"[TIMING] Monthly sampling took {sampling_time - sampling_start:.3f}s"
        )

        dataset_cache.set(cache_key, ds)
        total_time = time.perf_counter() - start_time
        # Check if kerchunk was used (local_ref is only defined for zarr/h5netcdf engines)
        try:
            kerchunk_used = (
                "kerchunk path" if local_ref and local_ref.exists() else "direct path"
            )
        except NameError:
            kerchunk_used = "direct path"
        logger.info(
            f"[TIMING] open_cloud_dataset TOTAL ({kerchunk_used}): {total_time:.3f}s"
        )
        return ds

    except Exception as e:
        total_time = time.perf_counter() - start_time
        logger.error(f"Failed to open cloud dataset {metadata['datasetName']}: {e}")
        logger.error(f"Error type: {type(e).__name__}")
        logger.info(f"[TIMING] open_cloud_dataset FAILED after {total_time:.3f}s")
        import traceback

        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to access cloud dataset '{metadata['datasetName']}': {str(e)}",
        )


async def open_local_dataset(metadata: pd.Series) -> xr.Dataset:
    """Open local dataset with caching"""
    start_time = time.perf_counter()
    dataset_name = metadata.get("datasetName", "Unknown")
    logger.info(f"[TIMING] open_local_dataset START: {dataset_name}")

    cache_key = metadata["datasetName"]
    cache_check_start = time.perf_counter()
    cached = dataset_cache.get(cache_key)
    cache_check_time = time.perf_counter()
    if cached is not None:
        logger.info(f"Using cached dataset: {cache_key}")
        total_time = time.perf_counter() - start_time
        logger.info(f"[TIMING] open_local_dataset TOTAL (cached): {total_time:.3f}s")
        return cached
    logger.info(
        f"[TIMING] Cache check took {cache_check_time - cache_check_start:.3f}s"
    )

    try:
        input_file = metadata["inputFile"]
        if input_file.startswith("datasets/"):
            input_file = input_file.replace("datasets/", "", 1)

        file_path = os.path.join(LOCAL_DATASETS_PATH, input_file)
        logger.info(f"Attempting to open local dataset: {file_path}")

        if not os.path.exists(file_path):
            logger.error(f"Dataset file not found: {file_path}")
            raise FileNotFoundError(f"Local dataset not found: {file_path}")

        engine = (metadata.get("engine") or "h5netcdf").lower()
        path_obj = Path(file_path)
        dataset_name = metadata["datasetName"]

        if engine == "zarr":
            if path_obj.is_dir():
                zmetadata = path_obj / ".zmetadata"
                zarr_json = path_obj / "zarr.json"

                # Check for REAL Zarr store (has consolidated metadata)
                if zmetadata.exists():
                    logger.info(f"Opening real Zarr v2 store: {dataset_name}")
                    ds = await asyncio.to_thread(
                        xr.open_zarr, str(path_obj), consolidated=True
                    )

                # Check for Zarr v3 or Kerchunk reference
                elif zarr_json.exists():
                    try:
                        with open(zarr_json, "r") as f:
                            zarr_content = json.load(f)

                        # Kerchunk reference (Zarr v2 style with "refs")
                        if "refs" in zarr_content:
                            logger.info(
                                f"Opening Kerchunk reference (v2 style): {dataset_name}"
                            )
                            ds = await asyncio.to_thread(
                                xr.open_dataset,
                                "reference://",
                                engine="zarr",
                                backend_kwargs={"consolidated": False},
                                storage_options={
                                    "fo": str(zarr_json),
                                    "asynchronous": False,
                                },
                            )
                        # Check if this is a true Zarr v3 store with consolidated metadata
                        elif (
                            zarr_content.get("node_type") == "group"
                            and zarr_content.get("zarr_format") == 3
                        ):
                            # Check if it has consolidated_metadata with actual data arrays
                            consolidated_meta = zarr_content.get(
                                "consolidated_metadata", {}
                            )
                            metadata_info = consolidated_meta.get("metadata", {})

                            # If it has consolidated metadata with array definitions, it's a real store
                            if metadata_info and any(
                                "shape" in arr_info
                                for arr_info in metadata_info.values()
                            ):
                                logger.info(
                                    f"Opening Zarr v3 store with consolidated metadata: {dataset_name}"
                                )
                                try:
                                    ds = await asyncio.to_thread(
                                        xr.open_zarr,
                                        str(path_obj),
                                        consolidated=True,
                                        decode_times=True,
                                    )
                                except (ValueError, OSError) as time_error:
                                    if (
                                        "decode time" in str(time_error).lower()
                                        or "time units" in str(time_error).lower()
                                    ):
                                        logger.warning(
                                            f"Time decoding failed for {dataset_name}, retrying with decode_times=False"
                                        )
                                        ds = await asyncio.to_thread(
                                            xr.open_zarr,
                                            str(path_obj),
                                            consolidated=True,
                                            decode_times=False,
                                        )
                                        # Manually decode time if needed
                                        ds = _ensure_datetime_coordinates(ds)
                                    else:
                                        raise
                            else:
                                # This is a metadata-only Kerchunk reference
                                logger.warning(
                                    f"Detected Zarr v3 metadata-only file for {dataset_name}"
                                )
                                logger.warning(
                                    "This appears to be a Kerchunk reference without data arrays"
                                )
                                logger.info("Falling back to NetCDF file...")
                                raise ValueError(
                                    "Zarr v3 metadata-only file (no data arrays)"
                                )
                        else:
                            # Try as regular Zarr v3 store
                            logger.info(f"Attempting Zarr v3 store: {dataset_name}")
                            ds = await asyncio.to_thread(
                                xr.open_zarr, str(path_obj), consolidated=False
                            )

                    except (json.JSONDecodeError, ValueError) as e:
                        logger.warning(f"Failed to open as Zarr/Kerchunk: {e}")
                        raise

                else:
                    # No metadata files - try unconsolidated Zarr
                    logger.info(f"Attempting unconsolidated Zarr: {dataset_name}")
                    ds = await asyncio.to_thread(
                        xr.open_zarr, str(path_obj), consolidated=False
                    )

                # Verify dataset has variables
                if len(ds.data_vars) == 0:
                    logger.error(f"Zarr store {dataset_name} has no variables!")
                    raise ValueError("Empty Zarr store")

                logger.info(f"✓ Successfully opened Zarr: {list(ds.data_vars)}")

            else:
                logger.warning(f"Zarr path is not a directory: {path_obj}")
                raise ValueError("Not a Zarr directory")
        else:
            # NetCDF engine - TRY WITH decode_times=True first, fallback to False
            try:
                ds = await asyncio.to_thread(
                    xr.open_dataset, str(path_obj), engine=engine, decode_times=True
                )
                logger.info(
                    f"✓ Successfully opened with {engine} (decode_times=True): {list(ds.data_vars)}"
                )
            except (ValueError, OSError) as time_error:
                # Time decoding failed - try without decoding
                if (
                    "decode time" in str(time_error).lower()
                    or "cftime" in str(time_error).lower()
                ):
                    logger.warning(
                        f"Time decoding failed for {dataset_name}, retrying with decode_times=False"
                    )
                    ds = await asyncio.to_thread(
                        xr.open_dataset,
                        str(path_obj),
                        engine=engine,
                        decode_times=False,
                    )

                    # Manually decode time if needed
                    ds = _ensure_datetime_coordinates(ds)

                    logger.info(
                        f"✓ Successfully opened with {engine} (decode_times=False): {list(ds.data_vars)}"
                    )
                else:
                    raise

        dataset_cache.set(cache_key, ds)
        total_time = time.perf_counter() - start_time
        logger.info(f"[TIMING] open_local_dataset TOTAL: {total_time:.3f}s")
        return ds

    except (ValueError, FileNotFoundError, KeyError) as e:
        # FALLBACK: Try NetCDF file
        logger.warning(f"Primary method failed for {metadata['datasetName']}: {e}")

        # Find corresponding .nc file
        nc_path = path_obj.with_suffix(".nc")

        logger.info(f"🔄 Attempting NetCDF fallback: {nc_path}")

        if nc_path.exists():
            try:
                # Try with time decoding first
                ds = await asyncio.to_thread(
                    xr.open_dataset, str(nc_path), engine="h5netcdf", decode_times=True
                )
            except (ValueError, OSError) as time_error:
                # Fallback to no time decoding
                if (
                    "decode time" in str(time_error).lower()
                    or "cftime" in str(time_error).lower()
                ):
                    logger.warning(
                        "Time decoding failed for fallback, using decode_times=False"
                    )
                    ds = await asyncio.to_thread(
                        xr.open_dataset,
                        str(nc_path),
                        engine="h5netcdf",
                        decode_times=False,
                    )
                    ds = _ensure_datetime_coordinates(ds)
                else:
                    raise

            logger.info(f"Fallback successful! Variables: {list(ds.data_vars)}")
            dataset_cache.set(cache_key, ds)
            total_time = time.perf_counter() - start_time
            logger.info(
                f"[TIMING] open_local_dataset TOTAL (fallback): {total_time:.3f}s"
            )
            return ds
        else:
            logger.error(f"❌ No NetCDF fallback found: {nc_path}")
            total_time = time.perf_counter() - start_time
            logger.info(f"[TIMING] open_local_dataset FAILED after {total_time:.3f}s")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to open {metadata['datasetName']}: Zarr incomplete and no NetCDF fallback found",
            )

    except Exception as e:
        total_time = time.perf_counter() - start_time
        logger.error(f"❌ Unexpected error opening {metadata['datasetName']}: {e}")
        logger.info(f"[TIMING] open_local_dataset FAILED after {total_time:.3f}s")
        import traceback

        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Failed to access local dataset: {metadata['datasetName']} - {str(e)}",
        )


# ============================================================================
# DATA PROCESSING FUNCTIONS
# ============================================================================


def normalize_coordinates(ds: xr.Dataset) -> tuple:
    """Find and normalize coordinate names"""
    coord_map = {c.lower(): c for c in ds.coords}

    lat_name = (
        coord_map.get("lat")
        or coord_map.get("latitude")
        or coord_map.get("lattitude")
        or coord_map.get("ylat")
    )
    lon_name = (
        coord_map.get("lon")
        or coord_map.get("longitude")
        or coord_map.get("long")
        or coord_map.get("xlon")
    )
    time_name = coord_map.get("time") or coord_map.get("date")

    return lat_name, lon_name, time_name


async def extract_time_series(
    ds: xr.Dataset,
    metadata: pd.Series,
    start_date: datetime,
    end_date: datetime,
    spatial_bounds: Optional[Dict[str, float]] = None,
    aggregation: Optional[AggregationMethod] = AggregationMethod.MEAN,
    level_value: Optional[float] = None,
    focus_coordinates: Optional[List[Dict[str, float]]] = None,  # NEW PARAMETER
) -> pd.Series:
    """
    Extract time series with advanced spatial selection

    NEW: If focus_coordinates are provided, extracts data from specific points
    instead of spatial aggregation
    """
    start_time = time.perf_counter()
    dataset_name = metadata.get("datasetName", "Unknown")
    focus_coords_str = f"focus_coords={bool(focus_coordinates)}, "
    spatial_bounds_str = f"spatial_bounds={bool(spatial_bounds)}"
    logger.info(
        f"[TIMING] extract_time_series START: {dataset_name}, "
        f"date range: {start_date.date()} to {end_date.date()}, "
        f"{focus_coords_str}{spatial_bounds_str}"
    )

    if aggregation is None:
        aggregation = AggregationMethod.MEAN

    coord_norm_start = time.perf_counter()
    lat_name, lon_name, time_name = normalize_coordinates(ds)
    coord_norm_time = time.perf_counter()
    logger.info(
        f"[TIMING] Coordinate normalization took {coord_norm_time - coord_norm_start:.3f}s"
    )

    # Time selection
    time_sel_start = time.perf_counter()
    ds_time = ds.sel({time_name: slice(start_date, end_date)})
    time_sel_time = time.perf_counter()
    logger.info(f"[TIMING] Time selection took {time_sel_time - time_sel_start:.3f}s")

    # Get variable
    var_extract_start = time.perf_counter()
    var_name = metadata["keyVariable"]
    var = ds_time[var_name]
    var_extract_time = time.perf_counter()
    logger.info(
        f"[TIMING] Variable extraction took {var_extract_time - var_extract_start:.3f}s"
    )

    # Level selection if applicable
    if level_value is not None:
        level_sel_start = time.perf_counter()
        level_dims = [d for d in var.dims if d not in (time_name, lat_name, lon_name)]
        if level_dims:
            var = var.sel({level_dims[0]: level_value}, method="nearest")
        level_sel_time = time.perf_counter()
        logger.info(
            f"[TIMING] Level selection took {level_sel_time - level_sel_start:.3f}s"
        )

    # NEW: Point-based extraction if focus coordinates provided
    if focus_coordinates and len(focus_coordinates) > 0:
        logger.info(
            f"Extracting data from {len(focus_coordinates)} specific coordinate(s)"
        )

        focus_extract_start = time.perf_counter()
        point_series = []

        for coord in focus_coordinates:
            try:
                # Select nearest point to the specified coordinate
                if lat_name and lon_name:
                    point_start = time.perf_counter()
                    point_data = var.sel(
                        {lat_name: coord["lat"], lon_name: coord["lon"]},
                        method="nearest",
                    )

                    # Convert to pandas Series
                    point_series_data = point_data.to_pandas()

                    # Ensure datetime index
                    if not isinstance(point_series_data.index, pd.DatetimeIndex):
                        point_series_data.index = pd.to_datetime(
                            point_series_data.index
                        )

                    point_series.append(point_series_data)
                    point_extract_time = time.perf_counter()
                    logger.info(
                        f"Extracted data from point: lat={coord['lat']}, lon={coord['lon']} "
                        f"(took {point_extract_time - point_start:.3f}s)"
                    )
                else:
                    logger.warning(
                        "Cannot extract point data: lat/lon coordinates not found in dataset"
                    )

            except Exception as e:
                logger.error(f"Failed to extract data from coordinate {coord}: {e}")
                continue

        if not point_series:
            raise ValueError(
                "Failed to extract data from any of the specified coordinates"
            )

        # If multiple points, average them
        if len(point_series) > 1:
            logger.info(f"Averaging data from {len(point_series)} points")
            # Align all series and take mean
            combined = pd.concat(point_series, axis=1)
            result = combined.mean(axis=1)
        else:
            result = point_series[0]

        focus_extract_time = time.perf_counter()
        logger.info(
            f"[TIMING] Focus coordinates extraction took {focus_extract_time - focus_extract_start:.3f}s"
        )
        total_time = time.perf_counter() - start_time
        logger.info(
            f"[TIMING] extract_time_series TOTAL (focus path): {total_time:.3f}s"
        )
        return result

    # ORIGINAL: Spatial aggregation (used when no focus coordinates)
    else:
        # Spatial bounds selection
        if spatial_bounds:
            if lat_name and lon_name:
                var = var.sel(
                    {
                        lat_name: slice(
                            spatial_bounds.get("lat_min", -90),
                            spatial_bounds.get("lat_max", 90),
                        ),
                        lon_name: slice(
                            spatial_bounds.get("lon_min", -180),
                            spatial_bounds.get("lon_max", 180),
                        ),
                    }
                )

        # Spatial aggregation
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

        # Convert to pandas Series
        series = result.to_pandas()

        # Ensure datetime index
        if not isinstance(series.index, pd.DatetimeIndex):
            series.index = pd.to_datetime(series.index)

        total_time = time.perf_counter() - start_time
        logger.info(
            f"[TIMING] extract_time_series TOTAL (spatial aggregation path): {total_time:.3f}s"
        )
        return series


def apply_analysis_model(
    series: pd.Series, model: AnalysisModel, window: Optional[int] = None
) -> pd.Series:
    """Apply advanced analysis transformations"""

    if model == AnalysisModel.RAW:
        return series

    elif model == AnalysisModel.MOVING_AVG:
        window = window or 12
        return series.rolling(window=window, center=True, min_periods=1).mean()

    elif model == AnalysisModel.TREND:
        # Detrend using linear regression
        x = np.arange(len(series))
        y = series.values
        valid_mask = ~np.isnan(y)

        if valid_mask.sum() < 2:
            return series

        coeffs = np.polyfit(x[valid_mask], y[valid_mask], 1)
        trend = np.polyval(coeffs, x)
        return pd.Series(trend, index=series.index)

    elif model == AnalysisModel.ANOMALY:
        # Calculate anomalies from climatology
        climatology = series.groupby([series.index.month, series.index.day]).mean()
        anomalies = series.copy()

        for idx in series.index:
            clim_key = (idx.month, idx.day)
            if clim_key in climatology:
                anomalies[idx] = series[idx] - climatology[clim_key]

        return anomalies

    elif model == AnalysisModel.SEASONAL:
        # Simple seasonal decomposition
        if len(series) < 24:  # Need at least 2 years
            return series

        from statsmodels.tsa.seasonal import seasonal_decompose

        try:
            decomposition = seasonal_decompose(
                series.dropna(), model="additive", period=12
            )
            return decomposition.seasonal
        except:  # noqa E722
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
            min=0,
            max=0,
            mean=0,
            median=0,
            std=0,
            trend=0,
            count=0,
            missing=len(series),
            percentiles={"25": 0, "50": 0, "75": 0},
        )

    # Calculate trend
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
            "75": float(valid_data.quantile(0.75)),
        },
    )


def generate_chart_config(
    datasets: List[str], chart_type: ChartType, metadata: Dict[str, DatasetMetadata]
) -> Dict[str, Any]:
    """Generate chart configuration for frontend visualization"""

    colors = [
        "#8884d8",
        "#82ca9d",
        "#ffc658",
        "#ff7c7c",
        "#8dd1e1",
        "#d084d0",
        "#ffb347",
        "#67b7dc",
        "#a4de6c",
        "#ffd93d",
    ]

    config: dict[str, Any] = {
        "type": chart_type.value,
        "datasets": [],
        "options": {
            "responsive": True,
            "maintainAspectRatio": False,
            "interaction": {"mode": "index", "intersect": False},
            "scales": {
                "x": {
                    "type": "time",
                    "time": {
                        "displayFormats": {
                            "day": "MMM DD",
                            "month": "MMM YYYY",
                            "year": "YYYY",
                        }
                    },
                },
                "y": {"beginAtZero": False},
            },
        },
    }

    for i, dataset_id in enumerate(datasets):
        if dataset_id in metadata:
            meta = metadata[dataset_id]
            config["datasets"].append(
                {
                    "id": dataset_id,
                    "label": meta.name,
                    "color": colors[i % len(colors)],
                    "units": meta.units,
                    "borderWidth": 2 if chart_type == ChartType.LINE else 0,
                    "fill": chart_type == ChartType.AREA,
                }
            )

    return config


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

    start_time = datetime.now()

    try:
        # Parse dates
        start_date = datetime.strptime(request.startDate, "%Y-%m-%d")
        end_date = datetime.strptime(request.endDate, "%Y-%m-%d")

        # NEW: Parse focus coordinates if provided
        focus_coords = parse_focus_coordinates(request.focusCoordinates)
        if focus_coords:
            logger.info(
                f"Processing request with {len(focus_coords)} focus coordinate(s)"
            )
            for i, coord in enumerate(focus_coords):
                logger.info(
                    f"  Coordinate {i + 1}: lat={coord['lat']}, lon={coord['lon']}"
                )

        # Get metadata for requested datasets (UUIDs)
        metadata_df = get_metadata_by_ids(request.datasetIds)

        if len(metadata_df) == 0:
            raise HTTPException(
                status_code=404, detail="No datasets found with provided IDs"
            )

        # Process each dataset
        all_series: dict[str, pd.Series] = {}
        dataset_metadata = {}
        statistics: dict[str, Statistics] | None = (
            {} if request.includeStatistics else None
        )

        for _, meta_row in metadata_df.iterrows():
            try:
                is_local = meta_row["Stored"] == "local"

                # Open dataset
                if is_local:
                    ds = await open_local_dataset(meta_row)
                else:
                    ds = await open_cloud_dataset(meta_row, start_date, end_date)

                # Determine level if multi-level
                level_value = None
                if (
                    meta_row.get("levelValues")
                    and str(meta_row["levelValues"]).lower() != "none"
                ):
                    level_vals = [
                        float(x.strip())
                        for x in str(meta_row["levelValues"]).split(",")
                    ]
                    level_value = np.median(level_vals)

                # Extract time series - NOW WITH FOCUS COORDINATES
                series = await extract_time_series(
                    ds,
                    meta_row,
                    start_date,
                    end_date,
                    spatial_bounds=request.spatialBounds
                    if not focus_coords
                    else None,  # Ignore bounds if using coords
                    aggregation=request.aggregation,
                    level_value=level_value,
                    focus_coordinates=focus_coords,  # NEW: Pass parsed coordinates
                )

                # Apply analysis model
                series = apply_analysis_model(
                    series, request.analysisModel, request.smoothingWindow
                )

                # Normalize if requested
                if request.normalize:
                    series_min = series.min()
                    series_max = series.max()
                    if series_max > series_min:
                        series = (series - series_min) / (series_max - series_min)

                # Resample if requested
                if request.resampleFreq:
                    series = series.resample(request.resampleFreq).mean()

                # Use ID as the key (what frontend sends)
                dataset_id = str(meta_row["id"])
                all_series[dataset_id] = series

                # Add metadata
                if request.includeMetadata:
                    dataset_metadata[dataset_id] = DatasetMetadata(
                        id=str(meta_row["id"]),
                        slug=meta_row.get("slug"),
                        name=meta_row["datasetName"],
                        source=meta_row["sourceName"],
                        units=meta_row["units"],
                        spatialResolution=meta_row.get("spatialResolution"),
                        temporalResolution=meta_row.get("statistic", "Monthly"),
                        startDate=meta_row["startDate"],
                        endDate=meta_row["endDate"],
                        isLocal=is_local,
                        level=f"{level_value} {meta_row.get('levelUnits', '')}"
                        if level_value
                        else None,
                        description=meta_row.get("description"),
                    )

                # Calculate statistics
                if request.includeStatistics and statistics is not None:
                    statistics[dataset_id] = calculate_statistics(series)

            except Exception as e:
                logger.error(f"Error processing dataset {meta_row['datasetName']}: {e}")
                # Continue with other datasets
                continue

        if not all_series:
            raise HTTPException(
                status_code=500, detail="Failed to extract data from any dataset"
            )

        # Align all series to common time index
        common_index = pd.concat(all_series.values(), axis=1).index
        common_index = common_index.sort_values()

        # Build response data
        data_points = []
        for timestamp in common_index:
            point = DataPoint(
                date=timestamp.strftime("%Y-%m-%d"),
                values={},
                timestamp=int(timestamp.timestamp()),
            )

            for dataset_id, series in all_series.items():
                if timestamp in series.index:
                    value = series[timestamp]
                    point.values[dataset_id] = (
                        float(value) if not pd.isna(value) else None
                    )
                else:
                    point.values[dataset_id] = None

            data_points.append(point)

        # Generate chart configuration
        chart_config = None
        if request.chartType and dataset_metadata:
            chart_config = generate_chart_config(
                list(all_series.keys()), request.chartType, dataset_metadata
            )

        # Processing info
        processing_time = (datetime.now() - start_time).total_seconds()
        processing_info = {
            "processingTime": f"{processing_time:.2f}s",
            "totalPoints": len(data_points),
            "datasetsProcessed": len(all_series),
            "dateRange": {
                "start": common_index[0].strftime("%Y-%m-%d")
                if len(common_index) > 0
                else None,
                "end": common_index[-1].strftime("%Y-%m-%d")
                if len(common_index) > 0
                else None,
            },
            "analysisModel": request.analysisModel.value,
            "aggregation": request.aggregation.value,
            "focusCoordinates": len(focus_coords)
            if focus_coords
            else None,  # NEW: Include in response
            "extractionMode": "point-based"
            if focus_coords
            else "spatial-aggregation",  # NEW: Show mode
        }

        return TimeSeriesResponse(
            data=data_points,
            metadata=dataset_metadata if request.includeMetadata else None,
            statistics=statistics,
            chartConfig=chart_config,
            processingInfo=processing_info,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in extract_timeseries: {e}")
        import traceback

        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    """
    Extract and process time series data from multiple datasets

    This endpoint:
    - Fetches data from local or cloud sources based on metadata
    - Applies spatial and temporal filtering
    - Performs requested analysis (trend, anomaly, etc.)
    - Returns chart-ready data with statistics and metadata
    """

    start_time = datetime.now()

    try:
        # Parse dates
        start_date = datetime.strptime(request.startDate, "%Y-%m-%d")
        end_date = datetime.strptime(request.endDate, "%Y-%m-%d")

        # Get metadata for requested datasets (UUIDs)
        metadata_df = get_metadata_by_ids(request.datasetIds)

        if len(metadata_df) == 0:
            raise HTTPException(
                status_code=404, detail="No datasets found with provided IDs"
            )

        # Process each dataset
        all_series = {}
        dataset_metadata = {}
        statistics = {} if request.includeStatistics else None

        for _, meta_row in metadata_df.iterrows():
            try:
                is_local = meta_row["Stored"] == "local"

                # Open dataset
                if is_local:
                    ds = await open_local_dataset(meta_row)
                else:
                    ds = await open_cloud_dataset(meta_row, start_date, end_date)

                # Determine level if multi-level
                level_value = None
                if (
                    meta_row.get("levelValues")
                    and str(meta_row["levelValues"]).lower() != "none"
                ):
                    level_vals = [
                        float(x.strip())
                        for x in str(meta_row["levelValues"]).split(",")
                    ]
                    level_value = np.median(level_vals)

                # Extract time series
                series = await extract_time_series(
                    ds,
                    meta_row,
                    start_date,
                    end_date,
                    spatial_bounds=request.spatialBounds,
                    aggregation=request.aggregation,
                    level_value=level_value,
                )

                # Apply analysis model
                series = apply_analysis_model(
                    series, request.analysisModel, request.smoothingWindow
                )

                # Normalize if requested
                if request.normalize:
                    series_min = series.min()
                    series_max = series.max()
                    if series_max > series_min:
                        series = (series - series_min) / (series_max - series_min)

                # Resample if requested
                if request.resampleFreq:
                    series = series.resample(request.resampleFreq).mean()

                # Use ID as the key (what frontend sends)
                dataset_id = str(meta_row["id"])
                all_series[dataset_id] = series

                # Add metadata
                if request.includeMetadata:
                    dataset_metadata[dataset_id] = DatasetMetadata(
                        id=str(meta_row["id"]),
                        slug=meta_row.get("slug"),
                        name=meta_row["datasetName"],
                        source=meta_row["sourceName"],
                        units=meta_row["units"],
                        spatialResolution=meta_row.get("spatialResolution"),
                        temporalResolution=meta_row.get("statistic", "Monthly"),
                        startDate=meta_row["startDate"],
                        endDate=meta_row["endDate"],
                        isLocal=is_local,
                        level=f"{level_value} {meta_row.get('levelUnits', '')}"
                        if level_value
                        else None,
                        description=meta_row.get("description"),
                    )

                # Calculate statistics
                if request.includeStatistics:
                    statistics[dataset_id] = calculate_statistics(series)

            except Exception as e:
                logger.error(f"Error processing dataset {meta_row['datasetName']}: {e}")
                # Continue with other datasets
                continue

        if not all_series:
            raise HTTPException(
                status_code=500, detail="Failed to extract data from any dataset"
            )

        # Align all series to common time index
        common_index = None
        for series in all_series.values():
            if common_index is None:
                common_index = series.index
            else:
                common_index = common_index.intersection(series.index)

        # Build response data
        data_points = []
        for timestamp in common_index:
            point = DataPoint(
                date=timestamp.strftime("%Y-%m-%d"),
                values={},
                timestamp=int(timestamp.timestamp()),
            )

            for dataset_id, series in all_series.items():
                if timestamp in series.index:
                    value = series[timestamp]
                    point.values[dataset_id] = (
                        float(value) if not pd.isna(value) else None
                    )

            data_points.append(point)

        # Generate chart configuration
        chart_config = None
        if request.chartType and dataset_metadata:
            chart_config = generate_chart_config(
                list(all_series.keys()), request.chartType, dataset_metadata
            )

        # Processing info
        processing_time = (datetime.now() - start_time).total_seconds()
        processing_info = {
            "processingTime": f"{processing_time:.2f}s",
            "totalPoints": len(data_points),
            "datasetsProcessed": len(all_series),
            "dateRange": {
                "start": common_index[0].strftime("%Y-%m-%d")
                if len(common_index) > 0
                else None,
                "end": common_index[-1].strftime("%Y-%m-%d")
                if len(common_index) > 0
                else None,
            },
            "analysisModel": request.analysisModel.value,
            "aggregation": request.aggregation.value,
        }

        return TimeSeriesResponse(
            data=data_points,
            metadata=dataset_metadata if request.includeMetadata else None,
            statistics=statistics,
            chartConfig=chart_config,
            processingInfo=processing_info,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in extract_timeseries: {e}")
        import traceback

        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/raster/visualize", response_class=CustomJSONResponse)
async def visualize_raster(request: RasterRequest):
    """
    Generate raster visualization for 3D globe display

    Returns base64-encoded PNG textures and metadata for Cesium rendering
    Now supports CSS colors from frontend ColorBar for exact color matching
    """
    start_time = datetime.now()

    try:
        # Parse date
        target_date = datetime.strptime(request.date, "%Y-%m-%d")

        # Log CSS colors if provided
        if request.cssColors:
            logger.info(
                f"[RasterViz] Received {len(request.cssColors)} CSS colors from frontend"
            )
            logger.info(f"[RasterViz] Colors: {request.cssColors}")
        else:
            logger.info("[RasterViz] No CSS colors provided, will use default colormap")

        # Get metadata
        metadata_df = get_metadata_by_ids([request.datasetId])

        if len(metadata_df) == 0:
            raise HTTPException(
                status_code=404, detail=f"Dataset not found: {request.datasetId}"
            )
        metadata_df = metadata_df.reset_index(drop=True)
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
            level_dims = [
                d for d in var.dims if d not in (time_name, lat_name, lon_name)
            ]
            if level_dims:
                var = var.sel({level_dims[0]: request.level}, method="nearest")

        zero_mask_applied = False
        zero_mask_pixels = 0

        if request.maskZeroValues:
            if dataset_supports_zero_mask(meta_row):
                zero_mask = var.notnull() & (np.abs(var) <= ZERO_PRECIP_MASK_TOLERANCE)
                total_pixels = int(zero_mask.size) if zero_mask.size else 0
                if total_pixels:
                    zero_mask_pixels = int(zero_mask.sum().values.item())
                else:
                    zero_mask_pixels = 0

                if zero_mask_pixels > 0:
                    zero_fraction = (
                        zero_mask_pixels / total_pixels if total_pixels else 0.0
                    )
                    logger.info(
                        "[RasterViz] maskZeroValues enabled - masking %s zero-value "
                        "pixels (%.1f%% of slice)",
                        zero_mask_pixels,
                        zero_fraction * 100.0,
                    )
                    var = var.where(~zero_mask)
                    zero_mask_applied = True
                else:
                    logger.info(
                        "[RasterViz] maskZeroValues requested but no zero-value pixels "
                        "detected for %s",
                        meta_row["datasetName"],
                    )
            else:
                logger.info(
                    "[RasterViz] maskZeroValues requested but dataset %s is not "
                    "precipitation-focused; skipping zero mask",
                    meta_row["datasetName"],
                )

        # CRITICAL: Pass CSS colors to serialize_raster_array
        logger.info(f"Generating raster visualization for {meta_row['datasetName']}")
        raster_data = serialize_raster_array(
            var,
            meta_row,
            meta_row["datasetName"],
            css_colors=request.cssColors,  # THIS IS THE KEY LINE - ADD THIS!
        )

        # Add processing info
        processing_time = (datetime.now() - start_time).total_seconds()
        raster_data["processingInfo"] = {
            "processingTime": f"{processing_time:.2f}s",
            "date": request.date,
            "level": request.level,
            "datasetId": request.datasetId,
            "colorSource": "CSS colors from ColorBar"
            if request.cssColors
            else "Default colormap",
            "maskZeroValuesApplied": zero_mask_applied,
            "maskedZeroPixels": zero_mask_pixels if zero_mask_applied else 0,
        }

        logger.info(
            f"Raster visualization generated successfully in {processing_time:.2f}s"
        )

        return raster_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating raster visualization: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to generate raster visualization: {str(e)}"
        )


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
        # Load metadata from database using 'metadata' table
        with engine.connect() as conn:
            query = text("SELECT * FROM metadata")
            result = conn.execute(query)
            df = pd.DataFrame(result.fetchall(), columns=result.keys())

        if df.empty:
            return {"total": 0, "datasets": []}

        # Apply filters
        if stored != "all" and stored is not None:
            df = df[df["Stored"].str.lower() == stored.lower()]

        if source:
            df = df[df["sourceName"].str.contains(source, case=False, na=False)]

        if search:
            df = df[
                df["datasetName"].str.contains(search, case=False, na=False)
                | df["layerParameter"].str.contains(search, case=False, na=False)
                | df.get("slug", pd.Series(dtype=str)).str.contains(
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
                    "valueMax": row.get("valueMax"),
                }
            )

        return {"total": len(datasets), "datasets": datasets}

    except Exception as e:
        logger.error(f"Error listing datasets: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to list datasets: {str(e)}"
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
    logger.info(f"Kerchunk directory: {KERCHUNK_PATH}")
    logger.info(f"Cache directory: {CACHE_DIR}")
    logger.info(f"Database connected: {POSTRGRES_URL is not None}")
    logger.info(f"S3 Anonymous access: {S3_ANON}")

    # Check if kerchunk directory exists
    if KERCHUNK_PATH.exists():
        kerchunk_files = list(KERCHUNK_PATH.glob("**/*.json"))
        logger.info(f"Found {len(kerchunk_files)} kerchunk file(s)")
    else:
        logger.warning(f"Kerchunk directory not found: {KERCHUNK_PATH}")
        logger.warning("Cloud datasets will use direct S3 access (slower)")


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

    print("🚀 Starting Enhanced Climate Time Series API...")
    print("📍 API will be available at: http://localhost:8000")
    print("📚 API docs at: http://localhost:8000/docs")
    print("🔧 Features:")
    print("   - Local and cloud dataset support")
    print("   - Kerchunk optimized cloud access")
    print("   - Multi-file cloud dataset support")
    print("   - Advanced analysis models (trend, anomaly, seasonal)")
    print("   - Spatial filtering and aggregation")
    print("   - Multiple chart types")
    print("   - Data caching for performance")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
