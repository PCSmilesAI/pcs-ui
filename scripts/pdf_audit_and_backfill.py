#!/usr/bin/env python3
"""
Audit and backfill invoice PDF paths.

Usage:
  python3 scripts/pdf_audit_and_backfill.py            # dry-run summary only
  python3 scripts/pdf_audit_and_backfill.py --apply-renames --write-db

What it does:
- Summarises invoices in pcs.db with/without pdf_path
- Proposes safe filenames for PDFs that contain spaces/#/unsafe chars
- Optionally renames PDFs on disk to the sanitized name
- Attempts to backfill missing pdf_path values in pcs.db using heuristics
"""

import argparse
import os
import sqlite3
from collections import Counter, defaultdict
from typing import Dict, Iterable, List, Optional, Tuple

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.environ.get("PCS_DATA_DIR", os.path.join(ROOT, "pcs_ui_data"))
if not os.path.isabs(DATA_DIR):
    DATA_DIR = os.path.abspath(DATA_DIR)

EMAIL_DIR = os.path.join(DATA_DIR, "email_invoices")
DB_PATH = os.path.join(DATA_DIR, "pcs.db")

try:
    from filename_utils import sanitize_filename, api_pdf_path
except ImportError:  # pragma: no cover - defensive
    raise SystemExit("filename_utils.py not found at project root")


def load_invoices() -> List[Dict]:
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"Database not found: {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, invoice_number, source_file, pdf_path, vendor_name, invoice_date FROM invoices WHERE deleted = 0"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def list_pdfs() -> List[str]:
    if not os.path.exists(EMAIL_DIR):
        return []
    return [f for f in os.listdir(EMAIL_DIR) if f.lower().endswith(".pdf")]


def propose_renames(pdf_files: Iterable[str]) -> Dict[str, str]:
    proposals: Dict[str, str] = {}
    for name in pdf_files:
        safe = sanitize_filename(name)
        if safe != name:
            proposals[name] = safe
    return proposals


def rename_pdfs(proposals: Dict[str, str]) -> Dict[str, str]:
    applied: Dict[str, str] = {}
    for old, new in proposals.items():
        old_path = os.path.join(EMAIL_DIR, old)
        new_path = os.path.join(EMAIL_DIR, new)
        if not os.path.exists(old_path):
            continue
        if os.path.exists(new_path) and old_path != new_path:
            continue  # avoid clobbering
        os.rename(old_path, new_path)
        applied[old] = new
    return applied


def find_pdf_for_invoice(invoice: Dict, available: List[str]) -> Optional[str]:
    candidates = []
    if invoice.get("pdf_path"):
        candidates.append(os.path.basename(invoice["pdf_path"]))
    if invoice.get("source_file"):
        candidates.append(invoice["source_file"])
    if invoice.get("invoice_number"):
        candidates.append(str(invoice["invoice_number"]))

    for candidate in candidates:
        sanitized = sanitize_filename(candidate)
        if sanitized in available:
            return sanitized
    return None


def backfill_db(missing: List[Dict], available: List[str], apply: bool = False) -> int:
    if not apply:
        return sum(1 for inv in missing if find_pdf_for_invoice(inv, available))

    conn = sqlite3.connect(DB_PATH)
    updated = 0
    for inv in missing:
        match = find_pdf_for_invoice(inv, available)
        if not match:
            continue
        conn.execute(
            "UPDATE invoices SET pdf_path = ? WHERE id = ?",
            (api_pdf_path(match), inv["id"]),
        )
        updated += 1
    conn.commit()
    conn.close()
    return updated


def main():
    parser = argparse.ArgumentParser(description="Audit and backfill PDF paths in pcs.db")
    parser.add_argument("--apply-renames", action="store_true", help="Rename PDFs on disk to sanitized names")
    parser.add_argument("--write-db", action="store_true", help="Persist backfilled pdf_path values into pcs.db")
    args = parser.parse_args()

    invoices = load_invoices()
    pdf_files = list_pdfs()

    total = len(invoices)
    with_pdf = sum(1 for inv in invoices if inv.get("pdf_path"))
    missing = [inv for inv in invoices if not inv.get("pdf_path")]

    proposals = propose_renames(pdf_files)
    rename_results: Dict[str, str] = {}
    if args.apply_renames and proposals:
        rename_results = rename_pdfs(proposals)
        # Refresh available list after renames
        pdf_files = list_pdfs()

    backfilled = backfill_db(missing, pdf_files, apply=args.write_db)

    print("=== PDF Audit ===")
    print(f"Total invoices:      {total}")
    print(f"With pdf_path:       {with_pdf}")
    print(f"Missing pdf_path:    {len(missing)}")
    print(f"Backfillable now:    {backfilled}")
    print(f"Pdfs with renames:   {len(proposals)}")
    if rename_results:
        print("Applied renames:")
        for old, new in rename_results.items():
            print(f"  {old} -> {new}")
    elif proposals:
        print("Renames proposed (dry-run):")
        for old, new in proposals.items():
            print(f"  {old} -> {new}")

    if args.write_db:
        print(f"Updated {backfilled} invoices with sanitized /api/pdf paths")
    else:
        print("DB not modified (use --write-db to persist)")


if __name__ == "__main__":
    main()
