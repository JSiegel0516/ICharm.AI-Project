"""
Generated from LLM, need to clean up
"""

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Literal

Cadence = Literal["single_file", "year", "year_month", "year_month_day", "unknown"]

# Match patterns like:
# 1990
# 1990-01 or 199001
# 1990-01-01 or 19900101
RE_YMD = re.compile(
    r"(?<!\d)(18\d{2}|19\d{2}|20\d{2})[-_]?([01]\d)[-_]?([0-3]\d)(?!\d)"
)
RE_YM = re.compile(r"(?<!\d)(18\d{2}|19\d{2}|20\d{2})[-_]?([01]\d)(?!\d)")
RE_Y = re.compile(r"(?<!\d)(18\d{2}|19\d{2}|20\d{2})(?!\d)")


def _valid_month(m: int) -> bool:
    return 1 <= m <= 12


def _valid_day(d: int) -> bool:
    return 1 <= d <= 31


@dataclass
class CadenceGuess:
    cadence: str
    coverage: float  # fraction of files that matched the chosen cadence
    unique_periods: int  # unique years / months / days found
    sample_periods: list[str]  # a few examples
    notes: str = ""


def infer_cadence(
    paths: Iterable[str | Path], min_coverage: float = 0.6
) -> CadenceGuess:
    files = [str(p) for p in paths]
    if not files:
        return CadenceGuess("unknown", 0.0, 0, [], "No files provided")

    # For each file, record best match found (prefer YMD > YM > Y)
    ymd_vals: list[str] = []
    ym_vals: list[str] = []
    y_vals: list[str] = []

    ymd_hits = 0
    ym_hits = 0
    y_hits = 0

    for f in files:
        m = RE_YMD.search(f)
        if m:
            y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if _valid_month(mo) and _valid_day(d):
                ymd_hits += 1
                ymd_vals.append(f"{y:04d}-{mo:02d}-{d:02d}")
                continue

        m = RE_YM.search(f)
        if m:
            y, mo = int(m.group(1)), int(m.group(2))
            if _valid_month(mo):
                ym_hits += 1
                ym_vals.append(f"{y:04d}-{mo:02d}")
                continue

        m = RE_Y.search(f)
        if m:
            y_hits += 1
            y_vals.append(f"{int(m.group(1)):04d}")

    n = len(files)

    # If there is literally one file (or nearly one), assume single_file
    if n == 1:
        return CadenceGuess("single_file", 1.0, 1, [], "Only 1 file")

    # Prefer the most specific cadence with enough coverage
    candidates = [
        ("year_month_day", ymd_hits, ymd_vals),
        ("year_month", ym_hits, ym_vals),
        ("year", y_hits, y_vals),
    ]

    for cadence, hits, vals in candidates:
        coverage = hits / n
        if coverage >= min_coverage and hits > 0:
            unique = sorted(set(vals))
            return CadenceGuess(
                cadence=cadence,
                coverage=coverage,
                unique_periods=len(unique),
                sample_periods=unique[:10],
                notes=f"Matched {hits}/{n} files ({coverage:.0%}) using filename tokens",
            )

    # If nothing consistently matches, call it unknown
    return CadenceGuess(
        "unknown",
        max(ymd_hits, ym_hits, y_hits) / n,
        len(set(ymd_vals or ym_vals or y_vals)),
        sorted(set(ymd_vals or ym_vals or y_vals))[:10],
        "No cadence met the coverage threshold; filenames may not contain dates consistently",
    )
