# PCS AI - Next.js Application

This is a Next.js application for PCS AI invoice processing and management.

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Frontend**: React 18 with TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: SQLite with better-sqlite3
- **Authentication**: Custom auth with bcryptjs
- **PDF Processing**: Python scripts with OCR
- **QuickBooks Integration**: Intuit OAuth2

## Development

```bash
npm run dev
```

## Production

```bash
npm run build
npm start
```

## Features

- Invoice processing and management
- QuickBooks Online integration
- PDF parsing with OCR
- Multi-vendor invoice support
- Repair and training data collection
- Real-time invoice status updates

## Project Structure

```
app/                    # Next.js App Router pages
├── api/               # API routes
├── [PageName]/        # Page components
src/
├── components/        # Reusable React components
├── ui-pages/         # Page implementations
├── lib/              # Utility functions
└── context/          # React contexts
```

## Deployment

The application is deployed on DigitalOcean with PM2 process management.

## QuickBooks Auto-classification

The QuickBooks bill creator can automatically assign expense accounts and classes based on vendor history.

- Set `PCS_QBO_AUTO_CLASSIFY=1` (or `true`) in your environment to enable the feature.
- Historical mappings are read from `pcs_ai_data/vendor_class_category_map.json`.
- Approved invoices also push their PCS “Office” into the QuickBooks Location dropdown (Department) when a matching location is found.
- Use the `dryRun` query toggle on `/api/qbo/auto-create-bill?dryRun=true` to simulate a bill and log the chosen account/class/location without creating it.

# Updated Wed Aug  6 21:13:56 EDT 2025
# Force deployment Wed Aug  6 21:20:56 EDT 2025
# Force Vercel rebuild - Wed Aug  6 22:24:27 EDT 2025
