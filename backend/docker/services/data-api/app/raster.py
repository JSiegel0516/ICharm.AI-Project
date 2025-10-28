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
    
    # Handle hex colors
    if color.startswith('#'):
        return _hex_to_rgba(color)
    
    # Handle rgb() or rgba() colors
    if color.startswith('rgb'):
        # Extract numbers from rgb(r, g, b) or rgba(r, g, b, a)
        import re
        numbers = re.findall(r'[\d.]+', color)
        if len(numbers) >= 3:
            r = int(float(numbers[0]))
            g = int(float(numbers[1]))
            b = int(float(numbers[2]))
            a = int(float(numbers[3]) * 255) if len(numbers) >= 4 else 255
            return (r, g, b, a)
    
    # Fallback to matplotlib color parsing
    try:
        from matplotlib.colors import to_rgba
        rgba = to_rgba(color)
        return (
            int(rgba[0] * 255),
            int(rgba[1] * 255),
            int(rgba[2] * 255),
            int(rgba[3] * 255)
        )
    except:
        # Default to black if parsing fails
        return (0, 0, 0, 255)


def _build_gradient(stops: List[Tuple[float, Tuple[int, int, int, int]]], resolution: int) -> np.ndarray:
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
            round(start_color[channel] + (end_color[channel] - start_color[channel]) * factor)
            for channel in range(4)
        ]
        data[index] = interpolated
    return data


def _build_palette_from_css_colors(colors: List[str], resolution: int) -> np.ndarray:
    """Build palette directly from CSS color strings (from frontend ColorBar)"""
    if not colors:
        return _matplotlib_palette(_COLOR_MAP_FALLBACK, resolution)
    
    # Convert CSS colors to RGBA tuples
    rgba_colors = [_css_color_to_rgba(c) for c in colors]
    
    # Create gradient stops evenly distributed
    total = max(len(rgba_colors) - 1, 1)
    stops = [
        (min(max(idx / total, 0.0), 1.0), rgba)
        for idx, rgba in enumerate(rgba_colors)
    ]
    
    return _build_gradient(stops, resolution)


def _build_palette(entry: Dict[str, Any], resolution: int) -> Optional[np.ndarray]:
    build_fn = (entry.get("BuildFunction") or "").lower()
    values = entry.get("Values") or []

    if build_fn == "hex":
        total = max(len(values) - 1, 1)
        stops = [
            (min(max(idx / total, 0.0), 1.0), _hex_to_rgba(str(value)))
            for idx, value in enumerate(values)
        ]
        return _build_gradient(stops, resolution)

    if build_fn == "xorgb":
        stops: List[Tuple[float, Tuple[int, int, int, int]]] = []
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
            print(f"[RasterViz] Loaded color map: {name}")


def _get_color_palette(name: Optional[str], css_colors: Optional[List[str]] = None) -> np.ndarray:
    """Get color palette, prioritizing CSS colors from frontend if provided"""
    
    # PRIORITY 1: Use CSS colors directly from frontend ColorBar
    if css_colors and len(css_colors) > 0:
        print(f"[RasterViz] Using CSS colors from frontend ColorBar: {css_colors}")
        return _build_palette_from_css_colors(css_colors, PALETTE_RESOLUTION)
    
    # PRIORITY 2: Use named colormap
    _ensure_color_maps_loaded()
    if name and isinstance(name, str) and name in _COLOR_MAP_CACHE:
        print(f"[RasterViz] Using color map: {name}")
        return _COLOR_MAP_CACHE[name]
    
    # PRIORITY 3: Fallback
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
    lat_dim = next((dim for dim in da.dims if dim.lower() in {"lat", "latitude", "y"}), None)
    lon_dim = next((dim for dim in da.dims if dim.lower() in {"lon", "longitude", "x"}), None)

    if lat_dim is None:
        lat_dim = _find_coord_name(da, ["lat", "latitude", "y"])
    if lon_dim is None:
        lon_dim = _find_coord_name(da, ["lon", "longitude", "x"])

    if lat_dim is None or lon_dim is None:
        raise ValueError("Unable to identify latitude/longitude coordinates in dataset.")
    if lat_dim == lon_dim:
        raise ValueError("Latitude and longitude dimensions appear to overlap.")

    if list(da.dims) != [lat_dim, lon_dim]:
        da = da.transpose(lat_dim, lon_dim)
    return da, lat_dim, lon_dim


