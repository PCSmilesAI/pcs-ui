import React, { useState, useEffect } from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';
import { fetchInvoiceQueue } from '../lib/fetchQueue';

export default function CompletePage({ onRowClick, searchQuery = '', filters = {} }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadInvoices = async () => {
      try {
        console.log('🔄 CompletePage: Starting to load invoices...');
        setLoading(true);
        
        const data = await fetchInvoiceQueue();
        console.log('📊 CompletePage: Raw data received:', data?.length || 0, 'invoices');
        
        const safeData = Array.isArray(data) ? data : [];
        
        const transformedData = safeData
          .filter(invoice => {
            const status = invoice?.status || 'new';
            return status === 'complete' || status === 'paid' || status === 'closed';
          })
          .map(invoice => ({
            invoice: invoice?.invoice_number || 'Unknown',
            invoice_number: invoice?.invoice_number,
            id: invoice?.id, // Add ID for click context fallback
            vendor: invoice?.vendor_name || invoice?.vendor || 'Unknown',
            amount: `$${invoice?.total || invoice?.invoice_total || '0.00'}`,
            office: invoice?.office_location || invoice?.clinic_id || 'Unknown',
            invoice_date: invoice?.invoice_date,
            due_date: invoice?.due_date,
            status: invoice?.status || 'New',
            category: invoice?.category || 'Other',
            json_path: invoice?.json_path,
            pdf_path: invoice?.pdf_path,
            timestamp: invoice?.timestamp,
            assigned_to: invoice?.assigned_to,
            approved: invoice?.approved,
            line_items: invoice?.line_items || [] // Add line items for detail view
          }));
        
        console.log('✅ CompletePage: Data transformed successfully:', transformedData.length, 'completed invoices');
        setInvoices(transformedData);
        setError(null);
      } catch (err) {
        console.error('❌ CompletePage: Error loading invoices:', err);
        setError(err.message);
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    };

    loadInvoices();
  }, [searchQuery, filters]);

  return (
    <div>
      <h2>Complete</h2>
      <p>{invoices.length} completed invoices</p>
      <InvoiceTable 
        columns={[
          { key: 'invoice', label: 'Invoice' },
          { key: 'vendor', label: 'Vendor' },
          { key: 'amount', label: 'Amount', align: 'right' },
          { key: 'office', label: 'Office' },
          { key: 'status', label: 'Status' }
        ]}
        rows={invoices} 
        onRowClick={onRowClick}
      />
    </div>
  );
}
