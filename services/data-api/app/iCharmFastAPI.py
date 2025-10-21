from typing import Optional
from fastapi import FastAPI, Body
import xarray as xr
import pandas as pd
import numpy as np
import cftime
from scipy.stats import skew, kurtosis
import s3fs
from datetime import datetime
import fsspec

app = FastAPI()

METADATA_PATH = "metadata.csv"

def load_metadata(metadata_path: str) -> pd.DataFrame:
    try:
        return pd.read_csv(metadata_path)
    except FileNotFoundError:
        raise FileNotFoundError(f"Metadata file not found at: {metadata_path}")
    except Exception as e:
        raise Exception(f"Error reading metadata file: {e}")

def iso_times_from_coord(time_coord) -> list[str]:
    vals = time_coord.values
    out = []
    vals_list = [vals] if vals.shape == () else list(vals)
    for t in vals_list:
        if isinstance(t, (np.datetime64, pd.Timestamp)):
            out.append(pd.to_datetime(t).strftime("%Y-%m-%d"))
        elif hasattr(t, 'year') and hasattr(t, 'month') and hasattr(t, 'day'):
            out.append(f"{t.year:04d}-{t.month:02d}-{t.day:02d}")
        else:
            out.append(str(t))
    return out

def choose_best_variable(ds: xr.Dataset, fallback: str = "precip") -> str:
    variables = list(ds.data_vars)
    filtered = [v for v in variables if "bnds" not in v.lower()]
    if not filtered:
        return variables[0]
    if fallback in filtered:
        return fallback
    for v in filtered:
        name = v.lower()
        units = (ds[v].attrs.get("units") or "").lower()
        if any(k in name for k in ["anom", "anomaly", "difference"]):
            return v
        if any(k in units for k in ["k", "°c", "degc", "kelvin", "celsius", "temperature"]):
            return v
        if any(k in name for k in ["precip", "rain", "snow", "snod", "pr"]):
            return v
        if any(k in name for k in ["wind", "speed"]):
            return v
    return filtered[0]

