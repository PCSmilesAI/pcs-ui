import React, { useState, useEffect } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';
import InvoiceTable from '../components/InvoiceTable.jsx';

/**
 * The All Invoices page aggregates every invoice into a single
 * list. Columns are sortable; when the filter panel is open the
 * sort icons become visible and clicking on a header cycles
 * through ascending/descending/unsorted states. Sorting logic is
 * performed locally on the array of row objects.
 */
export default function AllInvoicesPage({ onRowClick, isFilterOpen, searchQuery = '', filters = {} }) {
  // Local state for sorting configuration
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load invoice data from the queue
  useEffect(() => {
    const loadInvoices = async () => {
      try {
        console.log('🔄 AllInvoicesPage: Starting to load invoices...');
        setLoading(true);
        const response = await fetch('/invoice_queue.json');
        console.log('📡 AllInvoicesPage: Fetch response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`Failed to load invoices: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📊 AllInvoicesPage: Raw data received:', data.length, 'invoices');
        
        // Transform the queue data to match the expected format
        const transformedData = data.map(invoice => ({
          invoice: invoice.invoice_number || 'Unknown',
          vendor: invoice.vendor || 'Unknown',
          amount: `$${invoice.total || '0.00'}`,
          office: invoice.clinic_id || 'Unknown',
          status: invoice.status || 'New',
          // Add additional fields for detail view
          invoice_date: invoice.invoice_date,
          json_path: invoice.json_path,
          pdf_path: invoice.pdf_path,
          timestamp: invoice.timestamp,
          assigned_to: invoice.assigned_to,
          approved: invoice.approved
        }));
        
        console.log('✅ AllInvoicesPage: Data transformed successfully:', transformedData.length, 'invoices');
        setInvoices(transformedData);
        setError(null);
      } catch (err) {
        console.error('❌ AllInvoicesPage: Error loading invoices:', err);
        setError(err.message);
        // Fallback to static data if loading fails
        console.log('🔄 AllInvoicesPage: Using fallback data...');
        setInvoices([
          {
            invoice: 'IN761993',
            vendor: 'Artisan Dental',
            amount: '$1,265.40',
            office: 'Roseburg',
            status: 'To Be Paid',
          },
          {
            invoice: '4307',
            vendor: 'Exodus Dental Solutions',
            amount: '$1,349.08',
            office: 'Lebanon',
            status: 'Approval',
          },
          {
            invoice: '44250801',
            vendor: 'Henry Schein',
            amount: '$1,622.47',
            office: 'Eugene',
            status: 'Complete',
          },
        ]);
      } finally {
        console.log('🏁 AllInvoicesPage: Loading complete');
        setLoading(false);
      }
    };

    loadInvoices();
  }, []);

  // Column definitions. Align right for the amount column.
  const columns = [
    { key: 'invoice', label: 'Invoice' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'amount', label: 'Amount', align: 'right' },
    { key: 'office', label: 'Office' },
    { key: 'status', label: 'Status' },
  ];

  /**
   * Sorting comparator used when a column is active. It strips
   * non‑numeric characters for the amount column so numeric
   * comparisons work as expected.
   */
  function compare(a, b, key, direction) {
    let valA = a[key];
    let valB = b[key];
    // Remove dollar sign and commas for numeric comparison
    if (key === 'amount') {
      valA = parseFloat(valA.replace(/[^0-9.]/g, ''));
      valB = parseFloat(valB.replace(/[^0-9.]/g, ''));
    }
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  }

  // Apply search and filters first, then sort. Filtered data is derived
  // from the original unsorted array using the criteria passed in.
  const filteredData = invoices.filter((row) => {
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      const matches = Object.values(row).some((val) =>
        String(val).toLowerCase().includes(query)
      );
      if (!matches) return false;
    }
    // vendor filter
    if (filters.vendor && row.vendor !== filters.vendor) return false;
    // office filter
    if (filters.office && row.office !== filters.office) return false;
    // status filter (not in filters currently, but category can map to status?)
    if (filters.category && row.status !== filters.category) return false;
    // amount filter
    const amt = parseFloat(row.amount.replace(/[^0-9.]/g, ''));
    if (filters.minAmount && amt < parseFloat(filters.minAmount)) return false;
    if (filters.maxAmount && amt > parseFloat(filters.maxAmount)) return false;
    // dueStart/dueEnd apply? There is no due date column; skip
    return true;
  });

  // Derive a sorted version of the filtered data based on the current
  // sorting configuration. When no sorting is active return
  // the original ordering.
  const sortedRows = React.useMemo(() => {
    const base = filteredData;
    if (!sortConfig.key || !sortConfig.direction) return base;
    const sorted = [...base].sort((a, b) =>
      compare(a, b, sortConfig.key, sortConfig.direction)
    );
    return sorted;
  }, [filteredData, sortConfig]);

  /**
   * Handle column header clicks to cycle through sort states.
   * The sort state is maintained in local state and applied
   * to the filtered data.
   */
  function handleSort(key) {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
      // Clear sorting
      setSortConfig({ key: null, direction: null });
      return;
    }
    setSortConfig({ key, direction });
  }

  console.log('🎨 AllInvoicesPage: Rendering with', sortedRows.length, 'invoices, loading:', loading, 'error:', error);

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
        <h1 className="text-2xl font-bold text-gray-900">All Invoices</h1>
        <p className="text-gray-600 mt-2">
          {sortedRows.length} invoice{sortedRows.length !== 1 ? 's' : ''} found
        </p>
      </div>
      <InvoiceTable
        rows={sortedRows}
        columns={columns}
        onRowClick={onRowClick}
      />
    </div>
  );
}