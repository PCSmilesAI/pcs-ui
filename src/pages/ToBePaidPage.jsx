import React, { useState, useEffect } from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';

/**
 * Page for the "To Be Paid" view. Shows invoices that have been
 * approved and are awaiting payment. Row clicks propagate to
 * the parent via onRowClick.
 */
export default function ToBePaidPage({ onRowClick, searchQuery = '', filters = {} }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load invoice data from the queue
  useEffect(() => {
    const loadInvoices = async () => {
      try {
        console.log('🔄 ToBePaidPage: Starting to load invoices...');
        console.log('🌐 ToBePaidPage: Fetching from URL:', window.location.origin + '/invoice_queue.json');
        setLoading(true);
        
        // Test the URL first
        const testUrl = window.location.origin + '/invoice_queue.json';
        console.log('🔍 ToBePaidPage: Testing URL:', testUrl);
        
        // Add cache-busting timestamp to force fresh request
        const timestamp = new Date().getTime();
        const response = await fetch(`/invoice_queue.json?t=${timestamp}`, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        console.log('📡 ToBePaidPage: Fetch response status:', response.status);
        console.log('📡 ToBePaidPage: Fetch response ok:', response.ok);
        console.log('📡 ToBePaidPage: Fetch response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
          throw new Error(`Failed to load invoices: ${response.status} - ${response.statusText}`);
        }
        
        let data = await response.json();
        // Apply client-side overrides so tab movement is immediate even if API cannot persist
        try {
          const { applyOverrides } = await import('../utils/status_overrides');
          data = applyOverrides(data);
        } catch (_) {}
        console.log('📊 ToBePaidPage: Raw data received:', data.length, 'invoices');
        
        // Transform the queue data to match the expected format
        // Filter for invoices that ARE approved and have status 'approved' (ready to be paid)
        const transformedData = data
          .filter(invoice => {
            const isApproved = invoice.approved === true && invoice.status === 'approved';
            console.log(`📋 Invoice ${invoice.invoice_number}: approved=${invoice.approved}, status=${invoice.status}, showing=${isApproved}`);
            return isApproved;
          })
          .map(invoice => ({
            invoice: invoice.invoice_number || 'Unknown',
            invoice_number: invoice.invoice_number, // needed by detail view
            vendor: invoice.vendor || 'Unknown',
            amount: `$${invoice.total || '0.00'}`,
            office: invoice.clinic_id || 'Unknown',
            dueDate: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-US', {
              month: 'numeric',
              day: 'numeric',
              year: '2-digit'
            }) : (invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString('en-US', {
              month: 'numeric',
              day: 'numeric',
              year: '2-digit'
            }) : 'N/A'),
            invoiceDate: invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString('en-US', {
              month: 'numeric',
              day: 'numeric',
              year: '2-digit'
            }) : 'N/A',
            displayStatus: 'Pending Payment',
            // Add additional fields for detail view
            invoice_date: invoice.invoice_date,
            due_date: invoice.due_date,
            json_path: invoice.json_path,
            pdf_path: invoice.pdf_path,
            timestamp: invoice.timestamp,
            assigned_to: invoice.assigned_to,
            approved: invoice.approved,
            status: invoice.status
          }));
        
        console.log('✅ ToBePaidPage: Data transformed successfully:', transformedData.length, 'approved invoices');
        setInvoices(transformedData);
        setError(null);
      } catch (err) {
        console.error('❌ ToBePaidPage: Error loading invoices:', err);
        console.error('❌ ToBePaidPage: Error details:', {
          message: err.message,
          stack: err.stack,
          url: window.location.origin + '/invoice_queue.json'
        });
        setError(err.message);
        // Fallback to empty array if loading fails
        setInvoices([]);
      } finally {
        console.log('🏁 ToBePaidPage: Loading complete');
        setLoading(false);
      }
    };

    loadInvoices();
  }, []);

  const columns = [
    { key: 'invoice', label: 'Invoice' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'amount', label: 'Amount', align: 'right' },
    { key: 'office', label: 'Office' },
    { key: 'invoiceDate', label: 'Invoice Date' },
    { key: 'dueDate', label: 'Due Date' },
    { key: 'status', label: 'Status' },
  ];

  const wrapperStyle = { padding: '24px' };

  // Apply search and filter
  const filteredRows = invoices.filter((row) => {
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      const matches = Object.values(row).some((val) =>
        String(val).toLowerCase().includes(query)
      );
      if (!matches) return false;
    }
    // vendor
    if (filters.vendor && row.vendor !== filters.vendor) return false;
    // office
    if (filters.office && row.office !== filters.office) return false;
    // amount filters
    const amt = parseFloat(row.amount.replace(/[^0-9.]/g, ''));
    if (filters.minAmount && amt < parseFloat(filters.minAmount)) return false;
    if (filters.maxAmount && amt > parseFloat(filters.maxAmount)) return false;
    // dueDate filters
    if (filters.dueStart || filters.dueEnd) {
      const [m, d, y] = row.dueDate.split('-');
      const rowDate = new Date(`20${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
      if (filters.dueStart) {
        const startDate = new Date(filters.dueStart);
        if (rowDate < startDate) return false;
      }
      if (filters.dueEnd) {
        const endDate = new Date(filters.dueEnd);
        if (rowDate > endDate) return false;
      }
    }
    // Due Within filter
    if (filters.dueWithin) {
      const days = parseInt(filters.dueWithin);
      if (!isNaN(days)) {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset time to start of day
        
        // Convert row.dueDate (M-D-YY) to Date
        const [m, d, y] = row.dueDate.split('-');
        const dueDate = new Date(`20${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
        dueDate.setHours(0, 0, 0, 0); // Reset time to start of day
        
        // Calculate days difference
        const timeDiff = dueDate.getTime() - today.getTime();
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
        
        // Filter: due date must be within the specified days AND not past due
        if (daysDiff < 0 || daysDiff > days) return false;
      }
    }
    return true;
  });

  console.log('🎨 ToBePaidPage: Rendering with', filteredRows.length, 'invoices, loading:', loading, 'error:', error);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading invoices...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-red-600">Error loading invoices: {error}</div>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">To Be Paid</h1>
        <p className="text-gray-600 mt-2">
          {filteredRows.length} invoice{filteredRows.length !== 1 ? 's' : ''} approved and awaiting payment
        </p>
      </div>
      <InvoiceTable columns={columns} rows={filteredRows} onRowClick={onRowClick} />
    </div>
  );
}