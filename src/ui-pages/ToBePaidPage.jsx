import React, { useState, useEffect, useCallback } from 'react';
import InvoiceTable from '../components/InvoiceTable.jsx';
import { useSearchParams } from 'next/navigation';
import { useInvoiceClick } from '../context/InvoiceClickContext';
import { useInvoiceData } from '../context/InvoiceDataContext';
import { useVendorAchMap } from '../ui/ach/useVendorAch';
import Toast from '../components/Toast.jsx';
import { formatStatusForDisplay } from '../../lib/invoices/stateMachine';
import { getDisplayVendorName } from '../lib/vendorUtils';

// Helper: Split array into chunks of specified size (max 20 for QBO)
function chunkArray(array, chunkSize = 20) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

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

  // ========== BATCH PAYMENT STATE ==========
  // Modal state: 'hidden' | 'processing' | 'ready' | 'verifying' | 'summary'
  const [batchModalState, setBatchModalState] = useState('hidden');
  // Array of batches, each batch is an array of invoice results
  const [paymentBatches, setPaymentBatches] = useState([]);
  // Currently selected batch tab (0-indexed)
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  // All invoice IDs involved in batching (for verification)
  const [allBatchInvoiceIds, setAllBatchInvoiceIds] = useState([]);
  // Verification results
  const [verificationResult, setVerificationResult] = useState(null);
  // QBO base URL for redirects
  const [qboBaseUrl, setQboBaseUrl] = useState('https://app.qbo.intuit.com');
  // Batch payment ID for filtering in QBO
  const [batchPaymentId, setBatchPaymentId] = useState('');

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

  // ========== BATCH PAYMENT FUNCTIONS ==========
  
  async function bulkUpdate(status, approvedVal) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const selectedRows = filteredRows.filter((r, i) => ids.includes(getRowId(r, i)));

    if (status === 'completed') {
      // Start batch payment flow
      try {
        // Show non-dismissable processing modal
        setBatchModalState('processing');
        setPaymentBatches([]);
        setCurrentBatchIndex(0);
        setAllBatchInvoiceIds([]);
        setVerificationResult(null);
        setBatchPaymentId('');

        const invoiceIds = selectedRows.map(r => r.invoice_number || r.invoice);
        
        // Fetch QBO Bill Pay URLs for all selected invoices
        const paymentRes = await fetch('/api/invoices/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceIds }),
        });

        const paymentResult = await paymentRes.json();

        if (!paymentResult.ok) {
          setBatchModalState('hidden');
          showToast(`Failed to get payment links: ${paymentResult.error}`, 'error');
          return;
        }

        // Filter successful results with pay URLs
        const validResults = (paymentResult.results || []).filter(r => r.ok && r.payUrl);
        const failedResults = (paymentResult.results || []).filter(r => !r.ok);

        if (validResults.length === 0) {
          setBatchModalState('hidden');
          if (failedResults.length > 0) {
            const errors = failedResults.map(r => `${r.invoiceNumber || r.invoiceId}: ${r.error}`).join('; ');
            showToast(`No valid payment links: ${errors}`, 'error');
          } else {
            showToast('No invoices ready for payment', 'warning');
          }
          return;
        }

        // Store all invoice IDs for verification later
        const allIds = validResults.map(r => r.invoiceId || r.invoiceNumber);
        setAllBatchInvoiceIds(allIds);

        // Chunk into batches of 20 (QBO limit)
        const batches = chunkArray(validResults, 20);
        setPaymentBatches(batches);
        
        // Store batch payment ID for QBO filtering
        if (paymentResult.batchId) {
          setBatchPaymentId(paymentResult.batchId);
        }
        
        // Determine QBO environment
        const baseUrl = paymentResult.qboBaseUrl || 
          (typeof window !== 'undefined' && window.location.hostname.includes('sandbox') 
            ? 'https://app.sandbox.qbo.intuit.com' 
            : 'https://app.qbo.intuit.com');
        setQboBaseUrl(baseUrl);

        // Show the batch-ready modal
        setBatchModalState('ready');
        
        if (failedResults.length > 0) {
          showToast(`${validResults.length} ready for payment (${batches.length} batch${batches.length > 1 ? 'es' : ''}), ${failedResults.length} not ready`, 'warning');
        } else {
          showToast(`${validResults.length} invoice(s) split into ${batches.length} batch${batches.length > 1 ? 'es' : ''} for QuickBooks`, 'success');
        }
      } catch (err) {
        console.error('Error getting payment links:', err);
        setBatchModalState('hidden');
        showToast(`Error: ${err.message}`, 'error');
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
      setSelectedIds(new Set());
      await reloadList();
    }
  }

  // Open ONE QBO Bills page for a batch
  function handlePayBatch(batchIndex) {
    // Open QBO Bills list page in a new tab
    const qboBillsUrl = `${qboBaseUrl}/app/bills`;
    window.open(qboBillsUrl, '_blank', 'noopener,noreferrer');
  }

  // Close modal and verify payments
  async function handleCloseAndVerify() {
    if (allBatchInvoiceIds.length === 0) {
      setBatchModalState('hidden');
      setSelectedIds(new Set());
      await reloadList();
      return;
    }

    // Show verifying spinner
    setBatchModalState('verifying');

    try {
      const verifyRes = await fetch('/api/invoices/verify-qbo-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: allBatchInvoiceIds }),
      });

      const result = await verifyRes.json();

      if (!result.ok) {
        showToast(`Verification failed: ${result.error}`, 'error');
        setBatchModalState('ready'); // Go back to ready state
        return;
      }

      setVerificationResult(result);
      setBatchModalState('summary');
    } catch (err) {
      console.error('Error verifying payments:', err);
      showToast(`Error verifying payments: ${err.message}`, 'error');
      setBatchModalState('ready');
    }
  }

  // Handle re-verify (if some invoices unpaid)
  async function handleReVerify() {
    setBatchModalState('verifying');
    try {
      const verifyRes = await fetch('/api/invoices/verify-qbo-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: allBatchInvoiceIds }),
      });

      const result = await verifyRes.json();

      if (!result.ok) {
        showToast(`Verification failed: ${result.error}`, 'error');
        setBatchModalState('summary');
        return;
      }

      setVerificationResult(result);
      setBatchModalState('summary');
    } catch (err) {
      console.error('Error verifying payments:', err);
      showToast(`Error verifying payments: ${err.message}`, 'error');
      setBatchModalState('summary');
    }
  }

  // Final close after summary
  function handleDone() {
    setBatchModalState('hidden');
    setPaymentBatches([]);
    setCurrentBatchIndex(0);
    setAllBatchInvoiceIds([]);
    setVerificationResult(null);
    setBatchPaymentId('');
    setSelectedIds(new Set());
    reloadList();
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
            // Get locations from GL Lines (invoice_categories classes)
            const locations = invoice.locations || [];
            const officeRaw = invoice.office_id || invoice.office || invoice.office_location || invoice.clinic_id || '';
            const locationDisplay = locations.length > 0 
              ? locations.join(', ') 
              : (officeRaw || 'Unknown');
            return ({
            invoice: invoice.invoice_number || 'Unknown',
            invoice_number: invoice.invoice_number, // needed by detail view
            vendor: invoice.vendor_name || invoice.vendor || 'Unknown',
            amount: `$${numericTotal.toFixed(2)}`,
            location: locationDisplay,
            locations: locations, // Keep array for filtering
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

  // 7 columns evenly distributed, all centered
  const columns = [
    { key: 'invoice', label: 'Invoice', width: '14%' },
    { key: 'vendor', label: 'Vendor', width: '14%' },
    { key: 'amount', label: 'Amount', width: '10%' },
    { key: 'location', label: 'Location', width: '12%' },
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
      // location (supports multiple GL Line locations)
      if (filters.office) {
        const matchesLocation = row.locations?.includes(filters.office) || row.location === filters.office;
        if (!matchesLocation) return false;
      }
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
      <div style={{ marginBottom: '24px' }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">To Be Paid</h1>
          <p className="text-gray-600 mt-2">
            {filteredRows.length} invoice{filteredRows.length !== 1 ? 's' : ''} approved and awaiting payment
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
      
      {/* Batch Payment Modal - Multiple States */}
      {batchModalState !== 'hidden' && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          {/* PROCESSING STATE - Non-dismissable spinner */}
          {batchModalState === 'processing' && (
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '48px',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                border: '4px solid #e5e7eb',
                borderTopColor: '#357ab2',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 24px',
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
                Batching your bills in QuickBooks...
              </h2>
              <p style={{ color: '#6b7280' }}>
                Please wait while we prepare your payment batches.
              </p>
            </div>
          )}

          {/* VERIFYING STATE - Non-dismissable spinner */}
          {batchModalState === 'verifying' && (
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '48px',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                border: '4px solid #e5e7eb',
                borderTopColor: '#059669',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 24px',
              }} />
              <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
                Verifying payments in QuickBooks...
              </h2>
              <p style={{ color: '#6b7280' }}>
                Checking payment status for {allBatchInvoiceIds.length} invoice(s).
              </p>
            </div>
          )}

          {/* BATCH READY STATE - With tabs and invoice list */}
          {batchModalState === 'ready' && (
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '700px',
              width: '95%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}>
              {/* Header with X button */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#111827' }}>
                    Pay in QuickBooks
                  </h2>
                  <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>
                    {allBatchInvoiceIds.length} invoice{allBatchInvoiceIds.length !== 1 ? 's' : ''} split into {paymentBatches.length} batch{paymentBatches.length !== 1 ? 'es' : ''}
                  </p>
                </div>
                <button
                  onClick={handleCloseAndVerify}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '28px',
                    cursor: 'pointer',
                    color: '#6b7280',
                    lineHeight: 1,
                    padding: '4px',
                  }}
                  title="Close and verify payments"
                >
                  ×
                </button>
              </div>

              {/* Batch Tabs */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {paymentBatches.map((batch, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentBatchIndex(index)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: currentBatchIndex === index ? '2px solid #357ab2' : '1px solid #e5e7eb',
                      backgroundColor: currentBatchIndex === index ? '#eff6ff' : '#fff',
                      color: currentBatchIndex === index ? '#357ab2' : '#374151',
                      fontWeight: currentBatchIndex === index ? 600 : 400,
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    Batch {index + 1} ({batch.length})
                  </button>
                ))}
              </div>

              {/* Pay Batch Button */}
              <div style={{ marginBottom: '16px' }}>
                <button
                  onClick={() => handlePayBatch(currentBatchIndex)}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#059669',
                    color: '#fff',
                    borderRadius: '9999px',
                    border: 'none',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '15px',
                  }}
                >
                  <i className="fas fa-external-link-alt"></i>
                  Pay Batch {currentBatchIndex + 1} in QuickBooks ({paymentBatches[currentBatchIndex]?.length || 0} invoices)
                </button>
              </div>

              {/* Batch ID for filtering in QBO */}
              {batchPaymentId && (
                <div style={{
                  backgroundColor: '#dbeafe',
                  border: '1px solid #3b82f6',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}>
                  <div>
                    <p style={{ color: '#1e40af', fontSize: '13px', margin: 0, fontWeight: 600 }}>
                      Batch ID for QBO Search:
                    </p>
                    <p style={{ color: '#1e3a8a', fontSize: '16px', margin: '4px 0 0', fontFamily: 'monospace', fontWeight: 700 }}>
                      {batchPaymentId}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(batchPaymentId);
                      showToast('Batch ID copied to clipboard!', 'success');
                    }}
                    style={{
                      backgroundColor: '#3b82f6',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="fas fa-copy"></i>
                    Copy
                  </button>
                </div>
              )}

              {/* Instructions */}
              <div style={{
                backgroundColor: '#fef3c7',
                border: '1px solid #f59e0b',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '16px',
              }}>
                <p style={{ color: '#92400e', fontSize: '14px', margin: 0 }}>
                  <strong>Instructions:</strong> Click the button above to open QuickBooks Bills page. 
                  {batchPaymentId && (
                    <> Search for "<strong>{batchPaymentId}</strong>" to filter only the bills in this batch. </>
                  )}
                  Select the invoices and pay them together. When finished with all batches, 
                  close this window to verify payments.
                </p>
              </div>

              {/* Invoice List for Current Batch */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1.5fr 100px',
                  padding: '12px 16px',
                  backgroundColor: '#f9fafb',
                  borderBottom: '1px solid #e5e7eb',
                  fontWeight: 600,
                  fontSize: '13px',
                  color: '#374151',
                }}>
                  <div>Invoice #</div>
                  <div>Vendor</div>
                  <div style={{ textAlign: 'right' }}>Amount</div>
                </div>
                {(paymentBatches[currentBatchIndex] || []).map((invoice, idx) => (
                  <div
                    key={invoice.invoiceId || idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1.5fr 100px',
                      padding: '12px 16px',
                      borderBottom: idx < (paymentBatches[currentBatchIndex]?.length || 0) - 1 ? '1px solid #f3f4f6' : 'none',
                      fontSize: '14px',
                    }}
                  >
                    <div style={{ color: '#111827', fontWeight: 500 }}>
                      {invoice.invoiceNumber || invoice.invoiceId}
                    </div>
                    <div style={{ color: '#6b7280' }}>
                      {invoice.vendorName || 'Unknown'}
                    </div>
                    <div style={{ textAlign: 'right', color: '#111827' }}>
                      ${invoice.amount}
                    </div>
                  </div>
                ))}
              </div>

              {/* Batch Total */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 0 0',
                marginTop: '16px',
                borderTop: '1px solid #e5e7eb',
              }}>
                <span style={{ fontWeight: 600, color: '#374151' }}>
                  Batch {currentBatchIndex + 1} Total:
                </span>
                <span style={{ fontWeight: 700, fontSize: '18px', color: '#111827' }}>
                  ${(paymentBatches[currentBatchIndex] || [])
                    .reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0)
                    .toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* SUMMARY STATE - Verification results */}
          {batchModalState === 'summary' && verificationResult && (
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}>
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                {verificationResult.paid?.length === allBatchInvoiceIds.length ? (
                  <div style={{
                    width: '64px',
                    height: '64px',
                    backgroundColor: '#d1fae5',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}>
                    <i className="fas fa-check" style={{ fontSize: '28px', color: '#059669' }}></i>
                  </div>
                ) : (
                  <div style={{
                    width: '64px',
                    height: '64px',
                    backgroundColor: '#fef3c7',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}>
                    <i className="fas fa-exclamation" style={{ fontSize: '28px', color: '#f59e0b' }}></i>
                  </div>
                )}
                <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
                  Payment Verification Complete
                </h2>
                <p style={{ color: '#6b7280', fontSize: '16px' }}>
                  <strong style={{ color: '#059669' }}>{verificationResult.paid?.length || 0}</strong> of{' '}
                  <strong>{allBatchInvoiceIds.length}</strong> invoices verified as paid
                </p>
              </div>

              {/* Unpaid invoices list */}
              {verificationResult.unpaid?.length > 0 && (
                <div style={{
                  backgroundColor: '#fef3c7',
                  border: '1px solid #f59e0b',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '20px',
                }}>
                  <p style={{ fontWeight: 600, color: '#92400e', marginBottom: '8px' }}>
                    Invoices not yet paid ({verificationResult.unpaid.length}):
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '20px', color: '#92400e', fontSize: '14px' }}>
                    {verificationResult.unpaid.slice(0, 5).map((id, idx) => (
                      <li key={idx}>{id}</li>
                    ))}
                    {verificationResult.unpaid.length > 5 && (
                      <li>...and {verificationResult.unpaid.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Errors list */}
              {verificationResult.errors?.length > 0 && (
                <div style={{
                  backgroundColor: '#fee2e2',
                  border: '1px solid #ef4444',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '20px',
                }}>
                  <p style={{ fontWeight: 600, color: '#991b1b', marginBottom: '8px' }}>
                    Errors during verification:
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '20px', color: '#991b1b', fontSize: '14px' }}>
                    {verificationResult.errors.slice(0, 3).map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                {verificationResult.unpaid?.length > 0 && (
                  <button
                    onClick={handleReVerify}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: '#fff',
                      color: '#357ab2',
                      borderRadius: '9999px',
                      border: '2px solid #357ab2',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Re-Verify Payments
                  </button>
                )}
                <button
                  onClick={handleDone}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#357ab2',
                    color: '#fff',
                    borderRadius: '9999px',
                    border: 'none',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
