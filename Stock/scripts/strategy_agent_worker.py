"""
Deployment helper that invokes the canonical daily workflow.
"""

from __future__ import annotations

import os
import subprocess
import sys


def main() -> None:
    provider = os.getenv("AGENT_PROVIDER", os.getenv("DATA_PROVIDER", "akshare"))
    subprocess.run(
        [sys.executable, "main.py", "--run", "daily", "--provider", provider],
        check=True,
    )


if __name__ == "__main__":
    main()
