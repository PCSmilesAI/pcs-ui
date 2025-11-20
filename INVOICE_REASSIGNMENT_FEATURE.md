# Invoice Reassignment Feature

## Overview

The Invoice Reassignment feature allows users to send invoices to other accounts (office managers, AP managers, or admins) when an invoice has been routed to the wrong place. This feature integrates seamlessly with the existing "For Me" tab and maintains a single source of truth for invoice ownership.

## Architecture

### Data Model

**New Database Field:**
- `current_assigned_user_email` (TEXT) - Tracks which user currently owns/is assigned to each invoice
- Indexed for performance: `idx_invoices_assigned_user`

### Key Components

#### 1. **Reassignment Service** (`lib/invoices/reassignmentService.ts`)

Provides utility functions for the reassignment workflow:

- `getReassignmentTargets()` - Returns all valid reassignment targets:
  - All office locations (mapped to their office managers)
  - AP Manager (from `ap_authorizers`)
  - All Admin users (from `admins`)

- `canReassignInvoice(userEmail, invoiceId)` - Validates user has permission to reassign:
  - Admins and AP managers can always reassign
  - Current assignee can reassign their own invoices
  - Office managers can reassign invoices for their offices

- `isValidReassignmentTarget(targetEmail)` - Validates target is in the system

- `reassignInvoice(invoiceId, targetEmail, fromUserEmail)` - Performs the reassignment:
  - Updates `current_assigned_user_email` in database
  - Logs action to `invoice_events` table
  - Returns updated invoice

#### 2. **Backend API** (`app/api/invoices/[id]/reassign/route.ts`)

**GET** - Returns available reassignment targets
```
GET /api/invoices/{id}/reassign
Response: { ok: true, targets: [...] }
```

**POST** - Reassigns invoice to target user
```
POST /api/invoices/{id}/reassign
Body: { targetEmail: "user@example.com" }
Response: { ok: true, invoice: {...}, message: "..." }
```

#### 3. **Frontend UI** (`src/ui-pages/InvoiceDetailPage.jsx`)

**New State:**
- `reassignmentTargets` - List of available targets
- `selectedReassignmentTarget` - Currently selected target
- `reassigningInvoice` - Loading state during reassignment

**New UI Component:**
- "Send to:" dropdown showing all available targets
- "Send" button (appears only when target is selected)
- Success/error toasts for user feedback

#### 4. **Updated Queries** (`app/api/invoices/visible/route.ts`)

The "For Me" tab now filters invoices by:
1. **For Office Managers:** Invoices assigned to them OR in their office with `awaiting_office_approval` status
2. **For Admins/AP:** Invoices assigned to them OR with no assignment

This maintains backward compatibility while supporting the new reassignment feature.

## User Workflow

### Sending an Invoice

1. User opens an invoice in the detail view
2. Sees "Send to:" dropdown with available targets
3. Selects a destination (office, AP manager, or admin)
4. Clicks "Send" button
5. Invoice is reassigned and removed from sender's "For Me" tab
6. Invoice appears in recipient's "For Me" tab
7. Success toast confirms the action

### Reassignment Targets

**Office Locations:**
- Each office location is a valid target
- Invoice is assigned to that office's manager
- Example: "Milwaukie (Office Manager)"

**AP Manager:**
- Single AP manager from `ap_authorizers` config
- Example: "AP Manager"

**Admins:**
- All admin users from `admins` config
- Example: "Admin (business@pcsmilesai.com)"

## Authorization

### Who Can Reassign?

- **Admins** - Can reassign any invoice
- **AP Managers** - Can reassign any invoice
- **Office Managers** - Can reassign invoices for their offices
- **Current Assignee** - Can reassign their own invoices

### Who Can Receive?

Any user in the system:
- Office managers (for their offices)
- AP manager
- Admin users

## Audit Trail

All reassignments are logged to the `invoice_events` table:

```json
{
  "invoice_id": "...",
  "action": "reassigned",
  "actor_email": "sender@example.com",
  "payload_json": {
    "from_user": "sender@example.com",
    "to_user": "recipient@example.com",
    "timestamp": "2025-11-20T10:30:00Z"
  },
  "created_at": "2025-11-20T10:30:00Z"
}
```

## Configuration

The reassignment feature uses the existing roles configuration:

**File:** `pcs_ui_data/roles.json`

```json
{
  "admins": ["admin1@example.com", "admin2@example.com"],
  "ap_authorizers": ["ap@example.com"],
  "office_managers": {
    "Milwaukie": ["om1@example.com"],
    "Portland": ["om2@example.com"]
  }
}
```

## Testing

### Test Suite

Run the comprehensive test suite:
```bash
node scripts/test-reassignment-feature.js
```

Tests cover:
- Getting reassignment targets
- Reassigning invoices
- Authorization checks
- Invalid target rejection

### Manual Testing

1. **Create a test invoice** in the "For Me" tab
2. **Open the invoice detail** page
3. **Select a target** from the "Send to:" dropdown
4. **Click Send** and verify:
   - Success toast appears
   - Invoice disappears from sender's "For Me" tab
   - Invoice appears in recipient's "For Me" tab
5. **Check audit trail** in database:
   ```sql
   SELECT * FROM invoice_events 
   WHERE action = 'reassigned' 
   ORDER BY created_at DESC LIMIT 1;
   ```

## Database Migrations

The feature automatically adds the `current_assigned_user_email` field on first run:

```sql
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS current_assigned_user_email TEXT;
CREATE INDEX IF NOT EXISTS idx_invoices_assigned_user ON invoices(current_assigned_user_email);
```

## Backward Compatibility

- Existing invoices without `current_assigned_user_email` are treated as unassigned
- Role-based filtering still works for unassigned invoices
- Reassignment is optional - invoices can remain unassigned
- All existing workflows continue to function

## Performance Considerations

- `current_assigned_user_email` is indexed for fast lookups
- Email comparison is case-insensitive (normalized to lowercase)
- Reassignment is atomic - either succeeds completely or fails completely
- Audit logging is asynchronous and non-blocking

## Future Enhancements

- Bulk reassignment (reassign multiple invoices at once)
- Reassignment history/timeline view
- Reassignment notifications/alerts
- Reassignment rules/automation
- Reassignment approval workflow

