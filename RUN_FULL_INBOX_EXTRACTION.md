# Run Full Inbox Extraction - Step by Step

## 🎯 GOAL
Extract all 300+ invoices from the email inbox that were previously missed because the system only processed UNSEEN emails.

## ⚠️ IMPORTANT
This is a ONE-TIME operation. After this completes, the system will automatically process only new emails going forward.

---

## 📋 STEP-BY-STEP INSTRUCTIONS

### Step 1: SSH into the Server

```bash
ssh root@159.65.181.148
```

### Step 2: Navigate to the Project Directory

```bash
cd /var/www/pcs-ui
```

### Step 3: Run the Email Ingestion Agent

```bash
python3 email_ingestion_agent.py
```

### Step 4: Monitor Progress (in another terminal)

While the extraction is running, open another terminal and monitor the logs:

```bash
ssh root@159.65.181.148
tail -f /var/www/pcs-ui/log.txt
```

You should see output like:

```
📥 Checking inbox...
📧 Found 500+ total emails in inbox
📧 Processing email 1/500: Invoice from Epic
✅ Saved: email_invoices/epic_invoice_12345.pdf
📦 Parsed and routed invoice: epic
⏩ Skipped PDF (already processed by content hash): duplicate.pdf
...
✅ Processed 250+ new invoices, skipped 50 duplicates
```

### Step 5: Wait for Completion

The extraction will take 10-30 minutes depending on:
- Number of emails in inbox
- Size of PDF files
- Vendor parser performance

You'll see a final message like:
```
✅ Email processing completed successfully
```

### Step 6: Verify Results

After extraction completes:

1. **Check Invoice Count:**
   ```bash
   sqlite3 /var/www/pcs-ui-data/pcs.db "SELECT COUNT(*) FROM invoices WHERE deleted = 0;"
   ```
   Should show 300+ instead of 77

2. **Check PDF Count:**
   ```bash
   ls -la /var/www/pcs-ui/email_invoices/ | wc -l
   ```
   Should show 300+ PDF files

3. **Refresh Browser:**
   - Go to http://159.65.181.148
   - Refresh the page
   - Dashboard should show 300+ invoices
   - Amounts should display correctly
   - PDFs should appear on detail pages

---

## 🔍 TROUBLESHOOTING

### If the script hangs or crashes:

1. **Check logs:**
   ```bash
   tail -100 /var/www/pcs-ui/log.txt
   ```

2. **Check email connection:**
   ```bash
   python3 -c "
   import imaplib
   mail = imaplib.IMAP4_SSL('imap.secureserver.net')
   mail.login('invoices@pcsmilesai.com', 'Inv!PCSAI')
   status, messages = mail.search(None, 'ALL')
   print(f'Found {len(messages[0].split())} emails')
   mail.close()
   "
   ```

3. **Check disk space:**
   ```bash
   df -h /var/www/pcs-ui
   ```

4. **Restart the script:**
   ```bash
   python3 email_ingestion_agent.py
   ```

---

## 📊 EXPECTED RESULTS

### Before Extraction:
- 77 invoices in dashboard
- All showing $0.00 amount
- No PDFs on detail pages

### After Extraction:
- 300+ invoices in dashboard
- Correct amounts displayed
- PDFs visible on detail pages
- Better parsing quality

---

## ✅ COMPLETION CHECKLIST

- [ ] SSH into server
- [ ] Navigate to /var/www/pcs-ui
- [ ] Run `python3 email_ingestion_agent.py`
- [ ] Monitor logs with `tail -f log.txt`
- [ ] Wait for completion (10-30 minutes)
- [ ] Verify invoice count increased to 300+
- [ ] Verify PDFs are extracted
- [ ] Refresh browser and check dashboard
- [ ] Click on an invoice and verify amount and PDF

---

## 🎉 SUCCESS INDICATORS

✅ Invoice count: 77 → 300+
✅ Invoice amounts: $0.00 → Correct values
✅ PDFs: Missing → Present on detail pages
✅ Parsing: Limited → Full vendor coverage

---

## 📞 SUPPORT

If you encounter any issues:

1. Check the log file: `/var/www/pcs-ui/log.txt`
2. Verify email credentials are correct
3. Check disk space on server
4. Ensure vendor parsers are working
5. Check database integrity

The system is designed to be resilient - if it crashes, just run the script again and it will resume from where it left off (thanks to the PDF deduplication by content hash).

