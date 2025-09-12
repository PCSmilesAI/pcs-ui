'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Page() {
  const router = useRouter();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Handle invoice row clicks - navigate to invoice detail page
  const handleInvoiceClick = (invoice) => {
    console.log('🔍 ForMePage: Invoice clicked:', invoice);
    
    // Use invoice_number if it exists, otherwise use ID
    const identifier = (invoice?.invoice_number && invoice.invoice_number.trim() !== '') 
      ? invoice.invoice_number 
      : invoice?.id;
    
    console.log('🔍 ForMePage: Using identifier for navigation:', identifier);
    
    if (identifier) {
      const url = `/InvoiceDetailPage?invoice=${encodeURIComponent(identifier)}`;
      console.log('🔍 ForMePage: Navigating to:', url);
      router.push(url);
    } else {
      console.warn('⚠️ ForMePage: No invoice_number or id found in clicked invoice:', invoice);
    }
  };

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        console.log('🔄 ForMePage: Starting fetch...');
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/invoice-queue?limit=5000', {
          cache: 'no-store',
        });
        
        console.log('📡 ForMePage: Response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (parseError) {
          throw new Error(`JSON parse error: ${parseError.message}`);
        }
        
        if (!data?.ok) {
          throw new Error(data?.error || 'API returned error');
        }

        const invoicesList = Array.isArray(data.invoices) ? data.invoices : [];
        console.log('📊 ForMePage: Total invoices received:', invoicesList.length);
        
        // Filter for "For Me" - unapproved, pending/new invoices
        const filteredInvoices = invoicesList.filter(invoice => {
          const statusLc = String(invoice.status || '').toLowerCase();
          const isNewish = ['new', 'uploaded', 'pending'].includes(statusLc);
          return !invoice.approved && isNewish;
        });
        
        console.log('✅ ForMePage: Filtered invoices for "For Me":', filteredInvoices.length);
        setInvoices(filteredInvoices);
        
      } catch (err) {
        console.error('❌ ForMePage: Error:', err);
        setError(err.message);
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
          <div style={{ fontSize: '18px', color: '#666' }}>🔄 Loading invoices...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', flexDirection: 'column' }}>
          <div style={{ fontSize: '18px', color: 'red', marginBottom: '10px' }}>❌ Error loading invoices:</div>
          <div style={{ fontSize: '14px', color: '#666' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#1f1f1f', margin: '0 0 8px 0' }}>For Me</h1>
        <p style={{ color: '#666', margin: 0 }}>
          ✅ {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} assigned to you
        </p>
      </div>
      
      {invoices.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px', 
          color: '#666',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #e9ecef'
        }}>
          📄 No invoices found for your review.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse', 
            border: '1px solid #357ab2',
            backgroundColor: 'white'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '12px', border: '1px solid #357ab2', textAlign: 'left', fontWeight: 'bold', fontSize: '14px' }}>Invoice #</th>
                <th style={{ padding: '12px', border: '1px solid #357ab2', textAlign: 'left', fontWeight: 'bold', fontSize: '14px' }}>Vendor</th>
                <th style={{ padding: '12px', border: '1px solid #357ab2', textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }}>Amount</th>
                <th style={{ padding: '12px', border: '1px solid #357ab2', textAlign: 'left', fontWeight: 'bold', fontSize: '14px' }}>Office</th>
                <th style={{ padding: '12px', border: '1px solid #357ab2', textAlign: 'left', fontWeight: 'bold', fontSize: '14px' }}>Date</th>
                <th style={{ padding: '12px', border: '1px solid #357ab2', textAlign: 'center', fontWeight: 'bold', fontSize: '14px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice, index) => (
                <tr key={invoice.id || index} style={{ 
                  backgroundColor: index % 2 === 0 ? '#fff' : '#f9f9f9',
                  cursor: 'pointer'
                }} 
                onClick={() => handleInvoiceClick(invoice)}
                onMouseEnter={(e) => e.target.parentElement.style.backgroundColor = '#e3f2fd'}
                onMouseLeave={(e) => e.target.parentElement.style.backgroundColor = index % 2 === 0 ? '#fff' : '#f9f9f9'}
                >
                  <td style={{ padding: '12px', border: '1px solid #357ab2', fontSize: '14px' }}>
                    {invoice.invoice_number || invoice.id || 'N/A'}
                  </td>
                  <td style={{ padding: '12px', border: '1px solid #357ab2', fontSize: '14px' }}>
                    {invoice.vendor_name || invoice.vendor || 'Unknown'}
                  </td>
                  <td style={{ padding: '12px', border: '1px solid #357ab2', textAlign: 'right', fontSize: '14px', fontWeight: 'bold' }}>
                    ${invoice.invoice_total || invoice.total || '0.00'}
                  </td>
                  <td style={{ padding: '12px', border: '1px solid #357ab2', fontSize: '14px' }}>
                    {invoice.office_location || invoice.clinic_id || 'Unknown'}
                  </td>
                  <td style={{ padding: '12px', border: '1px solid #357ab2', fontSize: '14px' }}>
                    {invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString() : 'N/A'}
                  </td>
                  <td style={{ padding: '12px', border: '1px solid #357ab2', textAlign: 'center', fontSize: '12px' }}>
                    <span style={{ 
                      padding: '4px 8px', 
                      borderRadius: '12px', 
                      backgroundColor: '#fff3cd',
                      color: '#856404',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase'
                    }}>
                      {invoice.status || 'pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
