# PCS Company Overview

## What is PCS?

PCS (Pacific Coast Smiles / Dentaltown) is a Dental Support Organization (DSO) that owns and operates eight dental practices in the Pacific Northwest. PCS was acquired in March 2024.

**Type:** Dental Support Organization (DSO)  
**Practices:** 8 locations  
**Region:** Pacific Northwest  
**Branding:** Dentaltown (patient-facing), PCS (internal/operator)

## Practice Locations

PCS operates eight dental practices. All locations run under the Dentaltown brand for patient-facing operations.

## Key Terminology

| Term | Meaning |
|------|---------|
| DSO | Dental Support Organization — a company that provides non-clinical support services to dental practices |
| Practice | An individual dental office (one of the 8 locations) |
| Center | Another word for practice / office location |
| AP | Accounts Payable — the process of receiving, approving, and paying vendor invoices |
| GL | General Ledger — the master accounting record; all expenses map to a GL account code |
| QBO | QuickBooks Online — PCS's accounting software |
| RCM | Revenue Cycle Management — the process of submitting insurance claims, posting payments, and managing denials |
| Chart of Accounts | The full list of GL account codes used in QuickBooks |
| DSO Admin | The corporate administrative team that manages AP, HR, and finance across all 8 practices |

## Platform

PCS AI is the internal AI platform hosted at pcsmilesai.com. It is a Next.js web application running on a DigitalOcean droplet (137.184.183.253). The backend uses SQLite via better-sqlite3. The GitHub repository is PCSmilesAI/pcs-ui.

## Current AI Modules

| Module | Status | Owner |
|--------|--------|-------|
| AP Invoice Processing | Live (TC Dental vendor active) | Braxton |
| Credit Card Receipts | In development | McKay |

## North Star Vision

A unified, touchless practice management platform where AI handles: invoice processing, receipt reconciliation, insurance claim submission, denial management, claim posting, patient check-in, treatment charting, and documentation — with humans handling only patient interaction, clinical judgment, and physical procedures.

## Priority Order

1. Admin (AP + receipts) — proving ground, lowest risk, no PHI
2. Revenue Cycle Management (insurance claims, denials, posting)
3. Practice Management (scheduling, charting, patient engagement)
