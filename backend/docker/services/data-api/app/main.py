"""
Enhanced FastAPI application for climate time series data extraction
Supports both local and cloud-based datasets with advanced processing capabilities
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
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from concurrent.futures import ThreadPoolExecutor
import warnings
import kerchunk.hdf
import kerchunk.combine
from functools import lru_cache

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
env_path = ROOT_DIR / '.env.local'
load_dotenv(dotenv_path=env_path)

# ============================================================================
# CONFIGURATION
# ============================================================================

# Database configuration
DATABASE_URL = os.getenv("POSTGRES_URL")
if not DATABASE_URL:
    raise ValueError(
        f"DATABASE_URL not found in environment variables. "
        f"Please create a .env file at {env_path} with DATABASE_URL=postgresql://..."
    )

# File paths configuration
LOCAL_DATASETS_PATH = (ROOT_DIR / os.getenv("LOCAL_DATASETS_PATH")).resolve()
KERCHUNK_PATH = (ROOT_DIR / os.getenv("KERCHUNK_PATH")).resolve()
CACHE_DIR = Path(os.getenv("CACHE_DIR", "/tmp/climate_cache")).resolve()


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
            # Query by UUID id column instead of datasetName
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
    startDate: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")  # Added 'r' prefix
    endDate: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")    # Added 'r' prefix
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
            if (end - start).days > 365 * 50:  # Max 50 years
                raise ValueError("Date range cannot exceed 50 years")
        return v

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
            # Remove least recently used
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

def create_kerchunk_reference(url: str, output_path: str) -> str:
    """Create kerchunk reference file for cloud NetCDF/HDF5 data"""
    try:
        fs = fsspec.filesystem("s3", anon=S3_ANON)
        with fs.open(url, "rb") as f:
            h5chunks = kerchunk.hdf.SingleHdf5ToZarr(f, url)
            refs = h5chunks.translate()
        
        # Save reference file
        with open(output_path, "w") as f:
            json.dump(refs, f)
        
        return output_path
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
        if metadata["engine"] == "zarr" and metadata.get("kerchunkPath"):
            # Use existing kerchunk reference
            ds = await asyncio.to_thread(
                xr.open_zarr,
                "reference://",
                storage_options={
                    "fo": metadata["kerchunkPath"],
                    "remote_protocol": "s3",
                    "remote_options": {"anon": S3_ANON},
                    "asynchronous": False
                },
                consolidated=False
            )
        
        elif metadata["engine"] == "h5netcdf":
            # Handle cloud HDF5/NetCDF files
            url = metadata["inputFile"]
            
            # Check if we need to create a kerchunk reference
            kerchunk_file = os.path.join(KERCHUNK_PATH, f"{metadata['datasetName']}.json")
            if not os.path.exists(kerchunk_file):
                kerchunk_file = await asyncio.to_thread(
                    create_kerchunk_reference, url, kerchunk_file
                )
            
            # Open with kerchunk reference
            ds = await asyncio.to_thread(
                xr.open_zarr,
                "reference://",
                storage_options={
                    "fo": kerchunk_file,
                    "remote_protocol": "s3",
                    "remote_options": {"anon": S3_ANON}
                },
                consolidated=False
            )
        
        else:
            # Direct S3 access
            fs = fsspec.filesystem("s3", anon=S3_ANON)
            url = metadata["inputFile"]
            
            # Handle wildcards and date patterns
            if "{" in url:
                url = url.format(
                    year=start_date.year,
                    month=start_date.month,
                    day=start_date.day
                )
            
            if "*" in url:
                files = fs.glob(url)
                if not files:
                    raise ValueError(f"No files found matching pattern: {url}")
                url = f"s3://{files[0]}"
            
            with fs.open(url, "rb") as f:
                ds = await asyncio.to_thread(xr.open_dataset, f, engine=metadata["engine"])
        
        # Cache the dataset
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
        # Handle different path formats
        input_file = metadata["inputFile"]
        # Remove 'datasets/' prefix if present
        if input_file.startswith("datasets/"):
            input_file = input_file.replace("datasets/", "", 1)
        
        file_path = os.path.join(LOCAL_DATASETS_PATH, input_file)
        logger.info(f"Attempting to open local dataset: {file_path}")
        
        if not os.path.exists(file_path):
            logger.error(f"Dataset file not found: {file_path}")
            logger.error(f"LOCAL_DATASETS_PATH: {LOCAL_DATASETS_PATH}")
            logger.error(f"Input file from metadata: {metadata['inputFile']}")
            
            # List available files in directory for debugging
            if os.path.exists(LOCAL_DATASETS_PATH):
                available_files = os.listdir(LOCAL_DATASETS_PATH)
                logger.info(f"Available files in {LOCAL_DATASETS_PATH}: {available_files[:10]}")
            
            raise FileNotFoundError(f"Local dataset not found: {file_path}")
        
        engine = metadata.get("engine", "h5netcdf")
        logger.info(f"Opening dataset with engine: {engine}")
        
        if engine == "zarr":
            # Try consolidated first, fall back to non-consolidated
            try:
                logger.info(f"Attempting to open zarr with consolidated metadata")
                ds = await asyncio.to_thread(xr.open_zarr, file_path, consolidated=True)
                logger.info(f"Successfully opened zarr with consolidated metadata")
            except Exception as zarr_error:
                logger.warning(f"Consolidated metadata not found for {metadata['datasetName']}: {zarr_error}")
                logger.info(f"Trying to open zarr without consolidated metadata")
                try:
                    ds = await asyncio.to_thread(xr.open_zarr, file_path, consolidated=False)
                    logger.info(f"Successfully opened zarr without consolidated metadata")
                except Exception as e:
                    logger.error(f"Failed to open zarr with both methods: {e}")
                    raise
        else:
            ds = await asyncio.to_thread(xr.open_dataset, file_path, engine=engine)
            logger.info(f"Successfully opened dataset with engine: {engine}")
        
        dataset_cache.set(cache_key, ds)
        logger.info(f"Cached dataset: {cache_key}")
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
    
    # Time selection
    ds_time = ds.sel({time_name: slice(start_date, end_date)})
    
    # Spatial selection
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
    
    # Get variable
    var_name = metadata["keyVariable"]
    var = ds_spatial[var_name]
    
    # Level selection if applicable
    if level_value is not None:
        level_dims = [d for d in var.dims if d not in (time_name, lat_name, lon_name)]
        if level_dims:
            var = var.sel({level_dims[0]: level_value}, method="nearest")
    
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

# Create FastAPI app and router
app = FastAPI(
    title="Enhanced Climate Time Series API",
    description="Advanced API for extracting and processing climate time series data",
    version="2.0.0",
    default_response_class=CustomJSONResponse
)

# Configure CORS
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
                status_code=404,
                detail="No datasets found with provided IDs"
            )
        
        # Process each dataset in parallel
        tasks = []
        for _, meta_row in metadata_df.iterrows():
            is_local = meta_row["Stored"] == "local"
            
            if is_local:
                task = open_local_dataset(meta_row)
            else:
                task = open_cloud_dataset(meta_row, start_date, end_date)
            
            tasks.append((meta_row, task))
        
        # Collect all datasets
        all_series = {}
        dataset_metadata = {}
        statistics = {} if request.includeStatistics else None
        
        for meta_row, task in tasks:
            try:
                # Open dataset
                ds = await task
                
                # Determine level if multi-level
                level_value = None
                if meta_row.get("levelValues") and str(meta_row["levelValues"]).lower() != "none":
                    level_vals = [float(x) for x in str(meta_row["levelValues"]).split(",")]
                    level_value = np.median(level_vals)
                
                # Extract time series
                series = await extract_time_series(
                    ds, meta_row, start_date, end_date,
                    spatial_bounds=request.spatialBounds,
                    aggregation=request.aggregation,
                    level_value=level_value
                )
                
                # Apply analysis model
                series = apply_analysis_model(
                    series, 
                    request.analysisModel,
                    request.smoothingWindow
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
                
                # Store results - use keyVariable as the identifier (what frontend expects)
                dataset_id = meta_row["keyVariable"]
                all_series[dataset_id] = series
                
                # Add metadata
                if request.includeMetadata:
                    dataset_metadata[dataset_id] = DatasetMetadata(
                        id=meta_row["id"],  # UUID
                        name=meta_row["datasetName"],  # Full dataset name
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
                
                # Calculate statistics
                if request.includeStatistics:
                    statistics[dataset_id] = calculate_statistics(series)
                
            except Exception as e:
                logger.error(f"Error processing dataset {meta_row['datasetName']}: {e}")
                # Continue with other datasets
                continue
        
        if not all_series:
            raise HTTPException(
                status_code=500,
                detail="Failed to extract data from any dataset"
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
                timestamp=int(timestamp.timestamp())
            )
            
            for dataset_id, series in all_series.items():
                if timestamp in series.index:
                    value = series[timestamp]
                    point.values[dataset_id] = float(value) if not pd.isna(value) else None
            
            data_points.append(point)
        
        # Generate chart configuration
        chart_config = None
        if request.chartType and dataset_metadata:
            chart_config = generate_chart_config(
                list(all_series.keys()),
                request.chartType,
                dataset_metadata
            )
        
        # Processing info
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

@router.get("/timeseries/datasets", response_class=CustomJSONResponse)
async def list_available_datasets(
    stored: Optional[Literal["local", "cloud", "all"]] = "all",
    source: Optional[str] = None,
    search: Optional[str] = None
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
            return {
                "total": 0,
                "datasets": []
            }
        
        # Apply filters (using correct column names from Drizzle schema)
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
        
        # Convert to list of dicts (matching frontend expectations)
        datasets = []
        for _, row in df.iterrows():
            datasets.append({
                "id": row["id"],  # UUID - what frontend sends to extract endpoint
                "slug": row.get("slug"),
                "name": row["layerParameter"],  # Shortened name for display
                "datasetName": row["datasetName"],  # Full dataset name
                "sourceName": row["sourceName"],  # Full source name
                "source": row["sourceName"],  # Alias for compatibility
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
                "keyVariable": row.get("keyVariable")  # What data is keyed by
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

@router.post("/timeseries/compare")
async def compare_datasets(
    dataset_ids: List[str],
    reference_id: str,
    start_date: str,
    end_date: str,
    metric: Literal["correlation", "rmse", "mae", "bias"] = "correlation"
):
    """
    Compare multiple datasets against a reference dataset
    """
    # Implementation for dataset comparison
    # This would calculate correlation, RMSE, etc. between datasets
    pass

@router.get("/timeseries/export/{format}")
async def export_timeseries(
    format: Literal["csv", "json", "netcdf", "parquet"],
    dataset_ids: List[str] = Query(...),
    start_date: str = Query(...),
    end_date: str = Query(...)
):
    """
    Export extracted time series data in various formats
    """
    # Implementation for data export
    pass

@router.get("/health")
async def health_check():
    """Health check endpoint with system status"""
    return {
        "status": "healthy",
        "service": "climate-timeseries-api-v2",
        "cache_size": len(dataset_cache.cache),
        "timestamp": datetime.now().isoformat()
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
    logger.info(f"Cache directory: {CACHE_DIR}")
    logger.info(f"Database connected: {DATABASE_URL is not None}")

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
    print("   - Advanced analysis models (trend, anomaly, seasonal)")
    print("   - Spatial filtering and aggregation")
    print("   - Multiple chart types")
    print("   - Data caching for performance")
    print("   - Export capabilities")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)