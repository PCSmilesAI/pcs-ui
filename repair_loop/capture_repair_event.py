"""
Capture and organise repair events for PCS‑AI's invoice parser system.

This module exposes a single function, ``capture_repair_event``, which
creates a structured folder containing the original and corrected JSON
outputs, the associated invoice PDF, and a copy of the parser file that
generated the original output. Each repair is saved into its own
timestamped directory under ``repair_cases/``. In addition, every
capture is appended to a CSV log for auditing and reporting.

Usage (the UI or a higher layer should call this function):

```
from pcs_ui.repair_loop.capture_repair_event import capture_repair_event

capture_repair_event(
    invoice_number="12345",
    vendor_name="Henry Dental Lab",
    parser_name="henry_parser.py",
    original_output_path="/path/to/original_output.json",
    corrected_output_path="/path/to/corrected_output.json",
    invoice_pdf_path="/path/to/invoices/12345.pdf",
)
```

The function will create a new folder inside ``repair_cases/`` that
looks like:

```
repair_cases/henry_dental_lab_2025-08-04_001/
├── original_output.json
├── corrected_output.json
├── invoice.pdf
└── henry_parser.py
```

And append a row to ``repair_log.csv`` with details about the repair.
"""

import csv
import datetime
import os
import re
import shutil
from pathlib import Path


def _slugify(text: str) -> str:
    """Convert arbitrary vendor names into filesystem‑friendly slugs.

    Lowercases the string, replaces any sequence of non‑alphanumeric
    characters with a single underscore, and strips leading/trailing
    underscores.

    Args:
        text: The raw vendor name.

    Returns:
        A slug suitable for folder names.
    """
    # Replace non‑alphanumeric characters with underscores
    slug = re.sub(r"[^A-Za-z0-9]+", "_", text.lower())
    # Remove leading/trailing underscores
    return slug.strip("_")


def _next_case_index(base_dir: Path, slug: str, date_str: str) -> int:
    """Compute the next available index for a repair case.

    Examines existing folders under ``base_dir`` that start with
    ``f"{slug}_{date_str}_"`` and returns the next integer index.
    Indices are padded to three digits when used in folder names.

    Args:
        base_dir: The directory containing repair case folders.
        slug:     The vendor slug.
        date_str: The date portion of the folder name (YYYY‑MM‑DD).

    Returns:
        The next integer index (starting at 1).
    """
    pattern = re.compile(rf"^{re.escape(slug)}_{re.escape(date_str)}_(\d+)$")
    max_index = 0
    for entry in base_dir.iterdir():
        if entry.is_dir():
            m = pattern.match(entry.name)
            if m:
                try:
                    idx = int(m.group(1))
                    if idx > max_index:
                        max_index = idx
                except ValueError:
                    continue
    return max_index + 1


def capture_repair_event(
    invoice_number: str,
    vendor_name: str,
    parser_name: str,
    original_output_path: str,
    corrected_output_path: str,
    invoice_pdf_path: str,
    *,
    root_dir: Path | None = None,
) -> Path:
    """Create a new repair case folder and log the event.

    Args:
        invoice_number:       Unique invoice identifier (from the document).
        vendor_name:          Human‑friendly vendor name (used to derive slug).
        parser_name:          Filename of the parser used to generate the original output.
        original_output_path: Path to the JSON with the original parser output.
        corrected_output_path:Path to the JSON with user‑corrected output.
        invoice_pdf_path:     Path to the invoice PDF file.
        root_dir:             Optional override for the root of the repair loop
                              (defaults to the directory containing this script).

    Returns:
        Path to the newly created repair case directory.

    Raises:
        FileNotFoundError: If any of the supplied input paths do not exist.
    """
    # Determine the base directory for repair data
    if root_dir is None:
        # ``__file__`` points to this script; its parent is ``repair_loop``
        root_dir = Path(__file__).resolve().parent

    repair_cases_dir = root_dir / "repair_cases"
    vendor_agents_dir = root_dir.parent / "vendor_agents"
    logs_path = root_dir / "repair_log.csv"

    # Verify that all provided files exist
    for path in [original_output_path, corrected_output_path, invoice_pdf_path]:
        if not Path(path).exists():
            raise FileNotFoundError(f"Input file does not exist: {path}")

    parser_src = vendor_agents_dir / parser_name
    if not parser_src.exists():
        raise FileNotFoundError(
            f"Parser file '{parser_name}' not found in vendor_agents directory"
        )

    # Create the repair_cases directory if it does not exist
    repair_cases_dir.mkdir(parents=True, exist_ok=True)

    # Generate folder name: slugified vendor, date, padded index
    vendor_slug = _slugify(vendor_name)
    current_date = datetime.date.today().isoformat()  # YYYY‑MM‑DD
    index = _next_case_index(repair_cases_dir, vendor_slug, current_date)
    folder_name = f"{vendor_slug}_{current_date}_{index:03d}"
    case_dir = repair_cases_dir / folder_name

    # Create the case directory
    case_dir.mkdir(parents=False, exist_ok=False)

    # Copy files into the case directory
    # Use descriptive destination names regardless of source filename
    shutil.copy2(original_output_path, case_dir / "original_output.json")
    shutil.copy2(corrected_output_path, case_dir / "corrected_output.json")
    shutil.copy2(invoice_pdf_path, case_dir / "invoice.pdf")
    shutil.copy2(parser_src, case_dir / parser_src.name)

    # Append to repair log CSV
    timestamp = datetime.datetime.now().isoformat(timespec="seconds")
    log_fields = [
        invoice_number,
        vendor_name,
        timestamp,
        parser_name,
        folder_name,
    ]
    # If the log file does not exist, write a header first
    write_header = not logs_path.exists()
    with open(logs_path, "a", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        if write_header:
            writer.writerow([
                "invoice_number",
                "vendor_name",
                "timestamp",
                "parser_name",
                "case_folder",
            ])
        writer.writerow(log_fields)

    return case_dir


if __name__ == "__main__":  # pragma: no cover
    import argparse

    parser = argparse.ArgumentParser(
        description=(
            "Capture a repair event by copying the original and corrected JSON, "
            "PDF and parser file into a structured case directory and logging it."
        )
    )
    parser.add_argument("invoice_number", help="Invoice identifier (e.g. 12345)")
    parser.add_argument("vendor_name", help="Vendor name (e.g. Henry Dental Lab)")
    parser.add_argument("parser_name", help="Parser filename (e.g. henry_parser.py)")
    parser.add_argument("original_output_path", help="Path to original_output.json")
    parser.add_argument("corrected_output_path", help="Path to corrected_output.json")
    parser.add_argument("invoice_pdf_path", help="Path to invoice PDF")
    args = parser.parse_args()

    case_path = capture_repair_event(
        invoice_number=args.invoice_number,
        vendor_name=args.vendor_name,
        parser_name=args.parser_name,
        original_output_path=args.original_output_path,
        corrected_output_path=args.corrected_output_path,
        invoice_pdf_path=args.invoice_pdf_path,
    )
    print(f"Created repair case at {case_path}")
