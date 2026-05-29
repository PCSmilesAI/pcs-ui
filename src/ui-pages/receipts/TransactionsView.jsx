/**
 * Transactions view — Amex feed (statement import) + reconcile against receipts.
 */
'use client';
import React, { useCallback, useEffect, useState } from 'react';
import {
  styles, money, fmtDate, apiUrl, apiFetch, StatusBadge, SummaryTiles, EmptyState, PageHeader,
} from './shared';

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'unmatched', label: 'No receipt' },
  { key: 'matched', label: 'Matched' },
];

export default function TransactionsView({ flash, onChanged }) {
  const [txns, setTxns] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [matching, setMatching] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch(
        apiUrl('/api/receipts/transactions', {
          status: statusFilter === 'all' ? '' : statusFilter,
          q: search.trim(),
        })
      );
      setTxns(Array.isArray(data.transactions) ? data.transactions : []);
      setStats(data.stats || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleImport = async (file) => {
    if (!file) return;
    try {
      setImporting(true);
      const fd = new FormData();
      fd.append('file', file);
      const data = await apiFetch(apiUrl('/api/receipts/transactions'), { method: 'POST', body: fd });
      flash(`Imported ${data.inserted} transactions (${data.skipped} duplicates skipped)`, 'success');
      load();
    } catch (e) {
      flash(e.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const runMatch = async () => {
    try {
      setMatching(true);
      const data = await apiFetch(apiUrl('/api/receipts/transactions/match'), { method: 'POST' });
      flash(`Reconciled: ${data.matched} of ${data.scanned} unmatched receipts matched`, 'success');
      load();
      onChanged?.();
    } catch (e) {
      flash(e.message, 'error');
    } finally {
      setMatching(false);
    }
  };

  const tiles = [
    { label: 'Total transactions', value: stats ? stats.total_count : '—' },
    { label: 'Total amount', value: stats ? money(stats.total_amount) : '—' },
    { label: 'Matched', value: stats ? stats.matched : '—', suffix: stats ? `${stats.match_pct}% of total` : '' },
    { label: 'No receipt', value: stats ? stats.unmatched : '—' },
  ];

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Amex charge feed (read-only). Import a statement, then reconcile against receipts."
        actions={
          <>
            <label className={`${styles.btn} ${styles.btnSecondary} ${styles.uploadLabel}`} style={{ cursor: importing ? 'wait' : 'pointer' }}>
              <span>⬆</span>{importing ? 'Importing…' : 'Import statement (CSV/XLSX)'}
              <input type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} disabled={importing}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; handleImport(f); }} />
            </label>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={runMatch} disabled={matching}>
              {matching ? 'Matching…' : '⟳ Reconcile receipts'}
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
          <input className={styles.formInput} style={{ width: 220 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search merchant…" />
        </div>

        {error ? (
          <div className={styles.emptyState} style={{ color: 'var(--color-danger)' }}>{error}</div>
        ) : loading ? (
          <div className={styles.emptyState}>Loading transactions…</div>
        ) : txns.length === 0 ? (
          <EmptyState icon="💳" title="No transactions yet" message="Import an Amex statement (CSV or XLSX) to populate the feed, then reconcile against receipts." />
        ) : (
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Date</th><th>Merchant</th><th>Category</th><th>Card</th>
                <th>Cardholder</th><th className={styles.right}>Amount</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id}>
                  <td>{fmtDate(t.transaction_date)}</td>
                  <td style={{ fontWeight: 500 }}>{t.merchant_name || '—'}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{t.category || '—'}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{t.card_last4 ? `•••• ${t.card_last4}` : '—'}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{t.cardholder_name || '—'}</td>
                  <td className={`${styles.right} ${styles.money}`}>{money(t.amount)}</td>
                  <td><StatusBadge status={t.match_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
