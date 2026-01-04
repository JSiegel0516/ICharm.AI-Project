from typing import List, Optional, Dict, Any
from datetime import datetime
import xarray as xr
import pandas as pd
import numpy as np
import cftime

from icharm.services.data.app.models import (
    AnalysisModel,
    AggregationMethod,
    Statistics,
    DatasetMetadata,
    ChartType,
)

import logging

logger = logging.getLogger(__name__)


# ============================================================================
# DATA PROCESSING FUNCTIONS
# ============================================================================
class DataProcessing:
    @staticmethod
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

    @staticmethod
    async def extract_time_series(
        ds: xr.Dataset,
        metadata: pd.Series,
        start_date: datetime,
        end_date: datetime,
        spatial_bounds: Optional[Dict[str, float]] = None,
        aggregation: Optional[AggregationMethod] = AggregationMethod.MEAN,
        level_value: Optional[float] = None,
        focus_coordinates: Optional[List[Dict[str, float]]] = None,
    ) -> pd.Series:
        """
        Extract time series with advanced spatial selection.

        If focus_coordinates are provided, extracts data from a single point.
        For spatial aggregation, use spatialBounds instead.

        Note: Caller should handle multiple points by calling this function
        once per coordinate.
        """

        if aggregation is None:
            aggregation = AggregationMethod.MEAN

        lat_name, lon_name, time_name = DataProcessing.normalize_coordinates(ds)

        # Time selection
        ds_time = ds.sel({time_name: slice(start_date, end_date)})

        # Get variable
        var_name = metadata["keyVariable"]
        var = ds_time[var_name]

        # Level selection if applicable
        if level_value is not None:
            level_dims = [
                d for d in var.dims if d not in (time_name, lat_name, lon_name)
            ]
            if level_dims:
                var = var.sel({level_dims[0]: level_value}, method="nearest")

        # Point-based extraction if focus coordinates provided
        if focus_coordinates and len(focus_coordinates) > 0:
            coord = focus_coordinates[0]

            if lat_name and lon_name:
                # Select nearest point to the specified coordinate
                point_data = var.sel(
                    {lat_name: coord["lat"], lon_name: coord["lon"]},
                    method="nearest",
                )

                # Convert to pandas Series
                series = point_data.to_pandas()

                # Ensure datetime index
                if not isinstance(series.index, pd.DatetimeIndex):
                    series.index = pd.to_datetime(series.index)

                return series
            else:
                raise ValueError(
                    "Cannot extract point data: lat/lon coordinates not found in dataset"
                )

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

            return series

    @staticmethod
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

    @staticmethod
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

    @staticmethod
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

    @staticmethod
    def ensure_datetime_coordinates(ds: xr.Dataset) -> xr.Dataset:
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

    @staticmethod
    def coerce_time_value(target: datetime, coord: xr.DataArray) -> Any:
        """
        Coerce a datetime to the same type as a time coordinate (handles cftime).
        """
        if coord.size == 0:
            return target

        sample = coord.values[0]
        if isinstance(sample, cftime.datetime):
            cls = sample.__class__
            calendar = getattr(
                sample, "calendar", coord.attrs.get("calendar", "standard")
            )
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
                logger.warning(
                    "Failed to coerce datetime for cftime coordinate: %s", exc
                )
                return target

        return target
