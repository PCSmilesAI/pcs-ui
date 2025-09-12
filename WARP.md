# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

PCS AI is an internal web application that ingests vendor invoices from email, surfaces them for review/categorization, and pushes approved bills to QuickBooks Online (QBO). The system handles dental practice invoices from vendors like Epic Dental Lab, Henry Schein, Patterson Dental, etc.

**Primary entities**: invoices, vendors, categories, users.

## Development Commands

### Core Development
```bash
# Start Next.js development server (includes API routes)
npm run dev

# Start backend API server with Express (legacy/additional services)
npm run dev:api

# Start production server
npm run start:prod

# Build for production
npm run build

# Run linting
npm run lint
```

### Testing & Development
```bash
# Run single test (no test framework configured yet)
npm run test

# Security audit
npm run security:audit
npm run security:fix

# Health check backend
npm run health

# Get system metrics
npm run metrics

# Backup database
npm run backup
```

### Python AI Invoice Processing
```bash
# Process all existing emails (one-time setup)
python3 process_all_existing_emails_enhanced.py

# Start email monitoring agent
python3 email_ingestion_agent.py

# Start complete flowstack (all Python services)
python3 flowstack_orchestrator.py

# Process specific invoice types
python3 epic_parser.py <pdf_path>
python3 henry_parser.py <pdf_path>
python3 patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py <pdf_path>
```

## Architecture Overview

### Frontend Architecture (Next.js 14.x)
- **App Router**: Uses Next.js 14+ app directory structure
- **Client Components**: Pages are client-only (`'use client'`, `dynamic = 'force-dynamic'`, `revalidate = 0`) to avoid SSR/prerender issues
- **Pages Structure**: Client pages in `app/*/page.tsx` render UI components from `src/ui-pages/*`
- **Context Providers**: 
  - `AuthContext`: User authentication state
  - `InvoiceClickContext`: Invoice selection and navigation shared across pages
- **Key Components**:
  - `AppLayout`: Main layout wrapper with navigation and auth
  - `NavBar`: Primary navigation with page routing
  - `InvoiceTable`: Data table with filtering and sorting
  - `FilterPanel`: Advanced filtering UI
  - `RequireAuth`: Authentication wrapper for protected routes

### API Layer (Next.js Route Handlers)
- **Primary API**: Next.js Route Handlers under `app/api/**`
- **Invoice Queue**: `app/api/invoice-queue/route.ts` serves consolidated queue with filtering/pagination
- **QBO Endpoints**: OAuth, categories, create bill, attach PDF, status
- **Auth Endpoints**: Gist-backed user store used during early development
- **Database**: SQLite for QBO OAuth tokens, file-based JSON for invoice data
- **Legacy Express**: `dev-server.js` provides additional services but main API is Next.js

### Background/Ingestion Pipeline (Python)
- **Email Ingestion**: `email_ingestion_agent.py`, `email_ingestion_agent_enhanced.py` - Monitor IMAP, save PDFs, parse to JSON
- **JSON Output**: Saves parsed data to `output_jsons/*.json` with vendor detection
- **Consolidation**: `consolidate_invoices.py` merges `output_jsons/*.json` → `pcs_ai_data/invoice_queue.json`
- **Single Source**: UI consumes the consolidated `invoice_queue.json` array via API
- **Vendor Parsers**: Specialized parsers for Epic, Patterson, Henry Schein, etc.
- **Orchestration**: `flowstack_orchestrator.py` - Manages all services

## Key File Locations

### Configuration
- `next.config.js` - Next.js configuration
- `package.json` - Dependencies and scripts
- `.env` files - Environment variables (not in git)

### Frontend Pages
- `app/*/page.tsx` - Next.js app router pages
- `src/ui-pages/*.jsx` - Legacy page components
- `src/components/*.jsx` - Reusable React components

### Backend Services
- `dev-server.js` - Main Express server with QuickBooks integration
- `database.js` - Database abstraction layer
- Python scripts - AI invoice processing pipeline

### Data Management
- `pcs_ai_data/` - Application data directory
- `pcs_ai_data/invoice_queue.json` - Consolidated invoice queue (single array consumed by UI)
- `pcs_ai_data/qbo_tokens.db` - SQLite database for QBO OAuth tokens
- `output_jsons/` - Individual parsed invoice JSON files from Python ingestion
- `email_invoices/` - Downloaded invoice PDFs from email processing

## Important Development Notes

### QuickBooks Integration Specifics
- Uses OAuth2 with Intuit's official SDK
- Rate limiting: 8 requests/second, 100 requests/minute
- Circuit breaker pattern for fault tolerance
- Token persistence in `qbo_tokens.json`
- Webhook endpoints for real-time updates

