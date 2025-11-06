"""
Script to create Kerchunk reference files for cloud-stored datasets.
Processes only datasets with Stored='cloud' from metadata.csv
"""

import pandas as pd
import json
import fsspec
from kerchunk.hdf import SingleHdf5ToZarr
from kerchunk.combine import MultiZarrToZarr
from pathlib import Path
import logging
from datetime import datetime, timedelta

# Setup logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def expand_date_pattern(pattern, start_date, end_date, limit=100):
    """
    Expand a date pattern into actual file paths.

    Args:
        pattern: S3 path with {year:04d}{month:02d}{day:02d} placeholders
        start_date: Start date string (format: M/D/YYYY)
        end_date: End date string (format: M/D/YYYY or 'present')
        limit: Maximum number of files to process
    """
    # Parse dates
    start = datetime.strptime(start_date, "%m/%d/%Y")

    if "present" in str(end_date):
        end = datetime.now()
        if "10 days" in str(end_date):
            end = end - timedelta(days=10)
    else:
        end = datetime.strptime(end_date, "%m/%d/%Y")

    # Generate file paths (sample from start, middle, and recent)
    files = []

    # Get some from start
    current = start
    for _ in range(3):
        file_path = pattern.format(
            year=current.year, month=current.month, day=current.day
        )
        files.append(file_path)
        current += timedelta(days=1)

    # Get some from middle
    middle = start + (end - start) / 2
    current = middle
    for _ in range(3):
        file_path = pattern.format(
            year=current.year, month=current.month, day=current.day
        )
        files.append(file_path)
        current += timedelta(days=1)

    # Get some recent (work backwards from end)
    current = end
    recent_files = []
    for _ in range(10):
        file_path = pattern.format(
            year=current.year, month=current.month, day=current.day
        )
        recent_files.append(file_path)
        current -= timedelta(days=1)
    files.extend(reversed(recent_files))

    return files[:limit]


def create_kerchunk_reference(dataset_info, output_dir):
    """
    Create a kerchunk reference file for a cloud dataset.

    Args:
        dataset_info: Series containing dataset metadata
        output_dir: Path to output directory for kerchunk files
    """
    dataset_name = dataset_info["datasetName"]
    input_pattern = dataset_info["inputFile"]
    engine = dataset_info["engine"]
    start_date = dataset_info["startDate"]
    end_date = dataset_info["endDate"]

    logger.info(f"Processing: {dataset_name}")
    logger.info(f"  Input pattern: {input_pattern}")

    # Create output filename
    safe_name = (
        dataset_name.replace(" ", "_").replace("/", "_").replace("–", "-").lower()
    )
    output_file = output_dir / f"{safe_name}.json"

    try:
        # Handle different input patterns
        if input_pattern.endswith("/"):
            # Directory pattern (CMORPH case)
            kerchunk_references = process_directory(
                input_pattern, engine, start_date, end_date
            )
        elif "*" in input_pattern and (
            "{year" in input_pattern
            or "{month" in input_pattern
            or "{day" in input_pattern
        ):
            # Mixed wildcard and date template (NDVI case)
            kerchunk_references = process_mixed_pattern(
                input_pattern, engine, start_date, end_date
            )
        elif (
            "{year" in input_pattern
            or "{month" in input_pattern
            or "{day" in input_pattern
        ):
            # Date-templated pattern
            kerchunk_references = process_templated_files(
                input_pattern, engine, start_date, end_date
            )
        elif "*" in input_pattern:
            # Wildcard pattern
            kerchunk_references = process_wildcard_files(input_pattern, engine)
        else:
            # Single file
            kerchunk_references = process_single_file(input_pattern, engine)

        # Save kerchunk reference
        with open(output_file, "w") as f:
            json.dump(kerchunk_references, f)

        logger.info(f"✓ Created kerchunk reference: {output_file}")
        return str(output_file)

    except Exception as e:
        logger.error(f"✗ Failed to process {dataset_name}: {str(e)}")
        import traceback

        logger.debug(traceback.format_exc())
        return None


def normalize_s3_path(path):
    """Ensure path is in correct S3 format without s3:// prefix."""
    path = path.replace("s3://", "")
    return path


