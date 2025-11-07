# Email Ingestion Performance Audit

## Critical Performance Issues

### 1. **SEQUENTIAL PDF PROCESSING (MAJOR BOTTLENECK)**
**Location:** `email_ingestion_agent_enhanced.py:342-378`
**Issue:** Each email is processed sequentially:
- Fetch email from IMAP
- Check if already processed
- Check for PDFs
- Save PDF to disk
- **Run vendor_router subprocess (60s timeout per PDF)**
- Mark as read

**Impact:** With 300+ emails and ~200 PDFs, this is 200 × 60s = 3+ hours minimum!

**Solution:** Implement parallel processing with thread pool or queue system.

---

### 2. **INEFFICIENT DUPLICATE CHECKING**
**Location:** `email_ingestion_agent_enhanced.py:185-223`
**Issue:** For each email, loops through ALL existing invoices:
```python
for invoice in existing_invoices:  # O(n) for each email
    if subject_invoice_num and invoice.get('invoice_number') == subject_invoice_num:
```

**Impact:** O(n²) complexity - 300 emails × 220 invoices = 66,000 comparisons

**Solution:** Use hash sets/dicts for O(1) lookups instead of linear search.

---

### 3. **REDUNDANT TOMBSTONE CHECKS**
**Location:** `email_ingestion_agent_enhanced.py:191-202`
**Issue:** Database query for EVERY email to check tombstones:
```python
if source_message_id and os.path.exists(DB_PATH):
    conn = sqlite3.connect(DB_PATH)  # New connection per email!
    cursor.execute("SELECT 1 FROM tombstones WHERE source_message_id = ?")
```

**Impact:** 300 database connections for 300 emails

**Solution:** Load tombstones once at startup, use in-memory set.

---

### 4. **EXCESSIVE LOGGING I/O**
**Location:** `email_ingestion_agent_enhanced.py:75-80`
**Issue:** Every log call opens file, writes, closes:
```python
def log(msg):
    with open(LOG_PATH, "a") as f:  # File I/O on every log!
        f.write(f"[{timestamp}] {msg}\n")
```

**Impact:** 300+ file opens/closes for a single scan

**Solution:** Use buffered logging or batch writes.

---

### 5. **INEFFICIENT DEDUPLICATION**
**Location:** `deduplicate_invoices.py:13-127`
**Issue:** Runs AFTER every scan, even if no new invoices:
- Loads entire JSON queue
- Creates backup
- Processes all invoices
- Writes back to disk

**Impact:** Unnecessary I/O after every scan

**Solution:** Only run deduplication when new invoices are added.

---

### 6. **REPEATED VENDOR DETECTION**
**Location:** `email_ingestion_agent_enhanced.py:230-247` and `vendor_router.py`
**Issue:** Vendor detection happens twice:
1. In `detect_vendor_from_email()` (email subject/sender)
2. In `vendor_router.py` (PDF content analysis)

**Impact:** Redundant processing

**Solution:** Use email-detected vendor as hint to skip PDF analysis.

---

### 7. **SYNCHRONOUS SUBPROCESS CALLS**
**Location:** `email_ingestion_agent_enhanced.py:249-270`
**Issue:** Each PDF parsing is a blocking subprocess call:
```python
result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
```

**Impact:** Blocks entire script while waiting for parser

**Solution:** Use async subprocess or thread pool.

---

### 8. **FULL INBOX SCAN EVERY TIME**
**Location:** `email_ingestion_agent_enhanced.py:329`
**Issue:** Scans ALL 300+ emails every 60 seconds:
```python
status, messages = mail.uid('search', None, 'ALL')
```

**Impact:** Unnecessary IMAP traffic and processing

**Solution:** Only fetch emails since last scan (use IMAP SINCE).

---

## Recommended Optimizations (Priority Order)

### Priority 1: Parallel PDF Processing
- Use `concurrent.futures.ThreadPoolExecutor` (5-10 workers)
- Process multiple PDFs simultaneously
- **Expected speedup: 5-10x**

### Priority 2: Efficient Duplicate Checking
- Load invoices into dict/set at startup
- Use O(1) lookups instead of O(n)
- **Expected speedup: 2-3x**

### Priority 3: Batch Logging
- Use logging module with buffering
- Or batch writes to file
- **Expected speedup: 1.5-2x**

### Priority 4: Incremental Inbox Scanning
- Use IMAP SINCE to fetch only new emails
- Maintain last_scan_timestamp
- **Expected speedup: 10-50x** (depends on email volume)

### Priority 5: Conditional Deduplication
- Only run if new invoices were added
- **Expected speedup: 1-2x**

### Priority 6: In-Memory Tombstone Cache
- Load tombstones once at startup
- Use set for O(1) lookups
- **Expected speedup: 1.5x**

---

## Estimated Total Speedup
With all optimizations: **50-100x faster**
- Current: 3+ hours for 300 emails
- Optimized: 2-5 minutes for 300 emails

---

## Implementation Plan
1. Add thread pool for parallel PDF processing
2. Convert duplicate checking to dict/set lookups
3. Implement incremental IMAP scanning
4. Add in-memory caching for tombstones
5. Batch logging writes
6. Conditional deduplication

