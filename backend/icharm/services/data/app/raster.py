from __future__ import annotations

import base64
import io
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import xarray as xr
from matplotlib import cm
from PIL import Image
from scipy.ndimage import zoom

PALETTE_RESOLUTION = 256
_COLOR_MAP_CACHE: Dict[str, np.ndarray] = {}
_COLOR_MAP_FALLBACK = "viridis"
_OCEAN_MASK_CACHE: Optional[xr.Dataset] = None
_ZERO_FILL_DATASETS = {
    "NCEP Global Ocean Data Assimilation System (GODAS)",
}

_FILL_ATTR_KEYS = (
    "_FillValue",
    "missing_value",
    "missingValue",
    "missingValues",
    "fill_value",
    "FillValue",
)


def _maybe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    if np.isnan(result):
        return None
    return result


def _decode_fill_values(value: Any) -> List[float]:
    """Coerce NetCDF/Zarr fill value metadata into floats."""
    results: List[float] = []

    if value is None:
        return results

    if isinstance(value, (list, tuple)):
        for item in value:
            results.extend(_decode_fill_values(item))
        return results

    if isinstance(value, np.ndarray):
        return [float(v) for v in value.ravel()]

    if isinstance(value, (np.generic, float, int)):
        return [float(value)]

    if isinstance(value, (bytes, bytearray)):
        for dtype in (np.float32, np.float64):
            size = np.dtype(dtype).itemsize
            if len(value) % size == 0:
                try:
                    arr = np.frombuffer(value, dtype=dtype)
                    results.extend(arr.astype(float).tolist())
                    return results
                except ValueError:
                    continue
        return results

    if isinstance(value, str):
        try:
            return [float(value)]
        except ValueError:
            try:
                decoded = base64.b64decode(value)
            except Exception:
                return results
            for dtype in (np.float32, np.float64):
                size = np.dtype(dtype).itemsize
                if len(decoded) == size:
                    try:
                        arr = np.frombuffer(decoded, dtype=dtype)
                        results.extend(arr.astype(float).tolist())
                        return results
                    except ValueError:
                        continue
            return results

    return results


def _find_color_maps_file() -> Optional[Path]:
    base_path = Path(__file__).resolve()
    for parent in base_path.parents:
        candidate = parent / "src" / "data" / "colorMaps.json"
        if candidate.is_file():
            return candidate
        secondary = parent / "data" / "colorMaps.json"
        if secondary.is_file():
            return secondary
        direct = parent / "colorMaps.json"
        if direct.is_file():
            return direct
    return None


def _hex_to_rgba(value: str) -> Tuple[int, int, int, int]:
    hex_value = value.strip().lstrip("#")
    if len(hex_value) == 6:
        r = int(hex_value[0:2], 16)
        g = int(hex_value[2:4], 16)
        b = int(hex_value[4:6], 16)
        a = 255
    elif len(hex_value) == 8:
        r = int(hex_value[0:2], 16)
        g = int(hex_value[2:4], 16)
        b = int(hex_value[4:6], 16)
        a = int(hex_value[6:8], 16)
    else:
        raise ValueError(f"Unsupported hex colour value: {value}")
    return r, g, b, a


def _css_color_to_rgba(color: str) -> Tuple[int, int, int, int]:
    """Convert CSS color string (hex or rgb/rgba) to RGBA tuple"""
    color = color.strip()

    if color.startswith("#"):
        return _hex_to_rgba(color)

    if color.startswith("rgb"):
        import re

        numbers = re.findall(r"[\d.]+", color)
        if len(numbers) >= 3:
            r = int(float(numbers[0]))
            g = int(float(numbers[1]))
            b = int(float(numbers[2]))
            a = int(float(numbers[3]) * 255) if len(numbers) >= 4 else 255
            return (r, g, b, a)

    try:
        from matplotlib.colors import to_rgba

        rgba = to_rgba(color)
        return (
            int(rgba[0] * 255),
            int(rgba[1] * 255),
            int(rgba[2] * 255),
            int(rgba[3] * 255),
        )
    except Exception:
        return (0, 0, 0, 255)


