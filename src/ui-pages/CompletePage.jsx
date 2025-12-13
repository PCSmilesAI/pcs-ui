import React, { useState, useEffect, useCallback } from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';
import { useInvoiceClick } from '../context/InvoiceClickContext';
import { useInvoiceData } from '../context/InvoiceDataContext';
import Toast from '../components/Toast.jsx';
import { formatStatusForDisplay } from '../../lib/invoices/stateMachine';
import { getDisplayVendorName, parseInvoiceAmount } from '../lib/vendorUtils';

/**
 * Page for the "Complete" view. Lists invoices that have been
 * paid or otherwise completed along with the date they were
 * completed. Rows are interactive.
 */
export default function CompletePage({ onRowClick, searchQuery = '', filters = {} }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);
  const { handleInvoiceRowClick } = useInvoiceClick();
  const { setInvoices: setContextInvoices } = useInvoiceData();
  const rowClickHandler = onRowClick || handleInvoiceRowClick;
  const [selectedIds, setSelectedIds] = useState(new Set());
  const getRowId = (r, i) => r.invoice_number || r.json_path || r.pdf_path || r.source_file || `${r.vendor || 'v'}_${r.invoice || 'inv'}_${r.timestamp || i}`;

  const showToast = useCallback((message, variant = 'info') => {
    setToast({ message, variant, at: Date.now() });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  async function fetchVisibleInvoices() {
    // Carry through page query params (e.g., ?email=...) for preview without cookies
    const params = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
    params.set('limit', '5000');
    params.set('status', 'paid');
    const res = await fetch(`/api/invoices/visible?${params.toString()}`, { cache: 'no-store', credentials: 'include' });
    if (!res.ok) throw new Error(`Failed to load invoices (HTTP ${res.status})`);
    const payload = await res.json();
    if (!payload?.ok) throw new Error(payload?.error || 'Failed to load invoices');
    return Array.isArray(payload.invoices) ? payload.invoices : [];
  }

  // Load invoice data from the visible API
  useEffect(() => {
    const loadInvoices = async () => {
      try {
        console.log('🔄 CompletePage: Loading invoices from /api/invoices/visible ...');
        setLoading(true);
        const data = await fetchVisibleInvoices();
        console.log('📊 CompletePage: Raw data received:', data.length, 'invoices');

        const transformedData = data
          .filter((invoice) => ['paid', 'completed'].includes(String(invoice.status || '').toLowerCase()))
          .map((invoice) => {
            // Use helper to properly parse amount (handles cents vs dollars)
            const numericTotal = parseInvoiceAmount(invoice);
            // Get locations from GL Lines (invoice_categories classes)
            const locations = invoice.locations || [];
            const officeRaw = invoice.office_id || invoice.office || invoice.office_location || invoice.clinic_id || '';
            const locationDisplay = locations.length > 0 
              ? locations.join(', ') 
              : (officeRaw || 'Unknown');
            return ({
            invoice: invoice.invoice_number || 'Unknown',
            invoice_number: invoice.invoice_number,
            vendor: getDisplayVendorName(invoice.vendor_name || invoice.vendor),
            amount: `$${numericTotal.toFixed(2)}`,
            location: locationDisplay,
            locations: locations, // Keep array for filtering
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
            status: formatStatusForDisplay(invoice.status)
          })});
        
        console.log('✅ CompletePage: Data transformed successfully:', transformedData.length, 'completed invoices');
        setInvoices(transformedData);
        setContextInvoices(transformedData);
        setError(null);
      } catch (err) {
        console.error('❌ CompletePage: Error loading invoices:', err);
        setError(err.message);
        // Fallback to empty array if loading fails
        setInvoices([]);
        setContextInvoices([]);
      } finally {
        console.log('🏁 CompletePage: Loading complete');
        setLoading(false);
      }
    };

    loadInvoices();
  }, []);

  // Refresh invoice list when page comes back into focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('📄 CompletePage: Page came into focus, refreshing invoice list');
        reloadList();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reloadList]);

  async function reloadList() {
    try {
      setLoading(true);
      const data = await fetchVisibleInvoices();
      const transformedData = data
        .filter((invoice) => ['paid', 'completed'].includes(String(invoice.status || '').toLowerCase()))
        .map((invoice) => {
          // Use parseInvoiceAmount helper - properly handles amount_cents vs dollars
          const numericTotal = parseInvoiceAmount(invoice);
          // Get locations from GL Lines (invoice_categories classes)
          const locations = invoice.locations || [];
          const officeRaw = invoice.office_id || invoice.office || invoice.office_location || invoice.clinic_id || '';
          const locationDisplay = locations.length > 0 
            ? locations.join(', ') 
            : (officeRaw || 'Unknown');
          return ({
          invoice: invoice.invoice_number || 'Unknown',
          invoice_number: invoice.invoice_number,
          vendor: getDisplayVendorName(invoice.vendor_name || invoice.vendor),
          amount: `$${numericTotal.toFixed(2)}`,
          location: locationDisplay,
          locations: locations, // Keep array for filtering
          dateCompleted: invoice.uploaded_at ? new Date(invoice.uploaded_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : 'N/A',
          invoice_date: invoice.invoice_date,
          due_date: invoice.due_date,
          json_path: invoice.json_path,
          pdf_path: invoice.pdf_path,
          timestamp: invoice.timestamp,
          assigned_to: invoice.assigned_to,
          approved: invoice.approved,
          status: formatStatusForDisplay(invoice.status)
        })});
      setInvoices(transformedData);
      setContextInvoices(transformedData);
      setError(null);
    } catch (err) {
      setError(err.message);
      setInvoices([]);
      setContextInvoices([]);
    } finally {
      setLoading(false);
    }
  }

  async function bulkRemove() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const selectedRows = filteredRows.filter((r, i) => ids.includes(getRowId(r, i)));
    for (const r of selectedRows) {
      await fetch('/api/invoices/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.invoice_number || r.invoice, action: 'reject', reason: 'Removed from Complete page' }),
      }).catch(() => null);
    }
    setSelectedIds(new Set());
    await reloadList();
  }

  const columns = [
    { key: 'invoice', label: 'Invoice' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'amount', label: 'Amount', align: 'right' },
    { key: 'location', label: 'Location' },
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
    // location filter (supports multiple GL Line locations)
    if (filters.office) {
      const matchesLocation = row.locations?.includes(filters.office) || row.location === filters.office;
      if (!matchesLocation) return false;
    }
    // PDF Attachment filter
    if (filters.hasAttachment) {
      // Check if pdf_path exists and is not empty
      const pdfPath = row.pdf_path || row.pdfPath;
      const hasPdf = !!(pdfPath && pdfPath.trim() !== '');
      if (filters.hasAttachment === 'yes' && !hasPdf) return false;
      if (filters.hasAttachment === 'no' && hasPdf) return false;
    }
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

  const handleRefreshInbox = async () => {
    setRefreshing(true);
    try {
      const params = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
      const email = params.get('email') || 'user@pcsmilesai.com';

      const res = await fetch('/api/inbox/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, full_scan: true }),
      });

      const result = await res.json();

      if (!result.ok) {
        showToast(result.message || result.error || 'Failed to refresh inbox', 'error');
        return;
      }

      showToast(
        `Inbox refreshed! Added ${result.added || 0} new invoice(s), skipped ${result.skipped || 0}`,
        'success'
      );

      // Reload the invoice list
      await reloadList();
    } catch (err) {
      console.error('Error refreshing inbox:', err);
      showToast('Failed to refresh inbox', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div style={wrapperStyle}>
      <div style={{ marginBottom: '24px' }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Complete</h1>
          <p className="text-gray-600 mt-2">
            {filteredRows.length} invoice{filteredRows.length !== 1 ? 's' : ''} completed
          </p>
        </div>
        <button
          onClick={handleRefreshInbox}
          disabled={refreshing}
          style={{
            padding: '8px 16px',
            borderRadius: '9999px',
            fontSize: '14px',
            fontWeight: 500,
            border: '1px solid #357ab2',
            backgroundColor: refreshing ? '#e5e7eb' : '#ffffff',
            color: refreshing ? '#9ca3af' : '#357ab2',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
          title="Check inbox for new invoices"
        >
          <i className={`fas fa-sync-alt ${refreshing ? 'fa-spin' : ''}`}></i>
          {refreshing ? 'Refreshing...' : 'Refresh Inbox'}
        </button>
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
      <Toast message={toast?.message} variant={toast?.variant} onDismiss={dismissToast} />
    </div>
  );
}
