import React, { useState, useCallback, useEffect } from 'react';
import Toast from '../components/Toast.jsx';

/**
 * Page for viewing and managing individual other documents (receipts, credit memos, statements, etc.)
 * Simplified version of InvoiceDetailPage for non-invoice documents.
 */
export default function OtherDocumentViewPage({ document: initialDocument, onBack }) {
  // Track current document data (can be refreshed after updates)
  const [document, setDocument] = useState(initialDocument);
  
  // Editable fields
  const [details, setDetails] = useState({
    vendor: document?.vendor_name || '',
    date: document?.document_date || '',
    note: document?.user_note || '',
  });
  
  // State management
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState(null);
  const [pdfLoadState, setPdfLoadState] = useState('loading');
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const showToast = useCallback((message, variant = 'info') => {
    setToast({ message, variant, at: Date.now() });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  // Get document type display info
  const getTypeBadge = (type) => {
    const colors = {
      'credit_memo': { bg: '#fef3c7', text: '#d97706', label: 'Credit Memo' },
      'statement': { bg: '#e0f2fe', text: '#0369a1', label: 'Statement' },
      'payment_confirmation': { bg: '#dcfce7', text: '#16a34a', label: 'Payment Confirmation' },
      'receipt': { bg: '#fae8ff', text: '#a21caf', label: 'Receipt' },
      'marketing': { bg: '#f3f4f6', text: '#6b7280', label: 'Marketing' },
      'other': { bg: '#fef2f2', text: '#dc2626', label: 'Other' },
    };
    return colors[type] || colors['other'];
  };

  // Get status badge styling
  const getStatusBadge = (status) => {
    const colors = {
      'pending': { bg: '#fef3c7', text: '#d97706', label: 'Pending' },
      'reviewed': { bg: '#e0f2fe', text: '#0369a1', label: 'Reviewed' },
      'filed': { bg: '#dcfce7', text: '#16a34a', label: 'Filed' },
      'archived': { bg: '#f3f4f6', text: '#6b7280', label: 'Archived' },
    };
    return colors[status] || colors['pending'];
  };

  const typeBadge = getTypeBadge(document?.document_type);
  const statusBadge = getStatusBadge(document?.status);

  // Format timestamp for stage display
  const formatStageTimestamp = (timestamp) => {
    if (!timestamp) return 'Incomplete';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'Incomplete';
    const formatted = date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    return `On ${formatted}`;
  };

  // Format amount
  const formatAmount = (amount) => {
    if (!amount && amount !== 0) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Normalize PDF path to /api/pdf/filename.pdf format
  const getPdfUrl = (pdfPath) => {
    if (!pdfPath) return '';
    if (pdfPath.startsWith('/api/pdf/')) return pdfPath;
    if (pdfPath.startsWith('http://') || pdfPath.startsWith('https://')) return pdfPath;
    const filename = pdfPath.split('/').pop();
    return `/api/pdf/${filename}`;
  };

  // Handle detail field changes
  const handleDetailChange = (field, value) => {
    setDetails(prev => ({ ...prev, [field]: value }));
  };

  // Refresh document data from server
  const refreshDocument = async () => {
    if (!document?.id) return;
    try {
      const res = await fetch(`/api/other-documents/${document.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.document) {
          setDocument(data.document);
          setDetails({
            vendor: data.document.vendor_name || '',
            date: data.document.document_date || '',
            note: data.document.user_note || '',
          });
        }
      }
    } catch (err) {
      console.error('Error refreshing document:', err);
    }
  };

  // File document action
  const handleFile = async () => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/other-documents/${document.id}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to file document');
      }
      
      showToast('Document filed successfully!', 'success');
      await refreshDocument();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  // Delete document action
  const handleDelete = async () => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/other-documents/${document.id}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete document');
      }
      
      showToast('Document deleted successfully!', 'success');
      setShowDeleteModal(false);
      setTimeout(() => {
        if (onBack) onBack();
      }, 1000);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  // Convert to invoice action
  const handleConvertToInvoice = async () => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/other-documents/${document.id}/convert-to-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to convert to invoice');
      }
      
      const data = await res.json();
      showToast('Document sent to PCS AI for invoice processing!', 'success');
      setShowInvoiceModal(false);
      setTimeout(() => {
        if (onBack) onBack();
      }, 1500);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  // Update document details
  const handleUpdate = async () => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/other-documents/${document.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_name: details.vendor,
          document_date: details.date,
          user_note: details.note,
        }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update document');
      }
      
      showToast('Document updated successfully!', 'success');
      await refreshDocument();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  // Styles
  const wrapperStyle = {
    backgroundColor: '#f8fafc',
    minHeight: '100vh',
  };
  const headerStyle = {
    padding: '16px 24px',
    borderBottom: '1px solid #357ab2',
    backgroundColor: '#ffffff',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };
  const headerTitleStyle = {
    fontSize: '18px',
    fontWeight: '600',
    color: '#357ab2',
  };
  const buttonRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
  };
  const mainGridStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    borderTop: '1px solid #357ab2',
    borderLeft: '1px solid #357ab2',
  };
  const leftColumnStyle = {
    borderRight: '1px solid #357ab2',
  };
  const rightColumnStyle = {
    borderRight: '1px solid #357ab2',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px',
    justifyContent: 'flex-start',
    alignItems: 'center',
  };
  const sectionStyle = {
    borderBottom: '1px solid #357ab2',
    padding: '16px',
  };
  const sectionTitleStyle = {
    fontSize: '18px',
    fontWeight: '600',
    color: '#357ab2',
    marginBottom: '8px',
  };
  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    borderLeft: '1px solid #357ab2',
    borderTop: '1px solid #357ab2',
    fontSize: '14px',
  };
  const cellHeaderStyle = {
    padding: '8px 12px',
    borderRight: '1px solid #357ab2',
    borderBottom: '1px solid #357ab2',
    fontWeight: '500',
    color: '#5a5a5a',
    backgroundColor: '#ffffff',
    textAlign: 'left',
  };
  const cellStyle = {
    padding: '8px 12px',
    borderRight: '1px solid #357ab2',
    borderBottom: '1px solid #357ab2',
    color: '#1f1f1f',
    backgroundColor: '#ffffff',
  };
  const inputStyle = {
    border: '1px solid #cbd5e0',
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '14px',
    width: 'calc(100% - 16px)',
    boxSizing: 'border-box',
  };

  return (
    <div style={wrapperStyle}>
      {/* Toast notifications */}
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={dismissToast}
        />
      )}

      {/* Header with back arrow and document summary */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={onBack}
            aria-label="Back"
            style={{
              color: '#357ab2',
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
            }}
          >
            <i className="fas fa-arrow-left"></i>
          </button>
          <div>
            <span style={headerTitleStyle}>
              {typeBadge.label} - {document?.vendor_name || 'Unknown Vendor'}
            </span>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
              {document?.reference_number || document?.id}
            </div>
          </div>
        </div>
        <span
          style={{
            padding: '6px 14px',
            borderRadius: '9999px',
            backgroundColor: typeBadge.bg,
            color: typeBadge.text,
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          {typeBadge.label}
        </span>
      </div>

      {/* Action buttons */}
      <div style={{ padding: '16px 24px' }}>
        <div style={buttonRowStyle}>
          <button
            onClick={handleFile}
            disabled={processing || document?.status === 'filed'}
            style={{
              padding: '8px 16px',
              borderRadius: '9999px',
              fontSize: '14px',
              fontWeight: '500',
              border: '1px solid #357ab2',
              color: '#ffffff',
              backgroundColor: '#357ab2',
              cursor: processing || document?.status === 'filed' ? 'not-allowed' : 'pointer',
              opacity: processing || document?.status === 'filed' ? 0.6 : 1,
            }}
          >
            {document?.status === 'filed' ? 'Filed' : 'File'}
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            disabled={processing}
            style={{
              padding: '8px 16px',
              borderRadius: '9999px',
              fontSize: '14px',
              fontWeight: '500',
              border: '1px solid #dc2626',
              color: '#ffffff',
              backgroundColor: '#dc2626',
              cursor: processing ? 'not-allowed' : 'pointer',
              opacity: processing ? 0.6 : 1,
            }}
          >
            Delete
          </button>
          <button
            onClick={() => setShowInvoiceModal(true)}
            disabled={processing}
            style={{
              padding: '8px 16px',
              borderRadius: '9999px',
              fontSize: '14px',
              fontWeight: '500',
              border: '1px solid #059669',
              color: '#ffffff',
              backgroundColor: '#059669',
              cursor: processing ? 'not-allowed' : 'pointer',
              opacity: processing ? 0.6 : 1,
            }}
          >
            Invoice
          </button>
        </div>
      </div>

      {/* Main content grid */}
      <div style={mainGridStyle}>
        {/* Left column: Document details */}
        <div style={leftColumnStyle}>
          {/* Document Status section */}
          <div style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Document Status</h2>
            <div style={{ marginBottom: '12px' }}>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  backgroundColor: statusBadge.bg,
                  color: statusBadge.text,
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {statusBadge.label}
              </span>
            </div>
            
            {/* Filing stage table */}
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={cellHeaderStyle}>Stage</th>
                  <th style={cellHeaderStyle}>Status</th>
                  <th style={cellHeaderStyle}>User</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Filed</td>
                  <td style={cellStyle}>{formatStageTimestamp(document?.filed_at)}</td>
                  <td style={cellStyle}>{document?.filed_by || '—'}</td>
                </tr>
              </tbody>
            </table>

            {/* Payment Amount row */}
            <table style={{ ...tableStyle, marginTop: '12px' }}>
              <tbody>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Amount</td>
                  <td style={cellStyle}>
                    <span style={{ fontSize: '14px', fontWeight: '600' }}>
                      {formatAmount(document?.amount)}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Document Details section */}
          <div style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Document Details</h2>
            <table style={tableStyle}>
              <tbody>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568', width: '120px' }}>Date</td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={details.date}
                      onChange={(e) => handleDetailChange('date', e.target.value)}
                      placeholder="MM/DD/YYYY"
                      style={inputStyle}
                    />
                  </td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568' }}>Vendor</td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={details.vendor}
                      onChange={(e) => handleDetailChange('vendor', e.target.value)}
                      placeholder="Enter vendor name"
                      style={inputStyle}
                    />
                  </td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle, fontWeight: '500', color: '#4a5568', verticalAlign: 'top' }}>Note</td>
                  <td style={cellStyle}>
                    <textarea
                      value={details.note}
                      onChange={(e) => handleDetailChange('note', e.target.value)}
                      placeholder="Add a note about this document..."
                      rows={3}
                      style={{
                        ...inputStyle,
                        resize: 'vertical',
                        minHeight: '60px',
                      }}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            
            {/* Update button */}
            <div style={{ marginTop: '12px', textAlign: 'right' }}>
              <button
                onClick={handleUpdate}
                disabled={processing}
                style={{
                  padding: '8px 20px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  border: 'none',
                  color: '#ffffff',
                  backgroundColor: '#357ab2',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  opacity: processing ? 0.6 : 1,
                }}
              >
                {processing ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>
        </div>

        {/* Right column: PDF viewer */}
        <div style={rightColumnStyle}>
          {document?.pdf_path ? (
            <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '600px' }}>
              {/* Loading overlay */}
              {pdfLoadState === 'loading' && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#f8fafc',
                  zIndex: 1,
                }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: '32px', color: '#357ab2', marginBottom: '12px' }}></i>
                  <span style={{ color: '#666', fontSize: '14px' }}>Loading PDF...</span>
                </div>
              )}
              {/* Error state */}
              {pdfLoadState === 'error' && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#fef2f2',
                  zIndex: 1,
                }}>
                  <i className="fas fa-file-pdf" style={{ fontSize: '48px', color: '#dc2626', marginBottom: '12px' }}></i>
                  <span style={{ color: '#991b1b', fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>PDF not found</span>
                  <span style={{ color: '#666', fontSize: '13px', textAlign: 'center', maxWidth: '300px' }}>
                    The PDF file could not be loaded. It may have been moved or deleted.
                  </span>
                </div>
              )}
              <iframe
                src={getPdfUrl(document.pdf_path)}
                onLoad={() => setPdfLoadState('loaded')}
                onError={() => setPdfLoadState('error')}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  minHeight: '600px',
                  display: pdfLoadState === 'error' ? 'none' : 'block',
                }}
                title="Document PDF"
              />
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              minHeight: '600px',
              backgroundColor: '#f8fafc',
            }}>
              <i className="fas fa-file-alt" style={{ fontSize: '48px', color: '#9ca3af', marginBottom: '12px' }}></i>
              <span style={{ color: '#6b7280', fontSize: '16px', fontWeight: '500' }}>No PDF attached</span>
              <span style={{ color: '#9ca3af', fontSize: '13px', marginTop: '4px' }}>
                This document does not have a PDF file
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Invoice Confirmation Modal */}
      {showInvoiceModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowInvoiceModal(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '450px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, color: '#059669', fontSize: '18px' }}>
              Convert to Invoice
            </h3>
            <p style={{ color: '#4b5563', lineHeight: '1.6' }}>
              If this is an invoice, send it back to PCS AI for re-processing. 
              The document will be removed from Other Documents and parsed as an invoice.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button
                onClick={() => setShowInvoiceModal(false)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#fff',
                  color: '#374151',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConvertToInvoice}
                disabled={processing}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#059669',
                  color: '#fff',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  opacity: processing ? 0.6 : 1,
                }}
              >
                {processing ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '400px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, color: '#dc2626', fontSize: '18px' }}>
              Delete Document
            </h3>
            <p style={{ color: '#4b5563' }}>
              Are you sure you want to delete this document? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#fff',
                  color: '#374151',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={processing}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#dc2626',
                  color: '#fff',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  opacity: processing ? 0.6 : 1,
                }}
              >
                {processing ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
