import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from geopy.exc import GeocoderServiceError, GeocoderTimedOut
from geopy.geocoders import Nominatim
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/geocode", tags=["geocoding"])

GEOPY_USER_AGENT = os.getenv("GEOPY_USER_AGENT", "icharm-llm-service/1.0")
GEOPY_TIMEOUT_SECONDS = float(os.getenv("GEOPY_TIMEOUT_SECONDS", "5.0"))
GEOPY_MAX_WORKERS = int(os.getenv("GEOPY_MAX_WORKERS", "4"))

_geolocator = Nominatim(user_agent=GEOPY_USER_AGENT, timeout=GEOPY_TIMEOUT_SECONDS)
_thread_pool = ThreadPoolExecutor(max_workers=GEOPY_MAX_WORKERS)


class LocationResult(BaseModel):
    id: str
    label: str
    latitude: float
    longitude: float
    type: Optional[str] = None
    importance: Optional[float] = None
    raw: Optional[Dict[str, Any]] = None


class LocationSearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=200)
    limit: int = Field(default=5, ge=1, le=10)


class LocationSearchResponse(BaseModel):
    query: str
    results: List[LocationResult]


async def _run_geocode(query: str, limit: int):
    loop = asyncio.get_running_loop()

    def _task():
        return _geolocator.geocode(
            query,
            exactly_one=False,
            limit=limit,
            addressdetails=True,
        )

    return await loop.run_in_executor(_thread_pool, _task)


def _create_identifier(
    raw: Dict[str, Any], latitude: float, longitude: float, index: int
) -> str:
    place_id = raw.get("place_id")
    if place_id:
        return str(place_id)

    osm_id = raw.get("osm_id")
    osm_type = raw.get("osm_type")
    if osm_id:
        prefix = f"{osm_type}-" if osm_type else ""
        return f"{prefix}{osm_id}"

    return f"{latitude:.6f},{longitude:.6f}-{index}"


def _serialize_location(location: Any, index: int) -> Optional[LocationResult]:
    if location is None:
        return None

    try:
        latitude = float(location.latitude)
        longitude = float(location.longitude)
    except (TypeError, ValueError):
        return None

    raw: Dict[str, Any] = location.raw or {}
    label = raw.get("display_name") or getattr(location, "address", None)

    if not label:
        parts = []
        address = raw.get("address") or {}
        for key in ("city", "state", "country"):
            value = address.get(key)
            if value:
                parts.append(value)
        label = ", ".join(parts) if parts else f"{latitude:.4f}, {longitude:.4f}"

    return LocationResult(
        id=_create_identifier(raw, latitude, longitude, index),
        label=label,
        latitude=latitude,
        longitude=longitude,
        type=raw.get("type") or raw.get("class"),
        importance=raw.get("importance"),
        raw={
            "display_name": raw.get("display_name"),
            "class": raw.get("class"),
            "type": raw.get("type"),
            "address": raw.get("address"),
            "boundingbox": raw.get("boundingbox"),
        },
    )


@router.post("/search", response_model=LocationSearchResponse)
async def search_locations(payload: LocationSearchRequest) -> LocationSearchResponse:
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query must not be empty")

    try:
        locations = await _run_geocode(query, payload.limit)
    except (GeocoderTimedOut, GeocoderServiceError) as exc:
        logger.warning("Geocoding service error", exc_info=exc)
        raise HTTPException(
            status_code=502, detail="Geocoding service unavailable"
        ) from exc
    except Exception as exc:  # pragma: no cover
        logger.exception("Unexpected geocoding failure")
        raise HTTPException(
            status_code=500, detail="Failed to lookup location"
        ) from exc

    results: List[LocationResult] = []
    if locations:
        for idx, location in enumerate(locations):
            serialized = _serialize_location(location, idx)
            if serialized:
                results.append(serialized)

    return LocationSearchResponse(query=query, results=results)
