import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import InvoiceTable from '../components/InvoiceTable.jsx';
import { useInvoiceClick } from '../context/InvoiceClickContext';
import { useInvoiceData } from '../context/InvoiceDataContext';
import { useVendorAchMap } from '../ui/ach/useVendorAch';
import Toast from '../components/Toast.jsx';
import { formatStatusForDisplay } from '../../lib/invoices/stateMachine';
import { getDisplayVendorName } from '../lib/vendorUtils';

// Dynamically import the modal to avoid SSR issues
const CreateInvoiceModal = dynamic(() => import('../../components/invoices/CreateInvoiceModal'), { ssr: false });

// Helper function to get user email from localStorage/cookie
function getUserEmail() {
  try {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('loggedInUser') : null;
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.email || '';
    }
  } catch (e) {
    console.error('Failed to get user email:', e);
  }
  return '';
}

// Helper function to check if user is an admin
async function checkIfAdmin(email) {
  if (!email) return false;
  
  try {
    const response = await fetch('/api/workflow/config');
    if (!response.ok) return false;
    
    const config = await response.json();
    const admins = config?.admins || [];
    const normalizedEmail = email.trim().toLowerCase();
    
    return admins.map(e => e.trim().toLowerCase()).includes(normalizedEmail);
  } catch (e) {
    console.error('Failed to check admin status:', e);
    return false;
  }
}

