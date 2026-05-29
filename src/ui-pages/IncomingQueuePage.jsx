import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function getParsingBadge(status) {
  const map = {
    failed:  { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5', label: 'Failed' },
    partial: { bg: '#fef3c7', color: '#92400e', border: '#fde68a', label: 'Partial' },
    success: { bg: '#d1fae5', color: '#065f46', border: '#a7f3d0', label: 'OK' },
    pending: { bg: '#f3f4f6', color: '#6b7280', border: '#d1d5db', label: 'Pending' },
  };
  const m = map[status] || map.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 10px', borderRadius: '9999px',
      fontSize: '12px', fontWeight: 600,
      backgroundColor: m.bg, color: m.color,
      border: `1px solid ${m.border}`,
    }}>
      {m.label}
    </span>
  );
}

function getRowTint(row) {
  if (row.parsing_status === 'failed') return '#fef2f2';
  if (row.parsing_status === 'partial' || row.vendor === 'Unknown') return '#fffbeb';
  return 'transparent';
}

export default function IncomingQueuePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get('from') || '/ForMePage';

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchIncoming = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/invoices/visible?status=incoming&limit=5000&scope=all', {
        cache: 'no-store',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load incoming invoices');
      const data = await res.json();
      const list = Array.isArray(data.invoices) ? data.invoices : [];
      const incoming = list
        .filter(inv => {
          if ((inv.status || '').toLowerCase() !== 'incoming' || inv.deleted) return false;
          const ps = (inv.parsing_status || '').toLowerCase();
          const vn = (inv.vendor_name || '').toLowerCase();
          return ps === 'failed' || ps === 'partial' || vn === 'unknown' || vn === '';
        })
        .map(inv => ({
          id: inv.id,
          invoice_number: inv.invoice_number || '—',
          vendor: inv.vendor_name || 'Unknown',
          amount: inv.amount_cents ? (inv.amount_cents / 100).toFixed(2) : '0.00',
          date_received: inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '—',
          parsing_status: inv.parsing_status || 'pending',
          parsing_error: inv.parsing_error || null,
          source_pdf: inv.source_file
            ? inv.source_file.split('/').pop().replace(/\.pdf$/i, '').substring(0, 40)
            : '—',
        }));
      setInvoices(incoming);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIncoming(); }, [fetchIncoming]);

  const handleRowClick = (inv) => {
    const url = `/InvoiceDetailPage?invoice=${encodeURIComponent(inv.id)}&from=${encodeURIComponent('/IncomingQueuePage?from=' + encodeURIComponent(fromUrl))}`;
    router.push(url);
  };

  const columns = [
    { key: 'invoice_number', label: 'Invoice #', width: '14%' },
    {
      key: 'vendor', label: 'Vendor', width: '20%',
      render: (row) => (
        <span style={{ color: row.vendor === 'Unknown' ? '#dc2626' : 'inherit', fontWeight: row.vendor === 'Unknown' ? 600 : 400 }}>
          {row.vendor === 'Unknown' ? '⚠ Unknown' : row.vendor}
        </span>
      ),
    },
    {
      key: 'amount', label: 'Amount', width: '12%',
      render: (row) => `$${row.amount}`,
    },
    { key: 'date_received', label: 'Received', width: '12%' },
    {
      key: 'parsing_status', label: 'Parsing', width: '12%',
      render: (row) => getParsingBadge(row.parsing_status),
    },
    { key: 'source_pdf', label: 'Source PDF', width: '22%' },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button
          onClick={() => router.push(fromUrl)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '36px', height: '36px', borderRadius: '50%',
            border: '1px solid #d1d5db', backgroundColor: '#ffffff',
            cursor: 'pointer', fontSize: '16px', color: '#374151',
            transition: 'background-color 0.15s',
          }}
          title="Back"
        >
          <i className="fas fa-arrow-left"></i>
        </button>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: 0 }}>
            Incoming Queue
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0' }}>
            {loading ? 'Loading...' : `${invoices.length} invoice${invoices.length !== 1 ? 's' : ''} need attention`}
          </p>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', marginBottom: '16px', borderRadius: '12px', backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}>
          {error}
        </div>
      )}

      {/* Table */}
      {!loading && invoices.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#6b7280' }}>
          <i className="fas fa-check-circle" style={{ fontSize: '48px', color: '#34d399', marginBottom: '16px', display: 'block' }}></i>
          <p style={{ fontSize: '18px', fontWeight: 600, color: '#111827' }}>All clear!</p>
          <p>No invoices are stuck in the incoming queue.</p>
        </div>
      )}

      {(loading || invoices.length > 0) && (
        <div style={{ borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden', backgroundColor: '#ffffff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                {columns.map(col => (
                  <th key={col.key} style={{
                    textAlign: 'left', padding: '12px 16px',
                    fontSize: '12px', fontWeight: 600, color: '#6b7280',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid #e5e7eb',
                    width: col.width,
                  }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} style={{ textAlign: 'center', padding: '32px', color: '#9ca3af' }}>
                    <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>
                    Loading incoming invoices...
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => handleRowClick(inv)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: getRowTint(inv),
                      transition: 'background-color 0.15s',
                      borderBottom: '1px solid #f3f4f6',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f0f4ff'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = getRowTint(inv); }}
                  >
                    {columns.map(col => (
                      <td key={col.key} style={{ padding: '12px 16px', fontSize: '14px', color: '#374151' }}>
                        {col.render ? col.render(inv) : inv[col.key]}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
