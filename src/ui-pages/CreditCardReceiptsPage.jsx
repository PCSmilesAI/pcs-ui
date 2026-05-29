/**
 * CreditCardReceiptsPage.jsx
 *
 * Credit Card Receipts module UI. Reached via the "Credit Card Receipts" button
 * in the top nav; sits inside the shared PCS AI layout (NavBar, auth, providers).
 *
 * Backed by:
 *   GET    /api/receipts            → { receipts, stats }   (filters: status, mine, q)
 *   POST   /api/receipts            → manual create (JSON) OR upload (multipart file)
 *   GET    /api/receipts/:id        → one receipt
 *   PATCH  /api/receipts/:id        → update fields, or { action:'match', transactions }
 *   DELETE /api/receipts/:id        → delete
 *   GET    /api/receipts/:id/file   → stream the stored receipt image/PDF
 *
 * Styling matches the rest of the app (inline styles, no Tailwind):
 *   primary #357ab2 · body 14px · title 24px · pills 9999px · cards 8px
 */

'use client';
import React, { useCallback, useEffect, useState } from 'react';

// ─── style tokens ──────────────────────────────────────────────────────────
const BLUE = '#357ab2';
const MUTED = '#6b7280';
const FAINT = '#9ca3af';
const BORDER = '#e5e7eb';
const BORDER_BLUE = '#c8dff0';

const STATUS_COLORS = {
  matched: { bg: '#e7f6ec', fg: '#1b7f3b' },
  unmatched: { bg: '#fef3e2', fg: '#b9770e' },
  disputed: { bg: '#fdecec', fg: '#c0392b' },
};

// ─── helpers ─────────────────────────────────────────────────────────────
function money(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function fmtDate(d) {
  if (!d) return '—';
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
}

// Forward the current query string (e.g. ?email=...) so API auth works without cookies.
function apiUrl(pathname, extra = {}) {
  const params =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  Object.entries(extra).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') params.delete(k);
    else params.set(k, String(v));
  });
  const qs = params.toString();
  return `${pathname}${qs ? `?${qs}` : ''}`;
}

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'unmatched', label: 'Unmatched' },
  { key: 'matched', label: 'Matched' },
  { key: 'disputed', label: 'Disputed' },
];

const EMPTY_FORM = {
  vendor: '',
  amount: '',
  date: '',
  gl_account: '',
  location: '',
  card_last4: '',
  notes: '',
};