function ForMePageImpl({ searchQuery = '', filters = {} }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { handleInvoiceRowClick } = useInvoiceClick();
  const { setInvoices: setContextInvoices } = useInvoiceData();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [userVendorAccess, setUserVendorAccess] = useState(null); // null = loading, '*' = admin, array = verifier
  const [showBulkSendRouteChoice, setShowBulkSendRouteChoice] = useState(false);
  const [showBulkRejectModal, setShowBulkRejectModal] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('duplicate');
  const [bulkRejectFeedback, setBulkRejectFeedback] = useState('');
  const isVerifier = Array.isArray(userVendorAccess);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const getRowId = (r, i) =>
    r.id ||
    r.invoice_number ||
    r.json_path ||
    r.pdf_path ||
    r.source_file ||
    `${r.vendor || 'v'}_${r.invoice || 'inv'}_${r.timestamp || i}`;

  const showToast = useCallback((message, variant = 'info') => {
    setToast({ message, variant, at: Date.now() });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  // Extract just the city/location name from class names like "General-Columbia" -> "Columbia"
  const extractLocationFromClass = (className) => {
    if (!className) return '';
    // Handle formats like "General-Columbia", "Corp-Executive", "Div-Marketing"
    const parts = className.split('-');
    if (parts.length >= 2) {
      // Return everything after the first dash (handles "General-Columbia" -> "Columbia")
      return parts.slice(1).join('-');
    }
    return className;
  };

  const transformInvoice = useCallback((invoice) => {
    const vendorName = getDisplayVendorName(invoice.vendor_name || invoice.vendor);
    const rawInvoiceDate = invoice.invoice_date || null;
    const rawDueDate = invoice.due_date || null;
    // Get locations from GL Lines (invoice_categories classes)
    const locations = invoice.locations || [];
    // Fallback to legacy office fields if no GL Line locations
    const officeRaw = invoice.office_id || invoice.office || invoice.office_location || invoice.clinic_id || '';
    // If a template was applied, show the template name; otherwise show locations
    const locationDisplay = invoice.applied_template_name 
      ? invoice.applied_template_name
      : (locations.length > 0 
          ? locations.map(loc => extractLocationFromClass(loc)).join(', ') 
          : (officeRaw || 'Unknown'));
    const formatDate = (dateString) => {
      if (!dateString) return 'N/A';
      const parsed = new Date(dateString);
      if (Number.isNaN(parsed.getTime())) return 'N/A';
      return parsed.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
    };
    // Amount is stored in cents in the database, convert to dollars
    const amountCents = invoice.amount_cents ?? invoice.invoice_total ?? invoice.total ?? invoice.amount ?? 0;
    const parsedAmount =
      typeof amountCents === 'number'
        ? amountCents / 100  // Convert cents to dollars
        : Number.parseFloat(String(amountCents || '0').replace(/[^0-9.-]/g, '')) / 100;

    return {
      id: invoice.id || invoice.invoice_number || invoice.invoice || invoice.source_file || null,
      invoice: invoice.invoice_number || invoice.invoice || 'Unknown',
      invoice_number: invoice.invoice_number,
      vendor: vendorName,
      amount: `$${parsedAmount.toFixed(2)}`,
      location: locationDisplay,
      rawOffice: officeRaw,
      locations: locations, // Keep array for filtering
      dueDate: formatDate(rawDueDate || rawInvoiceDate),
      _dueDateRaw: rawDueDate || rawInvoiceDate || '',
      invoiceDate: formatDate(rawInvoiceDate),
      _invoiceDateRaw: rawInvoiceDate || '',
      // Prefer invoice-level categories if present
      category:
        (Array.isArray(invoice.invoice_categories) && invoice.invoice_categories[0]?.category_name) ||
        invoice.category ||
        'Other',
      invoice_date: rawInvoiceDate,
      due_date: rawDueDate,
      json_path: invoice.json_path,
      source_file: invoice.source_file,
      pdf_path: invoice.pdf_path,
      timestamp: invoice.timestamp,
      assigned_to: invoice.assigned_to,
      approved: invoice.approved,
      status: invoice.status,
      _rawStatus: (invoice.status || '').toLowerCase(),
      line_items: invoice.line_items || [],
      approvals: invoice.approvals || {},
      qbo_bill_id: invoice.qbo_bill_id || null,
    };
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false); // Track refreshing state without causing re-renders

  const fetchVisibleInvoices = useCallback(async () => {
    // Propagate any query params from the page (e.g., ?email=...) to the API call
    const params = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
    params.set('limit', '5000');
    const res = await fetch(`/api/invoices/visible?${params.toString()}`, {
      cache: 'no-store',
      credentials: 'include',
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload?.error || `Failed to load invoices (HTTP ${res.status})`);
    }
    const payload = await res.json();
    if (!payload?.ok) {
      throw new Error(payload?.error || 'Failed to load invoices');
    }
    // Track vendor access to detect verifier users
    if (payload.vendorAccess !== undefined) {
      setUserVendorAccess(payload.vendorAccess);
    }
    const list = Array.isArray(payload.invoices) ? payload.invoices : [];
    return list
      .filter((invoice) => {
        if (invoice.deleted || invoice.workflow_deleted_at) return false;
        const status = (invoice.status || '').toLowerCase();
        // Show invoices waiting for approval (incoming, categorized, pending, awaiting_office_approval, awaiting_admin_approval)
        // Hide invoices that have moved past For Me: to_be_paid, completed, paid, rejected, removed
        if (status === 'to_be_paid' || status === 'completed' || status === 'paid' || status === 'rejected' || status === 'removed') return false;
        if (invoice.approved === true) return false;
        return true;
      })
      .map(transformInvoice);
  }, [transformInvoice]);

  const reloadList = useCallback(async () => {
    try {
      const data = await fetchVisibleInvoices();
      setInvoices(data);
    } catch (reloadError) {
      console.error('❌ ForMePage: reload failed', reloadError);
      showToast(reloadError?.message || 'Failed to refresh invoices', 'error');
    }
  }, [fetchVisibleInvoices, showToast]);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { getStatusForVendor } = useVendorAchMap();

  const spQuery = useMemo(() => (searchParams.get('search') || '').trim().toLowerCase(), [searchParams]);
  const spFilters = useMemo(() => ({
    vendor: searchParams.get('vendor') || undefined,
    office: searchParams.get('office') || undefined,
    category: searchParams.get('category') || undefined,
    minAmount: searchParams.get('minAmount') || undefined,
    maxAmount: searchParams.get('maxAmount') || undefined,
    dueWithin: searchParams.get('dueWithin') || undefined,
    ach: searchParams.get('ach') || undefined,
    hasAttachment: searchParams.get('hasAttachment') || undefined,
  }), [searchParams]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return Object.values(spFilters).some(value => value !== undefined && value !== null && value !== '');
  }, [spFilters]);

  // Reset filters function
  const handleResetFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    // Remove all filter params but keep other params like 'email', 'search', etc.
    const filterKeys = ['vendor', 'office', 'category', 'minAmount', 'maxAmount', 'dueWithin', 'ach', 'hasAttachment'];
    filterKeys.forEach(key => params.delete(key));
    
    // Update URL without filter params
    router.replace(`${pathname}?${params.toString()}`);
    // Also clear local filters state
    setFilters({});
  }, [searchParams, router, pathname]);

  const effectiveQuery = useMemo(() => (spQuery || searchQuery || '').trim().toLowerCase(), [spQuery, searchQuery]);
  const effectiveFilters = useMemo(() => ({
    ...filters,
    ...Object.fromEntries(
      Object.entries(spFilters).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    ),
  }), [filters, spFilters]);

  useEffect(() => {
    const loadInvoices = async () => {
      try {
        setLoading(true);
        const visible = await fetchVisibleInvoices();
        setInvoices(visible);
        setContextInvoices(visible);
        setError(null);
      } catch (loadError) {
        console.error('❌ ForMePage: Error loading invoices:', loadError);
        setError(loadError?.message ?? 'Failed to load invoices');
        setInvoices([]);
        setContextInvoices([]);
      } finally {
        setLoading(false);
      }
    };

    loadInvoices();
  }, [fetchVisibleInvoices, setContextInvoices]);

  // Refresh invoice list when page comes back into focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('📄 ForMePage: Page came into focus, refreshing invoice list');
        reloadList();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reloadList]);

  const filteredRows = useMemo(() => {
    const query = effectiveQuery;
    const filterConfig = effectiveFilters;

    const parseAmount = (value) => Number.parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0;
    const parseDate = (value) => {
      if (!value || value === 'N/A') return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    return invoices.filter((row) => {
      try {
        if (query) {
          const matches = Object.values(row).some((val) => String(val).toLowerCase().includes(query));
          if (!matches) return false;
        }

        if (filterConfig.vendor && row.vendor !== filterConfig.vendor) return false;
        // Check if any location matches the filter (supports multiple GL Line locations)
        if (filterConfig.office) {
          const matchesLocation = row.locations?.includes(filterConfig.office) || row.location === filterConfig.office;
          if (!matchesLocation) return false;
        }
        if (filterConfig.category && row.category !== filterConfig.category) return false;

        // Vendor ACH Status filter
        if (filterConfig.ach) {
          const status = (getStatusForVendor(row.vendor) || '').toLowerCase();
          if (status !== String(filterConfig.ach).toLowerCase()) return false;
        }

        // PDF Attachment filter
        if (filterConfig.hasAttachment) {
          // Check if pdf_path exists and is not empty
          const pdfPath = row.pdf_path || row.pdfPath;
          const hasPdf = !!(pdfPath && pdfPath.trim() !== '');
          if (filterConfig.hasAttachment === 'yes' && !hasPdf) return false;
          if (filterConfig.hasAttachment === 'no' && hasPdf) return false;
        }

        const amount = parseAmount(String(row.amount));
        if (filterConfig.minAmount && amount < Number(filterConfig.minAmount)) return false;
        if (filterConfig.maxAmount && amount > Number(filterConfig.maxAmount)) return false;

        if (filterConfig.dueWithin) {
          const days = Number.parseInt(String(filterConfig.dueWithin), 10);
          if (!Number.isNaN(days)) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dueDate = parseDate(row.due_date || row.invoice_date) || parseDate(row.dueDate) || parseDate(row.invoiceDate);
            if (!dueDate) return false;
            dueDate.setHours(0, 0, 0, 0);
            const daysDiff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
            if (daysDiff < 0 || daysDiff > days) return false;
          }
        }
        return true;
      } catch (filterError) {
        console.error('❌ Error applying filters for row:', row, filterError);
        return true;
      }
    });
  }, [invoices, effectiveQuery, effectiveFilters]);

  // Track bulk operation progress
  const [bulkProgress, setBulkProgress] = useState({ active: false, current: 0, total: 0, action: '' });

  // Define bulkUpdate after filteredRows is available
  const bulkUpdate = useCallback(async (action, rejectPayload = {}) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const selectedRows = filteredRows.filter((r, i) => ids.includes(getRowId(r, i)));

    if (action === 'approve') {
      // Check if the user is an admin
      const userEmail = getUserEmail();
      const isAdmin = await checkIfAdmin(userEmail);
      
      // Only require office for non-admin users
      if (!isAdmin) {
        const missingOffice = selectedRows.find((row) => !row.rawOffice);
        if (missingOffice) {
          showToast('Office is required before approval.', 'error');
          return;
        }
      }
    }

    // Show progress for bulk operations
    setBulkProgress({ active: true, current: 0, total: selectedRows.length, action });

    let hadError = false;
    let officeError = false;
    let processedCount = 0;
    let qboBillsCreated = 0;
    
    for (const row of selectedRows) {
      const rowId = row.id || row.invoice_number;
      try {
        const response = await fetch('/api/invoices/transition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: rowId,
            action,
            ...(action === 'approve' ? { office: row.rawOffice || row.office || '' } : {}),
            ...(action === 'reject' ? {
              reason: rejectPayload.reason || 'Rejected from For Me page',
              rejectionReason: rejectPayload.rejectionReason,
              feedback: rejectPayload.feedback || '',
            } : {}),
          }),
        });
        
        processedCount++;
        setBulkProgress(prev => ({ ...prev, current: processedCount }));
        
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const message = data?.error || `Request failed (HTTP ${response.status})`;
          if (message.toLowerCase().includes('office required')) {
            officeError = true;
          } else {
            hadError = true;
            console.error('Bulk update error:', message);
          }
        } else {
          // Success! Remove invoice from local state immediately for live transition
          setInvoices(prev => prev.filter(inv => {
            const invId = inv.id || inv.invoice_number;
            return invId !== rowId;
          }));
          
          // Also remove from selected IDs
          setSelectedIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(getRowId(row, 0));
            return newSet;
          });
          
          // Check if QBO bill was created
          const data = await response.json().catch(() => ({}));
          if (data?.qboBill?.created) {
            qboBillsCreated++;
          }
        }
      } catch (err) {
        hadError = true;
        console.error('Bulk update network error:', err?.message);
      }
    }

    // Hide progress
    setBulkProgress({ active: false, current: 0, total: 0, action: '' });

    if (officeError) {
      showToast('Office is required before approval.', 'error');
    }

    if (!hadError && !officeError) {
      if (action === 'approve' && qboBillsCreated > 0) {
        showToast(`${processedCount} invoice(s) approved. ${qboBillsCreated} QBO bill(s) created.`, 'success');
      } else {
        showToast(action === 'approve' ? `${processedCount} invoice(s) approved.` : `${processedCount} invoice(s) rejected.`, 'success');
      }
    } else if (hadError) {
      showToast(`Some invoices failed to process. ${processedCount} succeeded.`, 'warning');
    }

    // Clear any remaining selections
    setSelectedIds(new Set());
    
    // Final reload to ensure sync with server (but invoices already removed visually)
    await reloadList();
  }, [selectedIds, filteredRows, getRowId, showToast, reloadList, setInvoices]);

  const handleBulkRejectClick = useCallback(() => {
    setBulkRejectReason('duplicate');
    setBulkRejectFeedback('');
    setShowBulkRejectModal(true);
  }, []);

  const handleBulkRejectConfirm = useCallback(() => {
    setShowBulkRejectModal(false);
    const formattedReason = bulkRejectReason === 'duplicate'
      ? '[Duplicate Invoice]'
      : bulkRejectFeedback.trim() ? `[Other] ${bulkRejectFeedback.trim()}` : '[Other]';
    bulkUpdate('reject', {
      rejectionReason: bulkRejectReason,
      feedback: bulkRejectFeedback.trim(),
      reason: formattedReason,
    });
  }, [bulkRejectReason, bulkRejectFeedback, bulkUpdate]);

  // Bulk send for verifier users (Laura) - calls send-for-approval for each selected invoice
  const bulkSend = useCallback(async (destination) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const selectedRows = filteredRows.filter((r, i) => ids.includes(getRowId(r, i)));
    setShowBulkSendRouteChoice(false);

    // Show progress
    setBulkProgress({ active: true, current: 0, total: selectedRows.length, action: 'send' });

    let hadError = false;
    let processedCount = 0;

    for (const row of selectedRows) {
      const rowId = row.id || row.invoice_number;
      try {
        const response = await fetch('/api/invoices/send-for-approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            invoiceId: rowId,
            correctedData: {},
            invoiceCategories: row.line_items || [],
            destination: destination,
          }),
        });

        processedCount++;
        setBulkProgress(prev => ({ ...prev, current: processedCount }));

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          console.error('Bulk send error:', data?.error || `HTTP ${response.status}`);
          hadError = true;
        } else {
          // Remove invoice from local state
          setInvoices(prev => prev.filter(inv => {
            const invId = inv.id || inv.invoice_number;
            return invId !== rowId;
          }));
          setSelectedIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(getRowId(row, 0));
            return newSet;
          });
        }
      } catch (err) {
        hadError = true;
        console.error('Bulk send network error:', err?.message);
      }
    }

    setBulkProgress({ active: false, current: 0, total: 0, action: '' });

    if (!hadError) {
      showToast(`${processedCount} invoice(s) sent for ${destination === 'office_manager' ? 'office manager' : 'admin'} approval.`, 'success');
    } else {
      showToast(`Some invoices failed to send. ${processedCount} succeeded.`, 'warning');
    }

    setSelectedIds(new Set());
    await reloadList();
  }, [selectedIds, filteredRows, getRowId, showToast, reloadList, setInvoices]);

  // Automatic inbox checker - runs every 10 seconds in the background
  const checkInboxAutomatically = useCallback(async () => {
    // Skip if already refreshing to avoid overlapping requests
    if (isRefreshingRef.current) {
      return;
    }

    isRefreshingRef.current = true;
    setRefreshing(true);
    try {
      const params = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
      const email = params.get('email') || 'user@pcsmilesai.com';

      const res = await fetch('/api/inbox/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, full_scan: false }), // Use incremental scan, not full scan
      });

      // Silently handle errors - don't show toasts for automatic checks
      if (!res.ok) {
        // Handle timeout gracefully - scan might still be running
        if (res.status === 504 || res.status === 408) {
          // Still reload the list in case some invoices were added before timeout
          await reloadList();
          return;
        }
        // For other errors, just reload the list silently
        await reloadList();
        return;
      }

      // Parse JSON response
      let result;
      try {
        result = await res.json();
      } catch (parseErr) {
        // Silently fail and reload list
        await reloadList();
        return;
      }

      // If scan was successful and added new invoices, reload the list
      if (result.ok && (result.added > 0 || result.skipped > 0)) {
        await reloadList();
      }
    } catch (err) {
      // Silently handle errors - don't spam user with error messages
      console.log('[Auto Inbox Check] Background check failed:', err.message);
      // Still try to reload list in case of network errors
      try {
        await reloadList();
      } catch (reloadErr) {
        // Ignore reload errors
      }
    } finally {
      isRefreshingRef.current = false;
      setRefreshing(false);
    }
  }, [reloadList]);

  // Manual inbox scan handler - replaces automatic checking
  // The PM2 inbox-watcher now runs hourly in the background
  // This button allows users to trigger an immediate scan when needed
  const [isScanning, setIsScanning] = useState(false);
  
  const handleManualInboxScan = useCallback(async () => {
    if (isScanning) return;
    
    setIsScanning(true);
    try {
      const params = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
      const email = params.get('email') || 'user@pcsmilesai.com';

      const res = await fetch('/api/inbox/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, full_scan: false }),
      });

      if (!res.ok) {
        if (res.status === 504 || res.status === 408) {
          showToast('Inbox scan timed out, but may still be processing...', 'warning');
          await reloadList();
          return;
        }
        // Try to extract specific error from response body
        try {
          const errBody = await res.json();
          const errMsg = errBody.message || errBody.error || errBody.details || 'Unknown error';
          showToast(`Inbox scan failed: ${errMsg}`, 'error');
        } catch {
          showToast(`Inbox scan failed (HTTP ${res.status})`, 'error');
        }
        return;
      }

      const result = await res.json();
      
      if (result.ok) {
        const added = result.added || 0;
        const skipped = result.skipped || 0;
        if (added > 0) {
          showToast(`Inbox scanned! Found ${added} new invoice(s)`, 'success');
        } else if (skipped > 0) {
          showToast(`Inbox scanned. ${skipped} email(s) already processed.`, 'info');
        } else {
          showToast('Inbox scanned. No new invoices found.', 'info');
        }
        await reloadList();
      }
    } catch (err) {
      console.error('[Manual Inbox Scan] Error:', err.message);
      showToast('Error scanning inbox', 'error');
    } finally {
      setIsScanning(false);
    }
  }, [isScanning, showToast, reloadList]);

  // Now do conditional returns AFTER all handlers are defined
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
    { key: 'invoice', label: 'Invoice', width: '13%' },
    { key: 'vendor', label: 'Vendor', width: '14%' },
    { key: 'amount', label: 'Amount', width: '9%' },
    { key: 'location', label: 'Location', width: '12%' },
    { key: 'invoiceDate', label: 'Invoice Date', width: '11%' },
    { key: 'dueDate', label: 'Due Date', width: '11%' },
    { key: 'category', label: 'Category', width: '20%' },
    {
      key: 'qbo',
      label: 'QBO',
      width: '6%',
      render: (row) => {
        const s = row._rawStatus;
        if (s !== 'to_be_paid' && s !== 'paid' && s !== 'completed') {
          return <span style={{ color: '#d1d5db' }}>&mdash;</span>;
        }
        if (row.qbo_bill_id) {
          return (
            <span title="Exported to QuickBooks" style={{ color: '#059669', fontSize: '16px' }}>
              <i className="fas fa-check-circle"></i>
            </span>
          );
        }
        return (
          <span title="Pending QBO export" style={{ color: '#d97706', fontSize: '16px' }}>
            <i className="fas fa-clock"></i>
          </span>
        );
      },
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">For Me</h1>
          <p className="text-gray-600 mt-2">
            {filteredRows.length} invoice{filteredRows.length !== 1 ? 's' : ''} assigned to you
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            style={{
              padding: '8px 16px',
              borderRadius: '9999px',
              fontSize: '14px',
              fontWeight: 500,
              border: '1px solid #357ab2',
              backgroundColor: '#ffffff',
              color: '#357ab2',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
            title="Create a new invoice from a template"
          >
            <i className="fas fa-plus"></i>
            Create Invoice
          </button>
          <button
            onClick={handleManualInboxScan}
            disabled={isScanning}
            style={{
              padding: '8px 16px',
              borderRadius: '9999px',
              fontSize: '14px',
              fontWeight: 500,
              border: '1px solid #357ab2',
              backgroundColor: isScanning ? '#e5e7eb' : '#357ab2',
              color: isScanning ? '#6b7280' : '#ffffff',
              cursor: isScanning ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              minWidth: '180px',
              justifyContent: 'center',
            }}
            title={isScanning ? 'Scanning inbox for new invoices...' : 'Manually scan inbox for new invoices'}
          >
            <i className={`fas ${isScanning ? 'fa-spinner fa-spin' : 'fa-inbox'}`}></i>
            {isScanning ? 'Scanning Inbox...' : 'Scan Inbox'}
          </button>
        </div>
      </div>

      {/* Reset Filters Button - Only shows when filters are active */}
      {hasActiveFilters && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '88px',
            zIndex: 50,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          }}
        >
          <button
            onClick={handleResetFilters}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '16px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#b91c1c';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#dc2626';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
            title="Clear all active filters"
          >
            <i className="fas fa-times-circle"></i>
            Reset Filters
          </button>
        </div>
      )}

      {/* Bulk Progress Indicator */}
      {bulkProgress.active && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '12px',
          padding: '12px 16px',
          backgroundColor: '#dbeafe',
          borderRadius: '16px',
          border: '1px solid #3b82f6',
        }}>
          <div style={{
            width: '20px',
            height: '20px',
            border: '3px solid #3b82f6',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <span style={{ color: '#1e40af', fontWeight: 500 }}>
            {bulkProgress.action === 'send' ? 'Sending' : bulkProgress.action === 'approve' ? 'Approving' : 'Rejecting'} invoices{bulkProgress.action !== 'send' ? ' and creating QBO bills' : ''}...
          </span>
          <span style={{ color: '#3b82f6', fontWeight: 600 }}>
            {bulkProgress.current} / {bulkProgress.total}
          </span>
        </div>
      )}

      {selectedIds.size > 0 && !bulkProgress.active && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          {isVerifier ? (
            <button
              onClick={() => setShowBulkSendRouteChoice(true)}
              style={{ padding: '8px 16px', backgroundColor: '#059669', color: '#fff', borderRadius: 9999, border: '1px solid #059669', fontWeight: 600 }}
            >
              Send ({selectedIds.size})
            </button>
          ) : (
            <button
              onClick={() => bulkUpdate('approve')}
              style={{ padding: '8px 16px', backgroundColor: '#059669', color: '#fff', borderRadius: 9999, border: '1px solid #059669', fontWeight: 600 }}
            >
              Approve ({selectedIds.size})
            </button>
          )}
          <button
            onClick={handleBulkRejectClick}
            style={{ padding: '8px 16px', backgroundColor: '#dc2626', color: '#fff', borderRadius: 9999, border: '1px solid #dc2626', fontWeight: 600 }}
          >
            Reject
          </button>
        </div>
      )}

      {/* Bulk Send Routing Choice Modal - for verifier users */}
      {showBulkSendRouteChoice && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            backgroundColor: '#fff', borderRadius: '16px', padding: '32px',
            maxWidth: '440px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700, color: '#111827' }}>
              Send {selectedIds.size} Invoice{selectedIds.size > 1 ? 's' : ''} for Approval
            </h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#6b7280' }}>
              Where would you like to send {selectedIds.size > 1 ? 'these invoices' : 'this invoice'}?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={() => bulkSend('mckay')}
                style={{
                  padding: '12px 20px', backgroundColor: '#2563eb', color: '#fff',
                  borderRadius: '10px', border: 'none', fontWeight: 600, fontSize: '15px',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                Send to McKay
                <span style={{ display: 'block', fontSize: '12px', fontWeight: 400, opacity: 0.8, marginTop: '2px' }}>
                  Admin approval
                </span>
              </button>

              <button
                onClick={() => bulkSend('office_manager')}
                style={{
                  padding: '12px 20px', backgroundColor: '#2563eb', color: '#fff',
                  borderRadius: '10px', border: 'none', fontWeight: 600, fontSize: '15px',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                Send to Office Manager{selectedIds.size > 1 ? 's' : ''}
                <span style={{ display: 'block', fontSize: '12px', fontWeight: 400, opacity: 0.8, marginTop: '2px' }}>
                  Each invoice routes to its office location&apos;s manager
                </span>
              </button>

              <button
                onClick={() => setShowBulkSendRouteChoice(false)}
                style={{
                  padding: '10px 20px', backgroundColor: 'transparent', color: '#6b7280',
                  borderRadius: '10px', border: '1px solid #d1d5db', fontWeight: 500, fontSize: '14px',
                  cursor: 'pointer', marginTop: '4px',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Reject Modal - Duplicate/Other only, Coding Error disabled */}
      {showBulkRejectModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            backgroundColor: '#fff', borderRadius: '16px', padding: '24px',
            maxWidth: '440px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            border: '2px solid #dc2626',
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700, color: '#dc2626' }}>
              Reject {selectedIds.size} Invoice{selectedIds.size > 1 ? 's' : ''}
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#374151' }}>
              Select a reason. Coding Error is only available from the invoice detail page.
            </p>

            <div style={{ marginBottom: '16px' }}>
              {[
                { value: 'duplicate', label: 'Duplicate Invoice', desc: 'Remove from queue.' },
                { value: 'coding_error', label: 'Coding Error', desc: 'Return to coder (use detail page)', disabled: true },
                { value: 'other', label: 'Other', desc: 'Remove with optional reason.' },
              ].map(({ value, label, desc, disabled }) => (
                <label key={value} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  padding: '12px', marginBottom: '8px', borderRadius: '12px',
                  border: `2px solid ${bulkRejectReason === value ? '#dc2626' : '#e5e7eb'}`,
                  backgroundColor: bulkRejectReason === value ? '#fef2f2' : disabled ? '#f3f4f6' : '#f9fafb',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.7 : 1,
                }} title={disabled ? 'Use invoice detail page to return for coding corrections.' : undefined}>
                  <input
                    type="radio"
                    name="bulkRejectReason"
                    value={value}
                    checked={bulkRejectReason === value}
                    onChange={() => !disabled && setBulkRejectReason(value)}
                    disabled={disabled}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ fontWeight: '600', color: '#1f2937' }}>{label}</div>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>{desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {bulkRejectReason === 'other' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px', color: '#374151' }}>
                  Reason (optional)
                </label>
                <textarea
                  value={bulkRejectFeedback}
                  onChange={(e) => setBulkRejectFeedback(e.target.value)}
                  placeholder="Optional reason..."
                  rows={2}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '1px solid #d1d5db', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setShowBulkRejectModal(false)}
                style={{
                  padding: '10px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: 500,
                  border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#374151', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkRejectConfirm}
                style={{
                  padding: '10px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: 500,
                  border: 'none', backgroundColor: '#dc2626', color: '#fff', cursor: 'pointer',
                }}
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      <InvoiceTable
        rows={filteredRows}
        columns={columns}
        onRowClick={handleInvoiceRowClick}
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
            if (currentlyAllSelected) {
              ids.forEach((id) => next.delete(id));
            } else {
              ids.forEach((id) => next.add(id));
            }
            return next;
          });
        }}
      />
      <Toast message={toast?.message} variant={toast?.variant} onDismiss={dismissToast} />

      {/* Create Invoice Modal */}
      <CreateInvoiceModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          reloadList();
          showToast('Invoice created successfully!', 'success');
        }}
      />
    </div>
  );
}

export default function ForMePage(props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div className="text-lg text-gray-600">Loading invoices...</div>
      </div>
    );
  }

  return <ForMePageImpl {...props} />;
}
