# PCS AI Infrastructure Snapshot
## Pre-Launch Audit Baseline - Generated: 2025-01-XX

## Application Version
- **Application**: PCS AI Invoice Processing System
- **Version**: 0.0.0
- **Framework**: Next.js 14.2.4 with App Router
- **Node.js**: >=18.0.0
- **Python**: (check with `python3 --version`)

## Environment Configuration

### PM2 Configuration (`ecosystem.config.js`)
- **App Name**: `pcs-ai-quickbooks`
- **Script**: `dev-server.js`
- **Instances**: 1 (cluster mode)
- **Environment**: Production
- **Data Directory**: `/var/www/pcs-ui-data` (production)

### Environment Variables (from ecosystem.config.js)

#### QuickBooks OAuth (Sandbox/Development)
- `QBO_CLIENT_ID`: AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE
- `QBO_CLIENT_SECRET`: SjQLypVE8KnRDsFWwmYJa8qFGH3jxqoMlk6bSF74
- `QBO_REDIRECT_URI`: https://pcsmilesai.com/api/qbo/callback
- `QBO_SCOPES`: com.intuit.quickbooks.accounting
- `QBO_ENVIRONMENT`: sandbox
- `QBO_STATE_SECRET`: your-secret-key-for-state-signing-min-32-chars-long

#### Security Settings
- `API_KEYS`: (comma-separated list)
- `SESSION_SECRET`: (32+ char secret)
- `ENCRYPTION_KEY`: (32 char key)
- `WEBHOOK_VERIFICATION_TOKEN`: (webhook token)
- `WEBHOOK_SIGNATURE_KEY`: (webhook signature key)

#### Database Settings
- `DB_HOST`: localhost
- `DB_PORT`: 5432
- `DB_NAME`: pcs_ai_quickbooks
- `DB_USER`: pcs_ai_user
- `DB_PASSWORD`: (secure password)

#### Server Configuration
- `NODE_ENV`: production
- `PORT`: 3001
- `HOST`: 0.0.0.0
- `LOG_LEVEL`: info
- `ENABLE_METRICS`: true
- `METRICS_PORT`: 9090

## Database Schema

### Main Database (`pcs.db`)

#### Table: `invoices`
- **Primary Key**: `id` (TEXT)
- **Unique Constraints**: 
  - `invoice_number` (UNIQUE NOT NULL)
  - `source_message_id` (UNIQUE)
- **Fields**:
  - Parsed fields: `parsed_vendor_name`, `parsed_office_id`, `parsed_amount_cents`
  - Corrected fields: `corrected_vendor_name`, `corrected_office_id`, `corrected_amount_cents`
  - Effective fields: `vendor_name`, `office_id`, `amount_cents`
  - Workflow: `status`, `approvals` (JSON), `field_locks` (JSON)
  - Metadata: `deleted`, `workflow_deleted_at`, `status_version`, `created_at`, `updated_at`
- **Indexes**:
  - `idx_invoices_status` on `status`
  - `idx_invoices_vendor_name` on `vendor_name`
  - `idx_invoices_office_id` on `office_id`
  - `idx_invoices_deleted` on `deleted`

#### Table: `invoice_events`
- **Primary Key**: `id` (INTEGER AUTOINCREMENT)
- **Foreign Key**: `invoice_id` → `invoices(id)`
- **Fields**: `invoice_id`, `action`, `actor_email`, `actor_name`, `payload_json`, `created_at`
- **Indexes**:
  - `idx_invoice_events_invoice_id` on `invoice_id`
  - `idx_invoice_events_created_at` on `created_at`

#### Table: `tombstones`
- **Primary Key**: `source_message_id` (TEXT)
- **Fields**: `source_message_id`, `deleted_at`
- **Purpose**: Prevent re-ingestion of deleted invoices

### QuickBooks Token Database (`qbo_tokens.db`)

#### Table: `qbo_tokens`
- **Primary Key**: `id` (INTEGER AUTOINCREMENT)
- **Unique Constraint**: `realm_id` (UNIQUE NOT NULL)
- **Fields**: `realm_id`, `access_token`, `refresh_token`, `expires_at`, `expires_in`, `created_at`, `updated_at`, `obtained_at`

#### Table: `company_info`
- **Primary Key**: `realm_id` (TEXT)
- **Fields**: `realm_id`, `company_name`, `email`, `created_at`

#### Table: `oauth_state`
- **Purpose**: OAuth state management for CSRF protection
- **Fields**: (see `lib/qbo/stateStore.ts`)

## Python Dependencies (`requirements.txt`)
- `fastapi>=0.112`
- `uvicorn[standard]>=0.29`
- `requests>=2.32`
- `python-dotenv>=1.0`
- `pydantic>=2.7`