def load_dataset(
    metadata_path: str,
    dataset_name: str,
    variable: Optional[str] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    day: Optional[int] = None
) -> xr.DataArray:
    metadata = load_metadata(metadata_path)
    row = metadata[metadata['datasetName'] == dataset_name]
    if row.empty:
        raise ValueError(f"Dataset '{dataset_name}' not found in metadata.")
    row = row.iloc[0]
    stored = row['Stored']
    input_file = row['inputFile']
    engine = row['engine'] if pd.notna(row['engine']) and row['engine'] != 'None' else None
    key_var = row['keyVariable']
    kerchunk_path = row['kerchunkPath'] if pd.notna(row['kerchunkPath']) and row['kerchunkPath'] != 'None' else None
    if stored == 'local':
        path = input_file
        if engine == 'zarr':
            ds = xr.open_zarr(path)
        else:
            ds = xr.open_dataset(path, decode_times=True, use_cftime=True)
    else:
        if not input_file.startswith('s3://'):
            input_file = 's3://' + input_file
        format_dict = {}
        if year is not None:
            format_dict['year'] = f"{year:04d}"
        if month is not None:
            format_dict['month'] = f"{month:02d}"
        if day is not None:
            format_dict['day'] = f"{day:02d}"
        has_template = any(p in input_file for p in ['{year', '{month', '{day'])
        if kerchunk_path is not None:
            mapper = fsspec.get_mapper(
                "reference://",
                fo=kerchunk_path,
                target_protocol="file",
                remote_protocol="s3",
                remote_options={"anon": True}
            )
            ds = xr.open_zarr(mapper, consolidated=False)
        elif has_template:
            if year is None or month is None:
                raise ValueError(f"Year and month required for dataset '{dataset_name}'")
            if '{day' in input_file and day is None:
                from calendar import monthrange
                _, num_days = monthrange(year, month)
                das = []
                for d in range(1, num_days + 1):
                    fd = format_dict.copy()
                    fd['day'] = f"{d:02d}"
                    file_path = input_file.format(**fd)
                    ds_d = xr.open_dataset(
                        file_path,
                        engine=engine,
                        backend_kwargs={"storage_options": {"anon": True}}
                    )
                    das.append(ds_d)
                ds = xr.concat(das, dim='time')
            else:
                file_path = input_file.format(**format_dict)
                ds = xr.open_dataset(
                    file_path,
                    engine=engine,
                    backend_kwargs={"storage_options": {"anon": True}}
                )
        else:
            file_path = input_file
            if file_path.endswith('.nc'):
                ds = xr.open_dataset(
                    file_path,
                    engine=engine,
                    decode_times=True,
                    use_cftime=True,
                    backend_kwargs={"storage_options": {"anon": True}}
                )
            else:
                if year is None or month is None:
                    raise ValueError(f"Year and month required for dataset '{dataset_name}'")
                glob_pattern = file_path + f"{year:04d}/{month:02d}/*.nc"
                fs = s3fs.S3FileSystem(anon=True)
                file_urls = fs.glob(glob_pattern)
                if not file_urls:
                    raise FileNotFoundError(f"No files found for {year}-{month:02d} in '{dataset_name}'")
                full_urls = [f"s3://{u}" for u in file_urls]
                ds = xr.open_mfdataset(
                    full_urls,
                    engine=engine,
                    combine="by_coords",
                    parallel=True,
                    chunks={"time": 1},
                    backend_kwargs={"storage_options": {"anon": True}}
                )
    if variable and variable in ds.data_vars:
        da = ds[variable]
    else:
        da = ds[key_var]
    if "time" in da.coords:
        time_vals = da["time"].values
        if pd.api.types.is_numeric_dtype(time_vals):
            units = da["time"].attrs.get("units", "days since 1800-01-01")
            ref_date = units.split("since")[-1].strip()
            da["time"] = pd.to_datetime(ref_date) + pd.to_timedelta(time_vals, unit="D")
    return da

def is_multilevel(da: xr.DataArray) -> bool:
    return "level" in da.dims or "plev" in da.dims

def select_time_safe(da, date_str: str):
    try:
        target = pd.to_datetime(date_str)
        time_vals = da["time"].values
        if isinstance(time_vals[0], cftime.DatetimeGregorian):
            target = cftime.DatetimeGregorian(target.year, target.month, target.day)
        return da.sel(time=target, method="nearest")
    except Exception as e:
        print("Fallback to first timestep due to:", e)
        return da.isel(time=0)

def compute_point_statistics(
    da: xr.DataArray,
    lat: float,
    lon: float,
    level: Optional[float] = None,
    date: Optional[str] = None
) -> pd.DataFrame:
    point = da.sel(lat=lat, lon=lon, method="nearest")
    if is_multilevel(da):
        if level is None:
            level = float(point["level"].values[0])
        point = point.sel(level=level, method="nearest")
    if date:
        point = select_time_safe(point, date)
    arr = point.values.flatten().astype(float)
    arr = arr[np.isfinite(arr)]
    if len(arr) == 0:
        return pd.DataFrame([{}], index=["Empty"])
    stats = {
        "Min": np.min(arr),
        "25%": np.percentile(arr, 25),
        "50%": np.median(arr),
        "Mean": np.mean(arr),
        "75%": np.percentile(arr, 75),
        "Max": np.max(arr),
        "Std": np.std(arr, ddof=0),
        "Var": np.var(arr, ddof=0),
        "Skewness": skew(arr, bias=False),
        "Kurtosis": kurtosis(arr, bias=False),
    }
    return pd.DataFrame([stats], index=[f"({lat:.2f}, {lon:.2f})"])