def _build_gradient(
    stops: List[Tuple[float, Tuple[int, int, int, int]]], resolution: int
) -> np.ndarray:
    if resolution <= 1:
        first = stops[0][1] if stops else (0, 0, 0, 0)
        return np.array([first], dtype=np.uint8)

    stops_sorted = sorted(stops, key=lambda entry: entry[0])
    data = np.zeros((resolution, 4), dtype=np.uint8)

    for index in range(resolution):
        t = index / (resolution - 1)
        lower_idx = 0
        for j in range(len(stops_sorted) - 1):
            if stops_sorted[j][0] <= t <= stops_sorted[j + 1][0]:
                lower_idx = j
                break
        start_pos, start_color = stops_sorted[lower_idx]
        end_pos, end_color = stops_sorted[min(lower_idx + 1, len(stops_sorted) - 1)]
        span = max(end_pos - start_pos, 1e-6)
        factor = min(max((t - start_pos) / span, 0.0), 1.0)
        interpolated = [
            round(
                start_color[channel]
                + (end_color[channel] - start_color[channel]) * factor
            )
            for channel in range(4)
        ]
        data[index] = interpolated
    return data


def _build_palette_from_css_colors(colors: List[str], resolution: int) -> np.ndarray:
    """Build palette directly from CSS color strings (from frontend ColorBar)"""
    if not colors:
        return _matplotlib_palette(_COLOR_MAP_FALLBACK, resolution)

    rgba_colors = [_css_color_to_rgba(c) for c in colors]
    total = max(len(rgba_colors) - 1, 1)
    stops = [
        (min(max(idx / total, 0.0), 1.0), rgba) for idx, rgba in enumerate(rgba_colors)
    ]
    return _build_gradient(stops, resolution)


def _build_palette(entry: Dict[str, Any], resolution: int) -> Optional[np.ndarray]:
    build_fn = (entry.get("BuildFunction") or "").lower()
    values = entry.get("Values") or []

    stops: List[Tuple[float, Tuple[int, int, int, int]]] = []

    if build_fn == "hex":
        total = max(len(values) - 1, 1)
        stops = [
            (min(max(idx / total, 0.0), 1.0), _hex_to_rgba(str(value)))
            for idx, value in enumerate(values)
        ]
        return _build_gradient(stops, resolution)

    if build_fn == "xorgb":
        for value in values:
            try:
                position = float(value.get("x", 0.0))
                stops.append(
                    (
                        min(max(position, 0.0), 1.0),
                        (
                            round(min(max(float(value.get("r", 0.0)), 0.0), 1.0) * 255),
                            round(min(max(float(value.get("g", 0.0)), 0.0), 1.0) * 255),
                            round(min(max(float(value.get("b", 0.0)), 0.0), 1.0) * 255),
                            round(min(max(float(value.get("o", 1.0)), 0.0), 1.0) * 255),
                        ),
                    )
                )
            except (TypeError, ValueError):
                continue
        if stops:
            return _build_gradient(stops, resolution)

    return None


def _matplotlib_palette(name: str, resolution: int) -> np.ndarray:
    cmap = cm.get_cmap(name, resolution)
    rgba = (cmap(np.linspace(0, 1, resolution)) * 255.0).astype(np.uint8)
    return rgba


