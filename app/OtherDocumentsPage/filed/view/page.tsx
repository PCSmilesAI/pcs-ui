'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Toast from '@/src/components/Toast.jsx';

/**
 * Filed Document View Page
 * Simplified view for filed documents with only Delete action
 */

interface FiledDocument {
  id: string;
  vendor_name: string | null;
  document_type: string;
  document_date: string | null;
  pdf_path: string | null;
  user_note: string | null;
  filed_at: string | null;
  filed_by: string | null;
  status: string;
  created_at: string;
  raw_extracted_data?: any;
}

const documentTypeConfig: Record<string, { label: string; bg: string; text: string }> = {
  'credit_memo': { label: 'Credit Memo', bg: '#fef3c7', text: '#d97706' },
  'statement': { label: 'Statement', bg: '#e0f2fe', text: '#0369a1' },
  'payment_confirmation': { label: 'Payment Confirmation', bg: '#dcfce7', text: '#16a34a' },
  'receipt': { label: 'Receipt', bg: '#fae8ff', text: '#a21caf' },
  'packing_slip': { label: 'Packing Slip', bg: '#f0fdf4', text: '#166534' },
  'letter': { label: 'Letter', bg: '#fef9c3', text: '#854d0e' },
  'marketing': { label: 'Marketing', bg: '#f3f4f6', text: '#6b7280' },
  'other': { label: 'Other', bg: '#fef2f2', text: '#dc2626' },
};

