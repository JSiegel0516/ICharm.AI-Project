from netCDF4 import Dataset


TIME_VAR_CANDIDATES = ["time"]
LAT_VAR_CANDIDATES = ["lat", "latitude"]
LON_VAR_CANDIDATES = ["lon", "longitude"]


class NetCDFCommon:
    @staticmethod
    def guess_variable_name(nc: Dataset, candidates: list[str]) -> str:
        var_names = set(nc.variables.keys())
        for c in candidates:
            if c in var_names:
                return c
        raise RuntimeError(f"Could not find any of {candidates} in {var_names}")