export default function CreditCardReceiptsPage() {
  const [receipts, setReceipts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);

  const [showManual, setShowManual] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [selected, setSelected] = useState(null); // receipt being viewed in drawer

  const flash = useCallback((message, variant = 'info') => {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        apiUrl('/api/receipts', {
          status: statusFilter === 'all' ? '' : statusFilter,
          mine: mineOnly ? '1' : '',
          q: search.trim(),
        }),
        { cache: 'no-store', credentials: 'include' }
      );
      if (!res.ok) throw new Error(`Failed to load receipts (HTTP ${res.status})`);
      const data = await res.json();
      setReceipts(Array.isArray(data.receipts) ? data.receipts : []);
      setStats(data.stats || null);
    } catch (e) {
      setError(e.message || 'Failed to load receipts');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, mineOnly, search]);

  useEffect(() => {
    load();
  }, [load]);

  // ─── actions ──────────────────────────────────────────────────────────
  const handleManualSave = async () => {
    if (!form.vendor.trim()) return flash('Vendor is required', 'error');
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount < 0) return flash('Enter a valid amount', 'error');
    try {
      setSaving(true);
      const res = await fetch(apiUrl('/api/receipts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...form, amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      flash('Receipt added', 'success');
      setShowManual(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      flash(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(apiUrl('/api/receipts'), {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      if (data.parseError) {
        flash(`Uploaded. AI parse unavailable (${data.parseError}) — fill fields manually.`, 'info');
      } else {
        flash('Uploaded and parsed', 'success');
      }
      load();
      if (data.receipt) setSelected(data.receipt);
    } catch (e) {
      flash(e.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handlePatch = async (id, patch) => {
    const res = await fetch(apiUrl(`/api/receipts/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Update failed');
    return data.receipt;
  };

  const handleDelete = async (id) => {
    if (typeof window !== 'undefined' && !window.confirm('Delete this receipt?')) return;
    try {
      const res = await fetch(apiUrl(`/api/receipts/${id}`), {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      flash('Receipt deleted', 'success');
      setSelected(null);
      load();
    } catch (e) {
      flash(e.message, 'error');
    }
  };

  // ─── render ───────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        onAdd={() => {
          setForm(EMPTY_FORM);
          setShowManual(true);
        }}
        onUpload={handleUpload}
        uploading={uploading}
      />

      <SummaryTiles stats={stats} />

      <Toolbar
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        mineOnly={mineOnly}
        setMineOnly={setMineOnly}
        search={search}
        setSearch={setSearch}
      />

      {error && (
        <div style={{ ...cardStyle, borderColor: '#f3c6c6', color: '#c0392b', marginTop: 12 }}>
          {error}
        </div>
      )}

      <ReceiptsTable
        receipts={receipts}
        loading={loading}
        onRowClick={(r) => setSelected(r)}
        onDelete={handleDelete}
      />

      {showManual && (
        <ManualEntryModal
          form={form}
          setForm={setForm}
          saving={saving}
          onSave={handleManualSave}
          onClose={() => setShowManual(false)}
        />
      )}

      {selected && (
        <ReceiptDrawer
          receipt={selected}
          onClose={() => setSelected(null)}
          onPatch={handlePatch}
          onDelete={handleDelete}
          onSaved={(updated) => {
            setSelected(updated);
            load();
          }}
          flash={flash}
        />
      )}

      {toast && <Toast toast={toast} />}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function PageHeader({ onAdd, onUpload, uploading }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: BLUE, marginBottom: '8px' }}>
          Credit Card Receipts
        </h1>
        <p style={{ fontSize: '14px', color: MUTED, marginBottom: '24px' }}>
          Submit, track, and reconcile credit card receipts against Amex transactions.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ ...btnGhost, cursor: uploading ? 'wait' : 'pointer' }}>
          <span className="fas fa-upload" style={{ marginRight: 6 }} />
          {uploading ? 'Uploading…' : 'Upload receipt'}
          <input
            type="file"
            accept="image/*,application/pdf"
            style={{ display: 'none' }}
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              onUpload(f);
            }}
          />
        </label>
        <button style={btnPrimary} onClick={onAdd}>
          <span className="fas fa-plus" style={{ marginRight: 6 }} />
          Add receipt
        </button>
      </div>
    </div>
  );
}

function SummaryTiles({ stats }) {
  const tiles = [
    { label: 'Total receipts', value: stats ? stats.total_count : '—' },
    { label: 'Total amount', value: stats ? money(stats.total_amount) : '—' },
    { label: 'Matched', value: stats ? stats.matched : '—', suffix: stats ? `${stats.match_pct}% of total` : '' },
    { label: 'Unmatched', value: stats ? stats.unmatched : '—' },
    { label: 'Disputed', value: stats ? stats.disputed : '—' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
      {tiles.map((t) => (
        <div key={t.label} style={cardStyle}>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>{t.label}</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#1f2937' }}>{t.value}</div>
          {t.suffix ? <div style={{ fontSize: 12, color: FAINT, marginTop: 4 }}>{t.suffix}</div> : null}
        </div>
      ))}
    </div>
  );
}

function Toolbar({ statusFilter, setStatusFilter, mineOnly, setMineOnly, search, setSearch }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {STATUS_TABS.map((tab) => {
          const active = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              style={active ? pillActive : pillInactive}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search vendor, GL, notes…"
        style={{
          flex: 1,
          minWidth: 200,
          padding: '8px 12px',
          fontSize: 14,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
        }}
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: MUTED, cursor: 'pointer' }}>
        <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
        Mine only
      </label>
    </div>
  );
}

function ReceiptsTable({ receipts, loading, onRowClick, onDelete }) {
  if (loading) {
    return <div style={{ ...cardStyle, textAlign: 'center', color: MUTED }}>Loading receipts…</div>;
  }
  if (receipts.length === 0) {
    return (
      <div
        style={{
          border: `2px dashed ${BORDER_BLUE}`,
          borderRadius: 12,
          padding: 48,
          textAlign: 'center',
          color: BLUE,
          fontSize: 14,
        }}
      >
        <span className="fas fa-receipt" style={{ fontSize: 32, marginBottom: 12, display: 'block', opacity: 0.5 }} />
        <strong>No receipts yet</strong>
        <p style={{ marginTop: 8, color: FAINT }}>
          Upload a receipt image/PDF or add one manually to get started.
        </p>
      </div>
    );
  }
  const th = { textAlign: 'left', padding: '10px 12px', fontSize: 12, color: MUTED, fontWeight: 600, borderBottom: `1px solid ${BORDER}` };
  const td = { padding: '10px 12px', fontSize: 14, borderBottom: `1px solid ${BORDER}`, color: '#1f2937' };
  return (
    <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Receipt</th>
            <th style={th}>Date</th>
            <th style={th}>Vendor</th>
            <th style={{ ...th, textAlign: 'right' }}>Amount</th>
            <th style={th}>GL account</th>
            <th style={th}>Location</th>
            <th style={th}>Card</th>
            <th style={th}>Status</th>
            <th style={th} />
          </tr>
        </thead>
        <tbody>
          {receipts.map((r) => (
            <tr
              key={r.id}
              onClick={() => onRowClick(r)}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fbfd')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <td style={td}>
                {r.image_path ? (
                  <span className="fas fa-file-invoice" style={{ color: BLUE }} title="Has file" />
                ) : (
                  <span className="far fa-circle" style={{ color: FAINT }} title="No file" />
                )}
              </td>
              <td style={td}>{fmtDate(r.date)}</td>
              <td style={{ ...td, fontWeight: 500 }}>{r.vendor || <em style={{ color: FAINT }}>Unknown</em>}</td>
              <td style={{ ...td, textAlign: 'right' }}>{money(r.amount)}</td>
              <td style={{ ...td, color: MUTED }}>{r.gl_account || '—'}</td>
              <td style={{ ...td, color: MUTED }}>{r.location || '—'}</td>
              <td style={{ ...td, color: MUTED }}>{r.card_last4 ? `•••• ${r.card_last4}` : '—'}</td>
              <td style={td}>
                <StatusBadge status={r.match_status} />
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <button
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(r.id);
                  }}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: FAINT }}
                >
                  <span className="fas fa-trash" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.unmatched;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        backgroundColor: c.bg,
        color: c.fg,
        textTransform: 'capitalize',
      }}
    >
      {status || 'unmatched'}
    </span>
  );
}

function ManualEntryModal({ form, setForm, saving, onSave, onClose }) {
  const field = (label, key, props = {}) => (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 12, color: MUTED, marginBottom: 4 }}>{label}</span>
      <input
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        style={{ width: '100%', padding: '8px 10px', fontSize: 14, border: `1px solid ${BORDER}`, borderRadius: 8 }}
        {...props}
      />
    </label>
  );
  return (
    <Overlay onClose={onClose}>
      <div style={{ ...modalStyle, maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: BLUE, marginBottom: 16 }}>Add receipt</h2>
        {field('Vendor *', 'vendor')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {field('Amount *', 'amount', { type: 'number', step: '0.01', placeholder: '0.00' })}
          {field('Date', 'date', { type: 'date' })}
        </div>
        {field('GL account', 'gl_account', { placeholder: 'Auto-categorized if left blank' })}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {field('Location', 'location')}
          {field('Card last 4', 'card_last4', { maxLength: 4 })}
        </div>
        {field('Notes', 'notes')}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button style={btnGhost} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button style={btnPrimary} onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save receipt'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function ReceiptDrawer({ receipt, onClose, onPatch, onDelete, onSaved, flash }) {
  const [draft, setDraft] = useState(receipt);
  const [savingField, setSavingField] = useState(false);
  const [matching, setMatching] = useState(false);

  useEffect(() => {
    setDraft(receipt);
  }, [receipt]);

  const isPdf = (receipt.image_path || '').toLowerCase().endsWith('.pdf');
  const fileUrl = receipt.image_path ? apiUrl(`/api/receipts/${receipt.id}/file`) : null;

  const saveFields = async () => {
    try {
      setSavingField(true);
      const updated = await onPatch(receipt.id, {
        vendor: draft.vendor,
        amount: parseFloat(draft.amount) || 0,
        date: draft.date,
        gl_account: draft.gl_account,
        location: draft.location,
        card_last4: draft.card_last4,
        notes: draft.notes,
        match_status: draft.match_status,
      });
      flash('Saved', 'success');
      onSaved(updated);
    } catch (e) {
      flash(e.message, 'error');
    } finally {
      setSavingField(false);
    }
  };

  // No Amex feed table exists in pcs-ui yet (Plaid integration is external/planned).
  // The matcher runs against candidates the caller supplies; with none available it
  // returns unmatched. Reviewers can still set the status manually below.
  const runMatch = async () => {
    try {
      setMatching(true);
      const updated = await onPatch(receipt.id, { action: 'match', transactions: [] });
      flash('No Amex candidates available — connect Plaid to enable auto-match.', 'info');
      onSaved(updated);
    } catch (e) {
      flash(e.message, 'error');
    } finally {
      setMatching(false);
    }
  };

  const field = (label, key, props = {}) => (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 12, color: MUTED, marginBottom: 4 }}>{label}</span>
      <input
        value={draft[key] ?? ''}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        style={{ width: '100%', padding: '8px 10px', fontSize: 14, border: `1px solid ${BORDER}`, borderRadius: 8 }}
        {...props}
      />
    </label>
  );

  return (
    <Overlay onClose={onClose}>
      <div style={drawerStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: BLUE }}>Receipt detail</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: MUTED }}>
            <span className="fas fa-times" />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Left: editable fields */}
          <div>
            {field('Vendor', 'vendor')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {field('Amount', 'amount', { type: 'number', step: '0.01' })}
              {field('Date', 'date', { type: 'date' })}
            </div>
            {field('GL account', 'gl_account')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {field('Location', 'location')}
              {field('Card last 4', 'card_last4', { maxLength: 4 })}
            </div>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ display: 'block', fontSize: 12, color: MUTED, marginBottom: 4 }}>Status</span>
              <select
                value={draft.match_status}
                onChange={(e) => setDraft({ ...draft, match_status: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', fontSize: 14, border: `1px solid ${BORDER}`, borderRadius: 8 }}
              >
                <option value="unmatched">Unmatched</option>
                <option value="matched">Matched</option>
                <option value="disputed">Disputed</option>
              </select>
            </label>
            {field('Notes', 'notes')}

            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <button style={btnPrimary} onClick={saveFields} disabled={savingField}>
                {savingField ? 'Saving…' : 'Save'}
              </button>
              <button style={btnGhost} onClick={runMatch} disabled={matching}>
                {matching ? 'Matching…' : 'Find Amex match'}
              </button>
              <button
                style={{ ...btnGhost, color: '#c0392b', borderColor: '#f3c6c6' }}
                onClick={() => onDelete(receipt.id)}
              >
                Delete
              </button>
            </div>
          </div>

          {/* Right: receipt viewer */}
          <div>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>Receipt file</div>
            {!fileUrl ? (
              <div
                style={{
                  border: `2px dashed ${BORDER_BLUE}`,
                  borderRadius: 8,
                  padding: 32,
                  textAlign: 'center',
                  color: FAINT,
                  fontSize: 13,
                }}
              >
                No file attached
              </div>
            ) : isPdf ? (
              <iframe title="receipt" src={fileUrl} style={{ width: '100%', height: 420, border: `1px solid ${BORDER}`, borderRadius: 8 }} />
            ) : (
              <img
                src={fileUrl}
                alt="receipt"
                style={{ width: '100%', borderRadius: 8, border: `1px solid ${BORDER}` }}
              />
            )}
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 24,
      }}
    >
      {children}
    </div>
  );
}

function Toast({ toast }) {
  const colors = {
    success: { bg: '#e7f6ec', fg: '#1b7f3b' },
    error: { bg: '#fdecec', fg: '#c0392b' },
    info: { bg: '#eaf2fa', fg: BLUE },
  };
  const c = colors[toast.variant] || colors.info;
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        background: c.bg,
        color: c.fg,
        padding: '10px 18px',
        borderRadius: 9999,
        fontSize: 14,
        fontWeight: 500,
        boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
        zIndex: 1100,
      }}
    >
      {toast.message}
    </div>
  );
}

// ─── shared inline styles ──────────────────────────────────────────────────
const cardStyle = {
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: 16,
  background: '#fff',
};

const btnPrimary = {
  padding: '8px 16px',
  borderRadius: 9999,
  fontSize: 14,
  fontWeight: 500,
  border: `1px solid ${BLUE}`,
  background: BLUE,
  color: '#fff',
  cursor: 'pointer',
};

const btnGhost = {
  padding: '8px 16px',
  borderRadius: 9999,
  fontSize: 14,
  fontWeight: 500,
  border: `1px solid ${BLUE}`,
  background: '#fff',
  color: BLUE,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
};

const pillActive = {
  padding: '6px 14px',
  borderRadius: 9999,
  fontSize: 13,
  fontWeight: 500,
  border: `1px solid ${BLUE}`,
  background: BLUE,
  color: '#fff',
  cursor: 'pointer',
};

const pillInactive = {
  padding: '6px 14px',
  borderRadius: 9999,
  fontSize: 13,
  fontWeight: 500,
  border: `1px solid ${BLUE}`,
  background: '#fff',
  color: BLUE,
  cursor: 'pointer',
};

const modalStyle = {
  background: '#fff',
  borderRadius: 12,
  padding: 24,
  width: '100%',
  boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
};

const drawerStyle = {
  background: '#fff',
  borderRadius: 12,
  padding: 24,
  width: '100%',
  maxWidth: 900,
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
};