export default function FiledDocumentViewPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const documentId = searchParams.get('id');
  const fromUrl = searchParams.get('from');

  const [document, setDocument] = useState<FiledDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: string; at: number } | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pdfLoadState, setPdfLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');

  const showToast = useCallback((message: string, variant = 'info') => {
    setToast({ message, variant, at: Date.now() });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  // Fetch document
  useEffect(() => {
    const fetchDocument = async () => {
      if (!documentId) {
        setError('No document ID provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const res = await fetch(`/api/other-documents/${encodeURIComponent(documentId)}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Document not found');
        }
        const data = await res.json();
        setDocument(data.document);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching document:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();
  }, [documentId]);

  const handleBack = () => {
    if (fromUrl) {
      router.push(decodeURIComponent(fromUrl));
    } else {
      router.push('/OtherDocumentsPage/filed');
    }
  };

  const handleDelete = async () => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/other-documents/${document?.id}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete document');
      }
      
      showToast('Document deleted successfully!', 'success');
      setShowDeleteModal(false);
      setTimeout(() => {
        handleBack();
      }, 1000);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const getPdfUrl = (pdfPath: string | null) => {
    if (!pdfPath) return '';
    if (pdfPath.startsWith('/api/pdf/')) return pdfPath;
    if (pdfPath.startsWith('http://') || pdfPath.startsWith('https://')) return pdfPath;
    const filename = pdfPath.split('/').pop();
    return `/api/pdf/${filename}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const typeConfig = documentTypeConfig[document?.document_type || 'other'] || documentTypeConfig['other'];

  // Loading state
  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
        Loading document...
      </div>
    );
  }

  // Error state
  if (error || !document) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ 
          padding: '16px', 
          backgroundColor: '#fef2f2', 
          border: '1px solid #fecaca',
          borderRadius: '16px',
          color: '#dc2626',
          marginBottom: '20px',
          display: 'inline-block',
        }}>
          {error || 'Document not found'}
        </div>
        <br />
        <button
          onClick={handleBack}
          style={{
            padding: '10px 20px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #e5e7eb',
            borderRadius: '20px',
            cursor: 'pointer',
            marginTop: '16px',
          }}
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f9fafb' }}>
      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={dismissToast}
        />
      )}

      {/* Header */}
      <div style={{ 
        padding: '16px 24px', 
        backgroundColor: '#fff', 
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={handleBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              backgroundColor: '#f3f4f6',
              border: '1px solid #e5e7eb',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '14px',
              color: '#374151',
            }}
          >
            ← Back
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>
                {document.vendor_name || 'Unknown Vendor'}
              </h1>
              <span style={{
                padding: '4px 10px',
                backgroundColor: typeConfig.bg,
                color: typeConfig.text,
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
              }}>
                {typeConfig.label}
              </span>
              <span style={{
                padding: '4px 10px',
                backgroundColor: '#dcfce7',
                color: '#16a34a',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
              }}>
                Filed
              </span>
            </div>
            <p style={{ color: '#6b7280', fontSize: '13px', margin: '4px 0 0 0' }}>
              Filed on {formatDate(document.filed_at)} by {document.filed_by || 'Unknown'}
            </p>
          </div>
        </div>

        {/* Delete Button */}
        <button
          onClick={() => setShowDeleteModal(true)}
          disabled={processing}
          style={{
            padding: '10px 24px',
            borderRadius: '16px',
            fontSize: '14px',
            fontWeight: '600',
            border: 'none',
            color: '#ffffff',
            backgroundColor: '#dc2626',
            cursor: processing ? 'not-allowed' : 'pointer',
            opacity: processing ? 0.6 : 1,
          }}
        >
          Delete
        </button>
      </div>

      {/* Main Content */}
      <div style={{ 
        flex: 1, 
        display: 'grid', 
        gridTemplateColumns: '400px 1fr',
        gap: '24px',
        padding: '24px',
        overflow: 'hidden',
      }}>
        {/* Left Panel - Document Details */}
        <div style={{ 
          backgroundColor: '#fff', 
          borderRadius: '20px', 
          border: '1px solid #e5e7eb',
          padding: '20px',
          overflow: 'auto',
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1f2937', marginTop: 0, marginBottom: '16px' }}>
            Document Details
          </h2>
          
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: '10px 0', color: '#6b7280', fontSize: '14px', fontWeight: 500, width: '120px' }}>
                  Document Type
                </td>
                <td style={{ padding: '10px 0', fontSize: '14px', color: '#1f2937' }}>
                  <span style={{
                    padding: '4px 10px',
                    backgroundColor: typeConfig.bg,
                    color: typeConfig.text,
                    borderRadius: '20px',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}>
                    {typeConfig.label}
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ padding: '10px 0', color: '#6b7280', fontSize: '14px', fontWeight: 500 }}>
                  Vendor
                </td>
                <td style={{ padding: '10px 0', fontSize: '14px', color: '#1f2937' }}>
                  {document.vendor_name || '-'}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '10px 0', color: '#6b7280', fontSize: '14px', fontWeight: 500 }}>
                  Document Date
                </td>
                <td style={{ padding: '10px 0', fontSize: '14px', color: '#1f2937' }}>
                  {formatDate(document.document_date)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '10px 0', color: '#6b7280', fontSize: '14px', fontWeight: 500, verticalAlign: 'top' }}>
                  Note
                </td>
                <td style={{ padding: '10px 0', fontSize: '14px', color: '#1f2937' }}>
                  {document.user_note || <span style={{ color: '#9ca3af' }}>No note</span>}
                </td>
              </tr>
            </tbody>
          </table>

          <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1f2937', marginBottom: '16px' }}>
            Filing Information
          </h2>
          
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: '10px 0', color: '#6b7280', fontSize: '14px', fontWeight: 500, width: '120px' }}>
                  Filed At
                </td>
                <td style={{ padding: '10px 0', fontSize: '14px', color: '#1f2937' }}>
                  {formatDate(document.filed_at)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '10px 0', color: '#6b7280', fontSize: '14px', fontWeight: 500 }}>
                  Filed By
                </td>
                <td style={{ padding: '10px 0', fontSize: '14px', color: '#1f2937' }}>
                  {document.filed_by || '-'}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '10px 0', color: '#6b7280', fontSize: '14px', fontWeight: 500 }}>
                  Received
                </td>
                <td style={{ padding: '10px 0', fontSize: '14px', color: '#1f2937' }}>
                  {formatDate(document.created_at)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Right Panel - PDF Viewer */}
        <div style={{ 
          backgroundColor: '#fff', 
          borderRadius: '20px', 
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ 
            padding: '12px 16px', 
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
          }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', margin: 0 }}>
              Document PDF
            </h2>
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            {pdfLoadState === 'loading' && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                color: '#6b7280',
              }}>
                Loading PDF...
              </div>
            )}
            {document.pdf_path ? (
              <iframe
                src={getPdfUrl(document.pdf_path)}
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  border: 'none',
                  display: pdfLoadState === 'error' ? 'none' : 'block',
                }}
                onLoad={() => setPdfLoadState('loaded')}
                onError={() => setPdfLoadState('error')}
              />
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#6b7280',
              }}>
                No PDF available
              </div>
            )}
            {pdfLoadState === 'error' && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#dc2626',
                flexDirection: 'column',
                gap: '8px',
              }}>
                <span>Failed to load PDF</span>
                <a 
                  href={getPdfUrl(document.pdf_path)} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ color: '#357ab2' }}
                >
                  Open in new tab
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

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
              borderRadius: '20px',
              padding: '24px',
              maxWidth: '400px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, color: '#dc2626', fontSize: '18px' }}>
              Delete Filed Document
            </h3>
            <p style={{ color: '#4b5563' }}>
              Are you sure you want to delete this filed document? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '20px',
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
                  borderRadius: '20px',
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
