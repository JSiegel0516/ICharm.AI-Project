"""
Climate Data Tools - Functions the LLM can call to query real data.
"""

from __future__ import annotations

import json
import logging
import statistics
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


class ClimateDataTools:
    """
    Tools for climate data extraction and analysis.
    Each method here can be invoked by the LLM as a function call.
    """

    def __init__(self, data_api_base_url: str):
        """
        Initialize with the Data API base URL.
        Example: http://localhost:8000
        """
        self.data_api_url = data_api_base_url.rstrip("/")
        self.client = httpx.AsyncClient(timeout=60.0)

    @property
    def tool_definitions(self) -> List[Dict[str, Any]]:
        """
        Return tool definitions in Anthropic/OpenAI function calling format.
        This tells the LLM what functions exist and how to call them.
        """
        return [
            {
                "name": "get_available_datasets",
                "description": (
                    "Get a list of all available climate datasets. "
                    "Returns metadata including dataset ID, name, description, "
                    "variables, spatial resolution, temporal coverage, and data source."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "category": {
                            "type": "string",
                            "enum": [
                                "precipitation",
                                "temperature",
                                "vegetation",
                                "all",
                            ],
                            "description": "Filter datasets by category. Use 'all' for no filtering.",
                        }
                    },
                    "required": [],
                },
            },
            {
                "name": "extract_dataset_timeseries",
                "description": (
                    "Extract a spatially-aggregated time series for a dataset over a time range. "
                    "Returns values and summary statistics like max/min/mean. "
                    "Use this for global or regional averages when no point location is provided."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "dataset_id": {
                            "type": "string",
                            "description": "Dataset identifier (e.g., NOAA Global Surface Temperature dataset id)",
                        },
                        "start_date": {
                            "type": "string",
                            "description": "Start date in ISO format YYYY-MM-DD",
                        },
                        "end_date": {
                            "type": "string",
                            "description": "End date in ISO format YYYY-MM-DD",
                        },
                        "aggregation": {
                            "type": "string",
                            "enum": ["mean", "max", "min", "sum", "median", "std"],
                            "description": "Spatial aggregation method for the dataset",
                        },
                        "analysis_type": {
                            "type": "string",
                            "enum": ["raw", "anomaly", "trend"],
                            "description": "Analysis mode for the time series",
                        },
                        "resample_freq": {
                            "type": "string",
                            "description": "Optional pandas-style resample frequency, e.g. 'M' or 'D'",
                        },
                        "spatial_bounds": {
                            "type": "object",
                            "properties": {
                                "west": {"type": "number"},
                                "south": {"type": "number"},
                                "east": {"type": "number"},
                                "north": {"type": "number"},
                            },
                            "description": "Optional bounding box for regional aggregation",
                        },
                    },
                    "required": ["dataset_id", "start_date", "end_date"],
                },
            },
            {
                "name": "extract_point_timeseries",
                "description": (
                    "Extract time series data for a specific point location (latitude/longitude). "
                    "Returns daily/subdaily values with timestamps, plus statistical summary "
                    "(mean, median, std dev, min, max, percentiles). "
                    "Use this when users ask about data 'at a location', 'for coordinates', "
                    "or 'in [city name]' after geocoding."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "dataset_id": {
                            "type": "string",
                            "description": "Dataset identifier (e.g., 'cmorph', 'era5_temp', 'modis_ndvi')",
                        },
                        "latitude": {
                            "type": "number",
                            "description": "Latitude in decimal degrees (-90 to 90)",
                        },
                        "longitude": {
                            "type": "number",
                            "description": "Longitude in decimal degrees (-180 to 180)",
                        },
                        "start_date": {
                            "type": "string",
                            "description": "Start date in ISO format YYYY-MM-DD",
                        },
                        "end_date": {
                            "type": "string",
                            "description": "End date in ISO format YYYY-MM-DD",
                        },
                        "variable": {
                            "type": "string",
                            "description": "Variable name (optional, e.g., 'precipitation', 'temperature_2m')",
                        },
                        "analysis_type": {
                            "type": "string",
                            "enum": ["raw", "anomaly", "trend"],
                            "description": (
                                "Analysis mode: 'raw' for actual values, "
                                "'anomaly' for deviation from mean, "
                                "'trend' for fitted trend line"
                            ),
                        },
                    },
                    "required": [
                        "dataset_id",
                        "latitude",
                        "longitude",
                        "start_date",
                        "end_date",
                    ],
                },
            },
            {
                "name": "compare_multiple_locations",
                "description": (
                    "Compare data across multiple locations for the same dataset and time period. "
                    "Returns statistics for each location to enable comparisons. "
                    "Use when users ask to 'compare [location A] and [location B]' or "
                    "'which location has more/less [variable]'."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "dataset_id": {
                            "type": "string",
                            "description": "Dataset to use for all locations",
                        },
                        "locations": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {
                                        "type": "string",
                                        "description": "Location label",
                                    },
                                    "latitude": {"type": "number"},
                                    "longitude": {"type": "number"},
                                },
                                "required": ["name", "latitude", "longitude"],
                            },
                            "description": "Array of location objects to compare",
                        },
                        "start_date": {"type": "string"},
                        "end_date": {"type": "string"},
                        "variable": {"type": "string"},
                    },
                    "required": ["dataset_id", "locations", "start_date", "end_date"],
                },
            },
            {
                "name": "get_dataset_info",
                "description": (
                    "Get detailed metadata for a specific dataset including: "
                    "full description, available variables, units, spatial/temporal resolution, "
                    "coverage area, time range, update frequency, and data source citation. "
                    "Use when users ask 'what is [dataset]' or 'tell me about [dataset]'."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "dataset_id": {
                            "type": "string",
                            "description": "Dataset identifier",
                        }
                    },
                    "required": ["dataset_id"],
                },
            },
            {
                "name": "calculate_statistics",
                "description": (
                    "Calculate advanced statistics on already-extracted timeseries data. "
                    "Computes percentiles, trends, seasonality, extremes. "
                    "Use after extract_point_timeseries to perform deeper analysis."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "dataset_id": {"type": "string"},
                        "latitude": {"type": "number"},
                        "longitude": {"type": "number"},
                        "start_date": {"type": "string"},
                        "end_date": {"type": "string"},
                        "stat_type": {
                            "type": "string",
                            "enum": [
                                "percentiles",
                                "trend_analysis",
                                "seasonal_cycle",
                                "extremes",
                            ],
                            "description": "Type of statistical analysis",
                        },
                    },
                    "required": [
                        "dataset_id",
                        "latitude",
                        "longitude",
                        "start_date",
                        "end_date",
                        "stat_type",
                    ],
                },
            },
            {
                "name": "calculate_climate_index",
                "description": (
                    "Calculate standardized climate indices like SPI (Standardized Precipitation Index) "
                    "or drought severity metrics. These indices are used for monitoring climate extremes. "
                    "Use when users ask about 'drought', 'SPI', or 'climate anomalies'."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "dataset_id": {"type": "string"},
                        "latitude": {"type": "number"},
                        "longitude": {"type": "number"},
                        "index_type": {
                            "type": "string",
                            "enum": ["SPI", "SPEI", "drought_severity"],
                            "description": "Climate index to calculate",
                        },
                        "time_scale": {
                            "type": "integer",
                            "description": "Time scale in months (e.g., 3, 6, 12 for SPI-3, SPI-6, SPI-12)",
                        },
                        "start_date": {"type": "string"},
                        "end_date": {"type": "string"},
                    },
                    "required": [
                        "dataset_id",
                        "latitude",
                        "longitude",
                        "index_type",
                        "time_scale",
                        "start_date",
                        "end_date",
                    ],
                },
            },
        ]

    async def execute_tool(
        self, tool_name: str, tool_input: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute a tool by name with given input parameters.
        This is called by the LLM service when the model wants to use a tool.

        Returns:
            Dict containing the tool result data
        """
        logger.info("Executing tool", extra={"tool": tool_name, "input": tool_input})

        try:
            if tool_name == "get_available_datasets":
                result = await self._get_available_datasets(tool_input)
            elif tool_name == "extract_dataset_timeseries":
                result = await self._extract_dataset_timeseries(tool_input)
            elif tool_name == "extract_point_timeseries":
                result = await self._extract_point_timeseries(tool_input)
            elif tool_name == "compare_multiple_locations":
                result = await self._compare_multiple_locations(tool_input)
            elif tool_name == "get_dataset_info":
                result = await self._get_dataset_info(tool_input)
            elif tool_name == "calculate_statistics":
                result = await self._calculate_statistics(tool_input)
            elif tool_name == "calculate_climate_index":
                result = await self._calculate_climate_index(tool_input)
            else:
                result = {"error": f"Unknown tool: {tool_name}"}
        except Exception as exc:
            result = {"error": f"Tool execution failed: {exc}"}

        logger.info(
            "Tool completed",
            extra={"tool": tool_name, "success": "error" not in result},
        )
        return result

    # ==================== TOOL IMPLEMENTATIONS ====================

    async def _get_available_datasets(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Fetch list of datasets from Data API"""
        response = await self.client.get(
            f"{self.data_api_url}/api/v2/timeseries/datasets"
        )
        response.raise_for_status()
        result = response.json()
        datasets = result.get("datasets", result)

        # Filter by category if requested
        category = params.get("category", "all")
        if category != "all":
            category_lower = str(category).lower()
            datasets = [
                dataset
                for dataset in datasets
                if category_lower in str(dataset.get("category", "")).lower()
                or category_lower in str(dataset.get("tags", [])).lower()
            ]

        return {
            "datasets": datasets,
            "count": len(datasets),
            "total": result.get("total", len(datasets))
            if isinstance(result, dict)
            else len(datasets),
            "categories": list(
                {dataset.get("category", "unknown") for dataset in datasets}
            ),
        }

    async def _extract_dataset_timeseries(
        self, params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Extract spatially aggregated timeseries for a dataset."""
        payload: Dict[str, Any] = {
            "datasetIds": [params["dataset_id"]],
            "startDate": params["start_date"],
            "endDate": params["end_date"],
            "analysisModel": self._map_analysis_type(params.get("analysis_type")),
            "aggregation": params.get("aggregation", "mean"),
            "includeStatistics": True,
            "includeMetadata": True,
        }

        if params.get("resample_freq"):
            payload["resampleFreq"] = params["resample_freq"]

        if params.get("spatial_bounds"):
            payload["spatialBounds"] = params["spatial_bounds"]

        response = await self.client.post(
            f"{self.data_api_url}/api/v2/timeseries/extract",
            json=payload,
        )
        response.raise_for_status()
        data = response.json()

        series = self._extract_series(data, params["dataset_id"])
        summary = self._summarize_series(series)

        return {
            "data": series,
            "summary": summary,
            "metadata": data.get("metadata"),
            "statistics": data.get("statistics"),
            "processingInfo": data.get("processingInfo"),
        }

    async def _extract_point_timeseries(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Extract timeseries for a single point"""
        focus_coordinates = f"{params['latitude']},{params['longitude']}"
        payload: Dict[str, Any] = {
            "datasetIds": [params["dataset_id"]],
            "focusCoordinates": focus_coordinates,
            "startDate": params["start_date"],
            "endDate": params["end_date"],
            "analysisModel": self._map_analysis_type(params.get("analysis_type")),
            "includeStatistics": True,
            "includeMetadata": True,
        }

        response = await self.client.post(
            f"{self.data_api_url}/api/v2/timeseries/extract",
            json=payload,
        )
        response.raise_for_status()
        data = response.json()

        series = self._extract_series(data, params["dataset_id"])
        summary = self._summarize_series(series)

        return {
            "data": series,
            "summary": summary,
            "metadata": data.get("metadata"),
            "statistics": data.get("statistics"),
            "processingInfo": data.get("processingInfo"),
        }

    async def _compare_multiple_locations(
        self, params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Compare timeseries across multiple locations"""
        locations = params["locations"]

        focus_coordinates = "; ".join(
            f"{loc['latitude']},{loc['longitude']}" for loc in locations
        )

        payload: Dict[str, Any] = {
            "datasetIds": [params["dataset_id"]],
            "focusCoordinates": focus_coordinates,
            "startDate": params["start_date"],
            "endDate": params["end_date"],
            "analysisModel": self._map_analysis_type(params.get("analysis_type")),
            "includeStatistics": True,
            "includeMetadata": True,
        }

        response = await self.client.post(
            f"{self.data_api_url}/api/v2/timeseries/extract",
            json=payload,
        )
        response.raise_for_status()
        data = response.json()

        comparison: Dict[str, Any] = {}
        series_keys = self._resolve_series_keys(
            data, params["dataset_id"], len(locations)
        )

        for idx, loc in enumerate(locations):
            series_key = series_keys[idx] if idx < len(series_keys) else None
            if not series_key:
                comparison[loc["name"]] = {"error": "Series not found for location"}
                continue
            series = self._extract_series(data, series_key)
            summary = self._summarize_series(series)
            comparison[loc["name"]] = {
                "location": {"lat": loc["latitude"], "lng": loc["longitude"]},
                "series_key": series_key,
                "summary": summary,
            }

        return {
            "comparison": comparison,
            "dataset": params["dataset_id"],
            "time_period": {"start": params["start_date"], "end": params["end_date"]},
        }

    async def _get_dataset_info(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get detailed metadata for a specific dataset"""
        response = await self.client.get(
            f"{self.data_api_url}/api/v2/timeseries/datasets"
        )
        response.raise_for_status()
        datasets = response.json()

        dataset_id = params["dataset_id"]
        dataset = next(
            (
                dataset
                for dataset in datasets
                if dataset.get("id") == dataset_id or dataset.get("name") == dataset_id
            ),
            None,
        )

        if not dataset:
            return {"error": f"Dataset '{dataset_id}' not found"}

        return {"dataset": dataset, "available": True}

    async def _calculate_statistics(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate advanced statistics on timeseries data"""
        timeseries_data = await self._extract_point_timeseries(params)

        if "error" in timeseries_data or "data" not in timeseries_data:
            return timeseries_data

        values = [
            point["value"]
            for point in timeseries_data["data"]
            if point.get("value") is not None
        ]
        timestamps = [
            point["date"]
            for point in timeseries_data["data"]
            if point.get("value") is not None
        ]

        if not values:
            return {"error": "No valid data points"}

        stat_type = params["stat_type"]
        result: Dict[str, Any] = {
            "stat_type": stat_type,
            "location": {"lat": params["latitude"], "lng": params["longitude"]},
        }

        if stat_type == "percentiles":
            sorted_vals = sorted(values)
            n = len(sorted_vals)
            result["percentiles"] = {
                "p10": sorted_vals[int(0.1 * n)],
                "p25": sorted_vals[n // 4],
                "p50": sorted_vals[n // 2],
                "p75": sorted_vals[3 * n // 4],
                "p90": sorted_vals[int(0.9 * n)],
                "p95": sorted_vals[int(0.95 * n)],
                "p99": sorted_vals[int(0.99 * n)] if n > 100 else sorted_vals[-1],
            }

        elif stat_type == "trend_analysis":
            n = len(values)
            x = list(range(n))
            x_mean = sum(x) / n
            y_mean = sum(values) / n

            numerator = sum((x[i] - x_mean) * (values[i] - y_mean) for i in range(n))
            denominator = sum((x[i] - x_mean) ** 2 for i in range(n))

            if denominator > 0:
                slope = numerator / denominator
                intercept = y_mean - slope * x_mean
                result["trend"] = {
                    "slope": slope,
                    "intercept": intercept,
                    "direction": "increasing" if slope > 0 else "decreasing",
                    "change_per_year": slope * 365,
                }

        elif stat_type == "extremes":
            mean_val = statistics.mean(values)
            std_val = statistics.stdev(values) if len(values) > 1 else 0

            extremes = []
            for idx, val in enumerate(values):
                if abs(val - mean_val) > 2 * std_val:
                    extremes.append(
                        {
                            "timestamp": timestamps[idx],
                            "value": val,
                            "deviation_from_mean": val - mean_val,
                        }
                    )

            result["extremes"] = {
                "count": len(extremes),
                "events": extremes[:20],
                "threshold": mean_val + 2 * std_val,
            }

        elif stat_type == "seasonal_cycle":
            monthly_values: Dict[int, List[float]] = {}
            for timestamp, value in zip(timestamps, values):
                try:
                    dt = datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
                except ValueError:
                    continue
                monthly_values.setdefault(dt.month, []).append(value)

            if monthly_values:
                result["seasonal_cycle"] = {
                    "monthly_means": {
                        str(month): statistics.mean(vals)
                        for month, vals in sorted(monthly_values.items())
                    }
                }

        return result

    async def _calculate_climate_index(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate climate indices like SPI"""
        return {
            "index_type": params["index_type"],
            "time_scale": params["time_scale"],
            "location": {"lat": params["latitude"], "lng": params["longitude"]},
            "message": (
                "Climate index calculation requires historical baseline data. "
                "This feature is under development."
            ),
            "recommendation": (
                "Use 'calculate_statistics' with 'trend_analysis' or 'extremes' for now."
            ),
        }

    async def close(self) -> None:
        """Close the HTTP client"""
        await self.client.aclose()

    def dumps_tool_result(self, tool_results: List[Dict[str, Any]]) -> str:
        """Render tool results for non-tool-aware models."""
        return json.dumps(tool_results, indent=2)

    def _map_analysis_type(self, analysis_type: Optional[str]) -> str:
        if analysis_type == "anomaly":
            return "anomaly"
        if analysis_type == "trend":
            return "trend"
        return "raw"

    def _extract_series(
        self, data: Dict[str, Any], dataset_key: str
    ) -> List[Dict[str, Any]]:
        series = []
        points = data.get("data", [])
        for point in points:
            values = point.get("values") or {}
            value = None
            if dataset_key in values:
                value = values.get(dataset_key)
            elif len(values) == 1:
                value = next(iter(values.values()))
            else:
                matching = [val for key, val in values.items() if dataset_key in key]
                value = matching[0] if matching else None

            series.append({"date": point.get("date"), "value": value})
        return series

    def _summarize_series(self, series: List[Dict[str, Any]]) -> Dict[str, Any]:
        values_with_dates = [
            (entry["date"], entry["value"])
            for entry in series
            if entry.get("value") is not None
        ]
        if not values_with_dates:
            return {"count": 0}

        dates, values = zip(*values_with_dates)
        max_value = max(values)
        min_value = min(values)
        max_idx = values.index(max_value)
        min_idx = values.index(min_value)

        sorted_values = sorted(values)
        n = len(values)

        return {
            "count": n,
            "mean": statistics.mean(values),
            "median": statistics.median(values),
            "std_dev": statistics.stdev(values) if n > 1 else 0,
            "min": min_value,
            "min_date": dates[min_idx],
            "max": max_value,
            "max_date": dates[max_idx],
            "p25": sorted_values[n // 4] if n > 0 else None,
            "p75": sorted_values[3 * n // 4] if n > 0 else None,
        }

    def _resolve_series_keys(
        self, data: Dict[str, Any], dataset_id: str, expected: int
    ) -> List[str]:
        metadata = data.get("metadata") or {}
        keys = list(metadata.keys())
        if keys:
            return keys[:expected]
        if expected <= 1:
            return [dataset_id]
        return [f"{dataset_id}_point_{idx + 1}" for idx in range(expected)]
