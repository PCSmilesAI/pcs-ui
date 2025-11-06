# Invoice Database Architecture

## Overview

The system now uses SQLite as the authoritative source of truth for all invoice data. This ensures:
- **Durability**: All changes persist across restarts
- **Editability**: Users can correct parser mistakes via the UI
- **Integrity**: Parser updates never clobber user corrections
- **Auditability**: All changes are logged with actor and timestamp

## Database Schema

### invoices table
Core invoice data with three layers of values:

```sql
-- Parsed fields (from parser/ingester)
parsed_vendor_name TEXT
parsed_office_id TEXT
parsed_amount_cents INTEGER

-- Corrected fields (from user edits)
corrected_vendor_name TEXT
corrected_office_id TEXT
corrected_amount_cents INTEGER

-- Effective fields (materialized: corrected OR parsed)
vendor_name TEXT
office_id TEXT
amount_cents INTEGER

-- Field locks (JSON: { "vendor_name": true, ... })
field_locks TEXT

-- Workflow
status TEXT
approvals TEXT (JSON)
deleted INTEGER
workflow_deleted_at TEXT
status_version INTEGER
```

### invoice_events table
Append-only audit trail:
- `action`: CORRECTED, PARSED_UPDATE, FIELD_LOCKED, etc.
- `actor_email`: Who made the change
- `payload_json`: What changed

### tombstones table
Prevents re-ingestion of deleted invoices by source_message_id

## Data Flow

### 1. User Edits (UI → Database)
```
User edits invoice in UI
  ↓
POST /api/invoices/[id]/edit
  ↓
applyCorrections(id, userEmail, patch)
  ├─ Check field_locks
  ├─ Set corrected_* fields
  ├─ Call rematerialize()
  └─ Audit event
  ↓
Effective fields updated (vendor_name = COALESCE(corrected_*, parsed_*))
```

### 2. Parser Updates (Ingester → Database)
```
Email ingester finds new invoice
  ↓
POST /api/invoices/ingest/email
  ↓
applyParserUpdate(id, parserPayload)
  ├─ Respect field_locks (skip locked fields)
  ├─ Set parsed_* fields only
  ├─ Call rematerialize()
  └─ Audit event
  ↓
Effective fields updated (respecting user corrections)
```

### 3. Workflow Transitions (Approval → Database)
```
User approves invoice
  ↓
POST /api/invoices/transition
  ├─ Read from database
  ├─ Apply workflow logic
  ├─ Update status + approvals
  └─ Save to database
  ↓
Pages refetch and display updated status
```

## API Endpoints

### Core Endpoints

**POST /api/invoices/[id]/edit**
- User edits invoice fields
- Body: `{ vendor_name?, office_id?, amount_cents?, overrideLocks? }`
- Returns: Updated invoice

**GET /api/db/init**
- Initialize database on first startup
- Runs schema migrations
- Migrates data from JSON workflow store
- Idempotent (safe to call multiple times)

### Admin Endpoints

**GET /api/invoices/export**
- Export all invoices as JSON
- Includes parsed_, corrected_, and effective values
- Admin only

**POST /api/invoices/import**
- Import/patch invoices from JSON
- Body: `{ items: [{ id, corrected?, lock? }] }`
- Admin only

## Migration from JSON

On first startup:
1. `GET /api/db/init` is called
2. Schema migrations create tables
3. Data migration loads invoices from `workflow_invoices.json`
4. Each invoice is inserted with:
   - `parsed_*` fields = original JSON values
   - `effective` fields = same as parsed (no corrections yet)
   - `corrected_*` fields = NULL

## Field Locks

Prevent parser from overwriting user corrections:

```typescript
// Lock vendor_name field
field_locks = { "vendor_name": true }

// Parser tries to update vendor_name
applyParserUpdate(id, { parsed_vendor_name: "new" })
// → Skipped because vendor_name is locked

// User can override locks
POST /api/invoices/[id]/edit
{ vendor_name: "override", overrideLocks: true }
```

## Audit Trail

Every change is logged:
```sql
INSERT INTO invoice_events (invoice_id, action, actor_email, payload_json)
VALUES (id, 'CORRECTED', 'user@example.com', '{"vendor_name":"new"}')
```

Actions:
- `CORRECTED`: User edited field
- `PARSED_UPDATE`: Parser updated field
- `FIELD_LOCKED`: Field was locked
- `TRANSITION_*`: Workflow state change

## JSON File Management

The old `invoice_queue.json` is now read-only:
```bash
sudo chmod 444 /var/www/pcs-ui-data/invoice_queue.json
```

To edit invoices via JSON:
1. `GET /api/invoices/export` → download JSON
2. Edit the JSON file
3. `POST /api/invoices/import` → upload changes

All changes go through validation and audit logging.

## Concurrency & Durability

- All writes use database transactions
- WAL mode enabled for better concurrency
- Foreign keys enforced
- Optimistic locking via `status_version`

## Next Steps

1. Update email ingester to use `applyParserUpdate()`
2. Update workflow transition to read/write database
3. Update UI pages to fetch from database
4. Test end-to-end workflow

