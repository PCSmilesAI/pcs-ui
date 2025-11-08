import React, { useEffect, useState, useMemo } from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';
import ACHBadge from '../ui/ach/ACHBadge';
import { fetchInvoiceQueue } from '../lib/fetchQueue';
import { normalizeVendorName, getDisplayVendorName, vendorNamesMatch } from '../lib/vendorUtils';
import { notifyAchUpdate } from '../ui/ach/achEventBus';
import { formatStatusForDisplay } from '../../lib/invoices/stateMachine';

export default function VendorDetailPage({ vendor, onBack, onRowClick }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [achInfo, setAchInfo] = useState({ ok: false, ach_status: 'missing', bank: null, address: null });
  
  // Basic vendor directory (extend with real data as available)
  const VENDOR_INFO = {
    'Henry Schein': {
      name: 'Henry Schein, Inc.',
      phone: '1-800-472-4346',
      address: '135 Duryea Road, Melville, NY 11747',
      primaryContact: 'Accounts Receivable',
    },
  };

  // Track refresh counter to force re-fetch
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Helper function to get user email from localStorage/cookie
  function getUserEmail() {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('loggedInUser') : null;
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed?.email || '';
      }
    } catch (e) {
      console.error('Failed to get user email:', e);
    }
    return '';
  }

  useEffect(() => {
    if (!vendor) return;
    const load = async () => {
      try {
        setLoading(true);
        console.log('🔄 VendorDetailPage: Fetching invoices for vendor:', vendor);

        // Use the same data source as VendorsPage for consistency
        const userEmail = getUserEmail();
        const invoices = await fetchInvoiceQueue({ limit: 5000, email: userEmail });
        console.log('📊 VendorDetailPage: API returned', invoices.length, 'invoices');

        // Normalize the vendor name from the URL parameter
        const normalizedVendor = normalizeVendorName(vendor);
        console.log('🔍 VendorDetailPage: Looking for normalized vendor:', normalizedVendor);

        // Filter for this vendor using normalized comparison
        const filtered = invoices.filter((inv) => {
          const invVendorName = inv.vendor_name || inv.vendor || 'Unknown';
          const normalizedInvVendor = normalizeVendorName(invVendorName);
          const matches = normalizedInvVendor === normalizedVendor;
          return matches;
        });

        console.log('✅ VendorDetailPage: Found', filtered.length, 'invoices for vendor');

        const mapped = filtered.map((invoice) => {
          // Parse amount - handle both cents and dollar formats
          let amountNum = 0;
          const amountStr = String(invoice.amount_cents ?? invoice.invoice_total ?? invoice.total ?? '0');
          if (amountStr.includes('.')) {
            // Dollar format
            amountNum = parseFloat(amountStr);
          } else {
            // Cents format - convert to dollars
            amountNum = parseInt(amountStr, 10) / 100;
          }

          return {
            invoice: invoice.invoice_number || 'Unknown',
            invoice_number: invoice.invoice_number,
            vendor: invoice.vendor_name || invoice.vendor || 'Unknown',
            amount: `$${amountNum.toFixed(2)}`,
            office: invoice.office_id || invoice.office_location || invoice.clinic_id || 'Unknown',
            dueDate: invoice.due_date
              ? new Date(invoice.due_date).toLocaleDateString('en-US', {
                  month: 'numeric',
                  day: 'numeric',
                  year: '2-digit',
                })
              : (invoice.invoice_date
                  ? new Date(invoice.invoice_date).toLocaleDateString('en-US', {
                      month: 'numeric',
                      day: 'numeric',
                      year: '2-digit',
                    })
                  : 'N/A'),
            invoiceDate: invoice.invoice_date
              ? new Date(invoice.invoice_date).toLocaleDateString('en-US', {
                  month: 'numeric',
                  day: 'numeric',
                  year: '2-digit',
                })
              : 'N/A',
            status: formatStatusForDisplay(invoice.status),
            // extras for detail
            invoice_date: invoice.invoice_date,
            due_date: invoice.due_date,
            json_path: invoice.json_path,
            pdf_path: invoice.pdf_path,
            timestamp: invoice.timestamp,
            assigned_to: invoice.assigned_to,
            approved: invoice.approved,
            amountNum: amountNum,  // Store numeric amount for metrics calculation
          };
        });
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
  }, [vendor, refreshCounter]); // Re-fetch when vendor or refreshCounter changes

  // Load vendor ACH info for banner/details panel
  useEffect(() => {
    let active = true;
    async function fetchAch() {
      try {
        const resp = await fetch(`/api/vendors/ach-info?vendor=${encodeURIComponent(vendor)}&t=${Date.now()}`, { cache: 'no-store' });
        if (!resp.ok) throw new Error(`Failed to load ACH info: ${resp.status}`);
        const data = await resp.json();
        if (active) setAchInfo(data || {});
      } catch (_) {
        if (active) setAchInfo({ ok: false, ach_status: 'missing', bank: null, address: null });
      }
    }
    if (vendor) fetchAch();
    return () => { active = false; };
  }, [vendor]);

  // Metrics - calculate based on invoice status
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const parsed = useMemo(() =>
    rows.map((r) => ({
      amount: r.amountNum || 0,
      isPaid: r.status === 'paid',
      date: (() => {
        const parts = String(r.dueDate).split('/');
        if (parts.length === 3) {
          const m = parseInt(parts[0], 10) - 1;
          const d = parseInt(parts[1], 10);
          const yy = parts[2].length === 2 ? 2000 + parseInt(parts[2], 10) : parseInt(parts[2], 10);
          return new Date(yy, m, d);
        }
        const dt = new Date(r.dueDate);
        return isNaN(dt.getTime()) ? new Date() : dt;
      })(),
    })),
    [rows]
  );

  // Total metrics (all invoices)
  const totalCount = parsed.length;
  const totalAmount = parsed.reduce((s, x) => s + x.amount, 0);

  // Outstanding metrics (unpaid invoices only)
  const outstandingCount = parsed.filter(x => !x.isPaid).length;
  const outstandingAmount = parsed.filter(x => !x.isPaid).reduce((s, x) => s + x.amount, 0);

  // YTD metrics (all invoices)
  const ytdItems = parsed.filter((x) => x.date.getFullYear() === currentYear);
  const ytdCount = ytdItems.length;
  const ytdAmount = ytdItems.reduce((s, x) => s + x.amount, 0);

  // MTD metrics (all invoices)
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
      { key: 'invoiceDate', label: 'Invoice Date' },
      { key: 'dueDate', label: 'Due Date' },
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
  const achPanel = { border: '1px solid #357ab2', borderRadius: 12, padding: 16, background: '#fff', marginBottom: 16 };
  const achGrid = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 };

  // Get display-friendly vendor name for the header
  const displayVendor = getDisplayVendorName(vendor);

  return (
    <div style={wrapperStyle}>
      <div style={headerStyle}>
        <button style={backBtn} onClick={onBack}>&larr; Back</button>
        <div style={titleStyle}>{displayVendor}</div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setRefreshCounter(c => c + 1)}
          disabled={loading}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: '1px solid #357ab2',
            color: loading ? '#999' : '#fff',
            background: loading ? '#e0e0e0' : '#357ab2',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 500,
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>
      {loading && <div style={{ color: '#357ab2', marginBottom: 12 }}>Loading invoices…</div>}
      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>Error: {error}</div>}

      {/* KPI cards: counts */}
      <div style={cardsGrid}>
        <div style={card}><div style={cardLabel}>Total Invoices</div><div style={cardValue}>{totalCount}</div></div>
        <div style={card}><div style={cardLabel}>Outstanding Invoices</div><div style={cardValue}>{outstandingCount}</div></div>
        <div style={card}><div style={cardLabel}>Paid Invoices</div><div style={cardValue}>{totalCount - outstandingCount}</div></div>
      </div>

      {/* KPI cards: dollars */}
      <div style={cardsGrid}>
        <div style={card}><div style={cardLabel}>Total Amount ($)</div><div style={cardValue}>{fmt(totalAmount)}</div></div>
        <div style={card}><div style={cardLabel}>Outstanding Amount ($)</div><div style={{...cardValue, color: outstandingAmount > 0 ? '#dc2626' : '#357ab2'}}>{fmt(outstandingAmount)}</div></div>
        <div style={card}><div style={cardLabel}>Paid Amount ($)</div><div style={cardValue}>{fmt(totalAmount - outstandingAmount)}</div></div>
      </div>

      {/* Vendor info */}
      <h3 style={{ ...titleStyle, fontSize: 18, margin: '12px 0' }}>Vendor Information</h3>
      <div style={infoGrid}>
        <div style={infoItem}><strong>Name:</strong><div>{(VENDOR_INFO[vendor] || {}).name || vendor}</div></div>
        <div style={infoItem}><strong>Phone:</strong><div>{(VENDOR_INFO[vendor] || {}).phone || 'N/A'}</div></div>
        <div style={infoItem}><strong>Mailing Address:</strong><div>{(VENDOR_INFO[vendor] || {}).address || 'N/A'}</div></div>
        <div style={infoItem}><strong>Primary Contact:</strong><div>{(VENDOR_INFO[vendor] || {}).primaryContact || 'N/A'}</div></div>
      </div>

      {/* ACH status and bank details */}
      <div style={achPanel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 600, color: '#357ab2', fontSize: 16 }}>ACH Enrollment</div>
          <ACHBadge status={achInfo?.ach_status} />
          <div style={{ flex: 1 }} />
          <button
            onClick={async () => {
              try {
                const resp = await fetch(`/api/vendors/ach-info?vendor=${encodeURIComponent(vendor)}&t=${Date.now()}`, { cache: 'no-store' });
                const data = await resp.json();
                setAchInfo(data || {});
                // Notify all other components that ACH status has been updated
                notifyAchUpdate(vendor);
              } catch (refreshError) {
                console.error('Failed to refresh ACH status for vendor:', vendor, refreshError);
              }
            }}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #357ab2', color: '#357ab2', background: '#fff', cursor: 'pointer' }}
          >
            Refresh ACH Status
          </button>
          <button
            onClick={async () => {
              const email = prompt('Enter vendor email to send onboarding link');
              if (!email) return;
              try {
                const resp = await fetch('/api/vendors/email-onboard-link', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ vendor, email })
                });
                const data = await resp.json();
                const proxy = (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_EMAIL_PROXY_URL)
                  || (typeof window !== 'undefined' ? window.localStorage.getItem('EMAIL_PROXY_URL') : null);

                const tryProxySend = async (link) => {
                  if (!proxy || !link) return false;
                  try {
                    const p = await fetch(proxy, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: email, vendor, url: link }) });
                    const pj = await p.json().catch(() => ({}));
                    if (p.ok && (pj?.ok || pj?.sent)) {
                      alert('Onboarding email sent.');
                      return true;
                    }
                  } catch (proxyError) {
                    console.error('Proxy email send failed:', proxyError);
                  }
                  return false;
                };

                if (resp.ok && data?.ok) {
                  if (data.sent) { alert('Onboarding email sent.'); return; }
                  // ok but not sent (server returned link). Try proxy if available
                  const link = data?.url || '';
                  const sentViaProxy = await tryProxySend(link);
                  if (!sentViaProxy) {
                    alert(`Email not configured on server. Copy this link and email manually: ${link || 'unavailable'}`);
                  }
                } else {
                  // Server failed; attempt to create onboarding link and send via proxy
                  let link = data?.url;
                  if (!link) {
                    try {
                      const mk = await fetch('/api/vendors/onboard-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vendor }) });
                      const mkd = await mk.json();
                      if (mkd?.ok && mkd?.url) link = mkd.url;
                    } catch (linkError) {
                      console.error('Failed to create onboarding link for vendor:', vendor, linkError);
                    }
                  }
                  const sentViaProxy = await tryProxySend(link);
                  if (!sentViaProxy) alert(`Failed to send onboarding email: ${data?.error || 'Unknown error'}`);
                }
              } catch (e) {
                alert('Failed to send onboarding email');
              }
            }}
            style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 8, border: '1px solid #357ab2', color: '#fff', background: '#357ab2', cursor: 'pointer' }}
          >
            Email ACH Onboarding
          </button>
        </div>
        <div style={achGrid}>
          <div style={infoItem}>
            <strong>Bank</strong>
            <div>{achInfo?.bank?.bank_name || 'N/A'}</div>
          </div>
          <div style={infoItem}>
            <strong>Account</strong>
            <div>{achInfo?.bank?.account_masked || 'N/A'}</div>
          </div>
          <div style={infoItem}>
            <strong>Routing</strong>
            <div>{achInfo?.bank?.routing_masked || 'N/A'}</div>
          </div>
          <div style={infoItem}>
            <strong>Address</strong>
            <div>{achInfo?.address || 'N/A'}</div>
          </div>
        </div>
      </div>

      <InvoiceTable columns={columns} rows={rows} onRowClick={onRowClick} />
    </div>
  );
}
