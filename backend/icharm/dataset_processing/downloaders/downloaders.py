import logging
import os
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)


class Downloaders:
    @staticmethod
    def wget_download(
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

        for idx, u in enumerate(urls):
            logger.info(f"Downloading {u} -> {dest_path}")
            cmd = ["wget", "-c", "-P", str(dest_path), u]
            if quiet:
                cmd.insert(1, "-q")
            subprocess.run(cmd, check=True)

            if is_debug and idx > 4:  # If Debug, don't download everything!
                logger.info("IS_DEBUG = TRUE, download breaking early")
                break

    @staticmethod
    def s3_download(url: str, dest: str):
        cmd = ["aws", "s3", "sync", url, dest, "--no-sign-request"]
        subprocess.run(cmd, check=True)
        return
