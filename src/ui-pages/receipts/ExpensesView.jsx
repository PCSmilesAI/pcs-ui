/**
 * Business Expenses view — the receipts table, intake (upload + manual entry),
 * detail drawer, and "create expense report from selected".
 */
'use client';
import React, { useCallback, useEffect, useState } from 'react';
import {
  styles, money, fmtDate, apiUrl, apiFetch, StatusBadge, SummaryTiles, Backdrop, EmptyState, PageHeader,
} from './shared';

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'unmatched', label: 'Unmatched' },
  { key: 'matched', label: 'Matched' },
  { key: 'disputed', label: 'Disputed' },
];

const EMPTY_FORM = { vendor: '', amount: '', date: '', gl_account: '', location: '', card_last4: '', notes: '' };

export default function ExpensesView({ flash, onChanged }) {
  const [receipts, setReceipts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [showManual, setShowManual] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch(
        apiUrl('/api/receipts', {
          status: statusFilter === 'all' ? '' : statusFilter,
          mine: mineOnly ? '1' : '',
          q: search.trim(),
        })
      );
      setReceipts(Array.isArray(data.receipts) ? data.receipts : []);
      setStats(data.stats || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, mineOnly, search]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleManualSave = async () => {
    if (!form.vendor.trim()) return flash('Vendor is required', 'error');
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount < 0) return flash('Enter a valid amount', 'error');
    try {
      setSaving(true);
      await apiFetch(apiUrl('/api/receipts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount }),
      });
      flash('Receipt added', 'success');
      setShowManual(false);
      setForm(EMPTY_FORM);
      load();
      onChanged?.();
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
      const data = await apiFetch(apiUrl('/api/receipts'), { method: 'POST', body: fd });
      flash(data.parseError ? 'Uploaded. Fill fields manually (AI parse unavailable).' : 'Uploaded and parsed', data.parseError ? 'info' : 'success');
      load();
      onChanged?.();
      if (data.receipt) setSelected(data.receipt);
    } catch (e) {
      flash(e.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handlePatch = async (id, patch) => {
    const data = await apiFetch(apiUrl(`/api/receipts/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return data.receipt;
  };

  const handleDelete = async (id) => {
    if (typeof window !== 'undefined' && !window.confirm('Delete this receipt?')) return;
    try {
      await apiFetch(apiUrl(`/api/receipts/${id}`), { method: 'DELETE' });
      flash('Receipt deleted', 'success');
      setSelected(null);
      load();
      onChanged?.();
    } catch (e) {
      flash(e.message, 'error');
    }
  };

  const createReport = async () => {
    try {
      const data = await apiFetch(apiUrl('/api/receipts/reports'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptIds: Array.from(selectedIds) }),
      });
      flash(`Report #${data.report.display_number} created (${data.report.expense_count} receipts)`, 'success');
      setSelectedIds(new Set());
      load();
      onChanged?.();
    } catch (e) {
      flash(e.message, 'error');
    }
  };

  const tiles = [
    { label: 'Total receipts', value: stats ? stats.total_count : '—' },
    { label: 'Total amount', value: stats ? money(stats.total_amount) : '—' },
    { label: 'Matched', value: stats ? stats.matched : '—', suffix: stats ? `${stats.match_pct}% of total` : '' },
    { label: 'Unmatched', value: stats ? stats.unmatched : '—' },
    { label: 'Disputed', value: stats ? stats.disputed : '—' },
  ];

  return (
    <>
      <PageHeader
        title="Business Expenses"
        subtitle="Submit, track, and reconcile credit card receipts against Amex transactions."
        actions={
          <>
            <label className={`${styles.btn} ${styles.btnSecondary} ${styles.uploadLabel}`} style={{ cursor: uploading ? 'wait' : 'pointer' }}>
              <span>⬆</span>{uploading ? 'Uploading…' : 'Upload receipt'}
              <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; handleUpload(f); }} />
            </label>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => { setForm(EMPTY_FORM); setShowManual(true); }}>
              <span>＋</span> Add receipt
            </button>
          </>
        }
      />

      <SummaryTiles tiles={tiles} />

      <div className={styles.tableWrapper}>
        <div className={styles.tableToolbar}>
          <div className={styles.tableFilters}>
            {STATUS_TABS.map((tab) => (
              <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
                className={`${styles.btn} ${statusFilter === tab.key ? styles.btnPrimary : styles.btnGhost}`} style={{ padding: '5px 12px', fontSize: 12 }}>
                {tab.label}
              </button>
            ))}
          </div>
          <div className={styles.tableFilters}>
            {selectedIds.size > 0 && (
              <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ padding: '5px 12px', fontSize: 12 }} onClick={createReport}>
                Create report ({selectedIds.size})
              </button>
            )}
            <input className={styles.formInput} style={{ width: 220 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendor, GL, notes…" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Mine only
            </label>
          </div>
        </div>

        {error ? (
          <div className={styles.emptyState} style={{ color: 'var(--color-danger)' }}>{error}</div>
        ) : loading ? (
          <div className={styles.emptyState}>Loading receipts…</div>
        ) : receipts.length === 0 ? (
          <EmptyState icon="🧾" title="No receipts yet" message="Upload a receipt image/PDF or add one manually to get started." />
        ) : (
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <th>Receipt</th><th>Date</th><th>Vendor</th><th className={styles.right}>Amount</th>
                <th>GL account</th><th>Location</th><th>Card</th><th>Status</th><th>Report</th><th />
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} onClick={() => setSelected(r)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(r.id)} disabled={!!r.report_id} onChange={() => toggleSelect(r.id)} />
                  </td>
                  <td>{r.image_path ? <span title="Has file">🧾</span> : <span style={{ opacity: 0.3 }}>○</span>}</td>
                  <td>{fmtDate(r.date)}</td>
                  <td style={{ fontWeight: 500 }}>{r.vendor || <span style={{ color: 'var(--color-text-subtle)' }}>Unknown</span>}</td>
                  <td className={`${styles.right} ${styles.money}`}>{money(r.amount)}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{r.gl_account || '—'}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{r.location || '—'}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{r.card_last4 ? `•••• ${r.card_last4}` : '—'}</td>
                  <td><StatusBadge status={r.match_status} /></td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{r.report_id ? '✓' : '—'}</td>
                  <td className={styles.right}>
                    <button title="Delete" className={styles.iconBtn} onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showManual && (
        <ManualEntryModal form={form} setForm={setForm} saving={saving} onSave={handleManualSave} onClose={() => setShowManual(false)} />
      )}
      {selected && (
        <ReceiptDrawer
          receipt={selected}
          onClose={() => setSelected(null)}
          onPatch={handlePatch}
          onDelete={handleDelete}
          onSaved={(u) => { setSelected(u); load(); onChanged?.(); }}
          flash={flash}
        />
      )}
    </>
  );
}

function ManualEntryModal({ form, setForm, saving, onSave, onClose }) {
  const field = (label, key, props = {}) => (
    <div className={styles.formGroup}>
      <label className={styles.formLabel}>{label}</label>
      <input className={styles.formInput} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...props} />
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
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save receipt'}</button>
        </div>
      </div>
    </Backdrop>
  );
}

