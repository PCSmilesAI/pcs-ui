/**
 * Tasks view — a derived to-do list: what needs attention across the module.
 */
'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { styles, money, fmtDate, apiUrl, apiFetch, EmptyState, PageHeader } from './shared';

export default function TasksView({ flash, goTo }) {
  const [receipts, setReceipts] = useState([]);
  const [txns, setTxns] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [r, t, rep] = await Promise.all([
        apiFetch(apiUrl('/api/receipts')),
        apiFetch(apiUrl('/api/receipts/transactions', { status: 'unmatched' })),
        apiFetch(apiUrl('/api/receipts/reports', { status: 'submitted' })),
      ]);
      setReceipts(r.receipts || []);
      setTxns(t.transactions || []);
      setReports(rep.reports || []);
    } catch (e) {
      flash?.(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => {
    load();
  }, [load]);

  const unmatchedReceipts = receipts.filter((r) => r.match_status === 'unmatched');
  const missingGl = receipts.filter((r) => !r.gl_account || r.gl_account === '59000 Uncategorized Expense');

  const categories = [
    {
      icon: '🔗', title: 'Receipts awaiting an Amex match', urgent: true,
      items: unmatchedReceipts.slice(0, 8).map((r) => ({ key: r.id, title: r.vendor || 'Unknown vendor', meta: `${fmtDate(r.date)} · ${money(r.amount)}` })),
      count: unmatchedReceipts.length, action: () => goTo?.('expenses'),
    },
    {
      icon: '🏷️', title: 'Receipts needing a GL account', urgent: false,
      items: missingGl.slice(0, 8).map((r) => ({ key: r.id, title: r.vendor || 'Unknown vendor', meta: money(r.amount) })),
      count: missingGl.length, action: () => goTo?.('expenses'),
    },
    {
      icon: '💳', title: 'Card charges missing a receipt', urgent: false,
      items: txns.slice(0, 8).map((t) => ({ key: t.id, title: t.merchant_name || 'Unknown merchant', meta: `${fmtDate(t.transaction_date)} · ${money(t.amount)}` })),
      count: txns.length, action: () => goTo?.('transactions'),
    },
    {
      icon: '📑', title: 'Reports awaiting approval', urgent: true,
      items: reports.slice(0, 8).map((r) => ({ key: r.id, title: `Report #${r.display_number}`, meta: `${r.submitted_by} · ${money(r.total_amount)}` })),
      count: reports.length, action: () => goTo?.('reports'),
    },
  ].filter((c) => c.count > 0);

  return (
    <>
      <PageHeader title="Tasks" subtitle="What needs your attention across the receipts module." />
      {loading ? (
        <div className={styles.tableWrapper}><div className={styles.emptyState}>Loading tasks…</div></div>
      ) : categories.length === 0 ? (
        <div className={styles.tableWrapper}>
          <EmptyState icon="✅" title="All caught up" message="No unmatched receipts, missing GL codes, uncovered charges, or pending reports." />
        </div>
      ) : (
        categories.map((c) => (
          <div key={c.title} className={styles.tableWrapper} style={{ marginBottom: 16 }}>
            <div className={styles.tableToolbar}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, color: 'var(--color-navy)' }}>
                <span>{c.icon}</span>{c.title}
                <span className={`${styles.badge} ${c.urgent ? styles.badgeDisputed : styles.badgeUnmatched}`}>{c.count}</span>
              </div>
              <button className={`${styles.btn} ${styles.btnGhost}`} style={{ padding: '4px 10px', fontSize: 12 }} onClick={c.action}>Open</button>
            </div>
            <table className={styles.dataTable}>
              <tbody>
                {c.items.map((it) => (
                  <tr key={it.key} onClick={c.action}>
                    <td style={{ fontWeight: 500 }}>{it.title}</td>
                    <td className={styles.right} style={{ color: 'var(--color-text-muted)' }}>{it.meta}</td>
                  </tr>
                ))}
                {c.count > c.items.length && (
                  <tr><td colSpan={2} style={{ color: 'var(--color-text-subtle)', fontSize: 12 }}>+ {c.count - c.items.length} more…</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ))
      )}
    </>
  );
}
