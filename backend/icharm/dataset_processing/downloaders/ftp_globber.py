import fnmatch
from dataclasses import dataclass
from ftplib import FTP, error_perm
from urllib.parse import urlparse, unquote


@dataclass(frozen=True)
class FtpGlob:
    host: str
    segments: list[str]  # path segments, may include globs like "*", "foo*"
    raw_url: str


class FtpGlobber:
    @staticmethod
    def get_urls_from_glob(globed_url: str) -> list[str]:
        """
        Easy entrypoint to getting download links
        """
        ftp_globber = FtpGlobber(globed_url=globed_url)
        results = ftp_globber.expand_ftp_glob()
        return results

    def __init__(self, globed_url: str):
        self.globed_url = globed_url
        return

    def _parse_ftp_glob(self, url: str) -> FtpGlob:
        """
        Accepts e.g.:
          ftp://ftp.cdc.noaa.gov/Projects/*/sfc_paramsSI/acond.*.nc
        """
        p = urlparse(url)
        if p.scheme != "ftp":
            raise ValueError(f"Expected ftp:// URL, got: {url}")

        host = p.hostname
        if not host:
            raise ValueError(f"Missing hostname in URL: {url}")

        # Remove leading slash, split into segments
        path = unquote(p.path or "").lstrip("/")
        if not path:
            raise ValueError(f"Missing path in URL: {url}")

        segments = [s for s in path.split("/") if s]
        return FtpGlob(host=host, segments=segments, raw_url=url)

    def _ftp_listdir(self, ftp: FTP, path: str) -> list[str]:
        """
        Return a list of names in the directory `path` (not full paths).
        """
        try:
            ftp.cwd(path)
            return ftp.nlst()
        except error_perm:
            # Directory doesn't exist / not accessible
            return []

    def expand_ftp_glob(self) -> list[str]:
        """
        Expand an FTP glob URL into a list of concrete ftp:// file URLs.
        Supports globs in intermediate path segments and in the filename segment.
        """
        spec = self._parse_ftp_glob(self.globed_url)

        # Everything except the last segment is "directories"; last is "filename pattern"
        *dir_segments, file_pat = spec.segments

        # We'll build candidate directories as paths like "Projects/20CRv3/sfc_paramsSI"
        candidate_dirs: list[str] = [""]  # relative to FTP root

        with FTP(spec.host) as ftp:
            ftp.login()

            # TODO: This section is a bit messy. There's probably a better way to do this.
            for seg in dir_segments:
                next_dirs: list[str] = []
                has_glob = any(ch in seg for ch in "*?[]")

                for base in candidate_dirs:
                    # list directory at current base
                    list_path = base or "/"
                    if not list_path.startswith("/"):
                        list_path = "/" + list_path
                    names = self._ftp_listdir(ftp, list_path)

                    if not names:
                        continue

                    if has_glob:
                        matched = [n for n in names if fnmatch.fnmatch(n, seg)]
                    else:
                        matched = [seg] if seg in names else []

                    for m in matched:
                        new_base = f"{base}/{m}" if base else m
                        next_dirs.append(new_base)

                candidate_dirs = next_dirs
                if not candidate_dirs:
                    break

            if not candidate_dirs:
                return []

            # Now list files in each candidate dir and match file pattern
            results: list[str] = []
            for d in candidate_dirs:
                if not d.startswith("/"):
                    d = "/" + d
                names = self._ftp_listdir(ftp, d)
                for n in names:
                    if fnmatch.fnmatch(n, file_pat):
                        # Build full ftp url
                        results.append(f"ftp://{spec.host}/{d}/{n}")

            return sorted(set(results))
