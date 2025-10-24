"""
FastAPI application for climate time series data extraction
Combined main.py with timeseries endpoints
"""

from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import xarray as xr
import pandas as pd
import numpy as np
import fsspec
import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

# Load environment variables from .env file in root folder
# Get the path to the root directory (parent of backend/)
root_dir = Path(__file__).parent.parent
env_path = root_dir / '.env.local'

# Load the .env file from root
load_dotenv(dotenv_path=env_path)

# ============================================================================
# DATABASE CONNECTION
# ============================================================================

# Get database URL from environment variable
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError(
        f"DATABASE_URL not found in environment variables. "
        f"Please create a .env file at {env_path} with DATABASE_URL=postgresql://..."
    )

# Create synchronous engine (simpler for this use case)
engine = create_engine(DATABASE_URL, poolclass=NullPool)


def get_datasets_by_ids(dataset_ids: List[str]) -> List[Dict[str, Any]]:
    """Fetch datasets from database by IDs"""
    with engine.connect() as conn:
        # Use parameterized query to prevent SQL injection
        placeholders = ', '.join([f':id{i}' for i in range(len(dataset_ids))])
        query = text(f"""
            SELECT * FROM climate_dataset 
            WHERE id IN ({placeholders})
        """)
        
        # Create parameter dict
        params = {f'id{i}': dataset_id for i, dataset_id in enumerate(dataset_ids)}
        
        result = conn.execute(query, params)
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result]


def get_dataset_by_id(dataset_id: str) -> Optional[Dict[str, Any]]:
    """Fetch single dataset from database by ID"""
    with engine.connect() as conn:
        query = text("SELECT * FROM climate_dataset WHERE id = :id")
        result = conn.execute(query, {"id": dataset_id})
        row = result.fetchone()
        if row:
            columns = result.keys()
            return dict(zip(columns, row))
        return None


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class TimeSeriesRequest(BaseModel):
    """Request model for time series data extraction"""
    datasetIds: List[str]
    startDate: str  # ISO format: "2020-01-01"
    endDate: str    # ISO format: "2023-12-31"
    analysisModel: Optional[str] = "raw"  # raw, moving-avg, trend, anomaly, seasonal
    normalize: Optional[bool] = False


class TimeSeriesResponse(BaseModel):
    """Response model for time series data"""
    data: List[Dict[str, Any]]  # [{ date: "2020-01", values: { datasetId: value } }]
    metadata: Dict[str, Dict[str, Any]]  # Dataset metadata for each ID


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def open_climate_dataset(row: Dict[str, Any], start_date: datetime, end_date: datetime) -> xr.Dataset:
    """
    Open a climate dataset based on metadata row configuration
    Supports zarr (local and S3) and h5netcdf formats
    """
    
    # Handle zarr datasets
    if row["engine"] == "zarr":
        if row["inputFile"].startswith("s3://"):
            # S3-based zarr with kerchunk reference
            ds = xr.open_zarr(
                "reference://",
                storage_options={
                    "fo": row["kerchunkPath"],
                    "remote_protocol": "s3",
                    "remote_options": {"anon": True},
                    "asynchronous": False
                },
                consolidated=False
            )
        else:
            # Local zarr
            ds = xr.open_zarr(row["inputFile"], consolidated=True)
    
    # Handle h5netcdf datasets (mostly S3)
    elif row["engine"] == "h5netcdf":
        # For h5netcdf, we need to determine which file(s) to open based on date range
        url = row["inputFile"]
        
        # If URL has date formatting, use the start date
        if "{" in url:
            url = url.format(
                year=start_date.year,
                month=start_date.month,
                day=start_date.day
            )
        
        fs = fsspec.filesystem("s3", anon=True)
        
        # Handle wildcard patterns
        if "*" in url or "?" in url:
            matching_files = fs.glob(url)
            if not matching_files:
                raise HTTPException(
                    status_code=404,
                    detail=f"No files found matching pattern: {url}"
                )
            url = f"s3://{matching_files[0]}"
        
        # Open the file
        s3_file = fs.open(url, mode="rb")
        ds = xr.open_dataset(s3_file, engine="h5netcdf")
    
    # Handle other formats
    else:
        ds = xr.open_dataset(row["inputFile"], engine=row["engine"])
    
    return ds


def normalize_coordinates(ds: xr.Dataset) -> tuple:
    """
    Find and normalize coordinate names (lat, lon, time)
    Returns: (lat_name, lon_name, time_name)
    """
    coord_map = {c.lower(): c for c in ds.coords}
    
    lat_name = (
        coord_map.get("lat") or 
        coord_map.get("latitude") or 
        coord_map.get("lattitude")
    )
    lon_name = (
        coord_map.get("lon") or 
        coord_map.get("longitude") or 
        coord_map.get("long")
    )
    time_name = coord_map.get("time")
    
    return lat_name, lon_name, time_name


