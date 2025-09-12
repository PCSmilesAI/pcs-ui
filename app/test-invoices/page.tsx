'use client';

import React, { useState, useEffect } from 'react';

export default function TestInvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        console.log('🔄 TestInvoicesPage: Starting fetch...');
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/invoice-queue?limit=10', {
          cache: 'no-store',
        });
        
        console.log('📡 TestInvoicesPage: Response status:', response.status);
        
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
        console.log('📊 TestInvoicesPage: Total invoices received:', invoicesList.length);
        
        setInvoices(invoicesList);
        
      } catch (err) {
        console.error('❌ TestInvoicesPage: Error:', err);
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
      <div style={{ 
        padding: '40px', 
        textAlign: 'center',
        backgroundColor: '#f0f8ff',
        minHeight: '400px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column'
      }}>
        <div style={{ fontSize: '24px', color: '#2563eb', marginBottom: '10px' }}>🔄 Loading Test Data...</div>
        <div style={{ fontSize: '14px', color: '#666' }}>This is the test invoices page</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        padding: '40px', 
        textAlign: 'center',
        backgroundColor: '#fff5f5',
        minHeight: '400px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column'
      }}>
        <div style={{ fontSize: '24px', color: 'red', marginBottom: '10px' }}>❌ Error Loading Data</div>
        <div style={{ fontSize: '14px', color: '#666' }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', backgroundColor: '#f8fffe' }}>
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <h1 style={{ 
          fontSize: '36px', 
          fontWeight: 'bold', 
          color: '#059669', 
          margin: '0 0 16px 0',
          textDecoration: 'underline'
        }}>
          ✅ TEST INVOICES PAGE SUCCESS!
        </h1>
        <p style={{ color: '#374151', fontSize: '18px', margin: 0 }}>
          This page loaded successfully! Found {invoices.length} invoices.
        </p>
        <div style={{ 
          backgroundColor: '#d1fae5', 
          padding: '12px', 
          borderRadius: '8px', 
          margin: '16px 0',
          border: '2px solid #059669'
        }}>
          <strong>If you can see this, the component system is working properly!</strong>
        </div>
      </div>
      
      {invoices.length > 0 && (
        <div style={{ 
          backgroundColor: 'white', 
          padding: '20px', 
          borderRadius: '8px',
          border: '1px solid #d1d5db',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ fontSize: '20px', marginBottom: '16px', color: '#374151' }}>
            Sample Invoice Data:
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6' }}>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #d1d5db' }}>ID</th>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #d1d5db' }}>Vendor</th>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #d1d5db' }}>Invoice #</th>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #d1d5db' }}>Status</th>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #d1d5db' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoices.slice(0, 5).map((invoice, index) => (
                <tr key={invoice.id || index}>
                  <td style={{ padding: '10px', border: '1px solid #d1d5db' }}>{invoice.id}</td>
                  <td style={{ padding: '10px', border: '1px solid #d1d5db' }}>{invoice.vendor_name || invoice.vendor || 'N/A'}</td>
                  <td style={{ padding: '10px', border: '1px solid #d1d5db' }}>{invoice.invoice_number || 'N/A'}</td>
                  <td style={{ padding: '10px', border: '1px solid #d1d5db' }}>
                    <span style={{ 
                      backgroundColor: '#fef3c7', 
                      color: '#92400e', 
                      padding: '2px 8px', 
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}>
                      {invoice.status || 'pending'}
                    </span>
                  </td>
                  <td style={{ padding: '10px', border: '1px solid #d1d5db', fontWeight: 'bold' }}>
                    ${invoice.invoice_total || invoice.total || '0.00'}
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
