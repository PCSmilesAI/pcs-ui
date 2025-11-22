# One-Time Full Inbox Scanner

## Purpose
This script scans **ALL emails** (both read and unread) in the `invoices@pcsmilesai.com` inbox and extracts invoices that are missing from your dashboard.

## What It Does
1. ✅ Connects to the email inbox
2. ✅ Scans ALL emails (read and unread)
3. ✅ Checks for duplicates using:
   - Message ID (most reliable)
   - Invoice number from subject
   - Tombstones (deleted invoices)
4. ✅ Extracts PDF attachments from new emails
5. ✅ Processes PDFs through vendor router
6. ✅ Skips duplicates to avoid creating duplicate invoices

## How to Run

### Option 1: Run directly
```bash
cd /Users/BraxtonEllsworth/Desktop/pcs-ui
python3 one_time_full_inbox_scan.py
```

### Option 2: Run on server
```bash
ssh root@159.65.181.148
cd /var/www/pcs-ui
python3 one_time_full_inbox_scan.py
```

## What to Expect

The script will:
- Show a 5-second countdown before starting
- Display progress for each email processed
- Show statistics at the end:
  - Total emails scanned
  - Duplicates skipped
  - New invoices processed
  - PDFs extracted and processed

## Expected Results

If you currently have **84 invoices** and expect **300-400**, you should see:
- ~**216-316 new invoices** processed
- Duplicates properly skipped
- Dashboard updated with all missing invoices

## Notes

- The script is **safe to run multiple times** - it will skip duplicates
- It processes PDFs in parallel (5 at a time) for speed
- All extracted PDFs are saved to `email_invoices/` directory
- The vendor router processes PDFs and creates JSON files
- The invoice queue writer picks up JSON files and adds them to the database

## Troubleshooting

If invoices don't appear in dashboard:
1. Check that `invoice_queue_writer.py` is running
2. Check logs in `pcs_ui_data/queue_writer.log`
3. Verify JSON files are being created in `pcs_ui_data/output_jsons/`
4. Check database: `sqlite3 pcs_ui_data/pcs.db "SELECT COUNT(*) FROM invoices WHERE deleted = 0"`

