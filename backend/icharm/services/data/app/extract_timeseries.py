from typing import Optional, List, Dict, Any

from icharm.services.data.app.database_queries import DatabaseQueries
from icharm.services.data.app.dataset_cloud import DatasetCloud
from icharm.services.data.app.dataset_local import DatasetLocal
from icharm.services.data.app.models import (
    Statistics,
)
from fastapi import HTTPException

from datetime import datetime

import pandas as pd
import numpy as np

import asyncio


from icharm.services.data.app.data_processing import DataProcessing
from icharm.services.data.app.models import (
    DatasetMetadata,
    TimeSeriesResponse,
    TimeSeriesRequest,
    DataPoint,
)

import logging

logger = logging.getLogger(__name__)


class ExtractTimeseries:
    @staticmethod
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

    @staticmethod
    async def extract_timeseries_old(request: TimeSeriesRequest) -> TimeSeriesResponse:
        """
        I found two copies of the extract_timeseries code in the same
        method, so I split them and put the 2nd one here. I'm not sure if this is dead code
        or what.

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
            metadata_df = DatabaseQueries.get_metadata_by_ids(request.datasetIds)

            if len(metadata_df) == 0:
                raise HTTPException(
                    status_code=404, detail="No datasets found with provided IDs"
                )

            # Process each dataset
            all_series = {}
            dataset_metadata = {}
            # TODO: leaving statistics as None vs {}. It should just be {}
            statistics: Dict[str, Any] | None = (
                {} if request.includeStatistics else None
            )

            for _, meta_row in metadata_df.iterrows():
                try:
                    is_local = meta_row["Stored"] == "local"

                    # Open dataset
                    if is_local:
                        ds = await DatasetLocal.open_local_dataset(meta_row)
                    else:
                        ds = await DatasetCloud.open_cloud_dataset(
                            meta_row, start_date, end_date
                        )

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
                    series = await DataProcessing.extract_time_series(
                        ds,
                        meta_row,
                        start_date,
                        end_date,
                        spatial_bounds=request.spatialBounds,
                        aggregation=request.aggregation,
                        level_value=level_value,
                    )

                    # Apply analysis model
                    series = DataProcessing.apply_analysis_model(
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
                    # TODO: "statistics is not None" is a mypy fix for now
                    if request.includeStatistics and statistics is not None:
                        statistics[dataset_id] = DataProcessing.calculate_statistics(
                            series
                        )

                except Exception as e:
                    logger.error(
                        f"Error processing dataset {meta_row['datasetName']}: {e}"
                    )
                    # Continue with other datasets
                    continue

            if not all_series:
                raise HTTPException(
                    status_code=500, detail="Failed to extract data from any dataset"
                )

            # Align all series to common time index
            # TODO: Looping and checking for not populated isn't a good idea
            #       What if len(all_series) is 0?
            common_index = None
            for series in all_series.values():
                if common_index is None:
                    common_index = series.index
                else:
                    common_index = common_index.intersection(series.index)

            # Build response data
            if common_index is None:
                raise Exception("No common index found")
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
                chart_config = DataProcessing.generate_chart_config(
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
            raise HTTPException(
                status_code=500, detail=f"Internal server error: {str(e)}"
            )

    @staticmethod
    async def extract_timeseries(request: TimeSeriesRequest) -> DataProcessing:
        start_time = datetime.now()

        try:
            # Parse dates
            start_date = datetime.strptime(request.startDate, "%Y-%m-%d")
            end_date = datetime.strptime(request.endDate, "%Y-%m-%d")

            # NEW: Parse focus coordinates if provided
            focus_coords = ExtractTimeseries.parse_focus_coordinates(
                request.focusCoordinates
            )
            if focus_coords:
                logger.info(
                    f"Processing request with {len(focus_coords)} focus coordinate(s)"
                )
                for i, coord in enumerate(focus_coords):
                    logger.info(
                        f"  Coordinate {i + 1}: lat={coord['lat']}, lon={coord['lon']}"
                    )

            # Get metadata for requested datasets (UUIDs)
            metadata_df = DatabaseQueries.get_metadata_by_ids(request.datasetIds)

            if len(metadata_df) == 0:
                raise HTTPException(
                    status_code=404, detail="No datasets found with provided IDs"
                )

            # Check if any PostgreSQL datasets are requested without coordinates
            if not focus_coords or len(focus_coords) == 0:
                postgres_datasets = metadata_df[
                    metadata_df["stored"].str.lower() == "postgres"
                ]
                if len(postgres_datasets) > 0:
                    dataset_names = postgres_datasets["datasetName"].tolist()
                    if len(dataset_names) == 1:
                        msg = (
                            f"Dataset '{dataset_names[0]}' requires focus coordinates. "
                            "This dataset is currently unavailable for spatial aggregation."
                        )
                    else:
                        names_str = "', '".join(dataset_names)
                        msg = (
                            f"Datasets '{names_str}' require focus coordinates. "
                            "These datasets are currently unavailable for spatial aggregation."
                        )
                    raise HTTPException(status_code=400, detail=msg)

            # Process each dataset
            all_series: dict[str, pd.Series] = {}
            dataset_metadata = {}
            statistics: dict[str, Statistics] | None = (
                {} if request.includeStatistics else None
            )

            for _, meta_row in metadata_df.iterrows():
                try:
                    is_local = meta_row["stored"] == "local"
                    dataset_name = str(meta_row.get("datasetName") or "")

                    # Clip requested range to dataset coverage when metadata is available
                    effective_start = start_date
                    effective_end = end_date
                    meta_start_raw = meta_row.get("startDate")
                    meta_end_raw = meta_row.get("endDate")

                    try:
                        meta_start = datetime.strptime(str(meta_start_raw), "%Y-%m-%d")
                        meta_end = datetime.strptime(str(meta_end_raw), "%Y-%m-%d")
                        effective_start = max(start_date, meta_start)
                        effective_end = min(end_date, meta_end)

                        if effective_end < effective_start:
                            logger.warning(
                                "Requested date range %s to %s is outside coverage for %s (%s to %s); skipping dataset",
                                start_date.date(),
                                end_date.date(),
                                meta_row.get("datasetName"),
                                meta_start.date(),
                                meta_end.date(),
                            )
                            continue

                        if effective_start != start_date or effective_end != end_date:
                            logger.info(
                                "Clipped request to dataset coverage for %s: %s to %s",
                                meta_row.get("datasetName"),
                                effective_start.date(),
                                effective_end.date(),
                            )
                    except Exception as meta_date_error:
                        logger.debug(
                            "Could not parse date metadata for %s, using requested range: %s",
                            meta_row.get("datasetName"),
                            meta_date_error,
                        )

                    # DETERMINE EXTRACTION METHOD: PostgreSQL vs Xarray
                    # Check metadata: if Stored="postgres", use PostgreSQL extraction
                    use_postgres = (
                        str(meta_row.get("storageType", "")).lower()
                        == "local_postgres_netcdf"
                        and focus_coords
                        and len(focus_coords) > 0
                    )

                    if use_postgres:
                        postgres_db_name = str(meta_row.get("inputFile", ""))
                        logger.info(
                            f"Using PostgreSQL extraction for dataset: {dataset_name}"
                        )
                        logger.info(f"  Database: {postgres_db_name}")

                    # Determine level if multi-level (needed for xarray)
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

                    # Open dataset once (reuse for multiple points or spatial aggregation)
                    ds = None
                    if not use_postgres:
                        if is_local:
                            ds = await DatasetLocal.open_local_dataset(meta_row)
                        else:
                            ds = await DatasetCloud.open_cloud_dataset(
                                meta_row, effective_start, effective_end
                            )

                    # Handle spatial aggregation (no coordinates provided)
                    if not focus_coords or len(focus_coords) == 0:
                        try:
                            # STEP 1: Extract raw series with spatial aggregation
                            series = await DataProcessing.extract_time_series(
                                ds,
                                meta_row,
                                effective_start,
                                effective_end,
                                spatial_bounds=request.spatialBounds,
                                aggregation=request.aggregation,
                                level_value=level_value,
                                focus_coordinates=None,
                            )

                            # STEP 2: Apply post-processing
                            series = DataProcessing.apply_analysis_model(
                                series, request.analysisModel, request.smoothingWindow
                            )

                            if request.normalize:
                                series_min = series.min()
                                series_max = series.max()
                                if series_max > series_min:
                                    series = (series - series_min) / (
                                        series_max - series_min
                                    )

                            if request.resampleFreq:
                                series = series.resample(request.resampleFreq).mean()

                            # STEP 3: Create series key and metadata
                            dataset_id = str(meta_row["id"])
                            series_key = dataset_id

                            # Store series
                            all_series[series_key] = series

                            # Add metadata
                            if request.includeMetadata:
                                dataset_metadata[series_key] = DatasetMetadata(
                                    id=series_key,
                                    slug=meta_row.get("slug"),
                                    name=meta_row["datasetName"],
                                    source=meta_row["sourceName"],
                                    units=meta_row["units"],
                                    spatialResolution=meta_row.get("spatialResolution"),
                                    temporalResolution=meta_row.get(
                                        "statistic", "Monthly"
                                    ),
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
                                statistics[series_key] = (
                                    DataProcessing.calculate_statistics(series)
                                )

                        except Exception as e:
                            logger.error(
                                f"Failed to extract spatial aggregation for {meta_row['datasetName']}: {e}"
                            )
                            continue

                    # Handle point-based extraction (coordinates provided)
                    else:
                        for coord_idx, coord in enumerate(focus_coords):
                            try:
                                # STEP 1: Extract raw series
                                if use_postgres and coord:
                                    # PostgreSQL extraction (point-based)
                                    series = await asyncio.to_thread(
                                        DatabaseQueries.extract_timeseries_from_postgres,
                                        start_date=effective_start,
                                        end_date=effective_end,
                                        lat=coord["lat"],
                                        lon=coord["lon"],
                                        database_name=postgres_db_name,
                                    )
                                    logger.info(
                                        f"PostgreSQL extracted {len(series)} points for point {coord_idx + 1}"
                                    )
                                else:
                                    # Xarray extraction (point-based)
                                    series = await DataProcessing.extract_time_series(
                                        ds,
                                        meta_row,
                                        effective_start,
                                        effective_end,
                                        spatial_bounds=None,
                                        aggregation=request.aggregation,
                                        level_value=level_value,
                                        focus_coordinates=[coord],
                                    )

                                # STEP 2: Apply post-processing
                                series = DataProcessing.apply_analysis_model(
                                    series,
                                    request.analysisModel,
                                    request.smoothingWindow,
                                )

                                if request.normalize:
                                    series_min = series.min()
                                    series_max = series.max()
                                    if series_max > series_min:
                                        series = (series - series_min) / (
                                            series_max - series_min
                                        )

                                if request.resampleFreq:
                                    series = series.resample(
                                        request.resampleFreq
                                    ).mean()

                                # STEP 3: Create series key and metadata
                                dataset_id = str(meta_row["id"])

                                # Determine series key based on number of coordinates
                                if len(focus_coords) > 1:
                                    series_key = f"{dataset_id}_point_{coord_idx + 1}"
                                    point_label = f" (Point {coord_idx + 1}: {coord['lat']:.2f}, {coord['lon']:.2f})"
                                    description = (
                                        f"Lat: {coord['lat']}, Lon: {coord['lon']}"
                                    )
                                else:
                                    series_key = dataset_id
                                    point_label = ""
                                    description = meta_row.get("description")

                                # Store series
                                all_series[series_key] = series

                                # Add metadata
                                if request.includeMetadata:
                                    dataset_metadata[series_key] = DatasetMetadata(
                                        id=series_key,
                                        slug=meta_row.get("slug"),
                                        name=meta_row["datasetName"] + point_label,
                                        source=meta_row["sourceName"],
                                        units=meta_row["units"],
                                        spatialResolution=meta_row.get(
                                            "spatialResolution"
                                        ),
                                        temporalResolution=meta_row.get(
                                            "statistic", "Monthly"
                                        ),
                                        startDate=meta_row["startDate"],
                                        endDate=meta_row["endDate"],
                                        isLocal=is_local,
                                        level=f"{level_value} {meta_row.get('levelUnits', '')}"
                                        if level_value
                                        else None,
                                        description=description,
                                    )

                                # Calculate statistics
                                if request.includeStatistics and statistics is not None:
                                    statistics[series_key] = (
                                        DataProcessing.calculate_statistics(series)
                                    )

                            except Exception as point_error:
                                logger.error(
                                    f"Failed to extract point {coord_idx + 1}: {point_error}"
                                )
                                continue

                except Exception as e:
                    logger.error(
                        f"Error processing dataset {meta_row['datasetName']}: {e}"
                    )
                    # Continue with other datasets
                    continue

            if not all_series:
                raise HTTPException(
                    status_code=500, detail="Failed to extract data from any dataset"
                )

            # Log what series we have
            logger.info(f"Building response with {len(all_series)} series:")
            for series_key, series_data in all_series.items():
                logger.info(
                    f"  - {series_key}: {len(series_data)} points, "
                    f"range: {series_data.index[0]} to {series_data.index[-1]}"
                )

            # Align all series to common time index
            common_index = pd.concat(all_series.values(), axis=1).index
            common_index = common_index.sort_values()
            logger.info(f"Common index has {len(common_index)} timestamps")

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

            logger.info(f"Built {len(data_points)} data points for response")

            # Log metadata
            logger.info(f"Metadata for {len(dataset_metadata)} series:")
            for meta_key, meta_data in dataset_metadata.items():
                logger.info(f"  - {meta_key}: {meta_data.name}")

            # Generate chart configuration
            chart_config = None
            if request.chartType and dataset_metadata:
                chart_config = DataProcessing.generate_chart_config(
                    list(all_series.keys()), request.chartType, dataset_metadata
                )

            # Processing info
            processing_time = (datetime.now() - start_time).total_seconds()

            # Calculate total data points across all series
            total_data_points = sum(len(series) for series in all_series.values())

            # Count unique datasets (remove _point_N suffix if present)
            unique_datasets = set()
            for series_key in all_series.keys():
                # Remove _point_N suffix to get base dataset ID
                base_id = series_key.rsplit("_point_", 1)[0]
                unique_datasets.add(base_id)

            processing_info = {
                "processingTime": f"{processing_time:.2f}s",
                "totalPoints": total_data_points,
                "datasetsProcessed": len(unique_datasets),
                "seriesGenerated": len(
                    all_series
                ),  # Number of separate series (may be > datasets if multiple points)
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
                "focusCoordinates": len(focus_coords) if focus_coords else None,
                "extractionMode": "point-based"
                if focus_coords
                else "spatial-aggregation",
            }

            logger.info(
                f"Returning response with {len(data_points)} data points, "
                f"{len(dataset_metadata) if dataset_metadata else 0} metadata entries"
            )

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
            raise HTTPException(
                status_code=500, detail=f"Internal server error: {str(e)}"
            )
