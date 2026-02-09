import logging
import os
import subprocess
from pathlib import Path

from tqdm import tqdm

logger = logging.getLogger(__name__)


class Downloaders:
    @staticmethod
    def wget_download_files(
        urls: list[str], dest: str | Path, *, quiet: bool = False
    ) -> None:
        """
        Oddly, it's better to actually use command line wget to download a file
        as it has better resume options and such than trying to set all this up
        in python
        """
        dest_path = Path(dest)
        dest_path.mkdir(parents=True, exist_ok=True)

        is_debug = os.getenv("IS_DEBUG", "FALSE").upper() == "TRUE"

        for idx, u in tqdm(enumerate(urls)):
            # logger.info(f"Downloading {u} -> {dest_path}")
            cmd = ["wget", "-c", "-P", str(dest_path), u]
            if quiet:
                cmd.insert(1, "-q")
            subprocess.run(cmd, check=True)

            if is_debug and idx > 4:  # If Debug, don't download everything!
                logger.info("IS_DEBUG = TRUE, download breaking early")
                break

    @staticmethod
    def wget_download_file(
        url: str,
        output_file: str | Path,
        *,
        quiet: bool = False,
        resume: bool = True,
        overwrite: bool = True,
    ) -> Path:
        """
        Download a single URL to an exact output filename.

        Notes:
        - Uses `-O` to force the output filename.
        - Uses `-c` if `resume=True` (continue partial downloads).
        - If `overwrite=False` and the file exists, it will skip downloading.
        """
        out_path = Path(output_file)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        if out_path.exists() and not overwrite:
            logger.info(f"File exists, skipping download: {out_path}")
            return out_path

        logger.info(f"Downloading {url} -> {out_path}")

        cmd: list[str] = ["wget"]

        if quiet:
            cmd.append("-q")

        if resume:
            cmd.append("-c")

        # Force output filename
        cmd += ["-O", str(out_path), url]

        subprocess.run(cmd, check=True)
        return out_path

    @staticmethod
    def s3_download(url: str, dest: str):
        cmd = ["aws", "s3", "sync", url, dest, "--no-sign-request"]
        subprocess.run(cmd, check=True)
        return
