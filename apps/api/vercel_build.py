"""Vercel build step: applies migrations when SCOPEPROFIT_MIGRATE_ON_BUILD=true.

Enable it only on the Production environment so preview builds never touch the production database.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from scopeprofit.cli import upgrade_database  # noqa: E402

if __name__ == "__main__":
    if os.environ.get("SCOPEPROFIT_MIGRATE_ON_BUILD") == "true":
        upgrade_database()
        print("Database migrated to head.")
    else:
        print("SCOPEPROFIT_MIGRATE_ON_BUILD is not true: skipping migrations.")
