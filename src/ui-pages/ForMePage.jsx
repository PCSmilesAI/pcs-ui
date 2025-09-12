import React, { useState, useEffect } from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';
import { useInvoiceClick } from '../context/InvoiceClickContext';

/**
 * Page for the "For Me" view. Displays a table of invoices
 * assigned to the user that are NOT yet approved. Clicking on a row will open the detail
 * screen via the passed onRowClick handler.
 */
export default function ForMePage({ searchQuery = '', filters = {} }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [qboConnected, setQboConnected] = useState(false);
  const [qboLoading, setQboLoading] = useState(true);
  const { handleInvoiceRowClick } = useInvoiceClick();

  // Debug logging
  console.log('🔍 ForMePage: handleInvoiceRowClick from context:', handleInvoiceRowClick);
  console.log('🔍 ForMePage: typeof handleInvoiceRowClick:', typeof handleInvoiceRowClick);

  // Check QuickBooks connection status
  const checkQboStatus = async () => {
    try {
      console.log('🔍 ForMePage: Checking QuickBooks status...');
      const response = await fetch('/api/qbo/status');
      const data = await response.json();
      console.log('🔍 ForMePage: QuickBooks status response:', data);
      setQboConnected(data.connected);
    } catch (error) {
      console.error('❌ Failed to check QuickBooks status:', error);
      setQboConnected(false);
    } finally {
      setQboLoading(false);
    }
  };

  // Load invoice data from the queue
  useEffect(() => {
    // Temporarily disable QBO status check to debug loading issue
    // checkQboStatus();
    setQboLoading(false);
    setQboConnected(false);
    
    const loadInvoices = async () => {
      try {
        console.log('🔄 ForMePage: Starting to load invoices...');
        setLoading(true);
        
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
        // Status overrides removed - using direct API calls
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
  console.log('🔍 ForMePage: QBO states - connected:', qboConnected, 'loading:', qboLoading);

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

  const wrapperStyle = { padding: '24px' };

  return (
    <div style={wrapperStyle}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">For Me</h1>
        <p className="text-gray-600 mt-2">QuickBooks Connection Test</p>
      </div>

      {/* QuickBooks Connection Status - Always Show */}
      <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-red-500 mr-3"></div>
            <div>
              <p className="text-red-800 font-medium">QuickBooks Not Connected</p>
              <p className="text-red-700 text-sm">Connect to QuickBooks to enable full functionality</p>
            </div>
          </div>
          <a
            href="/api/qbo/auth"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
          >
            Connect QuickBooks
          </a>
        </div>
      </div>

      <div className="text-gray-600">
        <p>This is a test page to verify QuickBooks connection UI is working.</p>
        <p>If you can see this text and the blue button above, the UI is working correctly.</p>
      </div>
    </div>
  );
}