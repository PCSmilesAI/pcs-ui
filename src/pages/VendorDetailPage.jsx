import React, { useEffect, useState, useMemo } from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';

export default function VendorDetailPage({ vendor, onBack, onRowClick }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!vendor) return;
    const load = async () => {
      try {
        setLoading(true);
        const resp = await fetch(`/invoice_queue.json?t=${Date.now()}`, {
          method: 'GET',
          headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
        });
        if (!resp.ok) throw new Error(`Failed to load invoices: ${resp.status}`);
        let data = await resp.json();
        try {
          const { applyOverrides } = await import('../utils/status_overrides');
          data = applyOverrides(data);
        } catch (_) {}
        const filtered = (data || []).filter((inv) => (inv.vendor || 'Unknown') === vendor);
        const mapped = filtered.map((invoice) => ({
          invoice: invoice.invoice_number || 'Unknown',
          invoice_number: invoice.invoice_number,
          vendor: invoice.vendor || 'Unknown',
          amount: `$${invoice.total || '0.00'}`,
          office: invoice.clinic_id || 'Unknown',
          dueDate: invoice.invoice_date
            ? new Date(invoice.invoice_date).toLocaleDateString('en-US', {
                month: 'numeric',
                day: 'numeric',
                year: '2-digit',
              })
            : 'N/A',
          status: invoice.status,
          // extras for detail
          invoice_date: invoice.invoice_date,
          json_path: invoice.json_path,
          pdf_path: invoice.pdf_path,
          timestamp: invoice.timestamp,
          assigned_to: invoice.assigned_to,
          approved: invoice.approved,
        }));
        setRows(mapped);
        setError('');
      } catch (e) {
        setError(e.message || 'Failed to load vendor invoices');
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [vendor]);

  const columns = useMemo(
    () => [
      { key: 'invoice', label: 'Invoice' },
      { key: 'amount', label: 'Amount', align: 'right' },
      { key: 'office', label: 'Office' },
      { key: 'dueDate', label: 'Invoice Date' },
      { key: 'status', label: 'Status' },
    ],
    []
  );

  const wrapperStyle = { padding: '24px' };
  const headerStyle = { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 };
  const backBtn = {
    padding: '8px 12px',
    border: '1px solid #357ab2',
    borderRadius: 6,
    color: '#357ab2',
    background: '#fff',
    cursor: 'pointer',
  };
  const titleStyle = { fontSize: 20, fontWeight: 600, color: '#357ab2' };

  return (
    <div style={wrapperStyle}>
      <div style={headerStyle}>
        <button style={backBtn} onClick={onBack}>&larr; Back</button>
        <div style={titleStyle}>{vendor}</div>
      </div>
      {loading && <div style={{ color: '#357ab2', marginBottom: 12 }}>Loading invoices…</div>}
      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>Error: {error}</div>}
      <InvoiceTable columns={columns} rows={rows} onRowClick={onRowClick} />
    </div>
  );
}