def extract_spatial_average(
    ds: xr.Dataset,
    var_name: str,
    time_name: str,
    start_date: datetime,
    end_date: datetime,
    level_name: Optional[str] = None,
    level_value: Optional[float] = None
) -> pd.Series:
    """
    Extract spatial average time series for a variable
    Optionally select a specific vertical level
    """
    
    # Select time range
    ds_slice = ds.sel({time_name: slice(start_date, end_date)})
    
    # Get the variable
    var = ds_slice[var_name]
    
    # Select level if specified
    if level_name and level_value is not None:
        var = var.sel({level_name: level_value}, method="nearest")
    
    # Compute spatial mean (average over lat/lon)
    # This preserves the time dimension
    spatial_dims = [d for d in var.dims if d != time_name]
    spatial_mean = var.mean(dim=spatial_dims)
    
    # Convert to pandas Series
    series = spatial_mean.to_pandas()
    
    return series


def apply_analysis_model(series: pd.Series, model: str) -> pd.Series:
    """
    Apply analysis transformations to time series
    """
    if model == "raw":
        return series
    
    elif model == "moving-avg":
        # 12-month moving average
        return series.rolling(window=12, center=True).mean()
    
    elif model == "trend":
        # Linear trend
        x = np.arange(len(series))
        y = series.values
        
        # Remove NaN values
        valid_mask = ~np.isnan(y)
        if valid_mask.sum() < 2:
            return series
        
        x_valid = x[valid_mask]
        y_valid = y[valid_mask]
        
        # Fit linear trend
        coeffs = np.polyfit(x_valid, y_valid, 1)
        trend = np.polyval(coeffs, x)
        
        return pd.Series(trend, index=series.index)
    
    elif model == "anomaly":
        # Anomaly from mean
        return series - series.mean()
    
    elif model == "seasonal":
        # Remove seasonal component (assuming monthly data)
        if len(series) < 12:
            return series
        
        # Calculate seasonal component
        monthly_means = series.groupby(series.index.month).transform('mean')
        return series - monthly_means
    
    else:
        return series


def normalize_time_series(series: pd.Series) -> pd.Series:
    """
    Normalize time series to 0-100 range
    """
    min_val = series.min()
    max_val = series.max()
    
    if max_val - min_val == 0:
        return series * 0  # All zeros if no variation
    
    return ((series - min_val) / (max_val - min_val)) * 100


# ============================================================================
# FASTAPI APP & ROUTES
# ============================================================================