def _extend_latitude_coverage(
    data: np.ndarray,
    mask: np.ndarray,
    lat_values: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Extend latitude coverage to include poles by adding extra rows
    NOTE: Extended polar rows are marked as INVALID in the mask to remain transparent
    """
    lat_min = lat_values.min()
    lat_max = lat_values.max()
    
    # Check if we need to extend to poles
    needs_south_pole = lat_min > -89  # Leave 1 degree buffer
    needs_north_pole = lat_max < 89   # Leave 1 degree buffer
    
    if not needs_south_pole and not needs_north_pole:
        return data, mask, lat_values
    
    print(f"[RasterViz] Extending latitude coverage from [{lat_min}, {lat_max}] to [-90, 90]")
    
    extended_data = []
    extended_mask = []
    extended_lat = []
    
    # Add south pole rows if needed - but mark as INVALID
    if needs_south_pole:
        # Add 10 transparent rows at south pole
        for i in range(10):
            lat_val = -90 + i * (lat_min + 90) / 10
            extended_lat.append(lat_val)
            # Use zeros for data, False for mask (will be transparent)
            extended_data.append(np.zeros(data.shape[1], dtype=data.dtype))
            extended_mask.append(np.zeros(data.shape[1], dtype=bool))
    
    # Add original data
    extended_lat.extend(lat_values.tolist())
    extended_data.extend([data[i, :] for i in range(data.shape[0])])
    extended_mask.extend([mask[i, :] for i in range(mask.shape[0])])
    
    # Add north pole rows if needed - but mark as INVALID
    if needs_north_pole:
        # Add 10 transparent rows at north pole
        for i in range(1, 11):
            lat_val = lat_max + i * (90 - lat_max) / 10
            extended_lat.append(lat_val)
            # Use zeros for data, False for mask (will be transparent)
            extended_data.append(np.zeros(data.shape[1], dtype=data.dtype))
            extended_mask.append(np.zeros(data.shape[1], dtype=bool))
    
    print(f"[RasterViz] Added transparent polar extension rows (not filled with data)")
    
    return (
        np.array(extended_data, dtype=data.dtype),
        np.array(extended_mask, dtype=mask.dtype),
        np.array(extended_lat, dtype=lat_values.dtype)
    )


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
    origin: str,
    min_value: Optional[float],
    max_value: Optional[float],
    color_map_name: Optional[str],
    css_colors: Optional[List[str]] = None,
) -> Tuple[List[Dict[str, Any]], float]:
    # Get palette with CSS colors prioritized
    palette = _get_color_palette(color_map_name, css_colors)
    if palette is None or len(palette) == 0:
        palette = _matplotlib_palette(_COLOR_MAP_FALLBACK, PALETTE_RESOLUTION)

    print(f"[RasterViz] Original data shape: {data.shape}")
    print(f"[RasterViz] Latitude range: [{lat_values.min():.2f}, {lat_values.max():.2f}]")
    print(f"[RasterViz] Valid data points: {mask.sum()} / {mask.size}")

    # Extend to poles BEFORE processing
    extended_data, extended_mask, extended_lat = _extend_latitude_coverage(data, mask, lat_values)
    
    print(f"[RasterViz] After pole extension shape: {extended_data.shape}")
    print(f"[RasterViz] Extended latitude range: [{extended_lat.min():.2f}, {extended_lat.max():.2f}]")

    # Simple upsampling with nearest neighbor - no smoothing at all
    upscale_factor = 2
    if upscale_factor > 1:
        upsampled = zoom(extended_data, zoom=upscale_factor, order=0)
        mask_upscaled = zoom(extended_mask.astype(np.float32), zoom=upscale_factor, order=0)
        mask_result = mask_upscaled > 0.5
    else:
        upsampled = extended_data
        mask_result = extended_mask
    
    print(f"[RasterViz] After upsampling shape: {upsampled.shape}")
    print(f"[RasterViz] Valid points after upsampling: {mask_result.sum()} / {mask_result.size}")

    if not mask_result.any():
        empty = np.zeros(upsampled.shape + (4,), dtype=np.uint8)
        textures = [
            {
                "imageUrl": _encode_png(empty),
                "rectangle": {
                    "west": float(np.min(lon_values)),
                    "south": -90.0,
                    "east": float(np.max(lon_values)),
                    "north": 90.0,
                },
            }
        ]
        return textures, float(upsampled.shape[1] / max(data.shape[1], 1))

    finite_values = upsampled[mask_result]
    computed_min = float(np.nanmin(finite_values)) if finite_values.size > 0 else 0.0
    computed_max = float(np.nanmax(finite_values)) if finite_values.size > 0 else 1.0

    vmin = min_value if min_value is not None else computed_min
    vmax = max_value if max_value is not None else computed_max
    
    print(f"[RasterViz] Value range for color mapping: {vmin} to {vmax}")
    print(f"[RasterViz] Actual data range: {computed_min} to {computed_max}")
    print(f"[RasterViz] Palette size: {len(palette)}")
    
    # Show what the palette looks like at key points
    if len(palette) > 0:
        print(f"[RasterViz] Palette color at index 0 (min): {palette[0]}")
        print(f"[RasterViz] Palette color at index {len(palette)//2} (mid): {palette[len(palette)//2]}")
        print(f"[RasterViz] Palette color at index {len(palette)-1} (max): {palette[-1]}")
    
    if not np.isfinite(vmin) or not np.isfinite(vmax) or vmin == vmax:
        vmin = computed_min if np.isfinite(computed_min) else 0.0
        vmax = computed_max if np.isfinite(computed_max) else vmin + 1.0
        if vmin == vmax:
            vmax = vmin + 1.0

    # Vectorized color mapping for better accuracy
    # Initialize RGBA with transparent pixels
    rgba = np.zeros(upsampled.shape + (4,), dtype=np.uint8)
    
    # Only process valid data points
    valid_mask = mask_result & np.isfinite(upsampled)
    
    if valid_mask.any():
        # Get valid data values
        valid_values = upsampled[valid_mask]
        
        # Normalize only valid values
        norm_values = np.clip((valid_values - vmin) / max(vmax - vmin, 1e-9), 0.0, 1.0)
        
        # Map to palette indices
        palette_indices = (norm_values * (len(palette) - 1)).astype(np.int32)
        palette_indices = np.clip(palette_indices, 0, len(palette) - 1)
        
        # Apply palette only to valid pixels
        rgba[valid_mask] = palette[palette_indices]
    
    # Explicitly ensure all invalid areas are fully transparent
    rgba[~valid_mask] = [0, 0, 0, 0]

    # Verify a few samples
    valid_points = np.where(valid_mask)
    if len(valid_points[0]) > 0:
        print(f"[RasterViz] Color mapping verification (first 5 valid points):")
        for i in range(min(5, len(valid_points[0]))):
            row, col = valid_points[0][i], valid_points[1][i]
            value = upsampled[row, col]
            norm_val = (value - vmin) / max(vmax - vmin, 1e-9)
            idx = int(np.clip(norm_val * (len(palette) - 1), 0, len(palette) - 1))
            print(f"  Value: {value:.3f} -> Norm: {norm_val:.3f} -> Idx: {idx} -> RGBA: {rgba[row, col]}")

    texture_upscale = float(upsampled.shape[1] / max(data.shape[1], 1))

    # Cesium expects the first row of the texture to map to the northernmost latitude.
    # Our data arrays are stored from south-to-north after normalization, so flip vertically.
    rgba = np.flipud(rgba)
    
    # Use extended latitude range
    south = -90.0
    north = 90.0

    textures: List[Dict[str, Any]] = []

    # Generate SINGLE texture to avoid seams
    print("[RasterViz] Generating single seamless texture")
    
    # Check if this is a global dataset (spans ~360 degrees longitude)
    lon_range = lon_values[-1] - lon_values[0]
    lon_step = lon_values[1] - lon_values[0] if len(lon_values) > 1 else 1.0
    is_global = lon_range > 350  # Nearly full globe coverage
    
    print(f"[RasterViz] Longitude range: {lon_range:.2f} degrees, step: {lon_step:.2f}")
    print(f"[RasterViz] Is global dataset: {is_global}")
    
    if is_global:
        # For global datasets, we need to handle the wrap-around at 180°/-180°
        # Check if data already wraps (last column ~= first column)
        # If not, we may need to add overlap or adjust the rectangle
        
        # Simply extend the rectangle bounds slightly to ensure no gaps
        west = float(lon_values[0])
        east = float(lon_values[-1]) + lon_step * 0.1  # Tiny overlap
        
        # Clamp to valid range
        if east > 180:
            east = 180.0
        
        print(f"[RasterViz] Adjusted longitude bounds: [{west}, {east}]")
        
        textures.append({
            "imageUrl": _encode_png(rgba),
            "rectangle": {
                "west": west,
                "south": south,
                "east": east,
                "north": north,
            },
        })
    else:
        textures.append({
            "imageUrl": _encode_png(rgba),
            "rectangle": {
                "west": float(lon_values[0]),
                "south": south,
                "east": float(lon_values[-1]),
                "north": north,
            },
        })
    
    print(f"[RasterViz] Generated {len(textures)} seamless texture(s)")
    return textures, texture_upscale


def serialize_raster_array(
    da: xr.DataArray,
    row: pd.Series,
    dataset_name: str,
    css_colors: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Serialize raster array with optional CSS colors from frontend ColorBar
    
    Args:
        da: xarray DataArray containing the raster data
        row: Metadata row from database
        dataset_name: Name of the dataset
        css_colors: Optional list of CSS color strings from frontend ColorBar
    """
    print(f"[RasterViz] Serializing raster for dataset: {dataset_name}")
    if css_colors:
        print(f"[RasterViz] Using CSS colors from frontend: {css_colors}")
    
    array = da.squeeze()
    if array.ndim > 2:
        raise ValueError("Raster slice is not 2-dimensional after selecting time and level.")

    array, lat_dim, lon_dim = _transpose_to_lat_lon(array)

    lat_coord_name = _find_coord_name(array, ["lat", "latitude", "y"]) or lat_dim
    lon_coord_name = _find_coord_name(array, ["lon", "longitude", "x"]) or lon_dim

    lat_values = np.asarray(array.coords[lat_coord_name].values, dtype=np.float64)
    lon_values = np.asarray(array.coords[lon_coord_name].values, dtype=np.float64)
    data = np.asarray(array.values, dtype=np.float32)

    if data.ndim != 2:
        raise ValueError("Raster slice is not 2-dimensional after selection.")

    if lat_values[0] > lat_values[-1]:
        lat_values = lat_values[::-1]
        data = data[::-1, :]
    origin = "prime"
    if lon_values[0] > lon_values[-1]:
        lon_values = lon_values[::-1]
        data = data[:, ::-1]
    if lon_values[-1] > 180 and lon_values[0] >= 0:
        shifted = ((lon_values + 180.0) % 360.0) - 180.0
        sort_idx = np.argsort(shifted)
        lon_values = shifted[sort_idx]
        data = data[:, sort_idx]
        origin = "prime_shifted"

    finite_mask = np.isfinite(data)
    data_min = float(data[finite_mask].min()) if finite_mask.any() else None
    data_max = float(data[finite_mask].max()) if finite_mask.any() else None

    encoded = base64.b64encode(data.tobytes()).decode("ascii")

    meta_min = _maybe_float(row.get("valueMin"))
    meta_max = _maybe_float(row.get("valueMax"))

    units = array.attrs.get("units") or row.get("units") or row.get("unit") or "units"

    textures, texture_scale = _generate_textures(
        data,
        finite_mask,
        lat_values,
        lon_values,
        origin,
        meta_min if meta_min is not None else data_min,
        meta_max if meta_max is not None else data_max,
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
        "colorMap": row.get("colorMap") if isinstance(row.get("colorMap"), str) and row.get("colorMap") else None,
        "rectangle": {
            "west": float(np.min(lon_values)),
            "south": -90.0,
            "east": float(np.max(lon_values)),
            "north": 90.0,
            "origin": origin,
        },
        "textures": textures,
        "textureScale": texture_scale,
    }


__all__ = ["serialize_raster_array"]
