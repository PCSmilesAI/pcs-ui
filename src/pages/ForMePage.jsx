import React, { useState, useEffect } from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';

/**
 * Page for the "For Me" view. Displays a table of invoices
 * assigned to the user that are NOT yet approved. Clicking on a row will open the detail
 * screen via the passed onRowClick handler.
 */
export default function ForMePage({ onRowClick, searchQuery = '', filters = {} }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load invoice data from the queue
  useEffect(() => {
    const loadInvoices = async () => {
      try {
        console.log('🔄 ForMePage: Starting to load invoices...');
        setLoading(true);
        const response = await fetch('/invoice_queue.json');
        console.log('📡 ForMePage: Fetch response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`Failed to load invoices: ${response.status}`);
        }
        const data = await response.json();
        console.log('📊 ForMePage: Raw data received:', data.length, 'invoices');
        
        // Transform the queue data to match the expected format
        // Filter for invoices that are NOT approved (status: 'new' or 'uploaded', approved: false)
        const transformedData = data
          .filter(invoice => {
            const isNotApproved = !invoice.approved && (invoice.status === 'new' || invoice.status === 'uploaded');
            console.log(`📋 Invoice ${invoice.invoice_number}: status=${invoice.status}, approved=${invoice.approved}, showing=${isNotApproved}`);
            return isNotApproved;
          })
          .map(invoice => ({
            invoice: invoice.invoice_number || 'Unknown',
            vendor: invoice.vendor || 'Unknown',
            amount: `$${invoice.total || '0.00'}`,
            office: invoice.clinic_id || 'Unknown',
            dueDate: invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString('en-US', {
              month: 'numeric',
              day: 'numeric',
              year: '2-digit'
            }) : 'N/A',
            category: invoice.vendor || 'Unknown',
            // Add additional fields for detail view
            invoice_date: invoice.invoice_date,
            json_path: invoice.json_path,
            pdf_path: invoice.pdf_path,
            timestamp: invoice.timestamp,
            assigned_to: invoice.assigned_to,
            approved: invoice.approved,
            status: invoice.status
          }));
        
        console.log('✅ ForMePage: Data transformed successfully:', transformedData.length, 'unapproved invoices');
        setInvoices(transformedData);
        setError(null);
      } catch (err) {
        console.error('❌ ForMePage: Error loading invoices:', err);
        setError(err.message);
        // Fallback to empty array if loading fails
        setInvoices([]);
      } finally {
        console.log('🏁 ForMePage: Loading complete');
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
    { key: 'dueDate', label: 'Due Date' },
    { key: 'category', label: 'Category' },
  ];

  // Apply search and filter criteria. If searchQuery is non-empty,
  // include only rows where any column contains the query
  const filteredRows = invoices.filter((row) => {
    // Text search across all string fields
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      const matches = Object.values(row).some((val) =>
        String(val).toLowerCase().includes(query)
      );
      if (!matches) return false;
    }
    // Vendor filter
    if (filters.vendor && row.vendor !== filters.vendor) return false;
    // Office filter
    if (filters.office && row.office !== filters.office) return false;
    // Category filter
    if (filters.category && row.category !== filters.category) return false;
    // Amount filters (strip $ and commas)
    const amt = parseFloat(row.amount.replace(/[^0-9.]/g, ''));
    if (filters.minAmount && amt < parseFloat(filters.minAmount)) return false;
    if (filters.maxAmount && amt > parseFloat(filters.maxAmount)) return false;
    // Due date filters
    if (filters.dueStart || filters.dueEnd) {
      // Convert row.dueDate (M-D-YY) to Date
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
    return true;
  });

  console.log('🎨 ForMePage: Rendering with', filteredRows.length, 'invoices, loading:', loading, 'error:', error);

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
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">For Me</h1>
        <p className="text-gray-600 mt-2">
          {filteredRows.length} invoice{filteredRows.length !== 1 ? 's' : ''} awaiting approval
        </p>
      </div>
      <InvoiceTable
        columns={columns}
        rows={filteredRows}
        onRowClick={onRowClick}
      />
    </div>
  );
}