'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Filed Documents Page
 * Shows a list of document type categories with counts of filed documents
 */

interface TypeCount {
  type: string;
  count: number;
  label: string;
}

const documentTypeConfig: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  'credit_memo': { label: 'Credit Memos', bg: '#fef3c7', text: '#d97706', icon: '💳' },
  'statement': { label: 'Statements', bg: '#e0f2fe', text: '#0369a1', icon: '📄' },
  'payment_confirmation': { label: 'Payment Confirmations', bg: '#dcfce7', text: '#16a34a', icon: '✅' },
  'receipt': { label: 'Receipts', bg: '#fae8ff', text: '#a21caf', icon: '🧾' },
  'packing_slip': { label: 'Packing Slips', bg: '#f0fdf4', text: '#166534', icon: '📦' },
  'letter': { label: 'Letters', bg: '#fef9c3', text: '#854d0e', icon: '✉️' },
  'marketing': { label: 'Marketing', bg: '#f3f4f6', text: '#6b7280', icon: '📢' },
  'other': { label: 'Other', bg: '#fef2f2', text: '#dc2626', icon: '📎' },
};

export default function FiledDocumentsPage() {
  const router = useRouter();
  const [typeCounts, setTypeCounts] = useState<TypeCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalFiled, setTotalFiled] = useState(0);

  useEffect(() => {
    const fetchFiledCounts = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/other-documents/filed/stats');
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to fetch filed document counts');
        }
        const data = await res.json();
        setTypeCounts(data.typeCounts || []);
        setTotalFiled(data.totalFiled || 0);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching filed counts:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchFiledCounts();
  }, []);

  const handleTypeClick = (type: string) => {
    router.push(`/OtherDocumentsPage/filed/${type}`);
  };

  const handleBack = () => {
    router.push('/OtherDocumentsPage');
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
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#374151',
            marginBottom: '16px',
          }}
        >
          ← Back to Other Documents
        </button>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#1f2937', marginBottom: '8px' }}>
          📁 Filed Documents
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
          borderRadius: '8px',
          color: '#dc2626',
          marginBottom: '24px'
        }}>
          Error: {error}
        </div>
      )}

      {/* Document Type Cards */}
      {!loading && !error && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '20px',
        }}>
          {Object.entries(documentTypeConfig).map(([type, config]) => {
            const typeData = typeCounts.find(tc => tc.type === type);
            const count = typeData?.count || 0;
            
            return (
              <div
                key={type}
                onClick={() => count > 0 && handleTypeClick(type)}
                style={{
                  padding: '24px',
                  borderRadius: '12px',
                  backgroundColor: count > 0 ? '#fff' : '#f9fafb',
                  border: `2px solid ${count > 0 ? config.text : '#e5e7eb'}`,
                  cursor: count > 0 ? 'pointer' : 'default',
                  opacity: count > 0 ? 1 : 0.6,
                  transition: 'all 0.2s ease',
                  boxShadow: count > 0 ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (count > 0) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = count > 0 ? '0 2px 8px rgba(0,0,0,0.08)' : 'none';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '32px' }}>{config.icon}</span>
                  <div>
                    <h3 style={{ 
                      fontSize: '18px', 
                      fontWeight: 600, 
                      color: count > 0 ? config.text : '#9ca3af',
                      margin: 0 
                    }}>
                      {config.label}
                    </h3>
                  </div>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <span style={{
                    fontSize: '28px',
                    fontWeight: 700,
                    color: count > 0 ? config.text : '#d1d5db',
                  }}>
                    {count}
                  </span>
                  {count > 0 && (
                    <span style={{
                      padding: '6px 12px',
                      backgroundColor: config.bg,
                      color: config.text,
                      borderRadius: '20px',
                      fontSize: '13px',
                      fontWeight: 500,
                    }}>
                      View All →
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && totalFiled === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '60px',
          backgroundColor: '#f9fafb',
          borderRadius: '12px',
          marginTop: '20px',
        }}>
          <span style={{ fontSize: '48px', marginBottom: '16px', display: 'block' }}>📂</span>
          <h3 style={{ color: '#374151', marginBottom: '8px' }}>No Filed Documents Yet</h3>
          <p style={{ color: '#6b7280' }}>
            Documents will appear here once they've been reviewed and filed.
          </p>
        </div>
      )}
    </div>
  );
}
