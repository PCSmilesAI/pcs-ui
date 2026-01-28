'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Filed Documents Page
 * Shows a list of document type categories with counts of filed documents
 * Plus a list of ALL filed documents sorted by most recently filed
 */

interface TypeCount {
  type: string;
  count: number;
  label: string;
}

interface FiledDocument {
  id: string;
  vendor_name: string | null;
  document_type: string;
  document_date: string | null;
  user_note: string | null;
  filed_at: string | null;
  filed_by: string | null;
}

const documentTypeConfig: Record<string, { label: string; bg: string; text: string; iconClass: string }> = {
  'credit_memo': { label: 'Credit Memos', bg: '#fef3c7', text: '#d97706', iconClass: 'fa-credit-card' },
  'statement': { label: 'Statements', bg: '#e0f2fe', text: '#0369a1', iconClass: 'fa-file-alt' },
  'payment_confirmation': { label: 'Payment Confirmations', bg: '#dcfce7', text: '#16a34a', iconClass: 'fa-check-circle' },
  'receipt': { label: 'Receipts', bg: '#fae8ff', text: '#a21caf', iconClass: 'fa-receipt' },
  'packing_slip': { label: 'Packing Slips', bg: '#f0fdf4', text: '#166534', iconClass: 'fa-box' },
  'letter': { label: 'Letters', bg: '#fef9c3', text: '#854d0e', iconClass: 'fa-envelope' },
  'marketing': { label: 'Marketing', bg: '#f3f4f6', text: '#6b7280', iconClass: 'fa-bullhorn' },
  'other': { label: 'Other', bg: '#fef2f2', text: '#dc2626', iconClass: 'fa-paperclip' },
};

