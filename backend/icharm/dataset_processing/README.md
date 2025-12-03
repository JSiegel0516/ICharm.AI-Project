# Notes

## Created a [netcdf_to_db.py](./netcdf_to_db.py) that can load data netcdf files into postgres

- I haven't tested this with that many datasets.
- `cmorph` was taking way to long to load with it, but other datasets seemed to load fine
  - `cmonph` has too many individual observations (691,200 per day). Need to do something a bit different or querying this will also be slow in the end
- I found an ncep dataset that had different layers and it works fine with this as there isn't as much data as cmorph

## Created a [netcdf_to_db_by_year.py](./netcdf_to_db_by_year.py) that can load data netcdf files into postgres

- This version can handle `cmorph`. I do some tricks by having each year be its own column.
  - It's still a bit messy and needs to be cleaned up.
  - It shares some common bits with the original one that can be refactored and put into common places.
  - It's still buggy as it can't handle leap years correctly (they get pushed all the way to the front) and so get placed in the wrong column so they end up being the wrong year.
- We'll need to be smart about access the data.
  - Hard-code for now, but I think the solution is to learn how to make stored procedures in psql so we can have a uniform set of stored procedures no matter the database.
  - Queries are FAST, I can get all the data for some random gridbox in 0.019 seconds.
    - However, this is the raw data and we'll need to format it correctly and put it into a good structure to read.
- It's running fast enough that we actually don't need to generate 2 copies of the data
- However, the data takes up ~10x the size of the netcdf. We're sitting at ~44 gigs right now

## Created [postgres_query_examples.py](./postgres_query_examples.py) as an example of how to query data.

- Not pretty, very bare bones and need to get other queries going, but it works.
- Well need to create queries similar to how I did it in the old mysql code.

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
