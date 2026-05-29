/**
 * CreditCardReceiptsPage.jsx
 *
 * Credit Card Receipts module UI — replicates the receipt-agent Flask app's
 * "Sage" design (navy sidebar + topbar + Pacific-blue accents). Renders its own
 * full-height shell; AppLayout suppresses the shared pcs-ui top nav on this route.
 *
 * Styling: ./CreditCardReceiptsPage.module.css (scoped — no global bleed).
 *
 * Backed by:
 *   GET    /api/receipts            → { receipts, stats }   (filters: status, mine, q)
 *   POST   /api/receipts            → manual create (JSON) OR upload (multipart file)
 *   GET    /api/receipts/:id        → one receipt
 *   PATCH  /api/receipts/:id        → update fields, or { action:'match', transactions }
 *   DELETE /api/receipts/:id        → delete
 *   GET    /api/receipts/:id/file   → stream the stored receipt image/PDF
 */

'use client';
import React, { useCallback, useEffect, useState } from 'react';
import styles from './CreditCardReceiptsPage.module.css';

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

function currentEmail() {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('email') || '';
}

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'unmatched', label: 'Unmatched' },
  { key: 'matched', label: 'Matched' },
  { key: 'disputed', label: 'Disputed' },
];

// Sidebar nav mirrors the Flask app. "Business Expenses" is the live receipts
// view; "Dashboard" shows the tiles. The rest are shown for parity and render a
// placeholder (those areas aren't part of the receipts module in pcs-ui yet).
const NAV = [
  { key: 'dashboard', icon: '📊', label: 'Dashboard' },
  { key: 'expenses', icon: '🧾', label: 'Business Expenses' },
  { key: 'reports', icon: '📑', label: 'Expense Reports', placeholder: true },
  { key: 'transactions', icon: '💳', label: 'Transactions', placeholder: true },
  { key: 'cards', icon: '🗂️', label: 'Manage Cards', placeholder: true },
  { key: 'integrations', icon: '🔌', label: 'Integrations', placeholder: true },
  { key: 'settings', icon: '⚙️', label: 'Settings', placeholder: true },
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
  const [view, setView] = useState('expenses');
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

  const [selected, setSelected] = useState(null);

  const email = currentEmail();
  const avatarInitial = (email ? email[0] : 'U').toUpperCase();

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
        flash(`Uploaded. AI parse unavailable — fill fields manually.`, 'info');
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

  const activeNav = NAV.find((n) => n.key === view) || NAV[1];

  return (
    <div className={styles.shell}>
      {/* ─── Sidebar ─────────────────────────────────────────── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.logo}>PC</div>
          <div className={styles.brand}>
            <div className={styles.brandName}>PC SMILES</div>
            <div className={styles.brandProduct}>Receipts</div>
          </div>
        </div>
        <nav className={styles.nav}>
          {NAV.map((item) => (
            <button
              key={item.key}
              className={`${styles.navItem} ${view === item.key ? styles.navItemActive : ''}`}
              onClick={() => setView(item.key)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
              {item.key === 'expenses' && stats && stats.unmatched > 0 ? (
                <span className={styles.navBadge}>{stats.unmatched}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          Pacific Crest Smiles Dental, LLC
          <br />
          <span style={{ opacity: 0.6 }}>Receipts module</span>
        </div>
      </aside>

      {/* ─── Main ────────────────────────────────────────────── */}
      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>{activeNav.label}</div>
          <div className={styles.headerRight}>
            <div className={styles.userMenu}>
              <div className={styles.userAvatar}>{avatarInitial}</div>
              <span className={styles.userName}>{email || 'Not signed in'}</span>
            </div>
          </div>
        </header>

        <main className={styles.content}>
          {view === 'expenses' && (
            <ExpensesView
              stats={stats}
              receipts={receipts}
              loading={loading}
              error={error}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              mineOnly={mineOnly}
              setMineOnly={setMineOnly}
              search={search}
              setSearch={setSearch}
              uploading={uploading}
              onUpload={handleUpload}
              onAdd={() => {
                setForm(EMPTY_FORM);
                setShowManual(true);
              }}
              onRowClick={(r) => setSelected(r)}
              onDelete={handleDelete}
            />
          )}

          {view === 'dashboard' && <DashboardView stats={stats} />}

          {activeNav.placeholder && (
            <Placeholder label={activeNav.label} />
          )}
        </main>
      </div>

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

      {toast && (
        <div
          className={`${styles.toast} ${
            toast.variant === 'success' ? styles.toastSuccess : toast.variant === 'error' ? styles.toastError : ''
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Views
// ============================================================================

function ExpensesView({
  stats, receipts, loading, error,
  statusFilter, setStatusFilter, mineOnly, setMineOnly, search, setSearch,
  uploading, onUpload, onAdd, onRowClick, onDelete,
}) {
  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Business Expenses</div>
          <div className={styles.pageSubtitle}>
            Submit, track, and reconcile credit card receipts against Amex transactions.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label className={`${styles.btn} ${styles.btnSecondary} ${styles.uploadLabel}`} style={{ cursor: uploading ? 'wait' : 'pointer' }}>
            <span>⬆</span>
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
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onAdd}>
            <span>＋</span> Add receipt
          </button>
        </div>
      </div>

      <SummaryTiles stats={stats} />

      <div className={styles.tableWrapper}>
        <div className={styles.tableToolbar}>
          <div className={styles.tableFilters}>
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`${styles.btn} ${statusFilter === tab.key ? styles.btnPrimary : styles.btnGhost}`}
                style={{ padding: '5px 12px', fontSize: 12 }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className={styles.tableFilters}>
            <input
              className={styles.formInput}
              style={{ width: 220 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendor, GL, notes…"
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
              Mine only
            </label>
          </div>
        </div>

        {error ? (
          <div className={styles.emptyState} style={{ color: 'var(--color-danger)' }}>{error}</div>
        ) : loading ? (
          <div className={styles.emptyState}>Loading receipts…</div>
        ) : receipts.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🧾</div>
            <div className={styles.emptyTitle}>No receipts yet</div>
            <div className={styles.emptyMessage}>
              Upload a receipt image/PDF or add one manually to get started.
            </div>
          </div>
        ) : (
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Date</th>
                <th>Vendor</th>
                <th className={styles.right}>Amount</th>
                <th>GL account</th>
                <th>Location</th>
                <th>Card</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} onClick={() => onRowClick(r)}>
                  <td>
                    {r.image_path ? <span title="Has file">🧾</span> : <span style={{ opacity: 0.3 }} title="No file">○</span>}
                  </td>
                  <td>{fmtDate(r.date)}</td>
                  <td style={{ fontWeight: 500 }}>
                    {r.vendor || <span style={{ color: 'var(--color-text-subtle)' }}>Unknown</span>}
                  </td>
                  <td className={`${styles.right} ${styles.money}`}>{money(r.amount)}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{r.gl_account || '—'}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{r.location || '—'}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{r.card_last4 ? `•••• ${r.card_last4}` : '—'}</td>
                  <td><StatusBadge status={r.match_status} /></td>
                  <td className={styles.right}>
                    <button
                      title="Delete"
                      className={styles.iconBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(r.id);
                      }}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function DashboardView({ stats }) {
  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Dashboard</div>
          <div className={styles.pageSubtitle}>Receipt reconciliation overview.</div>
        </div>
      </div>
      <SummaryTiles stats={stats} />
    </>
  );
}

function Placeholder({ label }) {
  return (
    <>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>{label}</div>
      </div>
      <div className={styles.tableWrapper}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🚧</div>
          <div className={styles.emptyTitle}>{label} isn’t part of the receipts module yet</div>
          <div className={styles.emptyMessage}>
            This view exists in the standalone receipt-agent app. Plaid/Amex feed, expense
            reports, and QBO export are planned for a later phase.
          </div>
        </div>
      </div>
    </>
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
    <div className={styles.summaryTiles}>
      {tiles.map((t) => (
        <div key={t.label} className={styles.summaryTile}>
          <div className={styles.tileLabel}>{t.label}</div>
          <div className={styles.tileValue}>{t.value}</div>
          {t.suffix ? <div className={styles.tileSuffix}>{t.suffix}</div> : null}
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  const cls =
    status === 'matched' ? styles.badgeMatched : status === 'disputed' ? styles.badgeDisputed : styles.badgeUnmatched;
  return <span className={`${styles.badge} ${cls}`}>{status || 'unmatched'}</span>;
}

// ============================================================================
// Modals
// ============================================================================

function ManualEntryModal({ form, setForm, saving, onSave, onClose }) {
  const field = (label, key, props = {}) => (
    <div className={styles.formGroup}>
      <label className={styles.formLabel}>{label}</label>
      <input
        className={styles.formInput}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        {...props}
      />
    </div>
  );
  return (
    <Backdrop onClose={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Add receipt</div>
          <button className={styles.modalClose} onClick={onClose}>×</button>
        </div>
        <div className={styles.modalBody}>
          {field('Vendor *', 'vendor')}
          <div className={styles.formRow}>
            {field('Amount *', 'amount', { type: 'number', step: '0.01', placeholder: '0.00' })}
            {field('Date', 'date', { type: 'date' })}
          </div>
          {field('GL account', 'gl_account', { placeholder: 'Auto-categorized if left blank' })}
          <div className={styles.formRow}>
            {field('Location', 'location')}
            {field('Card last 4', 'card_last4', { maxLength: 4 })}
          </div>
          {field('Notes', 'notes')}
        </div>
        <div className={styles.modalFooter}>
          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={onClose} disabled={saving}>Cancel</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save receipt'}
          </button>
        </div>
      </div>
    </Backdrop>
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
    <div className={styles.formGroup}>
      <label className={styles.formLabel}>{label}</label>
      <input
        className={styles.formInput}
        value={draft[key] ?? ''}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        {...props}
      />
    </div>
  );

  return (
    <Backdrop onClose={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>{receipt.vendor || 'Receipt detail'}</div>
          <button className={styles.modalClose} onClick={onClose}>×</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.popoutGrid}>
            {/* Left: editable fields */}
            <div>
              {field('Vendor', 'vendor')}
              <div className={styles.formRow}>
                {field('Amount', 'amount', { type: 'number', step: '0.01' })}
                {field('Date', 'date', { type: 'date' })}
              </div>
              {field('GL account', 'gl_account')}
              <div className={styles.formRow}>
                {field('Location', 'location')}
                {field('Card last 4', 'card_last4', { maxLength: 4 })}
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Status</label>
                <select
                  className={styles.formSelect}
                  value={draft.match_status}
                  onChange={(e) => setDraft({ ...draft, match_status: e.target.value })}
                >
                  <option value="unmatched">Unmatched</option>
                  <option value="matched">Matched</option>
                  <option value="disputed">Disputed</option>
                </select>
              </div>
              {field('Notes', 'notes')}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveFields} disabled={savingField}>
                  {savingField ? 'Saving…' : 'Save'}
                </button>
                <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={runMatch} disabled={matching}>
                  {matching ? 'Matching…' : 'Find Amex match'}
                </button>
                <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => onDelete(receipt.id)}>
                  Delete
                </button>
              </div>
            </div>

            {/* Right: receipt viewer */}
            <div>
              <div className={styles.amexCard}>
                <div className={styles.amexLabel}>Match status</div>
                <StatusBadge status={receipt.match_status} />
                {receipt.amex_txn_id ? (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>
                    Amex txn: {receipt.amex_txn_id}
                  </div>
                ) : null}
              </div>
              {!fileUrl ? (
                <div className={styles.receiptViewerEmpty}>No file attached</div>
              ) : isPdf ? (
                <iframe title="receipt" src={fileUrl} className={styles.receiptViewer} style={{ width: '100%', height: 420 }} />
              ) : (
                <div className={styles.receiptViewer}>
                  <img src={fileUrl} alt="receipt" style={{ width: '100%', display: 'block' }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Backdrop>
  );
}

function Backdrop({ children, onClose }) {
  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      {children}
    </div>
  );
}
