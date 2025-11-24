# Notes

## Playing with an `ERDDAP` dataset (something that lets us get individual datetime values) [netcdf_processing.py](./netcdf_processing.py)

- This was a different idea. I read this is fast and maybe we should ask them to convert to this dataset.
- I found some random dataset that let us do this

Performance grabbing 1,488 values:

```
erddap_speed_test:
	Wall time: 38.837312s
	CPU user: 0.620000s
	CPU system: 0.020000s
	Memory change: 38.969 MB
```

Bonus is that the system didn't work hard to get it.

## Downloading all of cmorph locally [netcdf_indexer.py](./netcdf_indexer.py)

### Daily (~4.1 GB)

```bash
aws s3 sync s3://noaa-cdr-precip-cmorph-pds/data/daily ./daily --no-sign-request
```

Performance grabbing 7,306 values (on rust hard drive on SMB share):

```
get_grid_data:
	Wall time: 26.810614s
	CPU user: 21.270000s
	CPU system: 1.720000s
	Memory change: 6.523 MB
```

Put the data on the VMs "local" disk (SSD) and performance was nearly identical:

```
get_grid_data:
	Wall time: 26.536082s
	CPU user: 21.070000s
	CPU system: 1.550000s
	Memory change: 7.207 MB
```

Multi-threading will probably help this a lot, but process is VERY CPU intensive.

Migrating to a DB may help speed even more.

### Hourly (~48.6 GB)

```bash
aws s3 sync s3://noaa-cdr-precip-cmorph-pds/data/hourly ./hourly --no-sign-request
```

### 30min

```bash
aws s3 sync s3://noaa-cdr-precip-cmorph-pds/data/30min ./30min --no-sign-request
```
