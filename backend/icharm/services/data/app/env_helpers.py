from typing import Optional
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file in root folder
ROOT_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = ROOT_DIR.parent.parent
env_path = ROOT_DIR / ".env.local"
load_dotenv(dotenv_path=env_path)


class EnvHelpers:
    @staticmethod
    def resolve_env_path(
        value: Optional[str],
        default: str,
        ensure_exists: bool = False,
    ) -> Path:
        """Resolve environment paths relative to project structure when needed."""

        candidate_str = (value or default).strip()
        candidate = Path(candidate_str).expanduser()

        if not candidate.is_absolute():
            search_roots = [PROJECT_ROOT, ROOT_DIR, ROOT_DIR.parent]
            resolved = None
            for base in search_roots:
                attempt = (base / candidate).resolve()
                if attempt.exists():
                    resolved = attempt
                    break
            if resolved is None:
                resolved = (PROJECT_ROOT / candidate).resolve()
            candidate = resolved

        if ensure_exists:
            candidate.mkdir(parents=True, exist_ok=True)

        return candidate