def process_single_file(s3_path, engine):
    """Process a single NetCDF/HDF5 file from S3."""
    fs = fsspec.filesystem("s3", anon=True)
    clean_path = normalize_s3_path(s3_path)

    with fs.open(clean_path, "rb") as f:
        h5chunks = SingleHdf5ToZarr(f, f"s3://{clean_path}", inline_threshold=100)
        kerchunk_dict = h5chunks.translate()

    return kerchunk_dict


def process_templated_files(pattern, engine, start_date, end_date):
    """Process files with date templates like {year:04d}{month:02d}{day:02d}."""
    fs = fsspec.filesystem("s3", anon=True)

    # Normalize path
    pattern = normalize_s3_path(pattern)

    # Generate list of file paths from template
    file_paths = expand_date_pattern(pattern, start_date, end_date, limit=20)

    logger.info(f"  Testing {len(file_paths)} candidate file paths")
    logger.info(f"  Sample path: {file_paths[0]}")

    # Test which files actually exist
    existing_files = []
    for i, path in enumerate(file_paths):
        try:
            if fs.exists(path):
                existing_files.append(path)
                logger.info(f"  ✓ Found: {path}")
                if len(existing_files) >= 10:  # Limit to 10 files
                    break
        except Exception:
            if i < 3:  # Log first few failures
                logger.debug(f"  ✗ Not found: {path}")
            continue

    if not existing_files:
        raise ValueError(
            f"No existing files found from template. Checked paths like: {file_paths[0]}"
        )

    logger.info(f"  Found {len(existing_files)} existing files")

    # Process files
    return process_file_list(existing_files, fs)


def process_mixed_pattern(pattern, engine, start_date, end_date):
    """Process patterns with both wildcards and date templates (like NDVI)."""
    fs = fsspec.filesystem("s3", anon=True)

    pattern = normalize_s3_path(pattern)
    logger.info("  Mixed pattern detected")

    # Try a few recent dates
    from datetime import datetime

    if "present" in str(end_date):
        end = datetime.now() - timedelta(days=15)  # NDVI is delayed by 10 days
    else:
        end = datetime.strptime(end_date, "%m/%d/%Y")

    # Try last 30 days
    existing_files = []
    for days_back in range(30):
        current = end - timedelta(days=days_back)

        # Format the pattern with the current date
        search_pattern = pattern.format(
            year=current.year, month=current.month, day=current.day
        )

        logger.info(f"  Trying pattern: {search_pattern}")

        # Use glob to find matching files
        try:
            matches = fs.glob(search_pattern)
            if matches:
                logger.info(f"  ✓ Found {len(matches)} files for {current.date()}")
                existing_files.extend(matches[:5])  # Take up to 5 from this date

                if len(existing_files) >= 10:
                    break
        except Exception as e:
            logger.debug(f"  Error with pattern: {e}")
            continue

    if not existing_files:
        raise ValueError("No files found matching mixed pattern")

    logger.info(f"  Found {len(existing_files)} existing files")

    return process_file_list(existing_files, fs)


def process_wildcard_files(pattern, engine):
    """Process files matching a wildcard pattern."""
    fs = fsspec.filesystem("s3", anon=True)

    clean_pattern = normalize_s3_path(pattern)
    logger.info(f"  Searching pattern: {clean_pattern}")

    # Get list of files
    files = fs.glob(clean_pattern)

    if not files:
        raise ValueError(f"No files found matching pattern: {clean_pattern}")

    logger.info(f"  Found {len(files)} files matching pattern")

    # Limit to first 10 files
    files = sorted(files)[:10]

    return process_file_list(files, fs)


