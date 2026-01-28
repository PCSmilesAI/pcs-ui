'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface ReceiptData {
  invoiceNumber: string;
  invoiceId: string;
  paymentAmount: string;
  paymentAmountCents: number;
  paymentDate: string | null;
  paidBy: string | null;
  stripeTransferId: string | null;
  codedAt: string | null;
  codedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  companyName: string;
  generatedAt: string;
}

// Format datetime with automatic timezone detection
// Shows user's local timezone (e.g., "December 13, 2024, 9:26 AM PST")
function formatDateTime(isoString: string | null): string {
  if (!isoString) return 'N/A';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',  // Automatically shows user's timezone (PST, EST, etc.)
    });
  } catch {
    return 'N/A';
  }
}

function formatDate(isoString: string | null): string {
  if (!isoString) return 'N/A';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return 'N/A';
  }
}

export default function PaymentReceiptPage() {
  const params = useParams();
  const invoiceId = params?.invoiceId as string;
  
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReceipt() {
      if (!invoiceId) {
        setError('Invoice ID is required');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/receipt`);
        const data = await response.json();

        if (!response.ok || !data.ok) {
          setError(data.error || 'Failed to load receipt');
          setLoading(false);
          return;
        }

        setReceipt(data.receipt);
      } catch (err) {
        setError('Failed to load receipt');
      } finally {
        setLoading(false);
      }
    }

    fetchReceipt();
  }, [invoiceId]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Loading receipt...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <div style={styles.errorIcon}>⚠️</div>
        <h2 style={styles.errorTitle}>Unable to Load Receipt</h2>
        <p style={styles.errorMessage}>{error}</p>
        <button onClick={() => window.history.back()} style={styles.backButton}>
          Go Back
        </button>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div style={styles.errorContainer}>
        <p style={styles.errorMessage}>No receipt data available</p>
      </div>
    );
  }

  return (
    <div style={styles.pageWrapper}>
      {/* Print button - hidden when printing */}
      <div style={styles.printButtonContainer} className="no-print">
        <button onClick={handlePrint} style={styles.printButton}>
          <span style={{ marginRight: '8px' }}>🖨️</span>
          Print Receipt
        </button>
        <button onClick={() => window.history.back()} style={styles.backLinkButton}>
          ← Back to Invoice
        </button>
      </div>

      <div style={styles.receiptContainer}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>Payment Receipt</h1>
          <div style={styles.companyName}>{receipt.companyName}</div>
        </div>

        {/* Payment Confirmation Badge */}
        <div style={styles.confirmationBadge}>
          <span style={styles.checkmark}>✓</span>
          <span style={styles.confirmationText}>Payment Complete</span>
        </div>

        {/* Payment Summary Section */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Payment Summary</div>
          <div style={styles.infoBox}>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Invoice Number:</span>
              <span style={styles.infoValue}>{receipt.invoiceNumber}</span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Amount Paid:</span>
              <span style={styles.amountValue}>${receipt.paymentAmount}</span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Payment Date:</span>
              <span style={styles.infoValue}>{formatDateTime(receipt.paymentDate)}</span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Processed By:</span>
              <span style={styles.infoValue}>{receipt.paidBy || 'N/A'}</span>
            </div>
            {receipt.stripeTransferId && (
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Transfer ID:</span>
                <span style={styles.transferId}>{receipt.stripeTransferId}</span>
              </div>
            )}
          </div>
        </div>

        {/* Invoice Details Section */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Invoice Details</div>
          <div style={styles.detailsGrid}>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>Invoice Date</span>
              <span style={styles.detailValue}>{formatDate(receipt.invoiceDate)}</span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>Due Date</span>
              <span style={styles.detailValue}>{formatDate(receipt.dueDate)}</span>
            </div>
          </div>
        </div>

        {/* Workflow Audit Trail */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Processing History</div>
          <div style={styles.auditTrail}>
            <div style={styles.auditItem}>
              <div style={styles.auditDot}></div>
              <div style={styles.auditContent}>
                <div style={styles.auditStage}>Coded</div>
                <div style={styles.auditDetails}>
                  {receipt.codedAt ? (
                    <>
                      <span>{formatDateTime(receipt.codedAt)}</span>
                      {receipt.codedBy && <span style={styles.auditUser}> by {receipt.codedBy}</span>}
                    </>
                  ) : (
                    <span style={styles.auditPending}>—</span>
                  )}
                </div>
              </div>
            </div>
            <div style={styles.auditItem}>
              <div style={styles.auditDot}></div>
              <div style={styles.auditContent}>
                <div style={styles.auditStage}>Approved</div>
                <div style={styles.auditDetails}>
                  {receipt.approvedAt ? (
                    <>
                      <span>{formatDateTime(receipt.approvedAt)}</span>
                      {receipt.approvedBy && <span style={styles.auditUser}> by {receipt.approvedBy}</span>}
                    </>
                  ) : (
                    <span style={styles.auditPending}>—</span>
                  )}
                </div>
              </div>
            </div>
            <div style={styles.auditItem}>
              <div style={{ ...styles.auditDot, backgroundColor: '#059669' }}></div>
              <div style={styles.auditContent}>
                <div style={styles.auditStage}>Paid</div>
                <div style={styles.auditDetails}>
                  {receipt.paymentDate ? (
                    <>
                      <span>{formatDateTime(receipt.paymentDate)}</span>
                      {receipt.paidBy && <span style={styles.auditUser}> by {receipt.paidBy}</span>}
                    </>
                  ) : (
                    <span style={styles.auditPending}>—</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <p>This is an official payment receipt. Please retain for your records.</p>
          <p style={styles.footerSmall}>
            Receipt generated: {formatDateTime(receipt.generatedAt)}
          </p>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  pageWrapper: {
    minHeight: '100vh',
    backgroundColor: '#f3f4f6',
    padding: '20px',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  },
  printButtonContainer: {
    maxWidth: '700px',
    margin: '0 auto 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  printButton: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '10px 20px',
    backgroundColor: '#357ab2',
    color: 'white',
    border: 'none',
    borderRadius: '16px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  backLinkButton: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '10px 20px',
    backgroundColor: 'transparent',
    color: '#357ab2',
    border: '1px solid #357ab2',
    borderRadius: '16px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  receiptContainer: {
    maxWidth: '700px',
    margin: '0 auto',
    backgroundColor: 'white',
    borderRadius: '20px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    padding: '40px',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '30px',
    paddingBottom: '20px',
    borderBottom: '2px solid #e5e7eb',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#1f2937',
    margin: '0 0 8px 0',
  },
  companyName: {
    fontSize: '14px',
    color: '#6b7280',
  },
  confirmationBadge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 24px',
    backgroundColor: '#d1fae5',
    borderRadius: '9999px',
    margin: '0 auto 30px',
    width: 'fit-content',
  },
  checkmark: {
    fontSize: '20px',
    color: '#059669',
  },
  confirmationText: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#065f46',
  },
  section: {
    marginBottom: '30px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '12px',
    paddingBottom: '8px',
    borderBottom: '1px solid #e5e7eb',
  },
  infoBox: {
    backgroundColor: '#f9fafb',
    borderRadius: '16px',
    padding: '20px',
    border: '1px solid #e5e7eb',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #e5e7eb',
  },
  infoLabel: {
    fontSize: '14px',
    color: '#6b7280',
    fontWeight: 500,
  },
  infoValue: {
    fontSize: '14px',
    color: '#1f2937',
    fontWeight: 500,
  },
  amountValue: {
    fontSize: '20px',
    color: '#059669',
    fontWeight: 700,
  },
  transferId: {
    fontSize: '13px',
    fontFamily: 'monospace',
    color: '#4b5563',
    backgroundColor: '#e5e7eb',
    padding: '4px 8px',
    borderRadius: '12px',
  },
  detailsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
  },
  detailItem: {
    backgroundColor: '#f9fafb',
    borderRadius: '16px',
    padding: '16px',
    border: '1px solid #e5e7eb',
  },
  detailLabel: {
    display: 'block',
    fontSize: '12px',
    color: '#6b7280',
    marginBottom: '4px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  detailValue: {
    fontSize: '14px',
    color: '#1f2937',
    fontWeight: 500,
  },
  auditTrail: {
    position: 'relative' as const,
    paddingLeft: '24px',
  },
  auditItem: {
    display: 'flex',
    alignItems: 'flex-start',
    marginBottom: '16px',
    position: 'relative' as const,
  },
  auditDot: {
    position: 'absolute' as const,
    left: '-24px',
    top: '4px',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: '#357ab2',
    border: '2px solid white',
    boxShadow: '0 0 0 2px #e5e7eb',
  },
  auditContent: {
    flex: 1,
  },
  auditStage: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '2px',
  },
  auditDetails: {
    fontSize: '13px',
    color: '#6b7280',
  },
  auditUser: {
    color: '#357ab2',
  },
  auditPending: {
    color: '#9ca3af',
    fontStyle: 'italic' as const,
  },
  footer: {
    marginTop: '40px',
    paddingTop: '20px',
    borderTop: '1px solid #e5e7eb',
    textAlign: 'center' as const,
    color: '#6b7280',
    fontSize: '12px',
  },
  footerSmall: {
    marginTop: '8px',
    fontSize: '11px',
    color: '#9ca3af',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#f3f4f6',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #e5e7eb',
    borderTopColor: '#357ab2',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    marginTop: '16px',
    color: '#6b7280',
    fontSize: '14px',
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#f3f4f6',
    padding: '20px',
  },
  errorIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  errorTitle: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#1f2937',
    margin: '0 0 8px 0',
  },
  errorMessage: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '24px',
  },
  backButton: {
    padding: '10px 24px',
    backgroundColor: '#357ab2',
    color: 'white',
    border: 'none',
    borderRadius: '16px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
};

