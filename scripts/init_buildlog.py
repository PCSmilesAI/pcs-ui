#!/usr/bin/env python3
"""
init_buildlog.py - Initialize the BuildLog system.

Creates directories, initializes git if needed, and sets up an empty buildlog.json.
Safe to run multiple times; will not overwrite an existing log.
"""

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
LOG_DIR = REPO_ROOT / "build_audit"
REPORTS_DIR = LOG_DIR / "reports"
LOG_FILE = LOG_DIR / "buildlog.json"

BUILDLOG_VERSION = "2.0"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_git() -> bool:
    """Initialize git if not already a repo. Returns True if git is available."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--is-inside-work-tree"],
            capture_output=True, text=True, cwd=str(REPO_ROOT), timeout=5,
        )
        if result.returncode == 0:
            print(f"  Git repo already initialized at {REPO_ROOT}")
            return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        print("  Git not available on this system; skipping git init.")
        return False

    try:
        subprocess.run(
            ["git", "init"],
            capture_output=True, text=True, cwd=str(REPO_ROOT), timeout=10,
        )
        print(f"  Initialized git repo at {REPO_ROOT}")
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as e:
        print(f"  Could not init git: {e}")
        return False


def init_directories() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    print(f"  Created {LOG_DIR.relative_to(REPO_ROOT)}/")

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"  Created {REPORTS_DIR.relative_to(REPO_ROOT)}/")


def init_log_file() -> None:
    if LOG_FILE.exists():
        try:
            with open(LOG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and "entries" in data:
                count = len(data["entries"])
                print(f"  buildlog.json already exists ({count} entries). Not overwriting.")
                return
        except (json.JSONDecodeError, OSError):
            print("  Existing buildlog.json is corrupted. Replacing with fresh log.")

    log_data = {
        "buildlog_version": BUILDLOG_VERSION,
        "project_name": REPO_ROOT.name,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "entries": [],
    }

    with open(LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(log_data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"  Created {LOG_FILE.relative_to(REPO_ROOT)} (v{BUILDLOG_VERSION})")


def main() -> None:
    print("BuildLog Initialization")
    print("=" * 40)
    print()

    print("[1/3] Git repository")
    init_git()
    print()

    print("[2/3] Directory structure")
    init_directories()
    print()

    print("[3/3] Log file")
    init_log_file()
    print()

    print("=" * 40)
    print("BuildLog is ready.")
    print()
    print("Next steps:")
    print("  1. Verify hooks are active: check .cursor/hooks.json")
    print("  2. Test the system:  python3 scripts/test_buildlog.py")
    print("  3. Start working — logging is automatic via Cursor hooks")
    print("  4. Generate reports: python3 scripts/render_report.py")


if __name__ == "__main__":
    main()