## Node.js Dependencies (Key Packages)

### Production Dependencies
- `next`: ^14.2.4
- `react`: ^18.2.0
- `react-dom`: ^18.2.0
- `better-sqlite3`: ^12.2.0
- `stripe`: ^16.12.0
- `intuit-oauth`: ^4.2.0
- `express`: ^4.21.2
- `helmet`: ^7.1.0
- `express-rate-limit`: ^7.1.5
- `bcryptjs`: ^3.0.2

### Development Dependencies
- `typescript`: 5.9.2
- `eslint`: ^8.55.0
- `@types/node`: 24.3.1
- `@types/react`: ^18.2.43
- `pm2`: ^6.0.8

## Service Architecture

### Next.js Application
- **Entry Point**: `app/` directory (App Router)
- **API Routes**: `app/api/`
- **Components**: `src/components/`
- **UI Pages**: `src/ui-pages/`
- **Library Code**: `lib/`

### Background Services (Python)
- **Email Ingestion**: `email_ingestion_agent.py`
- **Vendor Router**: `vendor_router.py`
- **Invoice Queue Writer**: `invoice_queue_writer.py`
- **UI Upload Service**: `ui_upload_service.py`
- **Orchestrator**: `flowstack_orchestrator.py`

### PM2 Processes
- **Main App**: `pcs-ai-quickbooks` (dev-server.js)
- **Process Management**: PM2 cluster mode, 1 instance

## File System Structure

### Data Directories
- **Production Data**: `/var/www/pcs-ui-data`
- **Development Data**: `./pcs_ui_data`
- **Email Invoices**: `email_invoices/`
- **Output JSONs**: `output_jsons/`
- **Processed Invoices**: `processed_invoices/`

### Database Files
- **Main DB**: `{data_dir}/pcs.db`
- **QBO Tokens**: `{data_dir}/qbo_tokens.db` or `pcs_ai_data/qbo_tokens.db`

## External Integrations

### QuickBooks Online
- **OAuth Endpoint**: https://appcenter.intuit.com/connect/oauth2
- **Token Endpoint**: https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
- **API Base**: https://sandbox-quickbooks.api.intuit.com (sandbox)
- **Scopes**: `com.intuit.quickbooks.accounting`

### Stripe
- **API Version**: Latest (via stripe SDK)
- **Webhook Endpoint**: `/api/stripe/webhook`
- **Idempotency**: Implemented via `lib/stripe/eventLog.ts`

### Email
- **Inbox**: `invoices@pcsmilesai.com`
- **Vendors Supported**: Epic, Patterson, Henry, Exodus, Artisan, TC Dental

## Deployment

### Production Server
- **Host**: DigitalOcean Droplet
- **Domain**: pcsmilesai.com
- **Reverse Proxy**: Nginx
- **Process Manager**: PM2
- **Node Version**: 18.x

### Build Process
- **Pre-build**: `bash ./scripts/prebuild-metadata.sh`
- **Build**: `next build`
- **Start**: `next start` or `pm2 start ecosystem.config.js`

## Security Configuration

### Headers (via Helmet.js)
- Content Security Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security (HSTS)
- X-XSS-Protection

### Rate Limiting
- **Limit**: 100 requests per 15 minutes per IP
- **Implementation**: express-rate-limit

### API Authentication
- **Method**: API Key via `x-api-key` or `Authorization: Bearer`
- **Multiple Keys**: Supported

## Monitoring & Health Checks

### Health Endpoint
- **Path**: `/health` or `/api/health`
- **Response**: Status, uptime, memory, version, environment

### Metrics Endpoint
- **Path**: `/metrics` or `/api/metrics`
- **Response**: Performance metrics, system stats

## Feature Flags (New)
- **Location**: `lib/featureFlags.ts`
- **API**: `/api/admin/feature-flags`
- **Flags**: QBO sync, Stripe webhooks, email ingestion, etc.
- **Default**: All enabled except `invoiceAutoApprovalEnabled` (safe defaults)

## Migration Status
- **Database Migrations**: Auto-run on first access (`lib/db/client.ts`)
- **Migration System**: Inline migrations in `runMigrations()`
- **Version Tracking**: `status_version` field in invoices table

## Backup Strategy
- **Frequency**: Daily (via `npm run backup`)
- **Location**: (to be documented)
- **Retention**: 30 days (target)

## Notes
- This snapshot represents the state before the comprehensive audit
- All environment variables should be rotated after audit completion
- Database schema may be enhanced during audit (Phase 3)
- Feature flags system added in Phase 0