### Invoice Processing Flow
1. **Email arrives** at `invoices@pcsmilesai.com`
2. **Python ingestion** (IMAP): Downloads PDF, detects vendor, extracts key fields (vendor_name, invoice_number, invoice_total, invoice_date, office_location, line items)
3. **JSON creation**: Writes extracted data to `output_jsons/<something>.json`
4. **Consolidation**: `consolidate_invoices.py` scans `output_jsons/`, adds metadata (`id`, `status`, `assigned_to`, `created_at`, `source_file`), writes single array to `pcs_ai_data/invoice_queue.json`
5. **API serving**: `GET /api/invoice-queue` serves consolidated data with filtering/pagination
6. **UI display**: Client pages fetch via `fetchQueue.ts` with `cache: 'no-store'`
   - **For Me**: new/unapproved invoices (status: pending/new/uploaded, not approved)
   - **To Be Paid**: approved invoices awaiting payment
   - **Complete**: completed/paid invoices
   - **All Invoices**: every invoice
7. **Categorization**: Fetch QBO categories, AI helper suggests categories for line items
8. **Approval → QBO**: Creates QuickBooks bill, attaches PDF, updates status

### Environment Variables Required
```
QBO_CLIENT_ID - QuickBooks app client ID
QBO_CLIENT_SECRET - QuickBooks app client secret
QBO_REDIRECT_URI - OAuth redirect URI
QBO_STATE_SECRET - OAuth state anti-CSRF secret
INVOICE_QUEUE_PATH - Path to invoice queue file
DEV_LOGIN_BYPASS - Development login bypass flag
```

### Database Schema (File-based JSON)
- Invoices stored with status tracking (new, processing, approved, completed)
- Processing history with timestamps and error logs
- Vendor mapping and category assignments
- User assignments and approval workflows

### Security Implementation
- API key authentication for protected endpoints
- Rate limiting on all QuickBooks API calls
- Request sanitization to prevent XSS
- Security headers via Helmet.js
- Circuit breaker for external API reliability

## Current Issues & Recent Fixes

### Issues Being Worked On
- **Data Field Mapping**: Some rows show "Unknown" due to vendor field name differences
  - Standardized mapping: `vendor_name || vendor`, `invoice_total || total`, `office_location || clinic_id`
- **For Me Tab Filtering**: Ensure all new/unapproved invoices appear (status: pending/new/uploaded, not approved)

### Recent Fixes Implemented
- **UI Fetching**: Added single `fetchInvoiceQueue` helper with `cache: 'no-store'` and robust JSON checks
- **Client-Only Pages**: Converted pages to client-only with `dynamic='force-dynamic'` and `revalidate=0`
- **Data Plumbing**: Replaced direct `/invoice_queue.json` reads with `/api/invoice-queue` endpoint
- **Click Wiring**: Implemented shared `InvoiceClickContext` for consistent navigation
- **Invoice Detail Navigation**: Enhanced lookup to match by both `invoice_number` and `id` with case-insensitive search
- **QBO Cleanup**: Removed old Vite-era `status_overrides`, added AI categorizer (`src/lib/categorize.ts`)
- **Build/Deploy**: Fixed imports and prop types for clean Next.js builds

## Vendor-Specific Parsers

Each vendor has a specialized parser that extracts structured data from their PDF invoices:

- **Epic Dental Lab**: `epic_parser.py`
- **Henry Schein**: `henry_parser.py`
- **Patterson Dental**: `patterson_invoice_parser_FINAL_WITH_JSON_SAFE.py`
- **Exodus Dental**: `exodus_parser.py`
- **Artisan Dental**: `parse_artisan_dental_exporting_fixed.py`
- **TC Dental**: `parse_tc_dental_invoice.py`

## Development Workflow

1. **Frontend Development**: Use `npm run dev` for Next.js with hot reload
2. **Backend Development**: Use `npm run dev:api` for Express server
3. **AI Pipeline Testing**: Use individual Python scripts for specific vendors
4. **Full System Testing**: Use `flowstack_orchestrator.py` to run all services
5. **QuickBooks Testing**: Use `/local-test` endpoint for OAuth and API testing

## Production Deployment

- Docker support with `docker-compose.yml`
- PM2 configuration in `ecosystem.config.js`
- Health checks at `/health` and `/metrics`
- Automated backups and monitoring
- Load balancer ready (stateless design)

## Testing Endpoints

- `/api/test` - Basic API functionality
- `/local-test` - QuickBooks integration testing
- `/health` - System health and uptime
- `/metrics` - Detailed system metrics
- `/api/qbo/status` - QuickBooks connection status
