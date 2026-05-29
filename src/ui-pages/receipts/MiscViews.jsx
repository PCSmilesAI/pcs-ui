/**
 * Lighter module views: Integrations, Settings, AI Assistant.
 * These are intentionally honest about what is/ isn't wired up yet.
 */
'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { styles, apiUrl, apiFetch, EmptyState, PageHeader, currentEmail } from './shared';

const PLAID_SCRIPT = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';

function loadPlaidScript() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'));
    if (window.Plaid) return resolve();
    let s = document.getElementById('plaid-link-script');
    if (s) {
      s.addEventListener('load', () => resolve());
      s.addEventListener('error', () => reject(new Error('Failed to load Plaid Link')));
      return;
    }
    s = document.createElement('script');
    s.id = 'plaid-link-script';
    s.src = PLAID_SCRIPT;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Plaid Link'));
    document.body.appendChild(s);
  });
}

// ─── Integrations ────────────────────────────────────────────────────────
export function IntegrationsView({ flash }) {
  const [plaid, setPlaid] = useState(null); // { linkConfigured, env, items }
  const [connecting, setConnecting] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiFetch(apiUrl('/api/receipts/integrations/plaid'));
      setPlaid(data);
    } catch (e) {
      flash?.(e.message, 'error');
    }
  }, [flash]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const connect = async () => {
    try {
      setConnecting(true);
      const { link_token } = await apiFetch(apiUrl('/api/receipts/integrations/plaid/link-token'), { method: 'POST' });
      await loadPlaidScript();
      const handler = window.Plaid.create({
        token: link_token,
        onSuccess: async (public_token, metadata) => {
          try {
            await apiFetch(apiUrl('/api/receipts/integrations/plaid/exchange'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ public_token, institution_name: metadata?.institution?.name || '' }),
            });
            flash?.('Bank connected', 'success');
            loadStatus();
          } catch (e) {
            flash?.(e.message, 'error');
          }
        },
        onExit: (err) => { if (err) flash?.(err.display_message || err.error_message || 'Plaid Link closed', 'info'); },
      });
      handler.open();
    } catch (e) {
      flash?.(e.message, 'info'); // e.g. "Plaid is not configured…"
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async (itemId) => {
    if (typeof window !== 'undefined' && !window.confirm('Disconnect this bank?')) return;
    try {
      await apiFetch(apiUrl(`/api/receipts/integrations/plaid?item_id=${encodeURIComponent(itemId)}`), { method: 'DELETE' });
      flash?.('Disconnected', 'success');
      loadStatus();
    } catch (e) {
      flash?.(e.message, 'error');
    }
  };

  const staticCards = [
    {
      name: 'QuickBooks Online', icon: '📗', status: 'Export when connected',
      detail: 'Approved expense reports push to QBO as a CreditCard Purchase (uses the platform QBO connection at /api/qbo/auth). GL accounts/classes resolve against the shared chart of accounts.',
    },
    {
      name: 'AI extraction', icon: '✨', status: 'Configured via env',
      detail: 'Receipt parsing uses PCS_LLM_PROVIDER / PCS_LLM_MODEL. Uploads still work without it — they just need manual field entry.',
    },
  ];

  return (
    <>
      <PageHeader title="Integrations" subtitle="External connections for the receipts module." />

      {/* Plaid — interactive connect */}
      <div className={styles.summaryTile} style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🏦</span>
            <span style={{ fontWeight: 700, color: 'var(--color-navy)' }}>Plaid (Amex feed)</span>
            {plaid && (
              <span className={`${styles.badge} ${plaid.items?.length ? styles.badgeMatched : styles.badgeUnmatched}`}>
                {plaid.items?.length ? `${plaid.items.length} connected` : plaid.linkConfigured ? 'Ready to connect' : 'Not configured'}
              </span>
            )}
          </div>
          {plaid?.linkConfigured ? (
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={connect} disabled={connecting}>
              {connecting ? 'Opening…' : '+ Connect a bank'}
            </button>
          ) : null}
        </div>

        {plaid && !plaid.linkConfigured && (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 10, lineHeight: 1.5 }}>
            Set <code>PLAID_CLIENT_ID</code> and <code>PLAID_SECRET</code> (and <code>PLAID_ENV</code>) on the server to
            enable Plaid Link. Until then, use CSV/XLSX statement import on the Transactions page — both write the same feed.
          </div>
        )}

        {plaid?.items?.length > 0 && (
          <table className={styles.dataTable} style={{ marginTop: 12 }}>
            <thead>
              <tr><th>Institution</th><th>Connected by</th><th>Last synced</th><th /></tr>
            </thead>
            <tbody>
              {plaid.items.map((it) => (
                <tr key={it.item_id}>
                  <td style={{ fontWeight: 500 }}>{it.institution_name || it.item_id}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{it.connected_by || '—'}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{it.last_synced_at ? new Date(it.last_synced_at).toLocaleString() : 'never'}</td>
                  <td className={styles.right}>
                    <button className={`${styles.btn} ${styles.btnDanger}`} style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => disconnect(it.item_id)}>Disconnect</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {plaid?.items?.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-subtle)', marginTop: 8 }}>
            Pull charges anytime from the Transactions page → “Sync from Plaid”.
          </div>
        )}
      </div>

      {/* Static integration cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {staticCards.map((i) => (
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
