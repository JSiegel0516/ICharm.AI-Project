# iCharmFastAPI Service

This document describes how the dataset FastAPI service fits into the project, how it discovers climate datasets, and how the CMORPH timeseries feature reaches the frontend.

## Architecture Overview

- **Location**: `services/data-api/app/iCharmFastAPI.py` exposes a FastAPI application that is built into the `data-api` container.
- **Purpose**: Provide a uniform JSON interface for climate datasets defined in `metadata.csv` (local bundles or remote S3 resources). It powers both the mock data used across the UI and dynamic timeseries requests.
- **Metadata driven**: Every request reads from `metadata.csv` to locate the dataset, discover variables, units, available levels, and paths.
- **Shared helpers**: Functions such as `load_metadata`, `choose_best_variable`, `load_dataset`, `is_multilevel`, and `select_time_safe` encapsulate most of the common logic.

## Metadata Flow

1. **`metadata.csv`** lives in the repo root. It is bind-mounted into the container at `/app/metadata.csv` and `/app/data/metadata.csv`.
2. `load_metadata` reads the file on every request (data is small), guaranteeing the API always reflects the current CSV.
3. Each row contains keys like `datasetName`, `Stored` (`local` or `cloud`), `inputFile`, `keyVariable`, `engine`, and optional `kerchunkPath`.
4. Dataset discovery works as follows:
   - If `Stored` is `local`, `inputFile` is treated as a path inside the container volume (supports NetCDF and Zarr).
   - If `Stored` is `cloud`, the API expects an S3 template. `load_dataset` handles S3 access through `s3fs`, applying the `{year}` / `{month}` / `{day}` placeholders when needed.
   - For templated NetCDF directories, the service builds the S3 glob pattern and opens a multi-file dataset with `xarray.open_mfdataset`.

## Core Utility Functions

| Function               | Responsibility                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `load_metadata`        | Read and validate the CSV; raises if missing or malformed.                                                     |
| `iso_times_from_coord` | Normalize time coordinates (xarray, numpy, pandas, or cftime) to ISO strings.                                  |
| `choose_best_variable` | Heuristic that favours anomaly, temperature, precipitation or wind variables when a user does not specify one. |
| `is_multilevel`        | Detects whether a dataset has vertical levels (`level`, `plev`).                                               |
| `select_time_safe`     | Select the nearest timestep; falls back to the first record if parsing fails.                                  |
| `load_dataset`         | Open a dataset (local or S3) and return an `xarray.DataArray`. This is the gateway used by every endpoint.     |

## Standard API Endpoints

These routes are primarily used by the frontend helper scripts and the (future) analysis dashboard.

| Route                      | Method | Description                                                                                                                                                              |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/datasets`                | `GET`  | Returns an array of dataset rows derived from `metadata.csv`. NaN/Infinity are normalised to `null` before serialization.                                                |
| `/point_timeseries`        | `POST` | Body contains `dataset_name`, `lat`, `lon`, optional `variable`, `level`, `year`, `month`, `day`. Returns a time-ordered series of values around the requested location. |
| `/point_statistics`        | `POST` | Same payload as above, but returns descriptive statistics (min, max, quartiles, mean, std, variance, skewness, kurtosis).                                                |
| `/monthly_mean_std`        | `POST` | Computes monthly mean and std for a specific year.                                                                                                                       |
| `/monthly_mean_yearly_std` | `POST` | For the requested year, returns the monthly mean plus the standard deviation calculated across all available years.                                                      |
| `/seasonal_timeseries`     | `POST` | Returns a year-over-year series for a specific month (useful for seasonal comparisons).                                                                                  |

All endpoints normalise infinities to `null` to keep the JSON encoder happy.

## CMORPH Timeseries Endpoint

The notebook `CDR.ipynb` inspired a dedicated endpoint for daily precipitation.

- **Route**: `POST /cdr/precip_timeseries`
- **Expected JSON body**:
  ```json
  {
    "dataset_name": "Precipitation - CMORPH CDR", // optional � defaults to the CMORPH metadata row
    "year": 2024,
    "month": "01",
    "lat": 32.7,
    "lon": -117.2,
    "comparison_year": 2023, // optional
    "comparison_month": "01" // optional
  }
  ```
- **Process**:
  1. `_get_metadata_row` reads the CMORPH entry from `metadata.csv`.
  2. `_cmorph_timeseries` uses `s3fs` + `xarray.open_mfdataset` to open all daily NetCDF files for the requested month. It respects `engine`, `keyVariable`, and handles `s3://` prefixes.
  3. The nearest grid point to the requested lat/lon is selected via `sel(..., method='nearest')` and loaded into memory.
  4. Time/value pairs are converted to JSON, with infinities replaced by `null`.
  5. If `comparison_year` / `comparison_month` are supplied, a second series is included.