def compute_point_stats(da: xr.DataArray, lat: float, lon: float, level: Optional[float] = None) -> pd.DataFrame:
    point = da.sel(lat=lat, lon=lon, method="nearest")
    if is_multilevel(da):
        if level is None:
            level = float(point["level"].values[0])
        point = point.sel(level=level, method="nearest")
    times = iso_times_from_coord(point["time"])
    vals = point.values.astype(float)
    mask = np.isfinite(vals)
    times = np.array(times)[mask]
    vals = vals[mask]
    mean_val = np.mean(vals)
    std_val = np.std(vals, ddof=0)
    df = pd.DataFrame({
        "Time": times,
        "Value": vals,
    })
    df["Mean"] = mean_val
    df["Std"] = std_val
    return df.set_index("Time")

def compute_monthly_mean_std(
    da: xr.DataArray,
    lat: float,
    lon: float,
    year: int,
    level: Optional[float] = None
) -> pd.DataFrame:
    point = da.sel(lat=lat, lon=lon, method="nearest")
    if is_multilevel(da):
        if level is None:
            level = float(point["level"].values[0])
        point = point.sel(level=level, method="nearest")
    times = pd.to_datetime(iso_times_from_coord(point["time"]))
    vals = point.values.astype(float)
    mask = np.isfinite(vals)
    times = times[mask]
    vals = vals[mask]
    df = pd.DataFrame({"Time": times, "Value": vals})
    df["Year"] = df["Time"].dt.year
    df["Month"] = df["Time"].dt.month
    df_year = df[df["Year"] == year]
    if df_year.empty:
        raise ValueError(f"No data available for year {year}")
    stats = df_year.groupby("Month")["Value"].agg(
        Mean="mean", Std="std"
    ).reset_index()
    stats["Month Name"] = stats["Month"].apply(lambda m: pd.to_datetime(f"2000-{m:02d}-01").strftime("%B"))
    return stats.set_index("Month Name")[["Mean", "Std"]]

def compute_monthly_mean_yearly_std(
    da, lat: float, lon: float, year: int, level: float = None
) -> pd.DataFrame:
    point = da.sel(lat=lat, lon=lon, method="nearest")
    if "level" in point.dims or "plev" in point.dims:
        if level is None:
            level = float(point["level"].values[0])
        point = point.sel(level=level, method="nearest")
    times = pd.to_datetime(iso_times_from_coord(point["time"]))
    vals = point.values.astype(float)
    mask = np.isfinite(vals)
    times = times[mask]
    vals = vals[mask]
    df = pd.DataFrame({"Time": times, "Value": vals})
    df["Year"] = df["Time"].dt.year
    df["Month"] = df["Time"].dt.month
    df_year = df[df["Year"] == year]
    means = df_year.groupby("Month")["Value"].mean()
    stds = df.groupby("Month")["Value"].agg(lambda x: np.std(x, ddof=0))
    stats = pd.DataFrame({"Mean": means, "Std": stds})
    stats = stats.reset_index()
    stats["Month Name"] = stats["Month"].apply(
        lambda m: pd.to_datetime(f"2000-{m:02d}-01").strftime("%B")
    )
    return stats.set_index("Month Name")[["Mean", "Std"]]

def compute_seasonal_timeseries(
    da, lat: float, lon: float, month: int, start_year: int, end_year: int, level: float = None
) -> pd.DataFrame:
    point = da.sel(lat=lat, lon=lon, method="nearest")
    if "level" in point.dims or "plev" in point.dims:
        if level is None:
            level = float(point["level"].values[0])
        point = point.sel(level=level, method="nearest")
    times = pd.to_datetime(iso_times_from_coord(point["time"]))
    vals = point.values.astype(float)
    mask = np.isfinite(vals)
    times = times[mask]
    vals = vals[mask]
    df = pd.DataFrame({"Time": times, "Value": vals})
    df["Year"] = df["Time"].dt.year
    df["Month"] = df["Time"].dt.month
    df_season = df[(df["Month"] == month) & (df["Year"].between(start_year, end_year))]
    if df_season.empty:
        raise ValueError(f"No data available for month={month} between {start_year}–{end_year}")
    seasonal_series = df_season[["Year", "Value"]].set_index("Year")
    return seasonal_series

