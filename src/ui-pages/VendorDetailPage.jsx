import React, { useEffect, useState, useMemo } from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';
import PaymentHistoryTable from '../components/PaymentHistoryTable.jsx';
import ACHBadge from '../ui/ach/ACHBadge';
import { fetchInvoiceQueue } from '../lib/fetchQueue';
import { normalizeVendorName, getDisplayVendorName, vendorNamesMatch, parseInvoiceAmount } from '../lib/vendorUtils';
import { notifyAchUpdate } from '../ui/ach/achEventBus';
import { formatStatusForDisplay } from '../../lib/invoices/stateMachine';

export default function VendorDetailPage({ vendor, onBack, onRowClick }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [achInfo, setAchInfo] = useState({ ok: false, ach_status: 'missing', bank: null, address: null });

  // Tab state for Invoices vs Payment History
  const [activeTab, setActiveTab] = useState('invoices');
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [paymentHistoryError, setPaymentHistoryError] = useState('');
  const [selectedPayment, setSelectedPayment] = useState(null);

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
          // Use helper to properly parse amount (handles cents vs dollars)
          const amountNum = parseInvoiceAmount(invoice);

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

  // Load payment history when Payment History tab is clicked
  useEffect(() => {
    if (activeTab !== 'payments' || !vendor) return;

    const load = async () => {
      try {
        setPaymentHistoryLoading(true);
        const resp = await fetch(`/api/stripe/payment-history?vendor=${encodeURIComponent(vendor)}&t=${Date.now()}`, {
          cache: 'no-store',
          credentials: 'include',
        });
        if (!resp.ok) throw new Error(`Failed to load payment history: ${resp.status}`);
        const data = await resp.json();
        if (data?.ok) {
          setPaymentHistory(data.paymentHistory || []);
          setPaymentHistoryError('');
        } else {
          setPaymentHistoryError(data?.error || 'Failed to load payment history');
          setPaymentHistory([]);
        }
      } catch (e) {
        setPaymentHistoryError(e.message || 'Failed to load payment history');
        setPaymentHistory([]);
      } finally {
        setPaymentHistoryLoading(false);
      }
    };

    load();
  }, [activeTab, vendor]);

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
    borderRadius: 20,
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
  const card = { border: '1px solid #357ab2', borderRadius: 16, padding: 12, background: '#fff' };
  const cardLabel = { color: '#5a5a5a', fontSize: 12 };
  const cardValue = { color: '#357ab2', fontSize: 18, fontWeight: 600 };
  const infoGrid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 12,
    marginBottom: 16,
  };
  const infoItem = { border: '1px solid #357ab2', borderRadius: 16, padding: 12, background: '#fff' };
  const achPanel = { border: '1px solid #357ab2', borderRadius: 20, padding: 16, background: '#fff', marginBottom: 16 };
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
            borderRadius: 20,
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
            style={{ padding: '6px 10px', borderRadius: 9999, border: '1px solid #357ab2', color: '#357ab2', background: '#fff', cursor: 'pointer' }}
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
            style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 9999, border: '1px solid #357ab2', color: '#fff', background: '#357ab2', cursor: 'pointer' }}
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

      {/* Tabs for Invoices and Payment History */}
      <div style={{ marginTop: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, borderBottom: '2px solid #e5e7eb' }}>
          <button
            onClick={() => setActiveTab('invoices')}
            style={{
              padding: '12px 16px',
              border: 'none',
              borderBottom: activeTab === 'invoices' ? '3px solid #357ab2' : 'none',
              background: 'transparent',
              color: activeTab === 'invoices' ? '#357ab2' : '#5a5a5a',
              fontWeight: activeTab === 'invoices' ? 600 : 500,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Invoices
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            style={{
              padding: '12px 16px',
              border: 'none',
              borderBottom: activeTab === 'payments' ? '3px solid #357ab2' : 'none',
              background: 'transparent',
              color: activeTab === 'payments' ? '#357ab2' : '#5a5a5a',
              fontWeight: activeTab === 'payments' ? 600 : 500,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Payment History
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'invoices' && (
        <InvoiceTable columns={columns} rows={rows} onRowClick={onRowClick} />
      )}

      {activeTab === 'payments' && (
        <PaymentHistoryTable
          rows={paymentHistory}
          loading={paymentHistoryLoading}
          error={paymentHistoryError}
          onReceiptClick={(payment) => setSelectedPayment(payment)}
        />
      )}

      {/* Payment Receipt Modal/View */}
      {selectedPayment && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: 16,
            maxWidth: '800px',
            maxHeight: '90vh',
            overflowY: 'auto',
            position: 'relative',
          }}>
            <div style={{ padding: 24 }}>
              <button
                onClick={() => setSelectedPayment(null)}
                style={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  background: 'none',
                  border: 'none',
                  fontSize: 24,
                  cursor: 'pointer',
                  color: '#357ab2',
                }}
              >
                ✕
              </button>
              <PaymentReceiptContent payment={selectedPayment} vendor={vendor} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline component for payment receipt display
function PaymentReceiptContent({ payment, vendor }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!payment || !vendor) return;

    const load = async () => {
      try {
        setLoading(true);
        const allInvoices = await fetchInvoiceQueue({ limit: 5000 });
        const invoiceIds = payment.invoiceIds || [];
        const paidInvoices = allInvoices.filter((inv) =>
          invoiceIds.includes(String(inv.id)) ||
          invoiceIds.includes(String(inv.invoice_number))
        );
        setInvoices(paidInvoices);
      } catch (e) {
        console.error('Failed to load invoice details:', e);
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [payment, vendor]);

  const sectionStyle = { marginBottom: 20 };
  const sectionTitleStyle = { fontSize: 14, fontWeight: 600, color: '#357ab2', marginBottom: 12 };

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#357ab2', marginBottom: 20 }}>Payment Receipt</div>

      {/* Stripe Receipt Section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Stripe Receipt</div>
        <div style={{ marginBottom: 8 }}>
          <strong>Payment ID:</strong> {payment.id}
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>Date Paid:</strong>{' '}
          {new Date(payment.date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>Amount:</strong> ${payment.amount.toFixed(2)}
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>Status:</strong> <span style={{ color: '#16a34a' }}>Succeeded</span>
        </div>
        {payment.receiptUrl && (
          <div>
            <a
              href={payment.receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#357ab2', textDecoration: 'none', fontWeight: 500 }}
            >
              View Full Stripe Receipt →
            </a>
          </div>
        )}
      </div>

      {/* PCS Dashboard Receipt Section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>PCS Dashboard Receipt</div>
        <div style={{ marginBottom: 8 }}>
          <strong>Vendor:</strong> {vendor}
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>Total Amount Paid:</strong> ${payment.amount.toFixed(2)}
        </div>
        <div style={{ marginBottom: 12 }}>
          <strong>Invoices Paid:</strong> {invoices.length}
        </div>

        {loading && <div style={{ color: '#357ab2' }}>Loading invoice details...</div>}

        {invoices.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Invoices Included:</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '12px', border: '1px solid #357ab2', borderRadius: '12px', overflow: 'hidden' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f3f4f6' }}>
                    <th style={{ padding: '6px', textAlign: 'left', fontWeight: 600 }}>Invoice #</th>
                    <th style={{ padding: '6px', textAlign: 'left', fontWeight: 600 }}>Amount</th>
                    <th style={{ padding: '6px', textAlign: 'left', fontWeight: 600 }}>Date</th>
                    <th style={{ padding: '6px', textAlign: 'left', fontWeight: 600 }}>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '6px' }}>{inv.invoice_number || 'N/A'}</td>
                      <td style={{ padding: '6px' }}>
                        ${(inv.invoice_total || inv.total || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '6px' }}>
                        {inv.invoice_date
                          ? new Date(inv.invoice_date).toLocaleDateString('en-US')
                          : 'N/A'}
                      </td>
                      <td style={{ padding: '6px' }}>
                        {inv.pdf_path ? (
                          <a
                            href={inv.pdf_path}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#357ab2', textDecoration: 'none', fontSize: '11px' }}
                          >
                            View
                          </a>
                        ) : (
                          'N/A'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && invoices.length === 0 && (
          <div style={{ color: '#5a5a5a', fontSize: '12px' }}>No invoices found for this payment</div>
        )}
      </div>
    </div>
  );
}
