"""
Shared helpers for making invoice PDF filenames safe and consistent.

Rules:
- Strip any path components
- Replace spaces and '#' with underscores
- Lowercase the extension and ensure .pdf
- Collapse repeated underscores
"""

import os
import re
import time
import unicodedata


SAFE_CHARS_PATTERN = re.compile(r"[^A-Za-z0-9_.()+&,'-]+")


def _strip_extension(name: str) -> str:
    if name.lower().endswith(".pdf"):
        return name[: -len(".pdf")]
    return name


def sanitize_filename(raw: str, default_ext: str = ".pdf") -> str:
    # Keep only the basename to avoid path traversal issues
    base = os.path.basename(raw or "")
    base = unicodedata.normalize("NFKD", base)
    base = base.encode("ascii", "ignore").decode("ascii")

    without_ext = _strip_extension(base)

    cleaned = (
        without_ext.replace("#", "_")
        .replace(" ", "_")
        .replace("%20", "_")
    )
    cleaned = SAFE_CHARS_PATTERN.sub("_", cleaned)
    cleaned = re.sub(r"_+", "_", cleaned).strip("_.")

    if not cleaned:
        cleaned = f"invoice_{int(time.time() * 1000)}"

    return f"{cleaned}{default_ext.lower()}"


def api_pdf_path(filename: str) -> str:
    """Return the API path for a PDF filename."""
    return f"/api/pdf/{sanitize_filename(filename)}"






