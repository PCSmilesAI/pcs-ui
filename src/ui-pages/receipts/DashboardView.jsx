/**
 * Dashboard view — reconciliation overview across receipts, the Amex feed, and reports.
 */
'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { styles, money, apiUrl, apiFetch, SummaryTiles, PageHeader } from './shared';

export default function DashboardView({ flash }) {
  const [rStats, setRStats] = useState(null);
  const [tStats, setTStats] = useState(null);
  const [counts, setCounts] = useState(null);

  const load = useCallback(async () => {
    try {
      const [r, t, rep] = await Promise.all([
        apiFetch(apiUrl('/api/receipts')),
        apiFetch(apiUrl('/api/receipts/transactions')),
        apiFetch(apiUrl('/api/receipts/reports')),
      ]);
      setRStats(r.stats);
      setTStats(t.stats);
      setCounts(rep.counts);
    } catch (e) {
      flash?.(e.message, 'error');
    }
  }, [flash]);

  useEffect(() => {
    load();
  }, [load]);

  const receiptTiles = [
    { label: 'Total receipts', value: rStats ? rStats.total_count : '—' },
    { label: 'Receipt spend', value: rStats ? money(rStats.total_amount) : '—' },
    { label: 'Matched', value: rStats ? rStats.matched : '—', suffix: rStats ? `${rStats.match_pct}% reconciled` : '' },
    { label: 'Unmatched', value: rStats ? rStats.unmatched : '—' },
    { label: 'Disputed', value: rStats ? rStats.disputed : '—' },
  ];
  const feedTiles = [
    { label: 'Amex transactions', value: tStats ? tStats.total_count : '—' },
    { label: 'Card spend', value: tStats ? money(tStats.total_amount) : '—' },
    { label: 'Txns with receipt', value: tStats ? tStats.matched : '—', suffix: tStats ? `${tStats.match_pct}% covered` : '' },
    { label: 'Missing receipt', value: tStats ? tStats.unmatched : '—' },
  ];
  const reportTiles = [
    { label: 'Reports submitted', value: counts ? counts.submitted : '—' },
    { label: 'Approved', value: counts ? counts.approved : '—' },
    { label: 'Closed', value: counts ? counts.closed : '—' },
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Receipt reconciliation overview." />
      <div className={styles.pageTitle} style={{ fontSize: 15, marginBottom: 10 }}>Receipts</div>
      <SummaryTiles tiles={receiptTiles} />
      <div className={styles.pageTitle} style={{ fontSize: 15, margin: '8px 0 10px' }}>Amex feed</div>
      <SummaryTiles tiles={feedTiles} />
      <div className={styles.pageTitle} style={{ fontSize: 15, margin: '8px 0 10px' }}>Expense reports</div>
      <SummaryTiles tiles={reportTiles} />
    </>
  );
}
