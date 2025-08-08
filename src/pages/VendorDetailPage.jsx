import React, { useEffect, useState, useMemo } from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';

export default function VendorDetailPage({ vendor, onBack, onRowClick }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Basic vendor directory (extend with real data as available)
  const VENDOR_INFO = {
    'Henry Schein': {
      name: 'Henry Schein, Inc.',
      phone: '1-800-472-4346',
      address: '135 Duryea Road, Melville, NY 11747',
      primaryContact: 'Accounts Receivable',
    },
  };

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

  // Metrics
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const parsed = useMemo(() =>
    rows.map((r) => ({
      amount: parseFloat(String(r.amount).replace(/[^0-9.]/g, '')) || 0,
      date: (() => {
        const parts = String(r.dueDate).split('/');
        if (parts.length === 3) {
          const m = parseInt(parts[0], 10) - 1;
          const d = parseInt(parts[1], 10);
          const yy = parts[2].length === 2 ? 2000 + parseInt(parts[2], 10) : parseInt(parts[2], 10);
          return new Date(yy, m, d);
        }
        const dt = new Date(r.dueDate);
        return isNaN(dt.getTime()) ? now : dt;
      })(),
    })),
    [rows]
  );

  const totalCount = parsed.length;
  const totalAmount = parsed.reduce((s, x) => s + x.amount, 0);
  const ytdItems = parsed.filter((x) => x.date.getFullYear() === currentYear);
  const ytdCount = ytdItems.length;
  const ytdAmount = ytdItems.reduce((s, x) => s + x.amount, 0);
  const mtdItems = parsed.filter(
    (x) => x.date.getFullYear() === currentYear && x.date.getMonth() === currentMonth
  );
  const mtdCount = mtdItems.length;
  const mtdAmount = mtdItems.reduce((s, x) => s + x.amount, 0);
  const fmt = (n) => `$${(n || 0).toFixed(2)}`;

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
  const cardsGrid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 12,
    marginBottom: 16,
  };
  const card = { border: '1px solid #357ab2', borderRadius: 8, padding: 12, background: '#fff' };
  const cardLabel = { color: '#5a5a5a', fontSize: 12 };
  const cardValue = { color: '#357ab2', fontSize: 18, fontWeight: 600 };
  const infoGrid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 12,
    marginBottom: 16,
  };
  const infoItem = { border: '1px solid #357ab2', borderRadius: 8, padding: 12, background: '#fff' };

  return (
    <div style={wrapperStyle}>
      <div style={headerStyle}>
        <button style={backBtn} onClick={onBack}>&larr; Back</button>
        <div style={titleStyle}>{vendor}</div>
      </div>
      {loading && <div style={{ color: '#357ab2', marginBottom: 12 }}>Loading invoices…</div>}
      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>Error: {error}</div>}

      {/* KPI cards: counts */}
      <div style={cardsGrid}>
        <div style={card}><div style={cardLabel}>Total Invoices (Count)</div><div style={cardValue}>{totalCount}</div></div>
        <div style={card}><div style={cardLabel}>Year to Date (Count)</div><div style={cardValue}>{ytdCount}</div></div>
        <div style={card}><div style={cardLabel}>Month to Date (Count)</div><div style={cardValue}>{mtdCount}</div></div>
      </div>

      {/* KPI cards: dollars */}
      <div style={cardsGrid}>
        <div style={card}><div style={cardLabel}>Total Invoices ($)</div><div style={cardValue}>{fmt(totalAmount)}</div></div>
        <div style={card}><div style={cardLabel}>Year to Date ($)</div><div style={cardValue}>{fmt(ytdAmount)}</div></div>
        <div style={card}><div style={cardLabel}>Month to Date ($)</div><div style={cardValue}>{fmt(mtdAmount)}</div></div>
      </div>

      {/* Vendor info */}
      <h3 style={{ ...titleStyle, fontSize: 18, margin: '12px 0' }}>Vendor Information</h3>
      <div style={infoGrid}>
        <div style={infoItem}><strong>Name:</strong><div>{(VENDOR_INFO[vendor] || {}).name || vendor}</div></div>
        <div style={infoItem}><strong>Phone:</strong><div>{(VENDOR_INFO[vendor] || {}).phone || 'N/A'}</div></div>
        <div style={infoItem}><strong>Mailing Address:</strong><div>{(VENDOR_INFO[vendor] || {}).address || 'N/A'}</div></div>
        <div style={infoItem}><strong>Primary Contact:</strong><div>{(VENDOR_INFO[vendor] || {}).primaryContact || 'N/A'}</div></div>
      </div>
      <InvoiceTable columns={columns} rows={rows} onRowClick={onRowClick} />
    </div>
  );
}