def _ensure_color_maps_loaded() -> None:
    if _COLOR_MAP_CACHE:
        return

    fallback = _matplotlib_palette(_COLOR_MAP_FALLBACK, PALETTE_RESOLUTION)
    _COLOR_MAP_CACHE["__fallback__"] = fallback

    color_map_path = _find_color_maps_file()
    if not color_map_path:
        print("[RasterViz] Color map file not found, using fallback")
        return

    try:
        with color_map_path.open("r", encoding="utf-8") as handle:
            raw_maps = json.load(handle)
        print(f"[RasterViz] Loaded {len(raw_maps)} color maps from {color_map_path}")
    except Exception as e:
        print(f"[RasterViz] Failed to load color maps: {e}")
        return

    for entry in raw_maps:
        name = entry.get("FullName")
        if not name or not isinstance(name, str):
            continue
        palette = _build_palette(entry, PALETTE_RESOLUTION)
        if palette is not None:
            _COLOR_MAP_CACHE[name] = palette


def _get_color_palette(
    name: Optional[str], css_colors: Optional[List[str]] = None
) -> np.ndarray:
    """Get color palette, prioritizing CSS colors from frontend if provided"""

    if css_colors and len(css_colors) > 0:
        print("[RasterViz] Using CSS colors from frontend ColorBar")
        return _build_palette_from_css_colors(css_colors, PALETTE_RESOLUTION)

    _ensure_color_maps_loaded()
    if name and isinstance(name, str) and name in _COLOR_MAP_CACHE:
        print(f"[RasterViz] Using color map: {name}")
        return _COLOR_MAP_CACHE[name]

    print(f"[RasterViz] Color map '{name}' not found, using fallback")
    return _COLOR_MAP_CACHE.get("__fallback__")


def _stringify_palette_name(value: Any) -> Optional[str]:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _find_coord_name(da: xr.DataArray, candidates: List[str]) -> Optional[str]:
    lowered = [c.lower() for c in candidates]
    for name in da.coords:
        if name.lower() in lowered:
            return name
    for name in da.dims:
        if name.lower() in lowered:
            return name
    return None


def _transpose_to_lat_lon(da: xr.DataArray) -> Tuple[xr.DataArray, str, str]:
    lat_dim = next(
        (dim for dim in da.dims if dim.lower() in {"lat", "latitude", "y"}), None
    )
    lon_dim = next(
        (dim for dim in da.dims if dim.lower() in {"lon", "longitude", "x"}), None
    )

    if lat_dim is None:
        lat_dim = _find_coord_name(da, ["lat", "latitude", "y"])
    if lon_dim is None:
        lon_dim = _find_coord_name(da, ["lon", "longitude", "x"])

    if lat_dim is None or lon_dim is None:
        raise ValueError(
            "Unable to identify latitude/longitude coordinates in dataset."
        )
    if lat_dim == lon_dim:
        raise ValueError("Latitude and longitude dimensions appear to overlap.")

    if list(da.dims) != [lat_dim, lon_dim]:
        da = da.transpose(lat_dim, lon_dim)
    return da, lat_dim, lon_dim


