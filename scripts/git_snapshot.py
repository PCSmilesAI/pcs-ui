#!/usr/bin/env python3
"""
git_snapshot.py - Retrieve current git state for BuildLog enrichment.

Returns commit hash, changed files, and repo root.
Fails gracefully if git is unavailable or the directory is not a repo.
"""

import subprocess
import json
import sys
from pathlib import Path


def _run_git(*args: str, cwd: str | None = None) -> str | None:
    """Run a git command and return stripped stdout, or None on failure."""
    try:
        result = subprocess.run(
            ["git", *args],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=cwd,
        )
        if result.returncode == 0:
            return result.stdout.strip()
        return None
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None


def get_commit_hash(cwd: str | None = None) -> str | None:
    return _run_git("rev-parse", "HEAD", cwd=cwd)


def get_changed_files(cwd: str | None = None) -> list[str]:
    """Return list of files with uncommitted changes (staged + unstaged + untracked)."""
    lines: list[str] = []

    diff_output = _run_git("diff", "--name-only", cwd=cwd)
    if diff_output:
        lines.extend(diff_output.splitlines())

    staged_output = _run_git("diff", "--cached", "--name-only", cwd=cwd)
    if staged_output:
        lines.extend(staged_output.splitlines())

    untracked = _run_git("ls-files", "--others", "--exclude-standard", cwd=cwd)
    if untracked:
        lines.extend(untracked.splitlines())

    return sorted(set(lines))


def get_repo_root(cwd: str | None = None) -> str | None:
    return _run_git("rev-parse", "--show-toplevel", cwd=cwd)


def snapshot(cwd: str | None = None) -> dict:
    """Return a full git snapshot dict."""
    return {
        "commit_hash": get_commit_hash(cwd=cwd),
        "changed_files": get_changed_files(cwd=cwd),
        "repo_root": get_repo_root(cwd=cwd),
    }


if __name__ == "__main__":
    cwd = sys.argv[1] if len(sys.argv) > 1 else None
    print(json.dumps(snapshot(cwd=cwd), indent=2))
