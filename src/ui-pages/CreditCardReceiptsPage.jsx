/**
 * CreditCardReceiptsPage.jsx
 *
 * McKay — this is your canvas. Build the entire Credit Card Receipts module UI here.
 *
 * This page is reached via the "Credit Card Receipts" button in the top nav.
 * It sits inside the shared PCS AI layout (NavBar, auth, providers) automatically.
 *
 * API endpoints wired up for you:
 *   GET    /api/receipts          → fetch all receipts
 *   POST   /api/receipts          → submit a new receipt
 *   GET    /api/receipts/:id      → fetch one receipt
 *   PATCH  /api/receipts/:id      → update a receipt (match status, GL code, etc.)
 *
 * Suggested sections to build:
 *   1. Upload / intake panel   — drag-and-drop or file input for receipt images
 *   2. Receipts table / list   — show status, vendor, amount, match status
 *   3. Receipt detail drawer   — view parsed data, Amex match, GL code, notes
 *   4. Amex reconciliation     — side-by-side receipt vs transaction view
 *
 * Keep styles consistent with the existing app:
 *   - Primary blue:  #357ab2
 *   - Background:    #ffffff
 *   - Border radius: 9999px for pills, 8px for cards
 *   - Font size:     14px for body, 24px for page title
 *   - Use inline styles (no Tailwind) to match existing pattern
 */

'use client';
import React from 'react';

export default function CreditCardReceiptsPage() {
  return (
    <div style={{ padding: '32px', maxWidth: '1100px', margin: '0 auto' }}>
      <h1
        style={{
          fontSize: '24px',
          fontWeight: 600,
          color: '#357ab2',
          marginBottom: '8px',
        }}
      >
        Credit Card Receipts
      </h1>
      <p
        style={{
          fontSize: '14px',
          color: '#6b7280',
          marginBottom: '32px',
        }}
      >
        Submit, track, and reconcile credit card receipts against Amex transactions.
      </p>

      {/* ─── BUILD STARTS HERE ───────────────────────────────────────────── */}
      <div
        style={{
          border: '2px dashed #c8dff0',
          borderRadius: '12px',
          padding: '48px',
          textAlign: 'center',
          color: '#357ab2',
          fontSize: '14px',
        }}
      >
        <span
          className="fas fa-receipt"
          style={{ fontSize: '36px', marginBottom: '16px', display: 'block', opacity: 0.5 }}
        />
        <strong>Module Under Construction</strong>
        <p style={{ marginTop: '8px', color: '#9ca3af' }}>
          McKay — start building here. See the comment at the top of this file for the full guide.
        </p>
      </div>
      {/* ─── BUILD ENDS HERE ─────────────────────────────────────────────── */}
    </div>
  );
}