export default function FiledDocumentsPage() {
  const router = useRouter();
  const [typeCounts, setTypeCounts] = useState<TypeCount[]>([]);
  const [allFiledDocs, setAllFiledDocs] = useState<FiledDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalFiled, setTotalFiled] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch both stats and all filed documents in parallel
        const [statsRes, docsRes] = await Promise.all([
          fetch('/api/other-documents/filed/stats'),
          fetch('/api/other-documents/filed?limit=100')
        ]);
        
        if (!statsRes.ok) {
          const err = await statsRes.json();
          throw new Error(err.error || 'Failed to fetch stats');
        }
        
        if (!docsRes.ok) {
          const err = await docsRes.json();
          throw new Error(err.error || 'Failed to fetch documents');
        }
        
        const statsData = await statsRes.json();
        const docsData = await docsRes.json();
        
        setTypeCounts(statsData.typeCounts || []);
        setTotalFiled(statsData.totalFiled || 0);
        setAllFiledDocs(docsData.documents || []);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleTypeClick = (type: string) => {
    router.push(`/OtherDocumentsPage/filed/${type}`);
  };

  const handleDocumentClick = (doc: FiledDocument) => {
    const currentUrl = encodeURIComponent(window.location.pathname);
    router.push(`/OtherDocumentsPage/filed/view?id=${encodeURIComponent(doc.id)}&from=${currentUrl}`);
  };

  const handleBack = () => {
    router.push('/OtherDocumentsPage');
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch {
      return dateStr;
    }
  };

  const getTypeBadge = (type: string) => {
    const config = documentTypeConfig[type] || documentTypeConfig['other'];
    return config;
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header with Back Button */}
      <div style={{ marginBottom: '24px' }}>
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
            marginBottom: '16px',
          }}
        >
          ← Back to Other Documents
        </button>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#1f2937', marginBottom: '8px' }}>
          <i className="fas fa-folder" style={{ marginRight: '10px', color: '#16a34a' }}></i>
          Filed Documents
        </h1>
        <p style={{ color: '#6b7280', fontSize: '14px' }}>
          Browse documents that have been reviewed and filed by type. Total: {totalFiled} documents
        </p>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
          Loading filed documents...
        </div>
      )}

      {/* Error State */}
      {error && (
        <div style={{ 
          padding: '16px', 
          backgroundColor: '#fef2f2', 
          border: '1px solid #fecaca',
          borderRadius: '16px',
          color: '#dc2626',
          marginBottom: '24px'
        }}>
          Error: {error}
        </div>
      )}

      {/* Document Type Cards */}
      {!loading && !error && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '16px',
            marginBottom: '32px',
          }}>
            {Object.entries(documentTypeConfig).map(([type, config]) => {
              const typeData = typeCounts.find(tc => tc.type === type);
              const count = typeData?.count || 0;
              
              return (
                <div
                  key={type}
                  onClick={() => count > 0 && handleTypeClick(type)}
                  style={{
                    padding: '20px',
                    borderRadius: '16px',
                    backgroundColor: count > 0 ? '#fff' : '#f9fafb',
                    border: `2px solid ${count > 0 ? config.text : '#e5e7eb'}`,
                    cursor: count > 0 ? 'pointer' : 'default',
                    opacity: count > 0 ? 1 : 0.6,
                    transition: 'all 0.2s ease',
                    boxShadow: count > 0 ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (count > 0) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = count > 0 ? '0 2px 6px rgba(0,0,0,0.06)' : 'none';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <i className={`fas ${config.iconClass}`} style={{ fontSize: '20px', color: count > 0 ? config.text : '#9ca3af' }}></i>
                    <h3 style={{ 
                      fontSize: '15px', 
                      fontWeight: 600, 
                      color: count > 0 ? config.text : '#9ca3af',
                      margin: 0 
                    }}>
                      {config.label}
                    </h3>
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <span style={{
                      fontSize: '24px',
                      fontWeight: 700,
                      color: count > 0 ? config.text : '#d1d5db',
                    }}>
                      {count}
                    </span>
                    {count > 0 && (
                      <span style={{
                        padding: '4px 10px',
                        backgroundColor: config.bg,
                        color: config.text,
                        borderRadius: '16px',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}>
                        View →
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* All Filed Documents List */}
          {allFiledDocs.length > 0 && (
            <div style={{ marginTop: '32px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1f2937', marginBottom: '16px' }}>
                <i className="fas fa-clock" style={{ marginRight: '8px', color: '#6b7280' }}></i>
                Recently Filed
              </h2>
              <div style={{ 
                backgroundColor: '#fff', 
                borderRadius: '16px', 
                border: '1px solid #e5e7eb',
                overflow: 'hidden',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Type</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Vendor</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Document Date</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Note</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Filed</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Filed By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allFiledDocs.map((doc) => {
                      const typeBadge = getTypeBadge(doc.document_type);
                      return (
                        <tr 
                          key={doc.id}
                          onClick={() => handleDocumentClick(doc)}
                          style={{ 
                            cursor: 'pointer',
                            borderTop: '1px solid #e5e7eb',
                            transition: 'background-color 0.15s',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '4px 8px',
                              borderRadius: '9999px',
                              fontSize: '12px',
                              fontWeight: 500,
                              backgroundColor: typeBadge.bg,
                              color: typeBadge.text,
                            }}>
                              {typeBadge.label}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1f2937', fontWeight: 500 }}>
                            {doc.vendor_name || <span style={{ color: '#9ca3af' }}>Unknown</span>}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '14px', color: '#4b5563' }}>
                            {formatDate(doc.document_date)}
                          </td>
                          <td style={{ 
                            padding: '12px 16px', 
                            fontSize: '14px', 
                            color: '#6b7280',
                            maxWidth: '200px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={doc.user_note || ''}
                          >
                            {doc.user_note || '-'}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '14px', color: '#4b5563' }}>
                            {formatDate(doc.filed_at)}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                            {doc.filed_by || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ 
                marginTop: '12px', 
                fontSize: '13px', 
                color: '#6b7280',
                textAlign: 'center',
              }}>
                Showing {allFiledDocs.length} of {totalFiled} filed documents
              </p>
            </div>
          )}

          {/* Empty State */}
          {totalFiled === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '60px',
              backgroundColor: '#f9fafb',
              borderRadius: '20px',
              marginTop: '20px',
            }}>
              <i className="fas fa-folder-open" style={{ fontSize: '48px', marginBottom: '16px', display: 'block', color: '#9ca3af' }}></i>
              <h3 style={{ color: '#374151', marginBottom: '8px' }}>No Filed Documents Yet</h3>
              <p style={{ color: '#6b7280' }}>
                Documents will appear here once they've been reviewed and filed.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
