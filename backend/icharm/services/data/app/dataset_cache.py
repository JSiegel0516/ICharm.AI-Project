from typing import Optional, Any
from datetime import datetime
import xarray as xr


# ============================================================================
# CACHING
# ============================================================================


class DatasetCache:
    """Simple in-memory cache for opened datasets"""

    def __init__(self, max_size: int = 10):
        self.cache: dict[str, Any] = {}
        self.max_size = max_size
        self.access_times: dict[Any, Any] = {}

    def get(self, key: str) -> Optional[xr.Dataset]:
        if key in self.cache:
            self.access_times[key] = datetime.now()
            return self.cache[key]
        return None

    def set(self, key: str, dataset: xr.Dataset):
        if len(self.cache) >= self.max_size:
            # Remove least recently used
            oldest = min(self.access_times, key=self.access_times.__getitem__)
            del self.cache[oldest]
            del self.access_times[oldest]

        self.cache[key] = dataset
        self.access_times[key] = datetime.now()

    def clear(self):
        for ds in self.cache.values():
            try:
                ds.close()
            except:  # noqa E722
                pass
        self.cache.clear()
        self.access_times.clear()


# Global cache instance
dataset_cache = DatasetCache()