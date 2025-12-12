"""
Capture and organise repair events for PCS-AI's invoice parser system.

This module exposes a single function, ``capture_repair_event``, which
creates a structured folder containing the original and corrected JSON
outputs, the associated invoice PDF, and a copy of the parser file that
generated the original output. Each repair is saved into its own
timestamped directory under ``repair_cases/``. In addition, every
capture is appended to a CSV log for auditing and reporting.

Usage (the UI or a higher layer should call this function):

```
from repair_loop.capture_repair_event import capture_repair_event

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


# Parser file mappings - maps vendor names to parser files
VENDOR_PARSER_MAP = {
    'henry': 'henry_parser.py',
    'henry schein': 'henry_parser.py',
    'patterson': 'patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py',
    'patterson dental': 'patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py',
    'epic': 'epic_parser.py',
    'epic dental': 'epic_parser.py',
    'exodus': 'exodus_parser.py',
    'artisan': 'parse_artisan_dental_exporting_fixed.py',
    'artisan dental': 'parse_artisan_dental_exporting_fixed.py',
    'tc': 'parse_tc_dental_invoice.py',
    'tc dental': 'parse_tc_dental_invoice.py',
    'darby': 'darby_parser.py',
    'darby dental': 'darby_parser.py',
    'dandy': 'dandy_parser.py',
    'dandy dental': 'dandy_parser.py',
    'brasseler': 'brasseler_parser.py',
    'ctr services': 'ctr_services_parser.py',
    'ctr_services': 'ctr_services_parser.py',
    'a1 professional': 'a1_professional_parser.py',
    'a-1 professional': 'a1_professional_parser.py',
    'a1_professional': 'a1_professional_parser.py',
    'comcast': 'comcast_parser.py',
    'bridgeford': 'bridgeford_parser.py',
    'general': 'general_invoice_parser.py',
    'unknown': 'general_invoice_parser.py',
}


def _slugify(text: str) -> str:
    """Convert arbitrary vendor names into filesystem-friendly slugs.

    Lowercases the string, replaces any sequence of non-alphanumeric
    characters with a single underscore, and strips leading/trailing
    underscores.

    Args:
        text: The raw vendor name.

    Returns:
        A slug suitable for folder names.
    """
    slug = re.sub(r"[^A-Za-z0-9]+", "_", text.lower())
    return slug.strip("_")


def _next_case_index(base_dir: Path, slug: str, date_str: str) -> int:
    """Compute the next available index for a repair case.

    Examines existing folders under ``base_dir`` that start with
    ``f"{slug}_{date_str}_"`` and returns the next integer index.
    Indices are padded to three digits when used in folder names.

    Args:
        base_dir: The directory containing repair case folders.
        slug:     The vendor slug.
        date_str: The date portion of the folder name (YYYY-MM-DD).

    Returns:
        The next integer index (starting at 1).
    """
    if not base_dir.exists():
        return 1
        
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


def _resolve_parser_name(vendor_name: str, parser_name: str) -> str:
    """Resolve parser name from vendor name if needed."""
    # If parser_name looks like a valid filename, use it
    if parser_name and parser_name.endswith('.py'):
        return parser_name
    
    # Otherwise, look up from vendor name
    vendor_lower = vendor_name.lower().strip()
    
    # Check exact match first
    if vendor_lower in VENDOR_PARSER_MAP:
        return VENDOR_PARSER_MAP[vendor_lower]
    
    # Check partial matches
    for key, value in VENDOR_PARSER_MAP.items():
        if key in vendor_lower or vendor_lower in key:
            return value
    
    # Fallback to general parser
    return 'general_invoice_parser.py'


def _find_parser_file(parser_name: str, root_dir: Path) -> Path:
    """Find the parser file in various locations.
    
    Searches in:
    1. Project root (root_dir.parent)
    2. vendor_agents directory (legacy location)
    3. lib directory
    """
    project_root = root_dir.parent
    
    # Search locations in priority order
    search_paths = [
        project_root / parser_name,                    # Project root
        project_root / "parsers" / parser_name,        # parsers subdirectory
        root_dir.parent / "vendor_agents" / parser_name,  # Legacy location
        project_root / "lib" / parser_name,            # lib directory
    ]
    
    for path in search_paths:
        if path.exists():
            return path
    
    return None


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
        vendor_name:          Human-friendly vendor name (used to derive slug).
        parser_name:          Filename of the parser used to generate the original output.
        original_output_path: Path to the JSON with the original parser output.
        corrected_output_path:Path to the JSON with user-corrected output.
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
        root_dir = Path(__file__).resolve().parent

    repair_cases_dir = root_dir / "repair_cases"
    logs_path = root_dir / "repair_log.csv"

    # Verify that all provided files exist
    for path in [original_output_path, corrected_output_path]:
        if not Path(path).exists():
            raise FileNotFoundError(f"Input file does not exist: {path}")

    # PDF might be missing for some edge cases, log warning but don't fail
    pdf_exists = Path(invoice_pdf_path).exists() if invoice_pdf_path else False
    if not pdf_exists:
        print(f"⚠️ Warning: PDF file not found: {invoice_pdf_path}")

    # Resolve and find parser file
    resolved_parser = _resolve_parser_name(vendor_name, parser_name)
    parser_src = _find_parser_file(resolved_parser, root_dir)
    
    parser_found = parser_src is not None and parser_src.exists()
    if not parser_found:
        print(f"⚠️ Warning: Parser file '{resolved_parser}' not found")

    # Create the repair_cases directory if it does not exist
    repair_cases_dir.mkdir(parents=True, exist_ok=True)

    # Generate folder name: slugified vendor, date, padded index
    vendor_slug = _slugify(vendor_name)
    current_date = datetime.date.today().isoformat()
    index = _next_case_index(repair_cases_dir, vendor_slug, current_date)
    folder_name = f"{vendor_slug}_{current_date}_{index:03d}"
    case_dir = repair_cases_dir / folder_name

    # Create the case directory
    case_dir.mkdir(parents=False, exist_ok=False)

    # Copy files into the case directory
    shutil.copy2(original_output_path, case_dir / "original_output.json")
    shutil.copy2(corrected_output_path, case_dir / "corrected_output.json")
    
    if pdf_exists:
        shutil.copy2(invoice_pdf_path, case_dir / "invoice.pdf")
    
    if parser_found:
        shutil.copy2(parser_src, case_dir / parser_src.name)

    # Create a metadata file with repair context
    metadata = {
        "invoice_number": invoice_number,
        "vendor_name": vendor_name,
        "parser_name": resolved_parser,
        "parser_found": parser_found,
        "pdf_found": pdf_exists,
        "timestamp": datetime.datetime.now().isoformat(),
        "files_included": {
            "original_output": "original_output.json",
            "corrected_output": "corrected_output.json",
            "invoice_pdf": "invoice.pdf" if pdf_exists else None,
            "parser_file": parser_src.name if parser_found else None,
        }
    }
    
    import json
    with open(case_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    # Append to repair log CSV
    timestamp = datetime.datetime.now().isoformat(timespec="seconds")
    log_fields = [
        invoice_number,
        vendor_name,
        timestamp,
        resolved_parser,
        folder_name,
    ]
    
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

    print(f"✅ Created repair case: {folder_name}")
    return case_dir


if __name__ == "__main__":
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
