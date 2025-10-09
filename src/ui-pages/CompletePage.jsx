import React, { useMemo, useState, useEffect } from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';
import { useInvoiceClick } from '../context/InvoiceClickContext';

/**
 * Page for the "Complete" view. Lists invoices that have been
 * paid or otherwise completed along with the date they were
 * completed. Rows are interactive.
 */
export default function CompletePage({ onRowClick, searchQuery = '', filters = {} }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { handleInvoiceRowClick } = useInvoiceClick();
  const rowClickHandler = onRowClick || handleInvoiceRowClick;
  const [selectedIds, setSelectedIds] = useState(new Set());
  const getRowId = (r, i) => r.invoice_number || r.json_path || r.pdf_path || r.source_file || `${r.vendor || 'v'}_${r.invoice || 'inv'}_${r.timestamp || i}`;

  // Load invoice data from the queue
  useEffect(() => {
    const loadInvoices = async () => {
      try {
        console.log('🔄 CompletePage: Starting to load invoices...');
        setLoading(true);
        const response = await fetch(`/invoice_queue.json?t=${Date.now()}`);
        console.log('📡 CompletePage: Fetch response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`Failed to load invoices: ${response.status}`);
        }
        
        let data = await response.json();
        // Apply client-side overrides (e.g., when Paid was clicked)
        // Status overrides removed - using direct API calls
        console.log('📊 CompletePage: Raw data received:', data.length, 'invoices');
        
        // Transform the queue data to match the expected format
        // Filter for invoices that are "completed" (have been paid)
        const transformedData = data
          .filter(invoice => invoice.status === 'completed')
          .map(invoice => ({
            invoice: invoice.invoice_number || 'Unknown',
            invoice_number: invoice.invoice_number,
            vendor: invoice.vendor || 'Unknown',
            amount: `$${invoice.total || '0.00'}`,
            office: invoice.clinic_id || 'Unknown',
            dateCompleted: invoice.uploaded_at ? new Date(invoice.uploaded_at).toLocaleDateString('en-US', {
              month: 'numeric',
              day: 'numeric',
              year: '2-digit'
            }) : 'N/A',
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
        
        console.log('✅ CompletePage: Data transformed successfully:', transformedData.length, 'completed invoices');
        setInvoices(transformedData);
        setError(null);
      } catch (err) {
        console.error('❌ CompletePage: Error loading invoices:', err);
        setError(err.message);
        // Fallback to empty array if loading fails
        setInvoices([]);
      } finally {
        console.log('🏁 CompletePage: Loading complete');
        setLoading(false);
      }
    };

    loadInvoices();
  }, []);

  async function reloadList() {
    try {
      setLoading(true);
      const response = await fetch(`/invoice_queue.json?t=${Date.now()}`);
      if (!response.ok) throw new Error(`Failed to load invoices: ${response.status}`);
      let data = await response.json();
      const transformedData = data
        .filter(invoice => invoice.status === 'completed')
        .map(invoice => ({
          invoice: invoice.invoice_number || 'Unknown',
          invoice_number: invoice.invoice_number,
          vendor: invoice.vendor || 'Unknown',
          amount: `$${invoice.total || '0.00'}`,
          office: invoice.clinic_id || 'Unknown',
          dateCompleted: invoice.uploaded_at ? new Date(invoice.uploaded_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : 'N/A',
          invoice_date: invoice.invoice_date,
          due_date: invoice.due_date,
          json_path: invoice.json_path,
          pdf_path: invoice.pdf_path,
          timestamp: invoice.timestamp,
          assigned_to: invoice.assigned_to,
          approved: invoice.approved,
          status: invoice.status
        }));
      setInvoices(transformedData);
      setError(null);
    } catch (err) {
      setError(err.message);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }

  async function bulkRemove() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const selectedRows = filteredRows.filter((r, i) => ids.includes(getRowId(r, i)));
    await Promise.all(
      selectedRows.map((r) =>
        fetch('/api/update-invoice-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoice_number: r.invoice_number, status: 'removed', approved: false }),
        }).catch(() => null)
      )
    );
    setSelectedIds(new Set());
    await reloadList();
  }

  const columns = [
    { key: 'invoice', label: 'Invoice' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'amount', label: 'Amount', align: 'right' },
    { key: 'office', label: 'Office' },
    { key: 'dateCompleted', label: 'Date Completed' },
  ];

  const wrapperStyle = { padding: '24px' };

  // Filter logic
  const filteredRows = invoices.filter((row) => {
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
    // amount filter
    const amt = parseFloat(row.amount.replace(/[^0-9.]/g, ''));
    if (filters.minAmount && amt < parseFloat(filters.minAmount)) return false;
    if (filters.maxAmount && amt > parseFloat(filters.maxAmount)) return false;
    // dueStart/dueEnd apply to dateCompleted
    if (filters.dueStart || filters.dueEnd) {
      const [m, d, y] = row.dateCompleted.split('-');
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

  console.log('🎨 CompletePage: Rendering with', filteredRows.length, 'invoices, loading:', loading, 'error:', error);

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
        <h1 className="text-2xl font-bold text-gray-900">Complete</h1>
        <p className="text-gray-600 mt-2">
          {filteredRows.length} invoice{filteredRows.length !== 1 ? 's' : ''} completed
        </p>
      </div>
      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <button
            onClick={bulkRemove}
            style={{ padding: '8px 16px', backgroundColor: '#dc2626', color: '#fff', borderRadius: 9999, border: '1px solid #dc2626', fontWeight: 600 }}
          >
            Remove
          </button>
        </div>
      )}
      <InvoiceTable
        columns={columns}
        rows={filteredRows}
        onRowClick={rowClickHandler}
        selectable
        selectedIds={selectedIds}
        getRowId={getRowId}
        onToggleRow={(id, row, checked) => {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id); else next.delete(id);
            return next;
          });
        }}
        onToggleAll={(_allSelected, ids) => {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            const currentlyAllSelected = ids.every((id) => next.has(id));
            if (currentlyAllSelected) ids.forEach((id) => next.delete(id));
            else ids.forEach((id) => next.add(id));
            return next;
          });
        }}
      />
    </div>
  );
}