@app.get("/datasets")
def get_datasets():
    metadata = load_metadata(METADATA_PATH)
    cleaned = (
        metadata
        .replace([np.inf, -np.inf], np.nan)
        .where(~metadata.isna(), None)
    )
    return cleaned.to_dict(orient='records')

@app.post("/point_timeseries")
def get_point_timeseries(
    dataset_name: str = Body(...),
    lat: float = Body(...),
    lon: float = Body(...),
    level: Optional[float] = Body(None),
    variable: Optional[str] = Body(None),
    year: Optional[int] = Body(None),
    month: Optional[int] = Body(None),
    day: Optional[int] = Body(None)
):
    da = load_dataset(METADATA_PATH, dataset_name, variable=variable, year=year, month=month, day=day)
    df = compute_point_stats(da, lat, lon, level)
    df_clean = (
        df
        .replace([np.inf, -np.inf], np.nan)
        .where(~df.isna(), None)
    )
    return df_clean.reset_index().to_dict(orient='records')

@app.post("/point_statistics")
def get_point_statistics(
    dataset_name: str = Body(...),
    lat: float = Body(...),
    lon: float = Body(...),
    level: Optional[float] = Body(None),
    date: Optional[str] = Body(None),
    variable: Optional[str] = Body(None),
    year: Optional[int] = Body(None),
    month: Optional[int] = Body(None),
    day: Optional[int] = Body(None)
):
    da = load_dataset(METADATA_PATH, dataset_name, variable=variable, year=year, month=month, day=day)
    df = compute_point_statistics(da, lat, lon, level, date)
    df_clean = (
        df
        .replace([np.inf, -np.inf], np.nan)
        .where(~df.isna(), None)
    )
    return df_clean.reset_index().to_dict(orient='records')

@app.post("/monthly_mean_std")
def get_monthly_mean_std(
    dataset_name: str = Body(...),
    lat: float = Body(...),
    lon: float = Body(...),
    year: int = Body(...),
    level: Optional[float] = Body(None),
    variable: Optional[str] = Body(None)
):
    da = load_dataset(METADATA_PATH, dataset_name, variable=variable)
    df = compute_monthly_mean_std(da, lat, lon, year, level)
    df_clean = (
        df
        .replace([np.inf, -np.inf], np.nan)
        .where(~df.isna(), None)
    )
    return df_clean.reset_index().to_dict(orient='records')

@app.post("/monthly_mean_yearly_std")
def get_monthly_mean_yearly_std(
    dataset_name: str = Body(...),
    lat: float = Body(...),
    lon: float = Body(...),
    year: int = Body(...),
    level: Optional[float] = Body(None),
    variable: Optional[str] = Body(None)
):
    da = load_dataset(METADATA_PATH, dataset_name, variable=variable)
    df = compute_monthly_mean_yearly_std(da, lat, lon, year, level)
    df_clean = (
        df
        .replace([np.inf, -np.inf], np.nan)
        .where(~df.isna(), None)
    )
    return df_clean.reset_index().to_dict(orient='records')

@app.post("/seasonal_timeseries")
def get_seasonal_timeseries(
    dataset_name: str = Body(...),
    lat: float = Body(...),
    lon: float = Body(...),
    month: int = Body(...),
    start_year: int = Body(...),
    end_year: int = Body(...),
    level: Optional[float] = Body(None),
    variable: Optional[str] = Body(None)
):
    da = load_dataset(METADATA_PATH, dataset_name, variable=variable)
    df = compute_seasonal_timeseries(da, lat, lon, month, start_year, end_year, level)
    df_clean = (
        df
        .replace([np.inf, -np.inf], np.nan)
        .where(~df.isna(), None)
    )
    return df_clean.reset_index().to_dict(orient='records')

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
