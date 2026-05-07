'use client';
import React, { useState, useEffect, useCallback } from 'react';

export default function QboExportPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [exporting, setExporting] = useState(false);
  const [results, setResults] = useState(null);

  const loadOrphaned = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/invoices/orphaned-bills');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load');
      setInvoices(data.invoices || []);
    } catch (err) {
      setError(err.message);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrphaned(); }, [loadOrphaned]);

  const allSelected = invoices.length > 0 && selectedIds.size === invoices.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(invoices.map((inv) => inv.id)));
    }
  };

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    if (selectedIds.size === 0) return;
    setExporting(true);
    setResults(null);
    try {
      const res = await fetch('/api/invoices/retry-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: [...selectedIds] }),
      });
      const data = await res.json();
      setResults(data);
      if (data.ok) {
        const succeededIds = new Set(
          (data.results || []).filter((r) => r.ok).map((r) => r.id)
        );
        setInvoices((prev) => prev.filter((inv) => !succeededIds.has(inv.id)));
        setSelectedIds(new Set());
      }
    } catch (err) {
      setResults({ ok: false, message: err.message || 'Export request failed' });
    } finally {
      setExporting(false);
    }
  };

  const cardStyle = {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  };

  const btnPrimary = {
    padding: '10px 20px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: 500,
    border: '1px solid #357ab2',
    backgroundColor: '#357ab2',
    color: '#ffffff',
    cursor: 'pointer',
  };

  const btnSecondary = {
    padding: '10px 20px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: 500,
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#374151',
    cursor: 'pointer',
  };

  return (
    <div style={{ padding: '24px', maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937', marginBottom: '4px' }}>
          QBO Export Queue
        </h1>
        <p style={{ color: '#6b7280', fontSize: '15px' }}>
          Approved invoices that haven&rsquo;t been exported to QuickBooks yet.
          Select invoices and click export to create QBO bills.
        </p>
      </div>

      {/* Results banner */}
      {results && (
        <div style={{
          ...cardStyle,
          marginBottom: '16px',
          borderColor: results.ok && results.failed === 0 ? '#a7f3d0' : '#fde68a',
          backgroundColor: results.ok && results.failed === 0 ? '#ecfdf5' : '#fffbeb',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: results.results ? '12px' : '0' }}>
            <i
              className={results.ok && results.failed === 0 ? 'fas fa-check-circle' : 'fas fa-exclamation-triangle'}
              style={{ fontSize: '18px', color: results.ok && results.failed === 0 ? '#059669' : '#d97706' }}
            ></i>
            <span style={{ fontWeight: 600, fontSize: '15px', color: '#1f2937' }}>
              {results.ok
                ? `${results.succeeded} bill${results.succeeded !== 1 ? 's' : ''} created${results.failed > 0 ? `, ${results.failed} failed` : ''}`
                : results.message || 'Export failed'}
            </span>
            <button
              onClick={() => setResults(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '18px' }}
            >
              &times;
            </button>
          </div>
          {results.results && results.results.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 500 }}>Invoice #</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 500 }}>Result</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 500 }}>QBO Bill ID</th>
                </tr>
              </thead>
              <tbody>
                {results.results.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '6px 8px', color: '#1f2937' }}>{r.invoice_number}</td>
                    <td style={{ padding: '6px 8px' }}>
                      {r.ok ? (
                        <span style={{ color: '#059669', fontWeight: 500 }}>
                          <i className="fas fa-check" style={{ marginRight: '4px' }}></i>Created
                        </span>
                      ) : (
                        <span style={{ color: '#dc2626', fontWeight: 500 }}>
                          <i className="fas fa-times" style={{ marginRight: '4px' }}></i>{r.error || 'Failed'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '6px 8px', color: '#4b5563' }}>
                      {r.billId ? (
                        <a
                          href={`https://app.qbo.intuit.com/app/bill?txnId=${r.billId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#357ab2', textDecoration: 'none' }}
                        >
                          {r.billId}
                        </a>
                      ) : '\u2014'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div style={cardStyle}>
        {loading ? (
          <p style={{ color: '#6b7280', textAlign: 'center', padding: '40px 0' }}>Loading invoices...</p>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ color: '#dc2626', marginBottom: '12px' }}>{error}</p>
            <button onClick={loadOrphaned} style={btnSecondary}>Retry</button>
          </div>
        ) : invoices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <i className="fas fa-check-circle" style={{ fontSize: '48px', color: '#059669', marginBottom: '16px', display: 'block' }}></i>
            <p style={{ fontSize: '18px', fontWeight: 600, color: '#1f2937', marginBottom: '4px' }}>All caught up!</p>
            <p style={{ color: '#6b7280' }}>Every approved invoice has been exported to QuickBooks.</p>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '16px', flexWrap: 'wrap', gap: '12px',
            }}>
              <span style={{ fontSize: '14px', color: '#6b7280' }}>
                {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} pending export
                {selectedIds.size > 0 && ` \u2022 ${selectedIds.size} selected`}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={loadOrphaned} style={btnSecondary} disabled={exporting}>
                  <i className="fas fa-sync-alt" style={{ marginRight: '6px' }}></i>Refresh
                </button>
                <button
                  onClick={handleExport}
                  disabled={selectedIds.size === 0 || exporting}
                  style={{
                    ...btnPrimary,
                    opacity: selectedIds.size === 0 || exporting ? 0.5 : 1,
                    cursor: selectedIds.size === 0 || exporting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {exporting ? (
                    <>Exporting...</>
                  ) : (
                    <><i className="fas fa-file-export" style={{ marginRight: '6px' }}></i>Export {selectedIds.size > 0 ? `${selectedIds.size} ` : ''}to QuickBooks</>
                  )}
                </button>
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ padding: '10px 8px', width: '36px' }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                    </th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Invoice #</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Vendor</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Amount</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Location</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Approved</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        backgroundColor: selectedIds.has(inv.id) ? '#eff6ff' : 'transparent',
                        transition: 'background-color 0.15s',
                      }}
                    >
                      <td style={{ padding: '10px 8px' }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(inv.id)}
                          onChange={() => toggleOne(inv.id)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: '14px', color: '#1f2937', fontWeight: 500 }}>{inv.invoice_number}</td>
                      <td style={{ padding: '10px 8px', fontSize: '14px', color: '#4b5563' }}>{inv.vendor_name}</td>
                      <td style={{ padding: '10px 8px', fontSize: '14px', color: '#1f2937', textAlign: 'right' }}>
                        {inv.amount ? `$${Number(inv.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '\u2014'}
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: '14px', color: '#4b5563' }}>{inv.office_location || '\u2014'}</td>
                      <td style={{ padding: '10px 8px', fontSize: '13px', color: '#6b7280' }}>
                        {inv.approved_at ? new Date(inv.approved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
