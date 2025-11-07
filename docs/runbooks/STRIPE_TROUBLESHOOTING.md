# Stripe Integration Troubleshooting Runbook

## Quick Health Check

```bash
# Check Stripe configuration
curl -s https://pcsmilesai.com/api/health | jq '.externalServices'

# Check Stripe webhook status
curl -s https://pcsmilesai.com/api/stripe/status | jq
```

---

## Common Issues

### 1. Webhook Signature Verification Failed

**Symptoms**: Logs show `[STRIPE][WEBHOOK] Signature verification failed`

**Diagnosis**:
```bash
# Check webhook secret is set
ssh root@159.65.181.148 "grep PCS_STRIPE_WEBHOOK_SECRET /etc/environment"

# Check if it matches Stripe dashboard
# Go to: https://dashboard.stripe.com/webhooks
```

**Fix**:
1. Get correct webhook secret from Stripe dashboard
2. Update on server: `echo "PCS_STRIPE_WEBHOOK_SECRET=whsec_..." >> /etc/environment`
3. Restart: `pm2 restart pcs-ui --update-env`

---

### 2. Duplicate Webhook Events

**Symptoms**: Same invoice marked paid multiple times

**Diagnosis**:
```bash
# Check event log
sqlite3 /var/www/pcs-ui-data/pcs.db "SELECT * FROM stripe_events ORDER BY created_at DESC LIMIT 10;"
```

**Fix**: This is expected behavior - idempotency guard prevents duplicate processing. Check logs for `[STRIPE][WEBHOOK] duplicate ignored`.

---

### 3. Payment Not Reconciling to Invoice

**Symptoms**: Stripe shows transfer succeeded, but invoice not marked paid

**Diagnosis**:
```bash
# Check invoice metadata
sqlite3 /var/www/pcs-ui-data/pcs.db "SELECT id, status, stripe_payment_id FROM invoices WHERE id='...';"

# Check webhook logs
pm2 logs pcs-ui --lines 100 | grep "reconcileInvoicePayment"
```

**Fix**:
1. Ensure invoice has `stripe_payment_id` in metadata
2. Manually trigger reconciliation:
   ```bash
   curl -X POST https://pcsmilesai.com/api/invoices/reconcile \
     -H "Content-Type: application/json" \
     -d '{"invoiceId":"...", "stripePaymentId":"..."}'
   ```

---

### 4. Webhook Not Received

**Symptoms**: Transfer succeeded in Stripe, but no webhook event

**Diagnosis**:
```bash
# Check if webhook endpoint is reachable
curl -I https://pcsmilesai.com/api/stripe/webhook

# Check Stripe webhook delivery logs
# Go to: https://dashboard.stripe.com/webhooks -> click endpoint -> Logs
```

**Fix**:
1. Verify endpoint URL in Stripe dashboard matches `https://pcsmilesai.com/api/stripe/webhook`
2. Check firewall/WAF isn't blocking Stripe IPs
3. Resend webhook from Stripe dashboard

---

## Stripe Secret Rotation

**When**: After any suspected compromise or quarterly rotation

**Steps**:
1. Generate new API key in Stripe dashboard
2. Update server: `echo "STRIPE_SECRET_KEY=sk_live_..." >> /etc/environment`
3. Generate new webhook secret
4. Update server: `echo "PCS_STRIPE_WEBHOOK_SECRET=whsec_..." >> /etc/environment`
5. Restart: `pm2 restart pcs-ui --update-env`
6. Verify: `curl -s https://pcsmilesai.com/api/health | jq`

---

## Testing Stripe Webhooks

```bash
# Trigger test event from Stripe dashboard
# Go to: https://dashboard.stripe.com/webhooks -> click endpoint -> Send test event

# Or use Stripe CLI locally
stripe listen --forward-to localhost:3000/api/stripe/webhook
stripe trigger charge.succeeded
```

---

## Escalation

If issue persists:
1. Check Stripe status page: https://status.stripe.com
2. Contact Stripe support with webhook event ID
3. Review full logs: `pm2 logs pcs-ui --lines 1000 | grep STRIPE`

