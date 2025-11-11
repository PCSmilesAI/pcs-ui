# Invoice Ingestion System - Quick Start Guide

## Overview

The invoice ingestion system now has three key improvements:

1. **Email Retry Logic** - Failed emails are automatically retried
2. **Multi-Invoice Detection** - PDFs with multiple invoices are handled correctly
3. **Reconciliation Monitoring** - Verify all emails have corresponding invoices

## Using the System

### 1. Email Retry Logic (Automatic)

**How it works**:
- Emails are processed and invoices are extracted
- If extraction succeeds, email is marked as read
- If extraction fails, email stays as UNSEEN and is retried on next cycle

**What you need to do**: Nothing! It's automatic.

**Monitoring**:
```bash
# Check email tracking status
cat email_tracking.json | jq '.'

# Look for failed emails
cat email_tracking.json | jq '.[] | select(.status=="failed")'
```

### 2. Multi-Invoice Detection (Automatic)

**How it works**:
- When a PDF is processed, the system checks if it contains multiple invoices
- If multiple invoices are detected, each one gets a separate database record
- All invoices reference the same PDF file

**What you need to do**: Nothing! It's automatic.

**Verification**:
```bash
# Check if multi-invoice PDFs were detected
grep "Detected.*invoices" log.txt

# Query database for invoices from same PDF
sqlite3 /var/www/pcs-ui-data/pcs.db \
  "SELECT pdf_path, COUNT(*) as count FROM invoices GROUP BY pdf_path HAVING count > 1"
```

### 3. Reconciliation Monitoring (Manual)

**How to check system health**:

```bash
# Check reconciliation status
curl https://pcsmilesai.com/api/inbox/reconcile | jq '.'

# Expected response:
{
  "ok": true,
  "report": {
    "timestamp": "2025-11-11T...",
    "totalEmails": 150,
    "totalInvoices": 148,
    "reconciliation": {
      "processed": 145,
      "failed": 3,
      "noAttachments": 2,
      "missing": 2
    },
    "healthScore": 98.67,
    "status": "warning"
  }
}
```

**Interpreting the results**:
- `healthScore` 100% = All emails have invoices ✅
- `healthScore` 95-99% = Minor issues, monitor closely ⚠️
- `healthScore` < 95% = Critical issues, investigate immediately 🚨

**What to do if health score is low**:

1. Check failed emails:
```bash
curl https://pcsmilesai.com/api/inbox/reconcile | jq '.report.details.failed'
```

2. Check missing invoices:
```bash
curl https://pcsmilesai.com/api/inbox/reconcile | jq '.report.details.missing'
```

3. Review logs:
```bash
tail -100 log.txt | grep "❌"
tail -100 queue_writer.log | grep "⚠️"
```

## Troubleshooting

### Problem: Email marked as read but invoice not in database

**Solution**: The email will be retried on the next cycle. Check:
```bash
# Check if email is still in tracking
cat email_tracking.json | jq '.[] | select(.status=="failed")'

# Check logs for error
grep "❌" log.txt | tail -20
```

### Problem: Multi-invoice PDF only shows one invoice

**Solution**: The parser may not support multi-invoice detection. Check:
```bash
# Check if multi-invoice detection ran
grep "Detected.*invoices" log.txt

# If not detected, the PDF may need manual processing
# Contact support with the PDF file
```

### Problem: Health score is low

**Solution**: 
1. Identify missing invoices: `curl https://pcsmilesai.com/api/inbox/reconcile | jq '.report.details.missing'`
2. Check if emails are still in inbox (UNSEEN)
3. Manually trigger retry by marking emails as UNSEEN
4. Check logs for parsing errors

## Key Files

- `email_tracking.json` - Tracks all email processing attempts
- `log.txt` - Email ingestion agent logs
- `queue_writer.log` - Invoice ingestion logs
- `multi_invoice_detector.py` - Multi-invoice detection logic
- `app/api/inbox/reconcile/route.ts` - Reconciliation endpoint

## API Endpoints

### GET /api/inbox/reconcile

Returns reconciliation report with health score and details.

**Response**:
```json
{
  "ok": true,
  "report": {
    "timestamp": "ISO timestamp",
    "totalEmails": number,
    "totalInvoices": number,
    "reconciliation": {
      "processed": number,
      "failed": number,
      "noAttachments": number,
      "missing": number
    },
    "healthScore": 0-100,
    "status": "healthy|warning|critical",
    "details": {
      "processed": [...],
      "failed": [...],
      "missing": [...]
    }
  }
}
```

## Best Practices

1. **Check health score daily**: `curl https://pcsmilesai.com/api/inbox/reconcile | jq '.report.healthScore'`

2. **Monitor logs**: `tail -f log.txt` while processing emails

3. **Verify multi-invoice PDFs**: After sending a multi-invoice PDF, check that all invoices appear in the database

4. **Keep email_tracking.json**: Don't delete this file - it's needed for reconciliation

5. **Review failed emails**: Periodically check for failed emails and investigate root causes

## Support

For issues or questions:
1. Check the logs: `tail -100 log.txt`
2. Run reconciliation: `curl https://pcsmilesai.com/api/inbox/reconcile`
3. Review INVOICE_INGESTION_IMPROVEMENTS.md for technical details

