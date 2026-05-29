/**
 * Expense Reports view — bundles of receipts moving through
 * submitted → approved → closed, with a detail drawer.
 */
'use client';
import React, { useCallback, useEffect, useState } from 'react';
import {
  styles, money, fmtDate, apiUrl, apiFetch, StatusBadge, SummaryTiles, EmptyState, PageHeader, Backdrop,
} from './shared';

const TABS = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'approved', label: 'Approved' },
  { key: 'closed', label: 'Closed' },
];

export default function ReportsView({ flash, onChanged }) {
  const [reports, setReports] = useState([]);
  const [counts, setCounts] = useState({ submitted: 0, approved: 0, closed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('submitted');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch(apiUrl('/api/receipts/reports', { status: tab }));
      setReports(Array.isArray(data.reports) ? data.reports : []);
      setCounts(data.counts || { submitted: 0, approved: 0, closed: 0 });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const tiles = [
    { label: 'Submitted', value: counts.submitted },
    { label: 'Approved', value: counts.approved },
    { label: 'Closed', value: counts.closed },
  ];

  return (
    <>
      <PageHeader title="Expense Reports" subtitle="Receipts bundled and submitted together for approval." />
      <SummaryTiles tiles={tiles} />

      <div className={styles.tableWrapper}>
        <div className={styles.tableToolbar}>
          <div className={styles.tableFilters}>
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`${styles.btn} ${tab === t.key ? styles.btnPrimary : styles.btnGhost}`} style={{ padding: '5px 12px', fontSize: 12 }}>
                {t.label} ({counts[t.key] ?? 0})
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className={styles.emptyState} style={{ color: 'var(--color-danger)' }}>{error}</div>
        ) : loading ? (
          <div className={styles.emptyState}>Loading reports…</div>
        ) : reports.length === 0 ? (
          <EmptyState icon="📑" title="No reports here" message="Create a report by selecting receipts on the Business Expenses page." />
        ) : (
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Report</th><th>Submitted by</th><th>Submitted</th>
                <th className={styles.right}>Receipts</th><th className={styles.right}>Amount</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} onClick={() => setOpenId(r.id)}>
                  <td style={{ fontWeight: 600 }}>Report #{r.display_number}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{r.submitted_by}</td>
                  <td>{fmtDate(r.submitted_at)}</td>
                  <td className={styles.right}>{r.expense_count}</td>
                  <td className={`${styles.right} ${styles.money}`}>{money(r.total_amount)}</td>
                  <td><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {openId && (
        <ReportDrawer
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => { load(); onChanged?.(); }}
          flash={flash}
        />
      )}
    </>
  );
}

function ReportDrawer({ id, onClose, onChanged, flash }) {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(apiUrl(`/api/receipts/reports/${id}`));
      setReport(data.report);
    } catch (e) {
      flash(e.message, 'error');
    }
  }, [id, flash]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (status) => {
    try {
      setBusy(true);
      const data = await apiFetch(apiUrl(`/api/receipts/reports/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setReport(data.report);
      flash(`Report ${status}`, 'success');
      onChanged?.();
    } catch (e) {
      flash(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportQbo = async () => {
    try {
      setBusy(true);
      const data = await apiFetch(apiUrl(`/api/receipts/reports/${id}/export`), { method: 'POST' });
      setReport(data.report);
      flash(`Exported to QuickBooks (Purchase ${data.purchaseId})`, 'success');
      onChanged?.();
    } catch (e) {
      flash(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Backdrop onClose={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>{report ? `Report #${report.display_number}` : 'Report'}</div>
          <button className={styles.modalClose} onClick={onClose}>×</button>
        </div>
        <div className={styles.modalBody}>
          {!report ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : (
            <>
              <div className={styles.amexCard} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Submitted by {report.submitted_by} · {fmtDate(report.submitted_at)}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-navy)', marginTop: 4 }}>
                    {money(report.total_amount)} · {report.expense_count} receipts
                  </div>
                </div>
                <StatusBadge status={report.status} />
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {report.status === 'submitted' && (
                  <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setStatus('approved')} disabled={busy}>Approve</button>
                )}
                {report.status === 'approved' && (
                  <>
                    <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={exportQbo} disabled={busy}>Export to QuickBooks</button>
                    <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setStatus('closed')} disabled={busy}>Close (no export)</button>
                  </>
                )}
                {report.status !== 'submitted' && report.status !== 'closed' && (
                  <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setStatus('submitted')} disabled={busy}>Reopen</button>
                )}
                {report.qbo_purchase_id && (
                  <span className={`${styles.badge} ${styles.badgeMatched}`}>QBO Purchase {report.qbo_purchase_id}</span>
                )}
                {report.qbo_export_error && !report.qbo_purchase_id && (
                  <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>Last export error: {report.qbo_export_error}</span>
                )}
              </div>

              <table className={styles.dataTable}>
                <thead>
                  <tr><th>Date</th><th>Vendor</th><th className={styles.right}>Amount</th><th>GL account</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {report.receipts.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtDate(r.date)}</td>
                      <td style={{ fontWeight: 500 }}>{r.vendor || '—'}</td>
                      <td className={`${styles.right} ${styles.money}`}>{money(r.amount)}</td>
                      <td style={{ color: 'var(--color-text-muted)' }}>{r.gl_account || '—'}</td>
                      <td><StatusBadge status={r.match_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </Backdrop>
  );
}
