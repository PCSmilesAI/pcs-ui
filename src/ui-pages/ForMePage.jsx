import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import InvoiceTable from '../components/InvoiceTable.jsx';
import { useInvoiceClick } from '../context/InvoiceClickContext';
import { fetchInvoiceQueue } from '../lib/fetchQueue';

/**
 * Page for the "For Me" view. Displays a table of invoices
 * assigned to the user that are NOT yet approved. Clicking on a row will open the detail
 * screen via the passed onRowClick handler.
 */
export default function ForMePage({ searchQuery = '', filters = {} }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { handleInvoiceRowClick } = useInvoiceClick();
  const spApi = useSearchParams();
  const spQuery = (spApi.get('search') || '').trim().toLowerCase();
  const spFilters = {
    vendor: spApi.get('vendor') || undefined,
    office: spApi.get('office') || undefined,
    category: spApi.get('category') || undefined,
    minAmount: spApi.get('minAmount') || undefined,
    maxAmount: spApi.get('maxAmount') || undefined,
    dueWithin: spApi.get('dueWithin') || undefined,
  };

  // Load invoice data from the queue
  useEffect(() => {
    const loadInvoices = async () => {
      try {
        console.log('🔄 ForMePage: Starting to load invoices...');
        setLoading(true);
        
        // Use the new fetch helper with high limit to get all invoices
        const data = await fetchInvoiceQueue({ limit: 5000 });
        console.log('📊 ForMePage: Raw data received:', data.length, 'invoices');
        
        // Transform the queue data to match the expected format
        // Filter for invoices that are NOT approved (any status except 'approved', approved: false or null)
        const transformedData = data
          .filter(invoice => {
            const status = invoice.status;
            const approved = invoice.approved;
            
            // Show invoice if it's not explicitly approved
            const isNotApproved = approved !== true;
            
            // Show invoice if status is not 'approved' (or null/empty which means new)
            const isNotApprovedStatus = status !== 'approved';
            
            const shouldShow = isNotApproved && isNotApprovedStatus;
            
            console.log(`📋 Invoice ${invoice.invoice_number}: status="${status}", approved=${approved}, showing=${shouldShow}`);
            return shouldShow;
          })
          .map(invoice => ({
            invoice: invoice.invoice_number || 'Unknown',
            invoice_number: invoice.invoice_number, // needed by detail view
            vendor: invoice.vendor_name || invoice.vendor || 'Unknown',
            amount: `$${invoice.invoice_total || invoice.total || '0.00'}`,
            office: invoice.office_location || invoice.clinic_id || 'Unknown',
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

  // Apply search and filter criteria. Use URL param if present.
  const effectiveQuery = (spQuery || searchQuery || '').trim().toLowerCase();
  const effectiveFilters = { ...filters, ...Object.fromEntries(Object.entries(spFilters).filter(([_,v]) => v !== undefined)) };
  const filteredRows = useMemo(() => invoices.filter((row) => {
    try {
      // Text search across all string fields
      const query = effectiveQuery;
      if (query) {
        const matches = Object.values(row).some((val) =>
          String(val).toLowerCase().includes(query)
        );
        if (!matches) return false;
      }
      // Vendor filter
      const f = effectiveFilters;
      if (f.vendor && row.vendor !== f.vendor) return false;
      if (f.office && row.office !== f.office) return false;
      if (f.category && row.category !== f.category) return false;
      // Amount filters (strip $ and commas)
      const amt = parseFloat(String(row.amount).replace(/[^0-9.]/g, ''));
      if (f.minAmount && !isNaN(parseFloat(f.minAmount)) && amt < parseFloat(f.minAmount)) return false;
      if (f.maxAmount && !isNaN(parseFloat(f.maxAmount)) && amt > parseFloat(f.maxAmount)) return false;
      // Due Within filter
      if (f.dueWithin) {
        const days = parseInt(f.dueWithin);
        if (!isNaN(days)) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          // Helper: parse M/D/YY or M-D-YY to Date
          const parseMDY = (s) => {
            if (!s || s === 'N/A') return null;
            let parts = s.includes('/') ? s.split('/') : s.split('-');
            if (parts.length !== 3) return null;
            const [m, d, y] = parts;
            const yyyy = y.length === 2 ? `20${y}` : y;
            const dt = new Date(`${yyyy}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
            return isNaN(dt.getTime()) ? null : dt;
          };

          // Prefer explicit due date; fallback to invoice date
          const dueDate = parseMDY(row.dueDate) || parseMDY(row.invoiceDate);
          if (!dueDate) return false; // cannot evaluate → exclude
          dueDate.setHours(0, 0, 0, 0);

          const timeDiff = dueDate.getTime() - today.getTime();
          const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
          if (daysDiff < 0 || daysDiff > days) return false;
        }
      }
      return true;
    } catch (error) {
      console.error('❌ Error in filter function for row:', row, error);
      // If there's an error in filtering, include the row to prevent complete failure
      return true;
    }
  }), [invoices, effectiveQuery, filters]);

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

  const columns = [
    { key: 'invoice', label: 'Invoice' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'amount', label: 'Amount', align: 'right' },
    { key: 'office', label: 'Office' },
    { key: 'invoiceDate', label: 'Invoice Date' },
    { key: 'dueDate', label: 'Due Date' },
    { key: 'category', label: 'Category' },
  ];

  const wrapperStyle = { padding: '24px' };

  return (
    <div style={wrapperStyle}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">For Me</h1>
        <p className="text-gray-600 mt-2">
          {filteredRows.length} invoice{filteredRows.length !== 1 ? 's' : ''} assigned to you
        </p>
      </div>
      <InvoiceTable
        rows={filteredRows}
        columns={columns}
        onRowClick={handleInvoiceRowClick}
      />
    </div>
  );
}