function ReceiptDrawer({ receipt, onClose, onPatch, onDelete, onSaved, flash }) {
  const [draft, setDraft] = useState(receipt);
  const [savingField, setSavingField] = useState(false);
  useEffect(() => { setDraft(receipt); }, [receipt]);

  const isPdf = (receipt.image_path || '').toLowerCase().endsWith('.pdf');
  const fileUrl = receipt.image_path ? apiUrl(`/api/receipts/${receipt.id}/file`) : null;

  const saveFields = async () => {
    try {
      setSavingField(true);
      const updated = await onPatch(receipt.id, {
        vendor: draft.vendor, amount: parseFloat(draft.amount) || 0, date: draft.date,
        gl_account: draft.gl_account, location: draft.location, card_last4: draft.card_last4,
        notes: draft.notes, match_status: draft.match_status,
      });
      flash('Saved', 'success');
      onSaved(updated);
    } catch (e) {
      flash(e.message, 'error');
    } finally {
      setSavingField(false);
    }
  };

  const field = (label, key, props = {}) => (
    <div className={styles.formGroup}>
      <label className={styles.formLabel}>{label}</label>
      <input className={styles.formInput} value={draft[key] ?? ''} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} {...props} />
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
                <select className={styles.formSelect} value={draft.match_status} onChange={(e) => setDraft({ ...draft, match_status: e.target.value })}>
                  <option value="unmatched">Unmatched</option>
                  <option value="matched">Matched</option>
                  <option value="disputed">Disputed</option>
                </select>
              </div>
              {field('Notes', 'notes')}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveFields} disabled={savingField}>{savingField ? 'Saving…' : 'Save'}</button>
                <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => onDelete(receipt.id)}>Delete</button>
              </div>
            </div>
            <div>
              <div className={styles.amexCard}>
                <div className={styles.amexLabel}>Match status</div>
                <StatusBadge status={receipt.match_status} />
                {receipt.amex_txn_id ? <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>Amex txn: {receipt.amex_txn_id}</div> : null}
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
