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
from scipy.ndimage import gaussian_filter, zoom

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
        return

    try:
        with color_map_path.open("r", encoding="utf-8") as handle:
            raw_maps = json.load(handle)
    except Exception:
        return

    for entry in raw_maps:
        name = entry.get("FullName")
        if not name or not isinstance(name, str):
            continue
        palette = _build_palette(entry, PALETTE_RESOLUTION)
        if palette is not None:
            _COLOR_MAP_CACHE[name] = palette


def _get_color_palette(name: Optional[str]) -> np.ndarray:
    _ensure_color_maps_loaded()
    if name and isinstance(name, str) and name in _COLOR_MAP_CACHE:
        return _COLOR_MAP_CACHE[name]
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


def _smooth_and_upsample(
    data: np.ndarray,
    mask: np.ndarray,
    upscale_factor: int = 2,
    sigma: float = 1.0,
) -> Tuple[np.ndarray, np.ndarray]:
    if not mask.any():
        zeros = np.zeros(
            (
                max(int(data.shape[0] * upscale_factor), 1),
                max(int(data.shape[1] * upscale_factor), 1),
            ),
            dtype=np.float32,
        )
        return zeros, np.zeros_like(zeros, dtype=bool)

    filled = np.where(mask, data, np.nan)
    mean_value = float(np.nanmean(filled)) if np.isfinite(filled).any() else 0.0
    filled = np.where(mask, filled, mean_value)

    smoothed = gaussian_filter(filled, sigma=sigma, mode="nearest")
    mask_smoothed = gaussian_filter(mask.astype(np.float32), sigma=sigma, mode="nearest")

    if upscale_factor > 1:
        smoothed = zoom(smoothed, zoom=upscale_factor, order=3)
        mask_smoothed = zoom(mask_smoothed, zoom=upscale_factor, order=1)

    mask_result = mask_smoothed > 0.05
    return smoothed.astype(np.float32), mask_result


def _encode_png(rgba: np.ndarray) -> str:
    image = Image.fromarray(rgba, mode="RGBA")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _create_alpha(mask: np.ndarray) -> np.ndarray:
    softened = gaussian_filter(mask.astype(np.float32), sigma=1.2)
    softened = np.clip(softened, 0.0, 1.0)
    softened[~mask] = 0.0
    return softened


def _generate_textures(
    data: np.ndarray,
    mask: np.ndarray,
    lat_values: np.ndarray,
    lon_values: np.ndarray,
    origin: str,
    min_value: Optional[float],
    max_value: Optional[float],
    color_map_name: Optional[str],
) -> Tuple[List[Dict[str, Any]], float]:
    palette = _get_color_palette(color_map_name)
    if palette is None or len(palette) == 0:
        palette = _matplotlib_palette(_COLOR_MAP_FALLBACK, PALETTE_RESOLUTION)

    smoothed, mask_smoothed = _smooth_and_upsample(data, mask, upscale_factor=2, sigma=1.0)

    if not mask_smoothed.any():
        empty = np.zeros(smoothed.shape + (4,), dtype=np.uint8)
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
        return textures, float(smoothed.shape[1] / max(data.shape[1], 1))

    finite_values = smoothed[mask_smoothed]
    computed_min = float(np.nanmin(finite_values)) if finite_values.size > 0 else 0.0
    computed_max = float(np.nanmax(finite_values)) if finite_values.size > 0 else 1.0

    vmin = min_value if min_value is not None else computed_min
    vmax = max_value if max_value is not None else computed_max
    if not np.isfinite(vmin) or not np.isfinite(vmax) or vmin == vmax:
        vmin = computed_min if np.isfinite(computed_min) else 0.0
        vmax = computed_max if np.isfinite(computed_max) else vmin + 1.0
        if vmin == vmax:
            vmax = vmin + 1.0

    norm = np.clip((smoothed - vmin) / max(vmax - vmin, 1e-6), 0.0, 1.0)
    indices = np.rint(norm * (len(palette) - 1)).astype(np.int32)
    rgba = palette[indices].astype(np.uint8)
    alpha = _create_alpha(mask_smoothed)
    base_alpha = rgba[..., 3].astype(np.float32) / 255.0
    rgba[..., 3] = np.clip(alpha * base_alpha * 255.0, 0.0, 255.0).astype(np.uint8)

    upscale_factor = float(smoothed.shape[1] / max(data.shape[1], 1))
    south = float(np.min(lat_values))
    north = float(np.max(lat_values))

    textures: List[Dict[str, Any]] = []

    def add_texture(col_start: int, col_end: int, west: float, east: float) -> None:
        scaled_start = int(round(col_start * upscale_factor))
        scaled_end = int(round(col_end * upscale_factor))
        if scaled_end <= scaled_start:
            return
        slice_rgba = rgba[:, scaled_start:scaled_end, :]
        textures.append(
            {
                "imageUrl": _encode_png(slice_rgba),
                "rectangle": {
                    "west": float(west),
                    "south": south,
                    "east": float(east),
                    "north": north,
                },
            }
        )

    total_cols = data.shape[1]
    if origin == "prime_shifted":
        split_index = int(np.searchsorted(lon_values, 0.0))
        if 0 < split_index < total_cols:
            add_texture(0, split_index, lon_values[0], lon_values[split_index - 1])
            add_texture(split_index, total_cols, lon_values[split_index], lon_values[-1])
        else:
            add_texture(0, total_cols, lon_values[0], lon_values[-1])
    else:
        add_texture(0, total_cols, lon_values[0], lon_values[-1])

    return textures, upscale_factor


def serialize_raster_array(
    da: xr.DataArray,
    row: pd.Series,
    dataset_name: str,
) -> Dict[str, Any]:
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
            "south": float(np.min(lat_values)),
            "east": float(np.max(lon_values)),
            "north": float(np.max(lat_values)),
            "origin": origin,
        },
        "textures": textures,
        "textureScale": texture_scale,
    }


__all__ = ["serialize_raster_array"]
