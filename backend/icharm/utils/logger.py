import logging
import sys


logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


LOG_LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


def setup_logging(
    level: str = "INFO",
    json: bool = False,
) -> None:
    """
    Configure global logging for the whole process.
    Call once, from your entrypoint (CLI/main).
    """

    root = logging.getLogger()

    if level not in LOG_LEVELS:
        raise ValueError(f"{level} is not a valid log level")

    root.setLevel(level.upper())

    # Remove any existing handlers (useful when running under IDEs / notebooks)
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)

    if json:
        # Minimal JSON-ish formatter without extra deps
        formatter = logging.Formatter(
            fmt='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":%(message)r}',
            datefmt="%Y-%m-%dT%H:%M:%S",
        )
    else:
        formatter = logging.Formatter(
            fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    handler.setFormatter(formatter)
    root.addHandler(handler)

    # Optional: quiet noisy libs
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("botocore").setLevel(logging.WARNING)
    return
