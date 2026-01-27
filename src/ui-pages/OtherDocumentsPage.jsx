import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Toast from '../components/Toast.jsx';

/**
 * Page for viewing non-invoice documents (credit memos, statements, etc.)
 * These documents are routed here by the PCS AI document classifier.
 */
export default function OtherDocumentsPage({ searchQuery = '' }) {
  const router = useRouter();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [stats, setStats] = useState({ byType: {}, byStatus: {} });
  const [pagination, setPagination] = useState({ total: 0, limit: 100, offset: 0, hasMore: false });
  
  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Selected document for detail view (kept for backwards compatibility)
  const [selectedDoc, setSelectedDoc] = useState(null);
  
  // Updating state
  const [updating, setUpdating] = useState(false);

  // Navigate to document view page
  const navigateToDocument = useCallback((doc) => {
    const currentUrl = encodeURIComponent(window.location.pathname + window.location.search);
    router.push(`/OtherDocumentsPage/view?id=${encodeURIComponent(doc.id)}&from=${currentUrl}`);
  }, [router]);

  const showToast = useCallback((message, variant = 'info') => {
    setToast({ message, variant, at: Date.now() });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  // Fetch documents from API
  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', '100');
      params.set('offset', pagination.offset.toString());

      const res = await fetch(`/api/other-documents?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'include'
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setDocuments(data.documents || []);
      setStats(data.stats || { byType: {}, byStatus: {} });
      setPagination(data.pagination || { total: 0, limit: 100, offset: 0, hasMore: false });
      setError(null);
    } catch (err) {
      console.error('Error fetching documents:', err);
      setError(err.message);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, pagination.offset]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Update document status
  const updateDocumentStatus = async (docId, newStatus) => {
    try {
      setUpdating(true);
      const res = await fetch('/api/other-documents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: docId, status: newStatus })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update');
      }

      showToast(`Document marked as ${newStatus}`, 'success');
      fetchDocuments();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUpdating(false);
    }
  };

  // Archive document
  const archiveDocument = async (docId) => {
    if (!confirm('Archive this document?')) return;
    await updateDocumentStatus(docId, 'archived');
  };

  // Get type badge styling
  const getTypeBadge = (type) => {
    const colors = {
      'credit_memo': { bg: '#fef3c7', text: '#d97706', label: 'Credit Memo' },
      'statement': { bg: '#e0f2fe', text: '#0369a1', label: 'Statement' },
      'payment_confirmation': { bg: '#dcfce7', text: '#16a34a', label: 'Payment Confirmation' },
      'receipt': { bg: '#fae8ff', text: '#a21caf', label: 'Receipt' },
      'packing_slip': { bg: '#f0fdf4', text: '#166534', label: 'Packing Slip' },
      'letter': { bg: '#fef9c3', text: '#854d0e', label: 'Letter' },
      'marketing': { bg: '#f3f4f6', text: '#6b7280', label: 'Marketing' },
      'other': { bg: '#fef2f2', text: '#dc2626', label: 'Other' },
      'invoice': { bg: '#e8f4fc', text: '#357ab2', label: 'Invoice' }
    };
    return colors[type] || colors['other'];
  };

  // Get status badge styling
  const getStatusBadge = (status) => {
    const colors = {
      'pending': { bg: '#fef3c7', text: '#d97706', label: 'Pending' },
      'reviewed': { bg: '#e0f2fe', text: '#0369a1', label: 'Reviewed' },
      'applied': { bg: '#dcfce7', text: '#16a34a', label: 'Applied' },
      'archived': { bg: '#f3f4f6', text: '#6b7280', label: 'Archived' }
    };
    return colors[status] || colors['pending'];
  };

  // Format amount with commas
  const formatAmount = (amount) => {
    if (!amount && amount !== 0) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: '2-digit'
    });
  };

  // Normalize PDF path to /api/pdf/filename.pdf format
  const getPdfUrl = (pdfPath) => {
    if (!pdfPath) return '';
    // Already in API format
    if (pdfPath.startsWith('/api/pdf/')) return pdfPath;
    // Already a full URL
    if (pdfPath.startsWith('http://') || pdfPath.startsWith('https://')) return pdfPath;
    // Extract filename from any path format and use API endpoint
    const filename = pdfPath.split('/').pop();
    return `/api/pdf/${filename}`;
  };

  // Filter documents by search query
  const filteredDocuments = documents.filter(doc => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (doc.vendor_name || '').toLowerCase().includes(query) ||
      (doc.reference_number || '').toLowerCase().includes(query) ||
      (doc.email_subject || '').toLowerCase().includes(query)
    );
  });

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#1f2937', marginBottom: '8px' }}>
          Other Documents
        </h1>
        <p style={{ color: '#6b7280', fontSize: '14px' }}>
          Credit memos, statements, and other non-invoice documents
        </p>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {Object.entries(stats.byType || {}).map(([type, count]) => {
          const badge = getTypeBadge(type);
          return (
            <div
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
              style={{
                padding: '12px 20px',
                borderRadius: '8px',
                backgroundColor: typeFilter === type ? badge.bg : '#ffffff',
                border: `2px solid ${typeFilter === type ? badge.text : '#e5e7eb'}`,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ fontSize: '24px', fontWeight: 600, color: badge.text }}>{count}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>{badge.label}</div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '14px',
            backgroundColor: '#fff'
          }}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="reviewed">Reviewed</option>
          <option value="applied">Applied</option>
          <option value="archived">Archived</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '14px',
            backgroundColor: '#fff'
          }}
        >
          <option value="">All Types</option>
          <option value="credit_memo">Credit Memo</option>
          <option value="statement">Statement</option>
          <option value="payment_confirmation">Payment Confirmation</option>
          <option value="receipt">Receipt</option>
          <option value="packing_slip">Packing Slip</option>
          <option value="letter">Letter</option>
          <option value="marketing">Marketing</option>
          <option value="other">Other</option>
        </select>

        <button
          onClick={() => { setTypeFilter(''); setStatusFilter(''); }}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            backgroundColor: '#fff',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          Clear Filters
        </button>

        <button
          onClick={fetchDocuments}
          disabled={loading}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: '#357ab2',
            color: '#fff',
            fontSize: '14px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div style={{
          padding: '16px',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          marginBottom: '16px',
          color: '#dc2626'
        }}>
          Error: {error}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredDocuments.length === 0 && (
        <div style={{
          padding: '48px',
          textAlign: 'center',
          backgroundColor: '#f9fafb',
          borderRadius: '8px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            No documents found
          </p>
          <p style={{ color: '#9ca3af', fontSize: '14px', marginTop: '8px' }}>
            Documents that are not invoices will appear here
          </p>
        </div>
      )}

      {/* Documents Table */}
      {filteredDocuments.length > 0 && (
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Type</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Vendor</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Reference #</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Amount</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Date</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Note</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Email Subject</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.map((doc) => {
                const typeBadge = getTypeBadge(doc.document_type);
                const statusBadge = getStatusBadge(doc.status);
                return (
                  <tr
                    key={doc.id}
                    style={{
                      borderTop: '1px solid #e5e7eb',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                    onClick={() => navigateToDocument(doc)}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 500,
                        backgroundColor: typeBadge.bg,
                        color: typeBadge.text
                      }}>
                        {typeBadge.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1f2937' }}>
                      {doc.vendor_name || 'Unknown'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280', fontFamily: 'monospace' }}>
                      {doc.reference_number || '-'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1f2937', textAlign: 'right', fontWeight: 500 }}>
                      {formatAmount(doc.amount)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                      {formatDate(doc.document_date)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 500,
                        backgroundColor: statusBadge.bg,
                        color: statusBadge.text
                      }}>
                        {statusBadge.label}
                      </span>
                    </td>
                    <td 
                      style={{ 
                        padding: '12px 16px', 
                        fontSize: '13px', 
                        color: '#4b5563', 
                        maxWidth: '200px', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap' 
                      }}
                      title={doc.user_note || ''}
                    >
                      {doc.user_note || '-'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.email_subject || '-'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        {doc.pdf_path && (
                          <a
                            href={getPdfUrl(doc.pdf_path)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              backgroundColor: '#e8f4fc',
                              color: '#357ab2',
                              fontSize: '12px',
                              textDecoration: 'none'
                            }}
                          >
                            View PDF
                          </a>
                        )}
                        {doc.status === 'pending' && (
                          <button
                            onClick={() => updateDocumentStatus(doc.id, 'reviewed')}
                            disabled={updating}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              backgroundColor: '#dcfce7',
                              color: '#16a34a',
                              border: 'none',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            Mark Reviewed
                          </button>
                        )}
                        {doc.status !== 'archived' && (
                          <button
                            onClick={() => archiveDocument(doc.id)}
                            disabled={updating}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              backgroundColor: '#f3f4f6',
                              color: '#6b7280',
                              border: 'none',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
          <button
            onClick={() => setPagination(p => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))}
            disabled={pagination.offset === 0}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              backgroundColor: '#fff',
              cursor: pagination.offset === 0 ? 'not-allowed' : 'pointer',
              opacity: pagination.offset === 0 ? 0.5 : 1
            }}
          >
            Previous
          </button>
          <span style={{ padding: '8px 16px', color: '#6b7280' }}>
            {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
          </span>
          <button
            onClick={() => setPagination(p => ({ ...p, offset: p.offset + p.limit }))}
            disabled={!pagination.hasMore}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              backgroundColor: '#fff',
              cursor: !pagination.hasMore ? 'not-allowed' : 'pointer',
              opacity: !pagination.hasMore ? 0.5 : 1
            }}
          >
            Next
          </button>
        </div>
      )}

      {/* Document Detail Modal */}
      {selectedDoc && (
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
            zIndex: 1000
          }}
          onClick={() => setSelectedDoc(null)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#1f2937' }}>
                Document Details
              </h2>
              <button
                onClick={() => setSelectedDoc(null)}
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6b7280' }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Type</label>
                <div style={{ marginTop: '4px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontWeight: 500,
                    backgroundColor: getTypeBadge(selectedDoc.document_type).bg,
                    color: getTypeBadge(selectedDoc.document_type).text
                  }}>
                    {getTypeBadge(selectedDoc.document_type).label}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Vendor</label>
                  <div style={{ fontSize: '14px', color: '#1f2937', marginTop: '4px' }}>{selectedDoc.vendor_name || 'Unknown'}</div>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Reference #</label>
                  <div style={{ fontSize: '14px', color: '#1f2937', marginTop: '4px', fontFamily: 'monospace' }}>{selectedDoc.reference_number || '-'}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Amount</label>
                  <div style={{ fontSize: '16px', color: '#1f2937', marginTop: '4px', fontWeight: 600 }}>{formatAmount(selectedDoc.amount)}</div>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Document Date</label>
                  <div style={{ fontSize: '14px', color: '#1f2937', marginTop: '4px' }}>{formatDate(selectedDoc.document_date)}</div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Email Subject</label>
                <div style={{ fontSize: '14px', color: '#1f2937', marginTop: '4px' }}>{selectedDoc.email_subject || '-'}</div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Email From</label>
                <div style={{ fontSize: '14px', color: '#1f2937', marginTop: '4px' }}>{selectedDoc.email_from || '-'}</div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Classification Confidence</label>
                <div style={{ fontSize: '14px', color: '#1f2937', marginTop: '4px' }}>
                  {selectedDoc.classification_confidence ? `${(selectedDoc.classification_confidence * 100).toFixed(0)}%` : '-'}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Notes</label>
                <div style={{ fontSize: '14px', color: '#1f2937', marginTop: '4px' }}>{selectedDoc.notes || '-'}</div>
              </div>

              {selectedDoc.pdf_path && (
                <div style={{ marginTop: '8px' }}>
                  <a
                    href={getPdfUrl(selectedDoc.pdf_path)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block',
                      padding: '10px 20px',
                      borderRadius: '6px',
                      backgroundColor: '#357ab2',
                      color: '#fff',
                      textDecoration: 'none',
                      fontWeight: 500
                    }}
                  >
                    View PDF Document
                  </a>
                </div>
              )}
            </div>

            <div style={{ marginTop: '24px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              {selectedDoc.status === 'pending' && (
                <button
                  onClick={() => { updateDocumentStatus(selectedDoc.id, 'reviewed'); setSelectedDoc(null); }}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '6px',
                    backgroundColor: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Mark as Reviewed
                </button>
              )}
              {selectedDoc.status === 'reviewed' && (
                <button
                  onClick={() => { updateDocumentStatus(selectedDoc.id, 'applied'); setSelectedDoc(null); }}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '6px',
                    backgroundColor: '#357ab2',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Mark as Applied
                </button>
              )}
              <button
                onClick={() => setSelectedDoc(null)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      )}
    </div>
  );
}
