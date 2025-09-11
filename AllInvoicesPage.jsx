import React, { useState, useEffect } from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';
import { fetchInvoiceQueue } from '../lib/fetchQueue';

export default function AllInvoicesPage({ onRowClick, searchQuery = '', filters = {} }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadInvoices = async () => {
      try {
        console.log('🔄 AllInvoicesPage: Starting to load invoices...');
        setLoading(true);
        
        const data = await fetchInvoiceQueue();
        console.log('📊 AllInvoicesPage: Raw data received:', data?.length || 0, 'invoices');
        
        // Ensure data is an array before processing
        const safeData = Array.isArray(data) ? data : [];
        
        const transformedData = safeData.map(invoice => ({
          invoice: invoice?.invoice_number || 'Unknown',
          invoice_number: invoice?.invoice_number,
          id: invoice?.id, // Add ID for click context fallback
          vendor: invoice?.vendor_name || invoice?.vendor || 'Unknown',
          amount: `$${invoice?.total || invoice?.invoice_total || '0.00'}`,
          office: invoice?.office_location || invoice?.clinic_id || 'Unknown',
          status: invoice?.status || 'New',
          category: invoice?.category || 'Other',
          invoice_date: invoice?.invoice_date,
          due_date: invoice?.due_date,
          json_path: invoice?.json_path,
          pdf_path: invoice?.pdf_path,
          timestamp: invoice?.timestamp,
          assigned_to: invoice?.assigned_to,
          approved: invoice?.approved,
          line_items: invoice?.line_items || [] // Add line items for detail view
        }));
        
        console.log('✅ AllInvoicesPage: Data transformed successfully:', transformedData.length, 'invoices');
        setInvoices(transformedData);
        setError(null);
      } catch (err) {
        console.error('❌ AllInvoicesPage: Error loading invoices:', err);
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
      <h2>All Invoices</h2>
      <p>{invoices.length} total invoices</p>
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
