#!/usr/bin/env python3
"""
json_diff_bot.py
-----------------

This script performs a field‑level diff between two JSON files representing
structured invoice data. It recursively walks both the original and corrected
JSON objects, comparing values at every key and index. For each value that
differs, it records a dictionary containing:

    - field: the dot/bracket notation path to the differing field
    - before: the original value as a string (or ``None`` if the field
      is missing from the original)
    - after: the corrected value as a string (or ``None`` if the field
      is missing from the corrected)

The script treats all primitive values as strings when comparing, so "2" and
"2.00" are considered different even though they might represent the same
numeric value. Unchanged fields are omitted from the output. Both input
files are assumed to be well‑formed JSON and to have similar structures.

Usage::

    python json_diff_bot.py original_output.json corrected_output.json

It will print the diff result as formatted JSON to stdout.
"""

import json
import sys
from typing import Any, Dict, List, Optional


def diff_json(
    original: Any, corrected: Any, path: str = ""
) -> List[Dict[str, Optional[str]]]:
    """Recursively compute differences between two JSON structures.

    Args:
        original: The original JSON data structure.
        corrected: The corrected JSON data structure.
        path: Dot/bracket notation indicating the current location within the
            JSON structure (used for building field paths).

    Returns:
        A list of dictionaries, each describing a change with keys
        ``field``, ``before``, and ``after``.
    """
    differences: List[Dict[str, Optional[str]]] = []

    # If both are dicts, iterate over the union of keys
    if isinstance(original, dict) and isinstance(corrected, dict):
        # Use a set union to capture keys present in either dict.  This will
        # detect new or removed keys as well.
        for key in sorted(set(original.keys()) | set(corrected.keys())):
            new_path = f"{path}.{key}" if path else key
            in_original = key in original
            in_corrected = key in corrected

            if not in_original:
                # Key only exists in corrected
                differences.append(
                    {
                        "field": new_path,
                        "before": None,
                        "after": str(corrected[key]) if corrected[key] is not None else None,
                    }
                )
            elif not in_corrected:
                # Key only exists in original
                differences.append(
                    {
                        "field": new_path,
                        "before": str(original[key]) if original[key] is not None else None,
                        "after": None,
                    }
                )
            else:
                # Recurse into shared keys
                differences.extend(diff_json(original[key], corrected[key], new_path))

    # If both are lists, compare by index
    elif isinstance(original, list) and isinstance(corrected, list):
        max_len = max(len(original), len(corrected))
        for index in range(max_len):
            new_path = f"{path}[{index}]"
            # Determine existence of each element
            in_original = index < len(original)
            in_corrected = index < len(corrected)

            if not in_original:
                # Element only exists in corrected
                value = corrected[index]
                differences.append(
                    {
                        "field": new_path,
                        "before": None,
                        "after": str(value) if value is not None else None,
                    }
                )
            elif not in_corrected:
                # Element only exists in original
                value = original[index]
                differences.append(
                    {
                        "field": new_path,
                        "before": str(value) if value is not None else None,
                        "after": None,
                    }
                )
            else:
                # Both have an element at this index; recurse
                differences.extend(diff_json(original[index], corrected[index], new_path))

    else:
        # At this point, original and corrected are not both dicts or lists.
        # Compare their primitive/string forms.
        before = str(original) if original is not None else None
        after = str(corrected) if corrected is not None else None

        # Record a difference only if the string representations differ.
        if before != after:
            differences.append({"field": path, "before": before, "after": after})

    return differences


def main() -> None:
    """Entry point of the script. Loads JSON files, computes diffs, and prints them."""
    if len(sys.argv) != 3:
        print(
            "Usage: python json_diff_bot.py <original_json_path> <corrected_json_path>",
            file=sys.stderr,
        )
        sys.exit(1)

    original_path = sys.argv[1]
    corrected_path = sys.argv[2]

    # Load both JSON files
    try:
        with open(original_path, "r", encoding="utf-8") as f_orig:
            original_data = json.load(f_orig)
    except Exception as exc:
        print(f"Failed to load original JSON file '{original_path}': {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        with open(corrected_path, "r", encoding="utf-8") as f_corr:
            corrected_data = json.load(f_corr)
    except Exception as exc:
        print(f"Failed to load corrected JSON file '{corrected_path}': {exc}", file=sys.stderr)
        sys.exit(1)

    # Compute differences
    diffs = diff_json(original_data, corrected_data)

    # Print results as formatted JSON
    json.dump(diffs, sys.stdout, indent=2)


if __name__ == "__main__":
    main()
