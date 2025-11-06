# Database-Driven Invoice System - Implementation Summary

## What Was Implemented

This implementation establishes SQLite as the authoritative source of truth for all invoice data, replacing the JSON-based workflow store for core operations.

## Files Created

### Core Database Layer
- **lib/db/client.ts** - Database connection and schema initialization
  - Uses better-sqlite3 for synchronous, high-performance access
  - Enables WAL mode for concurrency
  - Creates invoices, invoice_events, and tombstones tables

- **lib/db/migrate-from-json.ts** - Data migration from JSON to SQLite
  - One-time migration on first startup
  - Deduplicates invoices
  - Preserves all existing data

### Write API Layer
- **lib/invoices/write.ts** - Core business logic for invoice modifications
  - `applyCorrections()` - User edits (sets corrected_* fields)
  - `applyParserUpdate()` - Parser updates (sets parsed_* fields, respects locks)
  - `rematerialize()` - Computes effective fields from corrected/parsed
  - All operations are transactional and audited

- **lib/invoices/db-store.ts** - Database query helpers
  - `getInvoiceById()` - Fetch invoice with all fields
  - `saveInvoice()` - Persist invoice changes
  - `softDeleteInvoice()` - Mark invoice as rejected
  - `getVisibleInvoices()` - Query by status

### API Endpoints
- **app/api/db/init/route.ts** - Database initialization
  - Runs on first request
  - Creates schema and migrates data
  - Idempotent (safe to call multiple times)

- **app/api/invoices/[id]/edit/route.ts** - User edits
  - POST endpoint for UI to save changes
  - Validates field types
  - Calls applyCorrections() with audit logging

- **app/api/invoices/export/route.ts** - Export all invoices as JSON
  - Admin-only endpoint
  - Returns all fields including parsed_, corrected_, effective
  - For backup and manual editing

- **app/api/invoices/import/route.ts** - Import/patch invoices from JSON
  - Admin-only endpoint
  - Accepts array of corrections and field locks
  - Validates and audits all changes

- **app/api/invoices/transition-db/route.ts** - Database-backed workflow transitions
  - New version of transition endpoint using database
  - Reads from and writes to SQLite
  - Maintains backward compatibility with existing workflow logic

## Data Model

### Three-Layer Value System
Each invoice field (vendor_name, office_id, amount_cents) has three representations:

1. **parsed_*** - From parser/ingester (never edited directly by user)
2. **corrected_*** - From user corrections (overrides parsed)
3. **effective** - Materialized value (corrected OR parsed)

### Field Locks
Prevent parser from overwriting user corrections:
```json
{ "vendor_name": true, "office_id": false }
```

### Audit Trail
Every change logged in invoice_events:
- CORRECTED - User edited field
- PARSED_UPDATE - Parser updated field
- FIELD_LOCKED - Field was locked
- REJECTED - Invoice was deleted

## Migration Path

### Phase 1: Database Initialization (Automatic)
1. First request to any endpoint triggers `/api/db/init`
2. Schema migrations create tables
3. Data migration loads invoices from workflow_invoices.json
4. Each invoice gets parsed_* = original values, corrected_* = NULL

### Phase 2: Gradual Adoption
- UI continues using existing endpoints initially
- New endpoints available for opt-in usage
- Both JSON and database can coexist during transition

### Phase 3: Full Migration
- Update email ingester to use applyParserUpdate()
- Update UI to use new edit endpoint
- Update workflow transitions to use database
- Make invoice_queue.json read-only

## Key Features

✅ **Durability** - All changes persist in SQLite
✅ **Editability** - Users can correct parser mistakes
✅ **Integrity** - Parser updates never clobber corrections
✅ **Auditability** - All changes logged with actor/timestamp
✅ **Concurrency** - WAL mode enables multiple readers
✅ **Transactions** - All writes are atomic
✅ **Field Locks** - Prevent accidental overwrites
✅ **Backward Compatible** - JSON still available for export/import

## Next Steps

1. **Test Database Initialization**
   - Call GET /api/db/init
   - Verify tables created
   - Verify data migrated

2. **Update Email Ingester**
   - Modify Python scripts to call applyParserUpdate()
   - Or create TypeScript endpoint for ingestion

3. **Update UI Pages**
   - Modify invoice detail page to use /api/invoices/[id]/edit
   - Modify list pages to fetch from database

4. **Update Workflow Transitions**
   - Switch from /api/invoices/transition to /api/invoices/transition-db
   - Or update existing endpoint to use database

5. **Make JSON Read-Only**
   - chmod 444 /var/www/pcs-ui-data/invoice_queue.json
   - Document export/import workflow

## Configuration

No configuration needed - database path is automatically resolved via:
```typescript
resolveDataPath('pcs.db')  // → /var/www/pcs-ui-data/pcs.db
```

## Troubleshooting

**Database locked error**
- WAL mode handles concurrent access
- If still locked, check for long-running transactions

**Migration failed**
- Check /var/www/pcs-ui-data/workflow_invoices.json exists
- Verify file permissions
- Check logs for specific errors

**Data not appearing**
- Verify GET /api/db/init was called
- Check invoice_events table for audit trail
- Verify deleted flag is 0

