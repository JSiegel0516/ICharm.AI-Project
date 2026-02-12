import os

import pandas
from fastapi import HTTPException
from datetime import datetime
import numpy as np
import asyncio

from icharm.services.data.app.data_processing import DataProcessing
from icharm.services.data.app.database_queries import DatabaseQueries
from icharm.services.data.app.dataset_cloud import DatasetCloud
from icharm.services.data.app.dataset_local import DatasetLocal
from icharm.services.data.app.models import (
    RasterRequest,
)

# Import raster visualization module
from icharm.services.data.app.raster import (
    serialize_raster_array,
    serialize_raster_grid_array,
)

import logging

logger = logging.getLogger(__name__)


try:
    ZERO_PRECIP_MASK_TOLERANCE = float(os.getenv("ZERO_PRECIP_MASK_TOLERANCE", "1e-6"))
except ValueError:
    ZERO_PRECIP_MASK_TOLERANCE = 1e-6


class VisualizeRaster:
    @staticmethod
    async def visualize_raster(request: RasterRequest):
        start_time = datetime.now()

        try:
            # Parse date
            target_date = datetime.strptime(request.date, "%Y-%m-%d")

            # CRITICAL FIX: Properly extract custom range from request
            # Try both field names for compatibility
            chosen_min = (
                request.minValue if request.minValue is not None else request.min
            )
            chosen_max = (
                request.maxValue if request.maxValue is not None else request.max
            )

            # Log the incoming request
            logger.info("[RasterViz] Request received:")
            logger.info(f"  datasetId: {request.datasetId}")
            logger.info(f"  date: {request.date}")
            logger.info(f"  level: {request.level}")
            logger.info(f"  Custom range: min={chosen_min}, max={chosen_max}")
            logger.info(f"  CSS colors: {len(request.cssColors or [])}")
            logger.info(f"  Smooth gridboxes: {request.smoothGridBoxValues}")

            # Get metadata
            metadata_df = DatabaseQueries.get_metadata_by_ids([request.datasetId])
            if len(metadata_df) == 0:
                raise HTTPException(
                    status_code=404, detail=f"Dataset not found: {request.datasetId}"
                )

            metadata_df = metadata_df.reset_index(drop=True)
            meta_row = metadata_df.iloc[0]

            # Open dataset
            stored = str(meta_row.get("stored") or meta_row.get("Stored") or "").lower()
            if stored == "local":
                ds = await DatasetLocal.open_local_dataset(meta_row)
            elif stored == "postgres":
                ds = await asyncio.to_thread(
                    DatabaseQueries.open_postgres_raster_dataset, meta_row, target_date
                )
            else:
                ds = await DatasetCloud.open_cloud_dataset(
                    meta_row, target_date, target_date
                )

            # Get the variable
            var_name = meta_row["keyVariable"]
            var = ds[var_name]

            # Find time dimension
            lat_name, lon_name, time_name = DataProcessing.normalize_coordinates(ds)

            # Select the specific time
            if time_name in var.dims:
                selector_value = DataProcessing.coerce_time_value(
                    target_date, ds[time_name]
                )
                var = var.sel({time_name: selector_value}, method="nearest")

            # Select level if specified
            if request.level is not None:
                level_dims = [
                    d for d in var.dims if d not in (time_name, lat_name, lon_name)
                ]
                if level_dims:
                    var = var.sel({level_dims[0]: request.level}, method="nearest")

            # Apply zero masking if requested
            zero_mask_applied = False
            zero_mask_pixels = 0

            if request.maskZeroValues:
                if VisualizeRaster.dataset_supports_zero_mask(meta_row):
                    zero_mask = var.notnull() & (
                        np.abs(var) <= ZERO_PRECIP_MASK_TOLERANCE
                    )
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

            # Generate raster visualization with custom range
            logger.info(
                f"[RasterViz] Generating visualization with custom range: [{chosen_min}, {chosen_max}]"
            )

            raster_data = serialize_raster_array(
                var,
                meta_row,
                meta_row["datasetName"],
                css_colors=request.cssColors,
                value_min_override=chosen_min,  # Pass the custom min
                value_max_override=chosen_max,  # Pass the custom max
                smooth_gridboxes=(
                    request.smoothGridBoxValues
                    if request.smoothGridBoxValues is not None
                    else True
                ),
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
                "customRangeApplied": chosen_min is not None or chosen_max is not None,
                "effectiveRange": {
                    "min": chosen_min,
                    "max": chosen_max,
                },
            }

            logger.info(
                f"[RasterViz] Raster visualization generated successfully in {processing_time:.2f}s"
            )
            logger.info(
                f"[RasterViz] Value range used: [{raster_data['valueRange']['min']}, "
                f"{raster_data['valueRange']['max']}]"
            )

            return raster_data

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[RasterViz] Error generating raster visualization: {e}")
            import traceback

            logger.error(traceback.format_exc())
            raise HTTPException(
                status_code=500,
                detail=f"Failed to generate raster visualization: {str(e)}",
            )

    @staticmethod
    async def visualize_raster_grid(request: RasterRequest):
        start_time = datetime.now()

        try:
            target_date = datetime.strptime(request.date, "%Y-%m-%d")

            chosen_min = (
                request.minValue if request.minValue is not None else request.min
            )
            chosen_max = (
                request.maxValue if request.maxValue is not None else request.max
            )

            logger.info("[RasterGrid] Request received:")
            logger.info(f"  datasetId: {request.datasetId}")
            logger.info(f"  date: {request.date}")
            logger.info(f"  level: {request.level}")
            logger.info(f"  Custom range: min={chosen_min}, max={chosen_max}")

            metadata_df = DatabaseQueries.get_metadata_by_ids([request.datasetId])
            if len(metadata_df) == 0:
                raise HTTPException(
                    status_code=404, detail=f"Dataset not found: {request.datasetId}"
                )

            metadata_df = metadata_df.reset_index(drop=True)
            meta_row = metadata_df.iloc[0]

            stored = str(meta_row.get("stored") or meta_row.get("Stored") or "").lower()
            if stored == "local":
                ds = await DatasetLocal.open_local_dataset(meta_row)
            elif stored == "postgres":
                ds = await asyncio.to_thread(
                    DatabaseQueries.open_postgres_raster_dataset, meta_row, target_date
                )
            else:
                ds = await DatasetCloud.open_cloud_dataset(
                    meta_row, target_date, target_date
                )

            var_name = meta_row["keyVariable"]
            var = ds[var_name]

            lat_name, lon_name, time_name = DataProcessing.normalize_coordinates(ds)

            if time_name in var.dims:
                selector_value = DataProcessing.coerce_time_value(
                    target_date, ds[time_name]
                )
                var = var.sel({time_name: selector_value}, method="nearest")

            if request.level is not None:
                level_dims = [
                    d for d in var.dims if d not in (time_name, lat_name, lon_name)
                ]
                if level_dims:
                    var = var.sel({level_dims[0]: request.level}, method="nearest")

            zero_mask_applied = False
            zero_mask_pixels = 0

            if request.maskZeroValues:
                if VisualizeRaster.dataset_supports_zero_mask(meta_row):
                    zero_mask = var.notnull() & (
                        np.abs(var) <= ZERO_PRECIP_MASK_TOLERANCE
                    )
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
                            "[RasterGrid] maskZeroValues enabled - masking %s "
                            "zero-value pixels (%.1f%% of slice)",
                            zero_mask_pixels,
                            zero_fraction * 100.0,
                        )
                        var = var.where(~zero_mask)
                        zero_mask_applied = True
                    else:
                        logger.info(
                            "[RasterGrid] maskZeroValues requested but no zero-value "
                            "pixels detected for %s",
                            meta_row["datasetName"],
                        )
                else:
                    logger.info(
                        "[RasterGrid] maskZeroValues requested but dataset %s is not "
                        "precipitation-focused; skipping zero mask",
                        meta_row["datasetName"],
                    )

            logger.info(
                f"[RasterGrid] Generating grid with custom range: [{chosen_min}, {chosen_max}]"
            )

            grid_data = serialize_raster_grid_array(
                var,
                meta_row,
                meta_row["datasetName"],
                value_min_override=chosen_min,
                value_max_override=chosen_max,
            )

            processing_time = (datetime.now() - start_time).total_seconds()
            grid_data["processingInfo"] = {
                "processingTime": f"{processing_time:.2f}s",
                "date": request.date,
                "level": request.level,
                "datasetId": request.datasetId,
                "maskZeroValuesApplied": zero_mask_applied,
                "maskedZeroPixels": zero_mask_pixels if zero_mask_applied else 0,
                "customRangeApplied": chosen_min is not None or chosen_max is not None,
                "effectiveRange": {"min": chosen_min, "max": chosen_max},
            }

            logger.info(
                f"[RasterGrid] Raster grid generated successfully in {processing_time:.2f}s"
            )

            return grid_data

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[RasterGrid] Error generating raster grid: {e}")
            import traceback

            logger.error(traceback.format_exc())
            raise HTTPException(
                status_code=500,
                detail=f"Failed to generate raster grid: {str(e)}",
            )

    @staticmethod
    def dataset_supports_zero_mask(metadata: pandas.Series) -> bool:
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
