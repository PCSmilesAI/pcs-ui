import React, { useEffect, useState } from 'react';
import { fetchInvoiceQueue } from '../lib/fetchQueue';

export default function PaymentReceiptPage({ payment, vendor, onBack }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!payment || !vendor) return;

    const load = async () => {
      try {
        setLoading(true);
        // Fetch all invoices to find the ones paid in this transaction
        const allInvoices = await fetchInvoiceQueue({ limit: 5000 });

        // Parse invoice IDs from payment metadata
        const invoiceIds = payment.invoiceIds || [];
        
        // Filter invoices that match the payment
        const paidInvoices = allInvoices.filter((inv) =>
          invoiceIds.includes(String(inv.id)) ||
          invoiceIds.includes(String(inv.invoice_number))
        );

        setInvoices(paidInvoices);
        setError('');
      } catch (e) {
        setError(e.message || 'Failed to load invoice details');
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [payment, vendor]);

  if (!payment) {
    return (
      <div style={{ padding: '24px' }}>
        <button
          onClick={onBack}
          style={{
            padding: '8px 12px',
            border: '1px solid #357ab2',
            borderRadius: 6,
            color: '#357ab2',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          &larr; Back
        </button>
        <div style={{ marginTop: '16px', color: '#dc2626' }}>No payment data available</div>
      </div>
    );
  }

  const wrapperStyle = { padding: '24px', maxWidth: '900px', margin: '0 auto' };
  const headerStyle = { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 };
  const backBtn = {
    padding: '8px 12px',
    border: '1px solid #357ab2',
    borderRadius: 6,
    color: '#357ab2',
    background: '#fff',
    cursor: 'pointer',
  };
  const titleStyle = { fontSize: 24, fontWeight: 600, color: '#357ab2' };
  const sectionStyle = { marginBottom: 24, border: '1px solid #357ab2', borderRadius: 8, padding: 16, background: '#fff' };
  const sectionTitleStyle = { fontSize: 16, fontWeight: 600, color: '#357ab2', marginBottom: 12 };

  return (
    <div style={wrapperStyle}>
      <div style={headerStyle}>
        <button style={backBtn} onClick={onBack}>
          &larr; Back
        </button>
        <div style={titleStyle}>Payment Receipt</div>
      </div>

      {/* Stripe Receipt Section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Stripe Receipt</div>
        <div style={{ marginBottom: 12 }}>
          <strong>Payment ID:</strong> {payment.id}
        </div>
        <div style={{ marginBottom: 12 }}>
          <strong>Date Paid:</strong>{' '}
          {new Date(payment.date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
        <div style={{ marginBottom: 12 }}>
          <strong>Amount:</strong> ${payment.amount.toFixed(2)}
        </div>
        <div style={{ marginBottom: 12 }}>
          <strong>Status:</strong> <span style={{ color: '#16a34a' }}>Succeeded</span>
        </div>
        {payment.receiptUrl && (
          <div>
            <a
              href={payment.receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#357ab2',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              View Full Stripe Receipt →
            </a>
          </div>
        )}
      </div>

      {/* PCS Dashboard Receipt Section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>PCS Dashboard Receipt</div>
        <div style={{ marginBottom: 12 }}>
          <strong>Vendor:</strong> {vendor}
        </div>
        <div style={{ marginBottom: 12 }}>
          <strong>Total Amount Paid:</strong> ${payment.amount.toFixed(2)}
        </div>
        <div style={{ marginBottom: 12 }}>
          <strong>Invoices Paid:</strong> {invoices.length}
        </div>

        {loading && <div style={{ color: '#357ab2' }}>Loading invoice details...</div>}
        {error && <div style={{ color: '#dc2626' }}>Error: {error}</div>}

        {invoices.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Invoices Included:</div>
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '14px',
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #357ab2' }}>
                    <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>Invoice #</th>
                    <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>Amount</th>
                    <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>Date</th>
                    <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '8px' }}>{inv.invoice_number || 'N/A'}</td>
                      <td style={{ padding: '8px' }}>
                        ${(inv.invoice_total || inv.total || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '8px' }}>
                        {inv.invoice_date
                          ? new Date(inv.invoice_date).toLocaleDateString('en-US')
                          : 'N/A'}
                      </td>
                      <td style={{ padding: '8px' }}>
                        {inv.pdf_path ? (
                          <a
                            href={inv.pdf_path}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#357ab2', textDecoration: 'none' }}
                          >
                            View PDF
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
          <div style={{ color: '#5a5a5a' }}>No invoices found for this payment</div>
        )}
      </div>
    </div>
  );
}

