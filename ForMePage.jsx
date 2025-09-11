import React, { useState, useEffect } from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';
import { fetchInvoiceQueue } from '../lib/fetchQueue';

export default function ForMePage({ onRowClick, searchQuery = '', filters = {} }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadInvoices = async () => {
      try {
        console.log('🔄 ForMePage: Starting to load invoices...');
        setLoading(true);
        
        const data = await fetchInvoiceQueue();
        console.log('📊 ForMePage: Raw data received:', data?.length || 0, 'invoices');
        
        // Ensure data is an array before processing
        const safeData = Array.isArray(data) ? data : [];
        
        const transformedData = safeData
          .filter(invoice => {
            const status = invoice?.status || 'new';
            const approved = invoice?.approved || false;
            return status === 'new' || status === 'uploaded' || (!approved && status !== 'approved');
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
        
        console.log('✅ ForMePage: Data transformed successfully:', transformedData.length, 'unapproved invoices');
        setInvoices(transformedData);
        setError(null);
      } catch (err) {
        console.error('❌ ForMePage: Error loading invoices:', err);
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
      <h2>For Me</h2>
      <p>{invoices.length} invoices awaiting approval</p>
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
