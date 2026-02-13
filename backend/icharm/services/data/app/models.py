from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

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
        return v


class DatasetRequest(BaseModel):
    dataset_id: str = Field(..., alias="datasetId", description="Dataset UUID")


class GridboxDataRequest(BaseModel):
    dataset_id: str = Field(..., alias="datasetId", description="Dataset UUID")
    timestamp_id: int = Field(..., alias="timestampId", description="Timestamp id")
    level_id: int = Field(..., alias="levelId", description="Level id")


class TimeseriesDataRequest(BaseModel):
    dataset_id: str = Field(..., alias="datasetId", description="Dataset UUID")
    gridbox_id: int = Field(..., alias="gridboxId", description="Gridbox id")
    level_id: int = Field(..., alias="levelId", description="Level id")


class Metadata(BaseModel):
    id: str
    slug: str
    source_name: str | None = Field(None, alias="sourceName")
    dataset_name: str | None = Field(None, alias="datasetName")
    dataset_short_name: str | None = Field(None, alias="datasetShortName")
    description: str | None = None
    layer_parameter: str | None = Field(None, alias="layerParameter")
    statistic: str | None = None
    dataset_type: str | None = Field(None, alias="datasetType")
    levels: str | None = None
    level_values: str | None = Field(None, alias="levelValues")
    level_units: str | None = Field(None, alias="levelUnits")
    stored: str | None = None
    storage_type: str | None = Field(None, alias="storageType")
    postgres_processor: str | None = Field(None, alias="postgresProcessor")
    to_process: str | None = Field(None, alias="toProcess")
    input_file: str | None = Field(None, alias="inputFile")
    key_variable: str | None = Field(None, alias="keyVariable")
    level_variable: str | None = Field(None, alias="levelVariable")
    units: str | None = None
    spatial_resolution: str | None = Field(None, alias="spatialResolution")
    engine: str | None = None
    kerchunk_path: str | None = Field(None, alias="kerchunkPath")
    info_location: str | None = Field(None, alias="infoLocation")
    orig_location: str | None = Field(None, alias="origLocation")
    start_date: str | None = Field(None, alias="startDate")
    end_date: str | None = Field(None, alias="endDate")


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
    smoothGridBoxValues: Optional[bool] = Field(
        True,
        description="Smooth gridbox rendering when generating raster textures",
    )
    minValue: Optional[float] = Field(
        None, description="Override minimum value for color mapping (zero-centered)"
    )
    maxValue: Optional[float] = Field(
        None, description="Override maximum value for color mapping (zero-centered)"
    )
    # Backward/alias support
    min: Optional[float] = Field(
        None, description="Alias for minValue to support legacy callers"
    )
    max: Optional[float] = Field(
        None, description="Alias for maxValue to support legacy callers"
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
