'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';

/**
 * Filed Documents List Page
 * Shows a filtered list of filed documents of a specific type
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
  created_at: string;
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

export default function FiledDocumentsByTypePage() {
  const router = useRouter();
  const params = useParams();
  const documentType = params.type as string;
  
  const [documents, setDocuments] = useState<FiledDocument[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<FiledDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Search/filter state
  const [searchVendor, setSearchVendor] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'vendor' | 'filed'>('filed');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const typeConfig = documentTypeConfig[documentType] || documentTypeConfig['other'];

  // Fetch filed documents of this type
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/other-documents/filed?type=${encodeURIComponent(documentType)}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to fetch documents');
        }
        const data = await res.json();
        setDocuments(data.documents || []);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching filed documents:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, [documentType]);

  // Filter and sort documents
  useEffect(() => {
    let filtered = [...documents];

    // Filter by vendor
    if (searchVendor) {
      filtered = filtered.filter(doc => 
        doc.vendor_name?.toLowerCase().includes(searchVendor.toLowerCase())
      );
    }

    // Filter by date
    if (searchDate) {
      filtered = filtered.filter(doc => 
        doc.document_date?.includes(searchDate) || 
        doc.filed_at?.includes(searchDate) ||
        doc.created_at?.includes(searchDate)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: string | null = '';
      let bVal: string | null = '';
      
      switch (sortBy) {
        case 'vendor':
          aVal = a.vendor_name || '';
          bVal = b.vendor_name || '';
          break;
        case 'date':
          aVal = a.document_date || a.created_at;
          bVal = b.document_date || b.created_at;
          break;
        case 'filed':
        default:
          aVal = a.filed_at || a.created_at;
          bVal = b.filed_at || b.created_at;
          break;
      }

      if (sortOrder === 'asc') {
        return aVal.localeCompare(bVal);
      }
      return bVal.localeCompare(aVal);
    });

    setFilteredDocuments(filtered);
  }, [documents, searchVendor, searchDate, sortBy, sortOrder]);

  const handleDocumentClick = (doc: FiledDocument) => {
    const currentUrl = encodeURIComponent(window.location.pathname);
    router.push(`/OtherDocumentsPage/filed/view?id=${encodeURIComponent(doc.id)}&from=${currentUrl}`);
  };

  const handleBack = () => {
    router.push('/OtherDocumentsPage/filed');
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

  const toggleSort = (field: 'date' | 'vendor' | 'filed') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
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
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#374151',
            marginBottom: '16px',
          }}
        >
          ← Back to Filed Documents
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <i className={`fas ${typeConfig.iconClass}`} style={{ fontSize: '28px', color: typeConfig.text }}></i>
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: typeConfig.text, margin: 0 }}>
            {typeConfig.label}
          </h1>
          <span style={{
            padding: '4px 12px',
            backgroundColor: typeConfig.bg,
            color: typeConfig.text,
            borderRadius: '20px',
            fontSize: '14px',
            fontWeight: 600,
          }}>
            {documents.length} filed
          </span>
        </div>
        <p style={{ color: '#6b7280', fontSize: '14px' }}>
          All filed {typeConfig.label.toLowerCase()} documents
        </p>
      </div>

      {/* Filters */}
      <div style={{ 
        display: 'flex', 
        gap: '16px', 
        marginBottom: '20px',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        padding: '16px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
      }}>
        <div style={{ minWidth: '200px', maxWidth: '280px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: 500 }}>
            Search by Vendor
          </label>
          <input
            type="text"
            value={searchVendor}
            onChange={(e) => setSearchVendor(e.target.value)}
            placeholder="Enter vendor name..."
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ minWidth: '200px', maxWidth: '280px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: 500 }}>
            Search by Date
          </label>
          <input
            type="text"
            value={searchDate}
            onChange={(e) => setSearchDate(e.target.value)}
            placeholder="YYYY-MM-DD or partial..."
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ minWidth: '160px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: 500 }}>
            Sort By
          </label>
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split('-');
              setSortBy(field as 'date' | 'vendor' | 'filed');
              setSortOrder(order as 'asc' | 'desc');
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              backgroundColor: '#fff',
              boxSizing: 'border-box',
            }}
          >
            <option value="filed-desc">Filed (Newest)</option>
            <option value="filed-asc">Filed (Oldest)</option>
            <option value="date-desc">Document Date (Newest)</option>
            <option value="date-asc">Document Date (Oldest)</option>
            <option value="vendor-asc">Vendor (A-Z)</option>
            <option value="vendor-desc">Vendor (Z-A)</option>
          </select>
        </div>
        {(searchVendor || searchDate) && (
          <button
            onClick={() => { setSearchVendor(''); setSearchDate(''); }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              color: '#6b7280',
              height: '38px',
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
          Loading documents...
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ 
          padding: '16px', 
          backgroundColor: '#fef2f2', 
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: '#dc2626',
        }}>
          Error: {error}
        </div>
      )}

      {/* Documents Table */}
      {!loading && !error && (
        <div style={{ 
          backgroundColor: '#fff', 
          borderRadius: '8px', 
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th 
                  onClick={() => toggleSort('vendor')}
                  style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left', 
                    fontSize: '13px', 
                    fontWeight: 600, 
                    color: '#374151',
                    borderBottom: '1px solid #e5e7eb',
                    cursor: 'pointer',
                  }}
                >
                  Vendor {sortBy === 'vendor' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => toggleSort('date')}
                  style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left', 
                    fontSize: '13px', 
                    fontWeight: 600, 
                    color: '#374151',
                    borderBottom: '1px solid #e5e7eb',
                    cursor: 'pointer',
                  }}
                >
                  Document Date {sortBy === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th style={{ 
                  padding: '12px 16px', 
                  textAlign: 'left', 
                  fontSize: '13px', 
                  fontWeight: 600, 
                  color: '#374151',
                  borderBottom: '1px solid #e5e7eb',
                }}>
                  Note
                </th>
                <th 
                  onClick={() => toggleSort('filed')}
                  style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left', 
                    fontSize: '13px', 
                    fontWeight: 600, 
                    color: '#374151',
                    borderBottom: '1px solid #e5e7eb',
                    cursor: 'pointer',
                  }}
                >
                  Filed {sortBy === 'filed' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th style={{ 
                  padding: '12px 16px', 
                  textAlign: 'left', 
                  fontSize: '13px', 
                  fontWeight: 600, 
                  color: '#374151',
                  borderBottom: '1px solid #e5e7eb',
                }}>
                  Filed By
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.map((doc) => (
                <tr 
                  key={doc.id}
                  onClick={() => handleDocumentClick(doc)}
                  style={{ 
                    cursor: 'pointer',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{ 
                    padding: '12px 16px', 
                    borderBottom: '1px solid #e5e7eb',
                    fontSize: '14px',
                    color: '#1f2937',
                    fontWeight: 500,
                  }}>
                    {doc.vendor_name || <span style={{ color: '#9ca3af' }}>Unknown</span>}
                  </td>
                  <td style={{ 
                    padding: '12px 16px', 
                    borderBottom: '1px solid #e5e7eb',
                    fontSize: '14px',
                    color: '#4b5563',
                  }}>
                    {formatDate(doc.document_date)}
                  </td>
                  <td style={{ 
                    padding: '12px 16px', 
                    borderBottom: '1px solid #e5e7eb',
                    fontSize: '14px',
                    color: '#6b7280',
                    maxWidth: '300px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={doc.user_note || ''}
                  >
                    {doc.user_note || '-'}
                  </td>
                  <td style={{ 
                    padding: '12px 16px', 
                    borderBottom: '1px solid #e5e7eb',
                    fontSize: '14px',
                    color: '#4b5563',
                  }}>
                    {formatDate(doc.filed_at)}
                  </td>
                  <td style={{ 
                    padding: '12px 16px', 
                    borderBottom: '1px solid #e5e7eb',
                    fontSize: '14px',
                    color: '#6b7280',
                  }}>
                    {doc.filed_by || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Empty State */}
          {filteredDocuments.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              color: '#6b7280',
            }}>
              {searchVendor || searchDate 
                ? 'No documents match your filters'
                : 'No filed documents of this type yet'
              }
            </div>
          )}
        </div>
      )}

      {/* Results count */}
      {!loading && !error && filteredDocuments.length > 0 && (
        <p style={{ 
          marginTop: '16px', 
          fontSize: '14px', 
          color: '#6b7280',
          textAlign: 'center',
        }}>
          Showing {filteredDocuments.length} of {documents.length} documents
        </p>
      )}
    </div>
  );
}
