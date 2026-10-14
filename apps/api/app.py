"""Vercel entrypoint: Vercel's Python runtime serves the FastAPI instance named `app` in this file."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from scopeprofit.api.app import create_app

app = create_app()
