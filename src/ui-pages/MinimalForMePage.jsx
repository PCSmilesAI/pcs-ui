import React, { useState, useEffect } from 'react';

export default function MinimalForMePage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        console.log('🔄 MinimalForMePage: Starting fetch...');
        
        const response = await fetch('/api/invoice-queue?limit=5000', {
          cache: 'no-store',
        });
        
        console.log('📡 MinimalForMePage: Response:', response.status);
        
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (parseError) {
          throw new Error(`JSON parse error: ${parseError.message}`);
        }
        
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || `HTTP ${response.status}`);
        }

        const invoicesList = Array.isArray(data.invoices) ? data.invoices : [];
        
        // Filter for "For Me" - unapproved, pending/new invoices
        const filteredInvoices = invoicesList.filter(invoice => {
          const statusLc = String(invoice.status || '').toLowerCase();
          const isNewish = ['new', 'uploaded', 'pending'].includes(statusLc);
          return !invoice.approved && isNewish;
        });
        
        console.log('✅ MinimalForMePage: Filtered invoices:', filteredInvoices.length);
        setInvoices(filteredInvoices);
        setError(null);
        
      } catch (err) {
        console.error('❌ MinimalForMePage: Error:', err);
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
          <div style={{ fontSize: '18px', color: '#666' }}>Loading invoices...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
          <div style={{ fontSize: '18px', color: 'red' }}>Error loading invoices: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#1f1f1f', margin: '0 0 8px 0' }}>For Me</h1>
        <p style={{ color: '#666', margin: 0 }}>
          {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} assigned to you
        </p>
      </div>
      
      {invoices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          No invoices found for your review.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse', 
            border: '1px solid #357ab2' 
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '12px', border: '1px solid #357ab2', textAlign: 'left' }}>Invoice</th>
                <th style={{ padding: '12px', border: '1px solid #357ab2', textAlign: 'left' }}>Vendor</th>
                <th style={{ padding: '12px', border: '1px solid #357ab2', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '12px', border: '1px solid #357ab2', textAlign: 'left' }}>Office</th>
                <th style={{ padding: '12px', border: '1px solid #357ab2', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '12px', border: '1px solid #357ab2', textAlign: 'left' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice, index) => (
                <tr key={invoice.id || index} style={{ backgroundColor: '#fff' }}>
                  <td style={{ padding: '12px', border: '1px solid #357ab2' }}>
                    {invoice.invoice_number || invoice.id || 'N/A'}
                  </td>
                  <td style={{ padding: '12px', border: '1px solid #357ab2' }}>
                    {invoice.vendor_name || invoice.vendor || 'Unknown'}
                  </td>
                  <td style={{ padding: '12px', border: '1px solid #357ab2', textAlign: 'right' }}>
                    ${invoice.invoice_total || invoice.total || '0.00'}
                  </td>
                  <td style={{ padding: '12px', border: '1px solid #357ab2' }}>
                    {invoice.office_location || invoice.clinic_id || 'Unknown'}
                  </td>
                  <td style={{ padding: '12px', border: '1px solid #357ab2' }}>
                    {invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString() : 'N/A'}
                  </td>
                  <td style={{ padding: '12px', border: '1px solid #357ab2' }}>
                    <span style={{ 
                      padding: '4px 8px', 
                      borderRadius: '4px', 
                      backgroundColor: '#fff3cd',
                      color: '#856404',
                      fontSize: '12px',
                      fontWeight: 'bold'
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