- **Response**: JSON payload with `primary.series`, optional `comparison.series`, and metadata about units, requested/nearest coordinates, number of files opened, etc.

### Dependencies

When the container image is built, the following packages enable CMORPH:

- `s3fs` for anonymous S3 access.
- `h5netcdf` so `xarray` can read h5netcdf NetCDF files served by NOAA.
- `dask[array]` (installed as `dask==2024.5.0`) so `open_mfdataset` can operate on the remote tiles.

## Next.js Proxy Route

To avoid CORS and keep secrets server-side, the frontend talks to `/api/cdr/precip-timeseries`:

- File: `src/app/api/cdr/precip-timeseries/route.ts`
- Behaviour: forwards the request body to `${DATA_SERVICE_URL}/cdr/precip_timeseries` and relays the response (status + body) back to the browser.
- No transformation is performed, so the React components receive the backend payload directly.

## Region Info Panel Integration

Within the globe (`src/components/ui/RegionInfoPanel.tsx`):

1. When the user clicks a location, the panel shows precipitation, coordinates, and dataset name with correct units (derived from `currentDataset.units`).
2. Clicking **Time Series** opens a modal. The component:
   - Clamps the requested date to the dataset coverage window (`currentDataset.backend.startDate`/`endDate`).
   - Calls the Next.js proxy endpoint with lat/lon/month/year.
   - Renders the returned series using Recharts. If the dataset isn�t CMORPH, a friendly error explains that timeseries are available for CMORPH only (for now).
3. Loading and error states are surfaced in the modal so users know what happened.

## Local Development & Tips

- Rebuild the dataset container whenever `iCharmFastAPI.py` or its `requirements.txt` change: `docker compose -f docker/docker-compose.yml --project-directory . up -d --build data-api`.
- Use the `Invoke-WebRequest` snippet below to test the CMORPH endpoint from PowerShell without the UI:
  ```powershell
  Invoke-WebRequest -Method POST `
    -Uri http://localhost:8002/cdr/precip_timeseries `
    -Body '{"dataset_name":"Precipitation - CMORPH CDR","year":2024,"month":"01","lat":32.7,"lon":-117.2}' `
    -ContentType 'application/json'
  ```
- If you add new datasets to `metadata.csv`, restart the container to ensure the API reads the latest file.

## Troubleshooting

- **404 from `/cdr/precip_timeseries`**: usually means the requested month lies outside the dataset coverage or the metadata path is wrong. Verify start/end dates in `metadata.csv`.
- **`unrecognized engine h5netcdf`**: install `h5netcdf` (already pinned in `services/data-api/requirements.txt`).
- **`unrecognized chunk manager dask`**: ensure `dask[array]` is installed (also pinned now).
- **No timeseries in the modal**: confirm the CMORPH dataset is active and the Next.js dev server has been restarted after adding the proxy route.

## File Map

```
services/
  data-api/
    app/
      iCharmFastAPI.py     # FastAPI application (datasets + CMORPH)
      __init__.py
    Dockerfile             # Builds the image with xarray/s3fs/h5netcdf/dask
src/
  app/
    api/
      cdr/precip-timeseries/route.ts   # Next.js proxy to the backend
  components/UI/
      RegionInfoPanel.tsx  # Globe modal that triggers the CMORPH timeseries
metadata (2).csv / metadata.csv        # Dataset registry consumed by the API
```

## Future Enhancements

- Persist or cache frequently requested CMORPH months to reduce S3 hits.
- Extend the modal to support additional datasets (e.g., NOAA temperature grids).
- Add unit tests that exercise `_cmorph_timeseries` with local NetCDF fixtures.
- Surface timeseries in the dashboard pages in addition to the region popup modal.
