import React, { useState, useEffect, useCallback } from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';
import { useSearchParams } from 'next/navigation';
import { useInvoiceClick } from '../context/InvoiceClickContext';
import { useInvoiceData } from '../context/InvoiceDataContext';
import { useVendorAchMap } from '../ui/ach/useVendorAch';
import Toast from '../components/Toast.jsx';
import { formatStatusForDisplay } from '../../lib/invoices/stateMachine';
import { getDisplayVendorName } from '../lib/vendorUtils';

/**
 * Page for the "To Be Paid" view. Shows invoices that have been
 * approved and are awaiting payment. Row clicks propagate to
 * the parent via onRowClick.
 */
export default function ToBePaidPage({ onRowClick, searchQuery = '', filters = {} }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);
  const { handleInvoiceRowClick } = useInvoiceClick();
  const { setInvoices: setContextInvoices } = useInvoiceData();
  const rowClickHandler = onRowClick || handleInvoiceRowClick;
  const { getStatusForVendor } = useVendorAchMap();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const getRowId = (r, i) => r.invoice_number || r.json_path || r.pdf_path || r.source_file || `${r.vendor || 'v'}_${r.invoice || 'inv'}_${r.timestamp || i}`;

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;

  const showToast = useCallback((message, variant = 'info') => {
    setToast({ message, variant, at: Date.now() });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  async function fetchVisibleInvoices() {
    // Pass through existing query params (e.g., ?email=...) for preview without cookies
    const params = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
    params.set('limit', '5000');
    params.set('status', 'to_be_paid');
    const res = await fetch(`/api/invoices/visible?${params.toString()}`, { cache: 'no-store', credentials: 'include' });
    if (!res.ok) throw new Error(`Failed to load invoices (HTTP ${res.status})`);
    const payload = await res.json();
    if (!payload?.ok) throw new Error(payload?.error || 'Failed to load invoices');
    return Array.isArray(payload.invoices) ? payload.invoices : [];
  }

  async function reloadList() {
    try {
      setLoading(true);
      const data = await fetchVisibleInvoices();
      const transformedData = data
        .filter((invoice) => (String(invoice.status || '').toLowerCase() === 'to_be_paid'))
        .map((invoice) => {
          // Amount is stored in cents in the database, convert to dollars
          const amountCents = invoice.amount_cents ?? invoice.invoice_total ?? invoice.total ?? 0;
          const numericTotal =
            typeof amountCents === 'number'
              ? amountCents / 100  // Convert cents to dollars
              : parseFloat(String(amountCents ?? '0').replace(/[^0-9.\-]/g, '')) / 100;
          return ({
          invoice: invoice.invoice_number || 'Unknown',
          invoice_number: invoice.invoice_number,
          vendor: getDisplayVendorName(invoice.vendor_name || invoice.vendor),
          amount: `$${numericTotal.toFixed(2)}`,
          office: invoice.office_location || invoice.office || invoice.clinic_id || 'Unknown',
          dueDate: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : (invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : 'N/A'),
          invoiceDate: invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : 'N/A',
          displayStatus: 'Pending Payment',
          category: (Array.isArray(invoice.invoice_categories) && invoice.invoice_categories[0]?.category_name) || invoice.category || 'Other',
          invoice_date: invoice.invoice_date,
          due_date: invoice.due_date,
          json_path: invoice.json_path,
          source_file: invoice.source_file,
          pdf_path: invoice.pdf_path,
          timestamp: invoice.timestamp,
          assigned_to: invoice.assigned_to,
          approved: invoice.approved,
          status: formatStatusForDisplay(invoice.status),
          line_items: invoice.line_items || [],
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

  async function bulkUpdate(status, approvedVal) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const selectedRows = filteredRows.filter((r, i) => ids.includes(getRowId(r, i)));

    if (status === 'completed') {
      // Process payments through Stripe
      try {
        showToast('Processing payments...', 'info');

        const invoiceIds = selectedRows.map(r => r.invoice_number || r.invoice);
        const paymentRes = await fetch('/api/invoices/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceIds }),
        });

        const paymentResult = await paymentRes.json();

        if (!paymentResult.ok) {
          showToast(`Payment failed: ${paymentResult.error}`, 'error');
          return;
        }

        // Show results
        if (paymentResult.successCount > 0) {
          showToast(`✅ Successfully paid ${paymentResult.successCount} invoice(s)`, 'success');
        }
        if (paymentResult.errorCount > 0) {
          const errors = paymentResult.results
            .filter(r => !r.ok)
            .map(r => `${r.invoiceId}: ${r.error}`)
            .join('; ');
          showToast(`⚠️ ${paymentResult.errorCount} payment(s) failed: ${errors}`, 'error');
        }
      } catch (err) {
        console.error('Error processing payments:', err);
        showToast(`Payment error: ${err.message}`, 'error');
        return;
      }
    } else if (status === 'rejected') {
      // Reject invoices
      for (const row of selectedRows) {
        await fetch('/api/invoices/transition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: row.invoice_number || row.invoice, action: 'reject', reason: 'Rejected from To Be Paid page' }),
        }).catch(() => null);
      }
      showToast(`Rejected ${selectedRows.length} invoice(s)`, 'success');
    }

    setSelectedIds(new Set());
    await reloadList();
  }
  

  // Load invoice data using visible API
  useEffect(() => {
    const loadInvoices = async () => {
      try {
        console.log('🔄 ToBePaidPage: Loading invoices from /api/invoices/visible ...');
        setLoading(true);
        const data = await fetchVisibleInvoices();
        console.log('📊 ToBePaidPage: Raw data received:', data.length, 'invoices');

        const transformedData = data
          .filter((invoice) => String(invoice.status || '').toLowerCase() === 'to_be_paid')
          .map((invoice) => {
            const rawTotal = (invoice.invoice_total ?? invoice.total);
            const numericTotal =
              typeof rawTotal === 'number'
                ? rawTotal
                : parseFloat(String(rawTotal ?? '0').replace(/[^0-9.\-]/g, '')) || 0;
            return ({
            invoice: invoice.invoice_number || 'Unknown',
            invoice_number: invoice.invoice_number, // needed by detail view
            vendor: invoice.vendor_name || invoice.vendor || 'Unknown',
            amount: `$${numericTotal.toFixed(2)}`,
            office: invoice.office_location || invoice.office || invoice.clinic_id || 'Unknown',
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
            source_file: invoice.source_file,
            pdf_path: invoice.pdf_path,
            timestamp: invoice.timestamp,
            assigned_to: invoice.assigned_to,
            approved: invoice.approved,
            status: formatStatusForDisplay(invoice.status),
            line_items: invoice.line_items || [],
          })});
        
        console.log('✅ ToBePaidPage: Data transformed successfully:', transformedData.length, 'approved invoices');
        setInvoices(transformedData);
        setContextInvoices(transformedData);
        setError(null);
      } catch (err) {
        console.error('❌ ToBePaidPage: Error loading invoices:', err);
        setError(err.message);
        // Fallback to empty array if loading fails
        setInvoices([]);
        setContextInvoices([]);
      } finally {
        console.log('🏁 ToBePaidPage: Loading complete');
        setLoading(false);
      }
    };

    loadInvoices();
  }, []);

  // Refresh invoice list when page comes back into focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('📄 ToBePaidPage: Page came into focus, refreshing invoice list');
        reloadList();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // 7 columns evenly distributed
  const columns = [
    { key: 'invoice', label: 'Invoice', width: '14%' },
    { key: 'vendor', label: 'Vendor', width: '14%' },
    { key: 'amount', label: 'Amount', align: 'right', width: '10%' },
    { key: 'office', label: 'Office', width: '12%' },
    { key: 'invoiceDate', label: 'Invoice Date', width: '12%' },
    { key: 'dueDate', label: 'Due Date', width: '12%' },
    { key: 'status', label: 'Status', width: '22%' },
  ];

  const wrapperStyle = { padding: '24px' };

  // Apply search and filters first, then sort. Filtered data is derived
  // from the original unsorted array using the criteria passed in.
  const filteredRows = invoices.filter((row) => {
    try {
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
      // Vendor ACH Status filter (if provided)
      if (filters.ach) {
        const status = (getStatusForVendor(row.vendor) || '').toLowerCase();
        if (status !== String(filters.ach).toLowerCase()) return false;
      }

      // PDF Attachment filter
      if (filters.hasAttachment) {
        // Check if pdf_path exists and is not empty
        const pdfPath = row.pdf_path || row.pdfPath;
        const hasPdf = !!(pdfPath && pdfPath.trim() !== '');
        if (filters.hasAttachment === 'yes' && !hasPdf) return false;
        if (filters.hasAttachment === 'no' && hasPdf) return false;
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">To Be Paid</h1>
          <p className="text-gray-600 mt-2">
            {filteredRows.length} invoice{filteredRows.length !== 1 ? 's' : ''} approved and awaiting payment
          </p>
        </div>
        <button
          onClick={handleRefreshInbox}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          title="Check inbox for new invoices"
        >
          <i className={`fas fa-sync-alt ${refreshing ? 'fa-spin' : ''}`}></i>
          {refreshing ? 'Refreshing...' : 'Refresh Inbox'}
        </button>
      </div>
      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <button
            onClick={() => bulkUpdate('completed', true)}
            style={{ padding: '8px 16px', backgroundColor: '#059669', color: '#fff', borderRadius: 9999, border: '1px solid #059669', fontWeight: 600 }}
          >
            Paid
          </button>
          <button
            onClick={() => bulkUpdate('rejected', false)}
            style={{ padding: '8px 16px', backgroundColor: '#dc2626', color: '#fff', borderRadius: 9999, border: '1px solid #dc2626', fontWeight: 600 }}
          >
            Reject
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
