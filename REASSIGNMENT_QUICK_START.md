# Invoice Reassignment - Quick Start Guide

## For Developers

### Understanding the Feature

The invoice reassignment feature allows users to send invoices to other accounts when they've been routed to the wrong place. It's a simple but powerful workflow:

1. User opens an invoice
2. Selects a destination from "Send to:" dropdown
3. Clicks Send
4. Invoice moves to recipient's "For Me" tab

### Key Files

| File | Purpose |
|------|---------|
| `lib/invoices/reassignmentService.ts` | Core business logic |
| `app/api/invoices/[id]/reassign/route.ts` | Backend API |
| `src/ui-pages/InvoiceDetailPage.jsx` | Frontend UI |
| `app/api/invoices/visible/route.ts` | Updated query logic |

### How to Test

```bash
# Run the test suite
node scripts/test-reassignment-feature.js

# Expected output: All tests pass
```

### Database Schema

```sql
-- New field added to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS current_assigned_user_email TEXT;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_invoices_assigned_user ON invoices(current_assigned_user_email);

-- Audit trail (existing table)
INSERT INTO invoice_events (invoice_id, action, actor_email, payload_json, created_at)
VALUES (?, 'reassigned', ?, ?, CURRENT_TIMESTAMP);
```

### API Endpoints

#### Get Available Targets
```bash
GET /api/invoices/{id}/reassign

Response:
{
  "ok": true,
  "targets": [
    {
      "type": "office",
      "id": "Milwaukie",
      "name": "Milwaukie (Office Manager)",
      "email": "om@example.com"
    },
    {
      "type": "ap",
      "id": "ap",
      "name": "AP Manager",
      "email": "ap@example.com"
    },
    {
      "type": "admin",
      "id": "admin@example.com",
      "name": "Admin (admin@example.com)",
      "email": "admin@example.com"
    }
  ]
}
```

#### Reassign Invoice
```bash
POST /api/invoices/{id}/reassign

Body:
{
  "targetEmail": "om@example.com"
}

Response:
{
  "ok": true,
  "invoice": { ... },
  "message": "Invoice reassigned successfully"
}
```

### Frontend Integration

The UI is already integrated in `InvoiceDetailPage.jsx`:

```jsx
// State
const [reassignmentTargets, setReassignmentTargets] = useState([]);
const [selectedReassignmentTarget, setSelectedReassignmentTarget] = useState(null);
const [reassigningInvoice, setReassigningInvoice] = useState(false);

// Load targets on mount
useEffect(() => {
  const response = await fetch(`/api/invoices/${invoiceId}/reassign`);
  const data = await response.json();
  setReassignmentTargets(data.targets || []);
}, [invoiceId]);

// Handle reassignment
async function handleReassignInvoice() {
  const response = await fetch(`/api/invoices/${invoiceId}/reassign`, {
    method: 'POST',
    body: JSON.stringify({ targetEmail: selectedReassignmentTarget.email }),
  });
  // ... handle response
}
```

### Authorization Rules

```typescript
// Who can reassign?
- Admins: YES (any invoice)
- AP Managers: YES (any invoice)
- Office Managers: YES (their office's invoices)
- Current Assignee: YES (their own invoices)

// Who can receive?
- Any office manager
- AP manager
- Any admin
```

### Audit Trail

All reassignments are logged:

```sql
SELECT * FROM invoice_events 
WHERE action = 'reassigned' 
ORDER BY created_at DESC;

-- Output:
-- invoice_id: "inv-123"
-- action: "reassigned"
-- actor_email: "sender@example.com"
-- payload_json: {
--   "from_user": "sender@example.com",
--   "to_user": "recipient@example.com",
--   "timestamp": "2025-11-20T10:30:00Z"
-- }
```

### Common Tasks

#### Add a New Reassignment Target

1. Update `pcs_ui_data/roles.json`:
```json
{
  "office_managers": {
    "NewOffice": ["newom@example.com"]
  }
}
```

2. Targets are automatically loaded from roles config

#### Debug Reassignment Issues

```bash
# Check if invoice has assignment
SELECT id, invoice_number, current_assigned_user_email 
FROM invoices 
WHERE id = 'inv-123';

# Check reassignment history
SELECT * FROM invoice_events 
WHERE invoice_id = 'inv-123' 
AND action = 'reassigned';

# Check if user can see invoice
SELECT * FROM invoices 
WHERE current_assigned_user_email = 'user@example.com' 
AND deleted = 0;
```

#### Test Authorization

```bash
# Try to reassign as unauthorized user (should fail)
curl -X POST http://localhost:3000/api/invoices/inv-123/reassign \
  -H "Content-Type: application/json" \
  -H "X-User-Email: unauthorized@example.com" \
  -d '{"targetEmail": "om@example.com"}'

# Expected: 403 Forbidden
```

### Performance Tips

- `current_assigned_user_email` is indexed - queries are fast
- Email comparison is case-insensitive (normalized to lowercase)
- Reassignment is atomic - either succeeds completely or fails
- Audit logging is non-blocking

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "Send to:" dropdown is empty | Check roles.json is valid and has targets |
| Reassignment fails with 403 | Check user has permission for this invoice |
| Reassignment fails with 404 | Check invoice ID is correct |
| Invoice doesn't appear in recipient's list | Check `current_assigned_user_email` matches recipient email (case-insensitive) |
| Audit log not showing reassignment | Check `invoice_events` table exists and has data |

### Next Steps

1. **Review** - Read `INVOICE_REASSIGNMENT_FEATURE.md` for full details
2. **Test** - Run `node scripts/test-reassignment-feature.js`
3. **Deploy** - Follow deployment steps in summary document
4. **Monitor** - Watch for issues in production

---

**Questions?** Check the full documentation in `INVOICE_REASSIGNMENT_FEATURE.md`

