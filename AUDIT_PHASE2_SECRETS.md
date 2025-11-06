# Phase 2: Configuration, Secrets & Environments - Audit Results

## 2.1 Secrets Audit

### ⚠️ CRITICAL ISSUES FOUND

#### Hardcoded Secrets in Code
1. **`ecosystem.config.js`** - Contains hardcoded secrets:
   - `QBO_CLIENT_ID`: AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE
   - `QBO_CLIENT_SECRET`: SjQLypVE8KnRDsFWwmYJa8qFGH3jxqoMlk6bSF74
   - `API_KEYS`: Hardcoded list
   - `SESSION_SECRET`: Hardcoded
   - `ENCRYPTION_KEY`: Hardcoded
   - **ACTION REQUIRED**: Remove hardcoded secrets, use environment variables only

2. **`start-production.sh`** - Contains hardcoded secrets:
   - All secrets exported as environment variables
   - **ACTION REQUIRED**: Remove hardcoded values, source from secure vault

3. **`production-secrets.txt`** - Contains secrets:
   - **STATUS**: ⚠️ Should be in `.gitignore` (verify)
   - **ACTION REQUIRED**: Ensure not committed to repo

### ✅ Good Practices Found
- Secrets accessed via `process.env.*` in code (correct pattern)
- Kubernetes deployment uses `secretKeyRef` (correct)
- No secrets in committed `.env` files (good)

### Recommendations

1. **Immediate Actions**:
   - Remove all hardcoded secrets from `ecosystem.config.js`
   - Remove hardcoded secrets from `start-production.sh`
   - Verify `.gitignore` includes `*.env`, `*.secret`, `production-secrets.txt`
   - Rotate all exposed secrets immediately

2. **Secret Management Strategy**:
   - Use environment variables only (no hardcoding)
   - Use secret management service (AWS Secrets Manager, HashiCorp Vault, etc.)
   - For PM2: Use `--update-env` and source from secure file
   - Document secret rotation procedure

3. **Secret Rotation Plan**:
   - **Stripe Keys**: Rotate quarterly or on compromise
   - **QuickBooks OAuth**: Rotate on app key regeneration
   - **Session Secrets**: Rotate monthly
   - **API Keys**: Rotate quarterly
   - **Database Passwords**: Rotate quarterly

## 2.2 API Key Scopes & Permissions

### Stripe API Keys
- **Current**: Using `STRIPE_SECRET_KEY` from environment
- **Scopes**: Full API access (read/write)
- **Recommendation**: ✅ Correct - Stripe doesn't have granular scopes
- **Action**: Verify keys are production keys, not test keys

### QuickBooks OAuth
- **Current Scope**: `com.intuit.quickbooks.accounting`
- **Status**: ✅ Minimal scope (correct)
- **Action**: Verify scope is sufficient for all operations

### Email API Keys
- **SendGrid**: `SENDGRID_API_KEY` - Full API access
- **Mailjet**: `MAILJET_API_KEY` + `MAILJET_API_SECRET` - Full API access
- **Recommendation**: ✅ Correct - Email APIs don't have granular scopes
- **Action**: Verify keys have minimal required permissions

## 2.3 Feature Flags Review

### Current Implementation
- **Status**: ✅ Feature flags system implemented in Phase 0
- **Location**: `lib/featureFlags.ts`
- **API**: `/api/admin/feature-flags`
- **Default Values**: Safe (destructive ops disabled by default)

### Feature Flags Available
- `qboSyncEnabled`: Default `true`
- `qboBillCreationEnabled`: Default `true`
- `stripeWebhooksEnabled`: Default `true`
- `emailIngestionEnabled`: Default `true`
- `invoiceAutoApprovalEnabled`: Default `false` ✅ (safe)

### Recommendations
- ✅ Defaults are safe
- ✅ Emergency kill switch implemented
- ✅ Admin-only access enforced
- **Action**: Document feature flags in operator docs

## Environment Parity

### Development vs Production
- **Issue**: `ecosystem.config.js` has both `env` and `env_production`
- **Status**: ✅ Separate configs (good)
- **Action**: Verify all required env vars are set in production

### Missing Environment Variables
Check that production has:
- [ ] `STRIPE_SECRET_KEY`
- [ ] `PCS_STRIPE_WEBHOOK_SECRET`
- [ ] `QBO_CLIENT_ID`
- [ ] `QBO_CLIENT_SECRET`
- [ ] `QBO_REDIRECT_URI`
- [ ] `QBO_ENVIRONMENT`
- [ ] `SENDGRID_API_KEY` (if using SendGrid)
- [ ] `MAILJET_API_KEY` (if using Mailjet)
- [ ] `MAILJET_API_SECRET` (if using Mailjet)

## Action Items

1. **CRITICAL**: Remove hardcoded secrets from `ecosystem.config.js`
2. **CRITICAL**: Remove hardcoded secrets from `start-production.sh`
3. **HIGH**: Rotate all exposed secrets
4. **MEDIUM**: Document secret rotation procedure
5. **MEDIUM**: Verify `.gitignore` excludes secret files
6. **LOW**: Create secret management documentation

