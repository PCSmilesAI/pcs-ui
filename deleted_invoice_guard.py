"""
Helpers for protecting the inbox/queue pipeline against invoices that have been
soft-deleted in the workflow store. Provides utilities to load deleted invoice
signatures and to test new candidates so we avoid re-ingesting them.
"""

from __future__ import annotations

import hashlib
import json
import os
from typing import Dict, Iterable, Optional, Set, Tuple

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("PCS_DATA_DIR", os.path.join(ROOT_DIR, "pcs_ui_data"))
if not os.path.isabs(DATA_DIR):
    DATA_DIR = os.path.abspath(DATA_DIR)
os.makedirs(DATA_DIR, exist_ok=True)

EMAIL_INVOICES_DIR = os.path.join(DATA_DIR, "email_invoices")
os.makedirs(EMAIL_INVOICES_DIR, exist_ok=True)
QUEUE_PATHS = [
    os.path.join(DATA_DIR, "invoice_queue.json"),
]

_SIGNATURE_CACHE: Dict[str, object] = {"stamp": None, "data": None}


def _normalise_vendor(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def _normalise_invoice_number(value: Optional[str]) -> str:
    return (str(value).strip() if value is not None else "")


def _extract_tail_hash(path: Optional[str]) -> Optional[str]:
    """
    Attempt to extract the trailing hash fragment that our ingestion pipeline
    appends to filenames (e.g. ..._aeff4158.pdf -> aeff4158).
    """
    if not path:
        return None
    filename = os.path.basename(path)
    if not filename:
        return None
    parts = filename.split("_")
    if not parts:
        return None
    candidate = parts[-1]
    if "." in candidate:
        candidate = candidate.split(".")[0]
    candidate = candidate.strip().lower()
    if len(candidate) >= 6 and all(c in "0123456789abcdef" for c in candidate):
        return candidate
    return None


def _resolve_pdf_path(raw_path: Optional[str]) -> Optional[str]:
    if not raw_path:
        return None
    path = raw_path
    if path.startswith("http://") or path.startswith("https://"):
        return None
    if os.path.isabs(path):
        candidate = path
    else:
        candidate = os.path.join(DATA_DIR, path.lstrip("/"))
    if not os.path.exists(candidate):
        alt = os.path.join(EMAIL_INVOICES_DIR, os.path.basename(path))
        if os.path.exists(alt):
            candidate = alt
        else:
            candidate = os.path.join(ROOT_DIR, path.lstrip("/"))
            if not os.path.exists(candidate):
                return None
    return candidate


def compute_content_hash(data: bytes) -> Optional[str]:
    if not data:
        return None
    return hashlib.md5(data).hexdigest()


def compute_file_hash(path: Optional[str]) -> Optional[str]:
    resolved = _resolve_pdf_path(path)
    if not resolved:
        return None
    try:
        with open(resolved, "rb") as handle:
            return hashlib.md5(handle.read()).hexdigest()
    except OSError:
        return None


def _is_deleted(invoice: Dict[str, object]) -> bool:
    if not isinstance(invoice, dict):
        return False
    if invoice.get("deleted") is True:
        return True
    if isinstance(invoice.get("deleted_meta"), dict):
        return True
    if invoice.get("workflow_deleted_at"):
        return True
    return False


def _load_invoices_from_path(path: str) -> Iterable[Dict[str, object]]:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        return []
    if isinstance(data, dict) and isinstance(data.get("invoices"), list):
        return data["invoices"]
    if isinstance(data, list):
        return data
    return []


def load_deleted_signatures(force: bool = False) -> Dict[str, Set]:
    existing_paths = [p for p in QUEUE_PATHS if os.path.exists(p)]
    stamp = tuple(sorted(os.path.getmtime(p) for p in existing_paths)) if existing_paths else ()

    if not force and _SIGNATURE_CACHE["data"] and _SIGNATURE_CACHE["stamp"] == stamp:
        return _SIGNATURE_CACHE["data"]  # type: ignore[return-value]

    invoice_numbers: Set[str] = set()
    vendor_pairs: Set[Tuple[str, str]] = set()
    hashes: Set[str] = set()

    for path in existing_paths:
        for invoice in _load_invoices_from_path(path):
            if not _is_deleted(invoice):
                continue
            invoice_number = _normalise_invoice_number(
                invoice.get("invoice_number") or invoice.get("invoice")
            )
            vendor = _normalise_vendor(invoice.get("vendor_name") or invoice.get("vendor"))
            if invoice_number:
                invoice_numbers.add(invoice_number)
                if vendor:
                    vendor_pairs.add((vendor, invoice_number))

            stored_hash = (
                (invoice.get("file_hash") or invoice.get("content_hash") or invoice.get("pdf_hash"))
                or invoice.get("hash")
            )
            if isinstance(stored_hash, str) and stored_hash:
                hashes.add(stored_hash.lower())

            tail_hash = _extract_tail_hash(invoice.get("pdf_path") or invoice.get("source_file"))
            if tail_hash:
                hashes.add(tail_hash)

            file_hash = compute_file_hash(invoice.get("pdf_path"))
            if file_hash:
                hashes.add(file_hash.lower())

    signatures = {
        "invoice_numbers": invoice_numbers,
        "vendor_invoice_pairs": vendor_pairs,
        "hashes": hashes,
    }
    _SIGNATURE_CACHE["stamp"] = stamp
    _SIGNATURE_CACHE["data"] = signatures
    return signatures


def should_skip_deleted_invoice(
    vendor: Optional[str] = None,
    invoice_number: Optional[str] = None,
    pdf_path: Optional[str] = None,
    file_hash: Optional[str] = None,
    source_file: Optional[str] = None,
) -> Tuple[bool, Optional[str]]:
    signatures = load_deleted_signatures()

    number_norm = _normalise_invoice_number(invoice_number)
    vendor_norm = _normalise_vendor(vendor)

    if number_norm and vendor_norm and (vendor_norm, number_norm) in signatures["vendor_invoice_pairs"]:
        return True, "vendor+invoice"

    if number_norm and number_norm in signatures["invoice_numbers"]:
        return True, "invoice"

    candidate_hashes: Set[str] = set()
    if file_hash:
        candidate_hashes.add(file_hash.lower())

    for candidate in (pdf_path, source_file):
        tail = _extract_tail_hash(candidate)
        if tail:
            candidate_hashes.add(tail)

    if pdf_path and not file_hash:
        computed = compute_file_hash(pdf_path)
        if computed:
            candidate_hashes.add(computed.lower())

    for token in candidate_hashes:
        if token in signatures["hashes"]:
            return True, "hash"

    return False, None
