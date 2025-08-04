"""
Bundle and archive all outstanding repair case folders.

This script scans the ``repair_cases`` directory for any subfolders,
packages them into a single ZIP archive, logs the bundling event, and
moves each case folder into ``archived_repairs``. The resulting ZIP
file is named using the current date: ``weekly_repairs_YYYY-MM-DD.zip``.

Running this script regularly (for example, once per week via a
cron job) ensures that repair cases are delivered in batches for
parser updates while keeping the working directory tidy.
"""

import csv
import datetime
import os
import shutil
import zipfile
from pathlib import Path


def bundle_repairs(*, root_dir: Path | None = None) -> Path | None:
    """Bundle all repair case directories into a single ZIP and archive them.

    Args:
        root_dir: Optional override for the root of the repair loop
                  (defaults to the directory containing this script).

    Returns:
        The path to the created ZIP archive, or ``None`` if no cases were found.
    """
    if root_dir is None:
        root_dir = Path(__file__).resolve().parent

    repair_cases_dir = root_dir / "repair_cases"
    archived_dir = root_dir / "archived_repairs"
    logs_path = root_dir / "bundle_log.csv"

    # Ensure directories exist
    repair_cases_dir.mkdir(parents=True, exist_ok=True)
    archived_dir.mkdir(parents=True, exist_ok=True)

    # Gather all case directories (ignoring files)
    case_dirs = [d for d in repair_cases_dir.iterdir() if d.is_dir()]
    if not case_dirs:
        print("No repair cases to bundle.")
        return None

    # Determine zip file name. Use today's date.
    today_str = datetime.date.today().isoformat()
    zip_base_name = f"weekly_repairs_{today_str}.zip"
    zip_path = root_dir / zip_base_name
    # If a file with this name already exists, append an index suffix
    counter = 1
    while zip_path.exists():
        zip_base_name = f"weekly_repairs_{today_str}_{counter}.zip"
        zip_path = root_dir / zip_base_name
        counter += 1

    # Create the ZIP archive
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for case_dir in case_dirs:
            # Walk through each repair case directory and add files
            for file_path in case_dir.rglob("*"):
                if file_path.is_file():
                    # The archive name includes the case directory name
                    arcname = case_dir.name + "/" + file_path.relative_to(case_dir).as_posix()
                    zipf.write(file_path, arcname=arcname)

    # Log the bundling event: date, zip filename, number of cases
    log_fields = [datetime.datetime.now().isoformat(timespec="seconds"), zip_path.name, len(case_dirs)]
    write_header = not logs_path.exists()
    with open(logs_path, "a", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        if write_header:
            writer.writerow(["timestamp", "zip_filename", "cases_bundled"])
        writer.writerow(log_fields)

    # Move each case directory to archived_repairs
    for case_dir in case_dirs:
        destination = archived_dir / case_dir.name
        # If a folder with same name already exists in archive, remove it first
        if destination.exists():
            shutil.rmtree(destination)
        shutil.move(str(case_dir), str(destination))

    print(f"Bundled {len(case_dirs)} repair cases into {zip_path}")
    return zip_path


if __name__ == "__main__":  # pragma: no cover
    path = bundle_repairs()
    if path is not None:
        print(f"Created ZIP: {path}")