def _apply_land_ocean_mask(
    dataset_name: str,
    data: np.ndarray,
    mask: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Apply simple heuristic masking to remove land fill values for GODAS only
    """
    print(f"[RasterViz] Checking land fill value detection for {dataset_name}")
    if dataset_name not in _ZERO_FILL_DATASETS:
        print(
            "[RasterViz] Dataset not in zero-fill list; skipping land mask detection."
        )
        return data, mask

    valid_data = data[mask & np.isfinite(data)]

    if len(valid_data) == 0:
        return data, mask

    data_min = np.min(valid_data)
    data_max = np.max(valid_data)
    data_std = np.std(valid_data)

    zero_count = np.sum(data == 0.0)
    total_count = data.size
    zero_fraction = zero_count / total_count if total_count > 0 else 0

    print(
        f"[RasterViz] Data range: [{data_min:.6f}, {data_max:.6f}], std: {data_std:.6f}"
    )
    print(
        f"[RasterViz] Exact zeros: {zero_count} ({zero_fraction * 100:.1f}% of total)"
    )

    if zero_fraction > 0.2 and data_std > 0.0001:
        print("[RasterViz] Detected 0.0 as land fill value, masking...")
        fill_mask = data == 0.0
        mask = mask & (~fill_mask)
        print(f"[RasterViz] Masked {fill_mask.sum()} pixels with 0.0 fill value")

    print(
        f"[RasterViz] Final valid pixels: {mask.sum()} / {mask.size} ({mask.sum() / mask.size * 100:.1f}%)"
    )

    return data, mask


def _encode_png(rgba: np.ndarray) -> str:
    image = Image.fromarray(rgba, mode="RGBA")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", compress_level=6)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _generate_textures(
    data: np.ndarray,
    mask: np.ndarray,
    lat_values: np.ndarray,
    lon_values: np.ndarray,
    min_value: Optional[float],
    max_value: Optional[float],
    color_map_name: Optional[str],
    css_colors: Optional[List[str]] = None,
) -> Tuple[List[Dict[str, Any]], float]:
    """
    Generate PNG textures that EXACTLY match the data boundaries - no shifting or extension
    """
    palette = _get_color_palette(color_map_name, css_colors)
    if palette is None or len(palette) == 0:
        palette = _matplotlib_palette(_COLOR_MAP_FALLBACK, PALETTE_RESOLUTION)

    print(f"[RasterViz] Original data shape: {data.shape}")
    print(
        f"[RasterViz] Latitude range: [{lat_values.min():.2f}, {lat_values.max():.2f}]"
    )
    print(
        f"[RasterViz] Longitude range: [{lon_values.min():.2f}, {lon_values.max():.2f}]"
    )
    print(
        f"[RasterViz] Valid data points: {mask.sum()} / {mask.size} ({mask.sum() / mask.size * 100:.1f}%)"
    )

    # Ensure latitude is south-to-north
    if lat_values[0] > lat_values[-1]:
        print("[RasterViz] Reversing latitude from north-to-south to south-to-north")
        lat_values = lat_values[::-1]
        data = data[::-1, :]
        mask = mask[::-1, :]

    # NO EXTENSION - use data as-is
    print("[RasterViz] Using data as-is, no extension applied")

    # Optional upsampling for smoother visualization
    upscale_factor = 2
    if upscale_factor > 1:
        upsampled = zoom(data, zoom=upscale_factor, order=1)
        mask_upscaled = zoom(mask.astype(np.float32), zoom=upscale_factor, order=1)
        mask_result = mask_upscaled > 0.5
    else:
        upsampled = data
        mask_result = mask

    print(f"[RasterViz] After upsampling shape: {upsampled.shape}")

    textures: List[Dict[str, Any]] = []

    if not mask_result.any():
        empty = np.zeros(upsampled.shape + (4,), dtype=np.uint8)
        empty = np.flipud(empty)
        textures = [
            {
                "imageUrl": _encode_png(empty),
                "rectangle": {
                    "west": float(np.min(lon_values)),
                    "south": float(np.min(lat_values)),
                    "east": float(np.max(lon_values)),
                    "north": float(np.max(lat_values)),
                },
            }
        ]
        return textures, float(upsampled.shape[1] / max(data.shape[1], 1))

    # Calculate value range
    finite_values = upsampled[mask_result]
    computed_min = float(np.nanmin(finite_values)) if finite_values.size > 0 else 0.0
    computed_max = float(np.nanmax(finite_values)) if finite_values.size > 0 else 1.0

    vmin = min_value if min_value is not None else computed_min
    vmax = max_value if max_value is not None else computed_max

    print(f"[RasterViz] Value range for color mapping: {vmin} to {vmax}")

    if not np.isfinite(vmin) or not np.isfinite(vmax) or vmin == vmax:
        vmin = computed_min if np.isfinite(computed_min) else 0.0
        vmax = computed_max if np.isfinite(computed_max) else vmin + 1.0
        if vmin == vmax:
            vmax = vmin + 1.0

    # Color mapping - only color valid pixels
    rgba = np.zeros(upsampled.shape + (4,), dtype=np.uint8)
    valid_mask = mask_result & np.isfinite(upsampled)

    if valid_mask.any():
        valid_values = upsampled[valid_mask]
        norm_values = np.clip((valid_values - vmin) / max(vmax - vmin, 1e-9), 0.0, 1.0)
        palette_indices = (norm_values * (len(palette) - 1)).astype(np.int32)
        palette_indices = np.clip(palette_indices, 0, len(palette) - 1)
        rgba[valid_mask] = palette[palette_indices]

    # Set invalid pixels to transparent
    rgba[~valid_mask] = [0, 0, 0, 0]

    texture_upscale = float(upsampled.shape[1] / max(data.shape[1], 1))

    # Flip for Cesium (expects north-to-south in texture)
    rgba = np.flipud(rgba)
    print("[RasterViz] Flipped texture vertically for Cesium")

    # Adjust opacity
    if rgba.size:
        alpha_scale = 0.85
        alpha = rgba[..., 3].astype(np.float32) * alpha_scale
        rgba[..., 3] = np.clip(alpha, 0, 255).astype(np.uint8)

    # CRITICAL: Use EXACT data bounds - no adjustments or extensions
    south = float(np.min(lat_values))
    north = float(np.max(lat_values))
    west = float(np.min(lon_values))
    east = float(np.max(lon_values))

    print(
        f"[RasterViz] Texture bounds: west={west:.2f}, south={south:.2f}, east={east:.2f}, north={north:.2f}"
    )

    # Check if global dataset (wrap around)
    lon_range = east - west
    is_global = lon_range > 350

    print(f"[RasterViz] Longitude range: {lon_range:.2f} degrees")
    print(f"[RasterViz] Is global dataset: {is_global}")

    if is_global:
        # For global datasets, wrap the texture for seamless coverage
        rgba = np.concatenate([rgba[:, -1:, :], rgba, rgba[:, :1, :]], axis=1)
        texture_upscale = float(rgba.shape[1] / max(data.shape[1], 1))

        # Force to -180/180 for global
        west = -180.0
        east = 180.0

        print(f"[RasterViz] Global dataset: adjusted bounds to [{west}, {east}]")

    textures.append(
        {
            "imageUrl": _encode_png(rgba),
            "rectangle": {
                "west": west,
                "south": south,
                "east": east,
                "north": north,
            },
        }
    )

    print(f"[RasterViz] Generated {len(textures)} texture(s)")
    return textures, texture_upscale


def serialize_raster_array(
    da: xr.DataArray,
    row: pd.Series,
    dataset_name: str,
    css_colors: Optional[List[str]] = None,
    value_min_override: Optional[float] = None,
    value_max_override: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Serialize raster array with custom min/max overrides (zero-centered overrides already handled upstream).
    """
    print("[RasterViz DEBUG] serialize_raster_array called:")
    print(f"  dataset_name: {dataset_name}")
    print(f"  value_min_override: {value_min_override}")
    print(f"  value_max_override: {value_max_override}")
    print(f"  css_colors: {len(css_colors) if css_colors else 0}")

    array = da.squeeze()
    if array.ndim > 2:
        raise ValueError(
            "Raster slice is not 2-dimensional after selecting time and level."
        )

    array, lat_dim, lon_dim = _transpose_to_lat_lon(array)

    lat_coord_name = _find_coord_name(array, ["lat", "latitude", "y"]) or lat_dim
    lon_coord_name = _find_coord_name(array, ["lon", "longitude", "x"]) or lon_dim

    lat_values = np.asarray(array.coords[lat_coord_name].values, dtype=np.float64)
    lon_values = np.asarray(array.coords[lon_coord_name].values, dtype=np.float64)
    data = np.asarray(array.values, dtype=np.float32)

    print(f"[RasterViz DEBUG] Data array shape after conversion to numpy: {data.shape}")
    print(f"[RasterViz DEBUG] Data min in serialize: {np.nanmin(data)}")
    print(f"[RasterViz DEBUG] Data max in serialize: {np.nanmax(data)}")
    print(f"[RasterViz DEBUG] Zero count in serialize: {np.sum(data == 0.0)}")
    print(f"[RasterViz DEBUG] NaN count in serialize: {np.sum(np.isnan(data))}")

    if data.ndim != 2:
        raise ValueError("Raster slice is not 2-dimensional after selection.")

    # Remove known fill values
    fill_values: List[float] = []
    for key in _FILL_ATTR_KEYS:
        fill_values.extend(_decode_fill_values(array.attrs.get(key)))
    fill_values.extend(_decode_fill_values(row.get("fillValue")))

    finite_mask = np.isfinite(data)

    if fill_values:
        data = data.copy()
        fill_values_arr = np.array(fill_values, dtype=np.float64)
        fill_values_arr = fill_values_arr[np.isfinite(fill_values_arr)]
        if fill_values_arr.size:
            fill_mask = np.zeros_like(data, dtype=bool)
            for value in fill_values_arr:
                atol = max(1e-6, abs(value) * 1e-12)
                fill_mask |= np.isclose(data, value, rtol=0.0, atol=atol)
            if fill_mask.any():
                print(
                    f"[RasterViz] Applied fill mask using values: "
                    f"{np.unique(fill_values_arr)[:5]}...",
                )
                data[fill_mask] = np.nan
                finite_mask &= ~fill_mask

    finite_mask = np.isfinite(data) & finite_mask

    # Apply land/ocean mask for special datasets
    data, finite_mask = _apply_land_ocean_mask(dataset_name, data, finite_mask)

    print(
        f"[RasterViz DEBUG] After land/ocean mask - valid pixels: {finite_mask.sum()} / {finite_mask.size}"
    )

    data_min = float(data[finite_mask].min()) if finite_mask.any() else None
    data_max = float(data[finite_mask].max()) if finite_mask.any() else None

    encoded = base64.b64encode(data.tobytes()).decode("ascii")

    meta_min = _maybe_float(row.get("valueMin"))
    meta_max = _maybe_float(row.get("valueMax"))

    if value_min_override is not None and np.isfinite(value_min_override):
        meta_min = float(value_min_override)
        print(f"[RasterViz DEBUG] Overriding min: {meta_min}")

    if value_max_override is not None and np.isfinite(value_max_override):
        meta_max = float(value_max_override)
        print(f"[RasterViz DEBUG] Overriding max: {meta_max}")

    print(f"[RasterViz DEBUG] Final range for color mapping: [{meta_min}, {meta_max}]")

    units = array.attrs.get("units") or row.get("units") or row.get("unit") or "units"

    textures, texture_scale = _generate_textures(
        data,
        finite_mask,
        lat_values,
        lon_values,
        meta_min if meta_min is not None else data_min,  # Use overridden min
        meta_max if meta_max is not None else data_max,  # Use overridden max
        _stringify_palette_name(row.get("colorMap")),
        css_colors=css_colors,
    )

    return {
        "dataset": dataset_name,
        "shape": [int(data.shape[0]), int(data.shape[1])],
        "lat": lat_values.astype(float).tolist(),
        "lon": lon_values.astype(float).tolist(),
        "values": encoded,
        "dataEncoding": {"format": "base64", "dtype": "float32"},
        "valueRange": {
            "min": meta_min if meta_min is not None else data_min,
            "max": meta_max if meta_max is not None else data_max,
        },
        "actualRange": {"min": data_min, "max": data_max},
        "units": units,
        "colorMap": row.get("colorMap")
        if isinstance(row.get("colorMap"), str) and row.get("colorMap")
        else None,
        "rectangle": {
            "west": float(np.min(lon_values)),
            "south": float(np.min(lat_values)),
            "east": float(np.max(lon_values)),
            "north": float(np.max(lat_values)),
        },
        "textures": textures,
        "textureScale": texture_scale,
    }


__all__ = ["serialize_raster_array"]