app = FastAPI(title="Climate Time Series API", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

router = APIRouter()


@router.post("/api/timeseries/data", response_model=TimeSeriesResponse)
async def get_timeseries_data(request: TimeSeriesRequest):
    """
    Extract time series data for multiple datasets
    
    Process:
    1. Load metadata for requested datasets
    2. Determine overlapping time range
    3. Open each dataset
    4. Extract spatial average time series
    5. Apply analysis model
    6. Normalize if requested
    7. Return combined data
    """
    
    try:
        # Parse dates
        start_date = datetime.fromisoformat(request.startDate)
        end_date = datetime.fromisoformat(request.endDate)
        
        # Fetch metadata for all requested datasets - FIXED DATABASE QUERY
        datasets_meta = get_datasets_by_ids(request.datasetIds)
        
        if len(datasets_meta) != len(request.datasetIds):
            raise HTTPException(
                status_code=404,
                detail="One or more datasets not found"
            )
        
        # Find overlapping time range across all datasets
        actual_start = start_date
        actual_end = end_date
        
        for meta in datasets_meta:
            # Parse dataset date range
            ds_start = pd.to_datetime(meta["startDate"].replace("/", "-"))
            ds_end_str = meta["endDate"]
            
            # Handle "present" as current date
            if ds_end_str.lower() == "present":
                ds_end = datetime.now()
            else:
                ds_end = pd.to_datetime(ds_end_str.replace("/", "-"))
            
            # Update overlapping range
            actual_start = max(actual_start, ds_start)
            actual_end = min(actual_end, ds_end)
        
        # Validate that there's an overlapping range
        if actual_start >= actual_end:
            raise HTTPException(
                status_code=400,
                detail="No overlapping time range for selected datasets"
            )
        
        # Process each dataset
        all_series = {}
        metadata = {}
        
        for meta in datasets_meta:
            try:
                # Open dataset
                ds = open_climate_dataset(meta, actual_start, actual_end)
                
                # Get coordinate names
                lat_name, lon_name, time_name = normalize_coordinates(ds)
                
                # Detect level dimension
                var_name = meta["keyVariable"]
                extra_dims = [
                    d for d in ds[var_name].dims 
                    if d not in (time_name, lat_name, lon_name)
                ]
                level_name = extra_dims[0] if extra_dims else None
                
                # Select level if needed (use median/default level)
                level_value = None
                if level_name:
                    level_values_str = meta.get("levelValues", "")
                    if level_values_str and level_values_str.lower() != "none":
                        level_values = [
                            float(x) for x in 
                            level_values_str.replace(";", ",").split(",") 
                            if x.strip()
                        ]
                        level_value = np.median(level_values)
                
                # Extract time series
                series = extract_spatial_average(
                    ds, var_name, time_name,
                    actual_start, actual_end,
                    level_name, level_value
                )
                
                # Apply analysis model
                series = apply_analysis_model(series, request.analysisModel)
                
                # Normalize if requested
                if request.normalize:
                    series = normalize_time_series(series)
                
                # Store series
                all_series[meta["id"]] = series
                
                # Store metadata
                metadata[meta["id"]] = {
                    "name": meta["layerParameter"],
                    "source": meta["sourceName"],
                    "units": meta["units"],
                    "level": f"{level_value} {meta.get('levelUnits', '')}" if level_value else None
                }
                
                # Close dataset to free memory
                ds.close()
                
            except Exception as e:
                print(f"Error processing dataset {meta['id']}: {str(e)}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Error processing dataset {meta['layerParameter']}: {str(e)}"
                )
        
        # Combine all series into a common time index
        # Find common dates across all series
        common_index = all_series[request.datasetIds[0]].index
        for series in all_series.values():
            common_index = common_index.intersection(series.index)
        
        # Build response data
        response_data = []
        for timestamp in common_index:
            data_point = {
                "date": timestamp.strftime("%Y-%m-%d"),
                "values": {}
            }
            
            for dataset_id, series in all_series.items():
                value = series.loc[timestamp]
                data_point["values"][dataset_id] = (
                    float(value) if not pd.isna(value) else None
                )
            
            response_data.append(data_point)
        
        return TimeSeriesResponse(
            data=response_data,
            metadata=metadata
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("/api/timeseries/date-range/{dataset_id}")
async def get_dataset_date_range(dataset_id: str):
    """
    Get the valid date range for a specific dataset
    """
    
    # FIXED DATABASE QUERY
    dataset = get_dataset_by_id(dataset_id)
    
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Parse dates
    start_date = dataset["startDate"].replace("/", "-")
    end_date_str = dataset["endDate"]
    
    # Handle "present"
    if end_date_str.lower() == "present":
        end_date = datetime.now().strftime("%Y-%m-%d")
    else:
        end_date = end_date_str.replace("/", "-")
    
    return {
        "datasetId": dataset_id,
        "startDate": start_date,
        "endDate": end_date,
        "name": dataset["layerParameter"]
    }


@router.post("/api/timeseries/overlapping-range")
async def get_overlapping_date_range(request: Dict[str, List[str]]):
    """
    Get the overlapping date range for multiple datasets
    Returns the intersection of all dataset date ranges
    """
    
    dataset_ids = request.get("datasetIds", [])
    
    if not dataset_ids:
        raise HTTPException(status_code=400, detail="No dataset IDs provided")
    
    # FIXED DATABASE QUERY
    datasets = get_datasets_by_ids(dataset_ids)
    
    if len(datasets) != len(dataset_ids):
        raise HTTPException(status_code=404, detail="One or more datasets not found")
    
    # Find overlapping range
    overall_start = None
    overall_end = None
    
    for dataset in datasets:
        ds_start = pd.to_datetime(dataset["startDate"].replace("/", "-"))
        
        end_str = dataset["endDate"]
        if end_str.lower() == "present":
            ds_end = pd.Timestamp.now()
        else:
            ds_end = pd.to_datetime(end_str.replace("/", "-"))
        
        if overall_start is None:
            overall_start = ds_start
            overall_end = ds_end
        else:
            overall_start = max(overall_start, ds_start)
            overall_end = min(overall_end, ds_end)
    
    # Check if there's overlap
    if overall_start >= overall_end:
        return {
            "hasOverlap": False,
            "message": "No overlapping time range for selected datasets"
        }
    
    return {
        "hasOverlap": True,
        "startDate": overall_start.strftime("%Y-%m-%d"),
        "endDate": overall_end.strftime("%Y-%m-%d"),
        "datasetCount": len(dataset_ids)
    }


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "climate-timeseries-api"}


# Include router
app.include_router(router)


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Climate Time Series API...")
    print("📍 API will be available at: http://localhost:8000")
    print("📚 API docs at: http://localhost:8000/docs")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)