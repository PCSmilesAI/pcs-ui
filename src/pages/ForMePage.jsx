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
        console.log('🌐 ForMePage: Fetching from URL:', window.location.origin + '/invoice_queue.json');
        setLoading(true);
        
        // Test the URL first
        const testUrl = window.location.origin + '/invoice_queue.json';
        console.log('🔍 ForMePage: Testing URL:', testUrl);
        
        // Add cache-busting timestamp to force fresh request
        const timestamp = new Date().getTime();
        const fetchUrl = `/invoice_queue.json?t=${timestamp}`;
        console.log('🔍 ForMePage: Fetching from URL:', fetchUrl);
        
        const response = await fetch(fetchUrl, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        console.log('📡 ForMePage: Fetch response status:', response.status);
        console.log('📡 ForMePage: Fetch response ok:', response.ok);
        console.log('📡 ForMePage: Fetch response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
          throw new Error(`Failed to load invoices: ${response.status} - ${response.statusText}`);
        }
        let data = await response.json();
        // Apply client-side overrides so queues reflect immediate actions
        try {
          const { applyOverrides } = await import('../utils/status_overrides');
          data = applyOverrides(data);
        } catch (_) {}
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
            category: invoice.category || 'Other',
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
        
        console.log('✅ ForMePage: Data transformed successfully:', transformedData.length, 'unapproved invoices');
        setInvoices(transformedData);
        setError(null);
      } catch (err) {
        console.error('❌ ForMePage: Error loading invoices:', err);
        console.error('❌ ForMePage: Error details:', {
          message: err.message,
          stack: err.stack,
          url: window.location.origin + '/invoice_queue.json'
        });
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
    { key: 'invoiceDate', label: 'Invoice Date' },
    { key: 'dueDate', label: 'Due Date' },
    { key: 'category', label: 'Category' },
  ];

  // Apply search and filter criteria. If searchQuery is non-empty,
  // include only rows where any column contains the query
  const filteredRows = invoices.filter((row) => {
    try {
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
        // Only process if dueDate is not 'N/A' and has valid format
        if (row.dueDate && row.dueDate !== 'N/A' && row.dueDate.includes('-')) {
          try {
            const [m, d, y] = row.dueDate.split('-');
            if (m && d && y) {
              const rowDate = new Date(`20${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
              if (!isNaN(rowDate.getTime())) {
                if (filters.dueStart) {
                  const startDate = new Date(filters.dueStart);
                  if (rowDate < startDate) return false;
                }
                if (filters.dueEnd) {
                  const endDate = new Date(filters.dueEnd);
                  if (rowDate > endDate) return false;
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ Error parsing due date:', row.dueDate, error);
            // If date parsing fails, skip this filter for this row
          }
        }
      }
      // Due Within filter
      if (filters.dueWithin) {
        const days = parseInt(filters.dueWithin);
        if (!isNaN(days)) {
          // Only process if dueDate is not 'N/A' and has valid format
          if (row.dueDate && row.dueDate !== 'N/A' && row.dueDate.includes('-')) {
            try {
              const today = new Date();
              today.setHours(0, 0, 0, 0); // Reset time to start of day
              
              // Convert row.dueDate (M-D-YY) to Date
              const [m, d, y] = row.dueDate.split('-');
              if (m && d && y) {
                const dueDate = new Date(`20${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
                if (!isNaN(dueDate.getTime())) {
                  dueDate.setHours(0, 0, 0, 0); // Reset time to start of day
                  
                  // Calculate days difference
                  const timeDiff = dueDate.getTime() - today.getTime();
                  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
                  
                  // Filter: due date must be within the specified days AND not past due
                  if (daysDiff < 0 || daysDiff > days) return false;
                }
              }
            } catch (error) {
              console.warn('⚠️ Error parsing due date for dueWithin filter:', row.dueDate, error);
              // If date parsing fails, skip this filter for this row
            }
          } else {
            // If dueDate is 'N/A' or invalid, exclude from dueWithin filter
            return false;
          }
        }
      }
      return true;
    } catch (error) {
      console.error('❌ Error in filter function for row:', row, error);
      // If there's an error in filtering, include the row to prevent complete failure
      return true;
    }
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