def process_directory(dir_path, engine, start_date, end_date):
    """Process files in a directory (CMORPH case)."""
    fs = fsspec.filesystem("s3", anon=True)

    clean_path = normalize_s3_path(dir_path.rstrip("/"))
    logger.info(f"  Searching directory: {clean_path}")

    # CMORPH has subdirectories by year
    files_found = []

    # Try recent years (work backwards from 2024)
    for year in range(2024, 1997, -1):
        try:
            year_path = f"{clean_path}/{year}"
            logger.info(f"  Checking year: {year_path}")

            # List files in this year directory
            all_items = fs.ls(year_path)

            # Filter for .nc files
            nc_files = [item for item in all_items if item.endswith(".nc")]

            if nc_files:
                files_found.extend(sorted(nc_files)[:10])
                logger.info(f"  ✓ Found {len(nc_files)} .nc files in {year}")
                break
            else:
                # Check if items are subdirectories (like months)
                if all_items and not any(item.endswith(".nc") for item in all_items):
                    logger.info(f"  Checking subdirectories in {year}")
                    # Check first subdirectory
                    for subdir in all_items[:3]:
                        sub_files = fs.ls(subdir)
                        nc_in_sub = [f for f in sub_files if f.endswith(".nc")]
                        if nc_in_sub:
                            files_found.extend(sorted(nc_in_sub)[:10])
                            logger.info(
                                f"  ✓ Found {len(nc_in_sub)} .nc files in {subdir}"
                            )
                            break
                    if files_found:
                        break

        except Exception as e:
            logger.debug(f"  ✗ Year {year} error: {e}")
            continue

    if not files_found:
        raise ValueError(f"No .nc files found in directory: {clean_path}")

    return process_file_list(files_found, fs)


def process_file_list(file_paths, fs):
    """Process a list of file paths and create combined kerchunk reference."""
    references = []

    for i, file_path in enumerate(file_paths):
        logger.info(f"  Processing file {i + 1}/{len(file_paths)}: {file_path}")
        s3_url = f"s3://{file_path}"

        try:
            with fs.open(file_path, "rb") as f:
                h5chunks = SingleHdf5ToZarr(f, s3_url, inline_threshold=100)
                references.append(h5chunks.translate())
        except Exception as e:
            logger.warning(f"  Skipping file {file_path}: {str(e)}")
            continue

    if not references:
        raise ValueError("No files were successfully processed")

    logger.info(f"  Successfully processed {len(references)} files")

    # Combine references if multiple files
    if len(references) > 1:
        try:
            mzz = MultiZarrToZarr(
                references,
                concat_dims=["time"],
                identical_dims=["lat", "lon", "latitude", "longitude", "x", "y"],
            )
            combined = mzz.translate()
            return combined
        except Exception as e:
            logger.warning(
                f"  Failed to combine references: {e}. Using first file only."
            )
            return references[0]
    else:
        return references[0]


def main():
    """Main function to process metadata and create kerchunk references."""
    # Read metadata
    metadata = pd.read_csv("metadata.csv")

    # Filter for cloud-stored datasets only
    cloud_datasets = metadata[metadata["Stored"] == "cloud"].copy()

    logger.info(f"Found {len(cloud_datasets)} cloud-stored datasets to process\n")

    # Create output directory
    output_dir = Path("kerchunk")
    output_dir.mkdir(exist_ok=True)

    # Process each cloud dataset
    results = []
    for idx, row in cloud_datasets.iterrows():
        result = create_kerchunk_reference(row, output_dir)
        results.append(
            {
                "datasetName": row["datasetName"],
                "kerchunkPath": result,
                "status": "success" if result else "failed",
            }
        )
        logger.info("")  # Blank line between datasets

    # Print summary
    logger.info("=" * 60)
    logger.info("PROCESSING SUMMARY")
    logger.info("=" * 60)
    successful = sum(1 for r in results if r["status"] == "success")
    failed = sum(1 for r in results if r["status"] == "failed")
    logger.info(f"Total datasets: {len(results)}")
    logger.info(f"Successful: {successful}")
    logger.info(f"Failed: {failed}")

    if successful > 0:
        logger.info("\nSuccessful datasets:")
        for r in results:
            if r["status"] == "success":
                logger.info(f"  ✓ {r['datasetName']}")

    if failed > 0:
        logger.info("\nFailed datasets:")
        for r in results:
            if r["status"] == "failed":
                logger.info(f"  ✗ {r['datasetName']}")

    # Save results summary
    results_df = pd.DataFrame(results)
    results_df.to_csv("kerchunk/processing_results.csv", index=False)
    logger.info("\nResults saved to: kerchunk/processing_results.csv")


if __name__ == "__main__":
    main()
