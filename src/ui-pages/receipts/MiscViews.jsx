/**
 * Lighter module views: Integrations, Settings, AI Assistant.
 * These are intentionally honest about what is/ isn't wired up yet.
 */
'use client';
import React, { useState } from 'react';
import { styles, apiUrl, apiFetch, EmptyState, PageHeader, currentEmail } from './shared';

// ─── Integrations ────────────────────────────────────────────────────────
export function IntegrationsView() {
  const integrations = [
    {
      name: 'Plaid (Amex feed)', icon: '🏦', status: 'Not connected',
      detail: 'Live Amex transaction sync. Today the Transactions feed is populated by CSV/XLSX statement import. Plaid wiring depends on platform credentials owned by the AP/platform team.',
    },
    {
      name: 'QuickBooks Online', icon: '📗', status: 'Managed by platform',
      detail: 'GL accounts come from the shared chart of accounts. Pushing approved expense reports to QBO uses the platform QBO integration (lib/qbo) and is a later phase for receipts.',
    },
    {
      name: 'AI extraction', icon: '✨', status: 'Configured via env',
      detail: 'Receipt parsing uses PCS_LLM_PROVIDER / PCS_LLM_MODEL. Uploads still work without it — they just need manual field entry.',
    },
  ];
  return (
    <>
      <PageHeader title="Integrations" subtitle="External connections for the receipts module." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {integrations.map((i) => (
          <div key={i.name} className={styles.summaryTile} style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 22 }}>{i.icon}</span>
              <span style={{ fontWeight: 700, color: 'var(--color-navy)' }}>{i.name}</span>
            </div>
            <span className={`${styles.badge} ${styles.badgeUnmatched}`}>{i.status}</span>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 10, lineHeight: 1.5 }}>{i.detail}</div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────
export function SettingsView() {
  const email = currentEmail();
  const rows = [
    { label: 'Signed in as', value: email || 'Not signed in' },
    { label: 'AI parsing', value: 'Model resolved from PCS_LLM_PROVIDER / PCS_LLM_MODEL (server-side)' },
    { label: 'Match tolerances', value: 'Amount ±$1.00 · Date ±2 days · vendor fuzzy (per module rules)' },
    { label: 'Auto-categorization', value: 'Keyword rules against the shared chart of accounts' },
  ];
  return (
    <>
      <PageHeader title="Settings" subtitle="Receipts module configuration." />
      <div className={styles.tableWrapper}>
        <table className={styles.dataTable}>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td style={{ fontWeight: 600, width: 220 }}>{r.label}</td>
                <td style={{ color: 'var(--color-text-muted)' }}>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-subtle)', marginTop: 12 }}>
        Editable preferences (GL/class aliases, notifications) are a later phase.
      </div>
    </>
  );
}

// ─── AI Assistant ──────────────────────────────────────────────────────────
export function AIAssistantView({ flash }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hi! Ask me about your receipts — totals, unmatched items, or what needs attention. (Answers are computed from your live receipt data.)' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  // Lightweight, data-grounded answers computed locally from the receipts API —
  // no model call, so it works without an LLM key. A richer PCS_LLM-backed chat
  // can replace answer() later.
  const answer = async (q) => {
    const lower = q.toLowerCase();
    const data = await apiFetch(apiUrl('/api/receipts'));
    const s = data.stats || {};
    if (lower.includes('unmatched') || lower.includes('match'))
      return `${s.unmatched} of ${s.total_count} receipts are unmatched (${s.match_pct}% reconciled).`;
    if (lower.includes('total') || lower.includes('spend') || lower.includes('amount'))
      return `Total receipt spend is ${(s.total_amount ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} across ${s.total_count} receipts.`;
    if (lower.includes('disputed'))
      return `${s.disputed} receipt(s) are currently disputed.`;
    return `I can answer about totals, unmatched receipts, and disputes. You have ${s.total_count} receipts totalling ${(s.total_amount ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}.`;
  };

  const send = async () => {
    const q = input.trim();
    if (!q) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    try {
      setBusy(true);
      const a = await answer(q);
      setMessages((m) => [...m, { role: 'assistant', text: a }]);
    } catch (e) {
      flash?.(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="AI Assistant" subtitle="Ask questions about your receipts (beta)." />
      <div className={styles.tableWrapper} style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 240, marginBottom: 12 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
              <div style={{
                padding: '8px 12px', borderRadius: 12, fontSize: 13,
                background: m.role === 'user' ? 'var(--color-pacific-blue)' : 'var(--color-bg-subtle)',
                color: m.role === 'user' ? 'white' : 'var(--color-text)',
              }}>{m.text}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className={styles.formInput} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder="e.g. how many unmatched receipts?" />
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={send} disabled={busy}>{busy ? '…' : 'Send'}</button>
        </div>
      </div>
    </>
  );
}
